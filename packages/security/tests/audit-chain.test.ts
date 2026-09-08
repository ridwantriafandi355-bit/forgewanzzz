import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AuditChain } from "../src/services/audit-chain.js";
import { ForgeDatabase, runMigrations, AuditChainRepository } from "@forge/storage";

describe("AuditChain (Doc 17)", () => {
  describe("In-Memory Mode", () => {
    let chain: AuditChain;

    beforeEach(() => {
      chain = new AuditChain({ secretKey: "in-mem-secret-key-32b-secure!!" });
    });

    it("creates sequential linked blocks and validates integrity", () => {
      const b1 = chain.append({
        eventType: "TASK_CREATED",
        actorId: "orchestrator",
        payload: { taskId: "task_1" },
      });

      const b2 = chain.append({
        eventType: "TOOL_DISPATCHED",
        actorId: "agent.coder",
        payload: { tool: "filesystem.read" },
      });

      expect(b1.blockHeight).toBe(1);
      expect(b1.prevHash).toBe("0".repeat(64));
      expect(b2.blockHeight).toBe(2);
      expect(b2.prevHash).toBe(b1.blockHash);

      const verification = chain.verifyIntegrity();
      expect(verification.valid).toBe(true);
      expect(verification.totalBlocks).toBe(2);
    });

    it("detects tampering when block hash is tampered", () => {
      chain.append({
        eventType: "STEP_1",
        actorId: "actor_1",
        payload: { x: 1 },
      });

      const b2 = chain.append({
        eventType: "STEP_2",
        actorId: "actor_2",
        payload: { x: 2 },
      });

      // tamper with b2
      b2.payload = { x: 999 };

      const verification = chain.verifyIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAtHeight).toBe(2);
    });
  });

  describe("Repository-Backed Mode", () => {
    let db: ForgeDatabase;
    let repo: AuditChainRepository;
    let chain: AuditChain;

    beforeEach(() => {
      db = new ForgeDatabase(":memory:");
      runMigrations(db);
      repo = new AuditChainRepository(db, "db-secret-key-32b-secure-value!");
      chain = new AuditChain({ repo, secretKey: "db-secret-key-32b-secure-value!" });
    });

    afterEach(() => {
      db.close();
    });

    it("persists blocks and retrieves history", () => {
      chain.append({
        eventType: "ACTION_A",
        actorId: "actor_a",
        payload: { data: "alpha" },
      });
      chain.append({
        eventType: "ACTION_B",
        actorId: "actor_b",
        payload: { data: "beta" },
      });

      const list = chain.listBlocks(10);
      expect(list).toHaveLength(2);
      expect(list[0].eventType).toBe("ACTION_B");

      const check = chain.verifyIntegrity();
      expect(check.valid).toBe(true);
      expect(check.totalBlocks).toBe(2);
    });
  });
});
