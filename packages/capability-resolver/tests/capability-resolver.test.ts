import { describe, it, expect } from "vitest";
import { CapabilityResolver } from "../src/services/capability-resolver.js";
import { SecurityPolicy } from "../src/types/policy.js";

describe("CapabilityResolver", () => {
  const secretKey = "forge-secret-signing-key";
  const policy: SecurityPolicy = {
    projectId: "p1",
    allowedTools: ["filesystem.read", "filesystem.write", "git.status"],
    forbiddenTools: ["shell.rm_rf", "cloud.deploy"],
    minTrustLevel: "L1",
    requireApprovalForTools: ["filesystem.write"]
  };

  const resolver = new CapabilityResolver(secretKey, policy);

  it("issues a signed ExecutionToken when all capabilities are permitted", () => {
    const decision = resolver.resolve({
      taskId: "task-1",
      agentId: "agent.coder",
      runtimeId: "claude-code",
      runtimeTrustLevel: "L1",
      requestedTools: ["filesystem.read", "git.status"],
      workspacePath: "/workspace/worktrees/task-1"
    });

    expect(decision.allowed).toBe(true);
    expect(decision.token).toBeDefined();
    expect(decision.requiresApproval).toBe(false);

    const isValid = resolver.verifyToken(decision.token!);
    expect(isValid).toBe(true);
  });

  it("detects when human approval is required for sensitive tools", () => {
    const decision = resolver.resolve({
      taskId: "task-2",
      agentId: "agent.coder",
      runtimeId: "claude-code",
      runtimeTrustLevel: "L1",
      requestedTools: ["filesystem.write"],
      workspacePath: "/workspace/worktrees/task-2"
    });

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });

  it("denies execution when requested tool is forbidden or unlisted", () => {
    const decision = resolver.resolve({
      taskId: "task-3",
      agentId: "agent.rogue",
      runtimeId: "claude-code",
      runtimeTrustLevel: "L1",
      requestedTools: ["shell.rm_rf"],
      workspacePath: "/workspace/worktrees/task-3"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.token).toBeUndefined();
    expect(decision.reason).toContain("forbidden");
  });

  it("denies execution when runtime trust level falls below policy floor", () => {
    const strictPolicy: SecurityPolicy = {
      ...policy,
      minTrustLevel: "L3" // Requires container sandbox
    };
    const strictResolver = new CapabilityResolver(secretKey, strictPolicy);

    const decision = strictResolver.resolve({
      taskId: "task-4",
      agentId: "agent.coder",
      runtimeId: "untrusted-cli",
      runtimeTrustLevel: "L1",
      requestedTools: ["filesystem.read"],
      workspacePath: "/workspace/worktrees/task-4"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Trust level");
  });
});
