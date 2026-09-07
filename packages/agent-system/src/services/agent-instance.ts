import { AgentStateMachine } from "../fsm/agent-state-machine.js";
import { PromptCompositionPipeline } from "../prompt/prompt-pipeline.js";
import type {
  AgentManifest,
  AgentState,
  AgentStepInput,
  AgentStepResult,
} from "../types/agent.js";

export class AgentInstance {
  private fsm: AgentStateMachine;
  private promptPipeline: PromptCompositionPipeline;

  constructor(public readonly manifest: AgentManifest) {
    this.fsm = new AgentStateMachine("UNINITIALIZED");
    this.fsm.transition({ type: "INITIALIZE" });
    this.promptPipeline = new PromptCompositionPipeline();
  }

  getCurrentState(): AgentState {
    return this.fsm.getState();
  }

  async runStep(input: AgentStepInput): Promise<AgentStepResult> {
    try {
      // 1. Receive task -> PLANNING
      this.fsm.transition({ type: "RECEIVE_TASK", taskId: input.taskId });

      // 2. Plan formulated -> EXECUTING
      this.fsm.transition({ type: "PLAN_FORMULATED" });

      // Compose internal isolated prompt
      const prompt = this.promptPipeline.compose({
        kernelInvariants: ["Kernel: Prove it.", "Kernel: Maintain deterministic audit trail."],
        persona: {
          id: this.manifest.id,
          name: this.manifest.name,
          role: this.manifest.role,
          systemPrompt: this.manifest.systemPrompt,
        },
        turnBuffer: [{ role: "user", content: input.instruction }],
      });

      // Ephemeral execution: internal thought buffer stays strictly isolated in this scope
      const simulatedOutput = `Processed step for task ${input.taskId} following instructions: ${input.instruction}`;

      // 3. Output generated -> EVALUATING
      this.fsm.transition({ type: "OUTPUT_GENERATED" });

      // 4. Evaluator passed -> COMPLETED
      this.fsm.transition({ type: "EVALUATOR_PASSED" });

      const artifacts = [
        {
          path: `artifacts/task-${input.taskId}-summary.md`,
          summary: simulatedOutput,
        },
      ];

      const result: AgentStepResult = {
        taskId: input.taskId,
        agentId: this.manifest.id,
        status: "COMPLETED",
        artifacts,
      };

      // Reset to IDLE for next task
      this.fsm.transition({ type: "RESET" });

      return result;
    } catch (err: any) {
      if (this.fsm.getState() !== "FAILED") {
        try {
          this.fsm.transition({ type: "FAIL", error: err.message });
        } catch {
          // Ignore if transition to FAILED not possible
        }
      }

      return {
        taskId: input.taskId,
        agentId: this.manifest.id,
        status: "FAILED",
        artifacts: [],
        diagnostics: err.message,
      };
    }
  }
}
