import { describe, it, expect, beforeEach } from "vitest";
import { ProofAttestation } from "../src/services/proof-attestation.js";
import { AuditChain } from "../src/services/audit-chain.js";

describe("ProofAttestation (Doc 17 - Layer 1 Verification)", () => {
  let attestation: ProofAttestation;
  let auditChain: AuditChain;

  beforeEach(() => {
    auditChain = new AuditChain({ secretKey: "secret-key-layer1-proofs-32b!!" });
    attestation = new ProofAttestation({
      secretKey: "secret-key-layer1-proofs-32b!!",
      auditChain,
    });
  });

  it("creates and verifies valid Layer 1 proof certificate", () => {
    const proof = attestation.createProof({
      taskId: "task_verify_001",
      exitCode: 0,
      gitCommitSha: "abc1234def5678",
      testOutput: "PASS packages/core/tests/all.test.ts (10 tests passed)",
    });

    expect(proof.proofId).toBeDefined();
    expect(proof.testOutputHash).toBeDefined();
    expect(proof.signature).toBeDefined();

    const verification = attestation.verifyProof(proof);
    expect(verification.valid).toBe(true);
    expect(verification.proof?.taskId).toBe("task_verify_001");

    // Also verify event appended to audit chain
    const latest = auditChain.getLatestBlock();
    expect(latest?.eventType).toBe("LAYER1_PROOF_ATTESTED");
    expect(latest?.payload.proofId).toBe(proof.proofId);
  });

  it("rejects proof with modified exit code or signature", () => {
    const proof = attestation.createProof({
      taskId: "task_verify_002",
      exitCode: 1, // failed tests
    });

    // Malicious attacker alters exit code to 0 (faking success)
    const forgedProof = {
      ...proof,
      exitCode: 0,
    };

    const result = attestation.verifyProof(forgedProof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_PROOF_SIGNATURE");
  });
});
