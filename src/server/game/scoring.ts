/**
 * Punkteberechnung -- ausschließlich serverseitig.
 * Der Client bekommt nur das Ergebnis, niemals die Formel-Eingaben,
 * die er beeinflussen könnte.
 */

export const BASE_POINTS = 1000;
export const MAX_TIME_BONUS = 300;

export interface StreakTier {
  minStreak: number;
  multiplier: number;
}

/** Absteigend sortiert -- der erste Treffer gewinnt. */
export const STREAK_TIERS: readonly StreakTier[] = [
  { minStreak: 5, multiplier: 1.15 },
  { minStreak: 3, multiplier: 1.1 },
  { minStreak: 2, multiplier: 1.05 },
];

/**
 * Multiplikator für die Anzahl aufeinanderfolgender richtiger Antworten
 * inklusive der gerade beantworteten Frage.
 */
export function streakMultiplier(streak: number): number {
  if (!Number.isFinite(streak) || streak < 2) return 1;
  for (const tier of STREAK_TIERS) {
    if (streak >= tier.minStreak) return tier.multiplier;
  }
  return 1;
}

/**
 * Linearer Zeitbonus zwischen 0 und {@link MAX_TIME_BONUS}.
 * `elapsedMs` = Zeit von Rundenstart bis zum Eintreffen der Antwort.
 */
export function timeBonus(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 0;
  const clampedElapsed = Math.min(Math.max(elapsedMs, 0), durationMs);
  const remainingRatio = 1 - clampedElapsed / durationMs;
  return Math.round(MAX_TIME_BONUS * remainingRatio);
}

export interface ScoreInput {
  correct: boolean;
  elapsedMs: number;
  durationMs: number;
  /** Streak VOR dieser Frage. */
  previousStreak: number;
}

export interface ScoreResult {
  points: number;
  basePoints: number;
  timeBonus: number;
  streakMultiplier: number;
  /** Streak NACH dieser Frage. */
  streak: number;
}

/** Berechnet Punkte und neuen Streak für genau eine Antwort. */
export function calculateScore({ correct, elapsedMs, durationMs, previousStreak }: ScoreInput): ScoreResult {
  const safePreviousStreak = Number.isFinite(previousStreak) && previousStreak > 0 ? Math.floor(previousStreak) : 0;

  if (!correct) {
    return { points: 0, basePoints: 0, timeBonus: 0, streakMultiplier: 1, streak: 0 };
  }

  const streak = safePreviousStreak + 1;
  const bonus = timeBonus(elapsedMs, durationMs);
  const multiplier = streakMultiplier(streak);
  // Math.round statt floor: 1300 * 1.15 ergibt in IEEE-754 1494.9999999999998.
  const points = Math.max(0, Math.round((BASE_POINTS + bonus) * multiplier));

  return { points, basePoints: BASE_POINTS, timeBonus: bonus, streakMultiplier: multiplier, streak };
}
