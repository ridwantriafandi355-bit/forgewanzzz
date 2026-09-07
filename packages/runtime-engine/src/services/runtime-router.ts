import { L4NativeAdapter } from "../adapters/l4-native-adapter.js";
import { L1ExternalAdapter } from "../adapters/l1-external-adapter.js";
import {
  ExecutionRequest,
  ExecutionResponse,
  ExternalCommandRequest,
  ExternalCommandResponse
} from "../types/runtime-types.js";

export class RuntimeRouter {
  private nativeAdapter?: L4NativeAdapter;
  private externalAdapter?: L1ExternalAdapter;

  constructor(adapters: (L4NativeAdapter | L1ExternalAdapter)[]) {
    for (const a of adapters) {
      if (a instanceof L4NativeAdapter) this.nativeAdapter = a;
      if (a instanceof L1ExternalAdapter) this.externalAdapter = a;
    }
  }

  async dispatch(req: ExecutionRequest): Promise<ExecutionResponse> {
    if (!this.nativeAdapter) {
      throw new Error("L4NativeAdapter is not registered");
    }
    return await this.nativeAdapter.execute(req);
  }

  async executeExternalCommand(req: ExternalCommandRequest): Promise<ExternalCommandResponse> {
    if (!this.externalAdapter) {
      throw new Error("L1ExternalAdapter is not registered");
    }
    return await this.externalAdapter.executeCommand(req);
  }
}
