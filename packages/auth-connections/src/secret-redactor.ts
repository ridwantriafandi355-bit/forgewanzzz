export class SecretRedactor {
  private knownSecrets: Set<string> = new Set();
  private sensitiveKeyPattern = /^(password|secret|token|apikey|api_key|authorization|bearer|private_key)$/i;
  
  // Heuristic patterns for common credential formats
  private commonTokenPatterns: RegExp[] = [
    /sk-proj-[a-zA-Z0-9_-]{20,}/g,
    /sk-ant-[a-zA-Z0-9_-]{20,}/g,
    /sk-[a-zA-Z0-9_-]{24,}/g,
    /ghp_[a-zA-Z0-9]{36}/g,
    /gho_[a-zA-Z0-9]{36}/g,
    /xox[baprs]-[0-9a-zA-Z]{10,48}/g,
    /Bearer\s+[a-zA-Z0-9_.\-]{20,}/gi,
  ];

  public registerSecret(secret: string): void {
    if (secret && secret.trim().length >= 4) {
      this.knownSecrets.add(secret.trim());
    }
  }

  public registerSecrets(secrets: string[]): void {
    for (const secret of secrets) {
      this.registerSecret(secret);
    }
  }

  public redact(text: string): string {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let redacted = text;

    // Redact explicitly registered secrets
    for (const secret of this.knownSecrets) {
      if (redacted.includes(secret)) {
        redacted = redacted.split(secret).join('[REDACTED_SECRET]');
      }
    }

    // Redact common token patterns
    for (const pattern of this.commonTokenPatterns) {
      redacted = redacted.replace(pattern, '[REDACTED_TOKEN]');
    }

    return redacted;
  }

  public redactObject<T>(obj: T): T {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.redact(obj) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (this.sensitiveKeyPattern.test(key)) {
          result[key] = '[REDACTED_SECRET]';
        } else {
          result[key] = this.redactObject(value);
        }
      }
      return result as T;
    }

    return obj;
  }
}
