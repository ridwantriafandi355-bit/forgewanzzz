import { DomainEvent } from "@forge/core";
import { ForgeDatabase } from "../database.js";

export interface AuditEntry {
  id: number;
  eventId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export class AuditRepository {
  constructor(private db: ForgeDatabase) {}

  appendEvent(entityType: string, entityId: string, event: DomainEvent): void {
    const raw = this.db.getRawDb();
    raw.prepare(`
      INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, payload, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.type,
      entityType,
      entityId,
      JSON.stringify(event.payload),
      event.timestamp
    );
  }

  getEntriesByEntity(entityType: string, entityId: string): AuditEntry[] {
    const raw = this.db.getRawDb();
    const rows = raw.prepare(`
      SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY id ASC
    `).all(entityType, entityId) as Record<string, unknown>[];

    return rows.map(r => ({
      id: Number(r.id),
      eventId: r.event_id as string,
      eventType: r.event_type as string,
      entityType: r.entity_type as string,
      entityId: r.entity_id as string,
      payload: JSON.parse(r.payload as string),
      timestamp: r.timestamp as string
    }));
  }
}
