import { AgentStateMachine } from "../fsm/agent-state-machine.js";
import { PromptCompositionPipeline } from "../prompt/prompt-pipeline.js";
import { SemanticVerifier } from "@forge/verification-engine";
import type {
  Layer2ReviewerAssessment,
  SemanticReviewInput,
} from "@forge/verification-engine";
import type { AgentManifest, AgentState } from "../types/agent.js";

export const DEFAULT_EVALUATOR_MANIFEST: AgentManifest = {
  id: "agent.evaluator.senior",
  name: "Forge Senior Staff Evaluator",
  role: "Evaluator",
  description: "Specialized in Layer 2 Semantic Verification: architectural consistency, type safety, test adequacy, and security audit.",
  capabilities: {
    skills: ["skill.code_review", "skill.security_audit"],
    toolsBlacklist: ["filesystem.write", "system.exec", "git.commit"],
  },
  systemPrompt: `You are a Senior Staff Software Architect and Principal Security Auditor within Forge Wanzz.
Your mission is to perform strict, unyielding Layer 2 Semantic Verification on code submissions.
You verify:
1. Architectural compliance (no boundary escapes or prohibited cross-package imports).
2. Type safety and maintainability (no sloppy 'any' casts or dead code).
3. Test adequacy (ensure tests actually verify real behavior and contain no trivial mock assertions).
4. Security audit (no hardcoded secrets, dangerous eval/exec calls, or unsanitized inputs).
You have zero write permissions and judge solely on objective technical merit.`,
};

export class EvaluatorAgent {
  public readonly manifest: AgentManifest;
  private fsm: AgentStateMachine;
  private promptPipeline: PromptCompositionPipeline;
  private semanticVerifier: SemanticVerifier;

  constructor(
    manifest?: Partial<AgentManifest>,
    semanticVerifier?: SemanticVerifier
  ) {
    this.manifest = {
      ...DEFAULT_EVALUATOR_MANIFEST,
      ...(manifest || {}),
      role: "Evaluator",
    };

    // Guarantee that toolsBlacklist strictly includes write operations
    const blacklist = new Set(this.manifest.capabilities.toolsBlacklist || []);
    blacklist.add("filesystem.write");
    blacklist.add("system.exec");
    blacklist.add("git.commit");
    this.manifest.capabilities.toolsBlacklist = Array.from(blacklist);

    this.fsm = new AgentStateMachine("UNINITIALIZED");
    this.fsm.transition({ type: "INITIALIZE" });
    this.promptPipeline = new PromptCompositionPipeline();
    this.semanticVerifier = semanticVerifier || new SemanticVerifier();
  }

  public getCurrentState(): AgentState {
    return this.fsm.getState();
  }

  public hasWritePermissions(): boolean {
    const blacklist = this.manifest.capabilities.toolsBlacklist || [];
    return !blacklist.includes("filesystem.write");
  }

  public async review(input: SemanticReviewInput): Promise<Layer2ReviewerAssessment> {
    try {
      // 1. Receive Task
      this.fsm.transition({ type: "RECEIVE_TASK", taskId: input.taskId });

      // 2. Formulate Plan (Analyze Review Scope)
      this.fsm.transition({ type: "PLAN_FORMULATED" });

      // Build internal prompt composition
      const prompt = this.promptPipeline.compose({
        kernelInvariants: [
          "Kernel Invariant: Agent: Done. Forge: Prove it.",
          "Kernel Invariant: Reviewer cannot overrule deterministic Layer 1 test results.",
          "Kernel Invariant: Zero tool execution rights for Evaluators.",
        ],
        persona: {
          id: this.manifest.id,
          name: this.manifest.name,
          role: "Evaluator",
          systemPrompt: this.manifest.systemPrompt,
        },
        turnBuffer: [
          {
            role: "user",
            content: `Perform Layer 2 Semantic Review for task ${input.taskId}.\nTask Description: ${input.taskDescription || "None"}\nFiles to review: ${input.files?.map((f) => f.path).join(", ") || "diff only"}`,
          },
        ],
      });

      // 3. Perform semantic evaluation
      const assessment = await this.semanticVerifier.evaluate({
        ...input,
        reviewerAgentId: this.manifest.id,
      });

      // 4. Update FSM state based on review outcome
      this.fsm.transition({ type: "OUTPUT_GENERATED" });

      if (assessment.passed) {
        this.fsm.transition({ type: "EVALUATOR_PASSED" });
      } else {
        // Triggers transition from EVALUATING back to PLANNING for dynamic re-planning
        this.fsm.transition({ type: "EVALUATOR_FAILED" });
      }

      // Reset to IDLE for next task
      this.fsm.transition({ type: "RESET" });

      return assessment;
    } catch (err: any) {
      if (this.fsm.getState() !== "FAILED") {
        try {
          this.fsm.transition({ type: "FAIL", error: err.message });
        } catch {}
      }

      return {
        passed: false,
        reviewerAgentId: this.manifest.id,
        overallScore: 0,
        summary: `Evaluator encountered internal exception: ${err.message}`,
        comments: err.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
