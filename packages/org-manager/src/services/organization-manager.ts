import { randomUUID } from "node:crypto";
import type { OrganizationRepository } from "@forge/storage";
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

  constructor(private repo?: OrganizationRepository) {}

  createOrganization(spec: OrganizationSpec): OrganizationRecord {
    if (this.repo) {
      const existing = this.repo.findById(spec.id);
      if (existing) {
        throw new Error(`Organization with id '${spec.id}' already exists.`);
      }
      return this.repo.create(spec);
    }

    if (this.organizations.has(spec.id)) {
      throw new Error(`Organization with id '${spec.id}' already exists.`);
    }

    const record: OrganizationRecord = {
      ...spec,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.organizations.set(spec.id, record);
    return record;
  }

  getOrganization(orgId: string): OrganizationRecord {
    if (this.repo) {
      const org = this.repo.findById(orgId);
      if (!org) {
        throw new Error(`Organization '${orgId}' not found.`);
      }
      return org;
    }

    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error(`Organization '${orgId}' not found.`);
    }
    return org;
  }

  listOrganizations(projectId?: string): OrganizationRecord[] {
    if (this.repo) {
      return this.repo.findAll(projectId);
    }

    const all = Array.from(this.organizations.values());
    if (projectId) {
      return all.filter((o) => o.projectId === projectId);
    }
    return all;
  }

  getOrganizationMembers(orgId: string): AgentMemberRecord[] {
    if (this.repo) {
      return this.repo.findMembersByOrg(orgId, "ACTIVE") as AgentMemberRecord[];
    }

    return Array.from(this.members.values()).filter(
      (m) => m.organizationId === orgId && m.status === "ACTIVE"
    );
  }

  getMember(agentId: string): AgentMemberRecord | undefined {
    if (this.repo) {
      const member = this.repo.findMemberById(agentId);
      if (!member || member.status === "DECOMMISSIONED") {
        return undefined;
      }
      return member as AgentMemberRecord;
    }

    const member = this.members.get(agentId);
    if (!member || member.status === "DECOMMISSIONED") {
      return undefined;
    }
    return member;
  }

  requestTeam(orgId: string, request: TeamFormationRequest): TeamFormationResult {
    const org = this.getOrganization(orgId);
    const activeMembersCount = this.repo
      ? this.repo.countActiveMembers(orgId)
      : this.getOrganizationMembers(orgId).length;

    // Calculate total agents requested
    const requestedCount = request.requiredRoles.reduce(
      (sum, r) => sum + r.count,
      0
    );

    // Enforce quota: active + requested <= maxAgents
    if (activeMembersCount + requestedCount > org.maxAgents) {
      throw new Error(
        `Exceeds organization maximum agent quota. Current active: ${activeMembersCount}, requested: ${requestedCount}, limit: ${org.maxAgents}.`
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

        if (this.repo) {
          this.repo.saveMember(member);
        } else {
          this.members.set(agentId, member);
        }
        provisioned.push(member);
      }
    }

    return {
      organizationId: org.id,
      assignedAgents: provisioned,
    };
  }

  decommissionMember(agentId: string): void {
    if (this.repo) {
      this.repo.updateMemberStatus(agentId, "DECOMMISSIONED");
      return;
    }

    const member = this.members.get(agentId);
    if (!member) {
      return;
    }

    member.status = "DECOMMISSIONED";
  }

  validateTenantAccess(tenantOrgId: string, targetOrgId: string): boolean {
    return tenantOrgId === targetOrgId;
  }
}
