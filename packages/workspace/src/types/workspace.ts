export interface WorktreeInfo {
  taskId: string;
  branchName: string;
  worktreePath: string;
  createdAt: string;
}

export interface MergeResult {
  success: boolean;
  commitHash?: string;
  error?: string;
}
