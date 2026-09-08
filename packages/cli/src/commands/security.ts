import { join } from "node:path";
import {
  ForgeDatabase,
  runMigrations,
  AuditChainRepository,
  type AuditBlock,
  type ChainIntegrityResult,
} from "@forge/storage";

export interface SecurityCommandOptions {
  subcommand?: "audit" | "revoke" | "list";
  tokenId?: string;
  reason?: string;
  limit?: number;
  json?: boolean;
  dbPath?: string;
  secretKey?: string;
}

export interface SecurityCommandResult {
  integrity?: ChainIntegrityResult;
  blocks?: AuditBlock[];
  revoked?: {
    tokenId: string;
    reason: string;
  };
  success: boolean;
  message?: string;
}

export async function securityCommand(
  opts: SecurityCommandOptions = {}
): Promise<SecurityCommandResult> {
  const dbPath = opts.dbPath || join(process.cwd(), ".forge", "forge.db");
  const db = new ForgeDatabase(dbPath);
  runMigrations(db);

  const secretKey = opts.secretKey || process.env.FORGE_SECRET_KEY || "forge-default-master-secret-key-32b";
  const repo = new AuditChainRepository(db, secretKey);
  const subcommand = opts.subcommand || "audit";

  try {
    if (subcommand === "revoke") {
      if (!opts.tokenId) {
        throw new Error("tokenId is required for token revocation (--token <id>)");
      }
      const reason = opts.reason || "Revoked via Forge CLI";
      repo.revokeToken(opts.tokenId, reason);

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              revoked: { tokenId: opts.tokenId, reason },
            },
            null,
            2
          )
        );
      } else {
        console.log(`\n[SECURITY] Token Revoked Successfully`);
        console.log(`Token ID : ${opts.tokenId}`);
        console.log(`Reason   : ${reason}\n`);
      }

      return {
        success: true,
        revoked: { tokenId: opts.tokenId, reason },
        message: `Token ${opts.tokenId} revoked.`,
      };
    }

    // Default or "audit": verify chain and display audit trail
    const integrity = repo.verifyChainIntegrity();
    const blocks = repo.listBlocks(opts.limit ?? 10);

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            success: integrity.valid,
            integrity,
            recentBlocks: blocks,
          },
          null,
          2
        )
      );
    } else {
      console.log(`\n======================= FORGE AUDIT LEDGER =======================`);
      if (integrity.valid) {
        console.log(`STATUS: [VERIFIED] Cryptographic chain intact (${integrity.totalBlocks} blocks)`);
      } else {
        console.log(`STATUS: [TAMPER DETECTED] Chain broken at block height: ${integrity.brokenAtHeight}`);
      }
      console.log(`-------------------------------------------------------------------`);

      if (blocks.length === 0) {
        console.log("  (No audit blocks recorded yet)");
      } else {
        for (const b of blocks) {
          const heightStr = `#${b.blockHeight}`.padEnd(6);
          const typeStr = `[${b.eventType}]`.padEnd(24);
          const actorStr = `actor: ${b.actorId}`.padEnd(26);
          const hashPreview = `${b.blockHash.slice(0, 10)}...${b.blockHash.slice(-6)}`;
          console.log(`${heightStr} ${typeStr} ${actorStr} hash: ${hashPreview}`);
        }
      }
      console.log(`===================================================================\n`);
    }

    return {
      success: integrity.valid,
      integrity,
      blocks,
    };
  } finally {
    db.close();
  }
}
