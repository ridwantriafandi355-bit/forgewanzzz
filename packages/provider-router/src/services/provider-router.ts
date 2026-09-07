import { randomUUID } from "node:crypto";
import type { ProviderRegistry } from "../registry/provider-registry.js";
import type { RateLimiter } from "./rate-limiter.js";
import type {
  RoutingRequest,
  RoutingDecision,
  InferenceResult,
  ModelDescriptor,
  ProviderDescriptor,
} from "../types/provider.js";
import { ProviderRoutingError } from "../types/router.js";

interface EvaluatedCandidate {
  model: ModelDescriptor;
  provider: ProviderDescriptor;
  eligible: boolean;
  rejectReason?: string;
  score: number;
}

export class ProviderRouter {
  constructor(
    private registry: ProviderRegistry,
    private rateLimiter: RateLimiter
  ) {}

  route(request: RoutingRequest): RoutingDecision {
    const allModels = this.registry.getAllModels();
    const evaluated: EvaluatedCandidate[] = [];

    const constraints = request.hardConstraints || {};
    const minContext = constraints.minContextWindow ?? request.minContextWindow;

    for (const model of allModels) {
      let provider: ProviderDescriptor;
      try {
        provider = this.registry.getProvider(model.providerId);
      } catch {
        continue;
      }

      // Check forbidden providers
      if (constraints.forbiddenProviders?.includes(provider.id)) {
        evaluated.push({
          model,
          provider,
          eligible: false,
          rejectReason: `Provider ${provider.id} is forbidden by policy constraints`,
          score: -1,
        });
        continue;
      }

      // Check allowed providers
      if (constraints.allowedProviders && !constraints.allowedProviders.includes(provider.id)) {
        evaluated.push({
          model,
          provider,
          eligible: false,
          rejectReason: `Provider ${provider.id} is not in allowed providers list`,
          score: -1,
        });
        continue;
      }

      // Check required capabilities
      const requiredCaps = new Set(request.requiredCapabilities || []);
      if (constraints.requiresToolCalling) requiredCaps.add("tool_calling");
      if (constraints.requiresStructuredOutput) requiredCaps.add("structured_output");
      if (constraints.requiresStreaming) requiredCaps.add("streaming");
      if (constraints.requiresMultimodal) requiredCaps.add("multimodal");

      const missingCaps = Array.from(requiredCaps).filter(
        (cap) => !model.capabilities.includes(cap)
      );

      if (missingCaps.length > 0) {
        evaluated.push({
          model,
          provider,
          eligible: false,
          rejectReason: `Missing required capabilities: [${missingCaps.join(", ")}]`,
          score: -1,
        });
        continue;
      }

      // Check context window
      if (minContext && model.contextWindow < minContext) {
        evaluated.push({
          model,
          provider,
          eligible: false,
          rejectReason: `Context window (${model.contextWindow}) less than required (${minContext})`,
          score: -1,
        });
        continue;
      }

      // Check provider health
      if (provider.status === "UNAVAILABLE" || provider.status === "AUTH_REQUIRED") {
        evaluated.push({
          model,
          provider,
          eligible: false,
          rejectReason: `Provider status is ${provider.status}`,
          score: -1,
        });
        continue;
      }

      // Check rate limits
      const withinLimits = this.rateLimiter.checkLimit(provider.id, provider.rateLimits);
      if (!withinLimits) {
        evaluated.push({
          model,
          provider,
          eligible: false,
          rejectReason: "Rate limit exceeded (RPM or TPM)",
          score: -1,
        });
        continue;
      }

      // Score candidate
      let score = 100;
      if (request.preferredProviderId === provider.id) score += 50;
      if (request.preferredModelId === model.id) score += 50;
      if (provider.type === "LOCAL") score += 10;

      if (request.preference?.optimizeFor === "cost" && model.costPerMillionTokens) {
        const totalCost = model.costPerMillionTokens.input + model.costPerMillionTokens.output;
        score += Math.max(0, 50 - totalCost * 2);
      } else if (request.preference?.optimizeFor === "quality") {
        if (model.capabilities.includes("reasoning")) score += 25;
        if (model.capabilities.includes("long_context")) score += 15;
      }

      evaluated.push({
        model,
        provider,
        eligible: true,
        score,
      });
    }

    const eligibleCandidates = evaluated
      .filter((c) => c.eligible)
      .sort((a, b) => b.score - a.score);

    if (eligibleCandidates.length === 0) {
      const reasons = evaluated
        .map((e) => `${e.model.id}@${e.provider.id}: ${e.rejectReason}`)
        .join("; ");
      throw new ProviderRoutingError(
        `No matching model provider found for routing request. Evaluated ${evaluated.length} candidates: [${reasons}]`
      );
    }

    const topCandidate = eligibleCandidates[0];
    const isPreferred =
      (!request.preferredProviderId || topCandidate.provider.id === request.preferredProviderId) &&
      (!request.preferredModelId || topCandidate.model.id === request.preferredModelId);

    const fallbackUsed = !isPreferred;

    if (fallbackUsed && request.fallbackPolicy === "FAIL_IMMEDIATELY") {
      throw new ProviderRoutingError(
        `Fallback policy FAIL_IMMEDIATELY prevented routing to alternative ${topCandidate.model.id}@${topCandidate.provider.id}`
      );
    }

    let rationale = `Selected ${topCandidate.model.id} via ${topCandidate.provider.id} based on required capabilities.`;
    let fallbackAudit = undefined;

    if (fallbackUsed) {
      const preferredRejected = evaluated.find(
        (e) =>
          (request.preferredProviderId && e.provider.id === request.preferredProviderId) ||
          (request.preferredModelId && e.model.id === request.preferredModelId)
      );

      const degradationWarnings: string[] = [];
      if (preferredRejected) {
        if (topCandidate.model.contextWindow < preferredRejected.model.contextWindow) {
          degradationWarnings.push(
            `Context window reduced from ${preferredRejected.model.contextWindow} to ${topCandidate.model.contextWindow}`
          );
        }
      }

      const reason = preferredRejected
        ? `Preferred candidate unavailable: ${preferredRejected.rejectReason}`
        : `Preferred target was not eligible`;

      rationale = `Fallback activated: ${reason}. Routed to ${topCandidate.model.id} via ${topCandidate.provider.id}.`;

      fallbackAudit = {
        fallbackUsed: true,
        originalTarget: {
          providerId: request.preferredProviderId,
          modelId: request.preferredModelId,
        },
        selectedTarget: {
          providerId: topCandidate.provider.id,
          modelId: topCandidate.model.id,
        },
        reason,
        degradationWarnings,
        silentDowngradePrevented: true,
      };
    }

    return {
      decisionId: randomUUID(),
      providerId: topCandidate.provider.id,
      modelId: topCandidate.model.id,
      rationale,
      fallbackUsed,
      fallbackAudit,
      evaluatedCandidatesCount: evaluated.length,
      timestamp: new Date().toISOString(),
    };
  }

  async execute(request: RoutingRequest, prompt: string): Promise<InferenceResult> {
    const startTime = Date.now();
    const decision = this.route(request);

    // Estimate mock prompt tokens (~4 chars per token)
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionText = `[Inference from ${decision.modelId} via ${decision.providerId}]: Processed request for task ${request.taskId}.`;
    const completionTokens = Math.ceil(completionText.length / 4);
    const totalTokens = promptTokens + completionTokens;

    // Record usage
    this.rateLimiter.recordUsage(decision.providerId, totalTokens);

    return {
      text: completionText,
      decision,
      tokensUsed: {
        prompt: promptTokens,
        completion: completionTokens,
        total: totalTokens,
      },
      durationMs: Date.now() - startTime,
    };
  }
}
