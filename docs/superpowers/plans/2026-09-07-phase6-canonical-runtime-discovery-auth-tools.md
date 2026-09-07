# Phase 6: Canonical Subsystems Deep Alignment (Docs 08–11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and upgrade Forge Wanzz to achieve 100% compliance with canonical specifications: `08-RUNTIME-DISCOVERY.md`, `09-PROVIDER-ROUTER.md`, `10-AUTH-CONNECTIONS.md`, and `11-TOOL-EXECUTION.md`, while preserving existing 69 passing tests and the Paperclip OS Dashboard.

**Architecture:** Extend existing monorepo packages with dedicated domain modules: add Runtime Discovery (coordinator, detectors, profiling) to `@forge/runtime-engine`, add hard-constraint filtering and non-silent fallback auditing to `@forge/provider-router`, introduce `@forge/auth-connections` (connection registry, secret redaction, `secret://` URI resolver, L1 opaque runtime auth observer), and harden `@forge/tool-engine` with 4-tier risk classification, human approval gates, workspace boundary confinement, and SSRF protection.

**Tech Stack:** TypeScript 5.9, Node.js, Vitest, SQLite WAL, cryptographic SHA-256 tokens.

**Specs:**
- `docs/08-RUNTIME-DISCOVERY.md`
- `docs/09-PROVIDER-ROUTER.md`
- `docs/10-AUTH-CONNECTIONS.md`
- `docs/11-TOOL-EXECUTION.md`

## Global Constraints
- `Credential ≠ Connection ≠ Capability ≠ Permission ≠ Trust Class ≠ Authorization ≠ Execution ≠ Verification`
- Raw secrets must never appear in tasks, logs, events, artifacts, Git, or stdout/stderr.
- No silent model downgrades: fallback events must explicitly log capability degradation in audit metadata.
- Runtimes with Trust Class L1 (e.g. Claude Code, Antigravity) are opaque external processes; Forge discovers their auth status without pretending to manage internal credentials.
- Tool actions with `CRITICAL` risk require human approval gate (`APPROVAL_REQUIRED`) before execution.
- Tool file writes must strictly be confined to the authorized Git worktree root (no `../` traversal).
- HTTP requests must block loopback (`127.0.0.1`, `localhost`) and private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`) unless explicitly permitted by policy.

---

### Task 1: Auth & Connections (`@forge/auth-connections`) — Secret Redaction & Connection Management

**Files:**
- Create: `packages/auth-connections/package.json`
- Create: `packages/auth-connections/tsconfig.json`
- Create: `packages/auth-connections/src/types.ts`
- Create: `packages/auth-connections/src/secret-redactor.ts`
- Create: `packages/auth-connections/src/connection-manager.ts`
- Create: `packages/auth-connections/src/index.ts`
- Create: `packages/auth-connections/tests/auth-connections.test.ts`

**Interfaces:**
- Consumes: `@forge/core` (`Result`, `DomainError`, `EventBus`)
- Produces: `ConnectionManager`, `SecretRedactor`, `ConnectionRecord`, `AuthType`, `ConnectionStatus`

- [ ] **Step 1: Create package scaffolding for `@forge/auth-connections`**
- [ ] **Step 2: Write failing unit tests for ConnectionManager and SecretRedactor**
- [ ] **Step 3: Run tests to verify failure**
- [ ] **Step 4: Implement `SecretRedactor` (scrubs raw secrets, matches secret references like `secret://...`)**
- [ ] **Step 5: Implement `ConnectionManager` (register, validate, health-check, refresh, opaque CLI auth probe)**
- [ ] **Step 6: Run tests to verify pass**
- [ ] **Step 7: Commit task**

---

### Task 2: Runtime Discovery (`08-RUNTIME-DISCOVERY`) in `@forge/runtime-engine`

**Files:**
- Create: `packages/runtime-engine/src/discovery/types.ts`
- Create: `packages/runtime-engine/src/discovery/detectors/base-detector.ts`
- Create: `packages/runtime-engine/src/discovery/detectors/native-detector.ts`
- Create: `packages/runtime-engine/src/discovery/detectors/claude-code-detector.ts`
- Create: `packages/runtime-engine/src/discovery/detectors/antigravity-detector.ts`
- Create: `packages/runtime-engine/src/discovery/runtime-discovery-coordinator.ts`
- Modify: `packages/runtime-engine/src/index.ts`
- Create: `packages/runtime-engine/tests/runtime-discovery.test.ts`

**Interfaces:**
- Consumes: `@forge/core`, `@forge/auth-connections`
- Produces: `RuntimeDiscoveryCoordinator`, `RuntimeDetectionResult`, `RuntimeCapabilities`, `TrustProfile`

- [ ] **Step 1: Write failing tests for `RuntimeDiscoveryCoordinator`**
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement detectors with non-destructive version and executable probing**
- [ ] **Step 4: Implement `RuntimeDiscoveryCoordinator` with status distinctions (`Detected`, `Installed`, `Authenticated`, `Available`, `Authorized`)**
- [ ] **Step 5: Run tests to verify pass**
- [ ] **Step 6: Commit task**

---

### Task 3: Provider Router Hard Constraints & Non-Silent Fallback (`09-PROVIDER-ROUTER`)

**Files:**
- Modify: `packages/provider-router/src/types.ts`
- Modify: `packages/provider-router/src/provider-router.ts`
- Modify: `packages/provider-router/tests/provider-router.test.ts`

**Interfaces:**
- Consumes: `@forge/core`
- Produces: `HardConstraintFilter`, `ScoredCandidate`, `FallbackAuditRecord`, `RouteDecision`

- [ ] **Step 1: Write failing tests for hard constraint filtering (context window, tool call support, json schema) and fallback audit logging**
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement hard constraint evaluator and non-silent downgrade warning metadata**
- [ ] **Step 4: Run tests to verify pass**
- [ ] **Step 5: Commit task**

---

### Task 4: Tool Risk Gates, SSRF Filter & Workspace Jail (`11-TOOL-EXECUTION`)

**Files:**
- Modify: `packages/tool-engine/src/types.ts`
- Create: `packages/tool-engine/src/guards/workspace-jail.ts`
- Create: `packages/tool-engine/src/guards/ssrf-filter.ts`
- Modify: `packages/tool-engine/src/tool-execution-engine.ts`
- Modify: `packages/tool-engine/tests/tool-execution-engine.test.ts`

**Interfaces:**
- Consumes: `@forge/core`, `@forge/auth-connections`
- Produces: `ToolRiskLevel` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), `WorkspaceJail`, `SSRFGuard`, `ApprovalRequiredResult`

- [ ] **Step 1: Write failing tests for `CRITICAL` risk approval gating, path traversal prevention, and SSRF rejection**
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement `WorkspaceJail` (strictly contains reads/writes to worktree root)**
- [ ] **Step 4: Implement `SSRFGuard` (blocks private IP ranges unless explicitly whitelisted)**
- [ ] **Step 5: Implement Risk Classification and `CRITICAL` approval gate in `ToolExecutionEngine`**
- [ ] **Step 6: Run tests to verify pass**
- [ ] **Step 7: Commit task**

---

### Task 5: End-to-End System Integration & Verification

**Files:**
- Modify: `packages/cli/src/commands/run.ts`
- Create: `packages/orchestration-engine/tests/canonical-subsystems-e2e.test.ts`

- [ ] **Step 1: Write comprehensive integration test covering Discovery -> Connection -> Routing -> Token -> Risk-Gated Tool Execution**
- [ ] **Step 2: Run full monorepo test suite with `pnpm test`**
- [ ] **Step 3: Run full build with `pnpm build`**
- [ ] **Step 4: Verify Paperclip Dashboard retains full functionality**
- [ ] **Step 5: Final commit for Phase 6**
