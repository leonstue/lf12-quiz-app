import { afterEach, describe, expect, it } from 'vitest';

import { parseQuiz } from '../src/server/quiz/loader.js';
import { answerIdsFor, type QuizDefinition } from '../src/shared/types.js';
import { createRoomFactory, currentQuestionPayload } from './helpers.js';

const factory = createRoomFactory();

afterEach(() => {
  factory.destroyAll();
});

/** Quiz mit genau einer Frage und der gewünschten Antwortanzahl. */
function quizWith(answerCount: number, correct = 'A'): QuizDefinition {
  return parseQuiz(
    {
      id: 'flex',
      name: 'Flex',
      questions: [
        {
          id: '1',
          category: 'Test',
          difficulty: 1,
          question: `Frage mit ${answerCount} Antworten?`,
          answers: Array.from({ length: answerCount }, (_, index) => ({
            id: 'ABCDEF'[index],
            text: `Antwort ${index + 1}`,
          })),
          correctAnswer: correct,
          explanation: 'Eine ausreichend lange Erklärung für den Test.',
        },
      ],
    },
    'flex',
  );
}

describe('Variable Antwortanzahl', () => {
  it('liefert genau so viele Optionen wie die Frage hat', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const { room, events } = factory.makeRoom({ questionCount: 1 }, undefined, quizWith(count));
      room.addPlayer('Lisa');
      room.start();

      const payload = currentQuestionPayload(events);
      expect(payload.question.answers).toHaveLength(count);
      expect(payload.question.answers.map((answer) => answer.id)).toEqual(answerIdsFor(count));
      room.destroy();
    }
  });

  it('behält bei zwei Antworten beide Texte', () => {
    const { room, events } = factory.makeRoom({ questionCount: 1 }, undefined, quizWith(2));
    room.addPlayer('Lisa');
    room.start();

    const texts = currentQuestionPayload(events).question.answers.map((answer) => answer.text);
    expect(new Set(texts)).toEqual(new Set(['Antwort 1', 'Antwort 2']));
  });

  it('lehnt Buchstaben ab, die es in dieser Runde nicht gibt', () => {
    const { room } = factory.makeRoom({ questionCount: 1 }, undefined, quizWith(2));
    const join = room.addPlayer('Lisa');
    if (!join.ok) throw new Error('unerwartet');
    room.start();

    for (const invalid of ['C', 'D', 'E', 'F']) {
      const result = room.submitAnswer(join.data.id, 0, invalid);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_PAYLOAD');
    }
    expect(room.submitAnswer(join.data.id, 0, 'B').ok).toBe(true);
  });

  it('akzeptiert bei sechs Antworten auch E und F', () => {
    const { room } = factory.makeRoom({ questionCount: 1 }, undefined, quizWith(6));
    const join = room.addPlayer('Lisa');
    if (!join.ok) throw new Error('unerwartet');
    room.start();
    expect(room.submitAnswer(join.data.id, 0, 'F').ok).toBe(true);
  });

  it('baut die Verteilung nur über die vorhandenen Optionen', () => {
    const { room, events } = factory.makeRoom({ questionCount: 1 }, undefined, quizWith(3));
    const join = room.addPlayer('Lisa');
    if (!join.ok) throw new Error('unerwartet');
    room.start();
    room.submitAnswer(join.data.id, 0, 'A');
    room.reveal();

    const reveal = [...events].reverse().find((entry) => entry.event === 'reveal_answer')?.payload as {
      distribution: { id: string }[];
      correctAnswer: string;
    };
    expect(reveal.distribution).toHaveLength(3);
    expect(reveal.distribution.map((entry) => entry.id)).toEqual(['A', 'B', 'C']);
    expect(['A', 'B', 'C']).toContain(reveal.correctAnswer);
  });

  it('wertet die richtige Antwort auch bei zwei Optionen korrekt', () => {
    const { room, events } = factory.makeRoom({ questionCount: 1 }, undefined, quizWith(2));
    const a = room.addPlayer('Anna');
    const b = room.addPlayer('Bert');
    if (!a.ok || !b.ok) throw new Error('unerwartet');
    room.start();

    // Anhand des Textes ermitteln, welcher Buchstabe in dieser Runde richtig ist.
    const payload = currentQuestionPayload(events);
    const correctId = payload.question.answers.find((answer) => answer.text === 'Antwort 1')?.id;
    if (!correctId) throw new Error('Antwort nicht gefunden');
    const wrongId = correctId === 'A' ? 'B' : 'A';

    room.submitAnswer(a.data.id, 0, correctId);
    room.submitAnswer(b.data.id, 0, wrongId);
    room.reveal();

    expect(a.data.score).toBeGreaterThan(0);
    expect(b.data.score).toBe(0);
  });
});

describe('Bild an der Frage', () => {
  it('liefert eine URL unter /quiz-media/ aus', () => {
    const quiz = parseQuiz(
      {
        id: 'bild',
        name: 'Bild',
        questions: [
          {
            id: '1',
            category: 'Test',
            difficulty: 1,
            question: 'Was zeigt das Diagramm?',
            image: 'ordner/diagramm.svg',
            imageAlt: 'Ein Diagramm',
            answers: [
              { id: 'A', text: 'Eins' },
              { id: 'B', text: 'Zwei' },
            ],
            correctAnswer: 'A',
            explanation: 'Eine ausreichend lange Erklärung für den Test.',
          },
        ],
      },
      'bild',
    );

    const { room, events } = factory.makeRoom({ questionCount: 1 }, undefined, quiz);
    room.addPlayer('Lisa');
    room.start();

    const payload = currentQuestionPayload(events) as unknown as {
      question: { imageUrl: string | null; imageAlt: string | null };
    };
    expect(payload.question.imageUrl).toBe('/quiz-media/ordner/diagramm.svg');
    expect(payload.question.imageAlt).toBe('Ein Diagramm');
  });

  it('liefert null, wenn die Frage kein Bild hat', () => {
    const { room, events } = factory.makeRoom({ questionCount: 1 }, undefined, quizWith(4));
    room.addPlayer('Lisa');
    room.start();

    const payload = currentQuestionPayload(events) as unknown as { question: { imageUrl: string | null } };
    expect(payload.question.imageUrl).toBeNull();
  });
});
