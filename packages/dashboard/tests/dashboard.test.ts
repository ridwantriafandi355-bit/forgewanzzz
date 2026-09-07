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

describe("DashboardServer (Paperclip Autonomous Company OS)", () => {
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
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "forge-paperclip-test-"));
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

  it("serves GET / with Paperclip Company OS HTML interface", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("FORGE WANZZ INC.");
    expect(text).toContain("Org Chart");
    expect(text).toContain("Issues & Tickets");
    expect(text).toContain("Board Approvals");
    expect(text).toContain("Costs & Budgets");
    expect(text).toContain("Heartbeats & Runs");
  });

  it("serves GET /api/org with company structure & hierarchy", async () => {
    const res = await fetch(`http://localhost:${port}/api/org`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.company.name).toBe("FORGE WANZZ INC.");
    expect(data.company.headcount).toBe(4);
    expect(Array.isArray(data.hierarchy)).toBe(true);

    const board = data.hierarchy.find((m: any) => m.id === "board");
    expect(board).toBeDefined();
    expect(board.isHuman).toBe(true);

    const supervisor = data.hierarchy.find((m: any) => m.role === "Supervisor");
    expect(supervisor).toBeDefined();
    expect(supervisor.reportsTo).toBe("board");
  });

  it("serves GET /api/tickets and handles POST /api/tickets (Linear style)", async () => {
    // 1. Initially tickets list
    const res1 = await fetch(`http://localhost:${port}/api/tickets`);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.success).toBe(true);
    expect(Array.isArray(data1.tickets)).toBe(true);

    // 2. Post a new issue
    const res2 = await fetch(`http://localhost:${port}/api/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Implement OAuth2 Sign-in Flow",
        description: "Must pass deterministic exit code 0",
        priority: "P0",
      }),
    });
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.success).toBe(true);
    expect(data2.ticketId).toBeDefined();

    // 3. Confirm ticket appears
    const res3 = await fetch(`http://localhost:${port}/api/tickets`);
    const data3 = await res3.json();
    expect(data3.tickets.length).toBeGreaterThan(0);
    expect(data3.tickets[0].title).toBe("Implement OAuth2 Sign-in Flow");
    expect(data3.tickets[0].priority).toBe("P0");
  });

  it("serves GET /api/budgets with financial burn and payroll analytics", async () => {
    const res = await fetch(`http://localhost:${port}/api/budgets`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.companyBudget.monthlyCapUsd).toBe(100.0);
    expect(typeof data.companyBudget.spentUsd).toBe("number");
    expect(Array.isArray(data.modelBreakdown)).toBe(true);
    expect(Array.isArray(data.agentPayroll)).toBe(true);
  });

  it("serves GET /api/heartbeats with autonomous schedule", async () => {
    const res = await fetch(`http://localhost:${port}/api/heartbeats`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.heartbeats)).toBe(true);
    expect(data.heartbeats.length).toBeGreaterThan(0);
    expect(data.heartbeats[0].interval).toBeDefined();
  });

  it("manages board approvals and governance veto workflow", async () => {
    const missionId = "msn_gov_test";
    const raw = db.getRawDb();
    const now = new Date().toISOString();
    raw.prepare("INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('p1', 'P1', ?, ?, ?)").run(tempDir, now, now);
    raw.prepare("INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES (?, 'p1', 'Gov Mission', 'ACTIVE', ?, ?)").run(missionId, now, now);

    const [taskId] = await taskEngine.proposeTaskGraph(missionId, [
      {
        id: "task_gov_1",
        name: "High risk production deploy",
        dependencies: [],
        inputPayload: { policy: "HUMAN_ATTESTED" },
      },
    ]);

    // Operator pauses task
    await fetch(`http://localhost:${port}/api/tasks/${taskId}/pause`, { method: "POST" });

    // Pending in /api/approvals
    const appRes = await fetch(`http://localhost:${port}/api/approvals`);
    const appData = await appRes.json();
    expect(appData.approvals.some((a: any) => a.taskId === taskId)).toBe(true);

    // Board approves
    const approveRes = await fetch(`http://localhost:${port}/api/approvals/${taskId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "APPROVE", notes: "Approved by Chairman of the Board" }),
    });
    const approveData = await approveRes.json();
    expect(approveData.action).toBe("APPROVED");
    expect(approveData.status).toBe("RUNNING");
  });

  it("serves GET /api/diffs returning patch inspector structure", async () => {
    const res = await fetch(`http://localhost:${port}/api/diffs`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(typeof data.hasDiff).toBe("boolean");
  });
});
