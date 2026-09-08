import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ForgeDatabase,
  runMigrations,
  ProjectRepository,
  type ProjectRecord,
  type ProjectConfigRecord,
} from "../src/index.js";

describe("ProjectRepository & Configuration (Doc 16)", () => {
  let db: ForgeDatabase;
  let repo: ProjectRepository;

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
    repo = new ProjectRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates and retrieves project records", () => {
    const proj = repo.create({
      id: "proj_forge_001",
      name: "Forge Autonomous Core",
      rootPath: "C:/Projects/forge-core",
    });

    expect(proj.id).toBe("proj_forge_001");
    expect(proj.name).toBe("Forge Autonomous Core");

    const retrieved = repo.findById("proj_forge_001");
    expect(retrieved).toBeDefined();
    expect(retrieved?.rootPath).toBe("C:/Projects/forge-core");

    const all = repo.findAll();
    expect(all).toHaveLength(1);
  });

  it("persists and updates project configuration", () => {
    repo.create({
      id: "proj_cfg_001",
      name: "Configurable Project",
      rootPath: "C:/Projects/test",
    });

    const config: ProjectConfigRecord = {
      projectId: "proj_cfg_001",
      defaultOrgId: "org_default_1",
      securityPolicy: {
        minTrustLevel: "L1",
        allowedTools: ["filesystem.read", "filesystem.write"],
        requireApprovalForTools: ["system.exec"],
      },
      budgetLimitUsd: 250.0,
      modelRoutingPreferences: {
        SUPERVISOR: "claude-3-5-sonnet",
        WORKER: "gemini-2.5-flash",
      },
    };

    repo.saveConfig(config);

    const retrieved = repo.getConfig("proj_cfg_001");
    expect(retrieved).toBeDefined();
    expect(retrieved?.defaultOrgId).toBe("org_default_1");
    expect(retrieved?.budgetLimitUsd).toBe(250.0);
    expect(retrieved?.securityPolicy.minTrustLevel).toBe("L1");
    expect(retrieved?.modelRoutingPreferences.SUPERVISOR).toBe("claude-3-5-sonnet");

    // Update budget
    repo.saveConfig({
      ...config,
      budgetLimitUsd: 500.0,
    });

    const updated = repo.getConfig("proj_cfg_001");
    expect(updated?.budgetLimitUsd).toBe(500.0);
  });
});
