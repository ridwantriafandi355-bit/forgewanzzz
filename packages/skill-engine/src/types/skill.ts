export type SkillSource = "WORKSPACE" | "GLOBAL" | "BUILTIN";

export interface SkillTier1Metadata {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  requiredTools: string[];
  compatibleRoles: string[];
}

export interface SkillDefinition extends SkillTier1Metadata {
  source: SkillSource;
  tier2Instructions: string;
  filePath?: string;
}

export interface SkillEngineConfig {
  workspaceRoot?: string;
  userGlobalPath?: string;
}
