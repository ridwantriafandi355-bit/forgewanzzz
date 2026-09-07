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

export interface Layer2ReviewerAssessment {
  passed: boolean;
  comments: string;
}

export type Layer2Reviewer = () => Promise<Layer2ReviewerAssessment>;

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
  humanAttestation?: HumanAttestation;
  artifacts?: string[];
}
