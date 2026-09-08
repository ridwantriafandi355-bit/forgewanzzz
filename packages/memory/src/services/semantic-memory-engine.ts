import { randomUUID } from "node:crypto";
import type {
  MemoryRepository,
  MemoryRecord,
  MemorySearchResult,
  MemoryScopeType,
} from "@forge/storage";
import type {
  TaskOutcomeIngestInput,
  ArchitecturalDecisionIngestInput,
  SemanticRecallOptions,
} from "../types/memory.js";

export class SemanticMemoryEngine {
  constructor(private memoryRepo: MemoryRepository) {}

  ingestTaskOutcome(input: TaskOutcomeIngestInput): MemoryRecord {
    const title = `Task Execution Outcome: ${input.taskId}`;
    const tags = Array.from(
      new Set(["task-outcome", input.taskId, ...(input.tags || [])])
    );

    let content = input.summary;
    if (input.errorSolutions && input.errorSolutions.length > 0) {
      content += `\n\n[Error Resolutions]:\n` + input.errorSolutions.map((s) => `- ${s}`).join("\n");
      tags.push("error-solution");
    }

    return this.memoryRepo.store({
      id: `mem_task_${input.taskId.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      scopeType: "TASK",
      scopeId: input.taskId,
      category: "LEARNING",
      title,
      content,
      tags,
      metadata: {
        missionId: input.missionId,
        agentId: input.agentId,
        ...(input.metadata || {}),
      },
    });
  }

  ingestArchitecturalDecision(input: ArchitecturalDecisionIngestInput): MemoryRecord {
    const title = `ADR: ${input.adrId} — ${input.title}`;
    const tags = Array.from(new Set(["adr", "architectural-decision", input.adrId.toLowerCase(), ...(input.tags || [])]));

    let content = input.decision;
    if (input.consequences) {
      content += `\n\n[Consequences]:\n${input.consequences}`;
    }

    return this.memoryRepo.store({
      id: `mem_adr_${input.adrId.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      scopeType: "DECISION",
      scopeId: input.adrId,
      category: "LEARNING",
      title,
      content,
      tags,
    });
  }

  ingestSnippet(
    scopeId: string,
    title: string,
    content: string,
    tags: string[] = [],
    scopeType: MemoryScopeType = "PROJECT"
  ): MemoryRecord {
    return this.memoryRepo.store({
      id: `mem_snip_${randomUUID().slice(0, 8)}`,
      scopeType,
      scopeId,
      category: "SNIPPET",
      title,
      content,
      tags: ["snippet", ...tags],
    });
  }

  recall(options: SemanticRecallOptions): MemorySearchResult[] {
    const rawResults = this.memoryRepo.search({
      query: options.query,
      scopeType: options.scopeType,
      scopeId: options.scopeId,
      category: options.category,
      limit: options.limit || 5,
    });

    // If query embedding provided, blend with vector similarity
    let results = rawResults;
    if (options.embedding && options.embedding.length > 0) {
      results = results.map((r) => {
        if (r.embedding && r.embedding.length === options.embedding!.length) {
          const sim = this.cosineSimilarity(options.embedding!, r.embedding);
          // Blended score (lower score is ranked higher in FTS5 BM25)
          const blended = (r.score * 0.6) + ((1 - sim) * 0.4);
          return { ...r, score: blended };
        }
        return r;
      });

      results.sort((a, b) => a.score - b.score);
    }

    // Filter by minScore if specified
    if (options.minScore !== undefined) {
      results = results.filter((r) => r.score <= options.minScore!);
    }

    // Record access for top results
    for (const r of results) {
      this.memoryRepo.recordAccess(r.id);
    }

    return results;
  }

  formatForPrompt(memories: MemorySearchResult[]): string[] {
    return memories.map((m) => {
      const header = m.title ? `[${m.category}] ${m.title}` : `[${m.category}]`;
      const tagsStr = m.tags.length > 0 ? ` (Tags: ${m.tags.join(", ")})` : "";
      return `${header}${tagsStr}\n${m.content}`;
    });
  }

  pruneOldMemories(scopeType: MemoryScopeType, scopeId: string, retainMax: number = 20): number {
    return this.memoryRepo.prune(scopeType, scopeId, retainMax);
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
