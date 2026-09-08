import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForgeDatabase, runMigrations, MemoryRepository } from "@forge/storage";
import { WorkingContextManager, SemanticMemoryEngine } from "@forge/memory";
import { AgentInstance } from "../src/services/agent-instance.js";
import type { AgentManifest } from "../src/types/agent.js";

describe("Agent System & Memory Engine Integration (FR-501)", () => {
  let db: ForgeDatabase;
  let memoryRepo: MemoryRepository;
  let semanticEngine: SemanticMemoryEngine;

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
    memoryRepo = new MemoryRepository(db);
    semanticEngine = new SemanticMemoryEngine(memoryRepo);
  });

  afterEach(() => {
    db.close();
  });

  const baseManifest: AgentManifest = {
    id: "agent.coder.v1",
    name: "Autonomous Software Engineer",
    role: "Worker",
    description: "Generates high quality TypeScript code following Forge invariants",
    capabilities: { skills: ["code_generation"] },
    systemPrompt: "You are an autonomous senior engineer.",
  };

  it("accumulates conversation turns in working context buffer across steps", async () => {
    const contextManager = new WorkingContextManager({ maxTotalTokens: 2000 });
    const agent = new AgentInstance(baseManifest, { workingContext: contextManager });

    // Step 1
    const res1 = await agent.runStep({
      taskId: "task-001",
      instruction: "Write the schema migration for memory_records.",
    });
    expect(res1.status).toBe("COMPLETED");

    // After Step 1: user instruction + assistant output = 2 turns
    expect(contextManager.getTurns()).toHaveLength(2);

    // Step 2
    const res2 = await agent.runStep({
      taskId: "task-002",
      instruction: "Add vitest coverage for the memory repository.",
    });
    expect(res2.status).toBe("COMPLETED");

    // After Step 2: 4 turns
    expect(contextManager.getTurns()).toHaveLength(4);
    expect(contextManager.getTurns()[0].content).toContain("Write the schema migration");
    expect(contextManager.getTurns()[2].content).toContain("Add vitest coverage");
  });

  it("recalls relevant long-term semantic memories and ingests task outcomes", async () => {
    // Seed long-term memory with a prior learning
    semanticEngine.ingestArchitecturalDecision({
      adrId: "AD-007",
      title: "Workspace Isolation",
      decision: "All code edits must occur in isolated Git worktrees per task lease.",
    });

    const agent = new AgentInstance(baseManifest, { semanticMemory: semanticEngine });

    // Run step requesting worktree workflow
    const result = await agent.runStep({
      taskId: "task-worktree-01",
      instruction: "Ensure code edits happen inside isolated Git worktrees without branch collisions.",
    });

    expect(result.status).toBe("COMPLETED");

    // Verify task outcome was auto-ingested into long-term memory
    const savedTaskMem = memoryRepo.findById("mem_task_task-worktree-01");
    expect(savedTaskMem).not.toBeNull();
    expect(savedTaskMem?.category).toBe("LEARNING");
    expect(savedTaskMem?.content).toContain("Processed step for task task-worktree-01");

    // Search for the task outcome in semantic memory
    const recalled = semanticEngine.recall({ query: "worktree-01" });
    expect(recalled.length).toBeGreaterThanOrEqual(1);
  });

  it("instantiates sliding window WorkingContextManager automatically from manifest config", async () => {
    const manifestWithMemory: AgentManifest = {
      ...baseManifest,
      memory: {
        type: "sliding_window",
        contextWindowLimit: 1500,
      },
    };

    const agent = new AgentInstance(manifestWithMemory);
    expect(agent.getWorkingContext()).toBeDefined();

    await agent.runStep({
      taskId: "task-auto-mem",
      instruction: "Verify auto-instantiation of working context manager",
    });

    expect(agent.getWorkingContext()?.getTurns()).toHaveLength(2);
  });
});
