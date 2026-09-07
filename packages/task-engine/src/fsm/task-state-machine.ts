import { TaskStatus, TaskStateTransitionError } from "@forge/core";

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  QUEUED: ["RUNNING", "PAUSED", "FAILED"],
  RUNNING: ["PAUSED", "CHECKPOINTING", "RETRYING", "COMPLETED", "FAILED"],
  PAUSED: ["RUNNING", "FAILED"],
  CHECKPOINTING: ["RUNNING", "FAILED"],
  RETRYING: ["RUNNING", "QUEUED", "FAILED"],
  COMPLETED: [],
  FAILED: []
};

export class TaskStateMachine {
  static canTransition(from: TaskStatus, to: TaskStatus): boolean {
    const targets = ALLOWED_TRANSITIONS[from];
    return targets ? targets.includes(to) : false;
  }

  static validateTransition(from: TaskStatus, to: TaskStatus): void {
    if (!this.canTransition(from, to)) {
      throw new TaskStateTransitionError(from, to, `Transition from '${from}' to '${to}' is prohibited by task state machine`);
    }
  }
}
