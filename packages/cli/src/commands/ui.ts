import * as path from "node:path";
import { ForgeDatabase, TaskRepository, LeaseRepository, runMigrations } from "@forge/storage";
import { EventBus } from "@forge/core";
import { TaskEngineService } from "@forge/task-engine";
import { OrganizationManager } from "@forge/org-manager";
import { VerificationService } from "@forge/verification-engine";
import { OrchestratorService } from "@forge/orchestration-engine";
import { DashboardServer } from "@forge/dashboard";

export interface UiOptions {
  port?: number;
  workspaceRoot?: string;
  silent?: boolean;
}

export interface UiResult {
  server: DashboardServer;
  url: string;
  port: number;
}

export async function uiCommand(options: UiOptions = {}): Promise<UiResult> {
  const root = options.workspaceRoot || process.cwd();
  const dbPath = path.join(root, ".forge", "forge.db");

  const db = new ForgeDatabase(dbPath);
  runMigrations(db);

  const taskRepo = new TaskRepository(db);
  const leaseRepo = new LeaseRepository(db);
  const eventBus = new EventBus();

  const taskEngine = new TaskEngineService(taskRepo, leaseRepo, eventBus);
  const orgManager = new OrganizationManager();
  const verificationService = new VerificationService();

  const orchestrator = new OrchestratorService({
    taskEngine,
    orgManager,
    verificationService,
  });

  const requestedPort = options.port || 3000;
  const server = new DashboardServer({
    port: requestedPort,
    db,
    taskEngine,
    orchestrator,
    orgManager,
    eventBus,
    workspaceRoot: root,
  });

  const actualPort = await server.start();
  const url = `http://localhost:${actualPort}`;

  if (!options.silent) {
    console.log(`
  ╔═══════════════════════════════════════════════════════════════╗
  ║                 FORGE WANZZ WEB DASHBOARD                     ║
  ║         Autonomous Software Factory Real-Time Operator        ║
  ╚═══════════════════════════════════════════════════════════════╝
  🚀 Web Dashboard active at: ${url}
  📊 Real-time DAG visualizer, live telemetry & SSE streaming
    `);
  }

  return {
    server,
    url,
    port: actualPort,
  };
}
