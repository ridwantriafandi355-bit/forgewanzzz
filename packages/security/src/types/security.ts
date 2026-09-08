export interface ExecutionTokenPayload {
  tokenId: string;
  taskId: string;
  missionId?: string;
  agentId: string;
  runtimeId?: string;
  workspacePath?: string;
  allowedTools: string[];
  maxInvocations: number;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

export interface ExecutionToken {
  payload: ExecutionTokenPayload;
  signature: string;
}

export interface TokenValidationResult {
  valid: boolean;
  reason?: string;
  remainingInvocations?: number;
}

export interface MintTokenOptions {
  tokenId?: string;
  taskId: string;
  missionId?: string;
  agentId: string;
  runtimeId?: string;
  workspacePath?: string;
  allowedTools: string[];
  maxInvocations?: number;
  ttlMs?: number;
  nonce?: string;
}

export interface Layer1Proof {
  proofId: string;
  taskId: string;
  exitCode: number;
  gitCommitSha?: string;
  testOutputHash?: string;
  timestamp: string;
  attestorId: string;
  signature: string;
}

export interface ProofAttestationResult {
  valid: boolean;
  reason?: string;
  proof?: Layer1Proof;
}

export interface Layer1AttestationInput {
  taskId: string;
  exitCode: number;
  gitCommitSha?: string;
  testOutput?: string;
  attestorId?: string;
}
