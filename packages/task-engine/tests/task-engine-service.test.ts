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
