import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForgeDatabase } from "../src/database.js";
import { runMigrations } from "../src/migrations/migrator.js";
import { LeaseRepository } from "../src/repositories/lease-repository.js";
import { TaskLease } from "@forge/core";

describe("LeaseRepository", () => {
  let db: ForgeDatabase;
  let repo: LeaseRepository;

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
    repo = new LeaseRepository(db);

    // Seed project, mission, and task for FK constraint
    db.getRawDb().prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('p1', 'P1', '/tmp', 'now', 'now')").run();
    db.getRawDb().prepare("INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES ('m1', 'p1', 'M1', 'ACTIVE', 'now', 'now')").run();
    db.getRawDb().prepare(`
      INSERT INTO tasks (id, mission_id, name, status, priority, idempotency_key, input_payload, created_at, updated_at)
      VALUES ('t1', 'm1', 'Task 1', 'RUNNING', 50, 'hash1', '{}', 'now', 'now')
    `).run();
  });

  afterEach(() => {
    db.close();
  });

  it("acquires, reads, and renews a task lease", () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30000).toISOString();

    const lease: TaskLease = {
      executionId: "exec-1",
      taskId: "t1",
      agentId: "agent.coder",
      runtimeId: "claude-code",
      workspacePath: "/worktrees/t1",
      processGroupId: 12345,
      heartbeatTimestamp: now.toISOString(),
      leaseDurationSeconds: 30,
      leaseExpiresAt: expiresAt,
      status: "ACTIVE"
    };

    repo.acquireLease(lease);

    const fetched = repo.getLease("exec-1");
    expect(fetched).not.toBeNull();
    expect(fetched?.agentId).toBe("agent.coder");
    expect(fetched?.processGroupId).toBe(12345);

    repo.renewHeartbeat("exec-1", 60);
    const renewed = repo.getLease("exec-1");
    expect(renewed?.leaseExpiresAt).not.toBe(expiresAt);
  });

  it("detects expired active leases accurately", () => {
    const expiredTimestamp = new Date(Date.now() - 5000).toISOString();

    const staleLease: TaskLease = {
      executionId: "exec-stale",
      taskId: "t1",
      agentId: "agent.coder",
      runtimeId: "claude-code",
      workspacePath: "/worktrees/t1",
      heartbeatTimestamp: expiredTimestamp,
      leaseDurationSeconds: 10,
      leaseExpiresAt: expiredTimestamp, // Already in the past
      status: "ACTIVE"
    };

    repo.acquireLease(staleLease);

    const expiredList = repo.getExpiredActiveLeases();
    expect(expiredList.length).toBe(1);
    expect(expiredList[0].executionId).toBe("exec-stale");

    repo.expireLease("exec-stale");
    expect(repo.getExpiredActiveLeases().length).toBe(0);
    expect(repo.getLease("exec-stale")?.status).toBe("EXPIRED");
  });
});
