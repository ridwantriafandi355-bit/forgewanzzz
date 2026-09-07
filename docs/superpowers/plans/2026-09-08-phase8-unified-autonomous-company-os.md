# Phase 8: Unified Autonomous Company OS (Docs 13, 14, 16) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Schema V2 migrations in `@forge/storage` (events, connections, approvals, artifacts), wire the Paperclip Dashboard directly into the real Orchestrator, Git worktrees, and Approval queue, and persist all domain events to an immutable SQLite Event Ledger.

**Architecture:** Extend SQLite WAL storage with canonical tables (`events`, `connections`, `approvals`, `artifacts`), provide `EventRepository`, `ConnectionRepository`, and `ApprovalRepository`. Connect the Paperclip Dashboard server endpoints (`/api/tickets`, `/api/approvals`, `/api/diffs`, `/api/events`) to real engine services, enabling end-to-end mission execution, live event streaming, and board governance.

**Tech Stack:** TypeScript 5.9, Node.js, Vitest, SQLite WAL (`better-sqlite3`), Server-Sent Events (SSE), Git worktrees.

**Specs:**
- `docs/16-DATABASE-SCHEMA.md`
- `docs/13-EVENT-SYSTEM.md`
- `docs/14-DASHBOARD.md`
- `docs/06.5-ARCHITECTURAL-DECISIONS.md`

## Global Constraints
- Single authoritative owner for each state domain (TaskEngine owns tasks, Storage owns persistence).
- Zero raw secrets stored in database tables or emitted in events.
- All database operations must execute within SQLite transactions in WAL mode.
- All 91 existing tests must continue passing 100%.

---

### Task 1: Schema V2 Migration & Canonical Repositories in `@forge/storage`

**Files:**
- Create: `packages/storage/src/migrations/schema-v2.ts`
- Modify: `packages/storage/src/migrations/migrator.ts`
- Create: `packages/storage/src/repositories/event-repository.ts`
- Create: `packages/storage/src/repositories/approval-repository.ts`
- Create: `packages/storage/src/repositories/connection-repository.ts`
- Modify: `packages/storage/src/index.ts`
- Create: `packages/storage/tests/schema-v2-persistence.test.ts`

- [ ] **Step 1: Write failing test for Schema V2 migrations, EventRepository, ApprovalRepository, and ConnectionRepository**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `schema-v2.ts` with tables: `events`, `connections`, `approvals`, `artifacts`**
- [ ] **Step 4: Update `migrator.ts` to execute Schema V1 then V2**
- [ ] **Step 5: Implement `EventRepository`, `ApprovalRepository`, and `ConnectionRepository`**
- [ ] **Step 6: Run test to verify pass**
- [ ] **Step 7: Commit task**

---

### Task 2: EventStore Auto-Persistence in `@forge/core` & Event Bus

**Files:**
- Modify: `packages/core/src/events/event-bus.ts`
- Modify: `packages/core/tests/event-bus.test.ts`

- [ ] **Step 1: Write test for EventBus persistent sink hook**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement persistent storage listener on EventBus**
- [ ] **Step 4: Run test to verify pass**
- [ ] **Step 5: Commit task**

---

### Task 3: Paperclip Dashboard Live Engine Wiring (`14-DASHBOARD.md`)

**Files:**
- Modify: `packages/dashboard/src/server/dashboard-server.ts`
- Modify: `packages/dashboard/tests/dashboard.test.ts`

- [ ] **Step 1: Write failing tests for live ticket dispatch, board approval state machine, and worktree git diffs**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Wire `POST /api/tickets` to create real mission, allocate worktree, and emit live SSE**
- [ ] **Step 4: Wire `POST /api/approvals/:id/approve` and `reject` to `ApprovalRepository` and emit governance events**
- [ ] **Step 5: Wire `GET /api/diffs` to query real Git diff from active worktree**
- [ ] **Step 6: Run test to verify pass**
- [ ] **Step 7: Commit task**

---

### Task 4: Full Monorepo Build & Regression Test Check

- [ ] **Step 1: Run full test suite: `pnpm test`**
- [ ] **Step 2: Run full build: `pnpm build`**
- [ ] **Step 3: Final commit for Phase 8**
