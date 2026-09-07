import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ToolExecutionEngine } from "../src/services/tool-execution-engine.js";
import { CapabilityResolver, SecurityPolicy } from "@forge/capability-resolver";
import path from "node:path";
import fs from "node:fs/promises";

describe("ToolExecutionEngine", () => {
  const secretKey = "test-secret-key";
  const testWorkspace = path.resolve(process.cwd(), ".tmp-tool-workspace");

  const policy: SecurityPolicy = {
    projectId: "p1",
    allowedTools: ["filesystem.write", "filesystem.read", "shell.exec", "git.status"],
    forbiddenTools: [],
    minTrustLevel: "L1",
    requireApprovalForTools: []
  };

  const resolver = new CapabilityResolver(secretKey, policy);
  let engine: ToolExecutionEngine;

  beforeEach(async () => {
    await fs.mkdir(testWorkspace, { recursive: true });
    engine = new ToolExecutionEngine(resolver);
  });

  afterEach(async () => {
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch {}
  });

  it("executes permitted filesystem.write and filesystem.read tools within workspace", async () => {
    const decision = resolver.resolve({
      taskId: "t1",
      agentId: "agent.coder",
      runtimeId: "claude-code",
      runtimeTrustLevel: "L1",
      requestedTools: ["filesystem.write", "filesystem.read"],
      workspacePath: testWorkspace
    });

    const token = decision.token!;

    // 1. Write file
    const writeResult = await engine.execute("filesystem.write", {
      path: "hello.txt",
      content: "Hello Forge Wanzz!"
    }, token);

    expect(writeResult.success).toBe(true);

    // 2. Read file
    const readResult = await engine.execute("filesystem.read", {
      path: "hello.txt"
    }, token);

    expect(readResult.success).toBe(true);
    expect(readResult.output).toBe("Hello Forge Wanzz!");
  });

  it("rejects path traversal attempting to escape the workspace boundary", async () => {
    const decision = resolver.resolve({
      taskId: "t1",
      agentId: "agent.coder",
      runtimeId: "claude-code",
      runtimeTrustLevel: "L1",
      requestedTools: ["filesystem.write"],
      workspacePath: testWorkspace
    });

    const token = decision.token!;

    await expect(
      engine.execute("filesystem.write", {
        path: "../escaped.txt",
        content: "malicious"
      }, token)
    ).rejects.toThrow(/Path traversal detected/);
  });

  it("rejects execution when token does not grant requested tool", async () => {
    const decision = resolver.resolve({
      taskId: "t1",
      agentId: "agent.coder",
      runtimeId: "claude-code",
      runtimeTrustLevel: "L1",
      requestedTools: ["filesystem.read"],
      workspacePath: testWorkspace
    });

    const token = decision.token!;

    await expect(
      engine.execute("shell.exec", { command: "dir" }, token)
    ).rejects.toThrow(/not authorized/);
  });

  it("halts execution for CRITICAL risk tools awaiting human approval gate", async () => {
    const criticalPolicy: SecurityPolicy = {
      projectId: "p1",
      allowedTools: ["system.privileged_exec"],
      forbiddenTools: [],
      minTrustLevel: "L1",
      requireApprovalForTools: [],
    };
    const critResolver = new CapabilityResolver(secretKey, criticalPolicy);
    const critEngine = new ToolExecutionEngine(critResolver);

    const decision = critResolver.resolve({
      taskId: "t_crit",
      agentId: "agent.admin",
      runtimeId: "claude-code",
      runtimeTrustLevel: "L1",
      requestedTools: ["system.privileged_exec"],
      workspacePath: testWorkspace,
    });

    const token = decision.token!;

    // 1. Without human approval -> returns AWAITING_APPROVAL
    const unapprovedRes = await critEngine.execute("system.privileged_exec", {}, token);
    expect(unapprovedRes.success).toBe(false);
    expect(unapprovedRes.requiresApproval).toBe(true);
    expect(unapprovedRes.approvalStatus).toBe("AWAITING_APPROVAL");
    expect(unapprovedRes.riskLevel).toBe("CRITICAL");

    // 2. With human approval -> proceeds to execute
    const approvedRes = await critEngine.execute(
      "system.privileged_exec",
      { __humanApproved: true },
      token
    );
    expect(approvedRes.success).toBe(true);
    expect(approvedRes.output).toBeDefined();
  });

  it("blocks SSRF attempts on loopback and cloud metadata endpoints via SSRFGuard", async () => {
    const httpPolicy: SecurityPolicy = {
      projectId: "p1",
      allowedTools: ["http.request"],
      forbiddenTools: [],
      minTrustLevel: "L1",
      requireApprovalForTools: [],
    };
    const httpResolver = new CapabilityResolver(secretKey, httpPolicy);
    const httpEngine = new ToolExecutionEngine(httpResolver);

    const decision = httpResolver.resolve({
      taskId: "t_http",
      agentId: "agent.network",
      runtimeId: "claude-code",
      runtimeTrustLevel: "L1",
      requestedTools: ["http.request"],
      workspacePath: testWorkspace,
    });

    const token = decision.token!;

    // 1. Reject loopback
    await expect(
      httpEngine.execute("http.request", { url: "http://127.0.0.1:8080/admin" }, token)
    ).rejects.toThrow(/SSRF Violation: Loopback host/);

    // 2. Reject cloud metadata IP (AWS/GCP)
    await expect(
      httpEngine.execute("http.request", { url: "http://169.254.169.254/latest/meta-data" }, token)
    ).rejects.toThrow(/SSRF Violation: Link-local/);

    // 3. Reject RFC 1918 private subnet
    await expect(
      httpEngine.execute("http.request", { url: "http://192.168.1.1/router" }, token)
    ).rejects.toThrow(/SSRF Violation: Private RFC 1918/);

    // 4. Accept public outbound URL
    const publicRes = await httpEngine.execute(
      "http.request",
      { url: "https://api.github.com/repos" },
      token
    );
    expect(publicRes.success).toBe(true);
  });
});
