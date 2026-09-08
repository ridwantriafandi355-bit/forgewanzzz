import crypto from "node:crypto";
import type {
  AuditBlock,
  AuditBlockInput,
  AuditChainRepository,
  ChainIntegrityResult,
} from "@forge/storage";

export interface AuditChainConfig {
  secretKey?: string;
  repo?: AuditChainRepository;
}

export class AuditChain {
  private secretKey: string;
  private repo?: AuditChainRepository;
  private inMemoryBlocks: AuditBlock[] = [];

  constructor(config?: AuditChainConfig) {
    this.secretKey = config?.secretKey ?? "forge-default-master-secret-key-32b";
    this.repo = config?.repo;
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

  append(input: AuditBlockInput): AuditBlock {
    if (this.repo) {
      return this.repo.appendBlock(input);
    }

    const height = this.inMemoryBlocks.length + 1;
    const prevHash =
      height === 1
        ? "0".repeat(64)
        : this.inMemoryBlocks[this.inMemoryBlocks.length - 1].blockHash;

    const id = input.id ?? `evt_${crypto.randomUUID()}`;
    const createdAt = input.createdAt ?? new Date().toISOString();
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

    const block: AuditBlock = {
      blockHeight: height,
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

    this.inMemoryBlocks.push(block);
    return block;
  }

  verifyIntegrity(): ChainIntegrityResult {
    if (this.repo) {
      return this.repo.verifyChainIntegrity();
    }

    if (this.inMemoryBlocks.length === 0) {
      return { valid: true, totalBlocks: 0 };
    }

    let expectedPrevHash = "0".repeat(64);

    for (const block of this.inMemoryBlocks) {
      if (block.prevHash !== expectedPrevHash) {
        return {
          valid: false,
          totalBlocks: this.inMemoryBlocks.length,
          brokenAtHeight: block.blockHeight,
        };
      }

      const payloadStr =
        typeof block.payload === "string"
          ? block.payload
          : JSON.stringify(block.payload);

      const recalculatedHash = this.hashBlock(
        block.prevHash,
        block.eventType,
        block.actorId,
        payloadStr,
        block.createdAt
      );

      if (recalculatedHash !== block.blockHash) {
        return {
          valid: false,
          totalBlocks: this.inMemoryBlocks.length,
          brokenAtHeight: block.blockHeight,
        };
      }

      const expectedSig = this.signHash(block.blockHash);
      const expectedBuf = Buffer.from(expectedSig);
      const actualBuf = Buffer.from(block.signature);

      if (
        expectedBuf.length !== actualBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, actualBuf)
      ) {
        return {
          valid: false,
          totalBlocks: this.inMemoryBlocks.length,
          brokenAtHeight: block.blockHeight,
        };
      }

      expectedPrevHash = block.blockHash;
    }

    return { valid: true, totalBlocks: this.inMemoryBlocks.length };
  }

  getLatestBlock(): AuditBlock | null {
    if (this.repo) {
      return this.repo.getLatestBlock();
    }
    if (this.inMemoryBlocks.length === 0) return null;
    return this.inMemoryBlocks[this.inMemoryBlocks.length - 1];
  }

  listBlocks(limit: number = 50): AuditBlock[] {
    if (this.repo) {
      return this.repo.listBlocks(limit);
    }
    return [...this.inMemoryBlocks].reverse().slice(0, limit);
  }
}
