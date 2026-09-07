import { describe, it, expect, beforeEach } from "vitest";
import { AgentStateMachine } from "../src/fsm/agent-state-machine.js";
import { PromptCompositionPipeline } from "../src/prompt/prompt-pipeline.js";
import { AgentInstance } from "../src/services/agent-instance.js";
import type { AgentManifest } from "../src/types/agent.js";

describe("AgentStateMachine (03-AGENT-SYSTEM)", () => {
  let fsm: AgentStateMachine;

  beforeEach(() => {
    fsm = new AgentStateMachine();
  });

  it("follows the canonical state transition cycle", () => {
    expect(fsm.getState()).toBe("UNINITIALIZED");

    fsm.transition({ type: "INITIALIZE" });
    expect(fsm.getState()).toBe("IDLE");

    fsm.transition({ type: "RECEIVE_TASK", taskId: "t-1" });
    expect(fsm.getState()).toBe("PLANNING");

    fsm.transition({ type: "PLAN_FORMULATED" });
    expect(fsm.getState()).toBe("EXECUTING");

    fsm.transition({ type: "INVOKE_TOOL", toolId: "filesystem.read" });
    expect(fsm.getState()).toBe("AWAITING_TOOL");

    fsm.transition({ type: "TOOL_RESULT_RECEIVED" });
    expect(fsm.getState()).toBe("EXECUTING");

    fsm.transition({ type: "REQUIRE_APPROVAL", reason: "Dangerous command" });
    expect(fsm.getState()).toBe("AWAITING_APPROVAL");

    fsm.transition({ type: "APPROVAL_GRANTED" });
    expect(fsm.getState()).toBe("EXECUTING");

    fsm.transition({ type: "OUTPUT_GENERATED" });
    expect(fsm.getState()).toBe("EVALUATING");

    fsm.transition({ type: "EVALUATOR_PASSED" });
    expect(fsm.getState()).toBe("COMPLETED");

    fsm.transition({ type: "RESET" });
    expect(fsm.getState()).toBe("IDLE");
  });

  it("throws on invalid transition", () => {
    expect(() => fsm.transition({ type: "PLAN_FORMULATED" })).toThrowError(
      /Invalid agent state transition/
    );
  });
});

describe("PromptCompositionPipeline — 5-Layer Prompt Composition", () => {
  let pipeline: PromptCompositionPipeline;

  beforeEach(() => {
    pipeline = new PromptCompositionPipeline();
  });

  it("composes all 5 layers with deterministic ordering and budget enforcement", () => {
    const prompt = pipeline.compose({
      kernelInvariants: ["Kernel: Prove it.", "Kernel: No silent modifications."],
      persona: {
        id: "agent.coder",
        role: "Worker",
        name: "Code Synthesizer",
        systemPrompt: "You generate clean, tested TypeScript code.",
      },
      activeSkillInstructions: ["## Git Skill\nAlways check git status first."],
      semanticMemory: ["Past context: project uses Node 24 and ESM."],
      turnBuffer: [
        { role: "user", content: "Implement feature X" },
        { role: "assistant", content: "Thinking..." },
      ],
      maxTokens: 4000,
    });

    expect(prompt.systemMessage).toContain("Kernel: Prove it.");
    expect(prompt.systemMessage).toContain("Code Synthesizer");
    expect(prompt.systemMessage).toContain("## Git Skill");
    expect(prompt.systemMessage).toContain("Past context: project uses Node 24");
    expect(prompt.messages).toHaveLength(2);
    expect(prompt.tokenBudget).toBeDefined();
    expect(prompt.tokenBudget.systemTokens).toBeGreaterThan(0);
  });
});

describe("AgentInstance Execution", () => {
  it("executes a task step and isolates working context", async () => {
    const manifest: AgentManifest = {
      id: "agent.engineer",
      name: "Engineer",
      role: "Worker",
      description: "Writes code",
      capabilities: {
        skills: ["skill.git"],
        toolsBlacklist: [],
      },
      systemPrompt: "You are an autonomous engineer.",
    };

    const agent = new AgentInstance(manifest);
    expect(agent.getCurrentState()).toBe("IDLE");

    const result = await agent.runStep({
      taskId: "task-010",
      instruction: "Review code changes",
      context: { gitBranch: "main" },
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.artifacts).toBeDefined();
    expect(agent.getCurrentState()).toBe("IDLE"); // Resets to IDLE after step completion
  });
});
