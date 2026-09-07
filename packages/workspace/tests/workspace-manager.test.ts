import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorkspaceManager } from "../src/services/workspace-manager.js";
import path from "node:path";
import fs from "node:fs/promises";
import { execSync } from "node:child_process";

describe("WorkspaceManager", () => {
  const testRepoDir = path.resolve(process.cwd(), ".tmp-test-repo");

  beforeEach(async () => {
    await fs.mkdir(testRepoDir, { recursive: true });
    execSync("git init -b main", { cwd: testRepoDir });
    execSync('git config user.name "Test" && git config user.email "test@example.com"', { cwd: testRepoDir });
    await fs.writeFile(path.join(testRepoDir, "README.md"), "# Initial", "utf8");
    execSync('git add . && git commit -m "initial commit"', { cwd: testRepoDir });
  });

  afterEach(async () => {
    try {
      await fs.rm(testRepoDir, { recursive: true, force: true });
    } catch {}
  });

  it("creates, modifies, merges, and removes an isolated git worktree", async () => {
    const manager = new WorkspaceManager(testRepoDir);
    const taskId = "task-ui-101";

    // 1. Create worktree
    const info = await manager.createWorktree(taskId);
    expect(info.taskId).toBe(taskId);
    expect(info.branchName).toBe("forge/task-ui-101");
    expect(await fs.stat(info.worktreePath)).toBeDefined();

    // 2. Perform work inside worktree
    const fileInWorktree = path.join(info.worktreePath, "feature.txt");
    await fs.writeFile(fileInWorktree, "New Feature Content", "utf8");
    execSync('git add . && git commit -m "feat: add feature"', { cwd: info.worktreePath });

    // 3. Merge back to main
    const mergeResult = await manager.mergeWorktree(taskId);
    expect(mergeResult.success).toBe(true);

    // Verify file exists on main branch
    const fileInMain = path.join(testRepoDir, "feature.txt");
    const content = await fs.readFile(fileInMain, "utf8");
    expect(content).toBe("New Feature Content");

    // 4. Remove worktree
    await manager.removeWorktree(taskId);
    await expect(fs.stat(info.worktreePath)).rejects.toThrow();
  });
});
