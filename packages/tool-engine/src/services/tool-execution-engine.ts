import { ExecutionToken, CapabilityDeniedError } from "@forge/core";
import { CapabilityResolver } from "@forge/capability-resolver";
import { SecretRedactor } from "@forge/auth-connections";
import { ToolResult, ToolRiskLevel, ToolDefinition } from "../types/tool.js";
import { WorkspaceJail } from "../guards/workspace-jail.js";
import { SSRFGuard } from "../guards/ssrf-filter.js";
import path from "node:path";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export class ToolExecutionEngine {
  private toolRegistry: Map<string, ToolDefinition> = new Map();
  private redactor: SecretRedactor;

  constructor(
    private capabilityResolver: CapabilityResolver,
    redactor?: SecretRedactor
  ) {
    this.redactor = redactor || new SecretRedactor();
    this.registerBuiltinTools();
  }

  private registerBuiltinTools(): void {
    this.registerTool({
      name: "filesystem.read",
      description: "Read file contents from authorized workspace",
      riskLevel: "LOW",
    });
    this.registerTool({
      name: "git.status",
      description: "Inspect git repository status",
      riskLevel: "LOW",
    });
    this.registerTool({
      name: "filesystem.write",
      description: "Write or edit file in authorized workspace",
      riskLevel: "MEDIUM",
    });
    this.registerTool({
      name: "http.request",
      description: "Send outbound HTTP request with SSRF protection",
      riskLevel: "MEDIUM",
    });
    this.registerTool({
      name: "shell.exec",
      description: "Execute shell command in workspace",
      riskLevel: "HIGH",
    });
    this.registerTool({
      name: "system.privileged_exec",
      description: "High privilege system mutation or deployment",
      riskLevel: "CRITICAL",
      requiresApproval: true,
    });
  }

  public registerTool(tool: ToolDefinition): void {
    this.toolRegistry.set(tool.name, tool);
  }

  public getToolDefinition(name: string): ToolDefinition | undefined {
    return this.toolRegistry.get(name);
  }

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

    // 3. Resolve Tool Risk & Check Human Approval Gate
    const toolDef = this.toolRegistry.get(toolName);
    const riskLevel: ToolRiskLevel = toolDef?.riskLevel || "MEDIUM";

    if (riskLevel === "CRITICAL" || toolDef?.requiresApproval) {
      const isExplicitlyApproved = args.__humanApproved === true;
      if (!isExplicitlyApproved) {
        return {
          success: false,
          requiresApproval: true,
          approvalStatus: "AWAITING_APPROVAL",
          riskLevel,
          error: `Execution halted: Tool '${toolName}' requires human operator approval`,
          executionTimeMs: Date.now() - start,
        };
      }
    }

    // 4. Dispatch Tool Execution
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
        case "http.request":
          output = await this.executeHttpRequest(args);
          break;
        case "system.privileged_exec":
          output = { message: "Privileged execution completed successfully" };
          break;
        default:
          throw new Error(`Unsupported tool: ${toolName}`);
      }

      return {
        success: true,
        output,
        riskLevel,
        executionTimeMs: Date.now() - start,
      };
    } catch (err: any) {
      if (err.message.includes("Path traversal") || err.message.includes("SSRF Violation")) {
        throw err;
      }
      return {
        success: false,
        error: this.redactor.redact(err.message),
        riskLevel,
        executionTimeMs: Date.now() - start,
      };
    }
  }

  private async executeFilesystemWrite(args: Record<string, unknown>, workspacePath: string): Promise<string> {
    const filePath = WorkspaceJail.resolveSafePath(String(args.path), workspacePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, String(args.content), "utf8");
    return `File written: ${args.path}`;
  }

  private async executeFilesystemRead(args: Record<string, unknown>, workspacePath: string): Promise<string> {
    const filePath = WorkspaceJail.resolveSafePath(String(args.path), workspacePath);
    const content = await fs.readFile(filePath, "utf8");
    return this.redactor.redact(content);
  }

  private async executeShell(args: Record<string, unknown>, workspacePath: string): Promise<{ stdout: string; stderr: string }> {
    const command = String(args.command);
    const { stdout, stderr } = await execAsync(command, { cwd: workspacePath });
    return {
      stdout: this.redactor.redact(stdout),
      stderr: this.redactor.redact(stderr),
    };
  }

  private async executeGitStatus(workspacePath: string): Promise<string> {
    const { stdout } = await execAsync("git status --porcelain", { cwd: workspacePath });
    return this.redactor.redact(stdout);
  }

  private async executeHttpRequest(args: Record<string, unknown>): Promise<{ status: number; body: string }> {
    const url = String(args.url);
    const allowPrivate = args.allowPrivate === true;

    // Check SSRF
    const ssrfCheck = SSRFGuard.isUrlAllowed(url, allowPrivate);
    if (!ssrfCheck.allowed) {
      throw new Error(ssrfCheck.reason);
    }

    // Mock HTTP result for testing and simulation
    return {
      status: 200,
      body: this.redactor.redact(`Response from ${url}`),
    };
  }
}
