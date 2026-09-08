import { describe, it, expect } from "vitest";
import { WorkingContextManager } from "../src/services/working-context-manager.js";

describe("WorkingContextManager — Short-Term Context Compaction (FR-501)", () => {
  it("tracks turn additions and calculates estimated tokens", () => {
    const manager = new WorkingContextManager({ maxTotalTokens: 1000, historyRatio: 0.5 });
    expect(manager.getHistoryTokenLimit()).toBe(500);

    const turn1 = manager.addTurn("user", "Hello world, analyze this repo.");
    expect(turn1.role).toBe("user");
    expect(turn1.tokenCount).toBeGreaterThan(0);
    expect(manager.getTotalTokens()).toBe(turn1.tokenCount);
    expect(manager.getTurns()).toHaveLength(1);
  });

  it("triggers auto-compaction when conversation turns exceed history token limit", () => {
    // Set a small limit: total 60, ratio 0.5 => limit 30 tokens (~120 chars)
    const manager = new WorkingContextManager({
      maxTotalTokens: 60,
      historyRatio: 0.5,
      slidingWindowTurns: 2,
      compactionStrategy: "SUMMARIZE",
    });

    // Add 4 turns with ~70 chars each (~18 tokens each)
    manager.addTurn("user", "Step 1: Inspect the repository structure for existing test suites in monorepo.");
    manager.addTurn("assistant", "Step 1 complete: Found 29 test suites with 102 passing tests successfully.");
    manager.addTurn("user", "Step 2: Propose schema changes to introduce memory_records and memory_fts.");

    // At 3 turns, total tokens ~ 18 * 3 = 54 > 30 limit, auto-compaction should trigger
    const turns = manager.getTurns();
    expect(turns.length).toBeLessThanOrEqual(3);

    // Add another turn
    manager.addTurn("assistant", "Step 2 complete: Schema V3 DDL created with memory_records and memory_fts.");

    const finalTurns = manager.getTurns();
    const hasSummaryTurn = finalTurns.some((t) => t.metadata?.isCompactedSummary === true);
    expect(hasSummaryTurn).toBe(true);
  });

  it("sliding window strategy prunes oldest turns while preserving recent window", () => {
    const manager = new WorkingContextManager({
      maxTotalTokens: 150,
      historyRatio: 0.5, // 75 token limit
      slidingWindowTurns: 2,
      compactionStrategy: "SLIDING_WINDOW",
    });

    for (let i = 1; i <= 6; i++) {
      manager.addTurn("user", `Turn ${i}: Test message payload that consumes some tokens.`);
    }

    const turns = manager.getTurns();
    // Total tokens must remain within budget
    expect(manager.getTotalTokens()).toBeLessThanOrEqual(manager.getHistoryTokenLimit());
    // Most recent turns (Turn 5, Turn 6) must be preserved
    const lastTurn = turns[turns.length - 1];
    expect(lastTurn.content).toContain("Turn 6");
  });

  it("resets working context cleanly between tasks", () => {
    const manager = new WorkingContextManager();
    manager.addTurn("user", "Task 1 specific instructions");
    expect(manager.getTurns()).toHaveLength(1);

    manager.reset();
    expect(manager.getTurns()).toHaveLength(0);
    expect(manager.getTotalTokens()).toBe(0);
  });
});
