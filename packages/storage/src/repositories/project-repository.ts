import { ForgeDatabase } from "../database.js";

export interface ProjectRecord {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectConfigRecord {
  projectId: string;
  defaultOrgId?: string;
  securityPolicy?: any;
  budgetLimitUsd?: number;
  modelRoutingPreferences?: any;
  createdAt?: string;
  updatedAt?: string;
}

export class ProjectRepository {
  constructor(private db: ForgeDatabase) {}

  create(project: { id: string; name: string; rootPath: string }): ProjectRecord {
    const raw = this.db.getRawDb();
    const now = new Date().toISOString();

    raw
      .prepare(
        `INSERT INTO projects (id, name, root_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(project.id, project.name, project.rootPath, now, now);

    return {
      id: project.id,
      name: project.name,
      rootPath: project.rootPath,
      createdAt: now,
      updatedAt: now,
    };
  }

  findById(id: string): ProjectRecord | null {
    const raw = this.db.getRawDb();
    const row = raw
      .prepare(`SELECT * FROM projects WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      id: row.id as string,
      name: row.name as string,
      rootPath: row.root_path as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  findAll(): ProjectRecord[] {
    const raw = this.db.getRawDb();
    const rows = raw
      .prepare(`SELECT * FROM projects ORDER BY created_at ASC`)
      .all() as Record<string, unknown>[];

    return rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      rootPath: row.root_path as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));
  }

  saveConfig(config: ProjectConfigRecord): void {
    const raw = this.db.getRawDb();
    const now = new Date().toISOString();

    const existingProj = this.findById(config.projectId);
    if (!existingProj) {
      this.create({
        id: config.projectId,
        name: config.projectId,
        rootPath: process.cwd(),
      });
    }

    const secPolicyStr = config.securityPolicy ? JSON.stringify(config.securityPolicy) : null;
    const modelPrefStr = config.modelRoutingPreferences
      ? JSON.stringify(config.modelRoutingPreferences)
      : null;
    const budget = config.budgetLimitUsd !== undefined ? config.budgetLimitUsd : 100.0;

    raw
      .prepare(
        `INSERT OR REPLACE INTO project_configs (
           project_id, default_org_id, security_policy, budget_limit_usd,
           model_routing_preferences, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM project_configs WHERE project_id = ?), ?), ?)`
      )
      .run(
        config.projectId,
        config.defaultOrgId || null,
        secPolicyStr,
        budget,
        modelPrefStr,
        config.projectId,
        now,
        now
      );
  }

  getConfig(projectId: string): ProjectConfigRecord | null {
    const raw = this.db.getRawDb();
    const row = raw
      .prepare(`SELECT * FROM project_configs WHERE project_id = ?`)
      .get(projectId) as Record<string, unknown> | undefined;

    if (!row) return null;

    let securityPolicy: any = null;
    if (row.security_policy && typeof row.security_policy === "string") {
      try {
        securityPolicy = JSON.parse(row.security_policy);
      } catch {}
    }

    let modelRoutingPreferences: any = null;
    if (
      row.model_routing_preferences &&
      typeof row.model_routing_preferences === "string"
    ) {
      try {
        modelRoutingPreferences = JSON.parse(row.model_routing_preferences);
      } catch {}
    }

    return {
      projectId: row.project_id as string,
      defaultOrgId: (row.default_org_id as string) || undefined,
      securityPolicy,
      budgetLimitUsd: Number(row.budget_limit_usd),
      modelRoutingPreferences,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
