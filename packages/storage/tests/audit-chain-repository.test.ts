import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ForgeDatabase,
  runMigrations,
  AuditChainRepository,
  type AuditBlockInput,
} from "../src/index.js";

describe("Schema V4 & AuditChainRepository (17-SECURITY-MODEL)", () => {
  let db: ForgeDatabase;
  let repo: AuditChainRepository;

  beforeEach(() => {
    db = new ForgeDatabase(":memory:");
    runMigrations(db);
    repo = new AuditChainRepository(db, "test-master-secret-key-32bytes!!");
  });

  afterEach(() => {
    db.close();
  });

  it("runs Schema V4 and initializes audit_chain and revoked_tokens tables", () => {
    const raw = db.getRawDb();
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain("audit_chain");
    expect(tables).toContain("revoked_tokens");
  });

  it("appends genesis block and subsequent blocks with valid cryptographic hash chaining", () => {
    // 1. Genesis block (first block)
    const block1 = repo.appendBlock({
      id: "evt_sec_001",
      eventType: "TOKEN_ISSUED",
      actorId: "capability.resolver",
      payload: { tokenId: "tok_alpha", taskId: "tsk_101", allowedTools: ["filesystem.read"] },
    });

    expect(block1.blockHeight).toBe(1);
    expect(block1.prevHash).toBe("0".repeat(64)); // Genesis prev_hash
    expect(block1.blockHash).toBeDefined();
    expect(block1.signature).toBeDefined();

    // 2. Second block chained to block1
    const block2 = repo.appendBlock({
      id: "evt_sec_002",
      eventType: "TOOL_EXECUTED",
      actorId: "agent.coder",
      payload: { tokenId: "tok_alpha", tool: "filesystem.read", exitCode: 0 },
    });

    expect(block2.blockHeight).toBe(2);
    expect(block2.prevHash).toBe(block1.blockHash);
    expect(block2.blockHash).not.toBe(block1.blockHash);

    // Verify chain integrity
    const audit = repo.verifyChainIntegrity();
    expect(audit.valid).toBe(true);
    expect(audit.totalBlocks).toBe(2);
    expect(audit.brokenAtHeight).toBeUndefined();
  });

  it("detects tampering if a block payload is maliciously modified", () => {
    repo.appendBlock({
      id: "evt_tamper_1",
      eventType: "TOKEN_ISSUED",
      actorId: "system",
      payload: { balance: 100 },
    });

    repo.appendBlock({
      id: "evt_tamper_2",
      eventType: "BALANCE_TRANSFERRED",
      actorId: "agent.worker",
      payload: { amount: 50 },
    });

    repo.appendBlock({
      id: "evt_tamper_3",
      eventType: "BALANCE_TRANSFERRED",
      actorId: "agent.worker",
      payload: { amount: 20 },
    });

    // Verify initial chain is valid
    expect(repo.verifyChainIntegrity().valid).toBe(true);

    // Tamper with block 2 payload directly via raw SQL
    const raw = db.getRawDb();
    raw.prepare("UPDATE audit_chain SET payload = ? WHERE block_height = 2").run(
      JSON.stringify({ amount: 999999 })
    );

    // Integrity check must detect the tamper at block 2
    const tamperedAudit = repo.verifyChainIntegrity();
    expect(tamperedAudit.valid).toBe(false);
    expect(tamperedAudit.brokenAtHeight).toBe(2);
  });

  it("records revoked tokens and checks revocation status", () => {
    expect(repo.isTokenRevoked("tok_compromised")).toBe(false);

    repo.revokeToken("tok_compromised", "Suspected credential leakage in public repository");
    expect(repo.isTokenRevoked("tok_compromised")).toBe(true);

    // Also verify revocation was audited in audit_chain
    const latest = repo.getLatestBlock();
    expect(latest?.eventType).toBe("TOKEN_REVOKED");
    expect(latest?.actorId).toBe("security.revocation");
  });

  it("lists recent blocks with pagination", () => {
    for (let i = 1; i <= 5; i++) {
      repo.appendBlock({
        id: `evt_list_${i}`,
        eventType: "TASK_STEP",
        actorId: "agent.worker",
        payload: { step: i },
      });
    }

    const blocks = repo.listBlocks(3);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].blockHeight).toBe(5); // Latest first
    expect(blocks[1].blockHeight).toBe(4);
    expect(blocks[2].blockHeight).toBe(3);
  });
});
