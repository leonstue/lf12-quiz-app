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

// ------------------------------------------------------------------ Quizze

/**
 * Ein Quiz, wie es als JSON-Datei im Ordner `quizzes/` liegt.
 * Enthaelt die Loesungen und verlaesst den Server deshalb nie unveraendert.
 */
export interface QuizDefinition {
  id: string;
  name: string;
  description: string;
  subject: string;
  /** Kuratierte Reihenfolge, wenn nicht zufaellig gemischt wird. */
  defaultQuestionIds: string[];
  questions: QuizQuestion[];
}

/** Auswahlliste fuer den Host -- bewusst ohne Fragen und ohne Loesungen. */
export interface QuizSummary {
  id: string;
  name: string;
  description: string;
  subject: string;
  questionCount: number;
  categories: string[];
  /** Sinnvolle Werte fuer "Anzahl Fragen" bei diesem Quiz. */
  countOptions: number[];
  /** Anzahl Fragen der kuratierten Standardauswahl. */
  defaultCount: number;
}

export interface GameConfig {
  /** Welches Quiz aus dem Ordner `quizzes/` gespielt wird. */
  quizId: string;
  questionCount: number;
  randomizeQuestions: boolean;
  timerPreset: TimerPreset;
  /**
   * Automatisch aufloesen und weiterschalten, sobald eine Frage endet.
   * Der Host kann trotzdem jederzeit manuell eingreifen -- jede Aktion
   * verwirft einen anstehenden automatischen Schritt.
   */
  autoAdvance: boolean;
  /**
   * Nach dem Reveal sofort zeigen, wer was geantwortet hat.
   * `false` = der Host blendet die Details bei Bedarf selbst ein.
   */
  autoRevealAnswers: boolean;
}

/** Was der Server als Naechstes von selbst tun wird. */
export type PendingAction = 'reveal' | 'next' | 'finish';

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
  quizId: string;
  quizName: string;
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
  /** Automatik vom Host angehalten. */
  autoPaused: boolean;
  /** Anstehender automatischer Schritt, sonst null. */
  pendingAction: PendingAction | null;
  /** Serverzeit, zu der der anstehende Schritt ausgeloest wird. */
  pendingAtMs: number | null;
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

// ------------------------------------------------------------- Auswertung

/** Antwort einer Person in einer Runde -- fuer die Nachbesprechung. */
export interface ReviewAnswer {
  /** Angezeigter Buchstabe dieser Runde, null = keine Antwort abgegeben. */
  answer: AnswerId | null;
  correct: boolean;
  points: number;
  /** Antwortzeit in Millisekunden ab Rundenstart, null wenn nicht geantwortet. */
  elapsedMs: number | null;
}

export interface ReviewRound {
  index: number;
  questionId: string;
  category: string;
  difficulty: Difficulty;
  question: string;
  /** Optionen in der Reihenfolge, wie sie in dieser Runde angezeigt wurden. */
  answers: QuizAnswer[];
  correctAnswer: AnswerId;
  explanation: string;
  distribution: AnswerDistributionEntry[];
  answeredCount: number;
  correctCount: number;
  /** Wie lange die Frage lief. */
  durationMs: number;
  /** Mittlere Antwortzeit der abgegebenen Antworten, null ohne Antworten. */
  averageElapsedMs: number | null;
  /** Schnellste richtige Antwort dieser Runde. */
  fastestCorrect: { nickname: string; elapsedMs: number } | null;
}

export interface ReviewPlayer {
  playerId: string;
  nickname: string;
  score: number;
  streak: number;
  correctCount: number;
  answeredCount: number;
  /** Mittlere Antwortzeit ueber alle abgegebenen Antworten, null wenn keine. */
  averageElapsedMs: number | null;
  /** Eine Position je gespielter Runde. */
  answers: ReviewAnswer[];
}

export interface GameReview {
  code: string;
  quizName: string;
  totalRounds: number;
  /** Bereits aufgeloeste Runden -- nur diese sind auswertbar. */
  playedRounds: number;
  rounds: ReviewRound[];
  players: ReviewPlayer[];
}
