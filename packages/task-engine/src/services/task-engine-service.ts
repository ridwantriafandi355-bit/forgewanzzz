import { TaskRecord, TaskStatus, TaskLease, EventBus, InvariantViolationError } from "@forge/core";
import { TaskRepository, LeaseRepository } from "@forge/storage";
import { DagValidator, DagNode } from "../dag/dag-validator.js";
import { TaskStateMachine } from "../fsm/task-state-machine.js";
import { randomUUID } from "node:crypto";

export interface ProposedTask {
  id: string;
  name: string;
  dependencies: string[];
  inputPayload: Record<string, unknown>;
  priority?: number;
  maxRetries?: number;
  timeoutMs?: number;
  requireVerification?: boolean;
}

export class TaskEngineService {
  constructor(
    private taskRepo: TaskRepository,
    private leaseRepo: LeaseRepository,
    private eventBus: EventBus
  ) {}

  async proposeTaskGraph(missionId: string, tasks: ProposedTask[]): Promise<string[]> {
    const dagNodes: DagNode[] = tasks.map(t => ({
      id: t.id,
      dependencies: t.dependencies
    }));

    const validation = DagValidator.validateAcyclic(dagNodes);
    if (!validation.valid) {
      throw new InvariantViolationError("INVARIANT-001.1", `Proposed task graph contains circular dependencies: ${validation.cycle?.join(" -> ")}`);
    }

    const createdIds: string[] = [];
    const now = new Date().toISOString();

    for (const t of tasks) {
      const record: TaskRecord = {
        id: t.id,
        missionId,
        name: t.name,
        status: "QUEUED",
        priority: t.priority ?? 50,
        idempotencyKey: `idemp_${missionId}_${t.id}`,
        dependencies: t.dependencies,
        inputPayload: t.inputPayload,
        retryCount: 0,
        maxRetries: t.maxRetries ?? 3,
        timeoutMs: t.timeoutMs ?? 30000,
        requireVerification: t.requireVerification ?? true,
        createdAt: now,
        updatedAt: now
      };

      this.taskRepo.createTask(record);
      for (const depId of t.dependencies) {
        this.taskRepo.addDependency(t.id, depId);
      }
      createdIds.push(t.id);

      await this.eventBus.emit({
        id: randomUUID(),
        type: "task.created",
        timestamp: now,
        payload: { taskId: t.id, missionId }
      });
    }

    return createdIds;
  }

  getReadyTasks(missionId: string): TaskRecord[] {
    const allTasks = this.taskRepo.getTasksByMission(missionId);
    const completedIds = new Set(allTasks.filter(t => t.status === "COMPLETED").map(t => t.id));

    return allTasks.filter(task => {
      if (task.status !== "QUEUED") return false;
      return task.dependencies.every(depId => completedIds.has(depId));
    });
  }

  async transitionTask(taskId: string, targetStatus: TaskStatus, outputPayload?: Record<string, unknown>): Promise<void> {
    const task = this.taskRepo.getTaskById(taskId);
    if (!task) {
      throw new Error(`Task '${taskId}' not found`);
    }

    TaskStateMachine.validateTransition(task.status, targetStatus);
    this.taskRepo.updateTaskStatus(taskId, targetStatus, outputPayload);

    await this.eventBus.emit({
      id: randomUUID(),
      type: "task.transition",
      timestamp: new Date().toISOString(),
      payload: {
        taskId,
        missionId: task.missionId,
        from: task.status,
        to: targetStatus,
        outputPayload
      }
    });
  }

  acquireTaskLease(taskId: string, agentId: string, runtimeId: string, workspacePath: string, durationSeconds: number = 30): TaskLease {
    const task = this.taskRepo.getTaskById(taskId);
    if (!task) throw new Error(`Task '${taskId}' not found`);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationSeconds * 1000).toISOString();
    const executionId = `exec_${randomUUID()}`;

    const lease: TaskLease = {
      executionId,
      taskId,
      agentId,
      runtimeId,
      workspacePath,
      heartbeatTimestamp: now.toISOString(),
      leaseDurationSeconds: durationSeconds,
      leaseExpiresAt: expiresAt,
      status: "ACTIVE"
    };

    this.leaseRepo.acquireLease(lease);
    return lease;
  }

  renewHeartbeat(executionId: string, durationSeconds: number = 30): void {
    this.leaseRepo.renewHeartbeat(executionId, durationSeconds);
  }

  async sweepExpiredLeases(): Promise<{ recoveredCount: number; failedCount: number }> {
    const expiredLeases = this.leaseRepo.getExpiredActiveLeases();
    let recoveredCount = 0;
    let failedCount = 0;

    for (const lease of expiredLeases) {
      this.leaseRepo.expireLease(lease.executionId);
      const task = this.taskRepo.getTaskById(lease.taskId);
      if (!task) continue;

      if (task.retryCount + 1 <= task.maxRetries) {
        this.taskRepo.incrementRetry(task.id);
        await this.transitionTask(task.id, "RETRYING");
        recoveredCount++;
      } else {
        await this.transitionTask(task.id, "FAILED", { error: "Max retries exceeded due to repeated execution timeouts" });
        failedCount++;
      }
    }

    return { recoveredCount, failedCount };
  }
}
