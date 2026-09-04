import { afterEach, describe, expect, it } from 'vitest';

import { correctDisplayId, createRoomFactory, wrongDisplayId } from './helpers.js';

const factory = createRoomFactory();
const makeRoom = factory.makeRoom;

afterEach(() => {
  factory.destroyAll();
});

describe('Auswertung', () => {
  it('ist vor der ersten Auflösung leer', () => {
    const { room } = makeRoom();
    room.addPlayer('Lisa');
    room.start();

    const review = room.buildReview();
    expect(review.playedRounds).toBe(0);
    expect(review.rounds).toHaveLength(0);
    expect(review.players[0].answers).toHaveLength(0);
  });

  it('enthält die laufende Frage nicht', () => {
    const { room, events } = makeRoom({ questionCount: 2 });
    const join = room.addPlayer('Lisa');
    if (!join.ok) throw new Error('unerwartet');

    room.start();
    room.submitAnswer(join.data.id, 0, correctDisplayId(room, events));
    room.reveal();
    room.next();

    const review = room.buildReview();
    expect(review.playedRounds).toBe(1);
    expect(review.rounds.map((round) => round.index)).toEqual([0]);
  });

  it('hält fest, wer was und wie schnell geantwortet hat', () => {
    const { room, events, clock } = makeRoom({ questionCount: 2 });
    const a = room.addPlayer('Anna');
    const b = room.addPlayer('Bert');
    const c = room.addPlayer('Cem');
    if (!a.ok || !b.ok || !c.ok) throw new Error('unerwartet');

    room.start();
    const correct = correctDisplayId(room, events);
    const wrong = wrongDisplayId(correct);

    clock.advance(2_000);
    room.submitAnswer(a.data.id, 0, correct);
    clock.advance(3_000);
    room.submitAnswer(b.data.id, 0, wrong);
    // Cem antwortet gar nicht.
    room.reveal();

    const review = room.buildReview();
    expect(review.code).toBe('TEST01');
    expect(review.playedRounds).toBe(1);
    expect(review.totalRounds).toBe(2);

    const round = review.rounds[0];
    expect(round.correctAnswer).toBe(correct);
    expect(round.answeredCount).toBe(2);
    expect(round.correctCount).toBe(1);
    expect(round.averageElapsedMs).toBe(3_500);
    expect(round.fastestCorrect).toEqual({ nickname: 'Anna', elapsedMs: 2_000 });
    expect(round.answers).toHaveLength(4);
    expect(round.explanation.length).toBeGreaterThan(10);

    const anna = review.players.find((player) => player.nickname === 'Anna');
    expect(anna?.answers[0]).toMatchObject({ answer: correct, correct: true, elapsedMs: 2_000 });
    expect(anna?.answers[0].points).toBeGreaterThan(0);
    expect(anna?.correctCount).toBe(1);
    expect(anna?.answeredCount).toBe(1);
    expect(anna?.averageElapsedMs).toBe(2_000);

    const bert = review.players.find((player) => player.nickname === 'Bert');
    expect(bert?.answers[0]).toMatchObject({ answer: wrong, correct: false, points: 0, elapsedMs: 5_000 });
    expect(bert?.correctCount).toBe(0);

    const cem = review.players.find((player) => player.nickname === 'Cem');
    expect(cem?.answers[0]).toMatchObject({ answer: null, correct: false, points: 0, elapsedMs: null });
    expect(cem?.answeredCount).toBe(0);
    expect(cem?.averageElapsedMs).toBeNull();
  });

  it('liefert je Teilnehmer genau eine Position pro gespielter Runde', () => {
    const { room, events, clock } = makeRoom({ questionCount: 3 });
    const a = room.addPlayer('Anna');
    const b = room.addPlayer('Bert');
    if (!a.ok || !b.ok) throw new Error('unerwartet');

    room.start();
    clock.advance(1_000);
    room.submitAnswer(a.data.id, 0, correctDisplayId(room, events));
    room.next();
    clock.advance(1_000);
    room.submitAnswer(b.data.id, 1, correctDisplayId(room, events));
    room.next();
    room.reveal();

    const review = room.buildReview();
    expect(review.playedRounds).toBe(3);
    for (const player of review.players) {
      expect(player.answers).toHaveLength(3);
    }
  });

  it('sortiert die Teilnehmer nach Punkten', () => {
    const { room, events, clock } = makeRoom({ questionCount: 2 });
    const a = room.addPlayer('Anna');
    const b = room.addPlayer('Bert');
    if (!a.ok || !b.ok) throw new Error('unerwartet');

    room.start();
    const correct = correctDisplayId(room, events);
    clock.advance(1_000);
    room.submitAnswer(b.data.id, 0, correct);
    room.submitAnswer(a.data.id, 0, wrongDisplayId(correct));
    room.reveal();

    const review = room.buildReview();
    expect(review.players[0].nickname).toBe('Bert');
    expect(review.players[0].score).toBeGreaterThan(review.players[1].score);
  });

  it('zeigt die Antwortoptionen in der gemischten Reihenfolge der Runde', () => {
    const { room, events } = makeRoom();
    room.addPlayer('Anna');
    room.start();

    const started = [...events].reverse().find((entry) => entry.event === 'question_started')?.payload as {
      question: { answers: { id: string; text: string }[] };
    };
    room.reveal();

    const review = room.buildReview();
    expect(review.rounds[0].answers.map((answer) => answer.text)).toEqual(
      started.question.answers.map((answer) => answer.text),
    );
  });

  it('meldet ohne Antworten keine Durchschnittszeit', () => {
    const { room } = makeRoom();
    room.addPlayer('Anna');
    room.start();
    room.reveal();

    const review = room.buildReview();
    expect(review.rounds[0].answeredCount).toBe(0);
    expect(review.rounds[0].averageElapsedMs).toBeNull();
    expect(review.rounds[0].fastestCorrect).toBeNull();
  });
});
