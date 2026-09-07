import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ForgeDatabase, runMigrations, TaskRepository, LeaseRepository } from "@forge/storage";
import { EventBus } from "@forge/core";
import { TaskEngineService } from "@forge/task-engine";
import { OrganizationManager } from "@forge/org-manager";
import { VerificationService } from "@forge/verification-engine";
import { OrchestratorService } from "../src/services/orchestrator-service.js";
import type { MissionSpec } from "../src/types/orchestration.js";

describe("OrchestratorService (AD-001, AD-002, AD-005)", () => {
  let tempDir: string;
  let db: ForgeDatabase;
  let taskEngine: TaskEngineService;
  let orgManager: OrganizationManager;
  let verificationService: VerificationService;
  let orchestrator: OrchestratorService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-orch-test-"));
    const dbPath = path.join(tempDir, "forge.db");
    db = new ForgeDatabase(dbPath);
    runMigrations(db);

    const taskRepo = new TaskRepository(db);
    const leaseRepo = new LeaseRepository(db);
    const eventBus = new EventBus();

    taskEngine = new TaskEngineService(taskRepo, leaseRepo, eventBus);
    orgManager = new OrganizationManager();
    verificationService = new VerificationService();

    orchestrator = new OrchestratorService({
      taskEngine,
      orgManager,
      verificationService,
    });
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("plans a mission, forms a team, and proposes Task DAG to Task Engine (AD-001 & AD-002)", async () => {
    // Insert project and mission row into DB first for relational integrity
    db.getRawDb().prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('proj-web', 'Web', '/tmp', 'now', 'now')").run();
    db.getRawDb().prepare("INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES ('msn-001', 'proj-web', 'Auth', 'ACTIVE', 'now', 'now')").run();

    const mission: MissionSpec = {
      missionId: "msn-001",
      projectId: "proj-web",
      name: "Build Authentication Module",
      goal: "Implement user signup and login with hashed passwords",
      steps: [
        {
          id: "step-1",
          title: "Setup Auth Models",
          role: "WORKER",
          dependencies: [],
          policy: "AUTOMATED",
        },
        {
          id: "step-2",
          title: "Implement Password Hashing",
          role: "WORKER",
          dependencies: ["step-1"],
          policy: "AUTOMATED",
        },
      ],
    };

    const result = await orchestrator.startMission(mission);
    expect(result.missionId).toBe("msn-001");
    expect(result.status).toBe("IN_PROGRESS");
    expect(result.team.assignedAgents.length).toBeGreaterThan(0);

    // Verify tasks are registered in TaskEngine
    const readyTasks = taskEngine.getReadyTasks("msn-001");
    expect(readyTasks).toHaveLength(1);
    expect(readyTasks[0].id).toBe("step-1");
  });

  it("executes steps through verification and completes the DAG", async () => {
    db.getRawDb().prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('proj-fast', 'Fast', '/tmp', 'now', 'now')").run();
    db.getRawDb().prepare("INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES ('msn-002', 'proj-fast', 'Fast Mission', 'ACTIVE', 'now', 'now')").run();

    const mission: MissionSpec = {
      missionId: "msn-002",
      projectId: "proj-fast",
      name: "Quick Task",
      goal: "Single step feature",
      steps: [
        {
          id: "task-quick",
          title: "Build quick module",
          role: "WORKER",
          dependencies: [],
          policy: "AUTOMATED",
        },
      ],
    };

    await orchestrator.startMission(mission);

    // Execute step
    const stepResult = await orchestrator.executeNextStep("msn-002", {
      simulateCheckExitCode: 0,
    });

    expect(stepResult.completed).toBe(true);
    expect(stepResult.taskId).toBe("task-quick");
    expect(stepResult.verificationEvidence?.passed).toBe(true);

    const status = orchestrator.getMissionStatus("msn-002");
    expect(status.status).toBe("COMPLETED");
  });

  it("triggers circuit breaker when a task repeatedly fails verification", async () => {
    db.getRawDb().prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('proj-fail', 'Fail', '/tmp', 'now', 'now')").run();
    db.getRawDb().prepare("INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES ('msn-003', 'proj-fail', 'Broken', 'ACTIVE', 'now', 'now')").run();

    const mission: MissionSpec = {
      missionId: "msn-003",
      projectId: "proj-fail",
      name: "Failing Mission",
      goal: "Always broken",
      steps: [
        {
          id: "task-failing",
          title: "Broken task",
          role: "WORKER",
          dependencies: [],
          policy: "AUTOMATED",
        },
      ],
    };

    await orchestrator.startMission(mission);

    // Attempt 1, 2, 3 with failing exit codes
    await orchestrator.executeNextStep("msn-003", { simulateCheckExitCode: 1 });
    await orchestrator.executeNextStep("msn-003", { simulateCheckExitCode: 1 });
    await orchestrator.executeNextStep("msn-003", { simulateCheckExitCode: 1 });

    // Fourth failure triggers circuit breaker
    await orchestrator.executeNextStep("msn-003", { simulateCheckExitCode: 1 });

    const status = orchestrator.getMissionStatus("msn-003");
    expect(status.status).toBe("PAUSED_FOR_HUMAN_OVERRIDE");
  });
});
