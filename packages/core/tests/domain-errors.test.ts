import { describe, it, expect } from "vitest";
import {
  ForgeError,
  InvariantViolationError,
  TaskStateTransitionError,
  CapabilityDeniedError
} from "../src/errors/domain-errors.js";

describe("Domain Errors", () => {
  it("creates InvariantViolationError with code and formatted message", () => {
    const err = new InvariantViolationError("INVARIANT-001.1", "Only Task Engine mutates state");
    expect(err).toBeInstanceOf(ForgeError);
    expect(err.code).toBe("INVARIANT_VIOLATION");
    expect(err.message).toContain("[INVARIANT-001.1]");
  });

  it("creates TaskStateTransitionError with from/to states", () => {
    const err = new TaskStateTransitionError("COMPLETED", "RUNNING", "Cannot rerun completed task");
    expect(err.code).toBe("ILLEGAL_STATE_TRANSITION");
    expect(err.message).toContain("'COMPLETED' to 'RUNNING'");
  });

  it("creates CapabilityDeniedError with capability identifier", () => {
    const err = new CapabilityDeniedError("shell.exec", "Restricted by project policy");
    expect(err.code).toBe("CAPABILITY_DENIED");
    expect(err.message).toContain("'shell.exec'");
  });
});
