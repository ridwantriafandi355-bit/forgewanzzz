import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForgeDatabase, runMigrations, MemoryRepository } from "@forge/storage";
import { SemanticMemoryEngine } from "../src/services/semantic-memory-engine.js";

describe("SemanticMemoryEngine — Long-Term Semantic Recall (Doc 12)", () => {
  let db: ForgeDatabase;
  let repo: MemoryRepository;
  let engine: SemanticMemoryEngine;

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
    repo = new MemoryRepository(db);
    engine = new SemanticMemoryEngine(repo);
  });

  afterEach(() => {
    db.close();
  });

  it("ingests task outcomes and retrieves them via semantic keyword search", () => {
    engine.ingestTaskOutcome({
      taskId: "tsk-db-migration",
      missionId: "msn-forge-v1",
      agentId: "agent-dba",
      summary: "Migrated SQLite storage tables to Schema V3 including full-text FTS5 support.",
      errorSolutions: ["Resolved busy timeout by configuring PRAGMA busy_timeout = 5000;"],
      tags: ["sqlite", "migration"],
    });

    const results = engine.recall({
      query: "sqlite timeout",
      scopeType: "TASK",
    });

    expect(results).toHaveLength(1);
    expect(results[0].title).toContain("tsk-db-migration");
    expect(results[0].content).toContain("PRAGMA busy_timeout");
  });

  it("ingests architectural decisions and formats them for prompt injection", () => {
    engine.ingestArchitecturalDecision({
      adrId: "AD-001",
      title: "Task Graph Ownership",
      decision: "Task Engine is the sole authoritative owner of the Task Graph and Task State.",
      consequences: "Orchestrator must propose graph mutations rather than mutating state directly.",
    });

    const results = engine.recall({ query: "authoritative task graph" });
    expect(results.length).toBeGreaterThanOrEqual(1);

    const formatted = engine.formatForPrompt(results);
    expect(formatted.length).toBeGreaterThanOrEqual(1);
    expect(formatted[0]).toContain("[LEARNING] ADR: AD-001 — Task Graph Ownership");
    expect(formatted[0]).toContain("Task Engine is the sole authoritative owner");
  });

  it("computes cosine similarity accurately", () => {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    const vecC = [0, 1, 0];

    expect(engine.cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0);
    expect(engine.cosineSimilarity(vecA, vecC)).toBeCloseTo(0.0);
  });

  it("blends vector embeddings with BM25 FTS5 score during recall", () => {
    // Ingest two memories, one with matching embedding
    repo.store({
      id: "mem_vec_1",
      scopeType: "PROJECT",
      scopeId: "proj_vec",
      category: "SNIPPET",
      title: "Vector Search Implementation",
      content: "Embeddings vector similarity calculation using dot product.",
      embedding: [0.9, 0.1, 0.0],
    });

    repo.store({
      id: "mem_vec_2",
      scopeType: "PROJECT",
      scopeId: "proj_vec",
      category: "SNIPPET",
      title: "BM25 Ranking Implementation",
      content: "SQLite FTS5 uses BM25 algorithm for relevance score.",
      embedding: [0.0, 0.9, 0.1],
    });

    // Query with embedding matching mem_vec_1
    const results = engine.recall({
      query: "implementation",
      embedding: [0.95, 0.05, 0.0],
      scopeType: "PROJECT",
      scopeId: "proj_vec",
    });

    expect(results).toHaveLength(2);
    // mem_vec_1 should rank higher (lower combined score)
    expect(results[0].id).toBe("mem_vec_1");
  });
});
