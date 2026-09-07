# Phase 5: Verification Engine, Multi-Agent Orchestrator & CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@forge/verification-engine` (Layer 1 deterministic verification + Layer 2 semantic review, `VerificationEvidence`, completion policies), `@forge/orchestration-engine` (mission planning, multi-agent coordination loop, circuit breaker & self-healing, sequential worktree merging), and `@forge/cli` (command line interface for `init`, `run`, `status`, `verify`) fulfilling the full vision of Forge Wanzz.

**Architecture:** Create three modular packages:
1. `packages/verification-engine`: Implements mandatory deterministic Layer 1 automated checks (linters, typecheckers, test runners, exit code enforcement) and probabilistic Layer 2 semantic reviewers. Generates cryptographic/structured `VerificationEvidence`. Enforces AD-005: an agent saying "Done" NEVER completes a task without proof.
2. `packages/orchestration-engine`: The central coordination nervous system. Takes user missions, generates task graph proposals for `TaskEngineService` (AD-001), requests team formation from `OrganizationManager` (AD-002), allocates isolated Git Worktrees via `WorkspaceManager` (AD-007), coordinates inference via `ProviderRouter` (AD-003), dispatches tasks to `AgentInstance`s with Tier 2 skills via `SkillEngineService` (AD-006), subjects outputs to `VerificationEngine` (AD-005), and merges validated worktrees sequentially.
3. `packages/cli`: Executable binary (`bin/forge.js`) providing user commands: `forge init`, `forge run <mission>`, `forge status`, and `forge verify <task>`.

**Tech Stack:** Node.js (v24.18.0), TypeScript (v5.x, NodeNext), pnpm, `@forge/core`, `@forge/storage`, `@forge/task-engine`, `@forge/capability-resolver`, `@forge/workspace`, `@forge/tool-engine`, `@forge/runtime-engine`, `@forge/provider-router`, `@forge/skill-engine`, `@forge/org-manager`, `@forge/agent-system`, Vitest.

**Spec:** `docs/00-PRODUCT-THESIS.md`, `01-MASTER-PRD.md`, `02-SYSTEM-ARCHITECTURE.md`, `05-ORCHESTRATION-ENGINE.md`, `06.5-ARCHITECTURAL-DECISIONS.md` (AD-001 through AD-010).

## Global Constraints

- **Deterministic Supremacy (AD-005)**: `INVARIANT-005.1`: A non-zero exit code from Layer 1 automated checks immediately fails verification; zero human or LLM agent override allowed. `INVARIANT-005.2`: No task requiring verification can complete without an authoritative `VerificationEvidence` record with `passed: true`.
- **Task Engine Authority (AD-001)**: The Orchestrator proposes task graphs, acquires leases, and requests state transitions; only the Task Engine mutates and persists state.
- **Organization Boundary (AD-002)**: The Orchestrator requests roles/capabilities; the Organization Manager provisions agents.
- **Sequential Integration Merge (AD-007)**: Verified worktrees are merged sequentially into the target branch to prevent git index conflicts.

---

### Task 1: Build `@forge/verification-engine` — Dual-Layer Verification & Evidence Issuer

**Files:**
- Create: `packages/verification-engine/package.json`
- Create: `packages/verification-engine/tsconfig.json`
- Create: `packages/verification-engine/src/types/verification.ts`
- Create: `packages/verification-engine/src/services/deterministic-verifier.ts`
- Create: `packages/verification-engine/src/services/verification-service.ts`
- Create: `packages/verification-engine/src/index.ts`
- Create: `packages/verification-engine/tests/verification-engine.test.ts`

**Interfaces:**
- Consumes: `@forge/core`, `@forge/tool-engine`
- Produces:
  - `VerificationService.verifyDeterministic(input: DeterministicVerifyInput): Promise<VerificationEvidence>`
  - `VerificationService.verifyTask(taskId: string, policy: CompletionPolicy, checkCommands: CheckCommand[]): Promise<VerificationEvidence>`

- [ ] **Step 1: Create `packages/verification-engine/package.json` & `tsconfig.json`**
- [ ] **Step 2: Write failing unit test for `VerificationService`**
- [ ] **Step 3: Run test to verify failure**
- [ ] **Step 4: Implement `DeterministicVerifier` and `VerificationService`**
- [ ] **Step 5: Run tests and verify build passing**
- [ ] **Step 6: Git commit Task 1**

---

### Task 2: Build `@forge/orchestration-engine` — Multi-Agent Coordinator, Coordination Loop & Self-Healing

**Files:**
- Create: `packages/orchestration-engine/package.json`
- Create: `packages/orchestration-engine/tsconfig.json`
- Create: `packages/orchestration-engine/src/types/orchestration.ts`
- Create: `packages/orchestration-engine/src/services/mission-planner.ts`
- Create: `packages/orchestration-engine/src/services/orchestrator-service.ts`
- Create: `packages/orchestration-engine/src/index.ts`
- Create: `packages/orchestration-engine/tests/orchestrator-service.test.ts`

**Interfaces:**
- Consumes: All upstream packages (`@forge/core`, `@forge/storage`, `@forge/task-engine`, `@forge/capability-resolver`, `@forge/workspace`, `@forge/tool-engine`, `@forge/runtime-engine`, `@forge/provider-router`, `@forge/skill-engine`, `@forge/org-manager`, `@forge/agent-system`, `@forge/verification-engine`)
- Produces:
  - `OrchestratorService.startMission(mission: MissionSpec): Promise<MissionResult>`
  - `OrchestratorService.executeNextStep(missionId: string): Promise<StepExecutionResult>`
  - `OrchestratorService.getMissionStatus(missionId: string): MissionStatus`

- [ ] **Step 1: Create `packages/orchestration-engine/package.json` & `tsconfig.json`**
- [ ] **Step 2: Write failing unit test for `OrchestratorService`**
- [ ] **Step 3: Run test to verify failure**
- [ ] **Step 4: Implement `MissionPlanner` and `OrchestratorService`**
- [ ] **Step 5: Run tests and verify build passing**
- [ ] **Step 6: Git commit Task 2**

---

### Task 3: Build `@forge/cli` — Human Operator Interface & Factory Command Center

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/commands/run.ts`
- Create: `packages/cli/src/commands/status.ts`
- Create: `packages/cli/src/commands/verify.ts`
- Create: `packages/cli/src/cli.ts`
- Create: `packages/cli/bin/forge.js`
- Create: `packages/cli/tests/cli.test.ts`

**Interfaces:**
- Consumes: `@forge/orchestration-engine`, `@forge/storage`
- Produces:
  - CLI commands: `forge init`, `forge run <mission>`, `forge status`, `forge verify <task>`

- [ ] **Step 1: Create `packages/cli/package.json` & `tsconfig.json`**
- [ ] **Step 2: Write failing unit test for CLI command handlers**
- [ ] **Step 3: Run test to verify failure**
- [ ] **Step 4: Implement CLI commands and runner**
- [ ] **Step 5: Run tests and verify build passing**
- [ ] **Step 6: Git commit Task 3**

---

### Task 4: End-to-End Software Factory Integration Verification

**Files:**
- Create: `packages/orchestration-engine/tests/software-factory-e2e.test.ts`

**Verification:**
- Full system execution:
  1. Initialize factory workspace with Git repo and SQLite DB.
  2. Orchestrator accepts user mission: "Build a validated calculator module in TypeScript".
  3. Planner proposes 2-step DAG: Step 1 (create math.ts), Step 2 (create math.test.ts & verify).
  4. Org Manager provisions Supervisor & Worker Coder.
  5. Worktree allocated on private branch for Worker Coder.
  6. Worker Coder generates source files.
  7. Verification Engine executes Layer 1 checks: `npx vitest run` / deterministic validation.
  8. Output verifies exit code 0; `VerificationEvidence` issued with `passed: true`.
  9. Sequential merge into main branch.
  10. Task marked `COMPLETED` in authoritative SQLite Task Engine.

- [ ] **Step 1: Write `packages/orchestration-engine/tests/software-factory-e2e.test.ts`**
- [ ] **Step 2: Run complete monorepo test suite & build (`pnpm test && pnpm build`)**
- [ ] **Step 3: Git commit Task 4**
