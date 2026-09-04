import { afterEach, describe, expect, it, vi } from 'vitest';

import { Clock, createRoomFactory } from './helpers.js';

const factory = createRoomFactory();
const makeRoom = factory.makeRoom;

afterEach(() => {
  factory.destroyAll();
  vi.useRealTimers();
});

describe('Automatik: aus', () => {
  it('plant ohne autoAdvance keinen Schritt', () => {
    const { room } = makeRoom();
    room.addPlayer('Lisa');
    room.start();
    room.lock();

    expect(room.getState().pendingAction).toBeNull();
    expect(room.getState().pendingAtMs).toBeNull();
    expect(room.phase).toBe('LOCKED');
  });

  it('bleibt ohne autoAdvance auch nach langer Zeit stehen', () => {
    vi.useFakeTimers();
    const { room } = makeRoom();
    room.addPlayer('Lisa');
    room.start();
    room.lock();

    vi.advanceTimersByTime(60_000);
    expect(room.phase).toBe('LOCKED');
  });
});

describe('Automatik: an', () => {
  it('löst nach dem Sperren auf und schaltet danach weiter', () => {
    vi.useFakeTimers();
    const { room, events } = makeRoom({ questionCount: 2, autoAdvance: true });
    room.addPlayer('Lisa');

    room.start();
    room.lock();
    expect(room.getState().pendingAction).toBe('reveal');

    vi.advanceTimersByTime(1_000);
    expect(room.phase).toBe('REVEAL');
    expect(events.some((entry) => entry.event === 'reveal_answer')).toBe(true);

    expect(room.getState().pendingAction).toBe('next');
    vi.advanceTimersByTime(5_000);
    expect(room.phase).toBe('QUESTION');
    expect(room.getState().roundIndex).toBe(1);
  });

  it('beendet das Spiel nach der letzten Runde', () => {
    vi.useFakeTimers();
    const { room } = makeRoom({ questionCount: 1, autoAdvance: true });
    room.addPlayer('Lisa');
    room.start();
    room.lock();

    vi.advanceTimersByTime(1_000);
    expect(room.phase).toBe('REVEAL');
    expect(room.getState().pendingAction).toBe('finish');

    vi.advanceTimersByTime(5_000);
    expect(room.phase).toBe('FINISHED');
  });

  it('greift auch, wenn alle Teilnehmer vorzeitig geantwortet haben', () => {
    vi.useFakeTimers();
    const { room, events } = makeRoom({ questionCount: 2, autoAdvance: true });
    const join = room.addPlayer('Lisa');
    if (!join.ok) throw new Error('unerwartet');

    room.start();
    const payload = [...events].reverse().find((e) => e.event === 'question_started')?.payload as {
      question: { answers: { id: string }[] };
    };
    room.submitAnswer(join.data.id, 0, payload.question.answers[0].id);

    // Alle haben geantwortet -> Runde gesperrt -> Automatik plant die Auflösung.
    expect(room.phase).toBe('LOCKED');
    expect(room.getState().pendingAction).toBe('reveal');
    vi.advanceTimersByTime(1_000);
    expect(room.phase).toBe('REVEAL');
  });

  it('lässt manuelle Aktionen immer gewinnen', () => {
    vi.useFakeTimers();
    const { room } = makeRoom({ questionCount: 2, autoAdvance: true });
    room.addPlayer('Lisa');
    room.start();
    room.lock();
    expect(room.getState().pendingAction).toBe('reveal');

    room.reveal();
    expect(room.phase).toBe('REVEAL');

    room.next();
    expect(room.getState().roundIndex).toBe(1);

    // Der zuvor geplante Schritt darf nicht nachträglich feuern.
    vi.advanceTimersByTime(30_000);
    expect(room.getState().roundIndex).toBe(1);
  });

  it('kann angehalten und fortgesetzt werden', () => {
    vi.useFakeTimers();
    const { room } = makeRoom({ questionCount: 2, autoAdvance: true });
    room.addPlayer('Lisa');
    room.start();
    room.lock();

    room.setAutoPaused(true);
    expect(room.isAutoPaused).toBe(true);
    expect(room.getState().autoPaused).toBe(true);
    expect(room.getState().pendingAction).toBeNull();

    vi.advanceTimersByTime(30_000);
    expect(room.phase).toBe('LOCKED');

    room.setAutoPaused(false);
    expect(room.getState().pendingAction).toBe('reveal');
    vi.advanceTimersByTime(1_000);
    expect(room.phase).toBe('REVEAL');
  });

  it('plant im angehaltenen Zustand auch nach einem Reveal nichts', () => {
    vi.useFakeTimers();
    const { room } = makeRoom({ questionCount: 2, autoAdvance: true });
    room.addPlayer('Lisa');
    room.start();
    room.setAutoPaused(true);
    room.reveal();

    expect(room.getState().pendingAction).toBeNull();
    vi.advanceTimersByTime(30_000);
    expect(room.phase).toBe('REVEAL');
  });

  it('meldet den Zeitpunkt des nächsten Schritts in Serverzeit', () => {
    vi.useFakeTimers();
    const clock = new Clock();
    const { room } = makeRoom({ autoAdvance: true }, clock);
    room.addPlayer('Lisa');
    room.start();
    room.lock();

    expect(room.getState().pendingAtMs).toBe(clock.value + 1_000);
  });

  it('verwirft geplante Schritte beim Beenden des Spiels', () => {
    vi.useFakeTimers();
    const { room } = makeRoom({ questionCount: 3, autoAdvance: true });
    room.addPlayer('Lisa');
    room.start();
    room.lock();

    room.end();
    expect(room.phase).toBe('FINISHED');
    expect(room.getState().pendingAction).toBeNull();

    vi.advanceTimersByTime(30_000);
    expect(room.phase).toBe('FINISHED');
  });
});
