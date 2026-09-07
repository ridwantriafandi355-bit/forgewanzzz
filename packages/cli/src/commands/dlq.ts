import * as path from 'node:path';
import { ForgeDatabase } from '@forge/storage';

export interface DLQOptions {
  inspectTaskId?: string;
  retryTaskId?: string;
  workspaceRoot?: string;
  json?: boolean;
}

export interface DLQItem {
  id: string;
  missionId: string;
  name: string;
  status: string;
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  updatedAt: string;
}

export interface DLQResult {
  items: DLQItem[];
  count: number;
  inspectedItem?: Record<string, unknown>;
  retriedTaskId?: string;
  message: string;
}

export async function dlqCommand(opts: DLQOptions = {}): Promise<DLQResult> {
  const root = opts.workspaceRoot || process.cwd();
  const dbPath = path.join(root, '.forge', 'forge.db');

  const db = new ForgeDatabase(dbPath);
  const raw = db.getRawDb();

  // Retry action
  if (opts.retryTaskId) {
    const task = raw.prepare('SELECT id, name, status FROM tasks WHERE id = ?').get(opts.retryTaskId) as
      | { id: string; name: string; status: string }
      | undefined;

    if (!task) {
      db.close();
      throw new Error(`Task '${opts.retryTaskId}' not found in DLQ`);
    }

    raw.prepare("UPDATE tasks SET status = 'QUEUED', retry_count = 0, updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      opts.retryTaskId
    );

    db.close();
    const msg = `Task ${opts.retryTaskId} (${task.name}) has been re-queued from DLQ.`;
    if (!opts.json) console.log(`\n[Forge DLQ] ${msg}\n`);

    return {
      items: [],
      count: 0,
      retriedTaskId: opts.retryTaskId,
      message: msg,
    };
  }

  // Inspect action
  if (opts.inspectTaskId) {
    const task = raw
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(opts.inspectTaskId) as Record<string, unknown> | undefined;

    db.close();

    if (!task) {
      throw new Error(`Task '${opts.inspectTaskId}' not found in DLQ`);
    }

    if (opts.json) {
      console.log(JSON.stringify(task, null, 2));
    } else {
      console.log('\n======================== DLQ TASK INSPECTION ========================');
      console.log(`Task ID:       ${task.id}`);
      console.log(`Mission ID:    ${task.mission_id}`);
      console.log(`Name:          ${task.name}`);
      console.log(`Status:        ${task.status}`);
      console.log(`Retries:       ${task.retry_count} / ${task.max_retries}`);
      console.log(`Payload Input: ${JSON.stringify(task.input_payload)}`);
      console.log(`Updated At:    ${task.updated_at}`);
      console.log('=====================================================================\n');
    }

    return {
      items: [],
      count: 1,
      inspectedItem: task,
      message: `Inspected DLQ task ${opts.inspectTaskId}`,
    };
  }

  // Default: list failed tasks
  const rows = raw
    .prepare(
      "SELECT id, mission_id, name, status, retry_count, max_retries, updated_at FROM tasks WHERE status = 'FAILED' ORDER BY updated_at DESC"
    )
    .all() as Array<{
    id: string;
    mission_id: string;
    name: string;
    status: string;
    retry_count: number;
    max_retries: number;
    updated_at: string;
  }>;

  db.close();

  const items: DLQItem[] = rows.map((r) => ({
    id: r.id,
    missionId: r.mission_id,
    name: r.name,
    status: r.status,
    retryCount: r.retry_count,
    maxRetries: r.max_retries,
    updatedAt: r.updated_at,
  }));

  if (opts.json) {
    console.log(JSON.stringify({ items, count: items.length }, null, 2));
  } else {
    console.log('\n======================= FORGE DEAD LETTER QUEUE (DLQ) =======================');
    console.log('TASK ID               MISSION ID            RETRIES   NAME');
    console.log('-----------------------------------------------------------------------------');

    if (items.length === 0) {
      console.log('  (No failed tasks in DLQ - queue is clean)');
    } else {
      for (const item of items) {
        const id = item.id.padEnd(21);
        const mId = item.missionId.padEnd(21);
        const retries = `${item.retryCount}/${item.maxRetries}`.padEnd(9);
        const name = item.name.slice(0, 25);
        console.log(`${id} ${mId} ${retries} ${name}`);
      }
    }
    console.log('=============================================================================\n');
  }

  return {
    items,
    count: items.length,
    message: `Found ${items.length} failed task(s) in DLQ`,
  };
}
