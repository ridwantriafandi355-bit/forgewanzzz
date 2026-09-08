import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForgeDatabase, runMigrations, OrganizationRepository } from "@forge/storage";
import { OrganizationManager } from "../src/services/organization-manager.js";

describe("OrganizationManager with SQLite Persistence (Doc 16)", () => {
  let db: ForgeDatabase;
  let repo: OrganizationRepository;
  let manager: OrganizationManager;

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
    repo = new OrganizationRepository(db);
    manager = new OrganizationManager(repo);
  });

  afterEach(() => {
    db.close();
  });

  it("persists organization to database and survives manager re-creation", () => {
    manager.createOrganization({
      id: "org_persist_1",
      projectId: "proj_alpha",
      name: "Persistent Swarm Corp",
      maxAgents: 6,
    });

    // Create a new manager instance pointing to the same repository/DB
    const newManager = new OrganizationManager(repo);
    const org = newManager.getOrganization("org_persist_1");

    expect(org).toBeDefined();
    expect(org.name).toBe("Persistent Swarm Corp");
    expect(org.maxAgents).toBe(6);
  });

  it("provisions team members and persists them in SQLite", () => {
    manager.createOrganization({
      id: "org_team_1",
      projectId: "proj_alpha",
      name: "Engineering Team",
      maxAgents: 3,
    });

    const result = manager.requestTeam("org_team_1", {
      requiredRoles: [
        { role: "SUPERVISOR", count: 1, requiredCapabilities: ["planning"] },
        { role: "WORKER", count: 2, requiredCapabilities: ["coding"] },
      ],
    });

    expect(result.assignedAgents).toHaveLength(3);

    // Verify persisted via new manager
    const newManager = new OrganizationManager(repo);
    const members = newManager.getOrganizationMembers("org_team_1");
    expect(members).toHaveLength(3);

    const firstAgentId = result.assignedAgents[0].id;
    const member = newManager.getMember(firstAgentId);
    expect(member).toBeDefined();
    expect(member?.organizationId).toBe("org_team_1");
  });

  it("enforces max agent quota against persistent database state", () => {
    manager.createOrganization({
      id: "org_quota_1",
      projectId: "proj_beta",
      name: "Limited Team",
      maxAgents: 2,
    });

    manager.requestTeam("org_quota_1", {
      requiredRoles: [{ role: "WORKER", count: 2, requiredCapabilities: ["coding"] }],
    });

    // Attempt to request 1 more agent -> should fail quota
    expect(() =>
      manager.requestTeam("org_quota_1", {
        requiredRoles: [{ role: "WORKER", count: 1, requiredCapabilities: ["review"] }],
      })
    ).toThrowError(/Exceeds organization maximum agent quota/);

    // Decommission one agent
    const members = manager.getOrganizationMembers("org_quota_1");
    manager.decommissionMember(members[0].id);

    // Now requesting 1 agent succeeds
    const nextResult = manager.requestTeam("org_quota_1", {
      requiredRoles: [{ role: "EVALUATOR", count: 1, requiredCapabilities: ["verify"] }],
    });
    expect(nextResult.assignedAgents).toHaveLength(1);
  });

  it("validates multi-tenant isolation boundaries", () => {
    expect(manager.validateTenantAccess("org_alpha", "org_alpha")).toBe(true);
    expect(manager.validateTenantAccess("org_alpha", "org_beta")).toBe(false);
  });
});
