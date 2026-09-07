import type { AgentRole, TeamFormationResult } from "@forge/org-manager";
import type { CompletionPolicy, VerificationEvidence } from "@forge/verification-engine";

export type MissionStatus =
  | "PLANNING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "PAUSED_FOR_HUMAN_OVERRIDE"
  | "FAILED";

export interface MissionStep {
  id: string;
  title: string;
  role: AgentRole;
  dependencies: string[];
  policy?: CompletionPolicy;
  commandChecks?: string[];
}

export interface MissionSpec {
  missionId: string;
  projectId: string;
  name: string;
  goal: string;
  steps: MissionStep[];
}

export interface MissionResult {
  missionId: string;
  status: MissionStatus;
  team: TeamFormationResult;
  stepsCount: number;
}

export interface StepExecutionResult {
  completed: boolean;
  taskId: string;
  verificationEvidence?: VerificationEvidence;
  error?: string;
}

export interface OrchestratorConfig {
  taskEngine: any;
  orgManager: any;
  verificationService: any;
  workspaceManager?: any;
}
