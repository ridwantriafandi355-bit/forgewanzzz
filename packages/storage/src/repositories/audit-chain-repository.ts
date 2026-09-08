import crypto from "node:crypto";
import { ForgeDatabase } from "../database.js";

export interface AuditBlockInput {
  id?: string;
  eventType: string;
  actorId: string;
  payload: any;
  createdAt?: string;
}

export interface AuditBlock {
  blockHeight: number;
  id: string;
  prevHash: string;
  blockHash: string;
  eventType: string;
  actorId: string;
  payload: any;
  signature: string;
  createdAt: string;
}

export interface ChainIntegrityResult {
  valid: boolean;
  totalBlocks: number;
  brokenAtHeight?: number;
}

export class AuditChainRepository {
  private secretKey: string;

  constructor(private db: ForgeDatabase, secretKey?: string) {
    this.secretKey = secretKey ?? "forge-default-master-secret-key-32b";
  }

  private hashBlock(
    prevHash: string,
    eventType: string,
    actorId: string,
    payloadStr: string,
    createdAt: string
  ): string {
    return crypto
      .createHash("sha256")
      .update(`${prevHash}:${eventType}:${actorId}:${payloadStr}:${createdAt}`)
      .digest("hex");
  }

  private signHash(blockHash: string): string {
    return crypto
      .createHmac("sha256", this.secretKey)
      .update(blockHash)
      .digest("hex");
  }

  private mapRowToBlock(r: Record<string, unknown>): AuditBlock {
    let payload = r.payload;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        // preserve raw string
      }
    }

    return {
      blockHeight: Number(r.block_height),
      id: r.id as string,
      prevHash: r.prev_hash as string,
      blockHash: r.block_hash as string,
      eventType: r.event_type as string,
      actorId: r.actor_id as string,
      payload,
      signature: r.signature as string,
      createdAt: r.created_at as string,
    };
  }

  appendBlock(input: AuditBlockInput): AuditBlock {
    const raw = this.db.getRawDb();
    const id = input.id ?? `evt_${crypto.randomUUID()}`;
    const createdAt = input.createdAt ?? new Date().toISOString();

    const latest = this.getLatestBlock();
    const prevHash = latest ? latest.blockHash : "0".repeat(64);

    const payloadStr =
      typeof input.payload === "string"
        ? input.payload
        : JSON.stringify(input.payload);

    const blockHash = this.hashBlock(
      prevHash,
      input.eventType,
      input.actorId,
      payloadStr,
      createdAt
    );

    const signature = this.signHash(blockHash);

    const result = raw
      .prepare(
        `INSERT INTO audit_chain (id, prev_hash, block_hash, event_type, actor_id, payload, signature, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        prevHash,
        blockHash,
        input.eventType,
        input.actorId,
        payloadStr,
        signature,
        createdAt
      );

    return {
      blockHeight: Number(result.lastInsertRowid),
      id,
      prevHash,
      blockHash,
      eventType: input.eventType,
      actorId: input.actorId,
      payload:
        typeof input.payload === "string"
          ? JSON.parse(payloadStr)
          : input.payload,
      signature,
      createdAt,
    };
  }

  getLatestBlock(): AuditBlock | null {
    const raw = this.db.getRawDb();
    const row = raw
      .prepare(
        `SELECT * FROM audit_chain ORDER BY block_height DESC LIMIT 1`
      )
      .get() as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToBlock(row);
  }

  verifyChainIntegrity(): ChainIntegrityResult {
    const raw = this.db.getRawDb();
    const rows = raw
      .prepare(`SELECT * FROM audit_chain ORDER BY block_height ASC`)
      .all() as Record<string, unknown>[];

    if (rows.length === 0) {
      return { valid: true, totalBlocks: 0 };
    }

    let expectedPrevHash = "0".repeat(64);

    for (const row of rows) {
      const height = Number(row.block_height);
      const prevHash = row.prev_hash as string;
      const blockHash = row.block_hash as string;
      const eventType = row.event_type as string;
      const actorId = row.actor_id as string;
      const payloadStr =
        typeof row.payload === "string"
          ? row.payload
          : JSON.stringify(row.payload);
      const signature = row.signature as string;
      const createdAt = row.created_at as string;

      // 1. Verify prev_hash link
      if (prevHash !== expectedPrevHash) {
        return { valid: false, totalBlocks: rows.length, brokenAtHeight: height };
      }

      // 2. Verify recalculated block hash
      const recalculatedHash = this.hashBlock(
        prevHash,
        eventType,
        actorId,
        payloadStr,
        createdAt
      );

      if (recalculatedHash !== blockHash) {
        return { valid: false, totalBlocks: rows.length, brokenAtHeight: height };
      }

      // 3. Verify HMAC signature in constant time
      const expectedSig = this.signHash(blockHash);
      const expectedBuffer = Buffer.from(expectedSig);
      const sigBuffer = Buffer.from(signature);

      if (
        expectedBuffer.length !== sigBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, sigBuffer)
      ) {
        return { valid: false, totalBlocks: rows.length, brokenAtHeight: height };
      }

      expectedPrevHash = blockHash;
    }

    return { valid: true, totalBlocks: rows.length };
  }

  revokeToken(tokenId: string, reason: string): void {
    const raw = this.db.getRawDb();
    const revokedAt = new Date().toISOString();

    raw
      .prepare(
        `INSERT OR REPLACE INTO revoked_tokens (token_id, revoked_at, reason)
         VALUES (?, ?, ?)`
      )
      .run(tokenId, revokedAt, reason);

    this.appendBlock({
      id: `rev_${tokenId}_${Date.now()}`,
      eventType: "TOKEN_REVOKED",
      actorId: "security.revocation",
      payload: { tokenId, reason, revokedAt },
      createdAt: revokedAt,
    });
  }

  isTokenRevoked(tokenId: string): boolean {
    const raw = this.db.getRawDb();
    const row = raw
      .prepare(`SELECT 1 FROM revoked_tokens WHERE token_id = ?`)
      .get(tokenId);

    return Boolean(row);
  }

  listBlocks(limit: number = 50): AuditBlock[] {
    const raw = this.db.getRawDb();
    const rows = raw
      .prepare(
        `SELECT * FROM audit_chain ORDER BY block_height DESC LIMIT ?`
      )
      .all(limit) as Record<string, unknown>[];

    return rows.map((r) => this.mapRowToBlock(r));
  }
}
