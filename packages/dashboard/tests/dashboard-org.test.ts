import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  ForgeDatabase,
  runMigrations,
  OrganizationRepository,
  ProjectRepository,
} from "@forge/storage";
import { DashboardServer } from "../src/server/dashboard-server.js";

describe("DashboardServer Multi-Org & Project Config (Doc 16)", () => {
  let tempDir: string;
  let db: ForgeDatabase;
  let orgRepo: OrganizationRepository;
  let projectRepo: ProjectRepository;
  let server: DashboardServer;
  let port: number;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "forge-org-dash-test-"));
    const dbPath = path.join(tempDir, "forge.db");
    db = new ForgeDatabase(dbPath);
    runMigrations(db);

    orgRepo = new OrganizationRepository(db);
    projectRepo = new ProjectRepository(db);

    port = 45000 + Math.floor(Math.random() * 10000);
    server = new DashboardServer({
      port,
      db,
      orgRepo,
      projectRepo,
      publicDir: path.join(__dirname, "..", "src", "public"),
      workspaceRoot: tempDir,
    });

    await server.start();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    db.close();
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("GET /api/org/list returns default seeded organization", async () => {
    const res = await fetch(`http://localhost:${port}/api/org/list`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.organizations.length).toBeGreaterThanOrEqual(1);
    expect(data.organizations[0].name).toBe("FORGE WANZZ INC.");
  });

  it("POST /api/org creates a new organization and GET /api/org?orgId=... retrieves it", async () => {
    const postRes = await fetch(`http://localhost:${port}/api/org`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "org_subsidiary_alpha",
        name: "Autonomous Security Division",
        maxAgents: 6,
      }),
    });

    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.success).toBe(true);
    expect(postData.organization.id).toBe("org_subsidiary_alpha");

    // Fetch org chart for that specific org
    const getRes = await fetch(
      `http://localhost:${port}/api/org?orgId=org_subsidiary_alpha`
    );
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.success).toBe(true);
    expect(getData.company.name).toBe("Autonomous Security Division");
  });

  it("GET and POST /api/project/config manages project configurations", async () => {
    const getRes = await fetch(`http://localhost:${port}/api/project/config?projectId=proj_test`);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.success).toBe(true);
    expect(getData.config.budgetLimitUsd).toBe(100.0);

    // Update config
    const postRes = await fetch(`http://localhost:${port}/api/project/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "proj_test",
        budgetLimitUsd: 750.0,
        defaultOrgId: "org_subsidiary_alpha",
      }),
    });

    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.success).toBe(true);
    expect(postData.config.budgetLimitUsd).toBe(750.0);
    expect(postData.config.defaultOrgId).toBe("org_subsidiary_alpha");
  });
});
