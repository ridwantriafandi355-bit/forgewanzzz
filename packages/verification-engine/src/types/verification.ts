export type CompletionPolicy = "AUTOMATED" | "HUMAN_ATTESTED" | "MIXED";

export type VerificationLayer = "DETERMINISTIC" | "SEMANTIC" | "MIXED" | "HUMAN";

export interface CheckCommand {
  name: string;
  runner: () => Promise<{ exitCode: number; logs: string }>;
}

export interface CheckResult {
  passed: boolean;
  exitCode: number;
  logs: string;
}

export type IssueSeverity = "CRITICAL" | "WARNING" | "SUGGESTION";

export interface SemanticReviewIssue {
  severity: IssueSeverity;
  file?: string;
  line?: number;
  rule: string;
  message: string;
  suggestion?: string;
}

export interface SemanticCriterionScore {
  passed: boolean;
  score: number; // 0 to 100
  notes?: string;
}

export interface SemanticReviewCriteria {
  architecturalCompliance: SemanticCriterionScore;
  typeSafetyAndCleanliness: SemanticCriterionScore;
  testAdequacy: SemanticCriterionScore;
  securityAudit: SemanticCriterionScore;
}

export interface Layer2ReviewerAssessment {
  passed: boolean;
  comments?: string;
  summary?: string;
  reviewerAgentId?: string;
  overallScore?: number; // 0 to 100
  criteria?: SemanticReviewCriteria;
  issues?: SemanticReviewIssue[];
  timestamp?: string;
}

export type Layer2Reviewer = () => Promise<Layer2ReviewerAssessment>;

export interface SemanticReviewInput {
  taskId: string;
  diff?: string;
  files?: Array<{ path: string; content: string }>;
  taskDescription?: string;
  reviewerAgentId?: string;
}

export interface HumanAttestation {
  passed: boolean;
  operator: string;
  comments?: string;
}

export interface VerificationEvidence {
  verificationId: string;
  taskId: string;
  layer: VerificationLayer;
  passed: boolean;
  timestamp: string;
  checks: Record<string, CheckResult>;
  artifactsVerified: string[];
  reviewerAssessment?: Layer2ReviewerAssessment;
  humanAttestation?: HumanAttestation;
}

export interface VerifyTaskInput {
  taskId: string;
  policy: CompletionPolicy;
  layer1Checks?: CheckCommand[];
  layer2Reviewer?: Layer2Reviewer;
  semanticReviewInput?: SemanticReviewInput;
  humanAttestation?: HumanAttestation;
  artifacts?: string[];
}
