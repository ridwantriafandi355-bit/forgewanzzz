export type ConnectionType =
  | 'PROVIDER'
  | 'RUNTIME'
  | 'TOOL'
  | 'INFRASTRUCTURE'
  | 'MCP'
  | 'DATABASE'
  | 'CLOUD';

export type AuthType =
  | 'API_KEY'
  | 'OAUTH2'
  | 'DEVICE_CODE'
  | 'CLI_LOGIN'
  | 'LOCAL_SOCKET'
  | 'BASIC_AUTH'
  | 'BEARER_TOKEN'
  | 'SSH_KEY'
  | 'CERTIFICATE'
  | 'NONE'
  | 'CUSTOM';

export type ConnectionStatus =
  | 'CONFIGURED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DEGRADED'
  | 'EXPIRED'
  | 'REAUTH_REQUIRED'
  | 'REVOKED'
  | 'DISCONNECTED'
  | 'ERROR';

export type CredentialOwnership =
  | 'FORGE_MANAGED'
  | 'USER_MANAGED'
  | 'RUNTIME_MANAGED'
  | 'EXTERNAL_PROVIDER_MANAGED';

export interface ConnectionHealth {
  lastCheckedAt: string;
  isHealthy: boolean;
  message?: string;
}

export interface ConnectionRecord {
  id: string;
  name: string;
  type: ConnectionType;
  authType: AuthType;
  status: ConnectionStatus;
  credentialOwnership: CredentialOwnership;
  credentialRef?: string; // e.g. "secret://connections/anthropic/key"
  scopes?: string[];
  targetEndpoint?: string;
  health?: ConnectionHealth;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SecretReference {
  scheme: 'secret';
  domain: 'connections' | 'env' | 'vault';
  path: string;
  rawUri: string;
}
