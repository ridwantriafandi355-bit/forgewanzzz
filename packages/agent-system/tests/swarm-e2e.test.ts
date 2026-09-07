import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { OrganizationManager } from "@forge/org-manager";
import { SkillEngineService } from "@forge/skill-engine";
import { ProviderRegistry, RateLimiter, ProviderRouter } from "@forge/provider-router";
import { AgentInstance } from "../src/services/agent-instance.js";
import { PromptCompositionPipeline } from "../src/prompt/prompt-pipeline.js";
import type { AgentManifest } from "../src/types/agent.js";

describe("Phase 4 — End-to-End Swarm Integration", () => {
  let tempDir: string;
  let workspaceRoot: string;
  let orgManager: OrganizationManager;
  let skillEngine: SkillEngineService;
  let providerRouter: ProviderRouter;
  let providerRegistry: ProviderRegistry;
  let rateLimiter: RateLimiter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-swarm-e2e-"));
    workspaceRoot = path.join(tempDir, "workspace");
    await fs.mkdir(workspaceRoot, { recursive: true });

    // 1. Initialize Organization Manager
    orgManager = new OrganizationManager();
    orgManager.createOrganization({
      id: "org-forge-core",
      projectId: "proj-software-factory",
      name: "Core Software Swarm",
      maxAgents: 5,
    });

    // 2. Initialize Skill Engine with progressive disclosure
    skillEngine = new SkillEngineService({ workspaceRoot });

    // Create a mock workspace skill with SKILL.md
    const skillPath = path.join(workspaceRoot, ".forge", "skills", "skill.typescript");
    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(
      path.join(skillPath, "SKILL.md"),
      `---
id: "skill.typescript"
name: "TypeScript Specialist"
version: "1.0.0"
description: "High quality TypeScript development with strict compiler flags."
category: "programming"
tags: ["typescript", "nodejs"]
required_tools: ["filesystem.write", "filesystem.read"]
compatible_roles: ["worker"]
---

# TypeScript Specialist Instructions
- Always use explicit return types.
- Ensure strict null checks pass.
`,
      "utf-8"
    );
    await skillEngine.indexSkills();

    // 3. Initialize Provider Router
    providerRegistry = new ProviderRegistry();
    providerRegistry.registerProvider({
      id: "anthropic",
      name: "Anthropic Claude",
      type: "CLOUD",
      status: "AVAILABLE",
      rateLimits: { rpm: 60, tpm: 100000 },
    });
    providerRegistry.registerModel({
      id: "claude-3-5-sonnet",
      providerId: "anthropic",
      name: "Claude 3.5 Sonnet",
      family: "claude",
      contextWindow: 200000,
      capabilities: ["code_generation", "tool_calling", "reasoning"],
    });

    rateLimiter = new RateLimiter();
    providerRouter = new ProviderRouter(providerRegistry, rateLimiter);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("completes full swarm workflow: team formation -> skill discovery -> provider routing -> tier 2 injection -> execution", async () => {
    // Step 1: Orchestrator requests team assembly via OrganizationManager
    const team = orgManager.requestTeam("org-forge-core", {
      requiredRoles: [
        { role: "SUPERVISOR", count: 1, requiredCapabilities: ["planning"] },
        { role: "WORKER", count: 1, requiredCapabilities: ["code_generation"] },
      ],
    });

    expect(team.assignedAgents).toHaveLength(2);
    const supervisorRecord = team.assignedAgents.find((a) => a.role === "SUPERVISOR")!;
    const workerRecord = team.assignedAgents.find((a) => a.role === "WORKER")!;
    expect(supervisorRecord).toBeDefined();
    expect(workerRecord).toBeDefined();

    // Step 2: Supervisor discovers available skills via Tier 1 metadata (~50 tokens)
    const tier1Summary = skillEngine.getTier1Summary(["skill.typescript"]);
    expect(tier1Summary).toHaveLength(1);
    expect(tier1Summary[0].id).toBe("skill.typescript");

    const tier1Block = skillEngine.renderTier1PromptBlock(["skill.typescript"]);
    expect(tier1Block).toContain("skill.typescript (TypeScript Specialist)");
    // Must NOT leak Tier 2 rules into Tier 1
    expect(tier1Block).not.toContain("Always use explicit return types");

    // Step 3: Provider Router routes inference request for Worker Coder
    const routingDecision = providerRouter.route({
      taskId: "task-build-api",
      agentId: workerRecord.id,
      requiredCapabilities: ["code_generation", "tool_calling"],
      preferredProviderId: "anthropic",
    });

    expect(routingDecision.providerId).toBe("anthropic");
    expect(routingDecision.modelId).toBe("claude-3-5-sonnet");

    // Step 4: Worker Agent leased -> Inject Tier 2 procedural instructions
    const tier2Instructions = await skillEngine.injectTier2Content("skill.typescript");
    expect(tier2Instructions).toContain("Always use explicit return types.");

    // Step 5: Compose 5-layer prompt
    const promptPipeline = new PromptCompositionPipeline();
    const composed = promptPipeline.compose({
      kernelInvariants: [
        "Invariant: Local first.",
        "Invariant: Agent Done. Forge: Prove it.",
      ],
      persona: {
        id: workerRecord.id,
        name: "Worker Coder",
        role: workerRecord.role,
        systemPrompt: "You generate production-grade code.",
      },
      activeSkillInstructions: [tier2Instructions],
      turnBuffer: [{ role: "user", content: "Create src/api.ts with Express handler." }],
    });

    expect(composed.systemMessage).toContain("=== LAYER 1: KERNEL INVARIANTS ===");
    expect(composed.systemMessage).toContain("=== LAYER 2: AGENT PERSONA & CONSTRAINTS ===");
    expect(composed.systemMessage).toContain("=== LAYER 3: ACTIVE SKILLS & PROCEDURAL INSTRUCTIONS ===");
    expect(composed.systemMessage).toContain("Always use explicit return types.");

    // Step 6: Worker Agent executes step via FSM and produces clean artifacts
    const workerManifest: AgentManifest = {
      id: workerRecord.id,
      name: "Worker Coder",
      role: "Worker",
      description: "Writes TypeScript code",
      capabilities: {
        skills: ["skill.typescript"],
      },
      systemPrompt: composed.systemMessage,
    };

    const workerInstance = new AgentInstance(workerManifest);
    const stepResult = await workerInstance.runStep({
      taskId: "task-build-api",
      instruction: "Create src/api.ts with Express handler.",
    });

    expect(stepResult.status).toBe("COMPLETED");
    expect(stepResult.artifacts).toHaveLength(1);
    expect(stepResult.artifacts[0].path).toBe("artifacts/task-task-build-api-summary.md");

    // Verify instance resets to IDLE after step completion
    expect(workerInstance.getCurrentState()).toBe("IDLE");
  });
});
