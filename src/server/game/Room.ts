import { randomBytes, randomUUID } from 'node:crypto';

import type {
  AnswerDistributionEntry,
  AnswerId,
  GameConfig,
  GamePhase,
  GameReview,
  QuizDefinition,
  LeaderboardEntry,
  PendingAction,
  PersonalRoundResult,
  PlayerPublic,
  PublicQuestion,
  QuizAnswer,
  QuizQuestion,
  ReviewAnswer,
  ReviewPlayer,
  ReviewRound,
  RoomState,
  SocketError,
} from '../../shared/types.js';
import { ANSWER_IDS, TIMER_PRESET_SECONDS } from '../../shared/types.js';
import { createLogger } from '../logger.js';
import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, nicknameKey, sanitizeNickname } from './nickname.js';
import { selectQuestions, shuffle } from './questionSelection.js';
import { calculateScore } from './scoring.js';

const log = createLogger('room');

/** Pause zwischen Rundenende und automatischer Aufloesung. */
export const AUTO_REVEAL_DELAY_MS = 1_500;
/** Lesezeit fuer Verteilung und Erklaerung, bevor automatisch weitergeschaltet wird. */
export const AUTO_NEXT_DELAY_MS = 10_000;

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
  /**
   * Aktuell zugeordnete Socket-Verbindung. Nach einem Reconnect gehoert der
   * Spieler einem NEUEN Socket -- der alte laeuft erst nach dem Ping-Timeout
   * ab und darf den Spieler dann nicht mehr als offline markieren.
   */
  socketId: string | null;
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
  /** Das gespielte Quiz -- liefert Fragenpool, Standardauswahl und Namen. */
  quiz: QuizDefinition;
  autoRevealDelayMs?: number;
  autoNextDelayMs?: number;
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
  readonly quiz: QuizDefinition;

  private readonly players = new Map<string, Player>();
  private readonly tokenIndex = new Map<string, string>();

  private questions: QuizQuestion[] = [];
  private rounds: Round[] = [];
  private currentRound: Round | null = null;
  private roundIndex = -1;

  /** Rangliste zu Beginn der laufenden Runde -- Basis für die Delta-Anzeige. */
  private ranksBeforeRound = new Map<string, number>();

  private tickHandle: ReturnType<typeof setInterval> | null = null;

  /** Automatik voruebergehend vom Host angehalten. */
  private autoPaused = false;
  private autoHandle: ReturnType<typeof setTimeout> | null = null;
  private pending: { action: PendingAction; atMs: number } | null = null;
  private readonly autoRevealDelayMs: number;
  private readonly autoNextDelayMs: number;

  constructor(options: RoomOptions) {
    this.code = options.code;
    this.emitter = options.emitter;
    this.publicBaseUrl = options.publicBaseUrl ?? null;
    this.maxPlayers = options.maxPlayers ?? 300;
    this.answerGraceMs = options.answerGraceMs ?? 750;
    this.now = options.now ?? (() => Date.now());
    this.quiz = options.quiz;
    this.autoRevealDelayMs = options.autoRevealDelayMs ?? AUTO_REVEAL_DELAY_MS;
    this.autoNextDelayMs = options.autoNextDelayMs ?? AUTO_NEXT_DELAY_MS;
    this.config = normalizeConfig(options.config, this.quiz.questions.length, this.quiz.id);
    this.createdAt = this.now();
    this.lastActivity = this.createdAt;
    this.questions = selectQuestions({
      count: this.config.questionCount,
      randomize: this.config.randomizeQuestions,
      pool: this.quiz.questions,
      defaultIds: this.quiz.defaultQuestionIds,
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

  addPlayer(rawNickname: unknown, socketId: string | null = null): RoomResult<Player> {
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
      socketId,
    };

    this.players.set(player.id, player);
    this.tokenIndex.set(player.token, player.id);
    this.touch();

    log.info('Teilnehmer beigetreten', { room: this.code, players: this.players.size });
    this.emitter.toRoom(this.code, 'player_joined', this.toPublicPlayer(player));
    this.broadcastState();

    return { ok: true, data: player };
  }

  reconnectPlayer(token: unknown, socketId: string | null = null): RoomResult<Player> {
    if (typeof token !== 'string' || token.length < 8) {
      return fail('UNKNOWN_PLAYER', 'Ungültiges Spieler-Token.');
    }
    const player = this.getPlayerByToken(token);
    if (!player) {
      return fail('UNKNOWN_PLAYER', 'Die Sitzung ist abgelaufen. Bitte erneut beitreten.');
    }
    player.connected = true;
    player.socketId = socketId;
    player.lastSeen = this.now();
    this.touch();
    this.broadcastState();
    return { ok: true, data: player };
  }

  /**
   * Markiert einen Spieler als getrennt. `socketId` ist die Verbindung, die sich
   * gerade verabschiedet: Gehoert sie nicht mehr zum Spieler (weil er sich
   * zwischenzeitlich neu verbunden hat), passiert nichts.
   */
  markDisconnected(playerId: string, socketId: string | null = null): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (socketId !== null && player.socketId !== null && player.socketId !== socketId) {
      log.debug('Veraltete Trennung ignoriert', { room: this.code, socket: socketId });
      return;
    }
    player.connected = false;
    player.socketId = null;
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
    this.cancelAuto();
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
    // Im Automatikbetrieb kurz warten, damit der Wechsel nicht abrupt wirkt.
    this.scheduleAuto('reveal', this.autoRevealDelayMs);
    this.broadcastState();
    return { ok: true, data: { locked: true } };
  }

  reveal(): RoomResult<{ revealed: true }> {
    this.cancelAuto();
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
    // Danach automatisch weiter -- oder abschliessen, wenn es die letzte Runde war.
    const isLast = round.index + 1 >= this.questions.length;
    this.scheduleAuto(isLast ? 'finish' : 'next', this.autoNextDelayMs);
    this.broadcastState();
    log.info('Runde aufgelöst', { room: this.code, round: round.index + 1, answers: round.answers.size });
    return { ok: true, data: { revealed: true } };
  }

  showLeaderboard(): RoomResult<{ shown: true }> {
    this.cancelAuto();
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
    if (!final) {
      const isLast = this.roundIndex + 1 >= this.questions.length;
      this.scheduleAuto(isLast ? 'finish' : 'next', this.autoNextDelayMs);
    }
    this.broadcastState();
    return { ok: true, data: { shown: true } };
  }

  next(): RoomResult<{ finished: boolean }> {
    this.cancelAuto();
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
    this.cancelAuto();
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
    this.cancelAuto();
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
    this.cancelAuto();
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
      quizId: this.quiz.id,
      quizName: this.quiz.name,
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
      autoPaused: this.autoPaused,
      pendingAction: this.pending?.action ?? null,
      pendingAtMs: this.pending?.atMs ?? null,
    };
  }

  broadcastState(): void {
    this.emitter.toRoom(this.code, 'room_state', this.getState());
  }

  // ---------------------------------------------------------------- Automatik

  get isAutoPaused(): boolean {
    return this.autoPaused;
  }

  /**
   * Plant den naechsten automatischen Schritt. Passiert nur, wenn die Automatik
   * konfiguriert und nicht angehalten ist. Jede manuelle Host-Aktion ruft vorher
   * {@link cancelAuto} auf und gewinnt damit immer.
   */
  private scheduleAuto(action: PendingAction, delayMs: number): void {
    this.cancelAuto();
    if (!this.config.autoAdvance || this.autoPaused) return;

    this.pending = { action, atMs: this.now() + delayMs };
    this.autoHandle = setTimeout(() => {
      this.autoHandle = null;
      this.pending = null;
      log.info('Automatischer Schritt', { room: this.code, action });
      if (action === 'reveal') this.reveal();
      else if (action === 'next') this.next();
      else this.end();
    }, delayMs);
    this.autoHandle.unref?.();
    this.broadcastState();
  }

  private cancelAuto(): void {
    if (this.autoHandle) {
      clearTimeout(this.autoHandle);
      this.autoHandle = null;
    }
    this.pending = null;
  }

  /** Host haelt die Automatik an oder setzt sie fort. */
  setAutoPaused(paused: boolean): RoomResult<{ autoPaused: boolean }> {
    this.autoPaused = paused === true;
    if (this.autoPaused) {
      this.cancelAuto();
      this.broadcastState();
      return { ok: true, data: { autoPaused: true } };
    }

    // Fortsetzen: den zum aktuellen Zustand passenden Schritt neu planen.
    if (this.config.autoAdvance) {
      if (this.phase === 'LOCKED') {
        this.scheduleAuto('reveal', this.autoRevealDelayMs);
      } else if (this.phase === 'REVEAL' || this.phase === 'LEADERBOARD') {
        const isLast = this.roundIndex + 1 >= this.questions.length;
        this.scheduleAuto(isLast ? 'finish' : 'next', this.autoNextDelayMs);
      }
    }
    this.broadcastState();
    return { ok: true, data: { autoPaused: false } };
  }

  // -------------------------------------------------------------- Auswertung

  /**
   * Nachbesprechung: wer hat wann was geantwortet.
   * Enthaelt ausschliesslich bereits aufgeloeste Runden -- eine laufende Frage
   * darf nicht vorab einsehbar sein.
   */
  buildReview(): GameReview {
    const playedRounds = this.rounds.filter((round) => round && round.revealed);

    const rounds: ReviewRound[] = playedRounds.map((round) => {
      const elapsed = [...round.answers.values()].map((a) => Math.max(0, a.atMs - round.startedAtMs));
      const correctSubmissions = [...round.answers.entries()]
        .filter(([, a]) => a.answer === round.correctDisplayId)
        .map(([playerId, a]) => ({ playerId, elapsedMs: Math.max(0, a.atMs - round.startedAtMs) }))
        .sort((a, b) => a.elapsedMs - b.elapsedMs);

      const fastest = correctSubmissions[0];
      const fastestPlayer = fastest ? this.players.get(fastest.playerId) : undefined;

      return {
        index: round.index,
        questionId: round.question.id,
        category: round.question.category,
        difficulty: round.question.difficulty,
        question: round.question.question,
        answers: round.displayAnswers,
        correctAnswer: round.correctDisplayId,
        explanation: round.question.explanation,
        distribution: this.buildRevealPayload(round).distribution,
        answeredCount: round.answers.size,
        correctCount: correctSubmissions.length,
        durationMs: round.durationMs,
        averageElapsedMs:
          elapsed.length > 0 ? Math.round(elapsed.reduce((sum, v) => sum + v, 0) / elapsed.length) : null,
        fastestCorrect:
          fastest && fastestPlayer ? { nickname: fastestPlayer.nickname, elapsedMs: fastest.elapsedMs } : null,
      };
    });

    const players: ReviewPlayer[] = this.sortedPlayers().map((player) => {
      const answers: ReviewAnswer[] = playedRounds.map((round) => {
        const submission = round.answers.get(player.id);
        const result = round.results.get(player.id);
        return {
          answer: submission?.answer ?? null,
          correct: submission?.answer === round.correctDisplayId,
          points: result?.pointsAwarded ?? 0,
          elapsedMs: submission ? Math.max(0, submission.atMs - round.startedAtMs) : null,
        };
      });

      const times = answers.map((a) => a.elapsedMs).filter((v): v is number => v !== null);
      return {
        playerId: player.id,
        nickname: player.nickname,
        score: player.score,
        streak: player.streak,
        correctCount: answers.filter((a) => a.correct).length,
        answeredCount: times.length,
        averageElapsedMs: times.length > 0 ? Math.round(times.reduce((sum, v) => sum + v, 0) / times.length) : null,
        answers,
      };
    });

    return {
      code: this.code,
      quizName: this.quiz.name,
      totalRounds: this.questions.length,
      playedRounds: playedRounds.length,
      rounds,
      players,
    };
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
    this.cancelAuto();
    this.stopTicker();
    this.players.clear();
    this.tokenIndex.clear();
  }
}

/** Begrenzt und normalisiert die vom Host geschickte Konfiguration. */
export function normalizeConfig(raw: unknown, poolSize: number, quizId: string): GameConfig {
  const max = Math.max(1, poolSize);
  const input = (raw ?? {}) as Partial<GameConfig>;

  const rawCount = Number(input.questionCount);
  const questionCount = Number.isFinite(rawCount) ? Math.min(Math.max(Math.floor(rawCount), 1), max) : 12;

  const timerPreset =
    input.timerPreset === 'relaxed' || input.timerPreset === 'fast' || input.timerPreset === 'standard'
      ? input.timerPreset
      : 'standard';

  return {
    quizId,
    questionCount,
    randomizeQuestions: input.randomizeQuestions === true,
    timerPreset,
    autoAdvance: input.autoAdvance === true,
    autoRevealAnswers: input.autoRevealAnswers === true,
  };
}
