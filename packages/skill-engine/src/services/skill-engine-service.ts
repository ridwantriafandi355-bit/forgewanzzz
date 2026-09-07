import * as path from "node:path";
import { scanSkillDirectory } from "../discovery/skill-discovery.js";
import type {
  SkillDefinition,
  SkillEngineConfig,
  SkillTier1Metadata,
} from "../types/skill.js";

export class SkillEngineService {
  private builtInSkills = new Map<string, SkillDefinition>();
  private globalSkills = new Map<string, SkillDefinition>();
  private workspaceSkills = new Map<string, SkillDefinition>();

  constructor(private config: SkillEngineConfig = {}) {}

  registerBuiltIn(skill: Omit<SkillDefinition, "source">): void {
    this.builtInSkills.set(skill.id, {
      ...skill,
      source: "BUILTIN",
    });
  }

  async indexSkills(): Promise<void> {
    // 1. Scan user global skills (~/.forge/skills)
    if (this.config.userGlobalPath) {
      const globalSkillsDir = path.join(this.config.userGlobalPath, ".forge", "skills");
      const discovered = await scanSkillDirectory(globalSkillsDir, "GLOBAL");
      this.globalSkills.clear();
      for (const skill of discovered) {
        this.globalSkills.set(skill.id, skill);
      }
    }

    // 2. Scan workspace skills (${WORKSPACE_ROOT}/.forge/skills)
    if (this.config.workspaceRoot) {
      const wsSkillsDir = path.join(this.config.workspaceRoot, ".forge", "skills");
      const discovered = await scanSkillDirectory(wsSkillsDir, "WORKSPACE");
      this.workspaceSkills.clear();
      for (const skill of discovered) {
        this.workspaceSkills.set(skill.id, skill);
      }
    }
  }

  resolveSkill(skillId: string): SkillDefinition | undefined {
    // Cascade priority: Workspace > Global > Built-in
    if (this.workspaceSkills.has(skillId)) {
      return this.workspaceSkills.get(skillId);
    }
    if (this.globalSkills.has(skillId)) {
      return this.globalSkills.get(skillId);
    }
    if (this.builtInSkills.has(skillId)) {
      return this.builtInSkills.get(skillId);
    }
    return undefined;
  }

  getAllSkills(): SkillDefinition[] {
    const map = new Map<string, SkillDefinition>();
    for (const [id, skill] of this.builtInSkills) map.set(id, skill);
    for (const [id, skill] of this.globalSkills) map.set(id, skill);
    for (const [id, skill] of this.workspaceSkills) map.set(id, skill);
    return Array.from(map.values());
  }

  getTier1Summary(skillIds?: string[]): SkillTier1Metadata[] {
    const all = this.getAllSkills();
    const filtered = skillIds ? all.filter((s) => skillIds.includes(s.id)) : all;

    return filtered.map((s) => ({
      id: s.id,
      name: s.name,
      version: s.version,
      description: s.description,
      category: s.category,
      tags: s.tags,
      requiredTools: s.requiredTools,
      compatibleRoles: s.compatibleRoles,
    }));
  }

  renderTier1PromptBlock(skillIds?: string[]): string {
    const summaries = this.getTier1Summary(skillIds);
    if (summaries.length === 0) return "";

    const lines = ["### Available Skills (Tier 1 Index):"];
    for (const s of summaries) {
      lines.push(`- ${s.id} (${s.name}): ${s.description} [Tools: ${s.requiredTools.join(", ")}]`);
    }
    return lines.join("\n");
  }

  async injectTier2Content(skillId: string): Promise<string> {
    const skill = this.resolveSkill(skillId);
    if (!skill) {
      throw new Error(`Cannot inject Tier 2 instructions: Skill '${skillId}' not found.`);
    }

    return skill.tier2Instructions;
  }
}
