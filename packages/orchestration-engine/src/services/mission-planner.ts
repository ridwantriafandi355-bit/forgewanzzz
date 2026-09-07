import type { ProposedTask } from "@forge/task-engine";
import type { MissionSpec } from "../types/orchestration.js";

export class MissionPlanner {
  planTaskGraph(mission: MissionSpec): ProposedTask[] {
    return mission.steps.map((step) => ({
      id: step.id,
      name: step.title,
      dependencies: step.dependencies,
      inputPayload: {
        missionId: mission.missionId,
        projectId: mission.projectId,
        role: step.role,
        policy: step.policy || "AUTOMATED",
      },
      requireVerification: true,
    }));
  }
}
