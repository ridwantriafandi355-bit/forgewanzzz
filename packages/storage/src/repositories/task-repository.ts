import { TaskRecord, TaskStatus } from "@forge/core";
import { ForgeDatabase } from "../database.js";

export class TaskRepository {
  constructor(private db: ForgeDatabase) {}

  createTask(task: TaskRecord): void {
    const raw = this.db.getRawDb();
    const stmt = raw.prepare(`
      INSERT INTO tasks (
        id, mission_id, name, assigned_agent_id, status, priority,
        idempotency_key, input_payload, output_payload, retry_count,
        max_retries, timeout_ms, require_verification, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      task.missionId,
      task.name,
      task.assignedAgentId || null,
      task.status,
      task.priority,
      task.idempotencyKey,
      JSON.stringify(task.inputPayload),
      task.outputPayload ? JSON.stringify(task.outputPayload) : null,
      task.retryCount,
      task.maxRetries,
      task.timeoutMs,
      task.requireVerification ? 1 : 0,
      task.createdAt,
      task.updatedAt
    );
  }

  addDependency(taskId: string, dependsOnTaskId: string): void {
    const raw = this.db.getRawDb();
    raw.prepare("INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)").run(taskId, dependsOnTaskId);
  }

  getDependencies(taskId: string): string[] {
    const raw = this.db.getRawDb();
    const rows = raw.prepare("SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?").all(taskId) as { depends_on_task_id: string }[];
    return rows.map(r => r.depends_on_task_id);
  }

  getDependents(taskId: string): string[] {
    const raw = this.db.getRawDb();
    const rows = raw.prepare("SELECT task_id FROM task_dependencies WHERE depends_on_task_id = ?").all(taskId) as { task_id: string }[];
    return rows.map(r => r.task_id);
  }

  getTaskById(id: string): TaskRecord | null {
    const raw = this.db.getRawDb();
    const row = raw.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      id: row.id as string,
      missionId: row.mission_id as string,
      name: row.name as string,
      assignedAgentId: (row.assigned_agent_id as string) || undefined,
      status: row.status as TaskStatus,
      priority: Number(row.priority),
      idempotencyKey: row.idempotency_key as string,
      dependencies: this.getDependencies(id),
      inputPayload: JSON.parse(row.input_payload as string),
      outputPayload: row.output_payload ? JSON.parse(row.output_payload as string) : undefined,
      retryCount: Number(row.retry_count),
      maxRetries: Number(row.max_retries),
      timeoutMs: Number(row.timeout_ms),
      requireVerification: Boolean(row.require_verification),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    };
  }

  getTaskByIdempotencyKey(key: string): TaskRecord | null {
    const raw = this.db.getRawDb();
    const row = raw.prepare("SELECT * FROM tasks WHERE idempotency_key = ?").get(key) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.getTaskById(row.id as string);
  }

  getTasksByMission(missionId: string): TaskRecord[] {
    const raw = this.db.getRawDb();
    const rows = raw.prepare("SELECT id FROM tasks WHERE mission_id = ? ORDER BY priority ASC").all(missionId) as { id: string }[];
    return rows.map(r => this.getTaskById(r.id)!);
  }

  updateTaskStatus(id: string, status: TaskStatus, outputPayload?: Record<string, unknown>): void {
    const raw = this.db.getRawDb();
    const now = new Date().toISOString();
    if (outputPayload) {
      raw.prepare("UPDATE tasks SET status = ?, output_payload = ?, updated_at = ? WHERE id = ?").run(status, JSON.stringify(outputPayload), now, id);
    } else {
      raw.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
    }
  }

  incrementRetry(id: string): void {
    const raw = this.db.getRawDb();
    raw.prepare("UPDATE tasks SET retry_count = retry_count + 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  }
}
