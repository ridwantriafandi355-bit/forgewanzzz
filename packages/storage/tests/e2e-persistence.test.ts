import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForgeDatabase } from "../src/database.js";
import { runMigrations } from "../src/migrations/migrator.js";
import { TaskRepository } from "../src/repositories/task-repository.js";
import { LeaseRepository } from "../src/repositories/lease-repository.js";
import { AuditRepository } from "../src/repositories/audit-repository.js";
import { EventBus, TaskRecord, TaskLease, DomainEvent } from "@forge/core";

describe("E2E Multi-Package Persistence & Lifecycle Simulation", () => {
  let db: ForgeDatabase;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let auditRepo: AuditRepository;
  let eventBus: EventBus;

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
    taskRepo = new TaskRepository(db);
    leaseRepo = new LeaseRepository(db);
    auditRepo = new AuditRepository(db);
    eventBus = new EventBus();

    // Wire up event bus to audit logging
    eventBus.subscribe("task.transition", (event: DomainEvent<{ taskId: string }>) => {
      auditRepo.appendEvent("TASK", event.payload.taskId, event);
    });

    // Seed project & mission
    db.getRawDb().prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('prj-1', 'Forge Core', '/workspace', 'now', 'now')").run();
    db.getRawDb().prepare("INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES ('msn-1', 'prj-1', 'Test Mission', 'ACTIVE', 'now', 'now')").run();
  });

  afterEach(() => {
    db.close();
  });

  it("simulates full lifecycle: task queueing, lease acquisition, heartbeat, completion, and audit trailing", async () => {
    const taskId = "task-alpha-1";
    const executionId = "exec-alpha-1";
    const idempotencyKey = "hash-alpha-1";

    // 1. Orchestrator proposals / Task created as QUEUED
    const task: TaskRecord = {
      id: taskId,
      missionId: "msn-1",
      name: "Synthesize Backend Service",
      status: "QUEUED",
      priority: 10,
      idempotencyKey,
      dependencies: [],
      inputPayload: { target: "api/routes.ts" },
      retryCount: 0,
      maxRetries: 3,
      timeoutMs: 30000,
      requireVerification: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    taskRepo.createTask(task);
    await eventBus.emit({
      id: "evt-t1-created",
      type: "task.transition",
      timestamp: new Date().toISOString(),
      payload: { taskId, from: "NONE", to: "QUEUED" }
    });

    // Verify task is in DB
    const storedTask = taskRepo.getTaskById(taskId);
    expect(storedTask).not.toBeNull();
    expect(storedTask?.status).toBe("QUEUED");

    // 2. Runtime Worker picks up task -> Acquire Lease & set to RUNNING
    const leaseStartTime = new Date();
    const lease: TaskLease = {
      executionId,
      taskId,
      agentId: "agent.backend.coder",
      runtimeId: "native-forge-runner",
      workspacePath: "/worktrees/task-alpha-1",
      processGroupId: 9988,
      heartbeatTimestamp: leaseStartTime.toISOString(),
      leaseDurationSeconds: 30,
      leaseExpiresAt: new Date(leaseStartTime.getTime() + 30000).toISOString(),
      status: "ACTIVE"
    };

    leaseRepo.acquireLease(lease);
    taskRepo.updateTaskStatus(taskId, "RUNNING");
    await eventBus.emit({
      id: "evt-t1-running",
      type: "task.transition",
      timestamp: new Date().toISOString(),
      payload: { taskId, from: "QUEUED", to: "RUNNING" }
    });

    expect(taskRepo.getTaskById(taskId)?.status).toBe("RUNNING");
    expect(leaseRepo.getLease(executionId)?.status).toBe("ACTIVE");

    // 3. Heartbeat renewal
    leaseRepo.renewHeartbeat(executionId, 30);
    const renewedLease = leaseRepo.getLease(executionId);
    expect(renewedLease).not.toBeNull();

    // 4. Task Completes successfully
    taskRepo.updateTaskStatus(taskId, "COMPLETED", { diff: "+ export const api = router();" });
    leaseRepo.releaseLease(executionId);
    await eventBus.emit({
      id: "evt-t1-completed",
      type: "task.transition",
      timestamp: new Date().toISOString(),
      payload: { taskId, from: "RUNNING", to: "COMPLETED" }
    });

    const completedTask = taskRepo.getTaskById(taskId);
    expect(completedTask?.status).toBe("COMPLETED");
    expect(completedTask?.outputPayload).toEqual({ diff: "+ export const api = router();" });
    expect(leaseRepo.getLease(executionId)?.status).toBe("RELEASED");

    // 5. Verify audit log captures all state transitions in exact order
    const auditEntries = auditRepo.getEntriesByEntity("TASK", taskId);
    expect(auditEntries.length).toBe(3);
    expect(auditEntries[0].payload).toMatchObject({ from: "NONE", to: "QUEUED" });
    expect(auditEntries[1].payload).toMatchObject({ from: "QUEUED", to: "RUNNING" });
    expect(auditEntries[2].payload).toMatchObject({ from: "RUNNING", to: "COMPLETED" });
  });

  it("handles crash recovery: identifies abandoned task with expired heartbeat lease", () => {
    const taskId = "task-crashed-1";
    const executionId = "exec-crashed-1";
    const pastTimestamp = new Date(Date.now() - 60000).toISOString();

    taskRepo.createTask({
      id: taskId,
      missionId: "msn-1",
      name: "Crashed Long Job",
      status: "RUNNING",
      priority: 50,
      idempotencyKey: "hash-crashed-1",
      dependencies: [],
      inputPayload: {},
      retryCount: 0,
      maxRetries: 3,
      timeoutMs: 30000,
      requireVerification: true,
      createdAt: pastTimestamp,
      updatedAt: pastTimestamp
    });

    leaseRepo.acquireLease({
      executionId,
      taskId,
      agentId: "agent.coder",
      runtimeId: "claude-code",
      workspacePath: "/worktrees/task-crashed-1",
      processGroupId: 4433,
      heartbeatTimestamp: pastTimestamp,
      leaseDurationSeconds: 30,
      leaseExpiresAt: pastTimestamp, // Expired 60s ago
      status: "ACTIVE"
    });

    // Crash triage sweep
    const expiredLeases = leaseRepo.getExpiredActiveLeases();
    expect(expiredLeases.length).toBe(1);
    expect(expiredLeases[0].executionId).toBe(executionId);

    // Triage action: expire lease, mark task RETRYING
    leaseRepo.expireLease(executionId);
    taskRepo.incrementRetry(taskId);
    taskRepo.updateTaskStatus(taskId, "RETRYING");

    const recoveredTask = taskRepo.getTaskById(taskId);
    expect(recoveredTask?.status).toBe("RETRYING");
    expect(recoveredTask?.retryCount).toBe(1);
    expect(leaseRepo.getLease(executionId)?.status).toBe("EXPIRED");
  });
});
