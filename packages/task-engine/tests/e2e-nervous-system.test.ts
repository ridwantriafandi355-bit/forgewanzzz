import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForgeDatabase, runMigrations, TaskRepository, LeaseRepository, AuditRepository } from "@forge/storage";
import { EventBus, DomainEvent } from "@forge/core";
import { TaskEngineService } from "../src/services/task-engine-service.js";
import { CapabilityResolver, SecurityPolicy } from "@forge/capability-resolver";

describe("E2E Phase 2: Deterministic Nervous System & Capability Gate Integration", () => {
  let db: ForgeDatabase;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let auditRepo: AuditRepository;
  let eventBus: EventBus;
  let taskEngine: TaskEngineService;
  let capabilityResolver: CapabilityResolver;

  const policy: SecurityPolicy = {
    projectId: "prj-nervous-1",
    allowedTools: ["filesystem.read", "filesystem.write", "git.commit"],
    forbiddenTools: ["shell.rm_rf", "cloud.destroy"],
    minTrustLevel: "L1",
    requireApprovalForTools: ["filesystem.write"]
  };

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
    taskRepo = new TaskRepository(db);
    leaseRepo = new LeaseRepository(db);
    auditRepo = new AuditRepository(db);
    eventBus = new EventBus();

    // Hook audit repo to all task transitions
    eventBus.subscribe("task.transition", (event: DomainEvent<{ taskId: string }>) => {
      auditRepo.appendEvent("TASK", event.payload.taskId, event);
    });

    taskEngine = new TaskEngineService(taskRepo, leaseRepo, eventBus);
    capabilityResolver = new CapabilityResolver("super-secret-key-12345", policy);

    db.getRawDb().prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('prj-nervous-1', 'Nervous Project', '/workspace', 'now', 'now')").run();
    db.getRawDb().prepare("INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES ('msn-nervous-1', 'prj-nervous-1', 'Mission Alpha', 'ACTIVE', 'now', 'now')").run();
  });

  afterEach(() => {
    db.close();
  });

  it("orchestrates a full 2-node DAG gated by Capability Tokens with lease renewal and audit log", async () => {
    // 1. Propose DAG: step-compile -> step-package
    await taskEngine.proposeTaskGraph("msn-nervous-1", [
      { id: "step-compile", name: "Compile Typescript", dependencies: [], inputPayload: { target: "src" } },
      { id: "step-package", name: "Package Artifact", dependencies: ["step-compile"], inputPayload: { dist: "dist" } }
    ]);

    // 2. Initial state: only step-compile is ready
    let readyTasks = taskEngine.getReadyTasks("msn-nervous-1");
    expect(readyTasks.map(t => t.id)).toEqual(["step-compile"]);

    // 3. Security Check for step-compile
    const decisionCompile = capabilityResolver.resolve({
      taskId: "step-compile",
      agentId: "agent.compiler",
      runtimeId: "claude-code",
      runtimeTrustLevel: "L1",
      requestedTools: ["filesystem.read"],
      workspacePath: "/worktrees/step-compile"
    });

    expect(decisionCompile.allowed).toBe(true);
    expect(decisionCompile.token).toBeDefined();
    expect(capabilityResolver.verifyToken(decisionCompile.token!)).toBe(true);

    // 4. Acquire lease & execute step-compile
    const leaseCompile = taskEngine.acquireTaskLease("step-compile", "agent.compiler", "claude-code", "/worktrees/step-compile");
    await taskEngine.transitionTask("step-compile", "RUNNING");

    // Renew heartbeat
    taskEngine.renewHeartbeat(leaseCompile.executionId, 30);

    // Complete step-compile
    await taskEngine.transitionTask("step-compile", "COMPLETED", { compiledFiles: 42 });

    // 5. Automatic Dependency Satisfaction: step-package is now READY
    readyTasks = taskEngine.getReadyTasks("msn-nervous-1");
    expect(readyTasks.map(t => t.id)).toEqual(["step-package"]);

    // 6. Security Check for step-package (requesting write tool -> requires approval flag)
    const decisionPackage = capabilityResolver.resolve({
      taskId: "step-package",
      agentId: "agent.packager",
      runtimeId: "claude-code",
      runtimeTrustLevel: "L1",
      requestedTools: ["filesystem.write", "git.commit"],
      workspacePath: "/worktrees/step-package"
    });

    expect(decisionPackage.allowed).toBe(true);
    expect(decisionPackage.requiresApproval).toBe(true);
    expect(decisionPackage.token).toBeDefined();

    // 7. Verify Rogue Request is rejected
    const rogueDecision = capabilityResolver.resolve({
      taskId: "step-package",
      agentId: "agent.packager",
      runtimeId: "claude-code",
      runtimeTrustLevel: "L1",
      requestedTools: ["shell.rm_rf"],
      workspacePath: "/worktrees/step-package"
    });
    expect(rogueDecision.allowed).toBe(false);
    expect(rogueDecision.token).toBeUndefined();

    // 8. Verify Audit Log recorded all transitions for step-compile
    const compileAudits = auditRepo.getEntriesByEntity("TASK", "step-compile");
    expect(compileAudits.length).toBe(2);
    expect(compileAudits[0].payload).toMatchObject({ from: "QUEUED", to: "RUNNING" });
    expect(compileAudits[1].payload).toMatchObject({ from: "RUNNING", to: "COMPLETED" });
  });

  it("sweeps stalled lease and triages task from RUNNING to RETRYING during crash recovery", async () => {
    await taskEngine.proposeTaskGraph("msn-nervous-1", [
      { id: "stalled-job", name: "Stalled Worker", dependencies: [], inputPayload: {} }
    ]);

    const lease = taskEngine.acquireTaskLease("stalled-job", "agent.worker", "claude-code", "/worktrees/stalled");
    await taskEngine.transitionTask("stalled-job", "RUNNING");

    // Force lease expiration
    const past = new Date(Date.now() - 35000).toISOString();
    db.getRawDb().prepare("UPDATE execution_leases SET lease_expires_at = ? WHERE execution_id = ?").run(past, lease.executionId);

    const sweepResult = await taskEngine.sweepExpiredLeases();
    expect(sweepResult.recoveredCount).toBe(1);

    const retriedTask = taskRepo.getTaskById("stalled-job");
    expect(retriedTask?.status).toBe("RETRYING");
    expect(retriedTask?.retryCount).toBe(1);
  });
});
