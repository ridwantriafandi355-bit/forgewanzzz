import { RuntimeDetector, RuntimeDetectionResult } from './types.js';

export class RuntimeDiscoveryCoordinator {
  private detectors: Map<string, RuntimeDetector> = new Map();
  private cachedResults: Map<string, RuntimeDetectionResult> = new Map();

  constructor(initialDetectors: RuntimeDetector[] = []) {
    for (const d of initialDetectors) {
      this.registerDetector(d);
    }
  }

  public registerDetector(detector: RuntimeDetector): void {
    this.detectors.set(detector.id, detector);
  }

  public async discoverAll(): Promise<RuntimeDetectionResult[]> {
    const promises = Array.from(this.detectors.values()).map(async (detector) => {
      try {
        const result = await detector.detect();
        this.cachedResults.set(detector.id, result);
        return result;
      } catch (err) {
        const fallback: RuntimeDetectionResult = {
          id: detector.id,
          name: detector.name,
          detected: false,
          installed: false,
          authenticated: false,
          available: false,
          healthy: false,
          authorized: false,
          trustProfile: {
            trustClass: 'L0',
            boundaryDescription: 'Failed discovery probe',
            isOpaque: true,
          },
          controlProfile: {
            interactive: false,
            streaming: false,
            cancellable: false,
          },
          observabilityProfile: {
            stdoutStreaming: false,
            tokenUsageTelemetry: false,
            processTreeInspection: false,
          },
          capabilities: [],
          probedAt: new Date().toISOString(),
          diagnostics: err instanceof Error ? err.message : String(err),
        };
        this.cachedResults.set(detector.id, fallback);
        return fallback;
      }
    });

    return await Promise.all(promises);
  }

  public async discoverOne(id: string): Promise<RuntimeDetectionResult | null> {
    const detector = this.detectors.get(id);
    if (!detector) return null;

    try {
      const result = await detector.detect();
      this.cachedResults.set(id, result);
      return result;
    } catch {
      return null;
    }
  }

  public getCachedResult(id: string): RuntimeDetectionResult | undefined {
    return this.cachedResults.get(id);
  }

  public async listAvailable(): Promise<RuntimeDetectionResult[]> {
    const all = await this.discoverAll();
    return all.filter((r) => r.detected && r.available);
  }
}
