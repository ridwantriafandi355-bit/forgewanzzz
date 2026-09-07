import { DomainError, Result, ok, err } from '@forge/core';
import {
  ConnectionRecord,
  ConnectionStatus,
  SecretReference,
} from './types.js';
import { SecretRedactor } from './secret-redactor.js';

export class ConnectionManager {
  private connections: Map<string, ConnectionRecord> = new Map();
  private secretVault: Map<string, string> = new Map();
  private redactor: SecretRedactor;

  constructor(redactor?: SecretRedactor) {
    this.redactor = redactor || new SecretRedactor();
  }

  public getRedactor(): SecretRedactor {
    return this.redactor;
  }

  public registerConnection(conn: ConnectionRecord): Result<void, DomainError> {
    if (!conn.id || !conn.name || !conn.type) {
      return err(
        new DomainError(
          'INVALID_CONNECTION_PAYLOAD',
          'Connection must have valid id, name, and type',
          { id: conn.id }
        )
      );
    }

    this.connections.set(conn.id, {
      ...conn,
      updatedAt: new Date().toISOString(),
    });

    return ok(undefined);
  }

  public getConnection(id: string): ConnectionRecord | undefined {
    return this.connections.get(id);
  }

  public listConnections(): ConnectionRecord[] {
    return Array.from(this.connections.values());
  }

  public listConnectionsByType(type: ConnectionRecord['type']): ConnectionRecord[] {
    return this.listConnections().filter((c) => c.type === type);
  }

  public storeSecret(refUri: string, secretValue: string): Result<void, DomainError> {
    const parsed = this.parseSecretRef(refUri);
    if (!parsed) {
      return err(
        new DomainError(
          'INVALID_SECRET_URI',
          `Invalid secret URI format: ${refUri}. Expected format secret://<domain>/<path>`,
          { uri: refUri }
        )
      );
    }

    this.secretVault.set(refUri, secretValue);
    this.redactor.registerSecret(secretValue);
    return ok(undefined);
  }

  public async resolveSecret(refUri: string): Promise<Result<string, DomainError>> {
    const parsed = this.parseSecretRef(refUri);
    if (!parsed) {
      return err(
        new DomainError(
          'INVALID_SECRET_URI',
          `Invalid secret URI format: ${refUri}`,
          { uri: refUri }
        )
      );
    }

    if (parsed.domain === 'env') {
      const val = process.env[parsed.path];
      if (!val) {
        return err(
          new DomainError(
            'SECRET_NOT_FOUND',
            `Environment variable ${parsed.path} not set for reference ${refUri}`,
            { uri: refUri }
          )
        );
      }
      this.redactor.registerSecret(val);
      return ok(val);
    }

    const stored = this.secretVault.get(refUri);
    if (!stored) {
      return err(
        new DomainError(
          'SECRET_NOT_FOUND',
          `No credential found for secret reference ${refUri}`,
          { uri: refUri }
        )
      );
    }

    return ok(stored);
  }

  public parseSecretRef(uri: string): SecretReference | null {
    if (!uri || !uri.startsWith('secret://')) {
      return null;
    }

    const withoutScheme = uri.slice('secret://'.length);
    const slashIdx = withoutScheme.indexOf('/');
    if (slashIdx === -1) {
      return null;
    }

    const domain = withoutScheme.slice(0, slashIdx);
    const path = withoutScheme.slice(slashIdx + 1);

    if (domain !== 'connections' && domain !== 'env' && domain !== 'vault') {
      return null;
    }

    return {
      scheme: 'secret',
      domain: domain as 'connections' | 'env' | 'vault',
      path,
      rawUri: uri,
    };
  }

  public async validateConnection(id: string): Promise<Result<ConnectionStatus, DomainError>> {
    const conn = this.connections.get(id);
    if (!conn) {
      return err(
        new DomainError('CONNECTION_NOT_FOUND', `Connection ${id} not found`, {
          connectionId: id,
        })
      );
    }

    if (conn.status === 'REVOKED') {
      return ok('REVOKED');
    }

    if (conn.authType === 'NONE') {
      conn.status = 'CONNECTED';
      conn.health = {
        lastCheckedAt: new Date().toISOString(),
        isHealthy: true,
        message: 'No authentication required',
      };
      return ok('CONNECTED');
    }

    if (conn.credentialRef) {
      const secretRes = await this.resolveSecret(conn.credentialRef);
      if (!secretRes.ok) {
        conn.status = 'DISCONNECTED';
        conn.health = {
          lastCheckedAt: new Date().toISOString(),
          isHealthy: false,
          message: secretRes.error.message,
        };
        return ok('DISCONNECTED');
      }

      conn.status = 'CONNECTED';
      conn.health = {
        lastCheckedAt: new Date().toISOString(),
        isHealthy: true,
        message: 'Credential verified in vault/env',
      };
      return ok('CONNECTED');
    }

    return ok(conn.status);
  }

  public async observeExternalRuntimeAuth(
    runtimeId: string,
    cliChecker?: () => Promise<boolean>
  ): Promise<Result<ConnectionRecord, DomainError>> {
    const connId = `conn_runtime_${runtimeId}`;
    let isAuthenticated = false;

    if (cliChecker) {
      try {
        isAuthenticated = await cliChecker();
      } catch {
        isAuthenticated = false;
      }
    }

    const record: ConnectionRecord = {
      id: connId,
      name: `External Runtime Auth: ${runtimeId}`,
      type: 'RUNTIME',
      authType: 'CLI_LOGIN',
      status: isAuthenticated ? 'CONNECTED' : 'DISCONNECTED',
      credentialOwnership: 'RUNTIME_MANAGED',
      health: {
        lastCheckedAt: new Date().toISOString(),
        isHealthy: isAuthenticated,
        message: isAuthenticated
          ? 'External CLI reported authenticated session'
          : 'External CLI session unauthenticated or absent',
      },
      metadata: {
        runtimeId,
        observedAt: new Date().toISOString(),
        opaqueBoundary: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.connections.set(connId, record);
    return ok(record);
  }
}
