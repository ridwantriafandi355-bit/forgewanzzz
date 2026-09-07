export class ProviderRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRoutingError";
  }
}

export class RateLimitExceededError extends ProviderRoutingError {
  constructor(public readonly providerId: string, message: string) {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

export class ModelNotFoundError extends ProviderRoutingError {
  constructor(public readonly modelId: string) {
    super(`Model '${modelId}' not found in registry`);
    this.name = "ModelNotFoundError";
  }
}

export class ProviderNotFoundError extends ProviderRoutingError {
  constructor(public readonly providerId: string) {
    super(`Provider '${providerId}' not found in registry`);
    this.name = "ProviderNotFoundError";
  }
}
