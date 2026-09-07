# Phase 2: Task Engine & Capability Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@forge/task-engine` (authoritative DAG scheduler, cycle detector, FSM, and crash recovery lease sweeper) and `@forge/capability-resolver` (least-privilege policy evaluator and cryptographic ExecutionToken generator) satisfying AD-001, AD-008, AD-009, and AD-010.

**Architecture:** Create two new packages in the pnpm monorepo:
1. `packages/task-engine`: Consumes `@forge/core` and `@forge/storage`. Implements `TaskEngineService`, Kahn's algorithm DAG validator, deterministic Task FSM transition matrix, dependency satisfaction resolver emitting `task.ready`, concurrency governor (max 4 concurrent tasks), and heartbeat crash triage sweeper.
2. `packages/capability-resolver`: Evaluates intersection of Task, Agent, Skill, Tool, Runtime, and Security Policy. Mints verifiable `ExecutionToken` instances using HMAC-SHA256 signatures, enforcing least-privilege capability boundaries before tool/runtime dispatch.

**Tech Stack:** Node.js (v24.18.0), TypeScript (v5.x, NodeNext), pnpm, `@forge/core`, `@forge/storage`, Node `crypto` for HMAC-SHA256, Vitest.

**Spec:** `docs/01-MASTER-PRD.md`, `02-SYSTEM-ARCHITECTURE.md`, `06-TASK-ENGINE.md`, `06.5-ARCHITECTURAL-DECISIONS.md` (AD-001, AD-008, AD-009, AD-010).

## Global Constraints

- **Single Authoritative State Owner (AD-001)**: The Task Engine is the sole mutator of task state and dependencies in `@forge/storage`. No external component or LLM may alter task state directly.
- **Strict FSM Invariant (AD-001 / AD-010)**: Task state transitions must strictly conform to the lifecycle: `QUEUED -> RUNNING -> (PAUSED | CHECKPOINTING | RETRYING | COMPLETED | FAILED)`. Any illegal jump (e.g. `COMPLETED -> RUNNING` or unverified completion) must throw `TaskStateTransitionError`.
- **Durable Lease Invariant (AD-008)**: Running tasks must hold active leases with heartbeat renewal. Orphan or timed-out leases must be safely swept to `RETRYING` or `FAILED`.
- **Capability Gate Invariant (AD-009)**: Execution cannot commence without an `ExecutionToken` signed by `CapabilityResolver`. Permissions default to DENY unless explicitly permitted by Project Security Policy.

---

### Task 1: Build `@forge/task-engine` — DAG Validator, Cycle Detection & Task State Machine

**Files:**
- Create: `packages/task-engine/package.json`
- Create: `packages/task-engine/tsconfig.json`
- Create: `packages/task-engine/src/dag/dag-validator.ts`
- Create: `packages/task-engine/src/fsm/task-state-machine.ts`
- Create: `packages/task-engine/src/types/task-engine.ts`
- Create: `packages/task-engine/src/index.ts`
- Create: `packages/task-engine/tests/dag-validator.test.ts`
- Create: `packages/task-engine/tests/task-state-machine.test.ts`

**Interfaces:**
- Consumes: `@forge/core`, `@forge/storage`
- Produces:
  - `DagValidator.validateAcyclic(tasks: { id: string; dependencies: string[] }[]): { valid: boolean; cycle?: string[] }`
  - `TaskStateMachine.validateTransition(from: TaskStatus, to: TaskStatus): void`
  - `TaskStateMachine.canTransition(from: TaskStatus, to: TaskStatus): boolean`

- [ ] **Step 1: Create `packages/task-engine/package.json` & `tsconfig.json`**

`packages/task-engine/package.json`:
```json
{
  "name": "@forge/task-engine",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "dependencies": {
    "@forge/core": "workspace:*",
    "@forge/storage": "workspace:*"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

`packages/task-engine/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write failing unit tests for DagValidator and TaskStateMachine**

`packages/task-engine/tests/dag-validator.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { DagValidator } from "../src/dag/dag-validator.js";

describe("DagValidator", () => {
  it("validates an acyclic graph with dependencies", () => {
    const nodes = [
      { id: "A", dependencies: [] },
      { id: "B", dependencies: ["A"] },
      { id: "C", dependencies: ["A"] },
      { id: "D", dependencies: ["B", "C"] }
    ];

    const result = DagValidator.validateAcyclic(nodes);
    expect(result.valid).toBe(true);
    expect(result.cycle).toBeUndefined();
    expect(result.topologicalOrder).toEqual(["A", "B", "C", "D"]);
  });

  it("detects circular dependencies and reports the cycle", () => {
    const nodes = [
      { id: "A", dependencies: ["C"] },
      { id: "B", dependencies: ["A"] },
      { id: "C", dependencies: ["B"] }
    ];

    const result = DagValidator.validateAcyclic(nodes);
    expect(result.valid).toBe(false);
    expect(result.cycle).toBeDefined();
    expect(result.cycle?.length).toBeGreaterThan(0);
  });
});
```

`packages/task-engine/tests/task-state-machine.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { TaskStateMachine } from "../src/fsm/task-state-machine.js";
import { TaskStateTransitionError } from "@forge/core";

describe("TaskStateMachine", () => {
  it("allows valid lifecycle transitions", () => {
    expect(() => TaskStateMachine.validateTransition("QUEUED", "RUNNING")).not.toThrow();
    expect(() => TaskStateMachine.validateTransition("RUNNING", "COMPLETED")).not.toThrow();
    expect(() => TaskStateMachine.validateTransition("RUNNING", "FAILED")).not.toThrow();
    expect(() => TaskStateMachine.validateTransition("RUNNING", "RETRYING")).not.toThrow();
    expect(() => TaskStateMachine.validateTransition("RETRYING", "RUNNING")).not.toThrow();
  });

  it("rejects invalid transitions with TaskStateTransitionError", () => {
    expect(() => TaskStateMachine.validateTransition("COMPLETED", "RUNNING")).toThrow(TaskStateTransitionError);
    expect(() => TaskStateMachine.validateTransition("FAILED", "COMPLETED")).toThrow(TaskStateTransitionError);
    expect(() => TaskStateMachine.validateTransition("QUEUED", "COMPLETED")).toThrow(TaskStateTransitionError);
  });
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `pnpm --filter @forge/task-engine test`
Expected: FAIL with missing modules.

- [ ] **Step 4: Implement DagValidator & TaskStateMachine**

`packages/task-engine/src/dag/dag-validator.ts`:
```typescript
export interface DagNode {
  id: string;
  dependencies: string[];
}

export interface DagValidationResult {
  valid: boolean;
  cycle?: string[];
  topologicalOrder?: string[];
}

export class DagValidator {
  static validateAcyclic(nodes: DagNode[]): DagValidationResult {
    const nodeMap = new Map<string, DagNode>();
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const node of nodes) {
      nodeMap.set(node.id, node);
      inDegree.set(node.id, 0);
      adj.set(node.id, []);
    }

    for (const node of nodes) {
      for (const depId of node.dependencies) {
        if (!nodeMap.has(depId)) {
          return { valid: false, cycle: [node.id, depId] };
        }
        adj.get(depId)!.push(node.id);
        inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
      }
    }

    // Kahn's Algorithm
    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      order.push(u);

      for (const v of adj.get(u) || []) {
        const newDeg = inDegree.get(v)! - 1;
        inDegree.set(v, newDeg);
        if (newDeg === 0) {
          queue.push(v);
        }
      }
    }

    if (order.length !== nodes.length) {
      const unresolved = nodes.filter(n => (inDegree.get(n.id) || 0) > 0).map(n => n.id);
      return { valid: false, cycle: unresolved };
    }

    return { valid: true, topologicalOrder: order };
  }
}
```

`packages/task-engine/src/fsm/task-state-machine.ts`:
```typescript
import { TaskStatus, TaskStateTransitionError } from "@forge/core";

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  QUEUED: ["RUNNING", "PAUSED", "FAILED"],
  RUNNING: ["PAUSED", "CHECKPOINTING", "RETRYING", "COMPLETED", "FAILED"],
  PAUSED: ["RUNNING", "FAILED"],
  CHECKPOINTING: ["RUNNING", "FAILED"],
  RETRYING: ["RUNNING", "FAILED"],
  COMPLETED: [],
  FAILED: []
};

export class TaskStateMachine {
  static canTransition(from: TaskStatus, to: TaskStatus): boolean {
    const targets = ALLOWED_TRANSITIONS[from];
    return targets ? targets.includes(to) : false;
  }

  static validateTransition(from: TaskStatus, to: TaskStatus): void {
    if (!this.canTransition(from, to)) {
      throw new TaskStateTransitionError(from, to, `Transition from ${from} to ${to} is prohibited by task state machine`);
    }
  }
}
```

- [ ] **Step 5: Run tests and verify passing**

Run: `pnpm --filter @forge/task-engine test`
Expected: 100% PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/task-engine/
git commit -m "feat(task-engine): implement DAG acyclic validator and Task FSM transition engine"
```

---

### Task 2: Build `TaskEngineService` — Graph Proposal, Dependency Resolution & Lease Sweeper

**Files:**
- Create: `packages/task-engine/src/services/task-engine-service.ts`
- Modify: `packages/task-engine/src/index.ts`
- Create: `packages/task-engine/tests/task-engine-service.test.ts`

**Interfaces:**
- Consumes: `TaskRepository`, `LeaseRepository`, `EventBus`, `DagValidator`, `TaskStateMachine`
- Produces:
  - `TaskEngineService.proposeTaskGraph(missionId: string, graph: ProposedGraph): Promise<string[]>`
  - `TaskEngineService.transitionTask(taskId: string, newStatus: TaskStatus, outputPayload?: Record<string, unknown>): Promise<void>`
  - `TaskEngineService.getReadyTasks(missionId: string): TaskRecord[]`
  - `TaskEngineService.acquireTaskLease(taskId: string, agentId: string, runtimeId: string, workspacePath: string): TaskLease`
  - `TaskEngineService.renewHeartbeat(executionId: string): void`
  - `TaskEngineService.sweepExpiredLeases(): Promise<{ recoveredCount: number; failedCount: number }>`

- [ ] **Step 1: Write failing unit test for `TaskEngineService`**

`packages/task-engine/tests/task-engine-service.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForgeDatabase, runMigrations, TaskRepository, LeaseRepository } from "@forge/storage";
import { EventBus } from "@forge/core";
import { TaskEngineService } from "../src/services/task-engine-service.js";

describe("TaskEngineService", () => {
  let db: ForgeDatabase;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let eventBus: EventBus;
  let service: TaskEngineService;

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
    taskRepo = new TaskRepository(db);
    leaseRepo = new LeaseRepository(db);
    eventBus = new EventBus();
    service = new TaskEngineService(taskRepo, leaseRepo, eventBus);

    db.getRawDb().prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('p1', 'P1', '/tmp', 'now', 'now')").run();
    db.getRawDb().prepare("INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES ('m1', 'p1', 'M1', 'ACTIVE', 'now', 'now')").run();
  });

  afterEach(() => {
    db.close();
  });

  it("proposes a valid task graph and identifies ready tasks", async () => {
    const taskIds = await service.proposeTaskGraph("m1", [
      { id: "step-1", name: "Init", dependencies: [], inputPayload: {} },
      { id: "step-2", name: "Build", dependencies: ["step-1"], inputPayload: {} }
    ]);

    expect(taskIds).toEqual(["step-1", "step-2"]);

    // Initially, only step-1 has dependencies met
    const ready = service.getReadyTasks("m1");
    expect(ready.map(t => t.id)).toEqual(["step-1"]);

    // Transition step-1 to COMPLETED
    await service.transitionTask("step-1", "RUNNING");
    await service.transitionTask("step-1", "COMPLETED", { ok: true });

    // Now step-2 becomes ready
    const readyAfter = service.getReadyTasks("m1");
    expect(readyAfter.map(t => t.id)).toEqual(["step-2"]);
  });

  it("sweeps expired leases and handles retries or failures", async () => {
    await service.proposeTaskGraph("m1", [
      { id: "step-flaky", name: "Flaky Job", dependencies: [], inputPayload: {} }
    ]);

    const lease = service.acquireTaskLease("step-flaky", "agent.test", "native", "/tmp/ws");
    await service.transitionTask("step-flaky", "RUNNING");

    // Manually expire lease in DB
    const past = new Date(Date.now() - 60000).toISOString();
    db.getRawDb().prepare("UPDATE execution_leases SET lease_expires_at = ?, heartbeat_timestamp = ? WHERE execution_id = ?").run(past, past, lease.executionId);

    const sweepResult = await service.sweepExpiredLeases();
    expect(sweepResult.recoveredCount).toBe(1);

    const task = taskRepo.getTaskById("step-flaky");
    expect(task?.status).toBe("RETRYING");
    expect(task?.retryCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @forge/task-engine test`
Expected: FAIL with service not found.

- [ ] **Step 3: Implement `TaskEngineService`**

`packages/task-engine/src/services/task-engine-service.ts`:
```typescript
import { TaskRecord, TaskStatus, TaskLease, EventBus, InvariantViolationError } from "@forge/core";
import { TaskRepository, LeaseRepository } from "@forge/storage";
import { DagValidator, DagNode } from "../dag/dag-validator.js";
import { TaskStateMachine } from "../fsm/task-state-machine.js";
import { randomUUID } from "node:crypto";

export interface ProposedTask {
  id: string;
  name: string;
  dependencies: string[];
  inputPayload: Record<string, unknown>;
  priority?: number;
  maxRetries?: number;
  timeoutMs?: number;
  requireVerification?: boolean;
}

export class TaskEngineService {
  constructor(
    private taskRepo: TaskRepository,
    private leaseRepo: LeaseRepository,
    private eventBus: EventBus
  ) {}

  async proposeTaskGraph(missionId: string, tasks: ProposedTask[]): Promise<string[]> {
    const dagNodes: DagNode[] = tasks.map(t => ({
      id: t.id,
      dependencies: t.dependencies
    }));

    const validation = DagValidator.validateAcyclic(dagNodes);
    if (!validation.valid) {
      throw new InvariantViolationError("INVARIANT-001.1", `Proposed task graph contains circular dependencies: ${validation.cycle?.join(" -> ")}`);
    }

    const createdIds: string[] = [];
    const now = new Date().toISOString();

    for (const t of tasks) {
      const record: TaskRecord = {
        id: t.id,
        missionId,
        name: t.name,
        status: "QUEUED",
        priority: t.priority ?? 50,
        idempotencyKey: `idemp_${missionId}_${t.id}`,
        dependencies: t.dependencies,
        inputPayload: t.inputPayload,
        retryCount: 0,
        maxRetries: t.maxRetries ?? 3,
        timeoutMs: t.timeoutMs ?? 30000,
        requireVerification: t.requireVerification ?? true,
        createdAt: now,
        updatedAt: now
      };

      this.taskRepo.createTask(record);
      for (const depId of t.dependencies) {
        this.taskRepo.addDependency(t.id, depId);
      }
      createdIds.push(t.id);

      await this.eventBus.emit({
        id: randomUUID(),
        type: "task.created",
        timestamp: now,
        payload: { taskId: t.id, missionId }
      });
    }

    return createdIds;
  }

  getReadyTasks(missionId: string): TaskRecord[] {
    const allTasks = this.taskRepo.getTasksByMission(missionId);
    const completedIds = new Set(allTasks.filter(t => t.status === "COMPLETED").map(t => t.id));

    return allTasks.filter(task => {
      if (task.status !== "QUEUED") return false;
      return task.dependencies.every(depId => completedIds.has(depId));
    });
  }

  async transitionTask(taskId: string, targetStatus: TaskStatus, outputPayload?: Record<string, unknown>): Promise<void> {
    const task = this.taskRepo.getTaskById(taskId);
    if (!task) {
      throw new Error(`Task '${taskId}' not found`);
    }

    TaskStateMachine.validateTransition(task.status, targetStatus);
    this.taskRepo.updateTaskStatus(taskId, targetStatus, outputPayload);

    await this.eventBus.emit({
      id: randomUUID(),
      type: "task.transition",
      timestamp: new Date().toISOString(),
      payload: {
        taskId,
        missionId: task.missionId,
        from: task.status,
        to: targetStatus,
        outputPayload
      }
    });
  }

  acquireTaskLease(taskId: string, agentId: string, runtimeId: string, workspacePath: string, durationSeconds: number = 30): TaskLease {
    const task = this.taskRepo.getTaskById(taskId);
    if (!task) throw new Error(`Task '${taskId}' not found`);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationSeconds * 1000).toISOString();
    const executionId = `exec_${randomUUID()}`;

    const lease: TaskLease = {
      executionId,
      taskId,
      agentId,
      runtimeId,
      workspacePath,
      heartbeatTimestamp: now.toISOString(),
      leaseDurationSeconds: durationSeconds,
      leaseExpiresAt: expiresAt,
      status: "ACTIVE"
    };

    this.leaseRepo.acquireLease(lease);
    return lease;
  }

  renewHeartbeat(executionId: string, durationSeconds: number = 30): void {
    this.leaseRepo.renewHeartbeat(executionId, durationSeconds);
  }

  async sweepExpiredLeases(): Promise<{ recoveredCount: number; failedCount: number }> {
    const expiredLeases = this.leaseRepo.getExpiredActiveLeases();
    let recoveredCount = 0;
    let failedCount = 0;

    for (const lease of expiredLeases) {
      this.leaseRepo.expireLease(lease.executionId);
      const task = this.taskRepo.getTaskById(lease.taskId);
      if (!task) continue;

      if (task.retryCount + 1 <= task.maxRetries) {
        this.taskRepo.incrementRetry(task.id);
        await this.transitionTask(task.id, "RETRYING");
        recoveredCount++;
      } else {
        await this.transitionTask(task.id, "FAILED", { error: "Max retries exceeded due to repeated execution timeouts" });
        failedCount++;
      }
    }

    return { recoveredCount, failedCount };
  }
}
```

`packages/task-engine/src/index.ts`:
```typescript
export * from "./dag/dag-validator.js";
export * from "./fsm/task-state-machine.js";
export * from "./services/task-engine-service.js";
```

- [ ] **Step 4: Run tests and build**

Run: `pnpm --filter @forge/task-engine test && pnpm --filter @forge/task-engine build`
Expected: 100% PASS, clean TypeScript compilation.

- [ ] **Step 5: Commit**

```bash
git add packages/task-engine/
git commit -m "feat(task-engine): implement TaskEngineService with dependency resolution and crash lease sweeper"
```

---

### Task 3: Build `@forge/capability-resolver` — Least-Privilege Gatekeeper & ExecutionToken Minting

**Files:**
- Create: `packages/capability-resolver/package.json`
- Create: `packages/capability-resolver/tsconfig.json`
- Create: `packages/capability-resolver/src/types/policy.ts`
- Create: `packages/capability-resolver/src/services/capability-resolver.ts`
- Create: `packages/capability-resolver/src/index.ts`
- Create: `packages/capability-resolver/tests/capability-resolver.test.ts`

**Interfaces:**
- Consumes: `@forge/core`
- Produces:
  - `SecurityPolicy`: Defines allowed tools, restricted filepaths, and trust level floors
  - `CapabilityResolver.resolve(context: ResolutionContext): ResolutionDecision`
  - `ResolutionDecision`: `{ allowed: boolean; token?: ExecutionToken; reason?: string; requiresApproval?: boolean }`
  - `CapabilityResolver.verifyToken(token: ExecutionToken): boolean`

- [ ] **Step 1: Create `packages/capability-resolver/package.json` & `tsconfig.json`**

`packages/capability-resolver/package.json`:
```json
{
  "name": "@forge/capability-resolver",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "dependencies": {
    "@forge/core": "workspace:*"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

`packages/capability-resolver/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write failing unit test for `CapabilityResolver`**

`packages/capability-resolver/tests/capability-resolver.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { CapabilityResolver } from "../src/services/capability-resolver.js";
import { SecurityPolicy } from "../src/types/policy.js";

describe("CapabilityResolver", () => {
  const secretKey = "forge-secret-signing-key";
  const policy: SecurityPolicy = {
    projectId: "p1",
    allowedTools: ["filesystem.read", "filesystem.write", "git.status"],
    forbiddenTools: ["shell.rm_rf", "cloud.deploy"],
    minTrustLevel: "L1",
    requireApprovalForTools: ["filesystem.write"]
  };

  const resolver = new CapabilityResolver(secretKey, policy);

  it("issues a signed ExecutionToken when all capabilities are permitted", () => {
    const decision = resolver.resolve({
      taskId: "task-1",
      agentId: "agent.coder",
      runtimeId: "claude-code",
      runtimeTrustLevel: "L1",
      requestedTools: ["filesystem.read", "git.status"],
      workspacePath: "/workspace/worktrees/task-1"
    });

    expect(decision.allowed).toBe(true);
    expect(decision.token).toBeDefined();
    expect(decision.requiresApproval).toBe(false);

    const isValid = resolver.verifyToken(decision.token!);
    expect(isValid).toBe(true);
  });

  it("detects when human approval is required for sensitive tools", () => {
    const decision = resolver.resolve({
      taskId: "task-2",
      agentId: "agent.coder",
      runtimeId: "claude-code",
      runtimeTrustLevel: "L1",
      requestedTools: ["filesystem.write"],
      workspacePath: "/workspace/worktrees/task-2"
    });

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });

  it("denies execution when requested tool is forbidden or unlisted", () => {
    const decision = resolver.resolve({
      taskId: "task-3",
      agentId: "agent.rogue",
      runtimeId: "claude-code",
      runtimeTrustLevel: "L1",
      requestedTools: ["shell.rm_rf"],
      workspacePath: "/workspace/worktrees/task-3"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.token).toBeUndefined();
    expect(decision.reason).toContain("forbidden");
  });

  it("denies execution when runtime trust level falls below policy floor", () => {
    const strictPolicy: SecurityPolicy = {
      ...policy,
      minTrustLevel: "L3" // Requires container sandbox
    };
    const strictResolver = new CapabilityResolver(secretKey, strictPolicy);

    const decision = strictResolver.resolve({
      taskId: "task-4",
      agentId: "agent.coder",
      runtimeId: "untrusted-cli",
      runtimeTrustLevel: "L1",
      requestedTools: ["filesystem.read"],
      workspacePath: "/workspace/worktrees/task-4"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Trust level");
  });
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `pnpm --filter @forge/capability-resolver test`
Expected: FAIL with resolver not found.

- [ ] **Step 4: Implement `CapabilityResolver`**

`packages/capability-resolver/src/types/policy.ts`:
```typescript
import { TrustLevel } from "@forge/core";

export interface SecurityPolicy {
  projectId: string;
  allowedTools: string[];
  forbiddenTools: string[];
  minTrustLevel: TrustLevel;
  requireApprovalForTools: string[];
}

export interface ResolutionContext {
  taskId: string;
  agentId: string;
  runtimeId: string;
  runtimeTrustLevel: TrustLevel;
  requestedTools: string[];
  workspacePath: string;
}

export interface ResolutionDecision {
  allowed: boolean;
  requiresApproval: boolean;
  token?: {
    tokenId: string;
    taskId: string;
    agentId: string;
    runtimeId: string;
    workspacePath: string;
    allowedTools: string[];
    issuedAt: string;
    expiresAt: string;
    signature: string;
  };
  reason?: string;
}
```

`packages/capability-resolver/src/services/capability-resolver.ts`:
```typescript
import { ExecutionToken, TrustLevel } from "@forge/core";
import { SecurityPolicy, ResolutionContext, ResolutionDecision } from "../types/policy.js";
import { createHmac, randomUUID } from "node:crypto";

const TRUST_LEVEL_RANK: Record<TrustLevel, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4
};

export class CapabilityResolver {
  constructor(
    private secretSigningKey: string,
    private policy: SecurityPolicy
  ) {}

  resolve(ctx: ResolutionContext, validitySeconds: number = 300): ResolutionDecision {
    // 1. Validate Runtime Trust Level Floor
    const runtimeRank = TRUST_LEVEL_RANK[ctx.runtimeTrustLevel];
    const minRank = TRUST_LEVEL_RANK[this.policy.minTrustLevel];

    if (runtimeRank < minRank) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: `Trust level '${ctx.runtimeTrustLevel}' does not meet required policy minimum '${this.policy.minTrustLevel}'`
      };
    }

    // 2. Validate forbidden tools
    for (const tool of ctx.requestedTools) {
      if (this.policy.forbiddenTools.includes(tool)) {
        return {
          allowed: false,
          requiresApproval: false,
          reason: `Tool '${tool}' is forbidden by project security policy`
        };
      }
    }

    // 3. Validate allowed tools (Least Privilege)
    for (const tool of ctx.requestedTools) {
      if (!this.policy.allowedTools.includes(tool)) {
        return {
          allowed: false,
          requiresApproval: false,
          reason: `Tool '${tool}' is not in policy allowlist`
        };
      }
    }

    // 4. Check if human approval is required
    const requiresApproval = ctx.requestedTools.some(tool =>
      this.policy.requireApprovalForTools.includes(tool)
    );

    // 5. Mint ExecutionToken
    const now = new Date();
    const expiresAt = new Date(now.getTime() + validitySeconds * 1000).toISOString();
    const tokenId = `tok_${randomUUID()}`;

    const payloadToSign = `${tokenId}:${ctx.taskId}:${ctx.agentId}:${ctx.runtimeId}:${ctx.workspacePath}:${ctx.requestedTools.join(",")}:${expiresAt}`;
    const signature = createHmac("sha256", this.secretSigningKey).update(payloadToSign).digest("hex");

    const token: ExecutionToken = {
      tokenId,
      taskId: ctx.taskId,
      agentId: ctx.agentId,
      runtimeId: ctx.runtimeId,
      workspacePath: ctx.workspacePath,
      allowedTools: ctx.requestedTools,
      issuedAt: now.toISOString(),
      expiresAt,
      signature
    };

    return {
      allowed: true,
      requiresApproval,
      token
    };
  }

  verifyToken(token: ExecutionToken): boolean {
    const now = new Date().toISOString();
    if (token.expiresAt < now) return false;

    const payloadToSign = `${token.tokenId}:${token.taskId}:${token.agentId}:${token.runtimeId}:${token.workspacePath}:${token.allowedTools.join(",")}:${token.expiresAt}`;
    const expectedSignature = createHmac("sha256", this.secretSigningKey).update(payloadToSign).digest("hex");

    return token.signature === expectedSignature;
  }
}
```

`packages/capability-resolver/src/index.ts`:
```typescript
export * from "./types/policy.js";
export * from "./services/capability-resolver.js";
```

- [ ] **Step 5: Run tests and build**

Run: `pnpm --filter @forge/capability-resolver test && pnpm --filter @forge/capability-resolver build`
Expected: 100% PASS, clean TypeScript compilation.

- [ ] **Step 6: Commit**

```bash
git add packages/capability-resolver/
git commit -m "feat(capability-resolver): implement security policy evaluator and ExecutionToken minting"
```

---

### Task 4: End-to-End System Gate Integration & Monorepo Verification

**Files:**
- Create: `packages/task-engine/tests/e2e-nervous-system.test.ts`

**Interfaces:**
- Consumes: `@forge/core`, `@forge/storage`, `@forge/task-engine`, `@forge/capability-resolver`
- Produces: Integrated end-to-end test suite proving deterministic scheduling, lease management, and capability token gate

- [ ] **Step 1: Write comprehensive integration test**

Simulate:
1. Propose DAG (A -> B).
2. CapabilityResolver gates task A -> generates valid `ExecutionToken`.
3. Task A acquires lease, updates to RUNNING.
4. Heartbeat renewal during execution.
5. Task A completes -> Task B automatically transitions to READY in `TaskEngineService`.
6. CapabilityResolver rejects a rogue task requesting `shell.rm_rf`.
7. Stale task leases are cleanly swept and triaged to RETRYING.

- [ ] **Step 2: Run full monorepo test suite & build**

Run: `pnpm test && pnpm build`
Expected: All tests across `@forge/core`, `@forge/storage`, `@forge/task-engine`, and `@forge/capability-resolver` pass 100%.

- [ ] **Step 3: Commit**

```bash
git add packages/task-engine/tests/e2e-nervous-system.test.ts
git commit -m "test: add Phase 2 end-to-end integration and security gate validation"
```
