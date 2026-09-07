# Phase 1: Core Foundation & SQLite Storage Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the Forge Wanzz v0.1 modular monolith repository, foundational domain types, strongly-typed event bus, and SQLite WAL persistent state ledger under strict ACID guarantees.

**Architecture:** Initialize a TypeScript monorepo with `pnpm workspaces`. Build `@forge/core` containing canonical domain types, custom invariant errors, and typed pub/sub event bus. Build `@forge/storage` implementing the single-owner SQLite engine (using Node 24 native `node:sqlite`), automated migration runner, repository implementations for tasks, missions, leases, and append-only audit logs.

**Tech Stack:** Node.js (v24.18.0), TypeScript (v5.x, NodeNext), pnpm (v12.3.4), `node:sqlite` (Native WAL mode & busy_timeout=5000ms), Vitest for TDD.

**Spec:** `docs/00-PRODUCT-THESIS.md`, `01-MASTER-PRD.md`, `02-SYSTEM-ARCHITECTURE.md`, `06.5-ARCHITECTURAL-DECISIONS.md`, `06-TASK-ENGINE.md`

## Global Constraints

- Monorepo package naming convention must strictly match `@forge/<subsystem>` (as per `02-SYSTEM-ARCHITECTURE.md` and `06.5-ARCHITECTURAL-DECISIONS.md`).
- SQLite MUST be operated in WAL mode with `PRAGMA journal_mode = WAL`, `PRAGMA busy_timeout = 5000`, and `PRAGMA foreign_keys = ON` (Invariant AD-001 / AD-008).
- Single Authoritative Ownership: Only `@forge/storage` interacts directly with SQLite; other engines consume domain repositories and contracts.
- Strictly pure ESM modules (`"type": "module"`) with `.ts` source files and strict type-checking (`noImplicitAny`, `strictNullChecks`).
- Zero unverified completion: All tasks must be backed by automated test suites executed via Vitest.

---

### Task 1: Initialize Git Repository, Monorepo Scaffolding & Root Configuration

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`

**Interfaces:**
- Consumes: Host OS commands (`git init`, `pnpm install`)
- Produces: Root workspace configuration enabling `packages/core` and `packages/storage`

- [ ] **Step 1: Initialize Git repository**

Run: `git init`
Expected: `Initialized empty Git repository`

- [ ] **Step 2: Create root `.gitignore`**

```gitignore
node_modules/
dist/
*.log
.DS_Store
*.tsbuildinfo
.forge/worktrees/
.forge/db/
coverage/
```

- [ ] **Step 3: Create root `package.json`**

```json
{
  "name": "forge-wanzz",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r run build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r run typecheck"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^3.0.7",
    "@types/node": "^24.0.0"
  }
}
```

- [ ] **Step 4: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 5: Create root `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 6: Create `vitest.workspace.ts`**

```typescript
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/*"
]);
```

- [ ] **Step 7: Run `pnpm install` and verify root setup**

Run: `pnpm install`
Expected: dependencies resolved cleanly without error.

- [ ] **Step 8: Commit**

```bash
git add .gitignore package.json pnpm-workspace.yaml tsconfig.base.json vitest.workspace.ts docs/
git commit -m "chore: initialize repository and pnpm monorepo scaffolding"
```

---

### Task 2: Build `@forge/core` — Domain Types, Invariant Errors & Typed Event Bus

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/types/task.ts`
- Create: `packages/core/src/types/runtime.ts`
- Create: `packages/core/src/types/security.ts`
- Create: `packages/core/src/types/events.ts`
- Create: `packages/core/src/errors/domain-errors.ts`
- Create: `packages/core/src/events/event-bus.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/tests/event-bus.test.ts`
- Create: `packages/core/tests/domain-errors.test.ts`

**Interfaces:**
- Consumes: Nothing
- Produces:
  - Domain types: `Task`, `TaskStatus`, `TaskLease`, `TrustLevel`, `RuntimeDescriptor`, `ExecutionToken`, `VerificationEvidence`
  - Invariant errors: `InvariantViolationError`, `TaskStateTransitionError`, `CapabilityDeniedError`, `LeaseExpiredError`
  - Classes: `EventBus` with `emit<T>(event: DomainEvent<T>): Promise<void>`, `subscribe<T>(type: string, handler: EventHandler<T>): () => void`

- [ ] **Step 1: Create `packages/core/package.json` & `tsconfig.json`**

`packages/core/package.json`:
```json
{
  "name": "@forge/core",
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
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

`packages/core/tsconfig.json`:
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

- [ ] **Step 2: Write failing unit tests for EventBus and Domain Errors**

`packages/core/tests/event-bus.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { DomainEvent } from "../src/types/events.js";

describe("EventBus", () => {
  it("subscribes to events and delivers them asynchronously", async () => {
    const bus = new EventBus();
    const handler = vi.fn();

    const unsubscribe = bus.subscribe("task.created", handler);

    const event: DomainEvent<{ taskId: string }> = {
      id: "evt-1",
      type: "task.created",
      timestamp: new Date().toISOString(),
      payload: { taskId: "task-100" }
    };

    await bus.emit(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);

    unsubscribe();
    await bus.emit(event);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @forge/core test`
Expected: FAIL with module/class not found.

- [ ] **Step 4: Implement Domain Types, Errors, and EventBus in `@forge/core`**

`packages/core/src/types/task.ts`:
```typescript
export type TaskStatus =
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "CHECKPOINTING"
  | "RETRYING"
  | "COMPLETED"
  | "FAILED";

export interface TaskRecord {
  id: string;
  missionId: string;
  name: string;
  assignedAgentId?: string;
  status: TaskStatus;
  priority: number;
  idempotencyKey: string;
  dependencies: string[];
  inputPayload: Record<string, unknown>;
  outputPayload?: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
  timeoutMs: number;
  requireVerification: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLease {
  executionId: string;
  taskId: string;
  agentId: string;
  runtimeId: string;
  workspacePath: string;
  processGroupId?: number;
  heartbeatTimestamp: string;
  leaseDurationSeconds: number;
  leaseExpiresAt: string;
  status: "ACTIVE" | "RELEASED" | "EXPIRED" | "REVOKED";
}
```

`packages/core/src/types/runtime.ts`:
```typescript
export type TrustLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export interface RuntimeDescriptor {
  id: string;
  name: string;
  trustLevel: TrustLevel;
  capabilities: {
    filesystemGovernance: "none" | "path_jail" | "virtual_mount";
    networkGovernance: "unrestricted" | "allowlist" | "isolated";
    toolInterception: boolean;
    supportsCancellation: boolean;
  };
}
```

`packages/core/src/types/security.ts`:
```typescript
export interface ExecutionToken {
  tokenId: string;
  taskId: string;
  agentId: string;
  runtimeId: string;
  workspacePath: string;
  allowedTools: string[];
  issuedAt: string;
  expiresAt: string;
  signature: string;
}
```

`packages/core/src/types/events.ts`:
```typescript
export interface DomainEvent<T = unknown> {
  id: string;
  type: string;
  timestamp: string;
  payload: T;
}
```

`packages/core/src/errors/domain-errors.ts`:
```typescript
export class ForgeError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvariantViolationError extends ForgeError {
  constructor(invariantId: string, details: string) {
    super(`[${invariantId}] Invariant violation: ${details}`, "INVARIANT_VIOLATION");
  }
}

export class TaskStateTransitionError extends ForgeError {
  constructor(from: string, to: string, reason: string) {
    super(`Illegal transition from '${from}' to '${to}': ${reason}`, "ILLEGAL_STATE_TRANSITION");
  }
}

export class CapabilityDeniedError extends ForgeError {
  constructor(capability: string, reason: string) {
    super(`Capability '${capability}' denied: ${reason}`, "CAPABILITY_DENIED");
  }
}
```

`packages/core/src/events/event-bus.ts`:
```typescript
import { DomainEvent } from "../types/events.js";

export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void> | void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  subscribe<T = unknown>(eventType: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    const set = this.handlers.get(eventType)!;
    const typedHandler = handler as EventHandler;
    set.add(typedHandler);

    return () => {
      set.delete(typedHandler);
    };
  }

  async emit<T = unknown>(event: DomainEvent<T>): Promise<void> {
    const set = this.handlers.get(event.type);
    if (!set || set.size === 0) return;

    const promises: Promise<void>[] = [];
    for (const handler of set) {
      try {
        const res = handler(event);
        if (res instanceof Promise) {
          promises.push(res);
        }
      } catch (err) {
        console.error(`Error in event handler for ${event.type}:`, err);
      }
    }
    await Promise.allSettled(promises);
  }
}
```

`packages/core/src/index.ts`:
```typescript
export * from "./types/task.js";
export * from "./types/runtime.js";
export * from "./types/security.js";
export * from "./types/events.js";
export * from "./errors/domain-errors.js";
export * from "./events/event-bus.js";
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @forge/core test && pnpm --filter @forge/core build`
Expected: Tests pass (100%), TypeScript build succeeds creating `dist/`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/
git commit -m "feat(core): implement domain types, invariant errors, and typed event bus"
```

---

### Task 3: Build `@forge/storage` — Native SQLite (WAL Mode) Engine & Schema Migrations

**Files:**
- Create: `packages/storage/package.json`
- Create: `packages/storage/tsconfig.json`
- Create: `packages/storage/src/database.ts`
- Create: `packages/storage/src/migrations/schema-v1.ts`
- Create: `packages/storage/src/migrations/migrator.ts`
- Create: `packages/storage/src/repositories/task-repository.ts`
- Create: `packages/storage/src/repositories/lease-repository.ts`
- Create: `packages/storage/src/repositories/audit-repository.ts`
- Create: `packages/storage/src/index.ts`
- Create: `packages/storage/tests/database.test.ts`
- Create: `packages/storage/tests/task-repository.test.ts`
- Create: `packages/storage/tests/lease-repository.test.ts`

**Interfaces:**
- Consumes: `@forge/core`
- Produces:
  - `ForgeDatabase`: Manages SQLite connection with `WAL`, `busy_timeout=5000`, and `foreign_keys=ON`
  - `TaskRepository`: CRUD, DAG edge queries, state transition updates, and idempotency checks
  - `LeaseRepository`: Acquire, renew heartbeat, expire stale leases (`lease_expires_at < now()`)
  - `AuditRepository`: Append-only event audit trail

- [ ] **Step 1: Create `packages/storage/package.json` & `tsconfig.json`**

`packages/storage/package.json`:
```json
{
  "name": "@forge/storage",
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

`packages/storage/tsconfig.json`:
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

- [ ] **Step 2: Write failing unit test for Database & Migrator**

`packages/storage/tests/database.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForgeDatabase } from "../src/database.js";
import { runMigrations } from "../src/migrations/migrator.js";

describe("ForgeDatabase & Migrator", () => {
  let db: ForgeDatabase;

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it("enforces foreign keys and creates tables correctly", () => {
    const raw = db.getRawDb();
    const tables = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain("projects");
    expect(tableNames).toContain("missions");
    expect(tableNames).toContain("tasks");
    expect(tableNames).toContain("task_dependencies");
    expect(tableNames).toContain("execution_leases");
    expect(tableNames).toContain("audit_log");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @forge/storage test`
Expected: FAIL with module not found.

- [ ] **Step 4: Implement `ForgeDatabase` and `SchemaV1`**

`packages/storage/src/database.ts`:
```typescript
import { DatabaseSync } from "node:sqlite";

export class ForgeDatabase {
  private db: DatabaseSync;

  constructor(filePath: string = ":memory:") {
    this.db = new DatabaseSync(filePath);
    this.configurePragmas();
  }

  private configurePragmas(): void {
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  getRawDb(): DatabaseSync {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
```

`packages/storage/src/migrations/schema-v1.ts`:
```typescript
export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  assigned_agent_id TEXT,
  status TEXT NOT NULL,
  priority INTEGER DEFAULT 50,
  idempotency_key TEXT UNIQUE NOT NULL,
  input_payload TEXT NOT NULL,
  output_payload TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  timeout_ms INTEGER DEFAULT 30000,
  require_verification INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS execution_leases (
  execution_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  workspace_path TEXT NOT NULL,
  process_group_id INTEGER,
  heartbeat_timestamp TEXT NOT NULL,
  lease_duration_seconds INTEGER DEFAULT 30,
  lease_expires_at TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_mission_status ON tasks(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_leases_status_expires ON execution_leases(status, lease_expires_at);
`;
```

`packages/storage/src/migrations/migrator.ts`:
```typescript
import { ForgeDatabase } from "../database.js";
import { SCHEMA_V1 } from "./schema-v1.js";

export function runMigrations(db: ForgeDatabase): void {
  db.getRawDb().exec(SCHEMA_V1);
}
```

- [ ] **Step 5: Implement `TaskRepository` & `LeaseRepository`**

`packages/storage/src/repositories/task-repository.ts`:
```typescript
import { TaskRecord, TaskStatus } from "@forge/core";
import { ForgeDatabase } from "../database.js";

export class TaskRepository {
  constructor(private db: ForgeDatabase) {}

  createTask(task: TaskRecord): void {
    const raw = this.db.getRawDb();
    const stmt = raw.prepare(`
      INSERT INTO tasks (
        id, mission_id, name, assigned_agent_id, status, priority,
        idempotency_key, input_payload, output_payload, retry_count,
        max_retries, timeout_ms, require_verification, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      task.missionId,
      task.name,
      task.assignedAgentId || null,
      task.status,
      task.priority,
      task.idempotencyKey,
      JSON.stringify(task.inputPayload),
      task.outputPayload ? JSON.stringify(task.outputPayload) : null,
      task.retryCount,
      task.maxRetries,
      task.timeoutMs,
      task.requireVerification ? 1 : 0,
      task.createdAt,
      task.updatedAt
    );
  }

  addDependency(taskId: string, dependsOnTaskId: string): void {
    const raw = this.db.getRawDb();
    raw.prepare("INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)").run(taskId, dependsOnTaskId);
  }

  getDependencies(taskId: string): string[] {
    const raw = this.db.getRawDb();
    const rows = raw.prepare("SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?").all(taskId) as { depends_on_task_id: string }[];
    return rows.map(r => r.depends_on_task_id);
  }

  getTaskById(id: string): TaskRecord | null {
    const raw = this.db.getRawDb();
    const row = raw.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      id: row.id as string,
      missionId: row.mission_id as string,
      name: row.name as string,
      assignedAgentId: (row.assigned_agent_id as string) || undefined,
      status: row.status as TaskStatus,
      priority: Number(row.priority),
      idempotencyKey: row.idempotency_key as string,
      dependencies: this.getDependencies(id),
      inputPayload: JSON.parse(row.input_payload as string),
      outputPayload: row.output_payload ? JSON.parse(row.output_payload as string) : undefined,
      retryCount: Number(row.retry_count),
      maxRetries: Number(row.max_retries),
      timeoutMs: Number(row.timeout_ms),
      requireVerification: Boolean(row.require_verification),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    };
  }

  updateTaskStatus(id: string, status: TaskStatus, outputPayload?: Record<string, unknown>): void {
    const raw = this.db.getRawDb();
    const now = new Date().toISOString();
    if (outputPayload) {
      raw.prepare("UPDATE tasks SET status = ?, output_payload = ?, updated_at = ? WHERE id = ?").run(status, JSON.stringify(outputPayload), now, id);
    } else {
      raw.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
    }
  }
}
```

`packages/storage/src/repositories/lease-repository.ts`:
```typescript
import { TaskLease } from "@forge/core";
import { ForgeDatabase } from "../database.js";

export class LeaseRepository {
  constructor(private db: ForgeDatabase) {}

  acquireLease(lease: TaskLease): void {
    const raw = this.db.getRawDb();
    raw.prepare(`
      INSERT INTO execution_leases (
        execution_id, task_id, agent_id, runtime_id, workspace_path,
        process_group_id, heartbeat_timestamp, lease_duration_seconds,
        lease_expires_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      lease.executionId,
      lease.taskId,
      lease.agentId,
      lease.runtimeId,
      lease.workspacePath,
      lease.processGroupId || null,
      lease.heartbeatTimestamp,
      lease.leaseDurationSeconds,
      lease.leaseExpiresAt,
      lease.status
    );
  }

  renewHeartbeat(executionId: string, durationSeconds: number = 30): void {
    const raw = this.db.getRawDb();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationSeconds * 1000).toISOString();

    raw.prepare(`
      UPDATE execution_leases
      SET heartbeat_timestamp = ?, lease_expires_at = ?
      WHERE execution_id = ? AND status = 'ACTIVE'
    `).run(now.toISOString(), expiresAt, executionId);
  }

  getExpiredActiveLeases(): TaskLease[] {
    const raw = this.db.getRawDb();
    const now = new Date().toISOString();
    const rows = raw.prepare(`
      SELECT * FROM execution_leases
      WHERE status = 'ACTIVE' AND lease_expires_at < ?
    `).all(now) as Record<string, unknown>[];

    return rows.map(r => ({
      executionId: r.execution_id as string,
      taskId: r.task_id as string,
      agentId: r.agent_id as string,
      runtimeId: r.runtime_id as string,
      workspacePath: r.workspace_path as string,
      processGroupId: r.process_group_id ? Number(r.process_group_id) : undefined,
      heartbeatTimestamp: r.heartbeat_timestamp as string,
      leaseDurationSeconds: Number(r.lease_duration_seconds),
      leaseExpiresAt: r.lease_expires_at as string,
      status: r.status as TaskLease["status"]
    }));
  }

  expireLease(executionId: string): void {
    const raw = this.db.getRawDb();
    raw.prepare("UPDATE execution_leases SET status = 'EXPIRED' WHERE execution_id = ?").run(executionId);
  }

  releaseLease(executionId: string): void {
    const raw = this.db.getRawDb();
    raw.prepare("UPDATE execution_leases SET status = 'RELEASED' WHERE execution_id = ?").run(executionId);
  }
}
```

`packages/storage/src/index.ts`:
```typescript
export * from "./database.js";
export * from "./migrations/migrator.js";
export * from "./migrations/schema-v1.js";
export * from "./repositories/task-repository.js";
export * from "./repositories/lease-repository.js";
```

- [ ] **Step 6: Write and run integration tests for TaskRepository and LeaseRepository**

`packages/storage/tests/task-repository.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForgeDatabase } from "../src/database.js";
import { runMigrations } from "../src/migrations/migrator.js";
import { TaskRepository } from "../src/repositories/task-repository.js";
import { TaskRecord } from "@forge/core";

describe("TaskRepository", () => {
  let db: ForgeDatabase;
  let repo: TaskRepository;

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
    repo = new TaskRepository(db);

    // Insert project and mission for FK
    db.getRawDb().prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('p1', 'Project 1', '/tmp', 'now', 'now')").run();
    db.getRawDb().prepare("INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES ('m1', 'p1', 'Mission 1', 'ACTIVE', 'now', 'now')").run();
  });

  afterEach(() => {
    db.close();
  });

  it("creates, queries, and updates tasks with dependencies", () => {
    const taskA: TaskRecord = {
      id: "task-a",
      missionId: "m1",
      name: "Task A",
      status: "COMPLETED",
      priority: 10,
      idempotencyKey: "hash-a",
      dependencies: [],
      inputPayload: { foo: "bar" },
      retryCount: 0,
      maxRetries: 3,
      timeoutMs: 30000,
      requireVerification: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const taskB: TaskRecord = {
      id: "task-b",
      missionId: "m1",
      name: "Task B",
      status: "QUEUED",
      priority: 20,
      idempotencyKey: "hash-b",
      dependencies: ["task-a"],
      inputPayload: { baz: 123 },
      retryCount: 0,
      maxRetries: 3,
      timeoutMs: 30000,
      requireVerification: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    repo.createTask(taskA);
    repo.createTask(taskB);
    repo.addDependency("task-b", "task-a");

    const fetchedB = repo.getTaskById("task-b");
    expect(fetchedB).not.toBeNull();
    expect(fetchedB?.dependencies).toEqual(["task-a"]);

    repo.updateTaskStatus("task-b", "RUNNING");
    expect(repo.getTaskById("task-b")?.status).toBe("RUNNING");
  });
});
```

- [ ] **Step 7: Run all tests in the workspace**

Run: `pnpm test`
Expected: All tests across `@forge/core` and `@forge/storage` PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/storage/
git commit -m "feat(storage): implement native SQLite WAL engine, schema migrations, and repositories"
```

---

### Task 4: End-to-End Workspace Verification & Monorepo Validation

**Files:**
- Create: `packages/storage/tests/e2e-persistence.test.ts`

**Interfaces:**
- Consumes: `@forge/core`, `@forge/storage`
- Produces: Verified multi-package contract execution

- [ ] **Step 1: Write end-to-end lease recovery & event bus persistence test**

Verify that:
1. EventBus emits events.
2. Task transitions persist to SQLite.
3. Expired leases are accurately detected when `heartbeat_timestamp` falls behind `lease_expires_at`.
4. Idempotency collisions reject duplicate tasks.

- [ ] **Step 2: Run complete verification suite**

Run: `pnpm test && pnpm build`
Expected: 100% PASS, clean TypeScript build.

- [ ] **Step 3: Commit**

```bash
git add packages/storage/tests/e2e-persistence.test.ts
git commit -m "test: add end-to-end integration and lease recovery validation"
```
