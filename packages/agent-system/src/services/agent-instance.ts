import { AgentStateMachine } from "../fsm/agent-state-machine.js";
import { PromptCompositionPipeline } from "../prompt/prompt-pipeline.js";
import { WorkingContextManager, SemanticMemoryEngine } from "@forge/memory";
import type {
  AgentManifest,
  AgentState,
  AgentStepInput,
  AgentStepResult,
  PromptMessage,
} from "../types/agent.js";

export interface AgentInstanceOptions {
  workingContext?: WorkingContextManager;
  semanticMemory?: SemanticMemoryEngine;
}

export class AgentInstance {
  private fsm: AgentStateMachine;
  private promptPipeline: PromptCompositionPipeline;
  private workingContext?: WorkingContextManager;
  private semanticMemory?: SemanticMemoryEngine;

  constructor(
    public readonly manifest: AgentManifest,
    options?: AgentInstanceOptions
  ) {
    this.fsm = new AgentStateMachine("UNINITIALIZED");
    this.fsm.transition({ type: "INITIALIZE" });
    this.promptPipeline = new PromptCompositionPipeline();

    if (options?.workingContext) {
      this.workingContext = options.workingContext;
    } else if (
      manifest.memory?.type === "sliding_window" ||
      manifest.memory?.type === "hybrid"
    ) {
      this.workingContext = new WorkingContextManager({
        maxTotalTokens: manifest.memory.contextWindowLimit || 8192,
        compactionStrategy: manifest.memory.type === "sliding_window" ? "SLIDING_WINDOW" : "HYBRID",
      });
    }

    if (options?.semanticMemory) {
      this.semanticMemory = options.semanticMemory;
    }
  }

  getCurrentState(): AgentState {
    return this.fsm.getState();
  }

  getWorkingContext(): WorkingContextManager | undefined {
    return this.workingContext;
  }

  getSemanticMemory(): SemanticMemoryEngine | undefined {
    return this.semanticMemory;
  }

  attachMemory(options: AgentInstanceOptions): void {
    if (options.workingContext) this.workingContext = options.workingContext;
    if (options.semanticMemory) this.semanticMemory = options.semanticMemory;
  }

  async runStep(input: AgentStepInput): Promise<AgentStepResult> {
    try {
      // 1. Receive task -> PLANNING
      this.fsm.transition({ type: "RECEIVE_TASK", taskId: input.taskId });

      // 2. Plan formulated -> EXECUTING
      this.fsm.transition({ type: "PLAN_FORMULATED" });

      // Ingest user prompt into working context buffer if enabled
      if (this.workingContext) {
        this.workingContext.addTurn("user", input.instruction);
      }

      // Query semantic memory if attached
      let retrievedMemories: string[] = [];
      if (this.semanticMemory) {
        const recalled = this.semanticMemory.recall({
          query: input.instruction,
          limit: 3,
        });
        retrievedMemories = this.semanticMemory.formatForPrompt(recalled);
      }

      // Build turnBuffer from working context or single turn
      const turnBuffer: PromptMessage[] = this.workingContext
        ? this.workingContext.getTurns().map((t) => ({
            role: t.role === "tool" ? "assistant" : t.role,
            content: t.content,
          }))
        : [{ role: "user", content: input.instruction }];

      // Compose internal isolated prompt
      const prompt = this.promptPipeline.compose({
        kernelInvariants: [
          "Kernel: Prove it.",
          "Kernel: Maintain deterministic audit trail.",
        ],
        persona: {
          id: this.manifest.id,
          name: this.manifest.name,
          role: this.manifest.role,
          systemPrompt: this.manifest.systemPrompt,
        },
        semanticMemory: retrievedMemories,
        turnBuffer,
      });

      // Ephemeral execution: internal thought buffer stays strictly isolated in this scope
      const simulatedOutput = `Processed step for task ${input.taskId} following instructions: ${input.instruction}`;

      // Ingest assistant turn into working context
      if (this.workingContext) {
        this.workingContext.addTurn("assistant", simulatedOutput);
      }

      // Ingest task outcome into long-term semantic memory
      if (this.semanticMemory) {
        this.semanticMemory.ingestTaskOutcome({
          taskId: input.taskId,
          summary: simulatedOutput,
          agentId: this.manifest.id,
        });
      }

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
