import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorkspaceManager } from "@forge/workspace";
import { CapabilityResolver, SecurityPolicy } from "@forge/capability-resolver";
import { ToolExecutionEngine } from "@forge/tool-engine";
import { RuntimeRouter, L4NativeAdapter, L1ExternalAdapter } from "../src/index.js";
import path from "node:path";
import fs from "node:fs/promises";
import { execSync } from "node:child_process";

describe("E2E Phase 3: Execution Layer & Workspace Isolation Integration", () => {
  const testRoot = path.resolve(process.cwd(), ".tmp-e2e-phase3");
  const secretKey = "phase3-secret-key-9988";

  const policy: SecurityPolicy = {
    projectId: "prj-phase3",
    allowedTools: ["filesystem.write", "filesystem.read", "shell.exec", "git.status"],
    forbiddenTools: ["shell.rm_rf"],
    minTrustLevel: "L1",
    requireApprovalForTools: []
  };

  let workspaceManager: WorkspaceManager;
  let capabilityResolver: CapabilityResolver;
  let toolEngine: ToolExecutionEngine;
  let runtimeRouter: RuntimeRouter;

  beforeEach(async () => {
    await fs.mkdir(testRoot, { recursive: true });
    execSync("git init -b main", { cwd: testRoot });
    execSync('git config user.name "Phase3 Test" && git config user.email "phase3@test.com"', { cwd: testRoot });
    await fs.writeFile(path.join(testRoot, "package.json"), '{"name": "root-app"}', "utf8");
    execSync('git add . && git commit -m "initial commit"', { cwd: testRoot });

    workspaceManager = new WorkspaceManager(testRoot);
    capabilityResolver = new CapabilityResolver(secretKey, policy);
    toolEngine = new ToolExecutionEngine(capabilityResolver);

    const l4 = new L4NativeAdapter(toolEngine);
    const l1 = new L1ExternalAdapter();
    runtimeRouter = new RuntimeRouter([l4, l1]);
  });

  afterEach(async () => {
    try {
      await fs.rm(testRoot, { recursive: true, force: true });
    } catch {}
  });

  it("proves end-to-end worktree isolation, token-gated file write, external execution, and sequential merge", async () => {
    const taskId = "task-backend-88";

    // 1. Create dedicated Git Worktree for Task
    const worktreeInfo = await workspaceManager.createWorktree(taskId);
    expect(worktreeInfo.branchName).toBe("forge/task-backend-88");

    // 2. Request and receive ExecutionToken scoped strictly to this worktree
    const decision = capabilityResolver.resolve({
      taskId,
      agentId: "agent.backend.coder",
      runtimeId: "native-forge-runner",
      runtimeTrustLevel: "L4",
      requestedTools: ["filesystem.write", "filesystem.read"],
      workspacePath: worktreeInfo.worktreePath
    });

    expect(decision.allowed).toBe(true);
    const token = decision.token!;

    // 3. Dispatch L4 native tool execution to write a service file in worktree
    const writeResponse = await runtimeRouter.dispatch({
      runtimeId: "native-forge-runner",
      toolName: "filesystem.write",
      args: {
        path: "src/service.ts",
        content: "export const compute = () => 42;"
      },
      token
    });

    expect(writeResponse.success).toBe(true);

    // 4. Verify file was written to the isolated worktree
    const fileInWorktree = path.join(worktreeInfo.worktreePath, "src", "service.ts");
    expect(await fs.readFile(fileInWorktree, "utf8")).toBe("export const compute = () => 42;");

    // 5. Verify file does NOT yet exist on the main branch (strict isolation)
    const fileInMain = path.join(testRoot, "src", "service.ts");
    await expect(fs.stat(fileInMain)).rejects.toThrow();

    // 6. Execute external command in worktree to stage and commit
    const commitCmd = await runtimeRouter.executeExternalCommand({
      command: 'git add . && git commit -m "feat(backend): implement compute service"',
      cwd: worktreeInfo.worktreePath,
      timeoutMs: 10000
    });
    expect(commitCmd.exitCode).toBe(0);

    // 7. Sequentially merge the verified worktree back into main
    const mergeResult = await workspaceManager.mergeWorktree(taskId);
    expect(mergeResult.success).toBe(true);

    // 8. Now file exists on main branch
    expect(await fs.readFile(fileInMain, "utf8")).toBe("export const compute = () => 42;");

    // 9. Clean up worktree
    await workspaceManager.removeWorktree(taskId);
    await expect(fs.stat(worktreeInfo.worktreePath)).rejects.toThrow();
  });
});
