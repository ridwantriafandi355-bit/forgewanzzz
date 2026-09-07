import { ForgeDatabase } from "../database.js";

export interface ApprovalRecord {
  id: string;
  taskId: string;
  missionId?: string;
  toolName: string;
  riskLevel: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedByAgent: string;
  decidedBy?: string;
  decidedAt?: string;
  createdAt: string;
}

export class ApprovalRepository {
  constructor(private db: ForgeDatabase) {}

  public create(approval: ApprovalRecord): void {
    const raw = this.db.getRawDb();
    raw
      .prepare(
        `INSERT INTO approvals (id, task_id, mission_id, tool_name, risk_level, reason, status, requested_by_agent, decided_by, decided_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        approval.id,
        approval.taskId,
        approval.missionId || null,
        approval.toolName,
        approval.riskLevel,
        approval.reason,
        approval.status,
        approval.requestedByAgent,
        approval.decidedBy || null,
        approval.decidedAt || null,
        approval.createdAt
      );
  }

  public findById(id: string): ApprovalRecord | undefined {
    const raw = this.db.getRawDb();
    const row = raw.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as any;
    if (!row) return undefined;

    return {
      id: row.id,
      taskId: row.task_id,
      missionId: row.mission_id || undefined,
      toolName: row.tool_name,
      riskLevel: row.risk_level,
      reason: row.reason,
      status: row.status,
      requestedByAgent: row.requested_by_agent,
      decidedBy: row.decided_by || undefined,
      decidedAt: row.decided_at || undefined,
      createdAt: row.created_at,
    };
  }

  public findPending(): ApprovalRecord[] {
    const raw = this.db.getRawDb();
    const rows = raw
      .prepare("SELECT * FROM approvals WHERE status = 'PENDING' ORDER BY created_at ASC")
      .all() as any[];

    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      missionId: row.mission_id || undefined,
      toolName: row.tool_name,
      riskLevel: row.risk_level,
      reason: row.reason,
      status: row.status,
      requestedByAgent: row.requested_by_agent,
      decidedBy: row.decided_by || undefined,
      decidedAt: row.decided_at || undefined,
      createdAt: row.created_at,
    }));
  }

  public updateStatus(
    id: string,
    status: "APPROVED" | "REJECTED",
    decidedBy: string = "Board"
  ): void {
    const raw = this.db.getRawDb();
    raw
      .prepare(
        "UPDATE approvals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?"
      )
      .run(status, decidedBy, new Date().toISOString(), id);
  }
}
