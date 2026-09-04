import { describe, expect, it } from 'vitest';

import { selectQuestions, shuffle } from '../src/server/game/questionSelection.js';
import { ANSWER_IDS, answerIdsFor } from '../src/shared/types.js';
import { umlQuiz } from './helpers.js';

const QUESTIONS = umlQuiz.questions;
const DEFAULT_QUESTION_IDS = umlQuiz.defaultQuestionIds;

describe('Fragenpool (quizzes/uml-sequenzdiagramme.json)', () => {
  it('enthält 30 Fragen mit eindeutigen IDs', () => {
    expect(QUESTIONS).toHaveLength(30);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(30);
  });

  it('hat pro Frage genau vier Antworten mit den IDs A-D', () => {
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

  it('verwendet 20 s bzw. 25 s für schwere Fragen', () => {
    for (const question of QUESTIONS) {
      expect(question.durationSeconds).toBe(question.difficulty === 3 ? 25 : 20);
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
    const selected = selectQuestions({ count: 12, randomize: false, pool: QUESTIONS, defaultIds: DEFAULT_QUESTION_IDS });
    expect(selected.map((q) => q.id)).toEqual([...DEFAULT_QUESTION_IDS]);
  });

  it('liefert die gewünschte Anzahl ohne Duplikate -- auch zufällig', () => {
    for (const count of [5, 10, 12, 15, 20, 30]) {
      for (const randomize of [false, true]) {
        const selected = selectQuestions({ count, randomize, pool: QUESTIONS, defaultIds: DEFAULT_QUESTION_IDS });
        expect(selected).toHaveLength(count);
        expect(new Set(selected.map((q) => q.id)).size).toBe(count);
      }
    }
  });

  it('füllt bei mehr als 12 Fragen duplikatfrei auf', () => {
    const selected = selectQuestions({ count: 20, randomize: false, pool: QUESTIONS, defaultIds: DEFAULT_QUESTION_IDS });
    expect(selected).toHaveLength(20);
    expect(new Set(selected.map((q) => q.id)).size).toBe(20);
    expect(selected.slice(0, 12).map((q) => q.id)).toEqual([...DEFAULT_QUESTION_IDS]);
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
    const first = selectQuestions({ count: 30, randomize: true, pool: QUESTIONS, defaultIds: DEFAULT_QUESTION_IDS }).map((q) => q.id).join(',');
    const orders = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      orders.add(selectQuestions({ count: 30, randomize: true, pool: QUESTIONS, defaultIds: DEFAULT_QUESTION_IDS }).map((q) => q.id).join(','));
    }
    orders.add(first);
    expect(orders.size).toBeGreaterThan(1);
  });
});
