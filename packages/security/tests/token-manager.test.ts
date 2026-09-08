import { describe, it, expect, beforeEach } from "vitest";
import { ExecutionTokenManager } from "../src/services/token-manager.js";
import { ForgeDatabase, runMigrations, AuditChainRepository } from "@forge/storage";

describe("ExecutionTokenManager (Doc 17)", () => {
  let tokenManager: ExecutionTokenManager;
  let db: ForgeDatabase;
  let auditRepo: AuditChainRepository;

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
    auditRepo = new AuditChainRepository(db, "test-security-secret-key-32b!!!");
    tokenManager = new ExecutionTokenManager({
      secretKey: "test-security-secret-key-32b!!!",
      auditRepo,
    });
  });

  it("mints and validates an execution token successfully", () => {
    const token = tokenManager.mintToken({
      taskId: "tsk_001",
      agentId: "agent.coder",
      allowedTools: ["filesystem.read", "filesystem.write"],
      maxInvocations: 5,
    });

    expect(token.payload.tokenId).toBeDefined();
    expect(token.payload.nonce).toBeDefined();
    expect(token.signature).toBeDefined();

    const validation = tokenManager.validateToken(token, {
      toolId: "filesystem.read",
      taskId: "tsk_001",
      agentId: "agent.coder",
    });

    expect(validation.valid).toBe(true);
    expect(validation.remainingInvocations).toBe(5);
  });

  it("serializes and deserializes token correctly", () => {
    const token = tokenManager.mintToken({
      taskId: "tsk_002",
      agentId: "agent.worker",
      allowedTools: ["git.commit"],
    });

    const serialized = tokenManager.serializeToken(token);
    expect(serialized.startsWith("forge_sec_v1.")).toBe(true);

    const deserialized = tokenManager.deserializeToken(serialized);
    expect(deserialized.payload.tokenId).toBe(token.payload.tokenId);
    expect(deserialized.signature).toBe(token.signature);

    const validation = tokenManager.validateToken(serialized, {
      toolId: "git.commit",
      taskId: "tsk_002",
    });
    expect(validation.valid).toBe(true);
  });

  it("rejects token when signature is tampered with", () => {
    const token = tokenManager.mintToken({
      taskId: "tsk_003",
      agentId: "agent.worker",
      allowedTools: ["filesystem.write"],
    });

    const tamperedToken = {
      ...token,
      payload: {
        ...token.payload,
        allowedTools: ["filesystem.write", "system.root_exec"], // unauthorized privilege escalation
      },
    };

    const validation = tokenManager.validateToken(tamperedToken, {
      toolId: "system.root_exec",
      taskId: "tsk_003",
    });

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe("INVALID_SIGNATURE");
  });

  it("rejects expired token", () => {
    const token = tokenManager.mintToken({
      taskId: "tsk_004",
      agentId: "agent.worker",
      allowedTools: ["filesystem.read"],
      ttlMs: -1000, // already expired
    });

    const validation = tokenManager.validateToken(token, {
      toolId: "filesystem.read",
      taskId: "tsk_004",
    });

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe("TOKEN_EXPIRED");
  });

  it("rejects unauthorized tool invocation outside token scope", () => {
    const token = tokenManager.mintToken({
      taskId: "tsk_005",
      agentId: "agent.worker",
      allowedTools: ["filesystem.read"],
    });

    const validation = tokenManager.validateToken(token, {
      toolId: "filesystem.write", // not permitted
      taskId: "tsk_005",
    });

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe("TOOL_NOT_PERMITTED");
  });

  it("allows wildcard tool permission", () => {
    const token = tokenManager.mintToken({
      taskId: "tsk_006",
      agentId: "agent.worker",
      allowedTools: ["*"],
    });

    const val1 = tokenManager.validateToken(token, {
      toolId: "any.arbitrary.tool",
      taskId: "tsk_006",
    });
    expect(val1.valid).toBe(true);
  });

  it("rejects task or agent mismatch", () => {
    const token = tokenManager.mintToken({
      taskId: "tsk_007",
      agentId: "agent.worker",
      allowedTools: ["filesystem.read"],
    });

    const valTask = tokenManager.validateToken(token, {
      toolId: "filesystem.read",
      taskId: "tsk_different",
    });
    expect(valTask.valid).toBe(false);
    expect(valTask.reason).toBe("TASK_SCOPE_MISMATCH");

    const valAgent = tokenManager.validateToken(token, {
      toolId: "filesystem.read",
      taskId: "tsk_007",
      agentId: "agent.impostor",
    });
    expect(valAgent.valid).toBe(false);
    expect(valAgent.reason).toBe("AGENT_SCOPE_MISMATCH");
  });

  it("enforces invocation quota limits", () => {
    const token = tokenManager.mintToken({
      taskId: "tsk_008",
      agentId: "agent.worker",
      allowedTools: ["filesystem.read"],
      maxInvocations: 2,
    });

    // 1st invocation
    expect(tokenManager.validateToken(token, { toolId: "filesystem.read" }).valid).toBe(true);
    tokenManager.recordInvocation(token.payload.tokenId);

    // 2nd invocation
    expect(tokenManager.validateToken(token, { toolId: "filesystem.read" }).valid).toBe(true);
    tokenManager.recordInvocation(token.payload.tokenId);

    // 3rd invocation exceeds quota
    const val3 = tokenManager.validateToken(token, { toolId: "filesystem.read" });
    expect(val3.valid).toBe(false);
    expect(val3.reason).toBe("QUOTA_EXCEEDED");
    expect(val3.remainingInvocations).toBe(0);
  });

  it("enforces revocation via audit repository", () => {
    const token = tokenManager.mintToken({
      taskId: "tsk_009",
      agentId: "agent.worker",
      allowedTools: ["filesystem.read"],
    });

    expect(tokenManager.validateToken(token, { toolId: "filesystem.read" }).valid).toBe(true);

    tokenManager.revokeToken(token.payload.tokenId, "Suspected credential exposure");
    expect(tokenManager.isRevoked(token.payload.tokenId)).toBe(true);

    const valRevoked = tokenManager.validateToken(token, { toolId: "filesystem.read" });
    expect(valRevoked.valid).toBe(false);
    expect(valRevoked.reason).toBe("TOKEN_REVOKED");
  });
});
