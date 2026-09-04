/** Typisierte Socket.IO-Events (Client <-> Server). */
import type {
  Ack,
  AnswerId,
  GameConfig,
  JoinSuccess,
  LeaderboardEntry,
  PersonalRoundResult,
  PlayerPublic,
  PublicQuestion,
  RevealPayload,
  RoomState,
} from './types.js';

export interface JoinRoomPayload {
  code: string;
  nickname: string;
}

export interface ReconnectPlayerPayload {
  code: string;
  playerToken: string;
}

export interface SubmitAnswerPayload {
  roundIndex: number;
  answer: AnswerId;
}

export interface HostCreateGamePayload {
  hostToken: string;
  config: GameConfig;
}

export interface HostRoomPayload {
  hostToken: string;
  code: string;
}

export type HostJoinPayload = HostRoomPayload;

export interface TimerSyncPayload {
  roundIndex: number;
  remainingMs: number;
  durationMs: number;
  serverTimeMs: number;
}

export interface AnswerLockedPayload {
  roundIndex: number;
  answer: AnswerId;
  answeredCount: number;
  playerCount: number;
}

export interface AnswerProgressPayload {
  roundIndex: number;
  answeredCount: number;
  playerCount: number;
}

export interface LeaderboardPayload {
  entries: LeaderboardEntry[];
  final: boolean;
  roundIndex: number;
  totalRounds: number;
}

export interface GameFinishedPayload {
  entries: LeaderboardEntry[];
  totalRounds: number;
}

export interface PersonalStandingPayload {
  rank: number;
  score: number;
  streak: number;
  playerCount: number;
}

/** Server -> Client */
export interface ServerToClientEvents {
  room_state: (state: RoomState) => void;
  player_joined: (player: PlayerPublic) => void;
  player_left: (payload: { playerId: string; playerCount: number }) => void;
  question_started: (payload: { question: PublicQuestion; deadlineMs: number; serverTimeMs: number }) => void;
  timer_sync: (payload: TimerSyncPayload) => void;
  answer_locked: (payload: AnswerLockedPayload) => void;
  answer_progress: (payload: AnswerProgressPayload) => void;
  question_locked: (payload: { roundIndex: number }) => void;
  reveal_answer: (payload: RevealPayload) => void;
  personal_result: (payload: PersonalRoundResult) => void;
  leaderboard: (payload: LeaderboardPayload) => void;
  personal_standing: (payload: PersonalStandingPayload) => void;
  game_finished: (payload: GameFinishedPayload) => void;
  room_closed: (payload: { reason: string }) => void;
  server_error: (payload: { code: string; message: string }) => void;
}

/** Client -> Server */
export interface ClientToServerEvents {
  join_room: (payload: JoinRoomPayload, ack: Ack<JoinSuccess>) => void;
  reconnect_player: (payload: ReconnectPlayerPayload, ack: Ack<JoinSuccess>) => void;
  submit_answer: (payload: SubmitAnswerPayload, ack: Ack<{ accepted: true }>) => void;
  leave_room: (payload: Record<string, never>, ack: Ack<{ left: true }>) => void;
  host_create_game: (payload: HostCreateGamePayload, ack: Ack<{ code: string }>) => void;
  host_join_room: (payload: HostJoinPayload, ack: Ack<RoomState>) => void;
  host_start_game: (payload: HostRoomPayload, ack: Ack<{ started: true }>) => void;
  host_reveal: (payload: HostRoomPayload, ack: Ack<{ revealed: true }>) => void;
  host_next: (payload: HostRoomPayload, ack: Ack<{ finished: boolean }>) => void;
  host_show_leaderboard: (payload: HostRoomPayload, ack: Ack<{ shown: true }>) => void;
  host_end_game: (payload: HostRoomPayload, ack: Ack<{ ended: true }>) => void;
  host_kick_player: (payload: HostRoomPayload & { playerId: string }, ack: Ack<{ kicked: true }>) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  roomCode?: string;
  playerId?: string;
  isHost?: boolean;
}
