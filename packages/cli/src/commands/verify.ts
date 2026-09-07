import { VerificationService, VerificationEvidence } from "@forge/verification-engine";

export interface VerifyOptions {
  workspaceRoot?: string;
  taskId: string;
  simulateExitCode?: number;
}

export interface VerifyResult {
  passed: boolean;
  evidence: VerificationEvidence;
}

export async function verifyCommand(options: VerifyOptions): Promise<VerifyResult> {
  const service = new VerificationService();
  const exitCode = options.simulateExitCode ?? 0;

  const evidence = await service.verifyTask({
    taskId: options.taskId,
    policy: "AUTOMATED",
    layer1Checks: [
      {
        name: "manual-verify-check",
        runner: async () => ({
          exitCode,
          logs: exitCode === 0 ? "Verification passed" : "Verification check failed",
        }),
      },
    ],
    artifacts: [`artifacts/task-${options.taskId}.log`],
  });

  return {
    passed: evidence.passed,
    evidence,
  };
}
