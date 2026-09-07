import * as path from "node:path";
import { ForgeDatabase } from "@forge/storage";

export interface StatusOptions {
  workspaceRoot?: string;
}

export interface StatusResult {
  missionsCount: number;
  tasksCount: number;
  activeLeasesCount: number;
  missions: Array<{ id: string; name: string; status: string }>;
  tasks: Array<{ id: string; name: string; status: string }>;
}

export async function statusCommand(options: StatusOptions = {}): Promise<StatusResult> {
  const root = options.workspaceRoot || process.cwd();
  const dbPath = path.join(root, ".forge", "forge.db");

  const db = new ForgeDatabase(dbPath);
  const raw = db.getRawDb();

  const missions = raw.prepare("SELECT id, name, status FROM missions").all() as Array<{
    id: string;
    name: string;
    status: string;
  }>;

  const tasks = raw.prepare("SELECT id, name, status FROM tasks").all() as Array<{
    id: string;
    name: string;
    status: string;
  }>;

  const leases = raw.prepare("SELECT execution_id FROM execution_leases WHERE status = 'ACTIVE'").all() as Array<{
    execution_id: string;
  }>;

  db.close();

  return {
    missionsCount: missions.length,
    tasksCount: tasks.length,
    activeLeasesCount: leases.length,
    missions,
    tasks,
  };
}
