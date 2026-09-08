import { describe, it, expect } from "vitest";
import { EvaluatorAgent, DEFAULT_EVALUATOR_MANIFEST } from "../src/index.js";

describe("EvaluatorAgent (Doc 03 Section 4 & Doc 02 Section 7.3)", () => {
  it("initializes with role 'Evaluator' and enforces zero-write permissions", () => {
    const evaluator = new EvaluatorAgent();

    expect(evaluator.manifest.role).toBe("Evaluator");
    expect(evaluator.hasWritePermissions()).toBe(false);
    expect(evaluator.manifest.capabilities.toolsBlacklist).toContain("filesystem.write");
    expect(evaluator.manifest.capabilities.toolsBlacklist).toContain("system.exec");
    expect(evaluator.manifest.capabilities.toolsBlacklist).toContain("git.commit");
    expect(evaluator.getCurrentState()).toBe("IDLE");
  });

  it("reviews compliant code and issues PASSED assessment with high scores", async () => {
    const evaluator = new EvaluatorAgent();

    const assessment = await evaluator.review({
      taskId: "task-good-001",
      taskDescription: "Implement pure mathematical helper",
      files: [
        {
          path: "src/math.ts",
          content: "export function multiply(a: number, b: number): number {\n  return a * b;\n}\n",
        },
        {
          path: "tests/math.test.ts",
          content: "import { multiply } from '../src/math.js';\nit('multiplies numbers correctly', () => {\n  expect(multiply(3, 4)).toBe(12);\n});\n",
        },
      ],
    });

    expect(assessment.passed).toBe(true);
    expect(assessment.reviewerAgentId).toBe(DEFAULT_EVALUATOR_MANIFEST.id);
    expect(assessment.overallScore).toBeGreaterThanOrEqual(70);
    expect(assessment.criteria?.securityAudit.passed).toBe(true);
    expect(assessment.criteria?.testAdequacy.passed).toBe(true);
    expect(evaluator.getCurrentState()).toBe("IDLE");
  });

  it("reviews defective code, detects critical security issues, and marks review failed", async () => {
    const evaluator = new EvaluatorAgent();

    const assessment = await evaluator.review({
      taskId: "task-vuln-002",
      taskDescription: "Add configuration loader",
      files: [
        {
          path: "src/config.ts",
          content: 'const masterKey = "sk-123456789012345678901234567890";\nexport function load() { return masterKey; }\n',
        },
      ],
    });

    expect(assessment.passed).toBe(false);
    expect(assessment.issues?.some((i) => i.rule === "security.hardcoded-api-key")).toBe(true);
    expect(assessment.criteria?.securityAudit.passed).toBe(false);
    expect(evaluator.getCurrentState()).toBe("IDLE");
  });

  it("maintains zero-write lockdown even if custom manifest attempts to omit blacklist", () => {
    const evaluator = new EvaluatorAgent({
      id: "agent.custom.evaluator",
      name: "Custom Evaluator",
      capabilities: {
        skills: ["skill.code_review"],
        toolsBlacklist: [], // Attempts to allow all tools
      },
    });

    expect(evaluator.manifest.role).toBe("Evaluator");
    expect(evaluator.hasWritePermissions()).toBe(false);
    expect(evaluator.manifest.capabilities.toolsBlacklist).toContain("filesystem.write");
    expect(evaluator.manifest.capabilities.toolsBlacklist).toContain("system.exec");
  });
});
