import { ExternalCommandRequest, ExternalCommandResponse } from "../types/runtime-types.js";
import { spawn } from "node:child_process";

export class L1ExternalAdapter {
  readonly id = "external-cli-runner";
  readonly trustLevel = "L1";

  async executeCommand(req: ExternalCommandRequest): Promise<ExternalCommandResponse> {
    const start = Date.now();
    const timeoutMs = req.timeoutMs ?? 30000;

    return new Promise((resolve) => {
      const child = spawn(req.command, {
        cwd: req.cwd,
        shell: true,
        detached: false
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      // Heartbeat timer every 5s
      const heartbeatTimer = setInterval(() => {
        if (req.onHeartbeat) req.onHeartbeat(new Date().toISOString());
      }, 5000);

      // Timeout timer
      const timeoutTimer = setTimeout(() => {
        clearInterval(heartbeatTimer);
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1000);
      }, timeoutMs);

      child.on("close", (code) => {
        clearInterval(heartbeatTimer);
        clearTimeout(timeoutTimer);
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          durationMs: Date.now() - start,
          processGroupId: child.pid
        });
      });

      child.on("error", (err) => {
        clearInterval(heartbeatTimer);
        clearTimeout(timeoutTimer);
        resolve({
          exitCode: 1,
          stdout,
          stderr: err.message,
          durationMs: Date.now() - start,
          processGroupId: child.pid
        });
      });
    });
  }
}
