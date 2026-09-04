import type { GameFinishedPayload, LeaderboardPayload, PersonalStandingPayload } from '../../shared/events.js';
import type {
  AnswerId,
  JoinSuccess,
  LeaderboardEntry,
  PersonalRoundResult,
  PublicQuestion,
  RevealPayload,
  RoomState,
} from '../../shared/types.js';
import { GameClock } from './clock.svelte.js';
import { getSocket, request } from './socket.js';
import { sound } from './sound.svelte.js';
import { clearPlayerSession, loadPlayerSession, savePlayerSession, type PlayerSession } from './storage.js';

export type PlayerStatus = 'idle' | 'connecting' | 'joined' | 'error';

class PlayerGame {
  status = $state<PlayerStatus>('idle');
  connected = $state(false);
  session = $state<PlayerSession | null>(null);
  roomState = $state<RoomState | null>(null);
  question = $state<PublicQuestion | null>(null);
  selectedAnswer = $state<AnswerId | null>(null);
  reveal = $state<RevealPayload | null>(null);
  personal = $state<PersonalRoundResult | null>(null);
  standing = $state<PersonalStandingPayload | null>(null);
  leaderboard = $state<LeaderboardEntry[]>([]);
  leaderboardFinal = $state(false);
  notice = $state<string | null>(null);
  busy = $state(false);

  readonly clock = new GameClock();

  private attached = false;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private lastTickSecond = -1;

  attach(): void {
    if (this.attached) return;
    this.attached = true;

    const socket = getSocket();
    this.session = loadPlayerSession();

    socket.on('connect', () => {
      this.connected = true;
      // Nach einem Verbindungsabbruch automatisch wieder in den Raum --
      // aber nur, wenn die Spielansicht auch offen ist.
      if (this.session && this.status !== 'connecting' && window.location.pathname.startsWith('/play')) {
        void this.reconnect();
      }
    });

    socket.on('disconnect', () => {
      this.connected = false;
    });

    socket.on('room_state', (state) => {
      this.roomState = state;
      if (state.question) this.question = state.question;
      if (state.phase === 'LOBBY') {
        this.question = null;
        this.reveal = null;
        this.personal = null;
        this.selectedAnswer = null;
      }
      if (state.phase !== 'QUESTION') {
        this.stopTicker();
        this.clock.stop();
      }
    });

    socket.on('question_started', ({ question, deadlineMs, serverTimeMs }) => {
      this.question = question;
      this.selectedAnswer = null;
      this.reveal = null;
      this.personal = null;
      this.notice = null;
      this.clock.sync(serverTimeMs, deadlineMs, question.durationSeconds * 1000);
      sound.play('question');
      this.startTicker();
    });

    socket.on('timer_sync', ({ serverTimeMs, remainingMs, durationMs }) => {
      this.clock.sync(serverTimeMs, serverTimeMs + remainingMs, durationMs);
    });

    socket.on('answer_locked', ({ answer }) => {
      this.selectedAnswer = answer;
      sound.play('lock');
    });

    socket.on('answer_progress', ({ answeredCount, playerCount }) => {
      if (this.roomState) {
        this.roomState = { ...this.roomState, answeredCount, playerCount };
      }
    });

    socket.on('question_locked', () => {
      this.stopTicker();
      this.clock.stop();
    });

    socket.on('reveal_answer', (payload) => {
      this.reveal = payload;
      this.stopTicker();
      this.clock.stop();
    });

    socket.on('personal_result', (result) => {
      this.personal = result;
      sound.play(result.correct ? 'correct' : 'wrong');
    });

    socket.on('personal_standing', (payload) => {
      this.standing = payload;
    });

    socket.on('leaderboard', (payload: LeaderboardPayload) => {
      this.leaderboard = payload.entries;
      this.leaderboardFinal = payload.final;
      sound.play('leaderboard');
    });

    socket.on('game_finished', (payload: GameFinishedPayload) => {
      this.leaderboard = payload.entries;
      this.leaderboardFinal = true;
      this.stopTicker();
      this.clock.stop();
      sound.play('finish');
    });

    socket.on('room_closed', ({ reason }) => {
      this.notice = reason;
      this.status = 'idle';
      this.session = null;
      clearPlayerSession();
    });
  }

  private startTicker(): void {
    this.stopTicker();
    this.lastTickSecond = -1;
    this.tickHandle = setInterval(() => {
      const seconds = this.clock.remainingSeconds;
      if (seconds !== this.lastTickSecond && seconds > 0 && seconds <= 5) {
        this.lastTickSecond = seconds;
        sound.play('tick');
      }
    }, 120);
  }

  private stopTicker(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  async join(code: string, nickname: string): Promise<{ ok: boolean; error?: string }> {
    this.busy = true;
    this.notice = null;
    this.status = 'connecting';
    const result = await request<JoinSuccess>('join_room', { code, nickname });
    this.busy = false;

    if (!result.ok) {
      this.status = 'error';
      this.notice = result.error.message;
      return { ok: false, error: result.error.message };
    }

    this.session = {
      roomCode: result.data.roomCode,
      playerToken: result.data.playerToken,
      nickname: result.data.nickname,
    };
    savePlayerSession(this.session);
    this.status = 'joined';
    sound.play('join');
    return { ok: true };
  }

  async reconnect(): Promise<{ ok: boolean; error?: string }> {
    const session = this.session ?? loadPlayerSession();
    if (!session) {
      this.status = 'idle';
      return { ok: false, error: 'Keine gespeicherte Sitzung gefunden.' };
    }

    this.status = 'connecting';
    const result = await request<JoinSuccess>('reconnect_player', {
      code: session.roomCode,
      playerToken: session.playerToken,
    });

    if (!result.ok) {
      this.status = 'idle';
      this.session = null;
      clearPlayerSession();
      this.notice = result.error.message;
      return { ok: false, error: result.error.message };
    }

    this.session = session;
    this.status = 'joined';
    return { ok: true };
  }

  async submit(answer: AnswerId): Promise<void> {
    if (this.selectedAnswer || !this.question || this.roomState?.phase !== 'QUESTION') return;
    // Optimistische Auswahl, damit der Tap sofort sichtbar ist.
    this.selectedAnswer = answer;
    const result = await request<{ accepted: true }>('submit_answer', {
      roundIndex: this.question.index,
      answer,
    });
    if (!result.ok) {
      if (result.error.code !== 'ALREADY_ANSWERED') this.selectedAnswer = null;
      this.notice = result.error.message;
    }
  }

  async leave(): Promise<void> {
    await request<{ left: true }>('leave_room', {});
    this.resetSession();
  }

  resetSession(): void {
    this.stopTicker();
    this.clock.reset();
    this.session = null;
    this.roomState = null;
    this.question = null;
    this.selectedAnswer = null;
    this.reveal = null;
    this.personal = null;
    this.standing = null;
    this.leaderboard = [];
    this.leaderboardFinal = false;
    this.status = 'idle';
    clearPlayerSession();
  }

  dismissNotice(): void {
    this.notice = null;
  }
}

export const playerGame = new PlayerGame();
