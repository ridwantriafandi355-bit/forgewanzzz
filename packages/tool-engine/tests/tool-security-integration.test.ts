import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ToolExecutionEngine } from "../src/services/tool-execution-engine.js";
import { CapabilityResolver, SecurityPolicy } from "@forge/capability-resolver";
import { ExecutionTokenManager, AuditChain } from "@forge/security";
import { ForgeDatabase, runMigrations, AuditChainRepository } from "@forge/storage";
import path from "node:path";
import fs from "node:fs/promises";

describe("ToolExecutionEngine Security Integration (Doc 17)", () => {
  const secretKey = "integration-security-master-key-32b!";
  const testWorkspace = path.resolve(process.cwd(), ".tmp-sec-workspace");

  const policy: SecurityPolicy = {
    projectId: "sec-project",
    allowedTools: ["filesystem.write", "filesystem.read"],
    forbiddenTools: [],
    minTrustLevel: "L1",
    requireApprovalForTools: [],
  };

  let db: ForgeDatabase;
  let auditRepo: AuditChainRepository;
  let auditChain: AuditChain;
  let tokenManager: ExecutionTokenManager;
  let resolver: CapabilityResolver;
  let engine: ToolExecutionEngine;

  beforeEach(async () => {
    await fs.mkdir(testWorkspace, { recursive: true });
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
    auditRepo = new AuditChainRepository(db, secretKey);
    auditChain = new AuditChain({ repo: auditRepo, secretKey });
    tokenManager = new ExecutionTokenManager({ secretKey, auditRepo });
    resolver = new CapabilityResolver(secretKey, policy);

    engine = new ToolExecutionEngine(resolver, undefined, {
      tokenManager,
      auditChain,
    });
  });

  afterEach(async () => {
    db.close();
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch {}
  });

  it("executes permitted tool using ExecutionTokenManager and logs to AuditChain", async () => {
    const token = tokenManager.mintToken({
      taskId: "task_sec_01",
      agentId: "agent.dev",
      workspacePath: testWorkspace,
      allowedTools: ["filesystem.write", "filesystem.read"],
      maxInvocations: 5,
    });

    const res = await engine.execute(
      "filesystem.write",
      {
        path: "sec-audit.txt",
        content: "Cryptographically Verified",
      },
      token
    );

    expect(res.success).toBe(true);

    // Verify audit chain contains the execution event
    const latest = auditChain.getLatestBlock();
    expect(latest).toBeDefined();
    expect(latest?.eventType).toBe("TOOL_EXECUTED");
    expect(latest?.actorId).toBe("agent.dev");
    expect(latest?.payload.toolName).toBe("filesystem.write");
    expect(latest?.payload.taskId).toBe("task_sec_01");

    // Verify chain integrity remains intact
    const audit = auditRepo.verifyChainIntegrity();
    expect(audit.valid).toBe(true);
  });

  it("rejects tool execution when token has been revoked", async () => {
    const token = tokenManager.mintToken({
      taskId: "task_sec_02",
      agentId: "agent.dev",
      workspacePath: testWorkspace,
      allowedTools: ["filesystem.read"],
    });

    // Revoke token before execution
    tokenManager.revokeToken(token.payload.tokenId, "Compromised credentials");

    await expect(
      engine.execute(
        "filesystem.read",
        { path: "test.txt" },
        token
      )
    ).rejects.toThrow(/Security verification failed: TOKEN_REVOKED/);
  });

  it("enforces invocation quota limits on tool execution", async () => {
    const token = tokenManager.mintToken({
      taskId: "task_sec_03",
      agentId: "agent.dev",
      workspacePath: testWorkspace,
      allowedTools: ["filesystem.write"],
      maxInvocations: 1, // Only 1 invocation allowed
    });

    // 1st invocation succeeds
    const res1 = await engine.execute(
      "filesystem.write",
      { path: "quota.txt", content: "first" },
      token
    );
    expect(res1.success).toBe(true);

    // 2nd invocation rejected
    await expect(
      engine.execute(
        "filesystem.write",
        { path: "quota.txt", content: "second" },
        token
      )
    ).rejects.toThrow(/Security verification failed: QUOTA_EXCEEDED/);
  });

  it("executes using serialized token string", async () => {
    const token = tokenManager.mintToken({
      taskId: "task_sec_04",
      agentId: "agent.dev",
      workspacePath: testWorkspace,
      allowedTools: ["filesystem.write"],
    });

    const tokenString = tokenManager.serializeToken(token);

    const res = await engine.execute(
      "filesystem.write",
      { path: "serialized.txt", content: "ok" },
      tokenString
    );
    expect(res.success).toBe(true);
  });
});
