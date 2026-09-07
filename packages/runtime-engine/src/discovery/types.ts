import { TrustLevel } from '@forge/core';

export interface TrustProfile {
  trustClass: TrustLevel;
  boundaryDescription: string;
  isOpaque: boolean;
}

export interface ControlProfile {
  interactive: boolean;
  streaming: boolean;
  cancellable: boolean;
}

export interface ObservabilityProfile {
  stdoutStreaming: boolean;
  tokenUsageTelemetry: boolean;
  processTreeInspection: boolean;
}

export interface RuntimeDetectionResult {
  id: string;
  name: string;
  detected: boolean;
  installed: boolean;
  authenticated: boolean;
  available: boolean;
  healthy: boolean;
  authorized: boolean; // Must be false until authorized by Capability Resolver
  executablePath?: string;
  version?: string;
  trustProfile: TrustProfile;
  controlProfile: ControlProfile;
  observabilityProfile: ObservabilityProfile;
  capabilities: string[];
  probedAt: string;
  diagnostics?: string;
}

export interface RuntimeDetector {
  readonly id: string;
  readonly name: string;
  detect(): Promise<RuntimeDetectionResult>;
}
