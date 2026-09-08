import { ForgeDatabase } from "../database.js";

export interface OrganizationSpec {
  id: string;
  projectId?: string;
  name: string;
  maxAgents: number;
  metadata?: Record<string, unknown>;
}

export interface OrganizationRecord extends OrganizationSpec {
  status: "ACTIVE" | "SUSPENDED" | "TERMINATED";
  createdAt: string;
  updatedAt: string;
}

export interface AgentMemberRecord {
  id: string;
  organizationId: string;
  role: string;
  capabilities: string[];
  status: "ACTIVE" | "DECOMMISSIONED";
  createdAt: string;
}

export class OrganizationRepository {
  constructor(private db: ForgeDatabase) {}

  private mapRowToOrg(r: Record<string, unknown>): OrganizationRecord {
    let metadata: Record<string, unknown> | undefined;
    if (r.metadata && typeof r.metadata === "string") {
      try {
        metadata = JSON.parse(r.metadata);
      } catch {}
    }

    return {
      id: r.id as string,
      projectId: (r.project_id as string) || undefined,
      name: r.name as string,
      maxAgents: Number(r.max_agents),
      status: r.status as "ACTIVE" | "SUSPENDED" | "TERMINATED",
      metadata,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  }

  private mapRowToMember(r: Record<string, unknown>): AgentMemberRecord {
    let capabilities: string[] = [];
    if (r.capabilities && typeof r.capabilities === "string") {
      try {
        capabilities = JSON.parse(r.capabilities);
      } catch {}
    }

    return {
      id: r.id as string,
      organizationId: r.organization_id as string,
      role: r.role as string,
      capabilities,
      status: r.status as "ACTIVE" | "DECOMMISSIONED",
      createdAt: r.created_at as string,
    };
  }

  create(spec: OrganizationSpec): OrganizationRecord {
    const raw = this.db.getRawDb();
    const now = new Date().toISOString();
    const status = "ACTIVE";
    const metaStr = spec.metadata ? JSON.stringify(spec.metadata) : null;

    raw
      .prepare(
        `INSERT INTO organizations (id, project_id, name, max_agents, status, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        spec.id,
        spec.projectId || null,
        spec.name,
        spec.maxAgents,
        status,
        metaStr,
        now,
        now
      );

    return {
      ...spec,
      status,
      createdAt: now,
      updatedAt: now,
    };
  }

  findById(id: string): OrganizationRecord | null {
    const raw = this.db.getRawDb();
    const row = raw
      .prepare(`SELECT * FROM organizations WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.mapRowToOrg(row);
  }

  findAll(projectId?: string): OrganizationRecord[] {
    const raw = this.db.getRawDb();
    let rows: Record<string, unknown>[];

    if (projectId) {
      rows = raw
        .prepare(`SELECT * FROM organizations WHERE project_id = ? ORDER BY created_at ASC`)
        .all(projectId) as Record<string, unknown>[];
    } else {
      rows = raw
        .prepare(`SELECT * FROM organizations ORDER BY created_at ASC`)
        .all() as Record<string, unknown>[];
    }

    return rows.map((r) => this.mapRowToOrg(r));
  }

  update(id: string, updates: Partial<OrganizationRecord>): OrganizationRecord {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`Organization '${id}' not found.`);
    }

    const raw = this.db.getRawDb();
    const now = new Date().toISOString();

    const name = updates.name !== undefined ? updates.name : existing.name;
    const maxAgents =
      updates.maxAgents !== undefined ? updates.maxAgents : existing.maxAgents;
    const status = updates.status !== undefined ? updates.status : existing.status;
    const projectId =
      updates.projectId !== undefined ? updates.projectId : existing.projectId;
    const metadata =
      updates.metadata !== undefined ? updates.metadata : existing.metadata;

    const metaStr = metadata ? JSON.stringify(metadata) : null;

    raw
      .prepare(
        `UPDATE organizations
         SET name = ?, max_agents = ?, status = ?, project_id = ?, metadata = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(name, maxAgents, status, projectId || null, metaStr, now, id);

    return {
      id,
      name,
      maxAgents,
      status,
      projectId,
      metadata,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  saveMember(member: AgentMemberRecord): void {
    const raw = this.db.getRawDb();
    const capStr = JSON.stringify(member.capabilities);

    raw
      .prepare(
        `INSERT OR REPLACE INTO organization_members (id, organization_id, role, capabilities, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        member.id,
        member.organizationId,
        member.role,
        capStr,
        member.status,
        member.createdAt
      );
  }

  findMemberById(agentId: string): AgentMemberRecord | null {
    const raw = this.db.getRawDb();
    const row = raw
      .prepare(`SELECT * FROM organization_members WHERE id = ?`)
      .get(agentId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.mapRowToMember(row);
  }

  findMembersByOrg(orgId: string, status?: string): AgentMemberRecord[] {
    const raw = this.db.getRawDb();
    let rows: Record<string, unknown>[];

    if (status) {
      rows = raw
        .prepare(
          `SELECT * FROM organization_members WHERE organization_id = ? AND status = ? ORDER BY created_at ASC`
        )
        .all(orgId, status) as Record<string, unknown>[];
    } else {
      rows = raw
        .prepare(
          `SELECT * FROM organization_members WHERE organization_id = ? ORDER BY created_at ASC`
        )
        .all(orgId) as Record<string, unknown>[];
    }

    return rows.map((r) => this.mapRowToMember(r));
  }

  updateMemberStatus(agentId: string, status: "ACTIVE" | "DECOMMISSIONED"): void {
    const raw = this.db.getRawDb();
    raw
      .prepare(`UPDATE organization_members SET status = ? WHERE id = ?`)
      .run(status, agentId);
  }

  countActiveMembers(orgId: string): number {
    const raw = this.db.getRawDb();
    const row = raw
      .prepare(
        `SELECT COUNT(*) as cnt FROM organization_members WHERE organization_id = ? AND status = 'ACTIVE'`
      )
      .get(orgId) as { cnt: number } | undefined;

    return row?.cnt ?? 0;
  }
}
