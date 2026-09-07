import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ForgeDatabase, TaskRepository, LeaseRepository, runMigrations } from "@forge/storage";
import { EventBus } from "@forge/core";
import { TaskEngineService } from "@forge/task-engine";
import { OrganizationManager } from "@forge/org-manager";
import { VerificationService } from "@forge/verification-engine";
import { OrchestratorService } from "@forge/orchestration-engine";
import { DashboardServer } from "../src/server/dashboard-server.js";

describe("DashboardServer", () => {
  let tempDir: string;
  let db: ForgeDatabase;
  let taskRepo: TaskRepository;
  let leaseRepo: LeaseRepository;
  let eventBus: EventBus;
  let taskEngine: TaskEngineService;
  let orgManager: OrganizationManager;
  let verificationService: VerificationService;
  let orchestrator: OrchestratorService;
  let server: DashboardServer;
  let port: number;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "forge-dashboard-test-"));
    const dbPath = path.join(tempDir, "forge.db");
    db = new ForgeDatabase(dbPath);
    runMigrations(db);
    taskRepo = new TaskRepository(db);
    leaseRepo = new LeaseRepository(db);
    eventBus = new EventBus();
    taskEngine = new TaskEngineService(taskRepo, leaseRepo, eventBus);
    orgManager = new OrganizationManager();
    verificationService = new VerificationService();
    orchestrator = new OrchestratorService({
      taskEngine,
      orgManager,
      verificationService,
    });

    // Use random available port
    port = 30000 + Math.floor(Math.random() * 10000);
    server = new DashboardServer({
      port,
      db,
      taskEngine,
      orchestrator,
      orgManager,
      eventBus,
      publicDir: path.join(__dirname, "..", "src", "public"),
      workspaceRoot: tempDir,
    });

    await server.start();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    if (db) {
      db.close();
    }
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("serves GET /api/status with metrics", async () => {
    const res = await fetch(`http://localhost:${port}/api/status`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.metrics).toBeDefined();
    expect(typeof data.metrics.missionsCount).toBe("number");
    expect(typeof data.metrics.tasksCount).toBe("number");
  });

  it("serves GET /api/missions returning current missions and tasks", async () => {
    const res = await fetch(`http://localhost:${port}/api/missions`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.missions)).toBe(true);
  });

  it("handles POST /api/missions/run to execute a mission", async () => {
    const res = await fetch(`http://localhost:${port}/api/missions/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Dashboard Test Mission",
        goal: "Test execution from web UI",
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.missionId).toBeDefined();
  });

  it("serves GET / with HTML dashboard interface containing tab navigation", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("FORGE WANZZ");
    expect(text).toContain("Swarm Inspector");
    expect(text).toContain("Git Diff Viewer");
    expect(text).toContain("Approvals Queue");
  });

  it("serves GET /api/stream and emits SSE headers", async () => {
    const res = await fetch(`http://localhost:${port}/api/stream`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-cache");
  });

  it("serves GET /api/swarm with agent swarm telemetry", async () => {
    const res = await fetch(`http://localhost:${port}/api/swarm`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.agents)).toBe(true);
    expect(data.agents.length).toBeGreaterThan(0);
    expect(data.telemetry).toBeDefined();
    expect(typeof data.telemetry.totalTokensBurned).toBe("number");

    const firstAgent = data.agents[0];
    expect(firstAgent.id).toBeDefined();
    expect(firstAgent.role).toBeDefined();
    expect(firstAgent.tokenUsage).toBeDefined();
  });

  it("serves GET /api/diffs returning structured diff result", async () => {
    const res = await fetch(`http://localhost:${port}/api/diffs`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(typeof data.hasDiff).toBe("boolean");
    expect(Array.isArray(data.files)).toBe(true);
  });

  it("manages human approvals and task pause/resume workflow", async () => {
    // 1. Propose task graph to have a real task
    const missionId = "msn_approval_test";
    const raw = db.getRawDb();
    const now = new Date().toISOString();
    raw.prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('p1', 'P1', ?, ?, ?)").run(tempDir, now, now);
    raw.prepare("INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES (?, 'p1', 'Approval Mission', 'ACTIVE', ?, ?)").run(missionId, now, now);

    const [taskId] = await taskEngine.proposeTaskGraph(missionId, [
      {
        id: "task_approval_1",
        name: "Feature needing operator sign-off",
        dependencies: [],
        inputPayload: { policy: "HUMAN_ATTESTED" },
      },
    ]);

    // 2. Pause the task (operator intervention)
    const pauseRes = await fetch(`http://localhost:${port}/api/tasks/${taskId}/pause`, {
      method: "POST",
    });
    expect(pauseRes.status).toBe(200);
    const pauseData = await pauseRes.json();
    expect(pauseData.success).toBe(true);
    expect(pauseData.status).toBe("PAUSED");

    // 3. Inspect /api/approvals
    const approvalsRes = await fetch(`http://localhost:${port}/api/approvals`);
    expect(approvalsRes.status).toBe(200);
    const approvalsData = await approvalsRes.json();
    expect(approvalsData.success).toBe(true);
    expect(approvalsData.approvals.some((a: any) => a.taskId === taskId)).toBe(true);

    // 4. Operator Approves the task
    const approveRes = await fetch(`http://localhost:${port}/api/approvals/${taskId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "APPROVE", notes: "Approved by QA Operator" }),
    });
    expect(approveRes.status).toBe(200);
    const approveData = await approveRes.json();
    expect(approveData.success).toBe(true);
    expect(approveData.action).toBe("APPROVED");
    expect(approveData.status).toBe("RUNNING");

    // Task is now RUNNING
    const updatedTask = taskEngine.getTask(taskId);
    expect(updatedTask?.status).toBe("RUNNING");

    // 5. Pause again and test REJECT
    await fetch(`http://localhost:${port}/api/tasks/${taskId}/pause`, { method: "POST" });
    const rejectRes = await fetch(`http://localhost:${port}/api/approvals/${taskId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "REJECT", notes: "Failed security criteria" }),
    });
    expect(rejectRes.status).toBe(200);
    const rejectData = await rejectRes.json();
    expect(rejectData.success).toBe(true);
    expect(rejectData.action).toBe("REJECTED");
    expect(rejectData.status).toBe("FAILED");

    const failedTask = taskEngine.getTask(taskId);
    expect(failedTask?.status).toBe("FAILED");
  });
});
