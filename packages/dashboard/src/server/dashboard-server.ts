import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { ForgeDatabase } from "@forge/storage";
import { EventBus } from "@forge/core";
import { TaskEngineService } from "@forge/task-engine";
import { OrchestratorService, MissionSpec } from "@forge/orchestration-engine";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DashboardServerOptions {
  port: number;
  db: ForgeDatabase;
  taskEngine?: TaskEngineService;
  orchestrator?: OrchestratorService;
  eventBus?: EventBus;
  publicDir?: string;
}

export class DashboardServer {
  private server: http.Server | null = null;
  private options: DashboardServerOptions;
  private sseClients: Set<http.ServerResponse> = new Set();
  private isRunning = false;
  private unsubscribeEvents: (() => void) | null = null;

  constructor(options: DashboardServerOptions) {
    this.options = options;
  }

  public async start(): Promise<number> {
    const candidate1 = path.join(__dirname, "..", "public");
    const candidate2 = path.join(__dirname, "..", "..", "src", "public");
    const publicDir =
      this.options.publicDir ||
      (fs.existsSync(candidate1) ? candidate1 : candidate2);

    // Subscribe to EventBus if available
    if (this.options.eventBus) {
      this.unsubscribeEvents = this.options.eventBus.subscribe("*", (event) => {
        this.broadcastEvent({
          type: "EVENT_BUS",
          data: event,
          timestamp: new Date().toISOString(),
        });
      });
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res, publicDir);
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });

      this.server.on("error", (err) => {
        reject(err);
      });

      this.server.listen(this.options.port, () => {
        this.isRunning = true;
        const address = this.server?.address();
        const actualPort = typeof address === "object" && address ? address.port : this.options.port;
        resolve(actualPort);
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.unsubscribeEvents) {
      this.unsubscribeEvents();
      this.unsubscribeEvents = null;
    }

    for (const client of this.sseClients) {
      try {
        client.end();
      } catch {}
    }
    this.sseClients.clear();

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          this.isRunning = false;
          resolve();
        });
      });
      this.server = null;
    }

    try {
      this.options.db?.close();
    } catch {}
  }

  public getPort(): number {
    const address = this.server?.address();
    return typeof address === "object" && address ? address.port : this.options.port;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse, publicDir: string): Promise<void> {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase();

    // CORS headers for local dev convenience
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // --- API ROUTES ---
    if (pathname === "/api/status" && method === "GET") {
      const raw = this.options.db.getRawDb();
      let missionsCount = 0;
      let tasksCount = 0;
      let leasesCount = 0;
      let verifiedCount = 0;

      try {
        const mRow: any = raw.prepare("SELECT COUNT(*) as count FROM missions").get();
        missionsCount = mRow?.count || 0;
      } catch {}

      try {
        const tRow: any = raw.prepare("SELECT COUNT(*) as count FROM tasks").get();
        tasksCount = tRow?.count || 0;
      } catch {}

      try {
        const lRow: any = raw.prepare("SELECT COUNT(*) as count FROM leases WHERE expires_at > ?").get(new Date().toISOString());
        leasesCount = lRow?.count || 0;
      } catch {}

      try {
        const vRow: any = raw.prepare("SELECT COUNT(*) as count FROM tasks WHERE state = 'COMPLETED'").get();
        verifiedCount = vRow?.count || 0;
      } catch {}

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          status: "ONLINE",
          factory: "Forge Wanzz v0.1",
          metrics: {
            missionsCount,
            tasksCount,
            leasesCount,
            verifiedCount,
            activeAgentsCount: leasesCount > 0 ? leasesCount : 1,
            uptimeSeconds: Math.floor(process.uptime()),
          },
        })
      );
      return;
    }

    if (pathname === "/api/missions" && method === "GET") {
      const raw = this.options.db.getRawDb();
      let missions: any[] = [];
      try {
        missions = raw.prepare("SELECT * FROM missions ORDER BY created_at DESC LIMIT 50").all();
        for (const m of missions) {
          try {
            m.tasks = raw.prepare("SELECT * FROM tasks WHERE mission_id = ? ORDER BY created_at ASC").all(m.id);
            for (const t of m.tasks) {
              if (t.dependencies) {
                try {
                  t.dependencies = JSON.parse(t.dependencies);
                } catch {
                  t.dependencies = [];
                }
              }
            }
          } catch {
            m.tasks = [];
          }
        }
      } catch {}

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, missions }));
      return;
    }

    if (pathname === "/api/missions/run" && method === "POST") {
      const body = await this.readBody(req);
      const missionName = body.name || "Web Mission";
      const goal = body.goal || "Generated from Web Dashboard";

      if (!this.options.orchestrator) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "OrchestratorService not configured" }));
        return;
      }

      const missionId = `msn_${randomUUID().slice(0, 8)}`;
      const projectId = "default-project";
      const raw = this.options.db.getRawDb();
      const now = new Date().toISOString();

      const existingProj = raw.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
      if (!existingProj) {
        raw.prepare(
          "INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (?, 'Default Project', ?, ?, ?)"
        ).run(projectId, process.cwd(), now, now);
      }

      raw.prepare(
        "INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)"
      ).run(missionId, projectId, missionName, now, now);

      const stepId = `${missionId}_step-1`;
      const missionSpec: MissionSpec = {
        missionId,
        projectId,
        name: missionName,
        goal,
        steps: [
          {
            id: stepId,
            title: goal,
            role: "WORKER",
            dependencies: [],
          },
        ],
      };

      await this.options.orchestrator.startMission(missionSpec);

      // Execute asynchronously in background
      (async () => {
        try {
          this.broadcastEvent({
            type: "MISSION_STARTED",
            missionId,
            name: missionName,
            goal,
            timestamp: new Date().toISOString(),
          });

          await this.options.orchestrator!.executeNextStep(missionId, {
            simulateCheckExitCode: 0,
          });

          this.broadcastEvent({
            type: "MISSION_COMPLETED",
            missionId,
            timestamp: new Date().toISOString(),
          });
        } catch (err: any) {
          this.broadcastEvent({
            type: "MISSION_FAILED",
            missionId,
            error: err.message,
            timestamp: new Date().toISOString(),
          });
        }
      })();

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, missionId, status: "IN_PROGRESS" }));
      return;
    }

    if (pathname === "/api/stream" && method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("data: " + JSON.stringify({ type: "CONNECTED", message: "Forge EventStream Active" }) + "\n\n");

      this.sseClients.add(res);

      req.on("close", () => {
        this.sseClients.delete(res);
      });
      return;
    }

    // --- STATIC FILES ---
    let filePath = "";
    let contentType = "text/plain";

    if (pathname === "/" || pathname === "/index.html") {
      filePath = path.join(publicDir, "index.html");
      contentType = "text/html; charset=utf-8";
    } else if (pathname === "/dashboard.css") {
      filePath = path.join(publicDir, "dashboard.css");
      contentType = "text/css; charset=utf-8";
    } else if (pathname === "/dashboard.js") {
      filePath = path.join(publicDir, "dashboard.js");
      contentType = "application/javascript; charset=utf-8";
    }

    if (filePath && fs.existsSync(filePath)) {
      const content = await fs.promises.readFile(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Not Found" }));
  }

  private broadcastEvent(payload: any): void {
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(message);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  private async readBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => {
        data += chunk;
      });
      req.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(new Error("Invalid JSON body"));
        }
      });
      req.on("error", reject);
    });
  }
}
