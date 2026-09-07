import type { SkillTier1Metadata } from "../types/skill.js";

export interface ParsedSkillFile {
  metadata: SkillTier1Metadata;
  body: string;
}

export function parseSkillFrontmatter(fileContent: string): ParsedSkillFile {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Invalid SKILL.md format: Missing YAML frontmatter delimiters ('---')");
  }

  const rawYaml = match[1];
  const body = match[2].trim();

  const lines = rawYaml.split(/\r?\n/);
  const data: Record<string, any> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let val: any = trimmed.slice(colonIdx + 1).trim();

    // Parse string quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Parse arrays like ["a", "b"]
    else if (val.startsWith("[") && val.endsWith("]")) {
      const arrayContent = val.slice(1, -1).trim();
      val = arrayContent
        ? arrayContent.split(",").map((s: string): string => {
            const item: string = s.trim();
            if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) {
              return item.slice(1, -1);
            }
            return item;
          })
        : [];
    }

    data[key] = val;
  }

  const metadata: SkillTier1Metadata = {
    id: data.id || "unknown.skill",
    name: data.name || data.id || "Unknown Skill",
    version: data.version || "0.1.0",
    description: data.description || "",
    category: data.category || "general",
    tags: Array.isArray(data.tags) ? data.tags : [],
    requiredTools: Array.isArray(data.required_tools)
      ? data.required_tools
      : Array.isArray(data.requiredTools)
      ? data.requiredTools
      : [],
    compatibleRoles: Array.isArray(data.compatible_roles)
      ? data.compatible_roles
      : Array.isArray(data.compatibleRoles)
      ? data.compatibleRoles
      : [],
  };

  return { metadata, body };
}
