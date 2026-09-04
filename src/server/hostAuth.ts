import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Host-Authentifizierung.
 *
 * Ablauf: Secret per HTTPS an `/api/host/login` -> kurzlebiges Token.
 * Jedes Host-Socket-Event trägt dieses Token; das Secret selbst verlässt
 * den Server nie und wird nie an Teilnehmer ausgeliefert.
 */
export class HostAuth {
  private readonly secretBuffer: Buffer;
  private readonly tokens = new Map<string, number>();
  private cleanupHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    secret: string,
    private readonly ttlMs: number = 8 * 60 * 60 * 1000,
  ) {
    this.secretBuffer = Buffer.from(secret, 'utf8');
  }

  /** Zeitkonstanter Vergleich, damit das Secret nicht erraten werden kann. */
  verifySecret(candidate: unknown): boolean {
    if (typeof candidate !== 'string' || candidate.length === 0) return false;
    const candidateBuffer = Buffer.from(candidate, 'utf8');
    if (candidateBuffer.length !== this.secretBuffer.length) {
      // Trotzdem vergleichen, damit die Laufzeit nicht die Länge verrät.
      timingSafeEqual(this.secretBuffer, this.secretBuffer);
      return false;
    }
    return timingSafeEqual(candidateBuffer, this.secretBuffer);
  }

  issueToken(): string {
    this.cleanupExpired();
    const token = randomBytes(32).toString('base64url');
    this.tokens.set(token, Date.now() + this.ttlMs);
    return token;
  }

  verifyToken(token: unknown): boolean {
    if (typeof token !== 'string' || token.length === 0) return false;
    const expiresAt = this.tokens.get(token);
    if (expiresAt === undefined) return false;
    if (expiresAt < Date.now()) {
      this.tokens.delete(token);
      return false;
    }
    return true;
  }

  revokeToken(token: string): void {
    this.tokens.delete(token);
  }

  cleanupExpired(): void {
    const now = Date.now();
    for (const [token, expiresAt] of this.tokens) {
      if (expiresAt < now) this.tokens.delete(token);
    }
  }

  startCleanup(intervalMs = 15 * 60 * 1000): void {
    this.stopCleanup();
    this.cleanupHandle = setInterval(() => this.cleanupExpired(), intervalMs);
    this.cleanupHandle.unref?.();
  }

  stopCleanup(): void {
    if (this.cleanupHandle) {
      clearInterval(this.cleanupHandle);
      this.cleanupHandle = null;
    }
  }
}
