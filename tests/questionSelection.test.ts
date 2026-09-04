import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { selectQuestions, shuffle } from '../src/server/game/questionSelection.js';
import { ANSWER_IDS, answerIdsFor } from '../src/shared/types.js';
import { umlQuiz } from './helpers.js';

const QUESTIONS = umlQuiz.questions;
const DEFAULT_QUESTION_IDS = umlQuiz.defaultQuestionIds;
const DEFAULT_COUNT = DEFAULT_QUESTION_IDS.length;

describe('Fragenpool (quizzes/uml-sequenzdiagramme.json)', () => {
  it('enthält die beiden Bildfragen', () => {
    const withImage = QUESTIONS.filter((q) => q.image !== null);
    expect(withImage).toHaveLength(2);
    for (const question of withImage) {
      expect(question.imageAlt?.length ?? 0).toBeGreaterThan(40);
    }
  });

  it('enthält genügend Fragen, alle mit eindeutigen IDs', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
  });

  it('hat pro Frage vier Antworten mit den IDs A-D', () => {
    for (const question of QUESTIONS) {
      expect(question.answers).toHaveLength(4);
      expect(question.answers.map((a) => a.id)).toEqual(answerIdsFor(4));
      for (const answer of question.answers) {
        expect(answer.text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('hat pro Frage genau eine gültige korrekte Antwort und eine Erklärung', () => {
    for (const question of QUESTIONS) {
      expect(ANSWER_IDS).toContain(question.correctAnswer);
      expect(question.answers.filter((a) => a.id === question.correctAnswer)).toHaveLength(1);
      expect(question.explanation.trim().length).toBeGreaterThan(10);
    }
  });

  it('verwendet 20 s bzw. 25 s, wo keine eigene Dauer angegeben ist', () => {
    // Die Rohdatei sagt, welche Frage eine eigene Dauer setzt.
    const raw = JSON.parse(readFileSync(resolve('quizzes', 'uml-sequenzdiagramme.json'), 'utf8')) as {
      questions: { id: string; durationSeconds?: number }[];
    };
    const explicit = new Map(raw.questions.map((q) => [q.id, q.durationSeconds]));

    for (const question of QUESTIONS) {
      const own = explicit.get(question.id);
      if (own === undefined) {
        expect(question.durationSeconds).toBe(question.difficulty === 3 ? 25 : 20);
      } else {
        expect(question.durationSeconds).toBe(own);
      }
      expect(question.durationSeconds).toBeGreaterThanOrEqual(5);
      expect(question.durationSeconds).toBeLessThanOrEqual(300);
    }
  });

  it('enthält keine doppelten Antworttexte innerhalb einer Frage', () => {
    for (const question of QUESTIONS) {
      const texts = question.answers.map((a) => a.text.toLowerCase().trim());
      expect(new Set(texts).size).toBe(4);
    }
  });
});

describe('shuffle', () => {
  it('behält alle Elemente ohne Duplikate', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (let i = 0; i < 100; i += 1) {
      const result = shuffle(input);
      expect(result).toHaveLength(input.length);
      expect(new Set(result).size).toBe(input.length);
      expect([...result].sort((a, b) => a - b)).toEqual(input);
    }
  });

  it('verändert das Original nicht', () => {
    const input = [1, 2, 3];
    shuffle(input);
    expect(input).toEqual([1, 2, 3]);
  });
});

describe('selectQuestions', () => {
  it('nutzt standardmäßig die kuratierte Liste', () => {
    const selected = selectQuestions({
      count: DEFAULT_COUNT,
      randomize: false,
      pool: QUESTIONS,
      defaultIds: DEFAULT_QUESTION_IDS,
    });
    expect(selected.map((q) => q.id)).toEqual([...DEFAULT_QUESTION_IDS]);
  });

  it('liefert die gewünschte Anzahl ohne Duplikate -- auch zufällig', () => {
    for (const count of [5, 10, DEFAULT_COUNT, 15, 20, QUESTIONS.length]) {
      for (const randomize of [false, true]) {
        const selected = selectQuestions({ count, randomize, pool: QUESTIONS, defaultIds: DEFAULT_QUESTION_IDS });
        expect(selected).toHaveLength(count);
        expect(new Set(selected.map((q) => q.id)).size).toBe(count);
      }
    }
  });

  it('füllt über die Standardauswahl hinaus duplikatfrei auf', () => {
    const count = DEFAULT_COUNT + 6;
    const selected = selectQuestions({ count, randomize: false, pool: QUESTIONS, defaultIds: DEFAULT_QUESTION_IDS });
    expect(selected).toHaveLength(count);
    expect(new Set(selected.map((q) => q.id)).size).toBe(count);
    // Die kuratierte Liste steht vorn, danach wird aus dem Rest ergaenzt.
    expect(selected.slice(0, DEFAULT_COUNT).map((q) => q.id)).toEqual([...DEFAULT_QUESTION_IDS]);
  });

  it('begrenzt die Anzahl auf die Poolgröße', () => {
    expect(selectQuestions({ count: 999, randomize: true, pool: QUESTIONS, defaultIds: DEFAULT_QUESTION_IDS })).toHaveLength(QUESTIONS.length);
    expect(selectQuestions({ count: 999, randomize: false, pool: QUESTIONS, defaultIds: DEFAULT_QUESTION_IDS })).toHaveLength(QUESTIONS.length);
  });

  it('ist robust gegen unsinnige Anzahlen', () => {
    expect(selectQuestions({ count: 0, randomize: false, pool: QUESTIONS, defaultIds: DEFAULT_QUESTION_IDS })).toHaveLength(1);
    expect(selectQuestions({ count: -5, randomize: true, pool: QUESTIONS, defaultIds: DEFAULT_QUESTION_IDS })).toHaveLength(1);
    expect(selectQuestions({ count: Number.NaN, randomize: false, pool: QUESTIONS, defaultIds: DEFAULT_QUESTION_IDS })).toHaveLength(1);
  });

  it('mischt bei randomize=true tatsächlich', () => {
    const size = QUESTIONS.length;
    const first = selectQuestions({ count: size, randomize: true, pool: QUESTIONS, defaultIds: DEFAULT_QUESTION_IDS })
      .map((q) => q.id)
      .join(',');
    const orders = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      orders.add(
        selectQuestions({ count: size, randomize: true, pool: QUESTIONS, defaultIds: DEFAULT_QUESTION_IDS })
          .map((q) => q.id)
          .join(','),
      );
    }
    orders.add(first);
    expect(orders.size).toBeGreaterThan(1);
  });
});
