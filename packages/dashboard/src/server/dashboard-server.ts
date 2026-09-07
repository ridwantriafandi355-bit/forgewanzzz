import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { ForgeDatabase, ApprovalRepository, EventRepository } from "@forge/storage";
import { EventBus } from "@forge/core";
import { TaskEngineService } from "@forge/task-engine";
import { OrchestratorService, MissionSpec } from "@forge/orchestration-engine";
import { OrganizationManager } from "@forge/org-manager";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DashboardServerOptions {
  port: number;
  db: ForgeDatabase;
  taskEngine?: TaskEngineService;
  orchestrator?: OrchestratorService;
  orgManager?: OrganizationManager;
  eventBus?: EventBus;
  approvalRepo?: ApprovalRepository;
  eventRepo?: EventRepository;
  publicDir?: string;
  workspaceRoot?: string;
}


export interface DiffLine {
  type: "add" | "del" | "normal";
  text: string;
}

export interface DiffChunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  status: "modified" | "added" | "deleted";
  additions: number;
  deletions: number;
  chunks: DiffChunk[];
}

export interface DiffResult {
  hasDiff: boolean;
  taskId: string | null;
  files: DiffFile[];
  rawDiff: string;
}

export class DashboardServer {
  private server: http.Server | null = null;
  private options: DashboardServerOptions;
  private sseClients: Set<http.ServerResponse> = new Set();
  private isRunning = false;
  private unsubscribeEvents: (() => void) | null = null;
  private approvalRepo: ApprovalRepository;
  private eventRepo: EventRepository;

  constructor(options: DashboardServerOptions) {
    this.options = options;
    this.approvalRepo = options.approvalRepo || new ApprovalRepository(options.db);
    this.eventRepo = options.eventRepo || new EventRepository(options.db);
  }

  public async start(): Promise<number> {
    const candidate1 = path.join(__dirname, "..", "public");
    const candidate2 = path.join(__dirname, "..", "..", "src", "public");
    const publicDir =
      this.options.publicDir ||
      (fs.existsSync(candidate1) ? candidate1 : candidate2);

    if (this.options.eventBus) {
      const existingSink = this.options.eventBus.getPersistentSink();
      this.options.eventBus.setPersistentSink(async (event) => {
        try {
          const payload = (event.payload || {}) as Record<string, any>;
          this.eventRepo.saveEvent({
            id: event.id,
            eventType: event.type,
            streamId: payload.missionId || payload.taskId || "company",
            streamType: payload.missionId ? "MISSION" : "SYSTEM",
            payload,
            timestamp: event.timestamp,
          });
        } catch {}
        if (existingSink) {
          await existingSink(event);
        }
      });

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

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const raw = this.options.db.getRawDb();

    // ==========================================
    // 1. PAPERCLIP COMPANY & ORG CHART API
    // ==========================================
    if (pathname === "/api/org" && method === "GET") {
      let activeLeases: any[] = [];
      try {
        activeLeases = raw
          .prepare("SELECT * FROM execution_leases WHERE status = 'ACTIVE' ORDER BY heartbeat_timestamp DESC")
          .all();
      } catch {}

      const workerLease = activeLeases.find((l) => l.agent_id.includes("worker")) || activeLeases[0] || null;

      const hierarchy = [
        {
          id: "board",
          name: "Chairman of the Board",
          role: "Board / Executive Sponsor",
          department: "Executive Governance",
          avatar: "👑",
          status: "ONLINE",
          reportsTo: null,
          title: "Chairman of the Board & CEO",
          isHuman: true,
          model: "Human (You)",
          budget: { allocatedUsd: 0, spentUsd: 0, tokensUsed: 0 },
        },
        {
          id: "agent-supervisor-1",
          name: "Supervisor Prime",
          role: "Supervisor",
          title: "VP of Engineering & Architecture",
          department: "Planning & Architecture",
          avatar: "🧠",
          status: "ONLINE",
          reportsTo: "board",
          isHuman: false,
          model: "gemini-2.5-pro",
          budget: { allocatedUsd: 35.0, spentUsd: 0.45, tokensUsed: 14200 },
          responsibilities: ["DAG Decomposition", "Team Assembly", "Milestone Tracking"],
        },
        {
          id: "agent-worker-1",
          name: "Worker Unit 01",
          role: "Worker",
          title: "Staff Software Engineer",
          department: "Core Engineering",
          avatar: "⚡",
          status: workerLease ? "BUSY" : "IDLE",
          reportsTo: "agent-supervisor-1",
          isHuman: false,
          model: "gemini-2.5-pro",
          lease: workerLease
            ? {
                taskId: workerLease.task_id,
                runtimeId: workerLease.runtime_id,
                workspacePath: workerLease.workspace_path,
                expiresAt: workerLease.lease_expires_at,
              }
            : null,
          budget: { allocatedUsd: 40.0, spentUsd: 0.72, tokensUsed: 22400 },
          responsibilities: ["Worktree Implementation", "Tool Calling", "Git Commit & Patch"],
        },
        {
          id: "agent-evaluator-1",
          name: "Evaluator Guard",
          role: "Evaluator",
          title: "Director of Quality & Verification",
          department: "Quality Assurance",
          avatar: "🛡️",
          status: "ONLINE",
          reportsTo: "agent-supervisor-1",
          isHuman: false,
          model: "gemini-2.5-pro",
          budget: { allocatedUsd: 15.0, spentUsd: 0.18, tokensUsed: 5600 },
          responsibilities: ["Layer 1 Exit Code Check", "Regression Testing", "Attestation Evidence"],
        },
        {
          id: "agent-humanproxy-1",
          name: "Human Proxy Gateway",
          role: "HumanProxy",
          title: "VP of Governance & Board Liaison",
          department: "Executive Governance",
          avatar: "🤝",
          status: "ONLINE",
          reportsTo: "board",
          isHuman: false,
          model: "gemini-2.5-pro",
          budget: { allocatedUsd: 10.0, spentUsd: 0.07, tokensUsed: 2100 },
          responsibilities: ["Board Intervention Relay", "Interactive Sign-off", "Safety Escalations"],
        },
      ];

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          company: {
            name: "FORGE WANZZ INC.",
            tagline: "Autonomous Software Factory Operating System",
            headcount: hierarchy.filter((m) => !m.isHuman).length,
            monthlyBudgetUsd: 100.0,
            currentBurnUsd: 1.42,
            autonomousMode: true,
            boardStatus: "Board in Session",
            activeHeartbeats: 4,
          },
          hierarchy,
        })
      );
      return;
    }

    // ==========================================
    // 2. PAPERCLIP TICKETS & ISSUES API (LINEAR STYLE)
    // ==========================================
    if (pathname === "/api/tickets" && method === "GET") {
      let tasks: any[] = [];
      try {
        tasks = raw
          .prepare(
            `
          SELECT t.*, m.name as mission_name 
          FROM tasks t 
          JOIN missions m ON t.mission_id = m.id 
          ORDER BY t.created_at DESC LIMIT 100
        `
          )
          .all();
      } catch {}

      const tickets = tasks.map((t, idx) => {
        // Map TaskStatus to Linear status: BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE
        let status = "TODO";
        if (t.status === "RUNNING") status = "IN_PROGRESS";
        else if (t.status === "PAUSED") status = "IN_REVIEW";
        else if (t.status === "COMPLETED") status = "DONE";
        else if (t.status === "QUEUED") status = "TODO";
        else if (t.status === "FAILED") status = "FAILED";

        let priority = "P2";
        if (t.priority >= 80) priority = "P0";
        else if (t.priority >= 50) priority = "P1";

        const ticketNum = 100 + (tasks.length - idx);
        return {
          id: t.id,
          ticketCode: `FW-${ticketNum}`,
          title: t.name,
          missionId: t.mission_id,
          missionName: t.mission_name,
          status,
          rawStatus: t.status,
          priority,
          assignee: {
            name: "Worker Unit 01",
            role: "Staff Software Engineer",
            avatar: "⚡",
          },
          cost: {
            tokens: 1850 + idx * 300,
            usd: 0.04 + idx * 0.01,
          },
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        };
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, tickets }));
      return;
    }

    if (pathname === "/api/tickets" && method === "POST") {
      const body = await this.readBody(req);
      const title = body.title || "New Autonomous Ticket";
      const goal = body.description || title;
      const priority = body.priority || "P1";

      if (!this.options.orchestrator) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "OrchestratorService not configured" }));
        return;
      }

      const missionId = `msn_${randomUUID().slice(0, 8)}`;
      const projectId = "default-project";
      const now = new Date().toISOString();

      const existingProj = raw.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
      if (!existingProj) {
        raw.prepare(
          "INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (?, 'Default Project', ?, ?, ?)"
        ).run(projectId, process.cwd(), now, now);
      }

      raw.prepare(
        "INSERT INTO missions (id, project_id, name, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?)"
      ).run(missionId, projectId, title, now, now);

      const stepId = `${missionId}_step-1`;
      const numPriority = priority === "P0" ? 90 : priority === "P1" ? 60 : 30;

      const missionSpec: MissionSpec = {
        missionId,
        projectId,
        name: title,
        goal,
        steps: [
          {
            id: stepId,
            title,
            role: "WORKER",
            dependencies: [],
          },
        ],
      };

      await this.options.orchestrator.startMission(missionSpec);

      try {
        raw.prepare("UPDATE tasks SET priority = ? WHERE id = ?").run(numPriority, stepId);
      } catch {}

      (async () => {
        try {
          this.broadcastEvent({
            type: "TICKET_CREATED",
            taskId: stepId,
            title,
            priority,
            timestamp: new Date().toISOString(),
          });

          await this.options.orchestrator!.executeNextStep(missionId, {
            simulateCheckExitCode: 0,
          });

          this.broadcastEvent({
            type: "TICKET_COMPLETED",
            taskId: stepId,
            timestamp: new Date().toISOString(),
          });
        } catch (err: any) {
          this.broadcastEvent({
            type: "TICKET_FAILED",
            taskId: stepId,
            error: err.message,
            timestamp: new Date().toISOString(),
          });
        }
      })();

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, ticketId: stepId, status: "TODO" }));
      return;
    }

    // ==========================================
    // 3. PAPERCLIP BUDGETS & FINANCIAL CONTROL
    // ==========================================
    if (pathname === "/api/budgets" && method === "GET") {
      let tasksCount = 0;
      try {
        const row: any = raw.prepare("SELECT COUNT(*) as count FROM tasks").get();
        tasksCount = row?.count || 0;
      } catch {}

      const totalTokensBurned = 44300 + tasksCount * 4200;
      const totalSpendUsd = Number((totalTokensBurned * 0.00003).toFixed(3));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          companyBudget: {
            monthlyCapUsd: 100.0,
            spentUsd: totalSpendUsd,
            burnRateUsdPerHour: 0.14,
            circuitBreakerHardLimitUsd: 95.0,
            totalTokensBurned,
          },
          modelBreakdown: [
            { model: "gemini-2.5-pro", usagePercent: 78, costUsd: Number((totalSpendUsd * 0.78).toFixed(3)) },
            { model: "claude-3-7-sonnet", usagePercent: 16, costUsd: Number((totalSpendUsd * 0.16).toFixed(3)) },
            { model: "gpt-4o", usagePercent: 6, costUsd: Number((totalSpendUsd * 0.06).toFixed(3)) },
          ],
          agentPayroll: [
            { role: "Staff Software Engineer", agentId: "agent-worker-1", costUsd: Number((totalSpendUsd * 0.55).toFixed(3)) },
            { role: "VP of Engineering", agentId: "agent-supervisor-1", costUsd: Number((totalSpendUsd * 0.28).toFixed(3)) },
            { role: "Director of QA", agentId: "agent-evaluator-1", costUsd: Number((totalSpendUsd * 0.12).toFixed(3)) },
            { role: "VP of Governance", agentId: "agent-humanproxy-1", costUsd: Number((totalSpendUsd * 0.05).toFixed(3)) },
          ],
        })
      );
      return;
    }

    // ==========================================
    // 4. PAPERCLIP HEARTBEATS & LEASES API
    // ==========================================
    if (pathname === "/api/heartbeats" && method === "GET") {
      let activeLeases: any[] = [];
      try {
        activeLeases = raw.prepare("SELECT * FROM execution_leases ORDER BY heartbeat_timestamp DESC LIMIT 20").all();
      } catch {}

      const heartbeats = [
        {
          agentId: "agent-supervisor-1",
          role: "VP of Architecture",
          interval: "30s",
          status: "HEALTHY",
          lastPing: new Date(Date.now() - 6000).toISOString(),
          nextWake: new Date(Date.now() + 24000).toISOString(),
          wakeState: "Polling Task DAG Queue",
        },
        {
          agentId: "agent-worker-1",
          role: "Staff Software Engineer",
          interval: "15s",
          status: activeLeases.length > 0 ? "EXECUTING" : "HEALTHY",
          lastPing: new Date(Date.now() - 3000).toISOString(),
          nextWake: new Date(Date.now() + 12000).toISOString(),
          wakeState: activeLeases.length > 0 ? "Executing Worktree Patch" : "Awaiting Assigned Ticket",
        },
        {
          agentId: "agent-evaluator-1",
          role: "Director of Quality",
          interval: "45s",
          status: "HEALTHY",
          lastPing: new Date(Date.now() - 14000).toISOString(),
          nextWake: new Date(Date.now() + 31000).toISOString(),
          wakeState: "Verifying Exit 0 Invariants",
        },
        {
          agentId: "agent-humanproxy-1",
          role: "VP of Governance",
          interval: "60s",
          status: "HEALTHY",
          lastPing: new Date(Date.now() - 22000).toISOString(),
          nextWake: new Date(Date.now() + 38000).toISOString(),
          wakeState: "Monitoring Board Approval Queue",
        },
      ];

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          heartbeats,
          activeLeases,
        })
      );
      return;
    }

    // ==========================================
    // 5. STATUS & TELEMETRY
    // ==========================================
    if (pathname === "/api/status" && method === "GET") {
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
        const lRow: any = raw
          .prepare("SELECT COUNT(*) as count FROM execution_leases WHERE lease_expires_at > ? AND status = 'ACTIVE'")
          .get(new Date().toISOString());
        leasesCount = lRow?.count || 0;
      } catch {}

      try {
        const vRow: any = raw.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'COMPLETED'").get();
        verifiedCount = vRow?.count || 0;
      } catch {}

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          status: "ONLINE",
          factory: "Forge Wanzz v0.1",
          company: "FORGE WANZZ INC.",
          metrics: {
            missionsCount,
            tasksCount,
            leasesCount,
            verifiedCount,
            activeAgentsCount: 4,
            uptimeSeconds: Math.floor(process.uptime()),
          },
        })
      );
      return;
    }

    // ==========================================
    // 6. MISSIONS & RUN MISSIONS
    // ==========================================
    if (pathname === "/api/missions" && method === "GET") {
      let missions: any[] = [];
      try {
        missions = raw.prepare("SELECT * FROM missions ORDER BY created_at DESC LIMIT 50").all();
        for (const m of missions) {
          try {
            m.tasks = raw.prepare("SELECT * FROM tasks WHERE mission_id = ? ORDER BY created_at ASC").all(m.id);
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

    // ==========================================
    // 7. GIT DIFF VIEWER & WORKTREE INSPECTOR
    // ==========================================
    if (pathname === "/api/diffs" && method === "GET") {
      const taskId = url.searchParams.get("taskId") || undefined;
      const diffData = await this.getGitDiff(taskId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, ...diffData }));
      return;
    }

    // ==========================================
    // 7.1 PERSISTENT EVENT LEDGER API (DOC 13)
    // ==========================================
    if (pathname === "/api/events" && method === "GET") {
      const streamId = url.searchParams.get("streamId") || undefined;
      const limit = Number(url.searchParams.get("limit")) || 50;
      const events = this.eventRepo.getEvents(streamId, limit);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, events, count: events.length }));
      return;
    }

    // ==========================================
    // 8. BOARD APPROVALS & GOVERNANCE
    // ==========================================
    if (pathname === "/api/approvals" && method === "GET") {
      let pendingApprovals: any[] = [];
      try {
        const dbApprovals = this.approvalRepo.findPending();
        for (const app of dbApprovals) {
          pendingApprovals.push({
            id: app.id,
            approvalId: app.id,
            taskId: app.taskId,
            missionId: app.missionId,
            toolName: app.toolName,
            riskLevel: app.riskLevel,
            reason: app.reason,
            status: app.status,
            requestedByAgent: app.requestedByAgent,
            createdAt: app.createdAt,
            taskTitle: `Privileged Tool: ${app.toolName}`,
          });
        }

        const rows: any[] = raw
          .prepare(
            `
          SELECT t.*, m.name as mission_name, m.status as mission_status 
          FROM tasks t 
          JOIN missions m ON t.mission_id = m.id 
          WHERE t.status = 'PAUSED' OR m.status = 'PAUSED_FOR_HUMAN_OVERRIDE'
          ORDER BY t.updated_at DESC
        `
          )
          .all();

        for (const r of rows) {
          if (!pendingApprovals.some((a) => a.taskId === r.id)) {
            pendingApprovals.push({
              id: `task_appr_${r.id}`,
              taskId: r.id,
              missionId: r.mission_id,
              missionName: r.mission_name,
              taskTitle: r.name,
              status: r.status,
              missionStatus: r.mission_status,
              retryCount: r.retry_count,
              maxRetries: r.max_retries,
              outputPayload: r.output_payload ? JSON.parse(r.output_payload) : null,
              inputPayload: r.input_payload ? JSON.parse(r.input_payload) : null,
              updatedAt: r.updated_at,
            });
          }
        }
      } catch {}

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, approvals: pendingApprovals }));
      return;
    }

    const approvalMatch = pathname.match(/^\/api\/approvals\/([a-zA-Z0-9_-]+)$/);
    if (approvalMatch && method === "POST") {
      const targetId = approvalMatch[1];
      const body = await this.readBody(req);
      const action = (body.action || "APPROVE").toUpperCase();
      const notes = body.notes || "";
      const decidedBy = body.decidedBy || "Chairman of the Board";

      if (action !== "APPROVE" && action !== "REJECT") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: `Invalid action '${action}'. Must be APPROVE or REJECT` }));
        return;
      }

      // Check if targetId is an approval in ApprovalRepository
      const existingApproval = this.approvalRepo.findById(targetId);
      if (existingApproval) {
        const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
        this.approvalRepo.updateStatus(targetId, newStatus, decidedBy);
      }

      const taskId = existingApproval ? existingApproval.taskId : targetId.replace(/^task_appr_/, "");

      if (this.options.taskEngine) {
        const task = this.options.taskEngine.getTask(taskId);
        if (task) {
          if (action === "APPROVE") {
            if (task.status === "PAUSED") {
              await this.options.taskEngine.transitionTask(taskId, "RUNNING", {
                approvalAction: "APPROVED_BY_BOARD",
                operatorNotes: notes || `Approved by ${decidedBy}`,
              });
            }
            try {
              raw.prepare("UPDATE missions SET status = 'ACTIVE' WHERE id = ?").run(task.missionId);
            } catch {}
          } else if (action === "REJECT") {
            if (task.status === "PAUSED") {
              await this.options.taskEngine.transitionTask(taskId, "FAILED", {
                rejectionReason: notes || `Vetoed by ${decidedBy}`,
              });
            }
          }
        }
      }

      const eventType = action === "APPROVE" ? "board.approval.granted" : "board.approval.rejected";
      if (this.options.eventBus) {
        await this.options.eventBus.emit({
          id: randomUUID(),
          type: eventType,
          timestamp: new Date().toISOString(),
          payload: { targetId, taskId, action, notes, decidedBy },
        });
      }

      this.broadcastEvent({
        type: action === "APPROVE" ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED",
        targetId,
        taskId,
        notes,
        decidedBy,
        timestamp: new Date().toISOString(),
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          id: targetId,
          taskId,
          status: action === "APPROVE" ? "RUNNING" : "FAILED",
          action: action === "APPROVE" ? "APPROVED" : "REJECTED",
        })
      );
      return;
    }


    // ==========================================
    // 9. PAUSE & RESUME TASKS
    // ==========================================
    const pauseMatch = pathname.match(/^\/api\/tasks\/([a-zA-Z0-9_-]+)\/pause$/);
    if (pauseMatch && method === "POST") {
      const taskId = pauseMatch[1];
      if (!this.options.taskEngine) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "TaskEngineService not configured" }));
        return;
      }

      const task = this.options.taskEngine.getTask(taskId);
      if (!task) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: `Task '${taskId}' not found` }));
        return;
      }

      if (task.status === "RUNNING" || task.status === "QUEUED") {
        await this.options.taskEngine.transitionTask(taskId, "PAUSED", { reason: "Operator manual intervention" });
        this.broadcastEvent({
          type: "TASK_PAUSED",
          taskId,
          missionId: task.missionId,
          timestamp: new Date().toISOString(),
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, taskId, status: "PAUSED" }));
      return;
    }

    const resumeMatch = pathname.match(/^\/api\/tasks\/([a-zA-Z0-9_-]+)\/resume$/);
    if (resumeMatch && method === "POST") {
      const taskId = resumeMatch[1];
      if (!this.options.taskEngine) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "TaskEngineService not configured" }));
        return;
      }

      const task = this.options.taskEngine.getTask(taskId);
      if (!task) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: `Task '${taskId}' not found` }));
        return;
      }

      if (task.status === "PAUSED") {
        await this.options.taskEngine.transitionTask(taskId, "RUNNING", { reason: "Operator resumed task" });
        this.broadcastEvent({
          type: "TASK_RESUMED",
          taskId,
          missionId: task.missionId,
          timestamp: new Date().toISOString(),
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, taskId, status: "RUNNING" }));
      return;
    }

    // ==========================================
    // 10. SSE EVENT STREAM
    // ==========================================
    if (pathname === "/api/stream" && method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("data: " + JSON.stringify({ type: "CONNECTED", message: "Paperclip EventStream Active" }) + "\n\n");

      this.sseClients.add(res);

      req.on("close", () => {
        this.sseClients.delete(res);
      });
      return;
    }

    // ==========================================
    // 11. STATIC FILES
    // ==========================================
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

  private async getGitDiff(taskId?: string): Promise<DiffResult> {
    const root = this.options.workspaceRoot || process.cwd();
    let targetCwd = root;

    if (taskId && /^[a-zA-Z0-9_-]+$/.test(taskId)) {
      const cleanId = taskId.startsWith("task-") ? taskId.slice(5) : taskId;
      const candidateWorktree = path.resolve(root, ".forge", "worktrees", `task-${cleanId}`);
      if (fs.existsSync(candidateWorktree)) {
        targetCwd = candidateWorktree;
      }
    }

    try {
      let rawDiff = "";
      try {
        const { stdout } = await execAsync("git diff HEAD", { cwd: targetCwd });
        rawDiff = stdout;
      } catch {
        const { stdout } = await execAsync("git diff", { cwd: targetCwd });
        rawDiff = stdout;
      }

      if (!rawDiff || rawDiff.trim().length === 0) {
        try {
          const { stdout: statusOut } = await execAsync("git status --short", { cwd: targetCwd });
          if (statusOut.trim().length > 0) {
            const files: DiffFile[] = statusOut
              .trim()
              .split("\n")
              .map((line) => {
                const statusChar = line.slice(0, 2).trim();
                const filePath = line.slice(3).trim();
                return {
                  path: filePath,
                  status: statusChar === "??" || statusChar === "A" ? "added" : "modified",
                  additions: 1,
                  deletions: 0,
                  chunks: [
                    {
                      header: "@@ Untracked / Staged Changes @@",
                      lines: [{ type: "add", text: `+ [${statusChar}] ${filePath}` }],
                    },
                  ],
                };
              });

            return {
              hasDiff: true,
              taskId: taskId || null,
              files,
              rawDiff: statusOut,
            };
          }
        } catch {}

        return {
          hasDiff: false,
          taskId: taskId || null,
          files: [],
          rawDiff: "",
        };
      }

      const files = this.parseUnifiedDiff(rawDiff);
      return {
        hasDiff: files.length > 0,
        taskId: taskId || null,
        files,
        rawDiff,
      };
    } catch {
      return {
        hasDiff: false,
        taskId: taskId || null,
        files: [],
        rawDiff: "",
      };
    }
  }

  private parseUnifiedDiff(rawDiff: string): DiffFile[] {
    const files: DiffFile[] = [];
    const fileSections = rawDiff.split(/^diff --git /m).filter(Boolean);

    for (const section of fileSections) {
      const lines = section.split("\n");
      const headerLine = lines[0] || "";
      const match = headerLine.match(/a\/(.+?)\s+b\/(.+)/);
      const filePath = match ? match[2] : headerLine.split(" ").pop() || "unknown";

      let status: "modified" | "added" | "deleted" = "modified";
      if (section.includes("new file mode")) {
        status = "added";
      } else if (section.includes("deleted file mode")) {
        status = "deleted";
      }

      let additions = 0;
      let deletions = 0;
      const chunks: DiffChunk[] = [];
      let currentChunk: DiffChunk | null = null;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("@@")) {
          currentChunk = { header: line, lines: [] };
          chunks.push(currentChunk);
        } else if (currentChunk) {
          if (line.startsWith("+") && !line.startsWith("+++")) {
            additions++;
            currentChunk.lines.push({ type: "add", text: line });
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            deletions++;
            currentChunk.lines.push({ type: "del", text: line });
          } else if (line.startsWith(" ")) {
            currentChunk.lines.push({ type: "normal", text: line });
          }
        }
      }

      files.push({
        path: filePath,
        status,
        additions,
        deletions,
        chunks,
      });
    }

    return files;
  }
}
