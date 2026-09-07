import { RuntimeDetector, RuntimeDetectionResult } from '../types.js';
import { ExecProbeFn } from './claude-code-detector.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export class AntigravityDetector implements RuntimeDetector {
  public readonly id = 'antigravity-cli';
  public readonly name = 'Antigravity CLI (AGY)';

  constructor(private probeFn: ExecProbeFn = execAsync) {}

  public async detect(): Promise<RuntimeDetectionResult> {
    const baseResult: RuntimeDetectionResult = {
      id: this.id,
      name: this.name,
      detected: false,
      installed: false,
      authenticated: false,
      available: false,
      healthy: false,
      authorized: false,
      trustProfile: {
        trustClass: 'L1',
        boundaryDescription: 'External opaque Google Deepmind Antigravity CLI and IDE subagent platform',
        isOpaque: true,
      },
      controlProfile: {
        interactive: false,
        streaming: true,
        cancellable: true,
      },
      observabilityProfile: {
        stdoutStreaming: true,
        tokenUsageTelemetry: false,
        processTreeInspection: true,
      },
      capabilities: ['code.generate', 'shell.execute', 'filesystem.edit', 'subagent.dispatch'],
      probedAt: new Date().toISOString(),
    };

    try {
      const cmd = process.platform === 'win32' ? 'agy.cmd --version' : 'agy --version';
      const { stdout } = await this.probeFn(cmd);
      const cleanStdout = stdout.trim();

      if (cleanStdout) {
        baseResult.detected = true;
        baseResult.installed = true;
        baseResult.version = cleanStdout;
        baseResult.healthy = true;
        baseResult.available = true;
        baseResult.authenticated = true;
      }
    } catch (err) {
      baseResult.diagnostics = err instanceof Error ? err.message : String(err);
      baseResult.detected = false;
      baseResult.installed = false;
      baseResult.available = false;
    }

    return baseResult;
  }
}
