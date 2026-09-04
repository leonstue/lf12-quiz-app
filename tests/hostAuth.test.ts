import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostAuth } from '../src/server/hostAuth.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('HostAuth.verifySecret', () => {
  const auth = new HostAuth('super-geheimes-secret');

  it('akzeptiert das korrekte Secret', () => {
    expect(auth.verifySecret('super-geheimes-secret')).toBe(true);
  });

  it('lehnt falsche Secrets ab', () => {
    expect(auth.verifySecret('falsch')).toBe(false);
    expect(auth.verifySecret('super-geheimes-secreT')).toBe(false);
    expect(auth.verifySecret('super-geheimes-secret ')).toBe(false);
  });

  it('lehnt Nicht-Strings und leere Eingaben ab', () => {
    expect(auth.verifySecret('')).toBe(false);
    expect(auth.verifySecret(undefined)).toBe(false);
    expect(auth.verifySecret(null)).toBe(false);
    expect(auth.verifySecret(12345)).toBe(false);
    expect(auth.verifySecret({ secret: 'super-geheimes-secret' })).toBe(false);
    expect(auth.verifySecret(['super-geheimes-secret'])).toBe(false);
  });
});

describe('HostAuth Tokens', () => {
  it('gibt gültige Tokens aus und akzeptiert nur diese', () => {
    const auth = new HostAuth('secret-value');
    const token = auth.issueToken();

    expect(token.length).toBeGreaterThan(20);
    expect(auth.verifyToken(token)).toBe(true);
    expect(auth.verifyToken('irgendein-token')).toBe(false);
    expect(auth.verifyToken('')).toBe(false);
    expect(auth.verifyToken(undefined)).toBe(false);
    expect(auth.verifyToken(null)).toBe(false);
    expect(auth.verifyToken(42)).toBe(false);
  });

  it('erzeugt bei jedem Login ein neues Token', () => {
    const auth = new HostAuth('secret-value');
    const tokens = new Set([auth.issueToken(), auth.issueToken(), auth.issueToken()]);
    expect(tokens.size).toBe(3);
  });

  it('widerruft Tokens', () => {
    const auth = new HostAuth('secret-value');
    const token = auth.issueToken();
    auth.revokeToken(token);
    expect(auth.verifyToken(token)).toBe(false);
  });

  it('lässt Tokens nach Ablauf der TTL verfallen', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));

    const auth = new HostAuth('secret-value', 60_000);
    const token = auth.issueToken();
    expect(auth.verifyToken(token)).toBe(true);

    vi.setSystemTime(new Date('2026-01-01T10:00:59Z'));
    expect(auth.verifyToken(token)).toBe(true);

    vi.setSystemTime(new Date('2026-01-01T10:01:01Z'));
    expect(auth.verifyToken(token)).toBe(false);
  });
});
