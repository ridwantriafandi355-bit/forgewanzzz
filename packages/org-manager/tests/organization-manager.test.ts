import { describe, it, expect, beforeEach } from "vitest";
import { OrganizationManager } from "../src/services/organization-manager.js";
import type { TeamFormationRequest } from "../src/types/organization.js";

describe("OrganizationManager — Governance & Team Provisioning (AD-002)", () => {
  let orgManager: OrganizationManager;

  beforeEach(() => {
    orgManager = new OrganizationManager();
  });

  it("creates an organization and enforces maximum agent concurrency quota", () => {
    const org = orgManager.createOrganization({
      id: "org-alpha",
      projectId: "project-001",
      name: "Alpha Software Team",
      maxAgents: 3,
    });

    expect(org.id).toBe("org-alpha");
    expect(org.maxAgents).toBe(3);

    const request: TeamFormationRequest = {
      requiredRoles: [
        { role: "SUPERVISOR", count: 1, requiredCapabilities: ["planning"] },
        { role: "WORKER", count: 2, requiredCapabilities: ["code_generation", "tool_calling"] },
      ],
    };

    const result = orgManager.requestTeam("org-alpha", request);
    expect(result.assignedAgents).toHaveLength(3);
    expect(orgManager.getOrganizationMembers("org-alpha")).toHaveLength(3);
  });

  it("rejects team formation exceeding max agent quota (INVARIANT-002.1)", () => {
    orgManager.createOrganization({
      id: "org-small",
      projectId: "project-002",
      name: "Small Team",
      maxAgents: 2,
    });

    const request: TeamFormationRequest = {
      requiredRoles: [
        { role: "WORKER", count: 3, requiredCapabilities: ["code_generation"] },
      ],
    };

    expect(() => orgManager.requestTeam("org-small", request)).toThrowError(
      /Exceeds organization maximum agent quota/
    );
  });

  it("ensures every agent belongs to exactly one Organization (INVARIANT-002.2)", () => {
    orgManager.createOrganization({
      id: "org-1",
      projectId: "project-001",
      name: "Team 1",
      maxAgents: 5,
    });

    const result = orgManager.requestTeam("org-1", {
      requiredRoles: [{ role: "WORKER", count: 1, requiredCapabilities: ["code_generation"] }],
    });

    const agentId = result.assignedAgents[0].id;
    const member = orgManager.getMember(agentId);

    expect(member).toBeDefined();
    expect(member?.organizationId).toBe("org-1");
  });

  it("supports decommissioning agents and freeing up quota", () => {
    orgManager.createOrganization({
      id: "org-dyn",
      projectId: "project-003",
      name: "Dynamic Team",
      maxAgents: 1,
    });

    const result1 = orgManager.requestTeam("org-dyn", {
      requiredRoles: [{ role: "WORKER", count: 1, requiredCapabilities: ["code_generation"] }],
    });
    const agentId = result1.assignedAgents[0].id;

    // Quota now full
    expect(() =>
      orgManager.requestTeam("org-dyn", {
        requiredRoles: [{ role: "WORKER", count: 1, requiredCapabilities: ["code_generation"] }],
      })
    ).toThrowError(/Exceeds organization maximum agent quota/);

    // Decommission agent
    orgManager.decommissionMember(agentId);
    expect(orgManager.getMember(agentId)).toBeUndefined();

    // Now quota available again
    const result2 = orgManager.requestTeam("org-dyn", {
      requiredRoles: [{ role: "WORKER", count: 1, requiredCapabilities: ["code_generation"] }],
    });
    expect(result2.assignedAgents).toHaveLength(1);
  });
});
