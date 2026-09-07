export type TaskStatus =
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "CHECKPOINTING"
  | "RETRYING"
  | "COMPLETED"
  | "FAILED";

export interface TaskRecord {
  id: string;
  missionId: string;
  name: string;
  assignedAgentId?: string;
  status: TaskStatus;
  priority: number;
  idempotencyKey: string;
  dependencies: string[];
  inputPayload: Record<string, unknown>;
  outputPayload?: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
  timeoutMs: number;
  requireVerification: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLease {
  executionId: string;
  taskId: string;
  agentId: string;
  runtimeId: string;
  workspacePath: string;
  processGroupId?: number;
  heartbeatTimestamp: string;
  leaseDurationSeconds: number;
  leaseExpiresAt: string;
  status: "ACTIVE" | "RELEASED" | "EXPIRED" | "REVOKED";
}
