import { WorktreeInfo, MergeResult } from "../types/workspace.js";
import path from "node:path";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export class WorkspaceManager {
  private worktreesDir: string;

  constructor(private projectRoot: string) {
    this.worktreesDir = path.resolve(projectRoot, ".forge", "worktrees");
  }

  private normalizeTaskId(taskId: string): string {
    return taskId.startsWith("task-") ? taskId.slice(5) : taskId;
  }

  async createWorktree(taskId: string, baseBranch: string = "main"): Promise<WorktreeInfo> {
    const cleanId = this.normalizeTaskId(taskId);
    const branchName = `forge/task-${cleanId}`;
    const worktreePath = path.resolve(this.worktreesDir, `task-${cleanId}`);

    await fs.mkdir(this.worktreesDir, { recursive: true });

    // Create branch and worktree
    await execAsync(`git worktree add -b ${branchName} "${worktreePath}" ${baseBranch}`, {
      cwd: this.projectRoot
    });

    return {
      taskId,
      branchName,
      worktreePath,
      createdAt: new Date().toISOString()
    };
  }

  async mergeWorktree(taskId: string, targetBranch: string = "main"): Promise<MergeResult> {
    const cleanId = this.normalizeTaskId(taskId);
    const branchName = `forge/task-${cleanId}`;

    try {
      // Checkout target branch and merge
      await execAsync(`git checkout ${targetBranch}`, { cwd: this.projectRoot });
      await execAsync(`git merge ${branchName} --no-ff -m "merge: integrate ${branchName}"`, {
        cwd: this.projectRoot
      });

      const { stdout: commitHash } = await execAsync("git rev-parse HEAD", { cwd: this.projectRoot });

      return {
        success: true,
        commitHash: commitHash.trim()
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  async removeWorktree(taskId: string, force: boolean = true): Promise<void> {
    const cleanId = this.normalizeTaskId(taskId);
    const worktreePath = path.resolve(this.worktreesDir, `task-${cleanId}`);
    const branchName = `forge/task-${cleanId}`;

    try {
      const forceFlag = force ? "--force" : "";
      await execAsync(`git worktree remove ${forceFlag} "${worktreePath}"`, { cwd: this.projectRoot });
    } catch {}

    try {
      await execAsync(`git branch -D ${branchName}`, { cwd: this.projectRoot });
    } catch {}

    try {
      await fs.rm(worktreePath, { recursive: true, force: true });
    } catch {}
  }
}
