import {
  RuntimeDiscoveryCoordinator,
  NativeDetector,
  ClaudeCodeDetector,
  AntigravityDetector,
  RuntimeDetectionResult,
} from '@forge/runtime-engine';

export interface DiscoveryCommandOptions {
  json?: boolean;
}

export interface DiscoveryCommandResult {
  runtimes: RuntimeDetectionResult[];
  count: number;
  availableCount: number;
}

export async function discoveryCommand(
  opts: DiscoveryCommandOptions = {}
): Promise<DiscoveryCommandResult> {
  const coordinator = new RuntimeDiscoveryCoordinator([
    new NativeDetector(),
    new ClaudeCodeDetector(),
    new AntigravityDetector(),
  ]);

  const runtimes = await coordinator.discoverAll();
  const availableCount = runtimes.filter((r) => r.available).length;

  if (opts.json) {
    console.log(JSON.stringify({ runtimes, count: runtimes.length, availableCount }, null, 2));
  } else {
    console.log('\n========================= FORGE RUNTIME DISCOVERY =========================');
    console.log('ID               TRUST  DETECTED  INSTALLED  AUTH   AVAILABLE  VERSION');
    console.log('---------------------------------------------------------------------------');

    for (const r of runtimes) {
      const id = r.id.padEnd(16);
      const trust = r.trustProfile.trustClass.padEnd(6);
      const det = (r.detected ? 'YES' : 'NO').padEnd(10);
      const inst = (r.installed ? 'YES' : 'NO').padEnd(11);
      const auth = (r.authenticated ? 'YES' : 'NO').padEnd(7);
      const avail = (r.available ? 'YES' : 'NO').padEnd(11);
      const ver = r.version || (r.detected ? 'detected' : 'not found');

      console.log(`${id} ${trust} ${det} ${inst} ${auth} ${avail} ${ver}`);
    }
    console.log('===========================================================================\n');
    console.log(`Summary: ${availableCount} of ${runtimes.length} runtime(s) available for execution.\n`);
  }

  return {
    runtimes,
    count: runtimes.length,
    availableCount,
  };
}
