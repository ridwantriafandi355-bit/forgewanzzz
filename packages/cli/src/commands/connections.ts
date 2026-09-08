import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConnectionManager, ConnectionRecord, SecretRedactor } from '@forge/auth-connections';
import { ForgeDatabase, ConnectionRepository, runMigrations } from '@forge/storage';

export interface ConnectionsCommandOptions {
  subcommand?: 'list' | 'add' | 'test';
  connectionId?: string;
  name?: string;
  type?: ConnectionRecord['type'];
  authType?: ConnectionRecord['authType'];
  secretRef?: string;
  targetEndpoint?: string;
  workspaceRoot?: string;
  json?: boolean;
}

export interface ConnectionsCommandResult {
  connections: ConnectionRecord[];
  activeCount: number;
  message?: string;
}

// In-memory / process connection registry for CLI runtime
let sharedConnectionManager: ConnectionManager | null = null;
let sharedConnectionRepo: ConnectionRepository | null = null;

export function getCliConnectionRepo(workspaceRoot?: string): ConnectionRepository | null {
  if (!sharedConnectionRepo) {
    const root = workspaceRoot || process.cwd();
    const dbPath = path.join(root, '.forge', 'forge.db');
    if (fs.existsSync(dbPath)) {
      try {
        const db = new ForgeDatabase(dbPath);
        runMigrations(db);
        sharedConnectionRepo = new ConnectionRepository(db);
      } catch {}
    }
  }
  return sharedConnectionRepo;
}

export function getCliConnectionManager(workspaceRoot?: string): ConnectionManager {
  if (!sharedConnectionManager) {
    sharedConnectionManager = new ConnectionManager();
    const repo = getCliConnectionRepo(workspaceRoot);

    if (repo) {
      const stored = repo.findAll();
      if (stored.length > 0) {
        for (const s of stored) {
          let liveStatus = s.status as any;
          if (s.credentialRef?.startsWith("secret://env/")) {
            const envKey = s.credentialRef.replace("secret://env/", "");
            liveStatus = process.env[envKey] ? "CONNECTED" : "CONFIGURED";
          }
          sharedConnectionManager.registerConnection({
            id: s.id,
            name: s.name,
            type: s.type as any,
            authType: s.authType as any,
            status: liveStatus,
            credentialOwnership: s.credentialOwnership as any,
            credentialRef: s.credentialRef,
            targetEndpoint: s.targetEndpoint,
            health: s.health as any,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          });
        }
        const hasGemini = stored.some((s) => s.id === "conn_gemini_default");
        if (!hasGemini) {
          const geminiRecord: ConnectionRecord = {
            id: "conn_gemini_default",
            name: "Google Gemini Pro Cloud",
            type: "PROVIDER",
            authType: "API_KEY",
            status: process.env.GEMINI_API_KEY ? "CONNECTED" : "CONFIGURED",
            credentialOwnership: "USER_MANAGED",
            credentialRef: "secret://env/GEMINI_API_KEY",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          sharedConnectionManager.registerConnection(geminiRecord);
          try {
            repo.save(geminiRecord as any);
          } catch {}
        }
        return sharedConnectionManager;
      }
    }

    // Pre-populate default connection descriptors
    const defaultConnections: ConnectionRecord[] = [
      {
        id: 'conn_anthropic_default',
        name: 'Anthropic Cloud Primary',
        type: 'PROVIDER',
        authType: 'API_KEY',
        status: process.env.ANTHROPIC_API_KEY ? 'CONNECTED' : 'CONFIGURED',
        credentialOwnership: 'USER_MANAGED',
        credentialRef: 'secret://env/ANTHROPIC_API_KEY',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'conn_openai_default',
        name: 'OpenAI API Gateway',
        type: 'PROVIDER',
        authType: 'API_KEY',
        status: process.env.OPENAI_API_KEY ? 'CONNECTED' : 'CONFIGURED',
        credentialOwnership: 'USER_MANAGED',
        credentialRef: 'secret://env/OPENAI_API_KEY',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'conn_local_ollama',
        name: 'Local Ollama Instance',
        type: 'PROVIDER',
        authType: 'NONE',
        status: 'CONNECTED',
        credentialOwnership: 'USER_MANAGED',
        targetEndpoint: 'http://localhost:11434',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'conn_gemini_default',
        name: 'Google Gemini Pro Cloud',
        type: 'PROVIDER',
        authType: 'API_KEY',
        status: process.env.GEMINI_API_KEY ? 'CONNECTED' : 'CONFIGURED',
        credentialOwnership: 'USER_MANAGED',
        credentialRef: 'secret://env/GEMINI_API_KEY',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const c of defaultConnections) {
      sharedConnectionManager.registerConnection(c);
      if (repo) {
        try {
          repo.save(c as any);
        } catch {}
      }
    }
  }
  return sharedConnectionManager;
}


export async function connectionsCommand(
  opts: ConnectionsCommandOptions = {}
): Promise<ConnectionsCommandResult> {
  const manager = getCliConnectionManager();
  const subcommand = opts.subcommand || 'list';

  if (subcommand === 'add' && opts.connectionId && opts.name && opts.type) {
    const record: ConnectionRecord = {
      id: opts.connectionId,
      name: opts.name,
      type: opts.type,
      authType: opts.authType || 'API_KEY',
      status: 'CONFIGURED',
      credentialOwnership: 'USER_MANAGED',
      credentialRef: opts.secretRef,
      targetEndpoint: opts.targetEndpoint,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    manager.registerConnection(record);
    if (sharedConnectionRepo) {
      try {
        sharedConnectionRepo.save(record as any);
      } catch {}
    }
  } else if (subcommand === 'test' && opts.connectionId) {
    await manager.validateConnection(opts.connectionId);
    const updated = manager.getConnection(opts.connectionId);
    if (updated && sharedConnectionRepo) {
      try {
        sharedConnectionRepo.save(updated as any);
      } catch {}
    }
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
