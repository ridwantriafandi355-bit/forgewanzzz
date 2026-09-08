import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { securityCommand } from "../src/commands/security.js";
import { runCli } from "../src/cli.js";
import { ForgeDatabase, runMigrations, AuditChainRepository } from "@forge/storage";

describe("Forge CLI Security Commands (Doc 17)", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-sec-cli-test-"));
    const forgeDir = path.join(tempDir, ".forge");
    await fs.mkdir(forgeDir, { recursive: true });
    dbPath = path.join(forgeDir, "forge.db");

    // Initialize DB with migrations and sample audit data
    const db = new ForgeDatabase(dbPath);
    runMigrations(db);
    const repo = new AuditChainRepository(db, "test-cli-security-key-32b!!!");
    repo.appendBlock({
      eventType: "SYSTEM_INIT",
      actorId: "forge.cli",
      payload: { init: true },
    });
    db.close();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("forge security audit returns intact chain integrity and recent blocks", async () => {
    const res = await securityCommand({
      dbPath,
      secretKey: "test-cli-security-key-32b!!!",
    });

    expect(res.success).toBe(true);
    expect(res.integrity?.valid).toBe(true);
    expect(res.integrity?.totalBlocks).toBe(1);
    expect(res.blocks).toHaveLength(1);
    expect(res.blocks![0].eventType).toBe("SYSTEM_INIT");
  });

  it("forge security revoke marks a token revoked and logs into audit chain", async () => {
    const res = await securityCommand({
      subcommand: "revoke",
      tokenId: "tok_cli_compromised_1",
      reason: "Compromised via developer workstation",
      dbPath,
      secretKey: "test-cli-security-key-32b!!!",
    });

    expect(res.success).toBe(true);
    expect(res.revoked?.tokenId).toBe("tok_cli_compromised_1");

    // Verify subsequent audit shows 2 blocks and intact chain
    const auditRes = await securityCommand({
      subcommand: "audit",
      dbPath,
      secretKey: "test-cli-security-key-32b!!!",
    });

    expect(auditRes.integrity?.valid).toBe(true);
    expect(auditRes.integrity?.totalBlocks).toBe(2);
    expect(auditRes.blocks![0].eventType).toBe("TOKEN_REVOKED");
  });

  it("runCli executes 'security audit' without throwing", async () => {
    await expect(
      runCli(["node", "forge", "security", "audit", "--json"])
    ).resolves.not.toThrow();
  });
});
