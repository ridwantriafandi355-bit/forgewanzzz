import { TaskLease } from "@forge/core";
import { ForgeDatabase } from "../database.js";

export class LeaseRepository {
  constructor(private db: ForgeDatabase) {}

  acquireLease(lease: TaskLease): void {
    const raw = this.db.getRawDb();
    raw.prepare(`
      INSERT INTO execution_leases (
        execution_id, task_id, agent_id, runtime_id, workspace_path,
        process_group_id, heartbeat_timestamp, lease_duration_seconds,
        lease_expires_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      lease.executionId,
      lease.taskId,
      lease.agentId,
      lease.runtimeId,
      lease.workspacePath,
      lease.processGroupId || null,
      lease.heartbeatTimestamp,
      lease.leaseDurationSeconds,
      lease.leaseExpiresAt,
      lease.status
    );
  }

  getLease(executionId: string): TaskLease | null {
    const raw = this.db.getRawDb();
    const r = raw.prepare("SELECT * FROM execution_leases WHERE execution_id = ?").get(executionId) as Record<string, unknown> | undefined;
    if (!r) return null;

    return {
      executionId: r.execution_id as string,
      taskId: r.task_id as string,
      agentId: r.agent_id as string,
      runtimeId: r.runtime_id as string,
      workspacePath: r.workspace_path as string,
      processGroupId: r.process_group_id ? Number(r.process_group_id) : undefined,
      heartbeatTimestamp: r.heartbeat_timestamp as string,
      leaseDurationSeconds: Number(r.lease_duration_seconds),
      leaseExpiresAt: r.lease_expires_at as string,
      status: r.status as TaskLease["status"]
    };
  }

  renewHeartbeat(executionId: string, durationSeconds: number = 30): void {
    const raw = this.db.getRawDb();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationSeconds * 1000).toISOString();

    raw.prepare(`
      UPDATE execution_leases
      SET heartbeat_timestamp = ?, lease_expires_at = ?
      WHERE execution_id = ? AND status = 'ACTIVE'
    `).run(now.toISOString(), expiresAt, executionId);
  }

  getExpiredActiveLeases(): TaskLease[] {
    const raw = this.db.getRawDb();
    const now = new Date().toISOString();
    const rows = raw.prepare(`
      SELECT * FROM execution_leases
      WHERE status = 'ACTIVE' AND lease_expires_at < ?
    `).all(now) as Record<string, unknown>[];

    return rows.map(r => ({
      executionId: r.execution_id as string,
      taskId: r.task_id as string,
      agentId: r.agent_id as string,
      runtimeId: r.runtime_id as string,
      workspacePath: r.workspace_path as string,
      processGroupId: r.process_group_id ? Number(r.process_group_id) : undefined,
      heartbeatTimestamp: r.heartbeat_timestamp as string,
      leaseDurationSeconds: Number(r.lease_duration_seconds),
      leaseExpiresAt: r.lease_expires_at as string,
      status: r.status as TaskLease["status"]
    }));
  }

  expireLease(executionId: string): void {
    const raw = this.db.getRawDb();
    raw.prepare("UPDATE execution_leases SET status = 'EXPIRED' WHERE execution_id = ?").run(executionId);
  }

  releaseLease(executionId: string): void {
    const raw = this.db.getRawDb();
    raw.prepare("UPDATE execution_leases SET status = 'RELEASED' WHERE execution_id = ?").run(executionId);
  }
}
