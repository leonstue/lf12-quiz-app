import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Room, normalizeConfig, type RoomEmitter } from '../src/server/game/Room.js';
import { QUESTIONS } from '../src/shared/questions.js';
import { ANSWER_IDS, type AnswerId, type GameConfig } from '../src/shared/types.js';

interface Emitted {
  target: string;
  event: string;
  payload: unknown;
}

function createEmitter(): { emitter: RoomEmitter; events: Emitted[] } {
  const events: Emitted[] = [];
  return {
    events,
    emitter: {
      toRoom(code, event, payload) {
        events.push({ target: `room:${code}`, event, payload });
      },
      toPlayer(playerId, event, payload) {
        events.push({ target: `player:${playerId}`, event, payload });
      },
    },
  };
}

class Clock {
  constructor(public value = 1_000_000) {}
  now = (): number => this.value;
  advance(ms: number): void {
    this.value += ms;
  }
}

let rooms: Room[] = [];

function makeRoom(config: Partial<GameConfig> = {}, clock = new Clock()) {
  const { emitter, events } = createEmitter();
  const room = new Room({
    code: 'TEST01',
    config: normalizeConfig({ questionCount: 3, randomizeQuestions: false, timerPreset: 'standard', ...config }),
    emitter,
    now: clock.now,
    answerGraceMs: 500,
  });
  rooms.push(room);
  return { room, events, clock };
}

/** Findet die aktuell korrekte Anzeige-Antwort über das Reveal-Event. */
function currentQuestionPayload(events: Emitted[]) {
  const started = [...events].reverse().find((entry) => entry.event === 'question_started');
  return started?.payload as { question: { index: number; answers: { id: AnswerId; text: string }[] } };
}

function correctDisplayId(room: Room, events: Emitted[]): AnswerId {
  const payload = currentQuestionPayload(events);
  const original = QUESTIONS.find(
    (question) => question.question === (room.getState().question?.question ?? ''),
  );
  if (!original) throw new Error('Frage nicht gefunden');
  const correctText = original.answers.find((answer) => answer.id === original.correctAnswer)?.text;
  const match = payload.question.answers.find((answer) => answer.text === correctText);
  if (!match) throw new Error('Korrekte Antwort nicht gefunden');
  return match.id;
}

function wrongDisplayId(correct: AnswerId): AnswerId {
  return ANSWER_IDS.find((id) => id !== correct) as AnswerId;
}

beforeEach(() => {
  rooms = [];
});

afterEach(() => {
  for (const room of rooms) room.destroy();
  rooms = [];
});

describe('Beitritt und Nicknames', () => {
  it('nimmt Teilnehmer auf und vergibt Token', () => {
    const { room } = makeRoom();
    const result = room.addPlayer('Lisa');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nickname).toBe('Lisa');
    expect(result.data.token.length).toBeGreaterThan(10);
    expect(room.playerCount).toBe(1);
  });

  it('lehnt doppelte Nicknames ab -- auch mit anderer Schreibweise', () => {
    const { room } = makeRoom();
    expect(room.addPlayer('Lisa').ok).toBe(true);

    const duplicate = room.addPlayer('Lisa');
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.error.code).toBe('NICKNAME_TAKEN');

    const casing = room.addPlayer('  lIsA ');
    expect(casing.ok).toBe(false);
    expect(room.playerCount).toBe(1);
  });

  it('erlaubt den Nickname nach dem Entfernen wieder', () => {
    const { room } = makeRoom();
    const first = room.addPlayer('Lisa');
    if (!first.ok) throw new Error('unerwartet');
    room.removePlayer(first.data.id);
    expect(room.addPlayer('Lisa').ok).toBe(true);
  });

  it('lehnt ungültige Nicknames ab', () => {
    const { room } = makeRoom();
    for (const invalid of ['', ' ', 'x', null, undefined, 42, {}]) {
      const result = room.addPlayer(invalid);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NICKNAME_INVALID');
    }
  });

  it('verweigert den Beitritt nach dem Start', () => {
    const { room } = makeRoom();
    room.addPlayer('Lisa');
    room.start();
    const late = room.addPlayer('Tom');
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.code).toBe('GAME_ALREADY_STARTED');
  });

  it('respektiert die maximale Teilnehmerzahl', () => {
    const { emitter } = createEmitter();
    const room = new Room({ code: 'FULL01', config: normalizeConfig({}), emitter, maxPlayers: 2 });
    rooms.push(room);
    expect(room.addPlayer('A1').ok).toBe(true);
    expect(room.addPlayer('B2').ok).toBe(true);
    const third = room.addPlayer('C3');
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error.code).toBe('ROOM_FULL');
  });
});

describe('Reconnect', () => {
  it('stellt Nickname, Score und Streak über den Token wieder her', () => {
    const { room, events, clock } = makeRoom();
    const join = room.addPlayer('Lisa');
    if (!join.ok) throw new Error('unerwartet');

    room.start();
    const correct = correctDisplayId(room, events);
    clock.advance(2_000);
    room.submitAnswer(join.data.id, 0, correct);
    room.reveal();

    const restored = room.reconnectPlayer(join.data.token);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.data.id).toBe(join.data.id);
    expect(restored.data.nickname).toBe('Lisa');
    expect(restored.data.score).toBeGreaterThan(0);
    expect(restored.data.streak).toBe(1);
  });

  it('ignoriert die verspaetete Trennung des alten Sockets nach einem Reconnect', () => {
    const { room, events } = makeRoom();
    const join = room.addPlayer('Lisa', 'socket-alt');
    if (!join.ok) throw new Error('unerwartet');

    // Handy verbindet sich neu, bevor der Server den alten Socket ausgetimet hat.
    room.reconnectPlayer(join.data.token, 'socket-neu');
    expect(join.data.connected).toBe(true);

    // Jetzt laeuft der alte Socket in den Ping-Timeout.
    const before = events.length;
    room.markDisconnected(join.data.id, 'socket-alt');

    expect(join.data.connected).toBe(true);
    expect(events.slice(before).some((entry) => entry.event === 'player_left')).toBe(false);
  });

  it('markiert den Spieler als getrennt, wenn der aktuelle Socket wegfaellt', () => {
    const { room } = makeRoom();
    const join = room.addPlayer('Lisa', 'socket-alt');
    if (!join.ok) throw new Error('unerwartet');

    room.markDisconnected(join.data.id, 'socket-alt');
    expect(join.data.connected).toBe(false);
  });

  it('behaelt Punkte und Streak ueber eine Trennung hinweg', () => {
    const { room, events, clock } = makeRoom({ questionCount: 3 });
    const join = room.addPlayer('Lisa', 'socket-alt');
    if (!join.ok) throw new Error('unerwartet');

    room.start();
    const correct = correctDisplayId(room, events);
    clock.advance(1_500);
    room.submitAnswer(join.data.id, 0, correct);
    room.reveal();

    const score = join.data.score;
    expect(score).toBeGreaterThan(0);

    room.markDisconnected(join.data.id, 'socket-alt');
    expect(join.data.connected).toBe(false);
    expect(join.data.score).toBe(score);

    const restored = room.reconnectPlayer(join.data.token, 'socket-neu');
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.data.connected).toBe(true);
    expect(restored.data.score).toBe(score);
    expect(restored.data.streak).toBe(1);
  });

  it('stellt eine bereits abgegebene Antwort nach dem Reconnect wieder her', () => {
    const { room, events } = makeRoom();
    const join = room.addPlayer('Lisa', 'socket-alt');
    if (!join.ok) throw new Error('unerwartet');

    room.start();
    const correct = correctDisplayId(room, events);
    room.submitAnswer(join.data.id, 0, correct);

    room.markDisconnected(join.data.id, 'socket-alt');
    room.reconnectPlayer(join.data.token, 'socket-neu');

    // Der Server kennt die Wahl weiterhin -- der Client bekommt sie nachgeliefert.
    expect(room.getSubmittedAnswer(join.data.id)).toBe(correct);
    // Und es darf keine zweite Antwort geben.
    const second = room.submitAnswer(join.data.id, 0, wrongDisplayId(correct));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('ALREADY_ANSWERED');
  });

  it('lehnt unbekannte Token ab', () => {
    const { room } = makeRoom();
    for (const token of ['', 'kurz', 'ein-voellig-falsches-token', null, undefined, 1234]) {
      const result = room.reconnectPlayer(token);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNKNOWN_PLAYER');
    }
  });
});

describe('Antwortannahme', () => {
  it('akzeptiert genau eine Antwort pro Spieler und Runde', () => {
    const { room, events } = makeRoom();
    const join = room.addPlayer('Lisa');
    if (!join.ok) throw new Error('unerwartet');
    room.start();

    const correct = correctDisplayId(room, events);
    expect(room.submitAnswer(join.data.id, 0, correct).ok).toBe(true);

    const second = room.submitAnswer(join.data.id, 0, wrongDisplayId(correct));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('ALREADY_ANSWERED');
  });

  it('lehnt Antworten nach der Deadline ab', () => {
    const { room, events, clock } = makeRoom();
    const a = room.addPlayer('Lisa');
    const b = room.addPlayer('Tom');
    if (!a.ok || !b.ok) throw new Error('unerwartet');
    room.start();
    const correct = correctDisplayId(room, events);

    // 20 s Frage + 500 ms Kulanz
    clock.advance(20_000 + 400);
    expect(room.submitAnswer(a.data.id, 0, correct).ok).toBe(true);

    clock.advance(300);
    const late = room.submitAnswer(b.data.id, 0, correct);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.code).toBe('ANSWER_CLOSED');
  });

  it('lehnt Antworten außerhalb der Frage-Phase ab', () => {
    const { room, events } = makeRoom();
    const join = room.addPlayer('Lisa');
    if (!join.ok) throw new Error('unerwartet');

    const beforeStart = room.submitAnswer(join.data.id, 0, 'A');
    expect(beforeStart.ok).toBe(false);

    room.start();
    const correct = correctDisplayId(room, events);
    room.reveal();
    const afterReveal = room.submitAnswer(join.data.id, 0, correct);
    expect(afterReveal.ok).toBe(false);
    if (!afterReveal.ok) expect(afterReveal.error.code).toBe('ANSWER_CLOSED');
  });

  it('lehnt manipulierte Payloads ab, ohne zu crashen', () => {
    const { room } = makeRoom();
    const join = room.addPlayer('Lisa');
    if (!join.ok) throw new Error('unerwartet');
    room.start();

    const invalidAnswers: unknown[] = ['E', '', 'a', null, undefined, 0, {}, [], '<script>'];
    for (const answer of invalidAnswers) {
      const result = room.submitAnswer(join.data.id, 0, answer);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_PAYLOAD');
    }

    const invalidRounds: unknown[] = [1, -1, 1.5, '0', null, undefined, {}];
    for (const roundIndex of invalidRounds) {
      const result = room.submitAnswer(join.data.id, roundIndex, 'A');
      expect(result.ok).toBe(false);
    }

    expect(room.answeredCount).toBe(0);
  });

  it('lehnt Antworten unbekannter Spieler ab', () => {
    const { room } = makeRoom();
    room.addPlayer('Lisa');
    room.start();
    const result = room.submitAnswer('gibt-es-nicht', 0, 'A');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNKNOWN_PLAYER');
  });
});

describe('Antwortreihenfolge', () => {
  it('mischt die Antworten und behält alle Texte duplikatfrei', () => {
    const seenOrders = new Set<string>();

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const { room, events } = makeRoom();
      room.addPlayer('Lisa');
      room.start();

      const payload = currentQuestionPayload(events);
      const ids = payload.question.answers.map((answer) => answer.id);
      expect(ids).toEqual([...ANSWER_IDS]);

      const texts = payload.question.answers.map((answer) => answer.text);
      expect(new Set(texts).size).toBe(4);

      const original = QUESTIONS.find((question) => question.id === '1');
      expect(new Set(original?.answers.map((answer) => answer.text))).toEqual(new Set(texts));

      seenOrders.add(texts.join('|'));
      room.destroy();
    }

    expect(seenOrders.size).toBeGreaterThan(1);
  });

  it('liefert die korrekte Antwort nicht vor dem Reveal aus', () => {
    const { room, events } = makeRoom();
    room.addPlayer('Lisa');
    room.start();

    const serialized = JSON.stringify(events.filter((entry) => entry.event !== 'reveal_answer'));
    expect(serialized).not.toContain('correctAnswer');
    expect(serialized).not.toContain('explanation');
    expect(JSON.stringify(room.getState())).not.toContain('correctAnswer');
  });
});

describe('Punktevergabe im Raum', () => {
  it('vergibt Punkte nur für richtige Antworten und pflegt Streaks', () => {
    const { room, events, clock } = makeRoom({ questionCount: 3 });
    const a = room.addPlayer('Lisa');
    const b = room.addPlayer('Tom');
    if (!a.ok || !b.ok) throw new Error('unerwartet');

    room.start();
    let correct = correctDisplayId(room, events);
    clock.advance(1_000);
    room.submitAnswer(a.data.id, 0, correct);
    room.submitAnswer(b.data.id, 0, wrongDisplayId(correct));
    room.reveal();

    expect(a.data.score).toBeGreaterThan(0);
    expect(a.data.streak).toBe(1);
    expect(b.data.score).toBe(0);
    expect(b.data.streak).toBe(0);

    room.next();
    correct = correctDisplayId(room, events);
    clock.advance(1_000);
    room.submitAnswer(a.data.id, 1, correct);
    room.reveal();

    expect(a.data.streak).toBe(2);
    // Zweite richtige Antwort in Folge -> Multiplikator 1.05
    expect(a.data.score).toBeGreaterThan(2 * 1_000);
  });

  it('wertet nicht abgegebene Antworten als falsch', () => {
    const { room } = makeRoom();
    const join = room.addPlayer('Lisa');
    if (!join.ok) throw new Error('unerwartet');
    room.start();
    room.reveal();
    expect(join.data.score).toBe(0);
    expect(join.data.streak).toBe(0);
  });

  it('berechnet die Antwortverteilung inklusive Prozentwerten', () => {
    const { room, events } = makeRoom();
    const a = room.addPlayer('Lisa');
    const b = room.addPlayer('Tom');
    if (!a.ok || !b.ok) throw new Error('unerwartet');
    room.start();
    const correct = correctDisplayId(room, events);
    room.submitAnswer(a.data.id, 0, correct);
    room.submitAnswer(b.data.id, 0, correct);
    room.reveal();

    const reveal = [...events].reverse().find((entry) => entry.event === 'reveal_answer')?.payload as {
      distribution: { id: AnswerId; count: number; percent: number; correct: boolean }[];
      totalAnswers: number;
      correctAnswer: AnswerId;
    };

    expect(reveal.totalAnswers).toBe(2);
    expect(reveal.correctAnswer).toBe(correct);
    const correctEntry = reveal.distribution.find((entry) => entry.id === correct);
    expect(correctEntry?.count).toBe(2);
    expect(correctEntry?.percent).toBe(100);
    expect(reveal.distribution.filter((entry) => entry.correct)).toHaveLength(1);
  });
});

describe('Ablaufsteuerung', () => {
  it('durchläuft die Zustände LOBBY -> QUESTION -> REVEAL -> FINISHED', () => {
    const { room } = makeRoom({ questionCount: 2 });
    room.addPlayer('Lisa');
    expect(room.phase).toBe('LOBBY');

    room.start();
    expect(room.phase).toBe('QUESTION');

    room.reveal();
    expect(room.phase).toBe('REVEAL');

    room.showLeaderboard();
    expect(room.phase).toBe('LEADERBOARD');

    room.next();
    expect(room.phase).toBe('QUESTION');

    room.next();
    expect(room.phase).toBe('FINISHED');
  });

  it('verhindert doppeltes Starten', () => {
    const { room } = makeRoom();
    room.addPlayer('Lisa');
    expect(room.start().ok).toBe(true);
    const again = room.start();
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('INVALID_STATE');
  });

  it('sperrt die Runde, sobald alle geantwortet haben', () => {
    const { room, events } = makeRoom();
    const a = room.addPlayer('Lisa');
    const b = room.addPlayer('Tom');
    if (!a.ok || !b.ok) throw new Error('unerwartet');
    room.start();
    const correct = correctDisplayId(room, events);

    room.submitAnswer(a.data.id, 0, correct);
    expect(room.phase).toBe('QUESTION');
    room.submitAnswer(b.data.id, 0, correct);
    expect(room.phase).toBe('LOCKED');
  });

  it('löst vor dem Weiterschalten automatisch auf', () => {
    const { room, events } = makeRoom({ questionCount: 2 });
    const join = room.addPlayer('Lisa');
    if (!join.ok) throw new Error('unerwartet');
    room.start();
    const correct = correctDisplayId(room, events);
    room.submitAnswer(join.data.id, 0, correct);

    room.next();
    expect(events.some((entry) => entry.event === 'reveal_answer')).toBe(true);
    expect(join.data.score).toBeGreaterThan(0);
  });

  it('beendet das Spiel über end()', () => {
    const { room, events } = makeRoom({ questionCount: 5 });
    room.addPlayer('Lisa');
    room.start();
    room.end();
    expect(room.phase).toBe('FINISHED');
    expect(events.some((entry) => entry.event === 'game_finished')).toBe(true);
  });

  it('lehnt Aktionen in falschen Zuständen ab', () => {
    const { room } = makeRoom();
    expect(room.reveal().ok).toBe(false);
    expect(room.next().ok).toBe(false);
    expect(room.showLeaderboard().ok).toBe(false);
  });
});

describe('Leaderboard', () => {
  it('sortiert nach Punkten und liefert höchstens zehn Einträge', () => {
    const { room, events, clock } = makeRoom({ questionCount: 2 });
    const players = Array.from({ length: 12 }, (_, index) => {
      const result = room.addPlayer(`Spieler${index + 1}`);
      if (!result.ok) throw new Error('unerwartet');
      return result.data;
    });

    room.start();
    const correct = correctDisplayId(room, events);
    players.forEach((player, index) => {
      clock.advance(200);
      if (index % 2 === 0) room.submitAnswer(player.id, 0, correct);
    });
    room.reveal();

    const board = room.buildLeaderboard(10);
    expect(board).toHaveLength(10);
    expect(board[0].rank).toBe(1);
    for (let i = 1; i < board.length; i += 1) {
      expect(board[i - 1].score).toBeGreaterThanOrEqual(board[i].score);
    }
  });

  it('berechnet Positionsveränderungen', () => {
    const { room, events, clock } = makeRoom({ questionCount: 3 });
    const a = room.addPlayer('Anna');
    const b = room.addPlayer('Bert');
    if (!a.ok || !b.ok) throw new Error('unerwartet');

    room.start();
    let correct = correctDisplayId(room, events);
    clock.advance(500);
    room.submitAnswer(a.data.id, 0, correct);
    room.reveal();
    room.next();

    correct = correctDisplayId(room, events);
    clock.advance(500);
    room.submitAnswer(b.data.id, 1, correct);
    room.submitAnswer(a.data.id, 1, wrongDisplayId(correct));
    room.reveal();

    const board = room.buildLeaderboard(10);
    for (const entry of board) {
      expect(entry.delta === null || Number.isInteger(entry.delta)).toBe(true);
    }
    expect(board.map((entry) => entry.nickname)).toContain('Anna');
    expect(board.map((entry) => entry.nickname)).toContain('Bert');
  });
});

describe('normalizeConfig', () => {
  it('setzt sinnvolle Defaults', () => {
    expect(normalizeConfig(undefined)).toEqual({
      questionCount: 12,
      randomizeQuestions: false,
      timerPreset: 'standard',
    });
  });

  it('begrenzt und säubert manipulierte Werte', () => {
    expect(normalizeConfig({ questionCount: 9999, randomizeQuestions: 'ja', timerPreset: 'turbo' })).toEqual({
      questionCount: 30,
      randomizeQuestions: false,
      timerPreset: 'standard',
    });
    expect(normalizeConfig({ questionCount: -5 }).questionCount).toBe(1);
    expect(normalizeConfig({ questionCount: Number.NaN }).questionCount).toBe(12);
  });

  it('übernimmt gültige Werte', () => {
    expect(normalizeConfig({ questionCount: 15, randomizeQuestions: true, timerPreset: 'fast' })).toEqual({
      questionCount: 15,
      randomizeQuestions: true,
      timerPreset: 'fast',
    });
  });
});

describe('Timer-Presets', () => {
  it('verwendet die Preset-Dauer statt der Fragendauer', () => {
    for (const [preset, expected] of [
      ['relaxed', 30],
      ['fast', 12],
    ] as const) {
      const { room, events } = makeRoom({ timerPreset: preset });
      room.addPlayer('Lisa');
      room.start();
      const payload = [...events].reverse().find((entry) => entry.event === 'question_started')?.payload as {
        question: { durationSeconds: number };
      };
      expect(payload.question.durationSeconds).toBe(expected);
      room.destroy();
    }
  });

  it('nutzt bei standard die pro Frage hinterlegte Dauer', () => {
    const { room, events } = makeRoom({ timerPreset: 'standard' });
    room.addPlayer('Lisa');
    room.start();
    const payload = [...events].reverse().find((entry) => entry.event === 'question_started')?.payload as {
      question: { durationSeconds: number };
    };
    expect([20, 25]).toContain(payload.question.durationSeconds);
  });
});
