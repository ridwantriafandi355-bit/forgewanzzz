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
      eventBus,
      publicDir: path.join(__dirname, "..", "src", "public"),
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

  it("serves GET / with HTML dashboard interface", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("FORGE WANZZ");
  });

  it("serves GET /api/stream and emits SSE headers", async () => {
    const res = await fetch(`http://localhost:${port}/api/stream`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-cache");
  });
});
