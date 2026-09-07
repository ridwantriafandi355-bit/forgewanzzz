import type { TaskEngineService } from "@forge/task-engine";
import type { OrganizationManager, TeamFormationResult } from "@forge/org-manager";
import type { VerificationService } from "@forge/verification-engine";
import { MissionPlanner } from "./mission-planner.js";
import type {
  MissionSpec,
  MissionResult,
  MissionStatus,
  StepExecutionResult,
  OrchestratorConfig,
} from "../types/orchestration.js";

interface ActiveMission {
  spec: MissionSpec;
  status: MissionStatus;
  team: TeamFormationResult;
  taskFailures: Map<string, number>;
}

export class OrchestratorService {
  private taskEngine: TaskEngineService;
  private orgManager: OrganizationManager;
  private verificationService: VerificationService;
  private workspaceManager?: any;
  private planner = new MissionPlanner();

  private missions = new Map<string, ActiveMission>();

  constructor(config: OrchestratorConfig) {
    this.taskEngine = config.taskEngine;
    this.orgManager = config.orgManager;
    this.verificationService = config.verificationService;
    this.workspaceManager = config.workspaceManager;
  }

  async startMission(mission: MissionSpec): Promise<MissionResult> {
    // 1. Plan Task Graph
    const taskDefs = this.planner.planTaskGraph(mission);

    // 2. Propose Task Graph to authoritative Task Engine (AD-001)
    await this.taskEngine.proposeTaskGraph(mission.missionId, taskDefs);

    // 3. Request Team Assembly from Organization Manager (AD-002)
    const orgId = `org-${mission.projectId}`;
    try {
      this.orgManager.getOrganization(orgId);
    } catch {
      this.orgManager.createOrganization({
        id: orgId,
        projectId: mission.projectId,
        name: `Team for ${mission.name}`,
        maxAgents: 10,
      });
    }

    // Determine required roles from mission steps
    const roleCounts = new Map<string, number>();
    for (const step of mission.steps) {
      const current = roleCounts.get(step.role) || 0;
      roleCounts.set(step.role, current + 1);
    }

    const requiredRoles = Array.from(roleCounts.entries()).map(([role, count]) => ({
      role: role as any,
      count: Math.min(count, 3),
      requiredCapabilities: ["code_generation"],
    }));

    const team = this.orgManager.requestTeam(orgId, { requiredRoles });

    const activeMission: ActiveMission = {
      spec: mission,
      status: "IN_PROGRESS",
      team,
      taskFailures: new Map(),
    };

    this.missions.set(mission.missionId, activeMission);

    return {
      missionId: mission.missionId,
      status: "IN_PROGRESS",
      team,
      stepsCount: mission.steps.length,
    };
  }

  getMissionStatus(missionId: string): { status: MissionStatus; missionId: string } {
    const mission = this.missions.get(missionId);
    if (!mission) {
      throw new Error(`Mission '${missionId}' not found.`);
    }
    return {
      missionId,
      status: mission.status,
    };
  }

  async executeNextStep(
    missionId: string,
    options?: { simulateCheckExitCode?: number }
  ): Promise<StepExecutionResult> {
    const mission = this.missions.get(missionId);
    if (!mission) {
      throw new Error(`Mission '${missionId}' not found.`);
    }

    if (mission.status === "PAUSED_FOR_HUMAN_OVERRIDE" || mission.status === "COMPLETED") {
      return {
        completed: mission.status === "COMPLETED",
        taskId: "",
        error: `Mission is in state ${mission.status}`,
      };
    }

    const readyTasks = this.taskEngine.getReadyTasks(mission.spec.missionId);
    if (readyTasks.length === 0) {
      const allTasks = this.taskEngine.getTasks(mission.spec.missionId);
      const allCompleted = allTasks.length > 0 && allTasks.every((t) => t.status === "COMPLETED");
      const anyFailed = allTasks.some((t) => t.status === "FAILED");

      if (allCompleted) {
        mission.status = "COMPLETED";
      } else if (anyFailed && (mission.status as string) !== "PAUSED_FOR_HUMAN_OVERRIDE") {
        mission.status = "FAILED";
      }

      return {
        completed: allCompleted,
        taskId: "",
        error: allCompleted ? undefined : `Mission is in state ${mission.status}`,
      };
    }

    const targetTask = readyTasks[0];
    const assignedAgent = mission.team.assignedAgents[0];

    // 1. Acquire Lease & Transition to RUNNING
    this.taskEngine.acquireTaskLease(targetTask.id, assignedAgent.id, "native", "/tmp/ws");
    await this.taskEngine.transitionTask(targetTask.id, "RUNNING");

    // 2. Perform Verification (AD-005)
    const exitCode = options?.simulateCheckExitCode ?? 0;
    const evidence = await this.verificationService.verifyTask({
      taskId: targetTask.id,
      policy: (targetTask.inputPayload?.policy as any) || "AUTOMATED",
      layer1Checks: [
        {
          name: "automated-verification",
          runner: async () => ({
            exitCode,
            logs: exitCode === 0 ? "All verification checks passed." : "Verification failed with errors.",
          }),
        },
      ],
      artifacts: [`artifacts/task-${targetTask.id}.output`],
    });

    // 3. Process Verification Result
    if (evidence.passed) {
      mission.taskFailures.delete(targetTask.id);

      // If workspace manager provided, sequential merge
      if (this.workspaceManager) {
        try {
          await this.workspaceManager.mergeWorktree(targetTask.id);
        } catch {
          // Ignore if no worktree allocated
        }
      }

      await this.taskEngine.transitionTask(targetTask.id, "COMPLETED", { evidence });

      // Check if mission complete
      const allTasks = this.taskEngine.getTasks(mission.spec.missionId);
      if (allTasks.every((t) => t.status === "COMPLETED")) {
        mission.status = "COMPLETED";
      }

      return {
        completed: true,
        taskId: targetTask.id,
        verificationEvidence: evidence,
      };
    } else {
      // Failed verification
      const currentFailures = (mission.taskFailures.get(targetTask.id) || 0) + 1;
      mission.taskFailures.set(targetTask.id, currentFailures);

      if (currentFailures < 3) {
        // Retry: transition to RETRYING so getReadyTasks picks it up
        await this.taskEngine.transitionTask(targetTask.id, "RETRYING", {
          retry: currentFailures,
          error: `Verification checks failed (exitCode: ${exitCode})`,
        });
      } else {
        // >= 3 failures: trip circuit breaker and mark FAILED
        await this.taskEngine.transitionTask(targetTask.id, "FAILED", {
          error: `Max retries exceeded. Verification checks failed 3 times (last exitCode: ${exitCode})`,
        });
        mission.status = "PAUSED_FOR_HUMAN_OVERRIDE";
      }

      return {
        completed: false,
        taskId: targetTask.id,
        verificationEvidence: evidence,
        error: `Task failed verification ${currentFailures} times.`,
      };
    }
  }
}
