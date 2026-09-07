import { ExecutionToken } from "@forge/core";

export interface ExecutionRequest {
  runtimeId: string;
  toolName: string;
  args: Record<string, unknown>;
  token: ExecutionToken;
}

export interface ExecutionResponse {
  success: boolean;
  output?: unknown;
  error?: string;
}

export interface ExternalCommandRequest {
  command: string;
  cwd: string;
  timeoutMs?: number;
  onHeartbeat?: (timestamp: string) => void;
}

export interface ExternalCommandResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  processGroupId?: number;
}
