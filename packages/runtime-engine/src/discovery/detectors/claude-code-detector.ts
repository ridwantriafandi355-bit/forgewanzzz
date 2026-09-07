import { RuntimeDetector, RuntimeDetectionResult } from '../types.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export type ExecProbeFn = (command: string) => Promise<{ stdout: string; stderr: string }>;

export class ClaudeCodeDetector implements RuntimeDetector {
  public readonly id = 'claude-code';
  public readonly name = 'Claude Code CLI';

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
        boundaryDescription: 'External opaque AI coding CLI with self-contained runtime and tool execution',
        isOpaque: true,
      },
      controlProfile: {
        interactive: true,
        streaming: true,
        cancellable: true,
      },
      observabilityProfile: {
        stdoutStreaming: true,
        tokenUsageTelemetry: false,
        processTreeInspection: true,
      },
      capabilities: ['code.generate', 'shell.execute', 'filesystem.edit', 'git.workflow'],
      probedAt: new Date().toISOString(),
    };

    try {
      // Non-destructive probe: claude --version
      const cmd = process.platform === 'win32' ? 'claude.cmd --version' : 'claude --version';
      const { stdout } = await this.probeFn(cmd);
      const cleanStdout = stdout.trim();

      if (cleanStdout) {
        baseResult.detected = true;
        baseResult.installed = true;
        baseResult.version = cleanStdout;
        baseResult.healthy = true;
        baseResult.available = true;
        // Authenticated is observed as true if version check succeeded without auth failure
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
