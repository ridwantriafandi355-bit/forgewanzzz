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

    // Seed project and mission for foreign keys
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

    const dependentsA = repo.getDependents("task-a");
    expect(dependentsA).toEqual(["task-b"]);

    repo.updateTaskStatus("task-b", "RUNNING", { started: true });
    const updatedB = repo.getTaskById("task-b");
    expect(updatedB?.status).toBe("RUNNING");
    expect(updatedB?.outputPayload).toEqual({ started: true });

    repo.incrementRetry("task-b");
    expect(repo.getTaskById("task-b")?.retryCount).toBe(1);
  });

  it("prevents duplicate idempotency keys", () => {
    const task: TaskRecord = {
      id: "task-1",
      missionId: "m1",
      name: "Task 1",
      status: "QUEUED",
      priority: 10,
      idempotencyKey: "unique-hash",
      dependencies: [],
      inputPayload: {},
      retryCount: 0,
      maxRetries: 3,
      timeoutMs: 30000,
      requireVerification: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    repo.createTask(task);
    expect(() => repo.createTask({ ...task, id: "task-2" })).toThrow();
  });
});
