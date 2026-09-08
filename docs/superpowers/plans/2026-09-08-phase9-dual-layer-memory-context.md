# Phase 9: Dual-Layer Memory & Context System (Doc 12) Implementation Plan

> **Goal:** Implement Schema V3 migrations in `@forge/storage` (with SQLite FTS5 BM25 search), create `@forge/memory` with `WorkingContextManager` (short-term sliding window, token estimation, and auto-compaction) and `SemanticMemoryEngine` (long-term semantic recall and task outcome ingestion), and wire directly into `@forge/agent-system`, the Forge CLI (`forge memory`), and the Paperclip Dashboard.

**Architecture:**
- **Storage Layer:** Schema V3 introduces `memory_records` and virtual table `memory_fts` (`porter unicode61`). `MemoryRepository` provides full CRUD, FTS5 BM25 relevance ranking, scope isolation, access tracking, and pruning.
- **Memory Engine (`@forge/memory`):** `WorkingContextManager` manages conversation turns within strict token budget partitions (40% history allocation per Doc 03/04), performing auto-compaction when thresholds are exceeded. `SemanticMemoryEngine` coordinates cross-task knowledge retrieval, ADR/task outcome ingestion, and cosine vector similarity blending.
- **Agent Integration:** `AgentInstance` automatically manages working context buffers and injects retrieved semantic memories into Layer 4 of `PromptCompositionPipeline`.
- **Operator Plane:** CLI exposes `forge memory search`, `list`, `store`. Paperclip Dashboard exposes `GET /api/memory`, `POST /api/memory/search`, and real-time Memory Vault UI.

**Tech Stack:** TypeScript 5.9, Node.js (`node:sqlite` FTS5), Vitest.

---

### Task 1: Storage Layer (`@forge/storage` & Schema V3)
- [x] Step 1: Write failing test for Schema V3 and `MemoryRepository`
- [x] Step 2: Implement `schema-v3.ts` with `memory_records` and `memory_fts`
- [x] Step 3: Update `migrator.ts` to execute Schema V1, V2, and V3
- [x] Step 4: Implement `MemoryRepository` with FTS5 BM25 search, scope filtering, and pruning
- [x] Step 5: Export in `packages/storage/src/index.ts`
- [x] Step 6: Verify all storage tests pass (19/19)

---

### Task 2: New Package `@forge/memory`
- [x] Step 1: Initialize `package.json` and `tsconfig.json` for `@forge/memory`
- [x] Step 2: Define memory and context types in `src/types/memory.ts`
- [x] Step 3: Implement `WorkingContextManager` with sliding window and auto-compaction
- [x] Step 4: Implement `SemanticMemoryEngine` with ingestion, BM25 recall, and cosine similarity
- [x] Step 5: Write unit tests in `working-context-manager.test.ts` and `semantic-memory-engine.test.ts`
- [x] Step 6: Verify all memory tests pass (8/8)

---

### Task 3: Integration with `@forge/agent-system`
- [x] Step 1: Add `@forge/memory` and `@forge/storage` dependencies to `agent-system`
- [x] Step 2: Wire `WorkingContextManager` and `SemanticMemoryEngine` into `AgentInstance`
- [x] Step 3: Write integration tests in `agent-memory-integration.test.ts`
- [x] Step 4: Verify all agent-system tests pass (8/8)

---

### Task 4: CLI & Dashboard Telemetry
- [x] Step 1: Implement `forge memory` command in `packages/cli/src/commands/memory.ts`
- [x] Step 2: Wire `memory` command into `runCli` in `packages/cli/src/cli.ts`
- [x] Step 3: Add CLI memory tests in `packages/cli/tests/cli.test.ts`
- [x] Step 4: Wire `/api/memory` and `/api/memory/search` endpoints into `DashboardServer`
- [x] Step 5: Add Memory & Context Vault tab and panel to Paperclip Dashboard UI (`index.html`, `dashboard.js`, `dashboard.css`)
- [x] Step 6: Add dashboard memory API tests in `packages/dashboard/tests/dashboard.test.ts`

---

### Task 5: Full Monorepo Verification & Regression Testing
- [x] Step 1: Run full test suite (`pnpm test`): **33 test files passed, 122 tests passed (100%)**
- [x] Step 2: Run full build (`pnpm build`): **17 packages built cleanly (100%)**
