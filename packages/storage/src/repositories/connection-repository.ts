import { ForgeDatabase } from "../database.js";

export interface StoredConnection {
  id: string;
  name: string;
  type: string;
  authType: string;
  status: string;
  credentialOwnership: string;
  credentialRef?: string;
  targetEndpoint?: string;
  health?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class ConnectionRepository {
  constructor(private db: ForgeDatabase) {}

  public save(conn: StoredConnection): void {
    const raw = this.db.getRawDb();
    raw
      .prepare(
        `INSERT INTO connections (id, name, type, auth_type, status, credential_ownership, credential_ref, target_endpoint, health, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           type = excluded.type,
           auth_type = excluded.auth_type,
           status = excluded.status,
           credential_ownership = excluded.credential_ownership,
           credential_ref = excluded.credential_ref,
           target_endpoint = excluded.target_endpoint,
           health = excluded.health,
           metadata = excluded.metadata,
           updated_at = excluded.updated_at`
      )
      .run(
        conn.id,
        conn.name,
        conn.type,
        conn.authType,
        conn.status,
        conn.credentialOwnership,
        conn.credentialRef || null,
        conn.targetEndpoint || null,
        conn.health ? JSON.stringify(conn.health) : null,
        conn.metadata ? JSON.stringify(conn.metadata) : null,
        conn.createdAt,
        conn.updatedAt
      );
  }

  public findById(id: string): StoredConnection | undefined {
    const raw = this.db.getRawDb();
    const row = raw.prepare("SELECT * FROM connections WHERE id = ?").get(id) as any;
    if (!row) return undefined;

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      authType: row.auth_type,
      status: row.status,
      credentialOwnership: row.credential_ownership,
      credentialRef: row.credential_ref || undefined,
      targetEndpoint: row.target_endpoint || undefined,
      health: row.health ? JSON.parse(row.health) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public findAll(): StoredConnection[] {
    const raw = this.db.getRawDb();
    const rows = raw.prepare("SELECT * FROM connections ORDER BY created_at ASC").all() as any[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      authType: row.auth_type,
      status: row.status,
      credentialOwnership: row.credential_ownership,
      credentialRef: row.credential_ref || undefined,
      targetEndpoint: row.target_endpoint || undefined,
      health: row.health ? JSON.parse(row.health) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}
