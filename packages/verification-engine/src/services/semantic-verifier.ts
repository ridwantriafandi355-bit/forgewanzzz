import type {
  SemanticReviewInput,
  Layer2ReviewerAssessment,
  SemanticReviewIssue,
  SemanticReviewCriteria,
  SemanticCriterionScore,
} from "../types/verification.js";

export class SemanticVerifier {
  private defaultReviewerId = "evaluator.senior-architect";

  public async evaluate(input: SemanticReviewInput): Promise<Layer2ReviewerAssessment> {
    const issues: SemanticReviewIssue[] = [];
    const files = input.files || [];
    const diff = input.diff || "";

    // 1. Evaluate Security Audit
    const secIssues = this.auditSecurity(files, diff);
    issues.push(...secIssues);

    // 2. Evaluate Test Adequacy
    const testIssues = this.auditTestAdequacy(files, diff);
    issues.push(...testIssues);

    // 3. Evaluate Architectural Compliance
    const archIssues = this.auditArchitecture(files, diff);
    issues.push(...archIssues);

    // 4. Evaluate Type Safety & Cleanliness
    const typeIssues = this.auditTypeSafety(files, diff);
    issues.push(...typeIssues);

    // Calculate criterion scores
    const securityScore = this.computeScore(secIssues);
    const testScore = this.computeScore(testIssues);
    const archScore = this.computeScore(archIssues);
    const typeScore = this.computeScore(typeIssues);

    const criteria: SemanticReviewCriteria = {
      securityAudit: securityScore,
      testAdequacy: testScore,
      architecturalCompliance: archScore,
      typeSafetyAndCleanliness: typeScore,
    };

    const overallScore = Math.round(
      (securityScore.score * 0.35) +
      (testScore.score * 0.25) +
      (archScore.score * 0.25) +
      (typeScore.score * 0.15)
    );

    const hasCriticalIssues = issues.some((i) => i.severity === "CRITICAL");
    const passed = !hasCriticalIssues && overallScore >= 70;

    const reviewerId = input.reviewerAgentId || this.defaultReviewerId;
    const summary = passed
      ? `Layer 2 Semantic Review PASSED with score ${overallScore}/100. Architectural and security standards met.`
      : `Layer 2 Semantic Review REJECTED (Score: ${overallScore}/100). Found ${issues.filter(i => i.severity === 'CRITICAL').length} critical issues that require revision.`;

    return {
      passed,
      reviewerAgentId: reviewerId,
      overallScore,
      summary,
      comments: summary,
      criteria,
      issues,
      timestamp: new Date().toISOString(),
    };
  }

  private auditSecurity(
    files: Array<{ path: string; content: string }>,
    diff: string
  ): SemanticReviewIssue[] {
    const issues: SemanticReviewIssue[] = [];
    const contentToCheck = files.length > 0 ? files : [{ path: "diff", content: diff }];

    const secretPatterns = [
      { rule: "security.hardcoded-api-key", regex: /sk-[a-zA-Z0-9_-]{20,}/, msg: "Hardcoded OpenAI/Anthropic secret key detected." },
      { rule: "security.hardcoded-token", regex: /ghp_[a-zA-Z0-9]{20,}/, msg: "Hardcoded GitHub personal access token detected." },
      { rule: "security.raw-password", regex: /password\s*[:=]\s*["'][^"']{6,}["']/i, msg: "Hardcoded plain-text password detected." },
    ];

    const dangerousCalls = [
      { rule: "security.dangerous-eval", regex: /\beval\s*\(/, msg: "Direct call to 'eval()' is forbidden." },
      { rule: "security.dangerous-function-constructor", regex: /new\s+Function\s*\(/, msg: "Dynamic code compilation via 'new Function()' is forbidden." },
    ];

    for (const f of contentToCheck) {
      const lines = f.content.split("\n");
      lines.forEach((line, idx) => {
        for (const pattern of secretPatterns) {
          if (pattern.regex.test(line)) {
            issues.push({
              severity: "CRITICAL",
              file: f.path,
              line: idx + 1,
              rule: pattern.rule,
              message: pattern.msg,
              suggestion: "Store secrets in environment variables or the Forge Secret Vault.",
            });
          }
        }

        for (const call of dangerousCalls) {
          if (call.regex.test(line)) {
            issues.push({
              severity: "CRITICAL",
              file: f.path,
              line: idx + 1,
              rule: call.rule,
              message: call.msg,
              suggestion: "Refactor to use deterministic static logic without dynamic code evaluation.",
            });
          }
        }
      });
    }

    return issues;
  }

  private auditTestAdequacy(
    files: Array<{ path: string; content: string }>,
    diff: string
  ): SemanticReviewIssue[] {
    const issues: SemanticReviewIssue[] = [];
    const testFiles = files.filter(
      (f) => f.path.includes(".test.") || f.path.includes(".spec.")
    );

    // If no explicit test files array, inspect diff for test blocks
    const targets = testFiles.length > 0 ? testFiles : diff.includes("describe(") ? [{ path: "tests", content: diff }] : [];

    for (const f of targets) {
      const lines = f.content.split("\n");
      lines.forEach((line, idx) => {
        // Trivial dummy assertion: expect(true).toBe(true) or expect(1).toBe(1)
        if (/expect\s*\(\s*(true|1|"test")\s*\)\.toBe\s*\(\s*(true|1|"test")\s*\)/.test(line)) {
          issues.push({
            severity: "CRITICAL",
            file: f.path,
            line: idx + 1,
            rule: "tests.trivial-assertion",
            message: "Trivial dummy assertion detected ('expect(true).toBe(true)'). Tests must verify real state.",
            suggestion: "Assert actual outputs or state returned by the system under test.",
          });
        }

        // Empty test body
        if (/it\s*\(\s*["'][^"']+["']\s*,\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(line)) {
          issues.push({
            severity: "CRITICAL",
            file: f.path,
            line: idx + 1,
            rule: "tests.empty-test-body",
            message: "Empty test implementation block detected.",
            suggestion: "Implement real test assertions.",
          });
        }
      });
    }

    return issues;
  }

  private auditArchitecture(
    files: Array<{ path: string; content: string }>,
    diff: string
  ): SemanticReviewIssue[] {
    const issues: SemanticReviewIssue[] = [];
    const targets = files.length > 0 ? files : [{ path: "diff", content: diff }];

    for (const f of targets) {
      const lines = f.content.split("\n");
      lines.forEach((line, idx) => {
        // Escape workspace boundary via excessive parent traversal
        if (/from\s*["']\.\.\/\.\.\/\.\.\/\.\.\//.test(line)) {
          issues.push({
            severity: "CRITICAL",
            file: f.path,
            line: idx + 1,
            rule: "architecture.workspace-escape",
            message: "Relative import path escapes package boundaries (4+ parent traversals).",
            suggestion: "Use workspace package imports (e.g. '@forge/storage') instead of deep relative paths.",
          });
        }
      });
    }

    return issues;
  }

  private auditTypeSafety(
    files: Array<{ path: string; content: string }>,
    diff: string
  ): SemanticReviewIssue[] {
    const issues: SemanticReviewIssue[] = [];
    const targets = files.length > 0 ? files : [{ path: "diff", content: diff }];

    for (const f of targets) {
      const lines = f.content.split("\n");
      let anyCount = 0;
      lines.forEach((line, idx) => {
        if (/as\s+any\b/.test(line) || /:\s*any\b/.test(line)) {
          anyCount++;
          if (anyCount > 5) {
            issues.push({
              severity: "WARNING",
              file: f.path,
              line: idx + 1,
              rule: "types.excessive-any",
              message: `Excessive usage of untyped 'any' detected (${anyCount} occurrences in file).`,
              suggestion: "Introduce strongly typed interfaces or 'unknown' with type guards.",
            });
          }
        }
      });
    }

    return issues;
  }

  private computeScore(issues: SemanticReviewIssue[]): SemanticCriterionScore {
    let penalty = 0;
    for (const issue of issues) {
      if (issue.severity === "CRITICAL") penalty += 35;
      else if (issue.severity === "WARNING") penalty += 15;
      else if (issue.severity === "SUGGESTION") penalty += 5;
    }

    const score = Math.max(0, 100 - penalty);
    const passed = !issues.some((i) => i.severity === "CRITICAL") && score >= 60;

    return {
      passed,
      score,
      notes: issues.length > 0 ? `${issues.length} issue(s) identified` : "Clean, no issues detected.",
    };
  }
}
