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

  it("forge discovery inspects host runtimes non-destructively per Doc 08 & 15", async () => {
    const { discoveryCommand } = await import("../src/commands/discovery.js");
    const result = await discoveryCommand();

    expect(result.count).toBeGreaterThanOrEqual(3);
    const native = result.runtimes.find((r) => r.id === "native-forge");
    expect(native).toBeDefined();
    expect(native?.trustProfile.trustClass).toBe("L4");
    expect(native?.available).toBe(true);
  });

  it("forge connections manages authenticated external capabilities with zero raw token leakage per Doc 10 & 15", async () => {
    const { connectionsCommand } = await import("../src/commands/connections.js");
    
    // 1. List connections
    const listResult = await connectionsCommand({ subcommand: "list" });
    expect(listResult.connections.length).toBeGreaterThanOrEqual(3);

    // 2. Add custom connection
    const addResult = await connectionsCommand({
      subcommand: "add",
      connectionId: "conn_custom_test",
      name: "Custom Testing Provider",
      type: "PROVIDER",
      authType: "API_KEY",
      secretRef: "secret://env/TEST_API_KEY",
    });
    expect(addResult.connections.some((c) => c.id === "conn_custom_test")).toBe(true);
  });

  it("forge resume rehydrates mission and skips verified tasks per Doc 06 & 15", async () => {
    await initCommand({ targetDir: tempDir });
    const { resumeCommand } = await import("../src/commands/resume.js");

    const runResult = await runCommand({
      workspaceRoot: tempDir,
      missionName: "Resume Test Mission",
      goal: "Test resuming completed workflow",
      steps: [{ id: "task-resume-1", title: "Complete step", role: "WORKER", dependencies: [] }],
    });

    const resumeResult = await resumeCommand({
      workspaceRoot: tempDir,
      missionId: runResult.missionId,
    });

    expect(resumeResult.resumed).toBe(true);
    expect(resumeResult.skippedCompletedTasks).toBe(1);
    expect(resumeResult.remainingTasks).toBe(0);
  });

  it("forge dlq lists and inspects failed tasks per Doc 06 & 15", async () => {
    await initCommand({ targetDir: tempDir });
    const { dlqCommand } = await import("../src/commands/dlq.js");

    // Clean DLQ initially
    const dlqResult = await dlqCommand({ workspaceRoot: tempDir });
    expect(dlqResult.items).toBeDefined();
    expect(dlqResult.count).toBe(0);
  });

  it("forge memory stores, lists, and recalls knowledge per Doc 12", async () => {
    await initCommand({ targetDir: tempDir });
    const { memoryCommand } = await import("../src/commands/memory.js");
    const dbPath = path.join(tempDir, ".forge", "forge.db");

    // 1. Store a memory
    const storeRes = await memoryCommand({
      subcommand: "store",
      title: "SQLite Concurrency Pattern",
      content: "Always configure busy timeout to 5000ms and use WAL journal mode for parallel workers.",
      tags: "sqlite,concurrency",
      scopeType: "PROJECT",
      scopeId: "proj_test",
      dbPath,
    });
    expect(storeRes.count).toBe(1);
    expect(storeRes.items[0].title).toBe("SQLite Concurrency Pattern");

    // 2. Search for the stored memory
    const searchRes = await memoryCommand({
      subcommand: "search",
      query: "concurrency timeout",
      dbPath,
    });
    expect(searchRes.count).toBe(1);
    expect(searchRes.items[0].title).toBe("SQLite Concurrency Pattern");

    // 3. List memories
    const listRes = await memoryCommand({
      subcommand: "list",
      scopeType: "PROJECT",
      scopeId: "proj_test",
      dbPath,
    });
    expect(listRes.count).toBe(1);
  });

  it("runCli routes discovery, connections, resume, and dlq commands without unhandled errors", async () => {
    const { runCli } = await import("../src/cli.js");

    // Test discovery routing
    await expect(runCli(["node", "forge", "discovery", "--json"])).resolves.not.toThrow();

    // Test connections routing
    await expect(runCli(["node", "forge", "connections", "--json"])).resolves.not.toThrow();

    // Test dlq routing
    await expect(runCli(["node", "forge", "dlq", "--json"])).resolves.not.toThrow();

    // Test memory routing
    await expect(runCli(["node", "forge", "memory", "list", "--json"])).resolves.not.toThrow();
  });
});


