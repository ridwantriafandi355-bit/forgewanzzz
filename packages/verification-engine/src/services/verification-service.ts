import { randomUUID } from "node:crypto";
import { DeterministicVerifier } from "./deterministic-verifier.js";
import { SemanticVerifier } from "./semantic-verifier.js";
import type {
  VerifyTaskInput,
  VerificationEvidence,
  VerificationLayer,
  Layer2ReviewerAssessment,
} from "../types/verification.js";

export class VerificationService {
  private deterministicVerifier = new DeterministicVerifier();
  private semanticVerifier: SemanticVerifier;

  constructor(semanticVerifier?: SemanticVerifier) {
    this.semanticVerifier = semanticVerifier || new SemanticVerifier();
  }

  public getSemanticVerifier(): SemanticVerifier {
    return this.semanticVerifier;
  }

  async verifyTask(input: VerifyTaskInput): Promise<VerificationEvidence> {
    const checksResults: Record<string, any> = {};
    let layer1Passed = true;

    // 1. Run Layer 1 Deterministic Automated Checks (if provided)
    if (input.layer1Checks && input.layer1Checks.length > 0) {
      const outcome = await this.deterministicVerifier.runChecks(input.layer1Checks);
      layer1Passed = outcome.passed;
      Object.assign(checksResults, outcome.results);
    }

    let reviewerAssessment: Layer2ReviewerAssessment | undefined;
    let overallPassed = layer1Passed;
    let layer: VerificationLayer = "DETERMINISTIC";

    // 2. Evaluate Policy
    switch (input.policy) {
      case "AUTOMATED":
        overallPassed = layer1Passed;
        layer = "DETERMINISTIC";
        break;

      case "MIXED":
        layer = "MIXED";
        // INVARIANT-005.1: If Layer 1 failed, Layer 2 CANNOT overrule it
        if (!layer1Passed) {
          overallPassed = false;
          reviewerAssessment = {
            passed: false,
            comments: "Layer 2 Semantic Review skipped because Layer 1 deterministic checks failed.",
            summary: "Layer 1 checks failed; semantic review blocked per INVARIANT-005.1.",
            overallScore: 0,
            timestamp: new Date().toISOString(),
          };
        } else if (input.layer2Reviewer) {
          reviewerAssessment = await input.layer2Reviewer();
          overallPassed = layer1Passed && reviewerAssessment.passed;
        } else if (input.semanticReviewInput) {
          reviewerAssessment = await this.semanticVerifier.evaluate(input.semanticReviewInput);
          overallPassed = layer1Passed && reviewerAssessment.passed;
        } else {
          // If MIXED was selected but neither custom reviewer nor review input provided, fail safe
          overallPassed = false;
        }
        break;

      case "HUMAN_ATTESTED":
        layer = "HUMAN";
        if (input.humanAttestation) {
          overallPassed = layer1Passed && input.humanAttestation.passed;
        } else {
          overallPassed = false;
        }
        break;
    }

    return {
      verificationId: `verif-${randomUUID()}`,
      taskId: input.taskId,
      layer,
      passed: overallPassed,
      timestamp: new Date().toISOString(),
      checks: checksResults,
      artifactsVerified: input.artifacts || [],
      reviewerAssessment,
      humanAttestation: input.humanAttestation,
    };
  }
}
