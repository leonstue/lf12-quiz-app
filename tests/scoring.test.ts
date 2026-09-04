import { describe, expect, it } from 'vitest';

import {
  BASE_POINTS,
  MAX_TIME_BONUS,
  calculateScore,
  streakMultiplier,
  timeBonus,
} from '../src/server/game/scoring.js';

describe('timeBonus', () => {
  it('gibt den vollen Bonus für eine sofortige Antwort', () => {
    expect(timeBonus(0, 20_000)).toBe(MAX_TIME_BONUS);
  });

  it('gibt keinen Bonus am Ende der Zeit', () => {
    expect(timeBonus(20_000, 20_000)).toBe(0);
  });

  it('skaliert linear mit der verbleibenden Zeit', () => {
    expect(timeBonus(10_000, 20_000)).toBe(150);
    expect(timeBonus(5_000, 20_000)).toBe(225);
    expect(timeBonus(15_000, 20_000)).toBe(75);
  });

  it('klemmt Werte außerhalb des gültigen Bereichs', () => {
    expect(timeBonus(-5_000, 20_000)).toBe(MAX_TIME_BONUS);
    expect(timeBonus(999_999, 20_000)).toBe(0);
  });

  it('ist robust gegen ungültige Eingaben', () => {
    expect(timeBonus(Number.NaN, 20_000)).toBe(0);
    expect(timeBonus(1_000, 0)).toBe(0);
    expect(timeBonus(1_000, -5)).toBe(0);
  });
});

describe('streakMultiplier', () => {
  it('greift erst ab zwei richtigen Antworten', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(1)).toBe(1);
    expect(streakMultiplier(2)).toBe(1.05);
  });

  it('steigt auf den nächsten Stufen', () => {
    expect(streakMultiplier(3)).toBe(1.1);
    expect(streakMultiplier(4)).toBe(1.1);
    expect(streakMultiplier(5)).toBe(1.15);
    expect(streakMultiplier(12)).toBe(1.15);
  });

  it('ist robust gegen ungültige Eingaben', () => {
    expect(streakMultiplier(Number.NaN)).toBe(1);
    expect(streakMultiplier(-3)).toBe(1);
  });
});

describe('calculateScore', () => {
  it('vergibt Basispunkte plus Zeitbonus ohne Streak', () => {
    const result = calculateScore({ correct: true, elapsedMs: 10_000, durationMs: 20_000, previousStreak: 0 });
    expect(result.basePoints).toBe(BASE_POINTS);
    expect(result.timeBonus).toBe(150);
    expect(result.streakMultiplier).toBe(1);
    expect(result.points).toBe(1150);
    expect(result.streak).toBe(1);
  });

  it('wendet den Streak-Multiplikator auf Basis plus Zeitbonus an', () => {
    const result = calculateScore({ correct: true, elapsedMs: 0, durationMs: 20_000, previousStreak: 1 });
    // (1000 + 300) * 1.05 = 1365
    expect(result.streak).toBe(2);
    expect(result.streakMultiplier).toBe(1.05);
    expect(result.points).toBe(1365);
  });

  it('nutzt die höchste erreichte Streak-Stufe', () => {
    const result = calculateScore({ correct: true, elapsedMs: 0, durationMs: 20_000, previousStreak: 4 });
    // (1000 + 300) * 1.15 = 1495
    expect(result.streak).toBe(5);
    expect(result.points).toBe(1495);
  });

  it('setzt den Streak bei einer falschen Antwort zurück und vergibt 0 Punkte', () => {
    const result = calculateScore({ correct: false, elapsedMs: 1_000, durationMs: 20_000, previousStreak: 4 });
    expect(result.points).toBe(0);
    expect(result.streak).toBe(0);
    expect(result.timeBonus).toBe(0);
    expect(result.streakMultiplier).toBe(1);
  });

  it('vergibt niemals negative Punkte', () => {
    const cases = [
      calculateScore({ correct: false, elapsedMs: 50_000, durationMs: 20_000, previousStreak: 0 }),
      calculateScore({ correct: true, elapsedMs: 50_000, durationMs: 20_000, previousStreak: 0 }),
      calculateScore({ correct: true, elapsedMs: 0, durationMs: 0, previousStreak: -5 }),
    ];
    for (const result of cases) {
      expect(result.points).toBeGreaterThanOrEqual(0);
    }
  });

  it('liefert ganzzahlige Punkte', () => {
    const result = calculateScore({ correct: true, elapsedMs: 3_333, durationMs: 20_000, previousStreak: 2 });
    expect(Number.isInteger(result.points)).toBe(true);
  });
});
