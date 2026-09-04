/**
 * Gemeinsame Typen für Client und Server.
 * Alles was hier steht darf den Client erreichen -- deshalb enthält
 * `PublicQuestion` bewusst KEINE korrekte Antwort.
 */

export type AnswerId = 'A' | 'B' | 'C' | 'D';

export const ANSWER_IDS: readonly AnswerId[] = ['A', 'B', 'C', 'D'] as const;

export type Difficulty = 1 | 2 | 3;

export interface QuizAnswer {
  id: AnswerId;
  text: string;
}

export interface QuizQuestion {
  id: string;
  category: string;
  difficulty: Difficulty;
  question: string;
  answers: QuizAnswer[];
  correctAnswer: AnswerId;
  explanation: string;
  durationSeconds: number;
}

/** Fragedarstellung wie sie an Clients ausgeliefert wird (ohne Lösung). */
export interface PublicQuestion {
  index: number;
  total: number;
  category: string;
  difficulty: Difficulty;
  question: string;
  answers: QuizAnswer[];
  durationSeconds: number;
}

export type GamePhase =
  | 'LOBBY'
  | 'QUESTION'
  | 'LOCKED'
  | 'REVEAL'
  | 'LEADERBOARD'
  | 'FINISHED';

export type TimerPreset = 'relaxed' | 'standard' | 'fast';

export const TIMER_PRESET_SECONDS: Record<TimerPreset, number | null> = {
  relaxed: 30,
  standard: null, // pro Frage hinterlegte Dauer verwenden
  fast: 12,
};

export const QUESTION_COUNT_OPTIONS = [5, 10, 12, 15, 20, 30] as const;
export type QuestionCount = (typeof QUESTION_COUNT_OPTIONS)[number];

export interface GameConfig {
  questionCount: number;
  randomizeQuestions: boolean;
  timerPreset: TimerPreset;
}

export interface PlayerPublic {
  id: string;
  nickname: string;
  score: number;
  streak: number;
  connected: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  nickname: string;
  score: number;
  streak: number;
  /** Positionsgewinn seit dem vorherigen Leaderboard (positiv = aufgestiegen). */
  delta: number | null;
}

export interface AnswerDistributionEntry {
  id: AnswerId;
  text: string;
  count: number;
  percent: number;
  correct: boolean;
}

/** Snapshot, den jeder Client beim (Re-)Connect erhält. */
export interface RoomState {
  code: string;
  phase: GamePhase;
  playerCount: number;
  answeredCount: number;
  roundIndex: number;
  totalRounds: number;
  config: GameConfig;
  players: PlayerPublic[];
  question: PublicQuestion | null;
  joinUrl: string;
  /** Nur gesetzt, solange die Frage läuft. */
  serverTimeMs: number;
  deadlineMs: number | null;
}

export interface PersonalRoundResult {
  correct: boolean;
  selected: AnswerId | null;
  correctAnswer: AnswerId;
  pointsAwarded: number;
  basePoints: number;
  timeBonus: number;
  streakMultiplier: number;
  streak: number;
  totalScore: number;
  rank: number;
  playerCount: number;
  explanation: string;
}

export interface RevealPayload {
  roundIndex: number;
  correctAnswer: AnswerId;
  explanation: string;
  distribution: AnswerDistributionEntry[];
  totalAnswers: number;
  playerCount: number;
}

export interface JoinSuccess {
  playerToken: string;
  playerId: string;
  nickname: string;
  roomCode: string;
}

export interface HostAuthResult {
  ok: boolean;
  hostToken?: string;
  error?: string;
}

export type SocketErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'NICKNAME_TAKEN'
  | 'NICKNAME_INVALID'
  | 'GAME_ALREADY_STARTED'
  | 'ROOM_FULL'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'INVALID_PAYLOAD'
  | 'ANSWER_CLOSED'
  | 'ALREADY_ANSWERED'
  | 'UNKNOWN_PLAYER'
  | 'INVALID_STATE';

export interface SocketError {
  code: SocketErrorCode;
  message: string;
}

export type Ack<T> = (result: { ok: true; data: T } | { ok: false; error: SocketError }) => void;
