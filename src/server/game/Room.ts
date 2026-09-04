import { randomBytes, randomUUID } from 'node:crypto';

import type {
  AnswerDistributionEntry,
  AnswerId,
  GameConfig,
  GamePhase,
  LeaderboardEntry,
  PersonalRoundResult,
  PlayerPublic,
  PublicQuestion,
  QuizAnswer,
  QuizQuestion,
  RoomState,
  SocketError,
} from '../../shared/types.js';
import { ANSWER_IDS, TIMER_PRESET_SECONDS } from '../../shared/types.js';
import { createLogger } from '../logger.js';
import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, nicknameKey, sanitizeNickname } from './nickname.js';
import { selectQuestions, shuffle } from './questionSelection.js';
import { calculateScore } from './scoring.js';

const log = createLogger('room');

export type RoomResult<T> = { ok: true; data: T } | { ok: false; error: SocketError };

function fail(code: SocketError['code'], message: string): { ok: false; error: SocketError } {
  return { ok: false, error: { code, message } };
}

export interface Player {
  id: string;
  token: string;
  nickname: string;
  key: string;
  score: number;
  streak: number;
  connected: boolean;
  joinedAt: number;
  lastSeen: number;
}

interface SubmittedAnswer {
  answer: AnswerId;
  atMs: number;
}

interface Round {
  index: number;
  question: QuizQuestion;
  /** Anzeige-Buchstabe -> Original-Buchstabe der Frage. */
  displayToOriginal: Record<AnswerId, AnswerId>;
  displayAnswers: QuizAnswer[];
  correctDisplayId: AnswerId;
  durationMs: number;
  startedAtMs: number;
  deadlineMs: number;
  answers: Map<string, SubmittedAnswer>;
  results: Map<string, PersonalRoundResult>;
  revealed: boolean;
}

/** Alles, was der Raum nach außen meldet. Wird vom Socket-Layer implementiert. */
export interface RoomEmitter {
  toRoom(code: string, event: string, payload: unknown): void;
  toPlayer(playerId: string, event: string, payload: unknown): void;
}

export interface RoomOptions {
  code: string;
  config: GameConfig;
  emitter: RoomEmitter;
  publicBaseUrl?: string | null;
  maxPlayers?: number;
  answerGraceMs?: number;
  now?: () => number;
  /** Alternativer Fragenpool (Tests). */
  pool?: readonly QuizQuestion[];
}

export class Room {
  readonly code: string;
  readonly createdAt: number;

  config: GameConfig;
  phase: GamePhase = 'LOBBY';
  lastActivity: number;

  private readonly emitter: RoomEmitter;
  private readonly publicBaseUrl: string | null;
  private readonly maxPlayers: number;
  private readonly answerGraceMs: number;
  private readonly now: () => number;
  private readonly pool?: readonly QuizQuestion[];

  private readonly players = new Map<string, Player>();
  private readonly tokenIndex = new Map<string, string>();

  private questions: QuizQuestion[] = [];
  private rounds: Round[] = [];
  private currentRound: Round | null = null;
  private roundIndex = -1;

  /** Rangliste zu Beginn der laufenden Runde -- Basis für die Delta-Anzeige. */
  private ranksBeforeRound = new Map<string, number>();

  private tickHandle: ReturnType<typeof setInterval> | null = null;

  constructor(options: RoomOptions) {
    this.code = options.code;
    this.emitter = options.emitter;
    this.publicBaseUrl = options.publicBaseUrl ?? null;
    this.maxPlayers = options.maxPlayers ?? 300;
    this.answerGraceMs = options.answerGraceMs ?? 750;
    this.now = options.now ?? (() => Date.now());
    this.pool = options.pool;
    this.config = normalizeConfig(options.config, options.pool?.length);
    this.createdAt = this.now();
    this.lastActivity = this.createdAt;
    this.questions = selectQuestions({
      count: this.config.questionCount,
      randomize: this.config.randomizeQuestions,
      ...(this.pool ? { pool: this.pool } : {}),
    });
  }

  // ---------------------------------------------------------------- Teilnehmer

  get playerCount(): number {
    return this.players.size;
  }

  get totalRounds(): number {
    return this.questions.length;
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  getPlayerByToken(token: string): Player | undefined {
    if (typeof token !== 'string') return undefined;
    const id = this.tokenIndex.get(token);
    return id ? this.players.get(id) : undefined;
  }

  addPlayer(rawNickname: unknown): RoomResult<Player> {
    if (this.phase !== 'LOBBY') {
      return fail('GAME_ALREADY_STARTED', 'Das Quiz läuft bereits. Ein Beitritt ist nicht mehr möglich.');
    }
    if (this.players.size >= this.maxPlayers) {
      return fail('ROOM_FULL', 'Dieser Raum ist voll.');
    }

    const nickname = sanitizeNickname(rawNickname);
    if (!nickname) {
      return fail(
        'NICKNAME_INVALID',
        `Bitte einen Nickname mit ${NICKNAME_MIN_LENGTH} bis ${NICKNAME_MAX_LENGTH} Zeichen wählen.`,
      );
    }

    const key = nicknameKey(nickname);
    for (const existing of this.players.values()) {
      if (existing.key === key) {
        return fail('NICKNAME_TAKEN', 'Dieser Nickname ist in diesem Raum bereits vergeben.');
      }
    }

    const player: Player = {
      id: randomUUID(),
      token: randomBytes(24).toString('base64url'),
      nickname,
      key,
      score: 0,
      streak: 0,
      connected: true,
      joinedAt: this.now(),
      lastSeen: this.now(),
    };

    this.players.set(player.id, player);
    this.tokenIndex.set(player.token, player.id);
    this.touch();

    log.info('Teilnehmer beigetreten', { room: this.code, players: this.players.size });
    this.emitter.toRoom(this.code, 'player_joined', this.toPublicPlayer(player));
    this.broadcastState();

    return { ok: true, data: player };
  }

  reconnectPlayer(token: unknown): RoomResult<Player> {
    if (typeof token !== 'string' || token.length < 8) {
      return fail('UNKNOWN_PLAYER', 'Ungültiges Spieler-Token.');
    }
    const player = this.getPlayerByToken(token);
    if (!player) {
      return fail('UNKNOWN_PLAYER', 'Die Sitzung ist abgelaufen. Bitte erneut beitreten.');
    }
    player.connected = true;
    player.lastSeen = this.now();
    this.touch();
    this.broadcastState();
    return { ok: true, data: player };
  }

  markDisconnected(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.connected = false;
    player.lastSeen = this.now();
    this.emitter.toRoom(this.code, 'player_left', { playerId, playerCount: this.players.size });
    this.broadcastState();
  }

  removePlayer(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    this.players.delete(playerId);
    this.tokenIndex.delete(player.token);
    this.currentRound?.answers.delete(playerId);
    this.emitter.toRoom(this.code, 'player_left', { playerId, playerCount: this.players.size });
    this.broadcastState();
    return true;
  }

  // -------------------------------------------------------------- Spielablauf

  start(): RoomResult<{ started: true }> {
    if (this.phase !== 'LOBBY') {
      return fail('INVALID_STATE', 'Das Quiz wurde bereits gestartet.');
    }
    if (this.questions.length === 0) {
      return fail('INVALID_STATE', 'Es sind keine Fragen konfiguriert.');
    }
    log.info('Quiz gestartet', { room: this.code, rounds: this.questions.length, players: this.players.size });
    this.beginRound(0);
    return { ok: true, data: { started: true } };
  }

  /** Blendet Antworten aus und beendet die laufende Runde vorzeitig. */
  lock(): RoomResult<{ locked: true }> {
    if (this.phase !== 'QUESTION') {
      return fail('INVALID_STATE', 'Es läuft gerade keine Frage.');
    }
    this.stopTicker();
    this.phase = 'LOCKED';
    this.emitter.toRoom(this.code, 'question_locked', { roundIndex: this.roundIndex });
    this.broadcastState();
    return { ok: true, data: { locked: true } };
  }

  reveal(): RoomResult<{ revealed: true }> {
    const round = this.currentRound;
    if (!round || (this.phase !== 'QUESTION' && this.phase !== 'LOCKED')) {
      return fail('INVALID_STATE', 'In diesem Zustand kann nicht aufgelöst werden.');
    }

    this.stopTicker();
    this.phase = 'REVEAL';
    round.revealed = true;
    this.scoreRound(round);

    const payload = this.buildRevealPayload(round);
    this.emitter.toRoom(this.code, 'reveal_answer', payload);

    for (const [playerId, result] of round.results) {
      this.emitter.toPlayer(playerId, 'personal_result', result);
    }

    this.touch();
    this.broadcastState();
    log.info('Runde aufgelöst', { room: this.code, round: round.index + 1, answers: round.answers.size });
    return { ok: true, data: { revealed: true } };
  }

  showLeaderboard(): RoomResult<{ shown: true }> {
    if (this.phase === 'LOBBY') {
      return fail('INVALID_STATE', 'Das Quiz wurde noch nicht gestartet.');
    }
    if (this.phase === 'QUESTION') {
      this.stopTicker();
    }
    const final = this.phase === 'FINISHED';
    this.phase = final ? 'FINISHED' : 'LEADERBOARD';
    this.emitLeaderboard(final);
    this.touch();
    this.broadcastState();
    return { ok: true, data: { shown: true } };
  }

  next(): RoomResult<{ finished: boolean }> {
    if (this.phase === 'LOBBY') {
      return fail('INVALID_STATE', 'Bitte zuerst das Quiz starten.');
    }
    if (this.phase === 'FINISHED') {
      return fail('INVALID_STATE', 'Das Quiz ist bereits beendet.');
    }

    // Noch nicht aufgelöst? Dann zuerst auflösen, damit keine Punkte verloren gehen.
    if (this.currentRound && !this.currentRound.revealed) {
      this.reveal();
    }

    const nextIndex = this.roundIndex + 1;
    if (nextIndex >= this.questions.length) {
      this.finish();
      return { ok: true, data: { finished: true } };
    }

    this.beginRound(nextIndex);
    return { ok: true, data: { finished: false } };
  }

  end(): RoomResult<{ ended: true }> {
    if (this.phase === 'FINISHED') {
      return { ok: true, data: { ended: true } };
    }
    if (this.currentRound && !this.currentRound.revealed && this.phase !== 'LOBBY') {
      this.reveal();
    }
    this.finish();
    return { ok: true, data: { ended: true } };
  }

  private finish(): void {
    this.stopTicker();
    this.phase = 'FINISHED';
    const entries = this.buildLeaderboard(10);
    this.emitter.toRoom(this.code, 'game_finished', { entries, totalRounds: this.questions.length });
    this.emitPersonalStandings();
    this.touch();
    this.broadcastState();
    log.info('Quiz beendet', { room: this.code, players: this.players.size });
  }

  private beginRound(index: number): void {
    this.stopTicker();

    const question = this.questions[index];
    const durationMs = this.resolveDurationSeconds(question) * 1000;
    const startedAtMs = this.now();

    const shuffledOriginals = shuffle(question.answers);
    const displayAnswers: QuizAnswer[] = [];
    const displayToOriginal = {} as Record<AnswerId, AnswerId>;
    let correctDisplayId: AnswerId = 'A';

    shuffledOriginals.forEach((answer, position) => {
      const displayId = ANSWER_IDS[position];
      displayAnswers.push({ id: displayId, text: answer.text });
      displayToOriginal[displayId] = answer.id;
      if (answer.id === question.correctAnswer) correctDisplayId = displayId;
    });

    const round: Round = {
      index,
      question,
      displayToOriginal,
      displayAnswers,
      correctDisplayId,
      durationMs,
      startedAtMs,
      deadlineMs: startedAtMs + durationMs,
      answers: new Map(),
      results: new Map(),
      revealed: false,
    };

    this.rounds[index] = round;
    this.currentRound = round;
    this.roundIndex = index;
    this.phase = 'QUESTION';
    this.ranksBeforeRound = this.currentRanks();
    this.touch();

    this.emitter.toRoom(this.code, 'question_started', {
      question: this.toPublicQuestion(round),
      deadlineMs: round.deadlineMs,
      serverTimeMs: startedAtMs,
    });
    this.broadcastState();
    this.startTicker();

    log.info('Runde gestartet', {
      room: this.code,
      round: index + 1,
      of: this.questions.length,
      questionId: question.id,
      seconds: durationMs / 1000,
    });
  }

  private resolveDurationSeconds(question: QuizQuestion): number {
    const preset = TIMER_PRESET_SECONDS[this.config.timerPreset];
    return preset ?? question.durationSeconds;
  }

  // ------------------------------------------------------------------ Antwort

  submitAnswer(playerId: string, roundIndex: unknown, answer: unknown, nowMs = this.now()): RoomResult<{ accepted: true }> {
    const player = this.players.get(playerId);
    if (!player) {
      return fail('UNKNOWN_PLAYER', 'Unbekannter Teilnehmer.');
    }

    const round = this.currentRound;
    if (!round) {
      return fail('ANSWER_CLOSED', 'Für diese Frage werden keine Antworten mehr angenommen.');
    }
    // Zuerst prüfen, ob bereits geantwortet wurde -- das ist die aussagekräftigere Meldung,
    // auch wenn die Runde inzwischen gesperrt wurde.
    if (round.answers.has(playerId)) {
      return fail('ALREADY_ANSWERED', 'Du hast für diese Frage bereits geantwortet.');
    }
    if (this.phase !== 'QUESTION') {
      return fail('ANSWER_CLOSED', 'Für diese Frage werden keine Antworten mehr angenommen.');
    }
    if (typeof roundIndex !== 'number' || !Number.isInteger(roundIndex) || roundIndex !== round.index) {
      return fail('INVALID_PAYLOAD', 'Die Antwort gehört nicht zur aktuellen Frage.');
    }
    if (typeof answer !== 'string' || !ANSWER_IDS.includes(answer as AnswerId)) {
      return fail('INVALID_PAYLOAD', 'Ungültige Antwortoption.');
    }
    if (nowMs > round.deadlineMs + this.answerGraceMs) {
      return fail('ANSWER_CLOSED', 'Die Zeit für diese Frage ist abgelaufen.');
    }

    round.answers.set(playerId, { answer: answer as AnswerId, atMs: nowMs });
    player.lastSeen = nowMs;
    this.touch();

    this.emitter.toPlayer(playerId, 'answer_locked', {
      roundIndex: round.index,
      answer: answer as AnswerId,
      answeredCount: round.answers.size,
      playerCount: this.players.size,
    });
    this.emitter.toRoom(this.code, 'answer_progress', {
      roundIndex: round.index,
      answeredCount: round.answers.size,
      playerCount: this.players.size,
    });

    // Alle haben geantwortet -> Runde automatisch sperren, Host löst trotzdem manuell auf.
    if (this.players.size > 0 && round.answers.size >= this.players.size) {
      this.lock();
    }

    return { ok: true, data: { accepted: true } };
  }

  getSubmittedAnswer(playerId: string): AnswerId | null {
    return this.currentRound?.answers.get(playerId)?.answer ?? null;
  }

  getPersonalResult(playerId: string): PersonalRoundResult | null {
    return this.currentRound?.results.get(playerId) ?? null;
  }

  get answeredCount(): number {
    return this.currentRound?.answers.size ?? 0;
  }

  // ------------------------------------------------------------------ Scoring

  private scoreRound(round: Round): void {
    for (const player of this.players.values()) {
      const submission = round.answers.get(player.id);
      const correct = submission?.answer === round.correctDisplayId;
      const elapsedMs = submission ? Math.max(0, submission.atMs - round.startedAtMs) : round.durationMs;

      const score = calculateScore({
        correct,
        elapsedMs,
        durationMs: round.durationMs,
        previousStreak: player.streak,
      });

      player.score += score.points;
      player.streak = score.streak;

      round.results.set(player.id, {
        correct,
        selected: submission?.answer ?? null,
        correctAnswer: round.correctDisplayId,
        pointsAwarded: score.points,
        basePoints: score.basePoints,
        timeBonus: score.timeBonus,
        streakMultiplier: score.streakMultiplier,
        streak: score.streak,
        totalScore: player.score,
        rank: 0,
        playerCount: this.players.size,
        explanation: round.question.explanation,
      });
    }

    const ranks = this.currentRanks();
    for (const [playerId, result] of round.results) {
      result.rank = ranks.get(playerId) ?? this.players.size;
    }
  }

  private currentRanks(): Map<string, number> {
    const ranks = new Map<string, number>();
    this.sortedPlayers().forEach((player, index) => ranks.set(player.id, index + 1));
    return ranks;
  }

  private sortedPlayers(): Player[] {
    return [...this.players.values()].sort(
      (a, b) => b.score - a.score || b.streak - a.streak || a.nickname.localeCompare(b.nickname, 'de-DE'),
    );
  }

  buildLeaderboard(limit = 10): LeaderboardEntry[] {
    return this.sortedPlayers()
      .slice(0, limit)
      .map((player, index) => {
        const rank = index + 1;
        const previous = this.ranksBeforeRound.get(player.id);
        return {
          rank,
          playerId: player.id,
          nickname: player.nickname,
          score: player.score,
          streak: player.streak,
          delta: previous === undefined ? null : previous - rank,
        };
      });
  }

  private emitLeaderboard(final: boolean): void {
    this.emitter.toRoom(this.code, 'leaderboard', {
      entries: this.buildLeaderboard(10),
      final,
      roundIndex: this.roundIndex,
      totalRounds: this.questions.length,
    });
    this.emitPersonalStandings();
  }

  private emitPersonalStandings(): void {
    const ranks = this.currentRanks();
    for (const player of this.players.values()) {
      this.emitter.toPlayer(player.id, 'personal_standing', {
        rank: ranks.get(player.id) ?? this.players.size,
        score: player.score,
        streak: player.streak,
        playerCount: this.players.size,
      });
    }
  }

  // -------------------------------------------------------------------- State

  private buildRevealPayload(round: Round) {
    const counts = new Map<AnswerId, number>(ANSWER_IDS.map((id) => [id, 0]));
    for (const submission of round.answers.values()) {
      counts.set(submission.answer, (counts.get(submission.answer) ?? 0) + 1);
    }
    const total = round.answers.size;

    const distribution: AnswerDistributionEntry[] = round.displayAnswers.map((answer) => {
      const count = counts.get(answer.id) ?? 0;
      return {
        id: answer.id,
        text: answer.text,
        count,
        percent: total === 0 ? 0 : Math.round((count / total) * 100),
        correct: answer.id === round.correctDisplayId,
      };
    });

    return {
      roundIndex: round.index,
      correctAnswer: round.correctDisplayId,
      explanation: round.question.explanation,
      distribution,
      totalAnswers: total,
      playerCount: this.players.size,
    };
  }

  private toPublicQuestion(round: Round): PublicQuestion {
    return {
      index: round.index,
      total: this.questions.length,
      category: round.question.category,
      difficulty: round.question.difficulty,
      question: round.question.question,
      answers: round.displayAnswers,
      durationSeconds: Math.round(round.durationMs / 1000),
    };
  }

  private toPublicPlayer(player: Player): PlayerPublic {
    return {
      id: player.id,
      nickname: player.nickname,
      score: player.score,
      streak: player.streak,
      connected: player.connected,
    };
  }

  get joinUrl(): string {
    const path = `/join/${this.code}`;
    return this.publicBaseUrl ? `${this.publicBaseUrl}${path}` : path;
  }

  getState(): RoomState {
    const round = this.currentRound;
    const showQuestion = this.phase !== 'LOBBY' && round !== null;
    return {
      code: this.code,
      phase: this.phase,
      playerCount: this.players.size,
      answeredCount: round?.answers.size ?? 0,
      roundIndex: this.roundIndex,
      totalRounds: this.questions.length,
      config: this.config,
      players: this.sortedPlayers().map((player) => this.toPublicPlayer(player)),
      question: showQuestion && round ? this.toPublicQuestion(round) : null,
      joinUrl: this.joinUrl,
      serverTimeMs: this.now(),
      deadlineMs: this.phase === 'QUESTION' && round ? round.deadlineMs : null,
    };
  }

  broadcastState(): void {
    this.emitter.toRoom(this.code, 'room_state', this.getState());
  }

  // ------------------------------------------------------------------- Timer

  private startTicker(): void {
    this.stopTicker();
    this.tickHandle = setInterval(() => this.tick(), 250);
    if (typeof this.tickHandle === 'object' && this.tickHandle && 'unref' in this.tickHandle) {
      this.tickHandle.unref();
    }
    this.tick();
  }

  private stopTicker(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  private tick(): void {
    const round = this.currentRound;
    if (!round || this.phase !== 'QUESTION') {
      this.stopTicker();
      return;
    }
    const nowMs = this.now();
    const remainingMs = Math.max(0, round.deadlineMs - nowMs);

    this.emitter.toRoom(this.code, 'timer_sync', {
      roundIndex: round.index,
      remainingMs,
      durationMs: round.durationMs,
      serverTimeMs: nowMs,
    });

    if (remainingMs <= 0) {
      this.lock();
    }
  }

  private touch(): void {
    this.lastActivity = this.now();
  }

  destroy(): void {
    this.stopTicker();
    this.players.clear();
    this.tokenIndex.clear();
  }
}

/** Begrenzt und normalisiert die vom Host geschickte Konfiguration. */
export function normalizeConfig(raw: unknown, poolSize?: number): GameConfig {
  const max = poolSize ?? 30;
  const input = (raw ?? {}) as Partial<GameConfig>;

  const rawCount = Number(input.questionCount);
  const questionCount = Number.isFinite(rawCount) ? Math.min(Math.max(Math.floor(rawCount), 1), max) : 12;

  const timerPreset =
    input.timerPreset === 'relaxed' || input.timerPreset === 'fast' || input.timerPreset === 'standard'
      ? input.timerPreset
      : 'standard';

  return {
    questionCount,
    randomizeQuestions: input.randomizeQuestions === true,
    timerPreset,
  };
}
