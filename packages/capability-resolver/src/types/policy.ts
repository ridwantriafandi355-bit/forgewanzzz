import { TrustLevel } from "@forge/core";

export interface SecurityPolicy {
  projectId: string;
  allowedTools: string[];
  forbiddenTools: string[];
  minTrustLevel: TrustLevel;
  requireApprovalForTools: string[];
}

export interface ResolutionContext {
  taskId: string;
  agentId: string;
  runtimeId: string;
  runtimeTrustLevel: TrustLevel;
  requestedTools: string[];
  workspacePath: string;
}

export interface ResolutionDecision {
  allowed: boolean;
  requiresApproval: boolean;
  token?: {
    tokenId: string;
    taskId: string;
    agentId: string;
    runtimeId: string;
    workspacePath: string;
    allowedTools: string[];
    issuedAt: string;
    expiresAt: string;
    signature: string;
  };
  reason?: string;
}
