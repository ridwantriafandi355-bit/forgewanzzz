import { ExecutionToken as CoreExecutionToken, CapabilityDeniedError } from "@forge/core";
import { CapabilityResolver } from "@forge/capability-resolver";
import { SecretRedactor } from "@forge/auth-connections";
import {
  ExecutionTokenManager,
  AuditChain,
  type ExecutionToken as SecurityExecutionToken,
} from "@forge/security";
import { ToolResult, ToolRiskLevel, ToolDefinition } from "../types/tool.js";
import { WorkspaceJail } from "../guards/workspace-jail.js";
import { SSRFGuard } from "../guards/ssrf-filter.js";
import path from "node:path";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface ToolEngineSecurityOptions {
  tokenManager?: ExecutionTokenManager;
  auditChain?: AuditChain;
}

export class ToolExecutionEngine {
  private toolRegistry: Map<string, ToolDefinition> = new Map();
  private redactor: SecretRedactor;
  private tokenManager?: ExecutionTokenManager;
  private auditChain?: AuditChain;

  constructor(
    private capabilityResolver: CapabilityResolver,
    redactor?: SecretRedactor,
    securityOptions?: ToolEngineSecurityOptions
  ) {
    this.redactor = redactor || new SecretRedactor();
    this.tokenManager = securityOptions?.tokenManager;
    this.auditChain = securityOptions?.auditChain;
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

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    token: CoreExecutionToken | SecurityExecutionToken | string
  ): Promise<ToolResult> {
    const start = Date.now();
    let workspacePath = "";
    let actorId = "system";
    let taskId = "";

    // 1. Verify Token Authenticity and Validity
    if (this.tokenManager) {
      const validation = this.tokenManager.validateToken(token as any, { toolId: toolName });
      if (!validation.valid) {
        throw new CapabilityDeniedError(
          toolName,
          `Security verification failed: ${validation.reason}`
        );
      }

      let tokenId = "";
      if (typeof token === "string") {
        const des = this.tokenManager.deserializeToken(token);
        tokenId = des.payload.tokenId;
        workspacePath = des.payload.workspacePath ?? "";
        actorId = des.payload.agentId ?? "system";
        taskId = des.payload.taskId ?? "";
      } else if ((token as any).payload) {
        const secTok = token as SecurityExecutionToken;
        tokenId = secTok.payload.tokenId;
        workspacePath = secTok.payload.workspacePath ?? "";
        actorId = secTok.payload.agentId ?? "system";
        taskId = secTok.payload.taskId ?? "";
      } else {
        const coreTok = token as CoreExecutionToken;
        tokenId = coreTok.tokenId;
        workspacePath = coreTok.workspacePath;
        actorId = coreTok.agentId;
        taskId = coreTok.taskId;
      }
      this.tokenManager.recordInvocation(tokenId);
    } else {
      if (!this.capabilityResolver.verifyToken(token as any)) {
        throw new CapabilityDeniedError(
          toolName,
          "Invalid or expired ExecutionToken signature"
        );
      }

      const coreTok = token as CoreExecutionToken;
      if (!coreTok.allowedTools.includes(toolName) && !coreTok.allowedTools.includes("*")) {
        throw new CapabilityDeniedError(
          toolName,
          `Tool '${toolName}' is not authorized by this ExecutionToken`
        );
      }
      workspacePath = coreTok.workspacePath;
      actorId = coreTok.agentId;
      taskId = coreTok.taskId;
    }

    // 2. Resolve Tool Risk & Check Human Approval Gate
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

    // 3. Dispatch Tool Execution
    let output: unknown;
    try {
      switch (toolName) {
        case "filesystem.write":
          output = await this.executeFilesystemWrite(args, workspacePath);
          break;
        case "filesystem.read":
          output = await this.executeFilesystemRead(args, workspacePath);
          break;
        case "shell.exec":
          output = await this.executeShell(args, workspacePath);
          break;
        case "git.status":
          output = await this.executeGitStatus(workspacePath);
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

      if (this.auditChain) {
        this.auditChain.append({
          eventType: "TOOL_EXECUTED",
          actorId,
          payload: {
            toolName,
            taskId,
            success: true,
            riskLevel,
            executionTimeMs: Date.now() - start,
          },
        });
      }

      return {
        success: true,
        output,
        riskLevel,
        executionTimeMs: Date.now() - start,
      };
    } catch (err: any) {
      if (this.auditChain) {
        this.auditChain.append({
          eventType: "TOOL_FAILED",
          actorId,
          payload: {
            toolName,
            taskId,
            success: false,
            riskLevel,
            error: err.message,
          },
        });
      }

      if (
        err.message.includes("Path traversal") ||
        err.message.includes("SSRF Violation")
      ) {
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
