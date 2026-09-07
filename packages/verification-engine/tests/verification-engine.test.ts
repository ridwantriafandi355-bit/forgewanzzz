import { describe, it, expect, beforeEach } from "vitest";
import { VerificationService } from "../src/services/verification-service.js";
import type { CheckCommand } from "../src/types/verification.js";

describe("VerificationService (AD-005 — Deterministic Supremacy)", () => {
  let verificationService: VerificationService;

  beforeEach(() => {
    verificationService = new VerificationService();
  });

  it("issues passed VerificationEvidence when all Layer 1 deterministic checks succeed (exit 0)", async () => {
    const checks: CheckCommand[] = [
      { name: "typecheck", runner: async () => ({ exitCode: 0, logs: "No TypeScript errors found." }) },
      { name: "test", runner: async () => ({ exitCode: 0, logs: "5 tests passed." }) },
    ];

    const evidence = await verificationService.verifyTask({
      taskId: "task-001",
      policy: "AUTOMATED",
      layer1Checks: checks,
      artifacts: ["src/calculator.ts"],
    });

    expect(evidence.passed).toBe(true);
    expect(evidence.layer).toBe("DETERMINISTIC");
    expect(evidence.taskId).toBe("task-001");
    expect(evidence.checks.typecheck?.passed).toBe(true);
    expect(evidence.checks.typecheck?.exitCode).toBe(0);
    expect(evidence.checks.test?.passed).toBe(true);
    expect(evidence.artifactsVerified).toContain("src/calculator.ts");
    expect(evidence.verificationId).toBeDefined();
  });

  it("fails verification immediately if ANY Layer 1 check returns non-zero exit code (INVARIANT-005.1)", async () => {
    const checks: CheckCommand[] = [
      { name: "typecheck", runner: async () => ({ exitCode: 0, logs: "Types valid." }) },
      { name: "lint", runner: async () => ({ exitCode: 1, logs: "Lint error: unused variable 'x'." }) },
    ];

    const evidence = await verificationService.verifyTask({
      taskId: "task-002",
      policy: "AUTOMATED",
      layer1Checks: checks,
      artifacts: ["src/bad.ts"],
    });

    expect(evidence.passed).toBe(false);
    expect(evidence.checks.lint?.passed).toBe(false);
    expect(evidence.checks.lint?.exitCode).toBe(1);
  });

  it("enforces that Layer 2 reviewer CANNOT overrule a failed Layer 1 check", async () => {
    const checks: CheckCommand[] = [
      { name: "build", runner: async () => ({ exitCode: 2, logs: "Compiler error: syntax invalid" }) },
    ];

    const evidence = await verificationService.verifyTask({
      taskId: "task-003",
      policy: "MIXED",
      layer1Checks: checks,
      layer2Reviewer: async () => ({ passed: true, comments: "Code looks good to me!" }),
      artifacts: ["src/broken.ts"],
    });

    // Despite reviewer saying passed: true, Layer 1 failure makes overall evidence passed: false
    expect(evidence.passed).toBe(false);
  });

  it("requires both Layer 1 and Layer 2 for MIXED completion policy", async () => {
    const checks: CheckCommand[] = [
      { name: "typecheck", runner: async () => ({ exitCode: 0, logs: "OK" }) },
    ];

    // Case A: Layer 2 critic rejects
    const rejectedEvidence = await verificationService.verifyTask({
      taskId: "task-004",
      policy: "MIXED",
      layer1Checks: checks,
      layer2Reviewer: async () => ({ passed: false, comments: "Missing architectural doc comments." }),
      artifacts: ["src/service.ts"],
    });
    expect(rejectedEvidence.passed).toBe(false);

    // Case B: Layer 2 critic approves
    const approvedEvidence = await verificationService.verifyTask({
      taskId: "task-004",
      policy: "MIXED",
      layer1Checks: checks,
      layer2Reviewer: async () => ({ passed: true, comments: "Clean code structure." }),
      artifacts: ["src/service.ts"],
    });
    expect(approvedEvidence.passed).toBe(true);
    expect(approvedEvidence.layer).toBe("MIXED");
  });
});
