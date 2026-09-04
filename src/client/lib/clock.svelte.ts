/**
 * Countdown, der ausschließlich der Serverzeit folgt.
 * Der Client interpoliert nur zwischen zwei `timer_sync`-Events.
 */
export class GameClock {
  remainingMs = $state(0);
  durationMs = $state(0);
  running = $state(false);

  private offsetMs = 0;
  private deadlineMs: number | null = null;
  private handle: ReturnType<typeof setInterval> | null = null;

  sync(serverTimeMs: number, deadlineMs: number, durationMs: number): void {
    this.offsetMs = serverTimeMs - Date.now();
    this.deadlineMs = deadlineMs;
    this.durationMs = durationMs;
    this.running = true;
    this.update();
    if (!this.handle) {
      this.handle = setInterval(() => this.update(), 100);
    }
  }

  private update(): void {
    if (this.deadlineMs === null) return;
    const estimatedServerNow = Date.now() + this.offsetMs;
    this.remainingMs = Math.max(0, this.deadlineMs - estimatedServerNow);
    if (this.remainingMs <= 0) this.running = false;
  }

  get remainingSeconds(): number {
    return Math.ceil(this.remainingMs / 1000);
  }

  get progress(): number {
    if (this.durationMs <= 0) return 0;
    return Math.min(1, Math.max(0, this.remainingMs / this.durationMs));
  }

  stop(): void {
    this.running = false;
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = null;
    }
  }

  reset(): void {
    this.stop();
    this.deadlineMs = null;
    this.remainingMs = 0;
    this.durationMs = 0;
  }
}
