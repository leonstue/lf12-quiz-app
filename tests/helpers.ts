import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Room, normalizeConfig, type RoomEmitter } from '../src/server/game/Room.js';
import { parseQuiz } from '../src/server/quiz/loader.js';
import { ANSWER_IDS, type AnswerId, type GameConfig, type QuizDefinition } from '../src/shared/types.js';

/** Lädt ein Quiz aus dem Ordner `quizzes/` -- dieselbe Quelle wie im Betrieb. */
export function loadQuizFixture(fileName: string): QuizDefinition {
  const path = resolve(process.cwd(), 'quizzes', fileName);
  return parseQuiz(JSON.parse(readFileSync(path, 'utf8')), fileName.replace(/\.json$/, ''));
}

export const umlQuiz = loadQuizFixture('uml-sequenzdiagramme.json');

export interface Emitted {
  target: string;
  event: string;
  payload: unknown;
}

export function createEmitter(): { emitter: RoomEmitter; events: Emitted[] } {
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

/** Steuerbare Uhr, damit Zeitbonus und Deadlines deterministisch testbar sind. */
export class Clock {
  constructor(public value = 1_000_000) {}
  now = (): number => this.value;
  advance(ms: number): void {
    this.value += ms;
  }
}

export interface MakeRoomResult {
  room: Room;
  events: Emitted[];
  clock: Clock;
}

/** Sammelt erzeugte Räume, damit `afterEach` deren Timer sicher stoppen kann. */
export function createRoomFactory() {
  let rooms: Room[] = [];

  function makeRoom(
    config: Partial<GameConfig> = {},
    clock: Clock = new Clock(),
    quiz: QuizDefinition = umlQuiz,
  ): MakeRoomResult {
    const { emitter, events } = createEmitter();
    const room = new Room({
      code: 'TEST01',
      quiz,
      config: normalizeConfig(
        { questionCount: 3, randomizeQuestions: false, timerPreset: 'standard', ...config },
        quiz.questions.length,
        quiz.id,
      ),
      emitter,
      now: clock.now,
      answerGraceMs: 500,
      autoRevealDelayMs: 1_000,
      autoNextDelayMs: 5_000,
    });
    rooms.push(room);
    return { room, events, clock };
  }

  function destroyAll(): void {
    for (const room of rooms) room.destroy();
    rooms = [];
  }

  return { makeRoom, destroyAll, track: (room: Room) => rooms.push(room) };
}

export function currentQuestionPayload(events: Emitted[]) {
  const started = [...events].reverse().find((entry) => entry.event === 'question_started');
  return started?.payload as { question: { index: number; answers: { id: AnswerId; text: string }[] } };
}

/**
 * Ermittelt den Anzeige-Buchstaben der richtigen Antwort in der laufenden Runde.
 * Nötig, weil der Server die Optionen pro Runde neu mischt.
 */
export function correctDisplayId(room: Room, events: Emitted[]): AnswerId {
  const payload = currentQuestionPayload(events);
  const original = room.quiz.questions.find(
    (question) => question.question === (room.getState().question?.question ?? ''),
  );
  if (!original) throw new Error('Frage nicht gefunden');
  const correctText = original.answers.find((answer) => answer.id === original.correctAnswer)?.text;
  const match = payload.question.answers.find((answer) => answer.text === correctText);
  if (!match) throw new Error('Korrekte Antwort nicht gefunden');
  return match.id;
}

export function wrongDisplayId(correct: AnswerId): AnswerId {
  return ANSWER_IDS.find((id) => id !== correct) as AnswerId;
}
