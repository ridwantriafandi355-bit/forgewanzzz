import type { CheckCommand, CheckResult } from "../types/verification.js";

export class DeterministicVerifier {
  async runChecks(checks: CheckCommand[]): Promise<{
    passed: boolean;
    results: Record<string, CheckResult>;
  }> {
    const results: Record<string, CheckResult> = {};
    let allPassed = true;

    for (const check of checks) {
      try {
        const out = await check.runner();
        const passed = out.exitCode === 0;
        results[check.name] = {
          passed,
          exitCode: out.exitCode,
          logs: out.logs,
        };

        if (!passed) {
          allPassed = false;
        }
      } catch (err: any) {
        results[check.name] = {
          passed: false,
          exitCode: -1,
          logs: `Execution error: ${err.message}`,
        };
        allPassed = false;
      }
    }

    return {
      passed: allPassed,
      results,
    };
  }
}
