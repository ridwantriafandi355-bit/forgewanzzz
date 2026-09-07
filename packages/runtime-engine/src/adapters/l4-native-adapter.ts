import { ToolExecutionEngine } from "@forge/tool-engine";
import { ExecutionRequest, ExecutionResponse } from "../types/runtime-types.js";

export class L4NativeAdapter {
  readonly id = "native-forge-runner";
  readonly trustLevel = "L4";

  constructor(private toolEngine: ToolExecutionEngine) {}

  async execute(req: ExecutionRequest): Promise<ExecutionResponse> {
    const res = await this.toolEngine.execute(req.toolName, req.args, req.token);
    return {
      success: res.success,
      output: res.output,
      error: res.error
    };
  }
}
