import { ConnectionManager, ConnectionRecord, SecretRedactor } from '@forge/auth-connections';

export interface ConnectionsCommandOptions {
  subcommand?: 'list' | 'add' | 'test';
  connectionId?: string;
  name?: string;
  type?: ConnectionRecord['type'];
  authType?: ConnectionRecord['authType'];
  secretRef?: string;
  json?: boolean;
}

export interface ConnectionsCommandResult {
  connections: ConnectionRecord[];
  activeCount: number;
  message?: string;
}

// In-memory / process connection registry for CLI runtime
let sharedConnectionManager: ConnectionManager | null = null;

export function getCliConnectionManager(): ConnectionManager {
  if (!sharedConnectionManager) {
    sharedConnectionManager = new ConnectionManager();

    // Pre-populate default connection descriptors
    sharedConnectionManager.registerConnection({
      id: 'conn_anthropic_default',
      name: 'Anthropic Cloud Primary',
      type: 'PROVIDER',
      authType: 'API_KEY',
      status: process.env.ANTHROPIC_API_KEY ? 'CONNECTED' : 'CONFIGURED',
      credentialOwnership: 'USER_MANAGED',
      credentialRef: 'secret://env/ANTHROPIC_API_KEY',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    sharedConnectionManager.registerConnection({
      id: 'conn_openai_default',
      name: 'OpenAI API Gateway',
      type: 'PROVIDER',
      authType: 'API_KEY',
      status: process.env.OPENAI_API_KEY ? 'CONNECTED' : 'CONFIGURED',
      credentialOwnership: 'USER_MANAGED',
      credentialRef: 'secret://env/OPENAI_API_KEY',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    sharedConnectionManager.registerConnection({
      id: 'conn_local_ollama',
      name: 'Local Ollama Instance',
      type: 'PROVIDER',
      authType: 'NONE',
      status: 'CONNECTED',
      credentialOwnership: 'USER_MANAGED',
      targetEndpoint: 'http://localhost:11434',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return sharedConnectionManager;
}

export async function connectionsCommand(
  opts: ConnectionsCommandOptions = {}
): Promise<ConnectionsCommandResult> {
  const manager = getCliConnectionManager();
  const subcommand = opts.subcommand || 'list';

  if (subcommand === 'add' && opts.connectionId && opts.name && opts.type) {
    manager.registerConnection({
      id: opts.connectionId,
      name: opts.name,
      type: opts.type,
      authType: opts.authType || 'API_KEY',
      status: 'CONFIGURED',
      credentialOwnership: 'USER_MANAGED',
      credentialRef: opts.secretRef,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } else if (subcommand === 'test' && opts.connectionId) {
    await manager.validateConnection(opts.connectionId);
  }

  const connections = manager.listConnections();
  const activeCount = connections.filter((c) => c.status === 'CONNECTED').length;

  if (opts.json) {
    console.log(JSON.stringify({ connections, count: connections.length, activeCount }, null, 2));
  } else {
    console.log('\n======================== FORGE AUTH & CONNECTIONS ========================');
    console.log('ID                    NAME                     TYPE       AUTH      STATUS');
    console.log('--------------------------------------------------------------------------');

    for (const c of connections) {
      const id = c.id.padEnd(21);
      const name = c.name.slice(0, 23).padEnd(24);
      const type = c.type.padEnd(10);
      const auth = c.authType.padEnd(9);
      const status = c.status;

      console.log(`${id} ${name} ${type} ${auth} ${status}`);
    }
    console.log('==========================================================================\n');
    console.log(`Summary: ${activeCount} of ${connections.length} connection(s) active & ready.\n`);
  }

  return {
    connections,
    activeCount,
    message: `Processed subcommand '${subcommand}'`,
  };
}
