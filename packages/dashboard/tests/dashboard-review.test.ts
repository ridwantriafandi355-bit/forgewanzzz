import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ForgeDatabase, runMigrations } from "@forge/storage";
import { DashboardServer } from "../src/server/dashboard-server.js";

describe("DashboardServer Layer 2 Semantic Review Endpoints (Doc 02 & Doc 03)", () => {
  let tempDir: string;
  let db: ForgeDatabase;
  let server: DashboardServer;
  let port: number;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "forge-dash-review-test-"));
    const dbPath = path.join(tempDir, "forge.db");
    db = new ForgeDatabase(dbPath);
    runMigrations(db);

    port = 46000 + Math.floor(Math.random() * 8000);
    server = new DashboardServer({
      port,
      db,
      publicDir: path.join(__dirname, "..", "src", "public"),
      workspaceRoot: tempDir,
    });

    await server.start();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("GET /api/task/review returns assessment for task", async () => {
    const res = await fetch(`http://localhost:${port}/api/task/review?taskId=task_test_101`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.taskId).toBe("task_test_101");
    expect(data.assessment).toBeDefined();
    expect(data.assessment.passed).toBe(true);
    expect(data.assessment.criteria?.securityAudit).toBeDefined();
  });

  it("GET /api/task/review returns 400 if taskId is missing", async () => {
    const res = await fetch(`http://localhost:${port}/api/task/review`);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it("POST /api/task/review evaluates submitted files and detects critical security issues", async () => {
    const postRes = await fetch(`http://localhost:${port}/api/task/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: "task_eval_sec",
        files: [
          {
            path: "src/leaked.ts",
            content: 'const secret = "sk-123456789012345678901234567890";\n',
          },
        ],
      }),
    });

    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.success).toBe(true);
    expect(postData.assessment.passed).toBe(false);
    expect(postData.assessment.issues?.some((i: any) => i.rule === "security.hardcoded-api-key")).toBe(true);
  });
});
