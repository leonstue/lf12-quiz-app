import { describe, expect, it } from 'vitest';

import { RateLimiter } from '../src/server/rateLimit.js';

describe('RateLimiter', () => {
  it('erlaubt Anfragen bis zum Limit', () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.take('ip-1', 0)).toBe(true);
    expect(limiter.take('ip-1', 10)).toBe(true);
    expect(limiter.take('ip-1', 20)).toBe(true);
    expect(limiter.take('ip-1', 30)).toBe(false);
  });

  it('zählt Schlüssel unabhängig voneinander', () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.take('ip-1', 0)).toBe(true);
    expect(limiter.take('ip-2', 0)).toBe(true);
    expect(limiter.take('ip-1', 0)).toBe(false);
  });

  it('setzt das Fenster nach Ablauf zurück', () => {
    const limiter = new RateLimiter(2, 1_000);
    expect(limiter.take('ip-1', 0)).toBe(true);
    expect(limiter.take('ip-1', 100)).toBe(true);
    expect(limiter.take('ip-1', 200)).toBe(false);
    expect(limiter.take('ip-1', 1_100)).toBe(true);
  });

  it('meldet verbleibende Kontingente', () => {
    const limiter = new RateLimiter(5, 1_000);
    expect(limiter.remaining('ip-1', 0)).toBe(5);
    limiter.take('ip-1', 0);
    limiter.take('ip-1', 0);
    expect(limiter.remaining('ip-1', 0)).toBe(3);
    expect(limiter.remaining('ip-1', 2_000)).toBe(5);
  });

  it('räumt abgelaufene Einträge auf', () => {
    const limiter = new RateLimiter(1, 500);
    limiter.take('ip-1', 0);
    limiter.cleanup(1_000);
    expect(limiter.take('ip-1', 1_000)).toBe(true);
  });

  it('kann einzelne Schlüssel zurücksetzen', () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.take('ip-1', 0);
    expect(limiter.take('ip-1', 0)).toBe(false);
    limiter.reset('ip-1');
    expect(limiter.take('ip-1', 0)).toBe(true);
  });
});
