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
});
