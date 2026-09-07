export type AgentState =
  | "UNINITIALIZED"
  | "IDLE"
  | "PLANNING"
  | "EXECUTING"
  | "AWAITING_TOOL"
  | "AWAITING_APPROVAL"
  | "EVALUATING"
  | "COMPLETED"
  | "FAILED";

export type AgentEventType =
  | "INITIALIZE"
  | "RECEIVE_TASK"
  | "PLAN_FORMULATED"
  | "INVOKE_TOOL"
  | "TOOL_RESULT_RECEIVED"
  | "REQUIRE_APPROVAL"
  | "APPROVAL_GRANTED"
  | "APPROVAL_REJECTED"
  | "OUTPUT_GENERATED"
  | "EVALUATOR_PASSED"
  | "EVALUATOR_FAILED"
  | "FAIL"
  | "RESET";

export type AgentEvent =
  | { type: "INITIALIZE" }
  | { type: "RECEIVE_TASK"; taskId: string }
  | { type: "PLAN_FORMULATED" }
  | { type: "INVOKE_TOOL"; toolId: string }
  | { type: "TOOL_RESULT_RECEIVED" }
  | { type: "REQUIRE_APPROVAL"; reason: string }
  | { type: "APPROVAL_GRANTED" }
  | { type: "APPROVAL_REJECTED" }
  | { type: "OUTPUT_GENERATED" }
  | { type: "EVALUATOR_PASSED" }
  | { type: "EVALUATOR_FAILED" }
  | { type: "FAIL"; error: string }
  | { type: "RESET" };

export interface AgentCapabilitiesConfig {
  skills: string[];
  toolsBlacklist?: string[];
}

export interface AgentProviderPolicy {
  primary: string;
  fallback?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface AgentMemoryConfig {
  type: "ephemeral" | "sliding_window" | "hybrid";
  contextWindowLimit?: number;
}

export interface AgentManifest {
  id: string;
  name: string;
  role: "Supervisor" | "Worker" | "Evaluator" | "HumanProxy";
  description: string;
  providerPolicy?: AgentProviderPolicy;
  capabilities: AgentCapabilitiesConfig;
  memory?: AgentMemoryConfig;
  systemPrompt: string;
}

export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface PromptCompositionInput {
  kernelInvariants: string[];
  persona: {
    id: string;
    role: string;
    name: string;
    systemPrompt: string;
  };
  activeSkillInstructions?: string[];
  semanticMemory?: string[];
  turnBuffer?: PromptMessage[];
  maxTokens?: number;
}

export interface TokenBudgetAllocation {
  totalBudget: number;
  systemTokens: number;
  toolTokens: number;
  memoryTokens: number;
  historyTokens: number;
}

export interface ComposedPrompt {
  systemMessage: string;
  messages: PromptMessage[];
  tokenBudget: TokenBudgetAllocation;
}

export interface AgentStepInput {
  taskId: string;
  instruction: string;
  context?: Record<string, unknown>;
}

export interface AgentStepResult {
  taskId: string;
  agentId: string;
  status: "COMPLETED" | "FAILED";
  artifacts: Array<{ path: string; summary: string }>;
  diagnostics?: string;
}
