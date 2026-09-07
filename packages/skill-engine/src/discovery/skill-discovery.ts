import { promises as fs } from "node:fs";
import * as path from "node:path";
import { parseSkillFrontmatter } from "../parser/frontmatter-parser.js";
import type { SkillDefinition, SkillSource } from "../types/skill.js";

export async function scanSkillDirectory(
  baseDir: string,
  source: SkillSource
): Promise<SkillDefinition[]> {
  const skills: SkillDefinition[] = [];

  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillFilePath = path.join(baseDir, entry.name, "SKILL.md");
      try {
        const content = await fs.readFile(skillFilePath, "utf-8");
        const parsed = parseSkillFrontmatter(content);

        skills.push({
          ...parsed.metadata,
          source,
          tier2Instructions: parsed.body,
          filePath: skillFilePath,
        });
      } catch {
        // Not a valid skill directory or missing SKILL.md, skip
      }
    }
  } catch {
    // Directory does not exist, return empty
  }

  return skills;
}
