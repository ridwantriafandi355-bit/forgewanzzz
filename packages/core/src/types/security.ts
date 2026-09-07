export interface ExecutionToken {
  tokenId: string;
  taskId: string;
  agentId: string;
  runtimeId: string;
  workspacePath: string;
  allowedTools: string[];
  issuedAt: string;
  expiresAt: string;
  signature: string;
}
