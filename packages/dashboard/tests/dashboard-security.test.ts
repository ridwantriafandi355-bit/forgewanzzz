import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ForgeDatabase, runMigrations, AuditChainRepository } from "@forge/storage";
import { DashboardServer } from "../src/server/dashboard-server.js";

describe("DashboardServer Security Endpoints (Doc 17)", () => {
  let tempDir: string;
  let db: ForgeDatabase;
  let auditRepo: AuditChainRepository;
  let server: DashboardServer;
  let port: number;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "forge-sec-dash-test-"));
    const dbPath = path.join(tempDir, "forge.db");
    db = new ForgeDatabase(dbPath);
    runMigrations(db);

    auditRepo = new AuditChainRepository(db, "test-dash-security-master-key-32b");
    // Seed initial block
    auditRepo.appendBlock({
      eventType: "GENESIS_BOOTSTRAP",
      actorId: "forge.genesis",
      payload: { version: "0.1.0" },
    });

    port = 35000 + Math.floor(Math.random() * 10000);
    server = new DashboardServer({
      port,
      db,
      auditRepo,
      publicDir: path.join(__dirname, "..", "src", "public"),
      workspaceRoot: tempDir,
    });

    await server.start();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    db.close();
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("GET /api/security/status returns valid integrity and ledger metadata", async () => {
    const res = await fetch(`http://localhost:${port}/api/security/status`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.integrity.valid).toBe(true);
    expect(data.totalBlocks).toBe(1);
    expect(data.recentBlocks).toHaveLength(1);
    expect(data.recentBlocks[0].eventType).toBe("GENESIS_BOOTSTRAP");
    expect(data.revokedTokensCount).toBe(0);
  });

  it("POST /api/security/revoke revokes a token and logs to audit ledger", async () => {
    const revokeRes = await fetch(`http://localhost:${port}/api/security/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenId: "tok_malicious_99",
        reason: "Detected abnormal tool invocation loop",
      }),
    });

    expect(revokeRes.status).toBe(200);
    const revokeData = await revokeRes.json();
    expect(revokeData.success).toBe(true);
    expect(revokeData.tokenId).toBe("tok_malicious_99");

    // Fetch status again: should have 2 blocks and 1 revoked token
    const statusRes = await fetch(`http://localhost:${port}/api/security/status`);
    const statusData = await statusRes.json();
    expect(statusData.totalBlocks).toBe(2);
    expect(statusData.revokedTokensCount).toBe(1);
    expect(statusData.recentBlocks[0].eventType).toBe("TOKEN_REVOKED");
  });

  it("GET /api/security/chain returns paginated block chain", async () => {
    for (let i = 1; i <= 3; i++) {
      auditRepo.appendBlock({
        eventType: "TEST_STEP",
        actorId: "tester",
        payload: { step: i },
      });
    }

    const chainRes = await fetch(`http://localhost:${port}/api/security/chain?limit=2`);
    expect(chainRes.status).toBe(200);
    const chainData = await chainRes.json();
    expect(chainData.success).toBe(true);
    expect(chainData.blocks).toHaveLength(2);
    expect(chainData.integrity.valid).toBe(true);
  });

  it("detects tampering when database row payload is maliciously altered", async () => {
    const raw = db.getRawDb();
    raw.prepare("UPDATE audit_chain SET payload = ? WHERE block_height = 1").run(
      JSON.stringify({ version: "malicious_hack" })
    );

    const res = await fetch(`http://localhost:${port}/api/security/status`);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.integrity.valid).toBe(false);
    expect(data.integrity.brokenAtHeight).toBe(1);
  });
});
