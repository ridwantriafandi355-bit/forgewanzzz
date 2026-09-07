import { ExecutionToken, CapabilityDeniedError } from "@forge/core";
import { CapabilityResolver } from "@forge/capability-resolver";
import { ToolResult } from "../types/tool.js";
import path from "node:path";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export class ToolExecutionEngine {
  constructor(private capabilityResolver: CapabilityResolver) {}

  async execute(toolName: string, args: Record<string, unknown>, token: ExecutionToken): Promise<ToolResult> {
    const start = Date.now();

    // 1. Verify Token Authenticity and Validity
    if (!this.capabilityResolver.verifyToken(token)) {
      throw new CapabilityDeniedError(toolName, "Invalid or expired ExecutionToken signature");
    }

    // 2. Verify Tool is Granted by Token
    if (!token.allowedTools.includes(toolName)) {
      throw new CapabilityDeniedError(toolName, `Tool '${toolName}' is not authorized by this ExecutionToken`);
    }

    // 3. Dispatch Tool
    let output: unknown;
    try {
      switch (toolName) {
        case "filesystem.write":
          output = await this.executeFilesystemWrite(args, token.workspacePath);
          break;
        case "filesystem.read":
          output = await this.executeFilesystemRead(args, token.workspacePath);
          break;
        case "shell.exec":
          output = await this.executeShell(args, token.workspacePath);
          break;
        case "git.status":
          output = await this.executeGitStatus(token.workspacePath);
          break;
        default:
          throw new Error(`Unsupported tool: ${toolName}`);
      }

      return {
        success: true,
        output,
        executionTimeMs: Date.now() - start
      };
    } catch (err: any) {
      if (err.message.includes("Path traversal")) throw err;
      return {
        success: false,
        error: err.message,
        executionTimeMs: Date.now() - start
      };
    }
  }

  private resolveSafePath(relPath: string, workspacePath: string): string {
    const resolved = path.resolve(workspacePath, relPath);
    const normalizedWs = path.resolve(workspacePath);

    if (!resolved.startsWith(normalizedWs)) {
      throw new Error(`Path traversal detected: '${relPath}' escapes workspace '${workspacePath}'`);
    }
    return resolved;
  }

  private async executeFilesystemWrite(args: Record<string, unknown>, workspacePath: string): Promise<string> {
    const filePath = this.resolveSafePath(String(args.path), workspacePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, String(args.content), "utf8");
    return `File written: ${args.path}`;
  }

  private async executeFilesystemRead(args: Record<string, unknown>, workspacePath: string): Promise<string> {
    const filePath = this.resolveSafePath(String(args.path), workspacePath);
    return await fs.readFile(filePath, "utf8");
  }

  private async executeShell(args: Record<string, unknown>, workspacePath: string): Promise<{ stdout: string; stderr: string }> {
    const command = String(args.command);
    const { stdout, stderr } = await execAsync(command, { cwd: workspacePath });
    return { stdout, stderr };
  }

  private async executeGitStatus(workspacePath: string): Promise<string> {
    const { stdout } = await execAsync("git status --porcelain", { cwd: workspacePath });
    return stdout;
  }
}
