export class ForgeError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvariantViolationError extends ForgeError {
  constructor(invariantId: string, details: string) {
    super(`[${invariantId}] Invariant violation: ${details}`, "INVARIANT_VIOLATION");
  }
}

export class TaskStateTransitionError extends ForgeError {
  constructor(from: string, to: string, reason: string) {
    super(`Illegal transition from '${from}' to '${to}': ${reason}`, "ILLEGAL_STATE_TRANSITION");
  }
}

export class CapabilityDeniedError extends ForgeError {
  constructor(capability: string, reason: string) {
    super(`Capability '${capability}' denied: ${reason}`, "CAPABILITY_DENIED");
  }
}

export class LeaseExpiredError extends ForgeError {
  constructor(executionId: string) {
    super(`Execution lease '${executionId}' has expired`, "LEASE_EXPIRED");
  }
}
