import { randomUUID } from "node:crypto";
import type {
  ContextRole,
  ContextTurn,
  WorkingContextConfig,
  CompactionResult,
  CompactionStrategy,
} from "../types/memory.js";

export class WorkingContextManager {
  private turns: ContextTurn[] = [];
  private maxTotalTokens: number;
  private historyRatio: number;
  private slidingWindowTurns: number;
  private compactionStrategy: CompactionStrategy;

  constructor(config: WorkingContextConfig = {}) {
    this.maxTotalTokens = config.maxTotalTokens ?? 8192;
    this.historyRatio = config.historyRatio ?? 0.4;
    this.slidingWindowTurns = config.slidingWindowTurns ?? 4;
    this.compactionStrategy = config.compactionStrategy ?? "HYBRID";
  }

  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
  }

  getHistoryTokenLimit(): number {
    return Math.floor(this.maxTotalTokens * this.historyRatio);
  }

  getTotalTokens(): number {
    return this.turns.reduce((sum, t) => sum + t.tokenCount, 0);
  }

  getTurns(): ContextTurn[] {
    return [...this.turns];
  }

  addTurn(role: ContextRole, content: string, metadata?: Record<string, unknown>): ContextTurn {
    const tokenCount = this.estimateTokens(content);
    const turn: ContextTurn = {
      id: `turn_${randomUUID().slice(0, 8)}`,
      role,
      content,
      tokenCount,
      timestamp: new Date().toISOString(),
      metadata,
    };

    this.turns.push(turn);

    if (this.isExceedingBudget()) {
      this.compact();
    }

    return turn;
  }

  isExceedingBudget(): boolean {
    return this.getTotalTokens() > this.getHistoryTokenLimit();
  }

  compact(): CompactionResult {
    const limit = this.getHistoryTokenLimit();
    if (this.getTotalTokens() <= limit || this.turns.length <= this.slidingWindowTurns) {
      return {
        turns: [...this.turns],
        prunedTurnsCount: 0,
        compactedSummary: null,
        totalTokens: this.getTotalTokens(),
      };
    }

    // Split turns into older turns (to compact) and recent window (to preserve)
    const preserveCount = Math.max(1, this.slidingWindowTurns);
    const splitIndex = this.turns.length - preserveCount;
    const olderTurns = this.turns.slice(0, splitIndex);
    const recentTurns = this.turns.slice(splitIndex);

    let compactedSummary: string | null = null;
    let newTurns: ContextTurn[] = [];

    if (this.compactionStrategy === "SLIDING_WINDOW") {
      // Drop older turns progressively until under limit
      const keptOlder = [...olderTurns];
      while (keptOlder.length > 0 && (this.calculateTokens([...keptOlder, ...recentTurns]) > limit)) {
        keptOlder.shift();
      }
      newTurns = [...keptOlder, ...recentTurns];
    } else {
      // SUMMARIZE or HYBRID
      const summaryLines: string[] = [
        `=== COMPACTED CONTEXT SUMMARY (${olderTurns.length} prior turns) ===`
      ];

      for (const t of olderTurns) {
        const snippet = t.content.length > 120 ? `${t.content.slice(0, 117)}...` : t.content;
        summaryLines.push(`- [${t.role.toUpperCase()}]: ${snippet.replace(/\n/g, " ")}`);
      }

      compactedSummary = summaryLines.join("\n");
      const summaryTokenCount = this.estimateTokens(compactedSummary);

      const summaryTurn: ContextTurn = {
        id: `turn_compaction_${randomUUID().slice(0, 8)}`,
        role: "system",
        content: compactedSummary,
        tokenCount: summaryTokenCount,
        timestamp: new Date().toISOString(),
        metadata: { isCompactedSummary: true, originalTurnsCount: olderTurns.length },
      };

      newTurns = [summaryTurn, ...recentTurns];

      // If still exceeding limit, prune from older recent turns
      while (newTurns.length > 2 && this.calculateTokens(newTurns) > limit) {
        // remove the first turn after summary turn
        newTurns.splice(1, 1);
      }
    }

    const prunedCount = this.turns.length - newTurns.length;
    this.turns = newTurns;

    return {
      turns: [...this.turns],
      prunedTurnsCount: Math.max(0, prunedCount),
      compactedSummary,
      totalTokens: this.getTotalTokens(),
    };
  }

  reset(): void {
    this.turns = [];
  }

  private calculateTokens(turns: ContextTurn[]): number {
    return turns.reduce((sum, t) => sum + t.tokenCount, 0);
  }
}
