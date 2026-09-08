import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ForgeDatabase,
  runMigrations,
  OrganizationRepository,
  type OrganizationSpec,
  type AgentMemberRecord,
} from "../src/index.js";

describe("Schema V5 & OrganizationRepository (Doc 16)", () => {
  let db: ForgeDatabase;
  let repo: OrganizationRepository;

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
    repo = new OrganizationRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("runs Schema V5 and creates organizations and organization_members tables", () => {
    const raw = db.getRawDb();
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain("organizations");
    expect(tables).toContain("organization_members");
    expect(tables).toContain("project_configs");
  });

  it("creates, retrieves, and lists organizations", () => {
    const orgSpec: OrganizationSpec = {
      id: "org_enterprise_01",
      projectId: "proj_main",
      name: "Enterprise Core Swarm",
      maxAgents: 10,
      metadata: { tier: "enterprise", region: "us-east" },
    };

    const created = repo.create(orgSpec);
    expect(created.id).toBe("org_enterprise_01");
    expect(created.status).toBe("ACTIVE");
    expect(created.maxAgents).toBe(10);
    expect(created.metadata).toEqual({ tier: "enterprise", region: "us-east" });

    const retrieved = repo.findById("org_enterprise_01");
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("Enterprise Core Swarm");

    const all = repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("org_enterprise_01");
  });

  it("updates organization details and status", () => {
    repo.create({
      id: "org_update_test",
      projectId: "proj_1",
      name: "Initial Name",
      maxAgents: 5,
    });

    const updated = repo.update("org_update_test", {
      name: "Updated Name",
      maxAgents: 8,
      status: "SUSPENDED",
    });

    expect(updated.name).toBe("Updated Name");
    expect(updated.maxAgents).toBe(8);
    expect(updated.status).toBe("SUSPENDED");

    const fetched = repo.findById("org_update_test");
    expect(fetched?.status).toBe("SUSPENDED");
  });

  it("persists and queries agent members and tracks active headcount", () => {
    repo.create({
      id: "org_agents_test",
      projectId: "proj_1",
      name: "Agent Swarm Org",
      maxAgents: 4,
    });

    const m1: AgentMemberRecord = {
      id: "agent_sup_1",
      organizationId: "org_agents_test",
      role: "SUPERVISOR",
      capabilities: ["planning", "delegation"],
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };

    const m2: AgentMemberRecord = {
      id: "agent_wrk_1",
      organizationId: "org_agents_test",
      role: "WORKER",
      capabilities: ["code_gen", "file_io"],
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };

    repo.saveMember(m1);
    repo.saveMember(m2);

    expect(repo.countActiveMembers("org_agents_test")).toBe(2);

    const members = repo.findMembersByOrg("org_agents_test");
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.role)).toContain("SUPERVISOR");

    // Decommission an agent
    repo.updateMemberStatus("agent_wrk_1", "DECOMMISSIONED");
    expect(repo.countActiveMembers("org_agents_test")).toBe(1);

    const activeOnly = repo.findMembersByOrg("org_agents_test", "ACTIVE");
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0].id).toBe("agent_sup_1");
  });
});
