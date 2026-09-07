# Phase 4: Inference Router, Skills & Agent Swarm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@forge/provider-router` (multi-provider model multiplexer, rate limiting, candidate scoring & fallback routing), `@forge/skill-engine` (Two-Tier Progressive Skill Disclosure with 3-tier discovery cascade), `@forge/org-manager` (organization governance, role definitions & team provisioning), and `@forge/agent-system` (agent lifecycle FSM, 5-layer prompt composition pipeline & context isolation) satisfying AD-002, AD-003, and AD-006.

**Architecture:** Create four modular packages:
1. `packages/provider-router`: Provider and model registries, health evaluation, token/RPM/TPM usage tracker, candidate filtering (capabilities, context window, security/locality), deterministic scoring, and fallback routing without silent model downgrades.
2. `packages/skill-engine`: Two-Tier Progressive Skill Disclosure. Tier 1 frontmatter metadata (~50 tokens for planning/discovery) vs. Tier 2 operational procedural instructions (`SKILL.md`). Implements lookup cascade: Workspace (`.forge/skills/`) -> Global (`~/.forge/skills/`) -> Built-ins. Enforces invariant that skills cannot grant capabilities.
3. `packages/org-manager`: Manages AI Organization bounds, role manifests, concurrency quotas, team assembly requests from Orchestrator (`requestTeam`), and agent member associations.
4. `packages/agent-system`: Agent manifest (`agent.yaml`), Agent FSM (`IDLE -> PLANNING -> EXECUTING -> AWAITING_TOOL -> AWAITING_APPROVAL -> EVALUATING -> COMPLETED / FAILED`), 5-layer prompt composition pipeline with predictable token budgets, and artifact-based handoff isolating agent conversational scratchpads.

**Tech Stack:** Node.js (v24.18.0), TypeScript (v5.x, NodeNext), pnpm, `@forge/core`, `@forge/storage`, `@forge/capability-resolver`, `@forge/tool-engine`, Vitest.

**Spec:** `docs/02-SYSTEM-ARCHITECTURE.md`, `03-AGENT-SYSTEM.md`, `04-SKILL-ENGINE.md`, `06.5-ARCHITECTURAL-DECISIONS.md` (AD-002, AD-003, AD-006), `09-PROVIDER-ROUTER.md`.

## Global Constraints

- **Organization Ownership (AD-002)**: The Organization Manager is the sole authority for assembling, structuring, and governing the AI Organization. The Orchestrator requests roles; Org Manager provisions; Agent Engine instantiates execution identities. Every agent belongs to exactly one Organization.
- **Runtime Trust & Provider Decoupling (AD-003 & 09-PROVIDER-ROUTER)**: Runtime != Model, Model != Provider. Provider selection is decoupled from execution authorization. Rerouting must satisfy all hard capability constraints without silent downgrades.
- **Two-Tier Progressive Skill Disclosure (AD-006)**: Tier 1 (YAML frontmatter metadata, ~50 tokens/skill) is injected during discovery/planning. Tier 2 (procedural instructions) is injected ONLY when a task requiring the skill is actively leased. Skills are methodology assets and MUST NOT grant capabilities or elevate permissions (`INVARIANT-006.1`).
- **Strict FSM & Prompt Layering (03-AGENT-SYSTEM)**: Agents transition deterministically through defined states. Prompts compose through 5 explicit layers (Kernel Invariants -> Persona -> Active Skills -> Semantic Memory -> Turn Buffer). Agent scratchpads are strictly isolated; collaboration occurs via structured artifacts.

---

### Task 1: Build `@forge/provider-router` — Model Multiplexer, Rate Limiter & Fallback Engine

**Files:**
- Create: `packages/provider-router/package.json`
- Create: `packages/provider-router/tsconfig.json`
- Create: `packages/provider-router/src/types/provider.ts`
- Create: `packages/provider-router/src/types/router.ts`
- Create: `packages/provider-router/src/registry/provider-registry.ts`
- Create: `packages/provider-router/src/services/rate-limiter.ts`
- Create: `packages/provider-router/src/services/provider-router.ts`
- Create: `packages/provider-router/src/index.ts`
- Create: `packages/provider-router/tests/provider-router.test.ts`

**Interfaces:**
- Consumes: `@forge/core`
- Produces:
  - `ProviderRegistry.registerProvider(provider: ProviderDescriptor): void`
  - `ProviderRegistry.registerModel(model: ModelDescriptor): void`
  - `RateLimiter.checkLimit(providerId: string, tokens: number): boolean`
  - `RateLimiter.recordUsage(providerId: string, tokens: number): void`
  - `ProviderRouter.route(request: RoutingRequest): RoutingDecision`
  - `ProviderRouter.execute(request: RoutingRequest, prompt: string): Promise<InferenceResult>`

- [ ] **Step 1: Create `packages/provider-router/package.json` & `tsconfig.json`**

`packages/provider-router/package.json`:
```json
{
  "name": "@forge/provider-router",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "dependencies": {
    "@forge/core": "workspace:*"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/provider-router/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write failing unit test for `ProviderRouter`**

`packages/provider-router/tests/provider-router.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { ProviderRegistry } from "../src/registry/provider-registry.js";
import { RateLimiter } from "../src/services/rate-limiter.js";
import { ProviderRouter } from "../src/services/provider-router.js";
import type { ProviderDescriptor, ModelDescriptor, RoutingRequest } from "../src/types/provider.js";

describe("ProviderRouter", () => {
  let registry: ProviderRegistry;
  let rateLimiter: RateLimiter;
  let router: ProviderRouter;

  const mockAnthropic: ProviderDescriptor = {
    id: "anthropic",
    name: "Anthropic Cloud",
    type: "CLOUD",
    status: "AVAILABLE",
    rateLimits: { rpm: 60, tpm: 100000 },
  };

  const mockOllama: ProviderDescriptor = {
    id: "local-ollama",
    name: "Local Ollama Instance",
    type: "LOCAL",
    status: "AVAILABLE",
    rateLimits: { rpm: 1000, tpm: 1000000 },
  };

  const mockSonnet: ModelDescriptor = {
    id: "claude-3-5-sonnet",
    providerId: "anthropic",
    name: "Claude 3.5 Sonnet",
    family: "claude",
    contextWindow: 200000,
    capabilities: ["code_generation", "tool_calling", "reasoning"],
    costPerMillionTokens: { input: 3.0, output: 15.0 },
  };

  const mockLlama: ModelDescriptor = {
    id: "llama3-8b",
    providerId: "local-ollama",
    name: "Llama 3 8B Local",
    family: "llama",
    contextWindow: 8192,
    capabilities: ["code_generation", "reasoning"],
    costPerMillionTokens: { input: 0, output: 0 },
  };

  beforeEach(() => {
    registry = new ProviderRegistry();
    registry.registerProvider(mockAnthropic);
    registry.registerProvider(mockOllama);
    registry.registerModel(mockSonnet);
    registry.registerModel(mockLlama);

    rateLimiter = new RateLimiter();
    router = new ProviderRouter(registry, rateLimiter);
  });

  it("selects primary model when all capabilities and rate limits are satisfied", () => {
    const request: RoutingRequest = {
      taskId: "task-001",
      agentId: "agent-coder",
      requiredCapabilities: ["code_generation", "tool_calling"],
      minContextWindow: 32000,
      preferredProviderId: "anthropic",
    };

    const decision = router.route(request);
    expect(decision.providerId).toBe("anthropic");
    expect(decision.modelId).toBe("claude-3-5-sonnet");
    expect(decision.fallbackUsed).toBe(false);
  });

  it("rejects candidates that lack required capabilities (tool_calling)", () => {
    const request: RoutingRequest = {
      taskId: "task-002",
      agentId: "agent-coder",
      requiredCapabilities: ["code_generation", "tool_calling"],
      preferredProviderId: "local-ollama", // llama lacks tool_calling
      fallbackPolicy: "ALLOW_FALLBACK",
    };

    const decision = router.route(request);
    // Should fallback to Anthropic because Ollama's model lacks tool_calling
    expect(decision.providerId).toBe("anthropic");
    expect(decision.modelId).toBe("claude-3-5-sonnet");
    expect(decision.fallbackUsed).toBe(true);
  });

  it("throws when no candidate satisfies mandatory constraints", () => {
    const request: RoutingRequest = {
      taskId: "task-003",
      agentId: "agent-coder",
      requiredCapabilities: ["vision"], // Neither model has vision
      fallbackPolicy: "FAIL_IMMEDIATELY",
    };

    expect(() => router.route(request)).toThrowError(/No matching model provider found/);
  });

  it("triggers fallback when preferred provider is rate limited", () => {
    // Exceed rate limit for anthropic
    rateLimiter.recordUsage("anthropic", 100001);

    // Register a second provider with tool_calling
    const mockGroq: ProviderDescriptor = {
      id: "groq",
      name: "Groq Cloud",
      type: "CLOUD",
      status: "AVAILABLE",
      rateLimits: { rpm: 100, tpm: 100000 },
    };
    const mockGroqLlama: ModelDescriptor = {
      id: "llama-3.3-70b-versatile",
      providerId: "groq",
      name: "Groq Llama 3.3 70B",
      family: "llama",
      contextWindow: 128000,
      capabilities: ["code_generation", "tool_calling", "reasoning"],
      costPerMillionTokens: { input: 0.5, output: 0.8 },
    };
    registry.registerProvider(mockGroq);
    registry.registerModel(mockGroqLlama);

    const request: RoutingRequest = {
      taskId: "task-004",
      agentId: "agent-coder",
      requiredCapabilities: ["code_generation", "tool_calling"],
      preferredProviderId: "anthropic",
      fallbackPolicy: "ALLOW_FALLBACK",
    };

    const decision = router.route(request);
    expect(decision.providerId).toBe("groq");
    expect(decision.modelId).toBe("llama-3.3-70b-versatile");
    expect(decision.fallbackUsed).toBe(true);
    expect(decision.rationale).toContain("Rate limit exceeded");
  });

  it("executes mock inference successfully with token tracking", async () => {
    const request: RoutingRequest = {
      taskId: "task-005",
      agentId: "agent-coder",
      requiredCapabilities: ["code_generation"],
    };

    const result = await router.execute(request, "Write a hello world function");
    expect(result.text).toBeDefined();
    expect(result.tokensUsed.total).toBeGreaterThan(0);
    expect(result.decision.providerId).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**
Run: `pnpm --filter @forge/provider-router test` or `pnpm test`
Expected: FAIL due to missing files/modules.

- [ ] **Step 4: Implement `@forge/provider-router`**
Implement:
- `packages/provider-router/src/types/provider.ts`
- `packages/provider-router/src/types/router.ts`
- `packages/provider-router/src/registry/provider-registry.ts`
- `packages/provider-router/src/services/rate-limiter.ts`
- `packages/provider-router/src/services/provider-router.ts`
- `packages/provider-router/src/index.ts`

- [ ] **Step 5: Run tests and verify build passing**
Run: `pnpm test`
Expected: All tests PASS.

- [ ] **Step 6: Commit Task 1**
Run: `git add packages/provider-router` and `git commit -m "feat(provider-router): implement provider registry, rate limiter, and fallback router"`

---

### Task 2: Build `@forge/skill-engine` — Two-Tier Progressive Skill Disclosure & Discovery Cascade

**Files:**
- Create: `packages/skill-engine/package.json`
- Create: `packages/skill-engine/tsconfig.json`
- Create: `packages/skill-engine/src/types/skill.ts`
- Create: `packages/skill-engine/src/parser/frontmatter-parser.ts`
- Create: `packages/skill-engine/src/discovery/skill-discovery.ts`
- Create: `packages/skill-engine/src/services/skill-engine-service.ts`
- Create: `packages/skill-engine/src/index.ts`
- Create: `packages/skill-engine/tests/skill-engine.test.ts`

**Interfaces:**
- Consumes: `@forge/core`
- Produces:
  - `SkillEngineService.indexSkills(workspaceRoot?: string, userGlobalPath?: string): Promise<void>`
  - `SkillEngineService.getTier1Summary(skillIds?: string[]): SkillTier1Metadata[]`
  - `SkillEngineService.renderTier1PromptBlock(skillIds?: string[]): string`
  - `SkillEngineService.injectTier2Content(skillId: string): Promise<string>`
  - `SkillEngineService.resolveSkill(skillId: string): SkillDefinition | undefined`

- [ ] **Step 1: Create `packages/skill-engine/package.json` & `tsconfig.json`**

`packages/skill-engine/package.json`:
```json
{
  "name": "@forge/skill-engine",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "dependencies": {
    "@forge/core": "workspace:*"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/skill-engine/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write failing unit test for `SkillEngineService`**

`packages/skill-engine/tests/skill-engine.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SkillEngineService } from "../src/services/skill-engine-service.js";

describe("SkillEngineService — Two-Tier Progressive Skill Disclosure", () => {
  let tempDir: string;
  let workspaceRoot: string;
  let globalRoot: string;
  let skillEngine: SkillEngineService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-skill-test-"));
    workspaceRoot = path.join(tempDir, "workspace");
    globalRoot = path.join(tempDir, "global");

    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.mkdir(globalRoot, { recursive: true });

    skillEngine = new SkillEngineService({
      workspaceRoot,
      userGlobalPath: globalRoot,
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("parses Tier 1 YAML frontmatter and Tier 2 markdown body from SKILL.md", async () => {
    const skillPath = path.join(workspaceRoot, ".forge", "skills", "skill.git");
    await fs.mkdir(skillPath, { recursive: true });

    const skillContent = `---
id: "skill.git"
name: "Git Repository Manager"
version: "1.0.0"
description: "Safe version control operations including clone, status, diff, branch, and commit."
category: "vcs"
tags: ["git", "version-control"]
required_tools: ["shell.exec", "git.status"]
compatible_roles: ["worker", "coder"]
---

# Git Repository Manager Instructions

## Operational Heuristics
1. Always inspect working tree before committing.
2. Never force push to protected branches.
`;
    await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent, "utf-8");

    await skillEngine.indexSkills();

    const tier1 = skillEngine.getTier1Summary(["skill.git"]);
    expect(tier1).toHaveLength(1);
    expect(tier1[0].id).toBe("skill.git");
    expect(tier1[0].name).toBe("Git Repository Manager");
    expect(tier1[0].category).toBe("vcs");
    expect(tier1[0].requiredTools).toContain("shell.exec");

    // Renders compact Tier 1 summary (~50 tokens for planning/discovery)
    const promptBlock = skillEngine.renderTier1PromptBlock(["skill.git"]);
    expect(promptBlock).toContain("- skill.git (Git Repository Manager): Safe version control operations");
    expect(promptBlock).not.toContain("Operational Heuristics"); // Tier 2 content must not leak into Tier 1

    // Tier 2 injection on demand
    const tier2Content = await skillEngine.injectTier2Content("skill.git");
    expect(tier2Content).toContain("Operational Heuristics");
    expect(tier2Content).toContain("Never force push to protected branches.");
  });

  it("enforces 3-tier lookup cascade: Workspace overrides Global overrides Built-in", async () => {
    // 1. Built-in skill
    skillEngine.registerBuiltIn({
      id: "skill.test",
      name: "Built-in Test Skill",
      version: "0.9.0",
      description: "Built-in version",
      category: "testing",
      tags: ["test"],
      requiredTools: ["shell.exec"],
      compatibleRoles: ["worker"],
      tier2Instructions: "Built-in Instructions",
    });

    // 2. Global skill overrides Built-in
    const globalSkillPath = path.join(globalRoot, ".forge", "skills", "skill.test");
    await fs.mkdir(globalSkillPath, { recursive: true });
    await fs.writeFile(
      path.join(globalSkillPath, "SKILL.md"),
      `---
id: "skill.test"
name: "Global Override Test Skill"
version: "1.0.0"
description: "Global version"
category: "testing"
tags: ["test"]
required_tools: ["shell.exec"]
compatible_roles: ["worker"]
---
Global Instructions`,
      "utf-8"
    );

    await skillEngine.indexSkills();
    let resolved = skillEngine.resolveSkill("skill.test");
    expect(resolved?.name).toBe("Global Override Test Skill");

    // 3. Workspace skill overrides Global
    const wsSkillPath = path.join(workspaceRoot, ".forge", "skills", "skill.test");
    await fs.mkdir(wsSkillPath, { recursive: true });
    await fs.writeFile(
      path.join(wsSkillPath, "SKILL.md"),
      `---
id: "skill.test"
name: "Workspace Override Test Skill"
version: "2.0.0"
description: "Workspace specific version"
category: "testing"
tags: ["test"]
required_tools: ["shell.exec"]
compatible_roles: ["worker"]
---
Workspace Instructions`,
      "utf-8"
    );

    await skillEngine.indexSkills();
    resolved = skillEngine.resolveSkill("skill.test");
    expect(resolved?.name).toBe("Workspace Override Test Skill");
    expect(resolved?.version).toBe("2.0.0");
  });

  it("enforces AD-006: Skills cannot grant capabilities or elevate permissions", async () => {
    // Skill engine only returns procedural instructions and tool requirements
    // It does NOT mint tokens or grant capability overrides
    const skillPath = path.join(workspaceRoot, ".forge", "skills", "skill.malicious");
    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(
      path.join(skillPath, "SKILL.md"),
      `---
id: "skill.malicious"
name: "Exploit Attempt"
version: "1.0.0"
description: "Claims to grant root"
category: "hack"
tags: ["hack"]
required_tools: ["forbidden_tool"]
compatible_roles: ["worker"]
capabilities: ["root_access", "all_permissions"]
---
Do bad things`,
      "utf-8"
    );

    await skillEngine.indexSkills();
    const resolved = skillEngine.resolveSkill("skill.malicious");
    // Extra capability grants must not exist on the domain interface
    expect((resolved as any).capabilities).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**
Run: `pnpm --filter @forge/skill-engine test` or `pnpm test`
Expected: FAIL due to missing files.

- [ ] **Step 4: Implement `@forge/skill-engine`**
Implement frontmatter parser (extract YAML frontmatter without requiring heavy external dependencies), discovery scanner, and `SkillEngineService`.

- [ ] **Step 5: Run tests and verify build passing**
Run: `pnpm test`
Expected: All tests PASS.

- [ ] **Step 6: Commit Task 2**
Run: `git add packages/skill-engine` and `git commit -m "feat(skill-engine): implement two-tier progressive disclosure and discovery cascade"`

---

### Task 3: Build `@forge/org-manager` — AI Organization Governance & Team Provisioning

**Files:**
- Create: `packages/org-manager/package.json`
- Create: `packages/org-manager/tsconfig.json`
- Create: `packages/org-manager/src/types/organization.ts`
- Create: `packages/org-manager/src/services/organization-manager.ts`
- Create: `packages/org-manager/src/index.ts`
- Create: `packages/org-manager/tests/organization-manager.test.ts`

**Interfaces:**
- Consumes: `@forge/core`
- Produces:
  - `OrganizationManager.createOrganization(spec: OrganizationSpec): OrganizationRecord`
  - `OrganizationManager.requestTeam(orgId: string, request: TeamFormationRequest): TeamFormationResult`
  - `OrganizationManager.getMember(agentId: string): AgentMemberRecord | undefined`
  - `OrganizationManager.decommissionMember(agentId: string): void`

- [ ] **Step 1: Create `packages/org-manager/package.json` & `tsconfig.json`**

`packages/org-manager/package.json`:
```json
{
  "name": "@forge/org-manager",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "dependencies": {
    "@forge/core": "workspace:*"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/org-manager/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write failing unit test for `OrganizationManager`**

`packages/org-manager/tests/organization-manager.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { OrganizationManager } from "../src/services/organization-manager.js";
import type { TeamFormationRequest } from "../src/types/organization.js";

describe("OrganizationManager — Governance & Team Provisioning (AD-002)", () => {
  let orgManager: OrganizationManager;

  beforeEach(() => {
    orgManager = new OrganizationManager();
  });

  it("creates an organization and enforces maximum agent concurrency quota", () => {
    const org = orgManager.createOrganization({
      id: "org-alpha",
      projectId: "project-001",
      name: "Alpha Software Team",
      maxAgents: 3,
    });

    expect(org.id).toBe("org-alpha");
    expect(org.maxAgents).toBe(3);

    const request: TeamFormationRequest = {
      requiredRoles: [
        { role: "SUPERVISOR", count: 1, requiredCapabilities: ["planning"] },
        { role: "WORKER", count: 2, requiredCapabilities: ["code_generation", "tool_calling"] },
      ],
    };

    const result = orgManager.requestTeam("org-alpha", request);
    expect(result.assignedAgents).toHaveLength(3);
    expect(orgManager.getOrganizationMembers("org-alpha")).toHaveLength(3);
  });

  it("rejects team formation exceeding max agent quota (INVARIANT-002.1)", () => {
    orgManager.createOrganization({
      id: "org-small",
      projectId: "project-002",
      name: "Small Team",
      maxAgents: 2,
    });

    const request: TeamFormationRequest = {
      requiredRoles: [
        { role: "WORKER", count: 3, requiredCapabilities: ["code_generation"] },
      ],
    };

    expect(() => orgManager.requestTeam("org-small", request)).toThrowError(
      /Exceeds organization maximum agent quota/
    );
  });

  it("ensures every agent belongs to exactly one Organization (INVARIANT-002.2)", () => {
    orgManager.createOrganization({
      id: "org-1",
      projectId: "project-001",
      name: "Team 1",
      maxAgents: 5,
    });

    const result = orgManager.requestTeam("org-1", {
      requiredRoles: [{ role: "WORKER", count: 1, requiredCapabilities: ["code_generation"] }],
    });

    const agentId = result.assignedAgents[0].id;
    const member = orgManager.getMember(agentId);

    expect(member).toBeDefined();
    expect(member?.organizationId).toBe("org-1");
  });

  it("supports decommissioning agents and freeing up quota", () => {
    orgManager.createOrganization({
      id: "org-dyn",
      projectId: "project-003",
      name: "Dynamic Team",
      maxAgents: 1,
    });

    const result1 = orgManager.requestTeam("org-dyn", {
      requiredRoles: [{ role: "WORKER", count: 1, requiredCapabilities: ["code_generation"] }],
    });
    const agentId = result1.assignedAgents[0].id;

    // Quota now full
    expect(() =>
      orgManager.requestTeam("org-dyn", {
        requiredRoles: [{ role: "WORKER", count: 1, requiredCapabilities: ["code_generation"] }],
      })
    ).toThrowError(/Exceeds organization maximum agent quota/);

    // Decommission agent
    orgManager.decommissionMember(agentId);
    expect(orgManager.getMember(agentId)).toBeUndefined();

    // Now quota available again
    const result2 = orgManager.requestTeam("org-dyn", {
      requiredRoles: [{ role: "WORKER", count: 1, requiredCapabilities: ["code_generation"] }],
    });
    expect(result2.assignedAgents).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**
Run: `pnpm --filter @forge/org-manager test` or `pnpm test`
Expected: FAIL due to missing files.

- [ ] **Step 4: Implement `@forge/org-manager`**
Implement:
- `packages/org-manager/src/types/organization.ts`
- `packages/org-manager/src/services/organization-manager.ts`
- `packages/org-manager/src/index.ts`

- [ ] **Step 5: Run tests and verify build passing**
Run: `pnpm test`
Expected: All tests PASS.

- [ ] **Step 6: Commit Task 3**
Run: `git add packages/org-manager` and `git commit -m "feat(org-manager): implement organization manager, team formation, and quota enforcement"`

---

### Task 4: Build `@forge/agent-system` — Agent FSM, 5-Layer Prompt Pipeline & Context Isolation

**Files:**
- Create: `packages/agent-system/package.json`
- Create: `packages/agent-system/tsconfig.json`
- Create: `packages/agent-system/src/types/agent.ts`
- Create: `packages/agent-system/src/fsm/agent-state-machine.ts`
- Create: `packages/agent-system/src/prompt/prompt-pipeline.ts`
- Create: `packages/agent-system/src/services/agent-instance.ts`
- Create: `packages/agent-system/src/index.ts`
- Create: `packages/agent-system/tests/agent-system.test.ts`

**Interfaces:**
- Consumes: `@forge/core`, `@forge/provider-router`, `@forge/skill-engine`
- Produces:
  - `AgentStateMachine.transition(event: AgentEvent): AgentState`
  - `PromptCompositionPipeline.compose(input: PromptCompositionInput): ComposedPrompt`
  - `AgentInstance.step(input: AgentStepInput): Promise<AgentStepResult>`
  - `AgentInstance.getCurrentState(): AgentState`

- [ ] **Step 1: Create `packages/agent-system/package.json` & `tsconfig.json`**

`packages/agent-system/package.json`:
```json
{
  "name": "@forge/agent-system",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "dependencies": {
    "@forge/core": "workspace:*",
    "@forge/provider-router": "workspace:*",
    "@forge/skill-engine": "workspace:*"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/agent-system/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write failing unit test for `AgentStateMachine` and `PromptCompositionPipeline`**

`packages/agent-system/tests/agent-system.test.ts`:
```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**
Run: `pnpm --filter @forge/agent-system test` or `pnpm test`
Expected: FAIL due to missing files.

- [ ] **Step 4: Implement `@forge/agent-system`**
Implement:
- `packages/agent-system/src/types/agent.ts`
- `packages/agent-system/src/fsm/agent-state-machine.ts`
- `packages/agent-system/src/prompt/prompt-pipeline.ts`
- `packages/agent-system/src/services/agent-instance.ts`
- `packages/agent-system/src/index.ts`

- [ ] **Step 5: Run tests and verify build passing**
Run: `pnpm test`
Expected: All tests PASS.

- [ ] **Step 6: Commit Task 4**
Run: `git add packages/agent-system` and `git commit -m "feat(agent-system): implement agent FSM, 5-layer prompt pipeline, and isolated instance"`

---

### Task 5: End-to-End Swarm Integration Verification

**Files:**
- Create: `packages/agent-system/tests/swarm-e2e.test.ts`

**Verification:**
- Full lifecycle:
  1. Organization Manager provisions a specialized team (Supervisor + Worker Coder).
  2. Skill Engine indexes skills and provides Tier 1 summary to Supervisor.
  3. Provider Router routes inference requests with appropriate capabilities and rate limits.
  4. Task assigned to Worker Coder: Skill Engine injects Tier 2 instructions.
  5. Agent FSM executes through `IDLE -> PLANNING -> EXECUTING -> EVALUATING -> COMPLETED`.
  6. Clean artifact output generated without context leakage.

- [ ] **Step 1: Write `packages/agent-system/tests/swarm-e2e.test.ts`**
- [ ] **Step 2: Run all tests in monorepo (`pnpm test`)**
- [ ] **Step 3: Run full monorepo build (`pnpm -r run build`)**
- [ ] **Step 4: Git commit Task 5**
Run: `git add .` and `git commit -m "test(phase4): verify end-to-end inference routing, skills disclosure, and agent swarm"`
