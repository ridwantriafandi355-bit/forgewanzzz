import type {
  PromptCompositionInput,
  ComposedPrompt,
  TokenBudgetAllocation,
} from "../types/agent.js";

export class PromptCompositionPipeline {
  compose(input: PromptCompositionInput): ComposedPrompt {
    const totalBudget = input.maxTokens || 8192;

    // Budget partition:
    // 15% System & Persona
    // 25% Tool Schemas & Skills
    // 20% Semantic Memory
    // 40% Dynamic History & Completion
    const tokenBudget: TokenBudgetAllocation = {
      totalBudget,
      systemTokens: Math.floor(totalBudget * 0.15),
      toolTokens: Math.floor(totalBudget * 0.25),
      memoryTokens: Math.floor(totalBudget * 0.20),
      historyTokens: Math.floor(totalBudget * 0.40),
    };

    const systemParts: string[] = [];

    // Layer 1: Kernel Invariants
    systemParts.push("=== LAYER 1: KERNEL INVARIANTS ===");
    for (const inv of input.kernelInvariants) {
      systemParts.push(`- ${inv}`);
    }

    // Layer 2: Agent Persona & Role
    systemParts.push("\n=== LAYER 2: AGENT PERSONA & CONSTRAINTS ===");
    systemParts.push(`Agent ID: ${input.persona.id}`);
    systemParts.push(`Name: ${input.persona.name}`);
    systemParts.push(`Role: ${input.persona.role}`);
    systemParts.push(input.persona.systemPrompt);

    // Layer 3: Progressive Skill Schemas & Instructions
    if (input.activeSkillInstructions && input.activeSkillInstructions.length > 0) {
      systemParts.push("\n=== LAYER 3: ACTIVE SKILLS & PROCEDURAL INSTRUCTIONS ===");
      for (const skill of input.activeSkillInstructions) {
        systemParts.push(skill);
      }
    }

    // Layer 4: Semantic Memory Injections
    if (input.semanticMemory && input.semanticMemory.length > 0) {
      systemParts.push("\n=== LAYER 4: RETRIEVED SEMANTIC CONTEXT ===");
      for (const mem of input.semanticMemory) {
        systemParts.push(`- ${mem}`);
      }
    }

    const systemMessage = systemParts.join("\n");
    const messages = input.turnBuffer || [];

    return {
      systemMessage,
      messages,
      tokenBudget,
    };
  }
}
