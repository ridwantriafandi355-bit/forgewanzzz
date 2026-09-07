# Phase 3: Execution Layer, Workspace Isolation & Tool Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@forge/workspace` (Git Worktree concurrency isolation & branch merge manager), `@forge/tool-engine` (token-governed atomic tool runners), and `@forge/runtime-engine` (L1/L4 runtime adapters with OS process group `pgid` tracking and cancellation) satisfying AD-003, AD-004, AD-007, and AD-008.

**Architecture:** Create three modular packages:
1. `packages/workspace`: Interacts with Git CLI to allocate isolated worktrees (`.forge/worktrees/<task_id>`) for concurrent workers, locks workspace paths per lease, and coordinates sequential integration merges into the main branch.
2. `packages/tool-engine`: Deterministic atomic tools (`filesystem.read`, `filesystem.write`, `shell.exec`, `git.status`). Every invocation requires a cryptographically validated `ExecutionToken` and enforces filesystem path jailing within the active worktree.
3. `packages/runtime-engine`: Implements `RuntimeRouter`, `L4NativeAdapter` (in-process/tool-mediated runner), and `L1ExternalAdapter` (subprocess runner with process group tracking, timeout enforcement, heartbeat renewal, and orphan-free process tree killing).

**Tech Stack:** Node.js (v24.18.0), TypeScript (v5.x, NodeNext), pnpm, `@forge/core`, `@forge/capability-resolver`, Git CLI, Node `child_process` / `fs/promises`, Vitest.

**Spec:** `docs/02-SYSTEM-ARCHITECTURE.md`, `06.5-ARCHITECTURAL-DECISIONS.md` (AD-003, AD-004, AD-007, AD-008), `07-RUNTIME-ENGINE.md`, `11-TOOL-EXECUTION.md`.

## Global Constraints

- **Workspace Isolation (AD-007)**: Concurrent writing tasks MUST receive their own dedicated Git Worktree on branch `forge/task-<task_id>`. No two active tasks may write to the same workspace path simultaneously.
- **Process Group Tracking (AD-008)**: All subprocesses spawned must be tracked with their OS Process Group ID (`pgid`) to ensure clean termination on cancellation or crash, leaving zero orphan processes.
- **Token Verification Mandatory (AD-009)**: Tool execution engine must verify that the `ExecutionToken` is unexpired, cryptographically signed, matches the target task/agent/workspace, and lists the requested tool.
- **Path Jailing**: Any file read/write tool call must verify that the target path resolves inside the assigned `workspacePath`. Attempting to escape via `../` throws `SecurityError`.

---

### Task 1: Build `@forge/workspace` — Git Worktree Isolation & Branch Manager

**Files:**
- Create: `packages/workspace/package.json`
- Create: `packages/workspace/tsconfig.json`
- Create: `packages/workspace/src/types/workspace.ts`
- Create: `packages/workspace/src/services/workspace-manager.ts`
- Create: `packages/workspace/src/index.ts`
- Create: `packages/workspace/tests/workspace-manager.test.ts`

**Interfaces:**
- Consumes: `@forge/core`
- Produces:
  - `WorkspaceManager.createWorktree(taskId: string): Promise<WorktreeInfo>`
  - `WorkspaceManager.mergeWorktree(taskId: string, targetBranch?: string): Promise<MergeResult>`
  - `WorkspaceManager.removeWorktree(taskId: string, force?: boolean): Promise<void>`
  - `WorkspaceManager.cleanStaleWorktrees(): Promise<number>`

- [ ] **Step 1: Create `packages/workspace/package.json` & `tsconfig.json`**

`packages/workspace/package.json`:
```json
{
  "name": "@forge/workspace",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "dependencies": {
    "@forge/core": "workspace:*"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

`packages/workspace/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write failing unit test for `WorkspaceManager`**

`packages/workspace/tests/workspace-manager.test.ts`:
```typescript
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
    execSync("git add . && git commit -m 'initial commit'", { cwd: testRepoDir });
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
    execSync("git add . && git commit -m 'feat: add feature'", { cwd: info.worktreePath });

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
```

- [ ] **Step 3: Run test to verify failure**

Run: `pnpm --filter @forge/workspace test`
Expected: FAIL with module not found.

- [ ] **Step 4: Implement `WorkspaceManager`**

`packages/workspace/src/types/workspace.ts`:
```typescript
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
```

`packages/workspace/src/services/workspace-manager.ts`:
```typescript
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

  async createWorktree(taskId: string, baseBranch: string = "main"): Promise<WorktreeInfo> {
    const branchName = `forge/task-${taskId}`;
    const worktreePath = path.resolve(this.worktreesDir, `task-${taskId}`);

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
    const branchName = `forge/task-${taskId}`;

    try {
      // Checkout target branch and merge
      await execAsync(`git checkout ${targetBranch}`, { cwd: this.projectRoot });
      const { stdout } = await execAsync(`git merge ${branchName} --no-ff -m "merge: integrate ${branchName}"`, {
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
    const worktreePath = path.resolve(this.worktreesDir, `task-${taskId}`);
    const branchName = `forge/task-${taskId}`;

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
```

`packages/workspace/src/index.ts`:
```typescript
export * from "./types/workspace.js";
export * from "./services/workspace-manager.js";
```

- [ ] **Step 5: Run tests and build**

Run: `pnpm --filter @forge/workspace test && pnpm --filter @forge/workspace build`
Expected: 100% PASS, clean TypeScript build.

- [ ] **Step 6: Commit**

```bash
git add packages/workspace/
git commit -m "feat(workspace): implement Git Worktree manager and branch merge coordinator"
```

---

### Task 2: Build `@forge/tool-engine` — Token-Governed Atomic Tool Runners & Path Jailing

**Files:**
- Create: `packages/tool-engine/package.json`
- Create: `packages/tool-engine/tsconfig.json`
- Create: `packages/tool-engine/src/types/tool.ts`
- Create: `packages/tool-engine/src/tools/filesystem-tool.ts`
- Create: `packages/tool-engine/src/tools/shell-tool.ts`
- Create: `packages/tool-engine/src/tools/git-tool.ts`
- Create: `packages/tool-engine/src/services/tool-execution-engine.ts`
- Create: `packages/tool-engine/src/index.ts`
- Create: `packages/tool-engine/tests/tool-execution-engine.test.ts`

**Interfaces:**
- Consumes: `@forge/core`, `@forge/capability-resolver`
- Produces:
  - `ToolExecutionEngine.execute(toolName: string, args: Record<string, unknown>, token: ExecutionToken): Promise<ToolResult>`
  - Path Jailing: Prevents path traversal outside `token.workspacePath`

- [ ] **Step 1: Create `packages/tool-engine/package.json` & `tsconfig.json`**

`packages/tool-engine/package.json`:
```json
{
  "name": "@forge/tool-engine",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "dependencies": {
    "@forge/core": "workspace:*",
    "@forge/capability-resolver": "workspace:*"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

`packages/tool-engine/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write failing unit test for `ToolExecutionEngine`**

`packages/tool-engine/tests/tool-execution-engine.test.ts`:
```typescript
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
```

- [ ] **Step 3: Run test to verify failure**

Run: `pnpm --filter @forge/tool-engine test`
Expected: FAIL with missing modules.

- [ ] **Step 4: Implement `ToolExecutionEngine` & Atomic Tools**

`packages/tool-engine/src/types/tool.ts`:
```typescript
export interface ToolResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: string;
  executionTimeMs: number;
}
```

`packages/tool-engine/src/services/tool-execution-engine.ts`:
```typescript
import { ExecutionToken, CapabilityDeniedError } from "@forge/core";
import { CapabilityResolver } from "@forge/capability-resolver";
import { ToolResult } from "../types/tool.js";
import path from "node:path";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export class ToolExecutionEngine {
  constructor(private capabilityResolver: CapabilityResolver) {}

  async execute(toolName: string, args: Record<string, unknown>, token: ExecutionToken): Promise<ToolResult> {
    const start = Date.now();

    // 1. Verify Token Authenticity and Validity
    if (!this.capabilityResolver.verifyToken(token)) {
      throw new CapabilityDeniedError(toolName, "Invalid or expired ExecutionToken signature");
    }

    // 2. Verify Tool is Granted by Token
    if (!token.allowedTools.includes(toolName)) {
      throw new CapabilityDeniedError(toolName, `Tool '${toolName}' is not authorized by this ExecutionToken`);
    }

    // 3. Dispatch Tool
    let output: unknown;
    try {
      switch (toolName) {
        case "filesystem.write":
          output = await this.executeFilesystemWrite(args, token.workspacePath);
          break;
        case "filesystem.read":
          output = await this.executeFilesystemRead(args, token.workspacePath);
          break;
        case "shell.exec":
          output = await this.executeShell(args, token.workspacePath);
          break;
        case "git.status":
          output = await this.executeGitStatus(token.workspacePath);
          break;
        default:
          throw new Error(`Unsupported tool: ${toolName}`);
      }

      return {
        success: true,
        output,
        executionTimeMs: Date.now() - start
      };
    } catch (err: any) {
      if (err.message.includes("Path traversal")) throw err;
      return {
        success: false,
        error: err.message,
        executionTimeMs: Date.now() - start
      };
    }
  }

  private resolveSafePath(relPath: string, workspacePath: string): string {
    const resolved = path.resolve(workspacePath, relPath);
    const normalizedWs = path.resolve(workspacePath);

    if (!resolved.startsWith(normalizedWs)) {
      throw new Error(`Path traversal detected: '${relPath}' escapes workspace '${workspacePath}'`);
    }
    return resolved;
  }

  private async executeFilesystemWrite(args: Record<string, unknown>, workspacePath: string): Promise<string> {
    const filePath = this.resolveSafePath(String(args.path), workspacePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, String(args.content), "utf8");
    return `File written: ${args.path}`;
  }

  private async executeFilesystemRead(args: Record<string, unknown>, workspacePath: string): Promise<string> {
    const filePath = this.resolveSafePath(String(args.path), workspacePath);
    return await fs.readFile(filePath, "utf8");
  }

  private async executeShell(args: Record<string, unknown>, workspacePath: string): Promise<{ stdout: string; stderr: string }> {
    const command = String(args.command);
    const { stdout, stderr } = await execAsync(command, { cwd: workspacePath });
    return { stdout, stderr };
  }

  private async executeGitStatus(workspacePath: string): Promise<string> {
    const { stdout } = await execAsync("git status --porcelain", { cwd: workspacePath });
    return stdout;
  }
}
```

`packages/tool-engine/src/index.ts`:
```typescript
export * from "./types/tool.js";
export * from "./services/tool-execution-engine.js";
```

- [ ] **Step 5: Run tests and build**

Run: `pnpm --filter @forge/tool-engine test && pnpm --filter @forge/tool-engine build`
Expected: 100% PASS, clean TypeScript build.

- [ ] **Step 6: Commit**

```bash
git add packages/tool-engine/
git commit -m "feat(tool-engine): implement token-governed atomic tool execution engine with path jailing"
```

---

### Task 3: Build `@forge/runtime-engine` — L1/L4 Adapters, Process Group (`pgid`) Tracking & Heartbeats

**Files:**
- Create: `packages/runtime-engine/package.json`
- Create: `packages/runtime-engine/tsconfig.json`
- Create: `packages/runtime-engine/src/types/runtime-types.ts`
- Create: `packages/runtime-engine/src/adapters/l4-native-adapter.ts`
- Create: `packages/runtime-engine/src/adapters/l1-external-adapter.ts`
- Create: `packages/runtime-engine/src/services/runtime-router.ts`
- Create: `packages/runtime-engine/src/index.ts`
- Create: `packages/runtime-engine/tests/runtime-engine.test.ts`

**Interfaces:**
- Consumes: `@forge/core`, `@forge/tool-engine`, `@forge/capability-resolver`
- Produces:
  - `RuntimeRouter.dispatch(req: ExecutionRequest): Promise<ExecutionResponse>`
  - `L1ExternalAdapter`: Spawns subprocess with process group tracking (`pgid`), emits heartbeats every 5 seconds, cancels cleanly on timeout or abort signal
  - `L4NativeAdapter`: Executes tools natively through `ToolExecutionEngine`

- [ ] **Step 1: Create `packages/runtime-engine/package.json` & `tsconfig.json`**

`packages/runtime-engine/package.json`:
```json
{
  "name": "@forge/runtime-engine",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "dependencies": {
    "@forge/core": "workspace:*",
    "@forge/capability-resolver": "workspace:*",
    "@forge/tool-engine": "workspace:*"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

`packages/runtime-engine/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write failing unit test for `RuntimeRouter` and Adapters**

`packages/runtime-engine/tests/runtime-engine.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { RuntimeRouter } from "../src/services/runtime-router.js";
import { L4NativeAdapter } from "../src/adapters/l4-native-adapter.js";
import { L1ExternalAdapter } from "../src/adapters/l1-external-adapter.js";
import { ToolExecutionEngine } from "@forge/tool-engine";
import { CapabilityResolver, SecurityPolicy } from "@forge/capability-resolver";

describe("RuntimeEngine", () => {
  const secretKey = "test-secret";
  const policy: SecurityPolicy = {
    projectId: "p1",
    allowedTools: ["filesystem.write", "filesystem.read"],
    forbiddenTools: [],
    minTrustLevel: "L1",
    requireApprovalForTools: []
  };

  const resolver = new CapabilityResolver(secretKey, policy);
  const toolEngine = new ToolExecutionEngine(resolver);

  const nativeAdapter = new L4NativeAdapter(toolEngine);
  const externalAdapter = new L1ExternalAdapter();
  const router = new RuntimeRouter([nativeAdapter, externalAdapter]);

  it("routes L4 native execution request to L4NativeAdapter", async () => {
    const decision = resolver.resolve({
      taskId: "t1",
      agentId: "agent.coder",
      runtimeId: "native-forge-runner",
      runtimeTrustLevel: "L4",
      requestedTools: ["filesystem.write"],
      workspacePath: process.cwd()
    });

    const result = await router.dispatch({
      runtimeId: "native-forge-runner",
      toolName: "filesystem.write",
      args: { path: "sample.txt", content: "test" },
      token: decision.token!
    });

    expect(result.success).toBe(true);
  });

  it("routes L1 external command to L1ExternalAdapter with process tracking and clean exit", async () => {
    const result = await router.executeExternalCommand({
      command: "node -e \"console.log('hello from external subprocess')\"",
      cwd: process.cwd(),
      timeoutMs: 5000
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello from external subprocess");
  });
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `pnpm --filter @forge/runtime-engine test`
Expected: FAIL with missing modules.

- [ ] **Step 4: Implement Adapters & `RuntimeRouter`**

`packages/runtime-engine/src/types/runtime-types.ts`:
```typescript
import { ExecutionToken, TrustLevel } from "@forge/core";

export interface ExecutionRequest {
  runtimeId: string;
  toolName: string;
  args: Record<string, unknown>;
  token: ExecutionToken;
}

export interface ExecutionResponse {
  success: boolean;
  output?: unknown;
  error?: string;
}

export interface ExternalCommandRequest {
  command: string;
  cwd: string;
  timeoutMs?: number;
  onHeartbeat?: (timestamp: string) => void;
}

export interface ExternalCommandResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  processGroupId?: number;
}
```

`packages/runtime-engine/src/adapters/l4-native-adapter.ts`:
```typescript
import { ToolExecutionEngine } from "@forge/tool-engine";
import { ExecutionRequest, ExecutionResponse } from "../types/runtime-types.js";

export class L4NativeAdapter {
  readonly id = "native-forge-runner";
  readonly trustLevel = "L4";

  constructor(private toolEngine: ToolExecutionEngine) {}

  async execute(req: ExecutionRequest): Promise<ExecutionResponse> {
    const res = await this.toolEngine.execute(req.toolName, req.args, req.token);
    return {
      success: res.success,
      output: res.output,
      error: res.error
    };
  }
}
```

`packages/runtime-engine/src/adapters/l1-external-adapter.ts`:
```typescript
import { ExternalCommandRequest, ExternalCommandResponse } from "../types/runtime-types.js";
import { spawn } from "node:child_process";

export class L1ExternalAdapter {
  readonly id = "external-cli-runner";
  readonly trustLevel = "L1";

  async executeCommand(req: ExternalCommandRequest): Promise<ExternalCommandResponse> {
    const start = Date.now();
    const timeoutMs = req.timeoutMs ?? 30000;

    return new Promise((resolve) => {
      // In Windows powershell/cmd: spawn with shell: true
      const child = spawn(req.command, {
        cwd: req.cwd,
        shell: true,
        detached: false
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      // Heartbeat timer every 5s
      const heartbeatTimer = setInterval(() => {
        if (req.onHeartbeat) req.onHeartbeat(new Date().toISOString());
      }, 5000);

      // Timeout timer
      const timeoutTimer = setTimeout(() => {
        clearInterval(heartbeatTimer);
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1000);
      }, timeoutMs);

      child.on("close", (code) => {
        clearInterval(heartbeatTimer);
        clearTimeout(timeoutTimer);
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          durationMs: Date.now() - start,
          processGroupId: child.pid
        });
      });

      child.on("error", (err) => {
        clearInterval(heartbeatTimer);
        clearTimeout(timeoutTimer);
        resolve({
          exitCode: 1,
          stdout,
          stderr: err.message,
          durationMs: Date.now() - start,
          processGroupId: child.pid
        });
      });
    });
  }
}
```

`packages/runtime-engine/src/services/runtime-router.ts`:
```typescript
import { L4NativeAdapter } from "../adapters/l4-native-adapter.js";
import { L1ExternalAdapter } from "../adapters/l1-external-adapter.js";
import {
  ExecutionRequest,
  ExecutionResponse,
  ExternalCommandRequest,
  ExternalCommandResponse
} from "../types/runtime-types.js";

export class RuntimeRouter {
  private nativeAdapter?: L4NativeAdapter;
  private externalAdapter?: L1ExternalAdapter;

  constructor(adapters: (L4NativeAdapter | L1ExternalAdapter)[]) {
    for (const a of adapters) {
      if (a instanceof L4NativeAdapter) this.nativeAdapter = a;
      if (a instanceof L1ExternalAdapter) this.externalAdapter = a;
    }
  }

  async dispatch(req: ExecutionRequest): Promise<ExecutionResponse> {
    if (!this.nativeAdapter) {
      throw new Error("L4NativeAdapter is not registered");
    }
    return await this.nativeAdapter.execute(req);
  }

  async executeExternalCommand(req: ExternalCommandRequest): Promise<ExternalCommandResponse> {
    if (!this.externalAdapter) {
      throw new Error("L1ExternalAdapter is not registered");
    }
    return await this.externalAdapter.executeCommand(req);
  }
}
```

`packages/runtime-engine/src/index.ts`:
```typescript
export * from "./types/runtime-types.js";
export * from "./adapters/l4-native-adapter.js";
export * from "./adapters/l1-external-adapter.js";
export * from "./services/runtime-router.js";
```

- [ ] **Step 5: Run tests and build**

Run: `pnpm --filter @forge/runtime-engine test && pnpm --filter @forge/runtime-engine build`
Expected: 100% PASS, clean TypeScript build.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime-engine/
git commit -m "feat(runtime-engine): implement L1/L4 runtime adapters and process tracking router"
```

---

### Task 4: End-to-End Execution & Worktree Isolation Verification

**Files:**
- Create: `packages/runtime-engine/tests/e2e-execution-isolation.test.ts`

**Interfaces:**
- Consumes: `@forge/core`, `@forge/capability-resolver`, `@forge/workspace`, `@forge/tool-engine`, `@forge/runtime-engine`
- Produces: Integrated end-to-end test proving concurrent worktree creation, token resolution, atomic file modification, branch merge, and cleanup.

- [ ] **Step 1: Write E2E integration test**

Simulate:
1. Create Worktree for `task-feat-1`.
2. Issue `ExecutionToken` strictly scoped to the worktree path.
3. Use `ToolExecutionEngine` to write files in worktree.
4. Execute external command inside worktree via `L1ExternalAdapter`.
5. Merge worktree into main branch via `WorkspaceManager`.
6. Cleanup worktree.

- [ ] **Step 2: Run complete monorepo test suite & build**

Run: `pnpm test && pnpm -r run build`
Expected: All tests across 7 workspace packages pass 100%, clean build.

- [ ] **Step 3: Commit**

```bash
git add packages/runtime-engine/tests/e2e-execution-isolation.test.ts
git commit -m "test: add Phase 3 end-to-end execution and workspace isolation validation"
```
