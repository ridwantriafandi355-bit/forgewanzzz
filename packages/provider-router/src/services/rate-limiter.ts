interface UsageRecord {
  timestamp: number;
  tokens: number;
}

export class RateLimiter {
  private usageHistory = new Map<string, UsageRecord[]>();
  private readonly windowMs: number;

  constructor(windowMs = 60000) {
    this.windowMs = windowMs;
  }

  recordUsage(providerId: string, tokens: number): void {
    const now = Date.now();
    const history = this.getHistory(providerId);
    history.push({ timestamp: now, tokens });
    this.pruneHistory(providerId, now);
  }

  checkLimit(providerId: string, limits?: { rpm: number; tpm: number }): boolean {
    if (!limits) {
      return true;
    }

    const now = Date.now();
    this.pruneHistory(providerId, now);
    const history = this.getHistory(providerId);

    const currentRpm = history.length;
    const currentTpm = history.reduce((sum, item) => sum + item.tokens, 0);

    return currentRpm <= limits.rpm && currentTpm <= limits.tpm;
  }

  getUsage(providerId: string): { rpm: number; tpm: number } {
    const now = Date.now();
    this.pruneHistory(providerId, now);
    const history = this.getHistory(providerId);

    return {
      rpm: history.length,
      tpm: history.reduce((sum, item) => sum + item.tokens, 0),
    };
  }

  private getHistory(providerId: string): UsageRecord[] {
    let history = this.usageHistory.get(providerId);
    if (!history) {
      history = [];
      this.usageHistory.set(providerId, history);
    }
    return history;
  }

  private pruneHistory(providerId: string, now: number): void {
    const history = this.usageHistory.get(providerId);
    if (!history) return;

    const threshold = now - this.windowMs;
    const filtered = history.filter((entry) => entry.timestamp > threshold);
    this.usageHistory.set(providerId, filtered);
  }
}
