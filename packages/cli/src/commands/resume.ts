import * as path from 'node:path';
import { ForgeDatabase } from '@forge/storage';

export interface ResumeOptions {
  missionId: string;
  workspaceRoot?: string;
  json?: boolean;
}

export interface ResumeResult {
  missionId: string;
  resumed: boolean;
  skippedCompletedTasks: number;
  remainingTasks: number;
  status: string;
  message: string;
}

export async function resumeCommand(opts: ResumeOptions): Promise<ResumeResult> {
  const root = opts.workspaceRoot || process.cwd();
  const dbPath = path.join(root, '.forge', 'forge.db');

  const db = new ForgeDatabase(dbPath);
  const raw = db.getRawDb();

  const mission = raw.prepare('SELECT id, name, status FROM missions WHERE id = ?').get(opts.missionId) as
    | { id: string; name: string; status: string }
    | undefined;

  if (!mission) {
    db.close();
    throw new Error(`Mission '${opts.missionId}' not found in database`);
  }

  const tasks = raw
    .prepare('SELECT id, name, status FROM tasks WHERE mission_id = ?')
    .all(opts.missionId) as Array<{ id: string; name: string; status: string }>;

  const completed = tasks.filter((t) => t.status === 'COMPLETED');
  const remaining = tasks.filter((t) => t.status !== 'COMPLETED');

  // Resume remaining tasks by transitioning any paused or retrying to READY/QUEUED
  for (const t of remaining) {
    if (t.status === 'PAUSED' || t.status === 'RETRYING') {
      raw.prepare("UPDATE tasks SET status = 'QUEUED', updated_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        t.id
      );
    }
  }

  // Update mission status to RUNNING if it was PAUSED
  if (mission.status === 'PAUSED') {
    raw.prepare("UPDATE missions SET status = 'RUNNING', updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      opts.missionId
    );
  }

  db.close();

  const message =
    remaining.length === 0
      ? `All ${completed.length} task(s) in mission ${opts.missionId} are already verified.`
      : `Resumed mission ${opts.missionId}: ${completed.length} completed task(s) skipped, ${remaining.length} task(s) queued for execution.`;

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          missionId: opts.missionId,
          resumed: true,
          skippedCompletedTasks: completed.length,
          remainingTasks: remaining.length,
          status: 'RUNNING',
          message,
        },
        null,
        2
      )
    );
  } else {
    console.log(`\n[Forge Resume] ${message}\n`);
  }

  return {
    missionId: opts.missionId,
    resumed: true,
    skippedCompletedTasks: completed.length,
    remainingTasks: remaining.length,
    status: remaining.length === 0 ? 'COMPLETED' : 'RUNNING',
    message,
  };
}
