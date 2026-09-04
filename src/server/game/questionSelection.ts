import { randomInt } from 'node:crypto';

import type { QuizQuestion } from '../../shared/types.js';

/** Fisher-Yates mit kryptographischer Zufallsquelle. */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface SelectionOptions {
  count: number;
  randomize: boolean;
  /** Fragenpool des gewählten Quiz. */
  pool: readonly QuizQuestion[];
  /** Kuratierte Reihenfolge des Quiz, wenn nicht gemischt wird. */
  defaultIds?: readonly string[];
}

/**
 * Wählt die Fragen einer Partie aus.
 *
 * - `randomize = true`: zufällige, duplikatfreie Auswahl aus dem Pool
 * - `randomize = false`: kuratierte Standardliste, bei Bedarf aufgefüllt
 *   bzw. gekürzt -- ebenfalls immer duplikatfrei
 */
export function selectQuestions({ count, randomize, pool, defaultIds = [] }: SelectionOptions): QuizQuestion[] {
  if (pool.length === 0) return [];
  const size = Math.min(Math.max(Math.floor(count) || 0, 1), pool.length);

  if (randomize) {
    return shuffle(pool).slice(0, size);
  }

  const byId = new Map(pool.map((q) => [q.id, q]));
  const selected: QuizQuestion[] = [];
  const used = new Set<string>();

  for (const id of defaultIds) {
    if (selected.length >= size) break;
    const question = byId.get(id);
    if (question && !used.has(question.id)) {
      selected.push(question);
      used.add(question.id);
    }
  }

  // Auffüllen in Pool-Reihenfolge, falls mehr Fragen gewünscht sind
  // als die kuratierte Liste hergibt.
  for (const question of pool) {
    if (selected.length >= size) break;
    if (!used.has(question.id)) {
      selected.push(question);
      used.add(question.id);
    }
  }

  return selected;
}
