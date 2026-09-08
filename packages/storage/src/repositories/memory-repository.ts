import { randomUUID } from "node:crypto";
import type { ForgeDatabase } from "../database.js";

export type MemoryScopeType =
  | "GLOBAL"
  | "PROJECT"
  | "MISSION"
  | "TASK"
  | "AGENT"
  | "DECISION"
  | "ERROR_SOLUTION";

export type MemoryCategory =
  | "CONTEXT"
  | "SNIPPET"
  | "LEARNING"
  | "CONVERSATION";

export interface MemoryRecord {
  id: string;
  scopeType: MemoryScopeType;
  scopeId: string;
  category: MemoryCategory;
  title?: string;
  content: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  embedding?: number[];
  tokenCount: number;
  accessCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryRecordInput {
  id?: string;
  scopeType: MemoryScopeType;
  scopeId: string;
  category: MemoryCategory;
  title?: string;
  content: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  embedding?: number[];
  tokenCount?: number;
  createdAt?: string;
}

export interface MemorySearchQuery {
  query: string;
  scopeType?: MemoryScopeType;
  scopeId?: string;
  category?: MemoryCategory;
  limit?: number;
}

export interface MemorySearchResult extends MemoryRecord {
  score: number;
}

export class MemoryRepository {
  constructor(private db: ForgeDatabase) {}

  store(input: MemoryRecordInput): MemoryRecord {
    const raw = this.db.getRawDb();
    const id = input.id || `mem_${randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    const createdAt = input.createdAt || now;
    const updatedAt = now;
    const tagsJson = JSON.stringify(input.tags || []);
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
    const embeddingJson = input.embedding ? JSON.stringify(input.embedding) : null;
    const tagsString = (input.tags || []).join(" ");
    const tokenCount = input.tokenCount ?? Math.max(1, Math.ceil(input.content.length / 4));

    // Check existing
    const existing = this.findById(id);
    const accessCount = existing ? existing.accessCount : 0;
    const lastAccessedAt = existing ? existing.lastAccessedAt : null;

    // Delete existing from FTS if updating
    if (existing) {
      try {
        raw.prepare("DELETE FROM memory_fts WHERE id = ?").run(id);
      } catch {}
    }

    const stmt = raw.prepare(`
      INSERT INTO memory_records (
        id, scope_type, scope_id, category, title, content, tags, metadata,
        embedding, token_count, access_count, last_accessed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        scope_type = excluded.scope_type,
        scope_id = excluded.scope_id,
        category = excluded.category,
        title = excluded.title,
        content = excluded.content,
        tags = excluded.tags,
        metadata = excluded.metadata,
        embedding = excluded.embedding,
        token_count = excluded.token_count,
        updated_at = excluded.updated_at;
    `);

    stmt.run(
      id,
      input.scopeType,
      input.scopeId,
      input.category,
      input.title || null,
      input.content,
      tagsJson,
      metadataJson,
      embeddingJson,
      tokenCount,
      accessCount,
      lastAccessedAt,
      createdAt,
      updatedAt
    );

    // Sync into FTS
    try {
      raw.prepare(`
        INSERT INTO memory_fts(id, content, title, tags, scope_type, scope_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.content,
        input.title || "",
        tagsString,
        input.scopeType,
        input.scopeId
      );
    } catch {}

    return {
      id,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      category: input.category,
      title: input.title,
      content: input.content,
      tags: input.tags || [],
      metadata: input.metadata,
      embedding: input.embedding,
      tokenCount,
      accessCount,
      lastAccessedAt,
      createdAt,
      updatedAt,
    };
  }

  findById(id: string): MemoryRecord | null {
    const raw = this.db.getRawDb();
    const row = raw.prepare("SELECT * FROM memory_records WHERE id = ?").get(id) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  listByScope(scopeType: MemoryScopeType, scopeId: string, limit: number = 50): MemoryRecord[] {
    const raw = this.db.getRawDb();
    const rows = raw.prepare(`
      SELECT * FROM memory_records
      WHERE scope_type = ? AND scope_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(scopeType, scopeId, limit) as any[];

    return rows.map((r) => this.mapRow(r));
  }

  search(options: MemorySearchQuery): MemorySearchResult[] {
    const raw = this.db.getRawDb();
    const limit = options.limit || 20;

    // Sanitize query tokens for FTS5 (remove syntax-breaking symbols)
    const sanitizedTokens = options.query
      .replace(/[^\w\s-]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (sanitizedTokens.length === 0) {
      return [];
    }

    // Match each token as prefix or exact
    const matchExpr = sanitizedTokens.map((t) => `"${t}"*`).join(" OR ");

    let sql = `
      SELECT m.*, bm25(memory_fts) AS rank
      FROM memory_fts f
      JOIN memory_records m ON f.id = m.id
      WHERE memory_fts MATCH ?
    `;
    const params: any[] = [matchExpr];

    if (options.scopeType) {
      sql += " AND m.scope_type = ?";
      params.push(options.scopeType);
    }
    if (options.scopeId) {
      sql += " AND m.scope_id = ?";
      params.push(options.scopeId);
    }
    if (options.category) {
      sql += " AND m.category = ?";
      params.push(options.category);
    }

    sql += " ORDER BY rank ASC LIMIT ?";
    params.push(limit);

    try {
      const rows = raw.prepare(sql).all(...params) as any[];
      return rows.map((r) => ({
        ...this.mapRow(r),
        score: Math.abs(r.rank ?? 0),
      }));
    } catch {
      return [];
    }
  }

  recordAccess(id: string): void {
    const raw = this.db.getRawDb();
    const now = new Date().toISOString();
    raw.prepare(`
      UPDATE memory_records
      SET access_count = access_count + 1, last_accessed_at = ?
      WHERE id = ?
    `).run(now, id);
  }

  delete(id: string): boolean {
    const raw = this.db.getRawDb();
    try {
      raw.prepare("DELETE FROM memory_fts WHERE id = ?").run(id);
    } catch {}
    const result = raw.prepare("DELETE FROM memory_records WHERE id = ?").run(id);
    return (result.changes ?? 0) > 0;
  }

  prune(scopeType: MemoryScopeType, scopeId: string, retainMax: number): number {
    const raw = this.db.getRawDb();
    const rows = raw.prepare(`
      SELECT id FROM memory_records
      WHERE scope_type = ? AND scope_id = ?
      ORDER BY created_at DESC
      LIMIT -1 OFFSET ?
    `).all(scopeType, scopeId, retainMax) as { id: string }[];

    if (rows.length === 0) {
      return 0;
    }

    const deleteStmt = raw.prepare("DELETE FROM memory_records WHERE id = ?");
    const ftsDeleteStmt = raw.prepare("DELETE FROM memory_fts WHERE id = ?");

    let pruned = 0;
    for (const row of rows) {
      try {
        ftsDeleteStmt.run(row.id);
      } catch {}
      deleteStmt.run(row.id);
      pruned++;
    }

    return pruned;
  }

  private mapRow(row: any): MemoryRecord {
    let tags: string[] = [];
    if (row.tags) {
      try {
        tags = JSON.parse(row.tags);
      } catch {}
    }

    let metadata: Record<string, unknown> | undefined;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch {}
    }

    let embedding: number[] | undefined;
    if (row.embedding) {
      try {
        embedding = JSON.parse(row.embedding);
      } catch {}
    }

    return {
      id: row.id,
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      category: row.category,
      title: row.title || undefined,
      content: row.content,
      tags,
      metadata,
      embedding,
      tokenCount: row.token_count,
      accessCount: row.access_count,
      lastAccessedAt: row.last_accessed_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
