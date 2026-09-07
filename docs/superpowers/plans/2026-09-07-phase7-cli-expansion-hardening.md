# Phase 7: CLI Expansion & Hardening (15-CLI-SPECIFICATION) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand and harden the Forge CLI (`@forge/cli`) to implement canonical commands: `forge discovery`, `forge connections`, `forge resume`, and `forge dlq`, and wire runtime and provider routing options into `forge run`.

**Architecture:** Integrate `@forge/runtime-engine` (Runtime Discovery Coordinator), `@forge/auth-connections` (Connection Manager & Secret Redaction), and `@forge/task-engine` (Lease & DLQ) directly into the CLI commands with clean terminal formatting and JSON output support.

**Tech Stack:** TypeScript 5.9, Node.js, Vitest, CAC / CLI command handlers, SQLite WAL storage.

**Specs:**
- `docs/15-CLI-SPECIFICATION.md`
- `docs/08-RUNTIME-DISCOVERY.md`
- `docs/10-AUTH-CONNECTIONS.md`
- `docs/06-TASK-ENGINE.md`

## Global Constraints
- `forge discovery` must execute non-destructive probes only (zero side-effects).
- `forge connections` must NEVER output raw secrets or credentials on the terminal (use `[REDACTED_SECRET]` or masked URI).
- All commands must support `--json` flag for machine-readable output.
- All 86 existing tests across the 28 test suites must continue passing 100%.

---

### Task 1: CLI Package Dependencies & Scaffolding

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Add `@forge/runtime-engine`, `@forge/auth-connections`, `@forge/provider-router`, and `@forge/capability-resolver` to `packages/cli/package.json`**
- [ ] **Step 2: Run `pnpm install` to link workspace dependencies**
- [ ] **Step 3: Export new command types and functions in `packages/cli/src/index.ts`**

---

### Task 2: Implement `forge discovery` Command

**Files:**
- Create: `packages/cli/src/commands/discovery.ts`
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/tests/cli.test.ts`

**Interfaces:**
- Consumes: `@forge/runtime-engine` (`RuntimeDiscoveryCoordinator`, `NativeDetector`, `ClaudeCodeDetector`, `AntigravityDetector`)
- Produces: `discoveryCommand(opts?: { json?: boolean }): Promise<DiscoveryCommandResult>`

- [ ] **Step 1: Write failing test for `forge discovery` (table & JSON format)**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `discoveryCommand` in `packages/cli/src/commands/discovery.ts`**
- [ ] **Step 4: Wire `discovery` command into `runCli` in `packages/cli/src/cli.ts`**
- [ ] **Step 5: Run test to verify pass**
- [ ] **Step 6: Commit task**

---

### Task 3: Implement `forge connections` Command

**Files:**
- Create: `packages/cli/src/commands/connections.ts`
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/tests/cli.test.ts`

**Interfaces:**
- Consumes: `@forge/auth-connections` (`ConnectionManager`, `ConnectionRecord`)
- Produces: `connectionsCommand(subcommand: 'list' | 'add' | 'test', args?: Record<string, string>): Promise<ConnectionsCommandResult>`

- [ ] **Step 1: Write failing test for `forge connections` (list and test subcommands)**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `connectionsCommand` with secret redaction and health check**
- [ ] **Step 4: Wire `connections` command into `runCli`**
- [ ] **Step 5: Run test to verify pass**
- [ ] **Step 6: Commit task**

---

### Task 4: Implement `forge resume` and `forge dlq` Commands

**Files:**
- Create: `packages/cli/src/commands/resume.ts`
- Create: `packages/cli/src/commands/dlq.ts`
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/tests/cli.test.ts`

**Interfaces:**
- Consumes: `@forge/task-engine`, `@forge/storage`, `@forge/orchestration-engine`
- Produces: `resumeCommand(opts: { missionId: string }): Promise<ResumeResult>`, `dlqCommand(opts?: { inspectTaskId?: string }): Promise<DLQResult>`

- [ ] **Step 1: Write failing test for `forge resume` and `forge dlq`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `resumeCommand` (rehydrates mission state, skips already verified nodes)**
- [ ] **Step 4: Implement `dlqCommand` (lists failed tasks with exhausted retries, inspects error traces)**
- [ ] **Step 5: Wire `resume` and `dlq` into `runCli`**
- [ ] **Step 6: Run test to verify pass**
- [ ] **Step 7: Commit task**

---

### Task 5: Full Monorepo Build & Regression Test Check

- [ ] **Step 1: Run full test suite: `pnpm test`**
- [ ] **Step 2: Run full build: `pnpm build`**
- [ ] **Step 3: Verify CLI binary invocation via node**
- [ ] **Step 4: Final commit for Phase 7**
