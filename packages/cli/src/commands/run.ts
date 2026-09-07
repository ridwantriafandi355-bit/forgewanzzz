import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { ForgeDatabase, TaskRepository, LeaseRepository } from "@forge/storage";
import { EventBus } from "@forge/core";
import { TaskEngineService } from "@forge/task-engine";
import { OrganizationManager } from "@forge/org-manager";
import { VerificationService } from "@forge/verification-engine";
import { OrchestratorService, MissionSpec, MissionStep } from "@forge/orchestration-engine";

export interface RunOptions {
  workspaceRoot?: string;
  missionName: string;
  goal: string;
  steps: MissionStep[];
  simulateExitCode?: number;
}

export interface RunResult {
  success: boolean;
  missionId: string;
  status: string;
  stepsExecuted: number;
}

export async function runCommand(options: RunOptions): Promise<RunResult> {
  const root = options.workspaceRoot || process.cwd();
  const dbPath = path.join(root, ".forge", "forge.db");

  const db = new ForgeDatabase(dbPath);
  const taskRepo = new TaskRepository(db);
  const leaseRepo = new LeaseRepository(db);
  const eventBus = new EventBus();

  const taskEngine = new TaskEngineService(taskRepo, leaseRepo, eventBus);
  const orgManager = new OrganizationManager();
  const verificationService = new VerificationService();

  const orchestrator = new OrchestratorService({
    taskEngine,
    orgManager,
    verificationService,
  });

  const missionId = `msn_${randomUUID().slice(0, 8)}`;
  const projectId = "default-project";

  // Ensure mission record exists in SQLite for foreign key constraint
  const raw = db.getRawDb();
  const now = new Date().toISOString();
  raw.prepare(
    "INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)"
  ).run(missionId, projectId, options.missionName, now, now);

  const missionSpec: MissionSpec = {
    missionId,
    projectId,
    name: options.missionName,
    goal: options.goal,
    steps: options.steps,
  };

  await orchestrator.startMission(missionSpec);

  let stepsExecuted = 0;
  let status = "IN_PROGRESS";

  // Coordination execution loop
  while (stepsExecuted < 50) {
    const stepResult = await orchestrator.executeNextStep(missionId, {
      simulateCheckExitCode: options.simulateExitCode ?? 0,
    });

    if (stepResult.taskId) {
      stepsExecuted++;
    }

    const currentStatus = orchestrator.getMissionStatus(missionId);
    status = currentStatus.status;

    if (status === "COMPLETED" || status === "PAUSED_FOR_HUMAN_OVERRIDE" || status === "FAILED") {
      break;
    }

    if (!stepResult.taskId && stepResult.completed) {
      status = "COMPLETED";
      break;
    }
  }

  db.close();

  return {
    success: status === "COMPLETED",
    missionId,
    status,
    stepsExecuted,
  };
}
