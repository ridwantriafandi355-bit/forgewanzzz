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

    for (const model of allModels) {
      let provider: ProviderDescriptor;
      try {
        provider = this.registry.getProvider(model.providerId);
      } catch {
        continue;
      }

      // Check capabilities
      const requiredCaps = request.requiredCapabilities || [];
      const hasCaps = requiredCaps.every((cap) => model.capabilities.includes(cap));
      if (!hasCaps) {
        evaluated.push({
          model,
          provider,
          eligible: false,
          rejectReason: "Missing required capabilities",
          score: -1,
        });
        continue;
      }

      // Check context window
      if (request.minContextWindow && model.contextWindow < request.minContextWindow) {
        evaluated.push({
          model,
          provider,
          eligible: false,
          rejectReason: `Context window (${model.contextWindow}) less than required (${request.minContextWindow})`,
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
      if (provider.type === "LOCAL") score += 10; // local preference slight boost

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

    let rationale = `Selected ${topCandidate.model.id} via ${topCandidate.provider.id} based on required capabilities.`;
    if (fallbackUsed) {
      const preferredRejected = evaluated.find(
        (e) =>
          (request.preferredProviderId && e.provider.id === request.preferredProviderId) ||
          (request.preferredModelId && e.model.id === request.preferredModelId)
      );
      if (preferredRejected) {
        rationale = `Fallback activated: Preferred candidate was rejected: ${preferredRejected.rejectReason}. Routed to ${topCandidate.model.id} via ${topCandidate.provider.id}.`;
      } else {
        rationale = `Fallback activated: Preferred candidate unavailable. Routed to ${topCandidate.model.id} via ${topCandidate.provider.id}.`;
      }
    }

    return {
      decisionId: randomUUID(),
      providerId: topCandidate.provider.id,
      modelId: topCandidate.model.id,
      rationale,
      fallbackUsed,
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
