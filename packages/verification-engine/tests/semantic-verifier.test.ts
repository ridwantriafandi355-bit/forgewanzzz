import { describe, it, expect, beforeEach } from "vitest";
import {
  VerificationService,
  SemanticVerifier,
  type CheckCommand,
} from "../src/index.js";

describe("SemanticVerifier & Dual-Layer Verification (Doc 02 & Doc 03)", () => {
  let verifier: SemanticVerifier;
  let service: VerificationService;

  beforeEach(() => {
    verifier = new SemanticVerifier();
    service = new VerificationService(verifier);
  });

  it("detects hardcoded API keys as CRITICAL security issues and rejects review", async () => {
    const assessment = await verifier.evaluate({
      taskId: "task-sec-1",
      files: [
        {
          path: "src/auth.ts",
          content: 'const key = "sk-abcdef1234567890abcdef1234567890";\nexport function getKey() { return key; }',
        },
      ],
    });

    expect(assessment.passed).toBe(false);
    expect(assessment.issues).toBeDefined();
    const secIssue = assessment.issues?.find(
      (i) => i.rule === "security.hardcoded-api-key"
    );
    expect(secIssue).toBeDefined();
    expect(secIssue?.severity).toBe("CRITICAL");
    expect(secIssue?.file).toBe("src/auth.ts");
    expect(assessment.criteria?.securityAudit.passed).toBe(false);
  });

  it("detects trivial test assertions and empty test bodies as CRITICAL issues", async () => {
    const assessment = await verifier.evaluate({
      taskId: "task-test-1",
      files: [
        {
          path: "tests/dummy.test.ts",
          content: 'describe("fake", () => { it("cheats", () => { expect(true).toBe(true); }); });',
        },
      ],
    });

    expect(assessment.passed).toBe(false);
    const trivialIssue = assessment.issues?.find(
      (i) => i.rule === "tests.trivial-assertion"
    );
    expect(trivialIssue).toBeDefined();
    expect(trivialIssue?.severity).toBe("CRITICAL");
    expect(assessment.criteria?.testAdequacy.passed).toBe(false);
  });

  it("detects workspace boundary escape in relative imports", async () => {
    const assessment = await verifier.evaluate({
      taskId: "task-arch-1",
      files: [
        {
          path: "packages/core/src/leak.ts",
          content: 'import { secrets } from "../../../../private/secret.js";\nexport const x = 1;',
        },
      ],
    });

    expect(assessment.passed).toBe(false);
    const archIssue = assessment.issues?.find(
      (i) => i.rule === "architecture.workspace-escape"
    );
    expect(archIssue).toBeDefined();
    expect(archIssue?.severity).toBe("CRITICAL");
  });

  it("approves clean, idiomatic code with high semantic scores", async () => {
    const assessment = await verifier.evaluate({
      taskId: "task-clean-1",
      files: [
        {
          path: "src/calculator.ts",
          content: "export function add(a: number, b: number): number { return a + b; }\n",
        },
        {
          path: "tests/calculator.test.ts",
          content: "import { add } from '../src/calculator.js';\nit('sums numbers', () => { expect(add(2, 3)).toBe(5); });\n",
        },
      ],
    });

    expect(assessment.passed).toBe(true);
    expect(assessment.overallScore).toBeGreaterThanOrEqual(80);
    expect(assessment.criteria?.securityAudit.passed).toBe(true);
    expect(assessment.criteria?.testAdequacy.passed).toBe(true);
    expect(assessment.criteria?.architecturalCompliance.passed).toBe(true);
  });

  it("dual-layer: MIXED policy passes only when Layer 1 AND Layer 2 pass", async () => {
    const layer1: CheckCommand[] = [
      { name: "unit-tests", runner: async () => ({ exitCode: 0, logs: "All tests passed" }) },
    ];

    const evidence = await service.verifyTask({
      taskId: "task-mixed-pass",
      policy: "MIXED",
      layer1Checks: layer1,
      semanticReviewInput: {
        taskId: "task-mixed-pass",
        files: [
          {
            path: "src/user.ts",
            content: "export interface User { id: string; name: string; }\n",
          },
        ],
      },
    });

    expect(evidence.passed).toBe(true);
    expect(evidence.layer).toBe("MIXED");
    expect(evidence.reviewerAssessment?.passed).toBe(true);
  });

  it("dual-layer: MIXED policy rejects when Layer 1 passes but Layer 2 fails on CRITICAL security issue", async () => {
    const layer1: CheckCommand[] = [
      { name: "unit-tests", runner: async () => ({ exitCode: 0, logs: "Tests passed" }) },
    ];

    const evidence = await service.verifyTask({
      taskId: "task-mixed-fail-l2",
      policy: "MIXED",
      layer1Checks: layer1,
      semanticReviewInput: {
        taskId: "task-mixed-fail-l2",
        files: [
          {
            path: "src/bad.ts",
            content: 'eval("console.log(process.env)");\n',
          },
        ],
      },
    });

    expect(evidence.passed).toBe(false);
    expect(evidence.checks["unit-tests"].passed).toBe(true);
    expect(evidence.reviewerAssessment?.passed).toBe(false);
    expect(evidence.reviewerAssessment?.issues?.some((i) => i.rule === "security.dangerous-eval")).toBe(true);
  });

  it("dual-layer: INVARIANT-005.1 blocks Layer 2 semantic review if Layer 1 fails", async () => {
    const layer1: CheckCommand[] = [
      { name: "compile", runner: async () => ({ exitCode: 1, logs: "Syntax error on line 4" }) },
    ];

    const evidence = await service.verifyTask({
      taskId: "task-mixed-fail-l1",
      policy: "MIXED",
      layer1Checks: layer1,
      semanticReviewInput: {
        taskId: "task-mixed-fail-l1",
        files: [{ path: "src/clean.ts", content: "export const ok = 1;\n" }],
      },
    });

    expect(evidence.passed).toBe(false);
    expect(evidence.checks.compile.passed).toBe(false);
    expect(evidence.reviewerAssessment?.passed).toBe(false);
    expect(evidence.reviewerAssessment?.comments).toContain("Layer 1 deterministic checks failed");
  });
});
