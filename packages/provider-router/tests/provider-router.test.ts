import { describe, it, expect, beforeEach } from "vitest";
import { ProviderRegistry } from "../src/registry/provider-registry.js";
import { RateLimiter } from "../src/services/rate-limiter.js";
import { ProviderRouter } from "../src/services/provider-router.js";
import type { ProviderDescriptor, ModelDescriptor, RoutingRequest } from "../src/types/provider.js";

describe("ProviderRouter", () => {
  let registry: ProviderRegistry;
  let rateLimiter: RateLimiter;
  let router: ProviderRouter;

  const mockAnthropic: ProviderDescriptor = {
    id: "anthropic",
    name: "Anthropic Cloud",
    type: "CLOUD",
    status: "AVAILABLE",
    rateLimits: { rpm: 60, tpm: 100000 },
  };

  const mockOllama: ProviderDescriptor = {
    id: "local-ollama",
    name: "Local Ollama Instance",
    type: "LOCAL",
    status: "AVAILABLE",
    rateLimits: { rpm: 1000, tpm: 1000000 },
  };

  const mockSonnet: ModelDescriptor = {
    id: "claude-3-5-sonnet",
    providerId: "anthropic",
    name: "Claude 3.5 Sonnet",
    family: "claude",
    contextWindow: 200000,
    capabilities: ["code_generation", "tool_calling", "reasoning"],
    costPerMillionTokens: { input: 3.0, output: 15.0 },
  };

  const mockLlama: ModelDescriptor = {
    id: "llama3-8b",
    providerId: "local-ollama",
    name: "Llama 3 8B Local",
    family: "llama",
    contextWindow: 8192,
    capabilities: ["code_generation", "reasoning"],
    costPerMillionTokens: { input: 0, output: 0 },
  };

  beforeEach(() => {
    registry = new ProviderRegistry();
    registry.registerProvider(mockAnthropic);
    registry.registerProvider(mockOllama);
    registry.registerModel(mockSonnet);
    registry.registerModel(mockLlama);

    rateLimiter = new RateLimiter();
    router = new ProviderRouter(registry, rateLimiter);
  });

  it("selects primary model when all capabilities and rate limits are satisfied", () => {
    const request: RoutingRequest = {
      taskId: "task-001",
      agentId: "agent-coder",
      requiredCapabilities: ["code_generation", "tool_calling"],
      minContextWindow: 32000,
      preferredProviderId: "anthropic",
    };

    const decision = router.route(request);
    expect(decision.providerId).toBe("anthropic");
    expect(decision.modelId).toBe("claude-3-5-sonnet");
    expect(decision.fallbackUsed).toBe(false);
  });

  it("rejects candidates that lack required capabilities (tool_calling)", () => {
    const request: RoutingRequest = {
      taskId: "task-002",
      agentId: "agent-coder",
      requiredCapabilities: ["code_generation", "tool_calling"],
      preferredProviderId: "local-ollama", // llama lacks tool_calling
      fallbackPolicy: "ALLOW_FALLBACK",
    };

    const decision = router.route(request);
    // Should fallback to Anthropic because Ollama's model lacks tool_calling
    expect(decision.providerId).toBe("anthropic");
    expect(decision.modelId).toBe("claude-3-5-sonnet");
    expect(decision.fallbackUsed).toBe(true);
  });

  it("throws when no candidate satisfies mandatory constraints", () => {
    const request: RoutingRequest = {
      taskId: "task-003",
      agentId: "agent-coder",
      requiredCapabilities: ["vision"], // Neither model has vision
      fallbackPolicy: "FAIL_IMMEDIATELY",
    };

    expect(() => router.route(request)).toThrowError(/No matching model provider found/);
  });

  it("triggers fallback when preferred provider is rate limited", () => {
    // Exceed rate limit for anthropic
    rateLimiter.recordUsage("anthropic", 100001);

    // Register a second provider with tool_calling
    const mockGroq: ProviderDescriptor = {
      id: "groq",
      name: "Groq Cloud",
      type: "CLOUD",
      status: "AVAILABLE",
      rateLimits: { rpm: 100, tpm: 100000 },
    };
    const mockGroqLlama: ModelDescriptor = {
      id: "llama-3.3-70b-versatile",
      providerId: "groq",
      name: "Groq Llama 3.3 70B",
      family: "llama",
      contextWindow: 128000,
      capabilities: ["code_generation", "tool_calling", "reasoning"],
      costPerMillionTokens: { input: 0.5, output: 0.8 },
    };
    registry.registerProvider(mockGroq);
    registry.registerModel(mockGroqLlama);

    const request: RoutingRequest = {
      taskId: "task-004",
      agentId: "agent-coder",
      requiredCapabilities: ["code_generation", "tool_calling"],
      preferredProviderId: "anthropic",
      fallbackPolicy: "ALLOW_FALLBACK",
    };

    const decision = router.route(request);
    expect(decision.providerId).toBe("groq");
    expect(decision.modelId).toBe("llama-3.3-70b-versatile");
    expect(decision.fallbackUsed).toBe(true);
    expect(decision.rationale).toContain("Rate limit exceeded");
  });

  it("executes mock inference successfully with token tracking", async () => {
    const request: RoutingRequest = {
      taskId: "task-005",
      agentId: "agent-coder",
      requiredCapabilities: ["code_generation"],
    };

    const result = await router.execute(request, "Write a hello world function");
    expect(result.text).toBeDefined();
    expect(result.tokensUsed.total).toBeGreaterThan(0);
    expect(result.decision.providerId).toBeDefined();
  });

  it("enforces HardConstraints (forbiddenProviders, requiresToolCalling, minContextWindow) per Doc 09", () => {
    const request: RoutingRequest = {
      taskId: "task-006",
      agentId: "agent-architect",
      hardConstraints: {
        forbiddenProviders: ["anthropic"], // Anthropic forbidden
        requiresToolCalling: false,
        minContextWindow: 4000,
      },
    };

    const decision = router.route(request);
    // Should choose ollama since anthropic is forbidden
    expect(decision.providerId).toBe("local-ollama");
    expect(decision.modelId).toBe("llama3-8b");
  });

  it("produces FallbackAuditRecord preventing silent downgrades when fallback triggers", () => {
    const request: RoutingRequest = {
      taskId: "task-007",
      agentId: "agent-tester",
      preferredProviderId: "local-ollama",
      preferredModelId: "llama3-8b",
      hardConstraints: {
        requiresToolCalling: true, // llama3-8b lacks this, so must fallback to sonnet
      },
      fallbackPolicy: "ALLOW_FALLBACK",
    };

    const decision = router.route(request);
    expect(decision.fallbackUsed).toBe(true);
    expect(decision.fallbackAudit).toBeDefined();
    expect(decision.fallbackAudit?.silentDowngradePrevented).toBe(true);
    expect(decision.fallbackAudit?.originalTarget?.providerId).toBe("local-ollama");
    expect(decision.fallbackAudit?.selectedTarget.providerId).toBe("anthropic");
  });

  it("throws when fallback triggers but fallbackPolicy is FAIL_IMMEDIATELY", () => {
    const request: RoutingRequest = {
      taskId: "task-008",
      agentId: "agent-tester",
      preferredProviderId: "local-ollama",
      preferredModelId: "llama3-8b",
      hardConstraints: {
        requiresToolCalling: true,
      },
      fallbackPolicy: "FAIL_IMMEDIATELY",
    };

    expect(() => router.route(request)).toThrowError(/FAIL_IMMEDIATELY prevented routing/);
  });
});
