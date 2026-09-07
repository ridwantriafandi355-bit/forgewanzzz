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
