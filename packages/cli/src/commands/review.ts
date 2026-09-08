import * as fs from "node:fs";
import * as path from "node:path";
import {
  ForgeDatabase,
  runMigrations,
  TaskRepository,
} from "@forge/storage";
import {
  SemanticVerifier,
  type Layer2ReviewerAssessment,
} from "@forge/verification-engine";

export interface ReviewCommandOptions {
  taskId?: string;
  filePath?: string;
  json?: boolean;
}

export async function reviewCommand(options: ReviewCommandOptions): Promise<Layer2ReviewerAssessment | null> {
  const verifier = new SemanticVerifier();
  let assessment: Layer2ReviewerAssessment | null = null;

  // Mode 1: Review a specific local file directly
  if (options.filePath) {
    const fullPath = path.resolve(process.cwd(), options.filePath);
    if (!fs.existsSync(fullPath)) {
      console.error(`[ERROR] File not found: ${options.filePath}`);
      return null;
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    assessment = await verifier.evaluate({
      taskId: `manual-review-${path.basename(options.filePath)}`,
      files: [{ path: options.filePath, content }],
    });
  }
  // Mode 2: Query a completed/retrying task's review evidence from database
  else if (options.taskId) {
    const dbPath = path.join(process.cwd(), ".forge", "forge.db");
    if (!fs.existsSync(dbPath)) {
      // In-memory fallback if no db exists on disk
      const memDb = new ForgeDatabase(":memory:");
      runMigrations(memDb);
      const repo = new TaskRepository(memDb);
      const task = repo.getTaskById(options.taskId);
      if (task?.outputPayload) {
        assessment = (task.outputPayload as any).evidence?.reviewerAssessment
          || (task.outputPayload as any).critique;
      }
      memDb.close();
    } else {
      const db = new ForgeDatabase(dbPath);
      const repo = new TaskRepository(db);
      const task = repo.getTaskById(options.taskId);
      if (task?.outputPayload) {
        assessment = (task.outputPayload as any).evidence?.reviewerAssessment
          || (task.outputPayload as any).critique;
      }
      db.close();
    }

    if (!assessment) {
      // If task has no pre-existing assessment, run semantic check on task artifacts if available
      assessment = {
        passed: false,
        summary: `No Layer 2 review evidence recorded yet for task ${options.taskId}.`,
        overallScore: 0,
        timestamp: new Date().toISOString(),
      };
    }
  } else {
    console.error("Usage: forge review <taskId> [--file <path>] [--json]");
    return null;
  }

  if (options.json) {
    console.log(JSON.stringify(assessment, null, 2));
    return assessment;
  }

  // CLI Table Output
  console.log("\n==================== FORGE LAYER 2 SEMANTIC REVIEW ====================");
  console.log(`STATUS : [${assessment.passed ? "APPROVED" : "REJECTED / NEEDS REVISION"}]`);
  console.log(`SCORE  : ${assessment.overallScore ?? 0} / 100`);
  console.log(`AGENT  : ${assessment.reviewerAgentId || "evaluator.senior-architect"}`);
  console.log(`SUMMARY: ${assessment.summary || assessment.comments || "No summary provided"}`);
  console.log("------------------------------------------------------------------------");

  if (assessment.criteria) {
    console.log("CRITERIA BREAKDOWN:");
    console.log(`  - Security Audit         : [${assessment.criteria.securityAudit.passed ? "PASS" : "FAIL"}] (${assessment.criteria.securityAudit.score}/100) ${assessment.criteria.securityAudit.notes || ""}`);
    console.log(`  - Architectural Standard : [${assessment.criteria.architecturalCompliance.passed ? "PASS" : "FAIL"}] (${assessment.criteria.architecturalCompliance.score}/100) ${assessment.criteria.architecturalCompliance.notes || ""}`);
    console.log(`  - Test Adequacy          : [${assessment.criteria.testAdequacy.passed ? "PASS" : "FAIL"}] (${assessment.criteria.testAdequacy.score}/100) ${assessment.criteria.testAdequacy.notes || ""}`);
    console.log(`  - Type Safety & Style    : [${assessment.criteria.typeSafetyAndCleanliness.passed ? "PASS" : "FAIL"}] (${assessment.criteria.typeSafetyAndCleanliness.score}/100) ${assessment.criteria.typeSafetyAndCleanliness.notes || ""}`);
    console.log("------------------------------------------------------------------------");
  }

  if (assessment.issues && assessment.issues.length > 0) {
    console.log(`ISSUES IDENTIFIED (${assessment.issues.length}):`);
    for (const issue of assessment.issues) {
      const loc = issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ""})` : "";
      console.log(`  [${issue.severity}] ${issue.rule}${loc}: ${issue.message}`);
      if (issue.suggestion) {
        console.log(`    Fix: ${issue.suggestion}`);
      }
    }
  } else {
    console.log("  No semantic issues identified. Code meets sovereign quality gates.");
  }

  console.log("========================================================================\n");

  return assessment;
}
