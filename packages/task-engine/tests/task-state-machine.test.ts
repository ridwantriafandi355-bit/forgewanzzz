import { describe, it, expect } from "vitest";
import { TaskStateMachine } from "../src/fsm/task-state-machine.js";
import { TaskStateTransitionError } from "@forge/core";

describe("TaskStateMachine", () => {
  it("allows valid lifecycle transitions", () => {
    expect(() => TaskStateMachine.validateTransition("QUEUED", "RUNNING")).not.toThrow();
    expect(() => TaskStateMachine.validateTransition("RUNNING", "COMPLETED")).not.toThrow();
    expect(() => TaskStateMachine.validateTransition("RUNNING", "FAILED")).not.toThrow();
    expect(() => TaskStateMachine.validateTransition("RUNNING", "RETRYING")).not.toThrow();
    expect(() => TaskStateMachine.validateTransition("RETRYING", "RUNNING")).not.toThrow();
    expect(() => TaskStateMachine.validateTransition("RUNNING", "PAUSED")).not.toThrow();
    expect(() => TaskStateMachine.validateTransition("PAUSED", "RUNNING")).not.toThrow();
    expect(() => TaskStateMachine.validateTransition("RUNNING", "CHECKPOINTING")).not.toThrow();
    expect(() => TaskStateMachine.validateTransition("CHECKPOINTING", "RUNNING")).not.toThrow();
  });

  it("rejects invalid transitions with TaskStateTransitionError", () => {
    expect(() => TaskStateMachine.validateTransition("COMPLETED", "RUNNING")).toThrow(TaskStateTransitionError);
    expect(() => TaskStateMachine.validateTransition("FAILED", "COMPLETED")).toThrow(TaskStateTransitionError);
    expect(() => TaskStateMachine.validateTransition("QUEUED", "COMPLETED")).toThrow(TaskStateTransitionError);
  });
});
