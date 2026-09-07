import { describe, it, expect } from 'vitest';
import {
  RuntimeDiscoveryCoordinator,
  NativeDetector,
  ClaudeCodeDetector,
  AntigravityDetector,
} from '../src/index.js';

describe('Runtime Discovery Subsystem (08-RUNTIME-DISCOVERY.md)', () => {
  it('discovers L4 Native Forge Runner with high-trust non-opaque profile', async () => {
    const detector = new NativeDetector();
    const result = await detector.detect();

    expect(result.id).toBe('native-forge');
    expect(result.detected).toBe(true);
    expect(result.installed).toBe(true);
    expect(result.available).toBe(true);
    expect(result.authorized).toBe(false); // Invariant: Detected != Authorized
    expect(result.trustProfile.trustClass).toBe('L4');
    expect(result.trustProfile.isOpaque).toBe(false);
    expect(result.observabilityProfile.tokenUsageTelemetry).toBe(true);
  });

  it('discovers L1 Claude Code CLI via non-destructive probe and reports opaque boundary', async () => {
    // Mock probe returning simulated version output
    const mockProbe = async (cmd: string) => {
      if (cmd.includes('claude')) {
        return { stdout: 'claude-code version 1.0.42\n', stderr: '' };
      }
      throw new Error('command not found');
    };

    const detector = new ClaudeCodeDetector(mockProbe);
    const result = await detector.detect();

    expect(result.id).toBe('claude-code');
    expect(result.detected).toBe(true);
    expect(result.installed).toBe(true);
    expect(result.version).toBe('claude-code version 1.0.42');
    expect(result.trustProfile.trustClass).toBe('L1');
    expect(result.trustProfile.isOpaque).toBe(true);
  });

  it('handles missing or uninstalled runtime probes gracefully without throwing', async () => {
    const failingProbe = async () => {
      throw new Error('Command failed: agy: not found');
    };

    const detector = new AntigravityDetector(failingProbe);
    const result = await detector.detect();

    expect(result.id).toBe('antigravity-cli');
    expect(result.detected).toBe(false);
    expect(result.installed).toBe(false);
    expect(result.available).toBe(false);
    expect(result.diagnostics).toContain('not found');
  });

  it('RuntimeDiscoveryCoordinator aggregates multiple runtimes and isolates failures', async () => {
    const native = new NativeDetector();
    const claude = new ClaudeCodeDetector(async () => ({ stdout: 'claude 1.0.0', stderr: '' }));
    const agy = new AntigravityDetector(async () => {
      throw new Error('agy not found in path');
    });

    const coordinator = new RuntimeDiscoveryCoordinator([native, claude, agy]);
    const results = await coordinator.discoverAll();

    expect(results.length).toBe(3);

    const available = await coordinator.listAvailable();
    // native and claude should be available, agy should not
    expect(available.map((a) => a.id)).toEqual(['native-forge', 'claude-code']);

    // Check cached result
    const cachedNative = coordinator.getCachedResult('native-forge');
    expect(cachedNative?.detected).toBe(true);
  });
});
