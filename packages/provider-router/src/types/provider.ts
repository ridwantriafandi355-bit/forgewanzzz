export type ProviderType =
  | "CLOUD"
  | "LOCAL"
  | "SELF_HOSTED"
  | "COMPATIBLE_API"
  | "RUNTIME_EMBEDDED"
  | "CUSTOM";

export type ProviderStatus =
  | "AVAILABLE"
  | "DEGRADED"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "AUTH_REQUIRED"
  | "MISCONFIGURED";

export type ModelCapability =
  | "reasoning"
  | "code_generation"
  | "tool_calling"
  | "structured_output"
  | "streaming"
  | "vision"
  | "audio"
  | "long_context"
  | "multimodal";

export interface RateLimitConfig {
  rpm: number;
  tpm: number;
}

export interface TokenCost {
  input: number; // cost in USD per 1M tokens
  output: number; // cost in USD per 1M tokens
}

export interface ProviderDescriptor {
  id: string;
  name: string;
  type: ProviderType;
  status: ProviderStatus;
  rateLimits?: RateLimitConfig;
  endpoint?: string;
  metadata?: Record<string, unknown>;
}

export interface ModelDescriptor {
  id: string;
  providerId: string;
  name: string;
  family: string;
  contextWindow: number;
  capabilities: ModelCapability[];
  costPerMillionTokens?: TokenCost;
  metadata?: Record<string, unknown>;
}

export interface HardConstraints {
  minContextWindow?: number;
  requiresToolCalling?: boolean;
  requiresStructuredOutput?: boolean;
  requiresStreaming?: boolean;
  requiresMultimodal?: boolean;
  allowedProviders?: string[];
  forbiddenProviders?: string[];
}

export interface FallbackAuditRecord {
  fallbackUsed: boolean;
  originalTarget?: { providerId?: string; modelId?: string };
  selectedTarget: { providerId: string; modelId: string };
  reason: string;
  degradationWarnings: string[];
  silentDowngradePrevented: boolean;
}

export interface RoutingRequest {
  taskId: string;
  agentId: string;
  requiredCapabilities?: ModelCapability[];
  minContextWindow?: number;
  preferredProviderId?: string;
  preferredModelId?: string;
  fallbackPolicy?: "ALLOW_FALLBACK" | "FAIL_IMMEDIATELY";
  hardConstraints?: HardConstraints;
  preference?: {
    optimizeFor?: "cost" | "latency" | "quality";
  };
}

export interface RoutingDecision {
  decisionId: string;
  providerId: string;
  modelId: string;
  rationale: string;
  fallbackUsed: boolean;
  fallbackAudit?: FallbackAuditRecord;
  evaluatedCandidatesCount: number;
  timestamp: string;
}

export interface InferenceResult {
  text: string;
  decision: RoutingDecision;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  durationMs: number;
}
