import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { initCommand } from "../src/commands/init.js";
import { statusCommand } from "../src/commands/status.js";
import { verifyCommand } from "../src/commands/verify.js";
import { runCommand } from "../src/commands/run.js";
import { uiCommand } from "../src/commands/ui.js";

describe("Forge CLI Command Center", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-cli-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("forge init creates .forge directory, config, and initializes SQLite database", async () => {
    const result = await initCommand({ targetDir: tempDir });
    expect(result.initialized).toBe(true);

    const forgeDir = path.join(tempDir, ".forge");
    const dbPath = path.join(forgeDir, "forge.db");
    const configPath = path.join(forgeDir, "config.json");

    expect(await fs.stat(forgeDir)).toBeDefined();
    expect(await fs.stat(dbPath)).toBeDefined();
    expect(await fs.stat(configPath)).toBeDefined();
  });

  it("forge run executes a complete autonomous mission", async () => {
    await initCommand({ targetDir: tempDir });

    const runResult = await runCommand({
      workspaceRoot: tempDir,
      missionName: "Build Calculator",
      goal: "Implement add and subtract functions in math.ts",
      steps: [
        { id: "step-1", title: "Write math functions", role: "WORKER", dependencies: [] },
      ],
    });

    expect(runResult.success).toBe(true);
    expect(runResult.status).toBe("COMPLETED");
  });

  it("forge status returns the current state of missions and tasks", async () => {
    await initCommand({ targetDir: tempDir });

    await runCommand({
      workspaceRoot: tempDir,
      missionName: "Status Mission",
      goal: "Check status command",
      steps: [{ id: "task-status-1", title: "Check status", role: "WORKER", dependencies: [] }],
    });

    const status = await statusCommand({ workspaceRoot: tempDir });
    expect(status.missionsCount).toBeGreaterThan(0);
    expect(status.tasksCount).toBeGreaterThan(0);
  });

  it("forge verify evaluates verification evidence for a specific task", async () => {
    await initCommand({ targetDir: tempDir });

    const verifyResult = await verifyCommand({
      workspaceRoot: tempDir,
      taskId: "task-verify-demo",
      simulateExitCode: 0,
    });

    expect(verifyResult.passed).toBe(true);
    expect(verifyResult.evidence.taskId).toBe("task-verify-demo");
  });

  it("forge ui launches the dashboard server and serves endpoints", async () => {
    await initCommand({ targetDir: tempDir });

    const ephemeralPort = 31000 + Math.floor(Math.random() * 10000);
    const uiResult = await uiCommand({
      workspaceRoot: tempDir,
      port: ephemeralPort,
      silent: true,
    });

    expect(uiResult.port).toBe(ephemeralPort);
    expect(uiResult.url).toBe(`http://localhost:${ephemeralPort}`);

    const res = await fetch(`${uiResult.url}/api/status`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    await uiResult.server.stop();
  });
});

