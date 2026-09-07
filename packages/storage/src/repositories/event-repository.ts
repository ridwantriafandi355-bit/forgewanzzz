import { ForgeDatabase } from "../database.js";

export interface StoredEvent {
  id: string;
  eventType: string;
  streamId: string;
  streamType: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export class EventRepository {
  constructor(private db: ForgeDatabase) {}

  public saveEvent(event: StoredEvent): void {
    const raw = this.db.getRawDb();
    raw
      .prepare(
        `INSERT INTO events (id, event_type, stream_id, stream_type, payload, metadata, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.eventType,
        event.streamId,
        event.streamType,
        JSON.stringify(event.payload),
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.timestamp
      );
  }

  public getEvents(streamId?: string, limit: number = 100): StoredEvent[] {
    const raw = this.db.getRawDb();
    let rows: any[];

    if (streamId) {
      rows = raw
        .prepare(
          `SELECT id, event_type, stream_id, stream_type, payload, metadata, timestamp
           FROM events WHERE stream_id = ? ORDER BY timestamp ASC LIMIT ?`
        )
        .all(streamId, limit);
    } else {
      rows = raw
        .prepare(
          `SELECT id, event_type, stream_id, stream_type, payload, metadata, timestamp
           FROM events ORDER BY timestamp ASC LIMIT ?`
        )
        .all(limit);
    }

    return rows.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      streamId: r.stream_id,
      streamType: r.stream_type,
      payload: JSON.parse(r.payload),
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
      timestamp: r.timestamp,
    }));
  }
}
