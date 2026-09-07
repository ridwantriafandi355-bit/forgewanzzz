import { promises as fs } from "node:fs";
import * as path from "node:path";
import { ForgeDatabase, runMigrations } from "@forge/storage";

export interface InitOptions {
  targetDir?: string;
}

export interface InitResult {
  initialized: boolean;
  forgeDir: string;
  dbPath: string;
}

export async function initCommand(options: InitOptions = {}): Promise<InitResult> {
  const root = options.targetDir || process.cwd();
  const forgeDir = path.join(root, ".forge");
  const skillsDir = path.join(forgeDir, "skills");
  const worktreesDir = path.join(forgeDir, "worktrees");
  const dbPath = path.join(forgeDir, "forge.db");
  const configPath = path.join(forgeDir, "config.json");

  await fs.mkdir(forgeDir, { recursive: true });
  await fs.mkdir(skillsDir, { recursive: true });
  await fs.mkdir(worktreesDir, { recursive: true });

  const defaultConfig = {
    version: "0.1.0",
    name: "forge-workspace",
    trustLevel: "L1",
    storage: {
      driver: "sqlite",
      database: "forge.db",
    },
    organization: {
      maxAgents: 10,
    },
  };

  await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), "utf-8");

  // Initialize SQLite database and run canonical migrations
  const db = new ForgeDatabase(dbPath);
  runMigrations(db);

  // Seed initial project record if not exists
  const raw = db.getRawDb();
  const existingProject = raw.prepare("SELECT id FROM projects WHERE id = 'default-project'").get();
  if (!existingProject) {
    const now = new Date().toISOString();
    raw.prepare(
      "INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES ('default-project', 'Default Project', ?, ?, ?)"
    ).run(root, now, now);
  }

  db.close();

  return {
    initialized: true,
    forgeDir,
    dbPath,
  };
}
