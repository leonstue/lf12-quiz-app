import type { GameConfig, QuizDefinition } from '../../shared/types.js';
import { createLogger } from '../logger.js';
import type { QuizRegistry } from '../quiz/loader.js';
import { Room, normalizeConfig, type RoomEmitter } from './Room.js';
import { generateUniqueRoomCode, normalizeRoomCode } from './roomCode.js';

const log = createLogger('games');

export interface GameManagerOptions {
  emitter: RoomEmitter;
  quizzes: QuizRegistry;
  publicBaseUrl?: string | null;
  maxRooms?: number;
  maxPlayers?: number;
  answerGraceMs?: number;
  roomTtlMs?: number;
}

/** Hält alle laufenden Sessions im Speicher. Bewusst ohne Datenbank. */
export class GameManager {
  private readonly rooms = new Map<string, Room>();
  private readonly options: Required<Omit<GameManagerOptions, 'emitter' | 'quizzes'>> & {
    emitter: RoomEmitter;
    quizzes: QuizRegistry;
  };
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(options: GameManagerOptions) {
    this.options = {
      emitter: options.emitter,
      quizzes: options.quizzes,
      publicBaseUrl: options.publicBaseUrl ?? null,
      maxRooms: options.maxRooms ?? 50,
      maxPlayers: options.maxPlayers ?? 300,
      answerGraceMs: options.answerGraceMs ?? 750,
      roomTtlMs: options.roomTtlMs ?? 4 * 60 * 60 * 1000,
    };
  }

  get size(): number {
    return this.rooms.size;
  }

  /** Löst die gewünschte Quiz-id auf; ohne Treffer wird das erste Quiz verwendet. */
  resolveQuiz(quizId: unknown): QuizDefinition {
    const quiz = this.options.quizzes.get(quizId) ?? this.options.quizzes.first();
    if (!quiz) {
      throw new Error('Es ist kein Quiz verfügbar. Bitte eine JSON-Datei im Ordner "quizzes" ablegen.');
    }
    return quiz;
  }

  createRoom(config: GameConfig): Room {
    if (this.rooms.size >= this.options.maxRooms) {
      this.sweep(true);
    }
    if (this.rooms.size >= this.options.maxRooms) {
      throw new Error('Es sind bereits zu viele Quiz-Sessions aktiv.');
    }

    const quiz = this.resolveQuiz((config as Partial<GameConfig> | undefined)?.quizId);
    const code = generateUniqueRoomCode((candidate) => this.rooms.has(candidate));
    const room = new Room({
      code,
      quiz,
      config: normalizeConfig(config, quiz.questions.length, quiz.id),
      emitter: this.options.emitter,
      publicBaseUrl: this.options.publicBaseUrl,
      maxPlayers: this.options.maxPlayers,
      answerGraceMs: this.options.answerGraceMs,
    });
    this.rooms.set(code, room);
    log.info('Raum erstellt', { room: code, quiz: quiz.id, config: room.config, rounds: room.totalRounds });
    return room;
  }

  getRoom(rawCode: unknown): Room | undefined {
    return this.rooms.get(normalizeRoomCode(rawCode));
  }

  closeRoom(code: string, reason = 'Die Session wurde beendet.'): boolean {
    const room = this.rooms.get(code);
    if (!room) return false;
    this.options.emitter.toRoom(code, 'room_closed', { reason });
    room.destroy();
    this.rooms.delete(code);
    log.info('Raum geschlossen', { room: code, reason });
    return true;
  }

  /** Entfernt abgelaufene Sessions. `aggressive` räumt auch beendete Spiele. */
  sweep(aggressive = false): number {
    const now = Date.now();
    let removed = 0;
    for (const [code, room] of this.rooms) {
      const expired = now - room.lastActivity > this.options.roomTtlMs;
      const finishedAndIdle = aggressive && room.phase === 'FINISHED';
      if (expired || finishedAndIdle) {
        this.closeRoom(code, 'Die Session wurde wegen Inaktivität beendet.');
        removed += 1;
      }
    }
    return removed;
  }

  startSweeper(intervalMs = 5 * 60 * 1000): void {
    this.stopSweeper();
    this.sweeper = setInterval(() => this.sweep(), intervalMs);
    this.sweeper.unref?.();
  }

  stopSweeper(): void {
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = null;
    }
  }

  /** Beendet alle Sessions -- wird von `make reset` implizit über den Neustart erreicht. */
  destroyAll(): void {
    for (const code of [...this.rooms.keys()]) {
      this.closeRoom(code, 'Der Server wurde neu gestartet.');
    }
    this.stopSweeper();
  }

  listRooms(): { code: string; quiz: string; phase: string; players: number; rounds: number }[] {
    return [...this.rooms.values()].map((room) => ({
      code: room.code,
      quiz: room.quiz.id,
      phase: room.phase,
      players: room.playerCount,
      rounds: room.totalRounds,
    }));
  }
}
