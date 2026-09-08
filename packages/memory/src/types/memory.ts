import type {
  MemoryRecord,
  MemoryRecordInput,
  MemorySearchQuery,
  MemorySearchResult,
  MemoryScopeType,
  MemoryCategory,
} from "@forge/storage";

export type {
  MemoryRecord,
  MemoryRecordInput,
  MemorySearchQuery,
  MemorySearchResult,
  MemoryScopeType,
  MemoryCategory,
};

export type ContextRole = "user" | "assistant" | "system" | "tool";

export interface ContextTurn {
  id: string;
  role: ContextRole;
  content: string;
  tokenCount: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type CompactionStrategy = "SUMMARIZE" | "SLIDING_WINDOW" | "HYBRID";

export interface WorkingContextConfig {
  maxTotalTokens?: number;
  historyRatio?: number;
  slidingWindowTurns?: number;
  compactionStrategy?: CompactionStrategy;
}

export interface CompactionResult {
  turns: ContextTurn[];
  prunedTurnsCount: number;
  compactedSummary: string | null;
  totalTokens: number;
}

export interface TaskOutcomeIngestInput {
  taskId: string;
  missionId?: string;
  agentId?: string;
  summary: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  errorSolutions?: string[];
}

export interface ArchitecturalDecisionIngestInput {
  adrId: string;
  title: string;
  decision: string;
  consequences?: string;
  tags?: string[];
}

export interface SemanticRecallOptions {
  query: string;
  scopeType?: MemoryScopeType;
  scopeId?: string;
  category?: MemoryCategory;
  limit?: number;
  minScore?: number;
  embedding?: number[];
}
