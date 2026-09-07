import { describe, it, expect, beforeEach } from 'vitest';
import { SecretRedactor, ConnectionManager, ConnectionRecord } from '../src/index.js';

describe('Auth & Connections Subsystem (10-AUTH-CONNECTIONS.md)', () => {
  let redactor: SecretRedactor;
  let manager: ConnectionManager;

  beforeEach(() => {
    redactor = new SecretRedactor();
    manager = new ConnectionManager(redactor);
  });

  describe('SecretRedactor', () => {
    it('redacts explicitly registered secrets in arbitrary text', () => {
      redactor.registerSecret('super-secret-key-12345');
      const text = 'Execution output with super-secret-key-12345 included.';
      const scrubbed = redactor.redact(text);
      expect(scrubbed).toBe('Execution output with [REDACTED_SECRET] included.');
    });

    it('redacts common heuristic token formats automatically', () => {
      const text = 'Authorization: Bearer my-very-long-secret-bearer-token-1234567890';
      const scrubbed = redactor.redact(text);
      expect(scrubbed).toContain('[REDACTED_TOKEN]');
      expect(scrubbed).not.toContain('my-very-long-secret-bearer-token-1234567890');
    });

    it('deep-redacts sensitive object keys in audit logs and events', () => {
      const payload = {
        task_id: 'tsk_001',
        apiKey: 'raw-api-key-value',
        nested: {
          password: 'db-super-password',
          safe_field: 'all good',
        },
      };

      const sanitized = redactor.redactObject(payload);
      expect(sanitized.apiKey).toBe('[REDACTED_SECRET]');
      expect(sanitized.nested.password).toBe('[REDACTED_SECRET]');
      expect(sanitized.nested.safe_field).toBe('all good');
    });
  });

  describe('ConnectionManager', () => {
    it('registers and retrieves connections with explicit type and ownership', () => {
      const conn: ConnectionRecord = {
        id: 'conn_anthropic_main',
        name: 'Anthropic Production',
        type: 'PROVIDER',
        authType: 'API_KEY',
        status: 'CONFIGURED',
        credentialOwnership: 'FORGE_MANAGED',
        credentialRef: 'secret://connections/conn_anthropic_main/key',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = manager.registerConnection(conn);
      expect(result.ok).toBe(true);

      const retrieved = manager.getConnection('conn_anthropic_main');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Anthropic Production');
      expect(retrieved?.type).toBe('PROVIDER');
    });

    it('stores and resolves secret references securely without leaking raw strings', async () => {
      const refUri = 'secret://connections/conn_openai/key';
      manager.storeSecret(refUri, 'sk-proj-123456789012345678901234567890');

      const resolved = await manager.resolveSecret(refUri);
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.value).toBe('sk-proj-123456789012345678901234567890');
      }

      // Redactor should now automatically mask this secret in outputs
      const logText = 'Attempting call with sk-proj-123456789012345678901234567890';
      expect(redactor.redact(logText)).toContain('[REDACTED_SECRET]');
    });

    it('validates connection status based on credential availability', async () => {
      const conn: ConnectionRecord = {
        id: 'conn_test',
        name: 'Test API',
        type: 'PROVIDER',
        authType: 'API_KEY',
        status: 'CONFIGURED',
        credentialOwnership: 'USER_MANAGED',
        credentialRef: 'secret://connections/conn_test/key',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      manager.registerConnection(conn);

      // Prior to storing secret, validation fails
      const status1 = await manager.validateConnection('conn_test');
      expect(status1.ok).toBe(true);
      expect(status1.value).toBe('DISCONNECTED');

      // After storing secret, validation succeeds
      manager.storeSecret('secret://connections/conn_test/key', 'valid-api-key-test');
      const status2 = await manager.validateConnection('conn_test');
      expect(status2.ok).toBe(true);
      expect(status2.value).toBe('CONNECTED');
    });

    it('observes opaque external runtime authentication (L1) without claiming credential possession', async () => {
      const obsRes = await manager.observeExternalRuntimeAuth('claude-code', async () => true);
      expect(obsRes.ok).toBe(true);
      if (obsRes.ok) {
        expect(obsRes.value.type).toBe('RUNTIME');
        expect(obsRes.value.credentialOwnership).toBe('RUNTIME_MANAGED');
        expect(obsRes.value.status).toBe('CONNECTED');
        expect(obsRes.value.metadata?.opaqueBoundary).toBe(true);
      }
    });
  });
});
