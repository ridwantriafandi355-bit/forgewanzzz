export interface ToolResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: string;
  executionTimeMs: number;
}
