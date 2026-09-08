import type { AgentState, AgentEvent } from "../types/agent.js";

export class AgentStateMachine {
  private currentState: AgentState;

  constructor(initialState: AgentState = "UNINITIALIZED") {
    this.currentState = initialState;
  }

  getState(): AgentState {
    return this.currentState;
  }

  transition(event: AgentEvent): AgentState {
    const from = this.currentState;
    let to: AgentState;

    switch (from) {
      case "UNINITIALIZED":
        if (event.type === "INITIALIZE") to = "IDLE";
        else this.throwInvalid(from, event.type);
        break;

      case "IDLE":
        if (event.type === "RECEIVE_TASK") to = "PLANNING";
        else this.throwInvalid(from, event.type);
        break;

      case "PLANNING":
        if (event.type === "PLAN_FORMULATED") to = "EXECUTING";
        else if (event.type === "FAIL") to = "FAILED";
        else if (event.type === "RESET") to = "IDLE";
        else this.throwInvalid(from, event.type);
        break;

      case "EXECUTING":
        if (event.type === "INVOKE_TOOL") to = "AWAITING_TOOL";
        else if (event.type === "REQUIRE_APPROVAL") to = "AWAITING_APPROVAL";
        else if (event.type === "OUTPUT_GENERATED") to = "EVALUATING";
        else if (event.type === "FAIL") to = "FAILED";
        else this.throwInvalid(from, event.type);
        break;

      case "AWAITING_TOOL":
        if (event.type === "TOOL_RESULT_RECEIVED") to = "EXECUTING";
        else if (event.type === "FAIL") to = "FAILED";
        else this.throwInvalid(from, event.type);
        break;

      case "AWAITING_APPROVAL":
        if (event.type === "APPROVAL_GRANTED") to = "EXECUTING";
        else if (event.type === "APPROVAL_REJECTED") to = "FAILED";
        else if (event.type === "FAIL") to = "FAILED";
        else this.throwInvalid(from, event.type);
        break;

      case "EVALUATING":
        if (event.type === "EVALUATOR_PASSED") to = "COMPLETED";
        else if (event.type === "EVALUATOR_FAILED") to = "PLANNING";
        else if (event.type === "FAIL") to = "FAILED";
        else this.throwInvalid(from, event.type);
        break;

      case "COMPLETED":
      case "FAILED":
        if (event.type === "RESET") to = "IDLE";
        else this.throwInvalid(from, event.type);
        break;

      default:
        this.throwInvalid(from, event.type);
    }

    this.currentState = to!;
    return this.currentState;
  }

  private throwInvalid(from: AgentState, eventType: string): never {
    throw new Error(`Invalid agent state transition from '${from}' on event '${eventType}'.`);
  }
}
