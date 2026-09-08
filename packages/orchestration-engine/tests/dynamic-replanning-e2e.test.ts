import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForgeDatabase, runMigrations, TaskRepository, LeaseRepository } from "@forge/storage";
import { EventBus } from "@forge/core";
import { TaskEngineService } from "@forge/task-engine";
import { OrganizationManager } from "@forge/org-manager";
import { VerificationService, SemanticVerifier } from "@forge/verification-engine";
import { OrchestratorService } from "../src/services/orchestrator-service.js";
import type { MissionSpec } from "../src/types/orchestration.js";

describe("Orchestrator: Autonomous Dynamic Re-planning Loop via Layer 2 Evaluator (FR-403 & Doc 02)", () => {
  let db: ForgeDatabase;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let eventBus: EventBus;
  let taskEngine: TaskEngineService;
  let orgManager: OrganizationManager;
  let semanticVerifier: SemanticVerifier;
  let verificationService: VerificationService;
  let orchestrator: OrchestratorService;

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);

    const raw = db.getRawDb();
    const now = new Date().toISOString();
    raw.prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('proj-replanning', 'Replanning Demo', '.', ?, ?)").run(now, now);
    raw.prepare("INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES ('msn-replan-01', 'proj-replanning', 'Self Healing Code', 'ACTIVE', ?, ?)").run(now, now);

    taskRepo = new TaskRepository(db);
    leaseRepo = new LeaseRepository(db);
    eventBus = new EventBus();
    taskEngine = new TaskEngineService(taskRepo, leaseRepo, eventBus);

    orgManager = new OrganizationManager();
    semanticVerifier = new SemanticVerifier();
    verificationService = new VerificationService(semanticVerifier);

    orchestrator = new OrchestratorService({
      taskEngine,
      orgManager,
      verificationService,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("proves the complete self-healing feedback loop: Layer 1 Pass -> Layer 2 Fail -> Re-planning -> Self-Healing -> Pass", async () => {
    const missionSpec: MissionSpec = {
      missionId: "msn-replan-01",
      projectId: "proj-replanning",
      name: "Self Healing Security Mission",
      goal: "Implement authentication token reader safely",
      steps: [
        {
          id: "task-auth-impl",
          title: "Implement auth token reader",
          role: "WORKER",
          dependencies: [],
          policy: "MIXED", // Enforce Dual-Layer Verification
        },
      ],
    };

    // 1. Start Mission
    const startResult = await orchestrator.startMission(missionSpec);
    expect(startResult.status).toBe("IN_PROGRESS");

    // 2. Iteration 1: Worker produces code that passes tests (exitCode 0) but has hardcoded API key
    const defectiveFiles = [
      {
        path: "src/auth.ts",
        content: 'const token = "sk-abcdef1234567890abcdef1234567890";\nexport function getAuth() { return token; }\n',
      },
    ];

    const iter1Result = await orchestrator.executeNextStep("msn-replan-01", {
      simulateCheckExitCode: 0, // Layer 1 passes
      semanticReviewFiles: defectiveFiles, // Layer 2 will catch the secret!
    });

    expect(iter1Result.completed).toBe(false);
    expect(iter1Result.verificationEvidence?.passed).toBe(false);
    expect(iter1Result.verificationEvidence?.checks["automated-verification"].passed).toBe(true); // Layer 1 passed
    expect(iter1Result.verificationEvidence?.reviewerAssessment?.passed).toBe(false); // Layer 2 rejected!

    // Verify task state transitioned to RETRYING and stored the critique
    const tasksAfterIter1 = taskEngine.getTasks("msn-replan-01");
    const targetTask = tasksAfterIter1.find((t) => t.id === "task-auth-impl");
    expect(targetTask?.status).toBe("RETRYING");
    expect((targetTask?.outputPayload as any)?.retry).toBe(1);
    expect((targetTask?.outputPayload as any)?.critique?.passed).toBe(false);
    expect((targetTask?.outputPayload as any)?.issues?.length).toBeGreaterThan(0);

    // 3. Iteration 2: Self-healing repair - Worker inspects critique and fixes code
    const repairedFiles = [
      {
        path: "src/auth.ts",
        content: "export function getAuth(): string {\n  return process.env.AUTH_SECRET_TOKEN || '';\n}\n",
      },
      {
        path: "tests/auth.test.ts",
        content: "import { getAuth } from '../src/auth.js';\nit('reads token correctly', () => {\n  process.env.AUTH_SECRET_TOKEN = 'test-token';\n  expect(getAuth()).toBe('test-token');\n});\n",
      },
    ];

    const iter2Result = await orchestrator.executeNextStep("msn-replan-01", {
      simulateCheckExitCode: 0, // Layer 1 passes
      semanticReviewFiles: repairedFiles, // Layer 2 evaluates clean code
    });

    expect(iter2Result.completed).toBe(true);
    expect(iter2Result.verificationEvidence?.passed).toBe(true);
    expect(iter2Result.verificationEvidence?.layer).toBe("MIXED");
    expect(iter2Result.verificationEvidence?.reviewerAssessment?.passed).toBe(true);
    expect(iter2Result.verificationEvidence?.reviewerAssessment?.overallScore).toBeGreaterThanOrEqual(80);

    // Verify task state is now COMPLETED and mission status is COMPLETED
    const finalTask = taskEngine.getTask("task-auth-impl");
    expect(finalTask?.status).toBe("COMPLETED");

    const missionStatus = orchestrator.getMissionStatus("msn-replan-01");
    expect(missionStatus.status).toBe("COMPLETED");
  });
});
