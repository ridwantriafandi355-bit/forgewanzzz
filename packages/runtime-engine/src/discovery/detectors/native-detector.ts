import { RuntimeDetector, RuntimeDetectionResult } from '../types.js';

export class NativeDetector implements RuntimeDetector {
  public readonly id = 'native-forge';
  public readonly name = 'Native Forge Execution Runner';

  public async detect(): Promise<RuntimeDetectionResult> {
    return {
      id: this.id,
      name: this.name,
      detected: true,
      installed: true,
      authenticated: true,
      available: true,
      healthy: true,
      authorized: false, // Must be authorized via Capability Resolver
      version: '0.1.0-native',
      trustProfile: {
        trustClass: 'L4',
        boundaryDescription: 'Native in-process Forge runner with 100% deterministic state and execution hooks',
        isOpaque: false,
      },
      controlProfile: {
        interactive: false,
        streaming: true,
        cancellable: true,
      },
      observabilityProfile: {
        stdoutStreaming: true,
        tokenUsageTelemetry: true,
        processTreeInspection: true,
      },
      capabilities: [
        'filesystem.read',
        'filesystem.write',
        'git.status',
        'git.commit',
        'code.transform',
      ],
      probedAt: new Date().toISOString(),
    };
  }
}
