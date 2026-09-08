export type AgentRole = "SUPERVISOR" | "WORKER" | "EVALUATOR" | "HUMAN_PROXY";

export interface OrganizationSpec {
  id: string;
  projectId?: string;
  name: string;
  maxAgents: number;
  metadata?: Record<string, unknown>;
}

export interface TenantContext {
  organizationId: string;
  projectId?: string;
  actorId?: string;
}

export interface OrganizationRecord extends OrganizationSpec {
  status: "ACTIVE" | "SUSPENDED" | "TERMINATED";
  createdAt: string;
  updatedAt?: string;
}

export interface RoleRequirement {
  role: AgentRole;
  count: number;
  requiredCapabilities?: string[];
}

export interface TeamFormationRequest {
  requiredRoles: RoleRequirement[];
}

export interface AgentMemberRecord {
  id: string;
  organizationId: string;
  role: AgentRole;
  capabilities: string[];
  status: "ACTIVE" | "DECOMMISSIONED";
  createdAt: string;
}

export interface TeamFormationResult {
  organizationId: string;
  assignedAgents: AgentMemberRecord[];
}
