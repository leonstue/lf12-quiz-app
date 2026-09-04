/** Sehr schlanker In-Memory Token-Bucket pro Schlüssel (z. B. IP oder Socket-ID). */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private cleanupHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** `true`, wenn die Aktion erlaubt ist. */
  take(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count += 1;
    return true;
  }

  remaining(key: string, now = Date.now()): number {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) return this.limit;
    return Math.max(0, this.limit - entry.count);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  cleanup(now = Date.now()): void {
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }

  startCleanup(intervalMs = 60_000): void {
    this.stopCleanup();
    this.cleanupHandle = setInterval(() => this.cleanup(), intervalMs);
    this.cleanupHandle.unref?.();
  }

  stopCleanup(): void {
    if (this.cleanupHandle) {
      clearInterval(this.cleanupHandle);
      this.cleanupHandle = null;
    }
  }
}
