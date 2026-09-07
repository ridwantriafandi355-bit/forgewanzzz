import { randomUUID } from "node:crypto";
import type {
  OrganizationSpec,
  OrganizationRecord,
  TeamFormationRequest,
  TeamFormationResult,
  AgentMemberRecord,
} from "../types/organization.js";

export class OrganizationManager {
  private organizations = new Map<string, OrganizationRecord>();
  private members = new Map<string, AgentMemberRecord>();

  createOrganization(spec: OrganizationSpec): OrganizationRecord {
    if (this.organizations.has(spec.id)) {
      throw new Error(`Organization with id '${spec.id}' already exists.`);
    }

    const record: OrganizationRecord = {
      ...spec,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };

    this.organizations.set(spec.id, record);
    return record;
  }

  getOrganization(orgId: string): OrganizationRecord {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error(`Organization '${orgId}' not found.`);
    }
    return org;
  }

  getOrganizationMembers(orgId: string): AgentMemberRecord[] {
    return Array.from(this.members.values()).filter(
      (m) => m.organizationId === orgId && m.status === "ACTIVE"
    );
  }

  getMember(agentId: string): AgentMemberRecord | undefined {
    const member = this.members.get(agentId);
    if (!member || member.status === "DECOMMISSIONED") {
      return undefined;
    }
    return member;
  }

  requestTeam(orgId: string, request: TeamFormationRequest): TeamFormationResult {
    const org = this.getOrganization(orgId);
    const activeMembers = this.getOrganizationMembers(orgId);

    // Calculate total agents requested
    const requestedCount = request.requiredRoles.reduce((sum, r) => sum + r.count, 0);

    // Enforce quota: active + requested <= maxAgents
    if (activeMembers.length + requestedCount > org.maxAgents) {
      throw new Error(
        `Exceeds organization maximum agent quota. Current active: ${activeMembers.length}, requested: ${requestedCount}, limit: ${org.maxAgents}.`
      );
    }

    const provisioned: AgentMemberRecord[] = [];

    for (const req of request.requiredRoles) {
      for (let i = 0; i < req.count; i++) {
        const agentId = `agent-${req.role.toLowerCase()}-${randomUUID().slice(0, 8)}`;
        const member: AgentMemberRecord = {
          id: agentId,
          organizationId: org.id,
          role: req.role,
          capabilities: req.requiredCapabilities || [],
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
        };

        this.members.set(agentId, member);
        provisioned.push(member);
      }
    }

    return {
      organizationId: org.id,
      assignedAgents: provisioned,
    };
  }

  decommissionMember(agentId: string): void {
    const member = this.members.get(agentId);
    if (!member) {
      return;
    }

    member.status = "DECOMMISSIONED";
  }
}
