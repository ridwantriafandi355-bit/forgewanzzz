import crypto from "node:crypto";
import type { AuditChain } from "./audit-chain.js";
import type {
  Layer1AttestationInput,
  Layer1Proof,
  ProofAttestationResult,
} from "../types/security.js";

export interface ProofAttestationConfig {
  secretKey?: string;
  auditChain?: AuditChain;
}

export class ProofAttestation {
  private secretKey: string;
  private auditChain?: AuditChain;

  constructor(config?: ProofAttestationConfig) {
    this.secretKey = config?.secretKey ?? "forge-default-master-secret-key-32b";
    this.auditChain = config?.auditChain;
  }

  private canonicalizeProof(
    proofId: string,
    taskId: string,
    exitCode: number,
    gitCommitSha: string | null,
    testOutputHash: string | null,
    timestamp: string,
    attestorId: string
  ): string {
    return JSON.stringify({
      proofId,
      taskId,
      exitCode,
      gitCommitSha,
      testOutputHash,
      timestamp,
      attestorId,
    });
  }

  private signProof(canonicalData: string): string {
    return crypto
      .createHmac("sha256", this.secretKey)
      .update(canonicalData)
      .digest("hex");
  }

  createProof(input: Layer1AttestationInput): Layer1Proof {
    const proofId = `l1proof_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const attestorId = input.attestorId ?? "forge.layer1.verifier";

    const testOutputHash = input.testOutput
      ? crypto.createHash("sha256").update(input.testOutput).digest("hex")
      : undefined;

    const canonical = this.canonicalizeProof(
      proofId,
      input.taskId,
      input.exitCode,
      input.gitCommitSha ?? null,
      testOutputHash ?? null,
      timestamp,
      attestorId
    );

    const signature = this.signProof(canonical);

    const proof: Layer1Proof = {
      proofId,
      taskId: input.taskId,
      exitCode: input.exitCode,
      gitCommitSha: input.gitCommitSha,
      testOutputHash,
      timestamp,
      attestorId,
      signature,
    };

    if (this.auditChain) {
      this.auditChain.append({
        id: `evt_${proofId}`,
        eventType: "LAYER1_PROOF_ATTESTED",
        actorId: attestorId,
        payload: {
          proofId,
          taskId: input.taskId,
          exitCode: input.exitCode,
          gitCommitSha: input.gitCommitSha,
          testOutputHash,
        },
        createdAt: timestamp,
      });
    }

    return proof;
  }

  verifyProof(proof: Layer1Proof): ProofAttestationResult {
    const canonical = this.canonicalizeProof(
      proof.proofId,
      proof.taskId,
      proof.exitCode,
      proof.gitCommitSha ?? null,
      proof.testOutputHash ?? null,
      proof.timestamp,
      proof.attestorId
    );

    const expectedSig = this.signProof(canonical);
    const expectedBuf = Buffer.from(expectedSig);
    const actualBuf = Buffer.from(proof.signature);

    if (
      expectedBuf.length !== actualBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, actualBuf)
    ) {
      return {
        valid: false,
        reason: "INVALID_PROOF_SIGNATURE",
      };
    }

    return {
      valid: true,
      proof,
    };
  }
}
