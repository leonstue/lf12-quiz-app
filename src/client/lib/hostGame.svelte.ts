import type { GameFinishedPayload, LeaderboardPayload } from '../../shared/events.js';
import type {
  GameConfig,
  GameReview,
  LeaderboardEntry,
  PublicQuestion,
  RevealPayload,
  RoomState,
} from '../../shared/types.js';
import { GameClock } from './clock.svelte.js';
import { getSocket, request } from './socket.js';
import { sound } from './sound.svelte.js';
import { clearHostToken, loadHostToken, saveHostToken } from './storage.js';

class HostGame {
  hostToken = $state<string | null>(null);
  connected = $state(false);
  code = $state<string | null>(null);
  roomState = $state<RoomState | null>(null);
  question = $state<PublicQuestion | null>(null);
  reveal = $state<RevealPayload | null>(null);
  /** Zweite Stufe der Reveal-Animation: erst Verteilung, dann Lösung. */
  revealHighlight = $state(false);
  leaderboard = $state<LeaderboardEntry[]>([]);
  leaderboardFinal = $state(false);
  notice = $state<string | null>(null);
  busy = $state(false);
  /** Auswertung am Spielende -- wer hat wann was geantwortet. */
  review = $state<GameReview | null>(null);
  reviewLoading = $state(false);
  /** Rundendetails ("wer hat was geantwortet") auf dem Reveal-Screen sichtbar. */
  roundDetailVisible = $state(false);
  /** Serverzeit minus lokale Zeit -- fuer den Countdown der Automatik. */
  serverOffsetMs = $state(0);

  readonly clock = new GameClock();

  private attached = false;
  private highlightHandle: ReturnType<typeof setTimeout> | null = null;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private lastTickSecond = -1;

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.hostToken = loadHostToken();

    const socket = getSocket();

    socket.on('connect', () => {
      this.connected = true;
      // Nur automatisch wieder eintreten, wenn die Host-Ansicht auch offen ist.
      if (this.code && this.hostToken && window.location.pathname.startsWith('/host/game')) {
        void this.joinRoom(this.code);
      }
    });

    socket.on('disconnect', () => {
      this.connected = false;
    });

    socket.on('room_state', (state) => {
      this.roomState = state;
      this.serverOffsetMs = state.serverTimeMs - Date.now();
      this.question = state.question;
      if (state.phase !== 'QUESTION') {
        this.clock.stop();
        this.stopTicker();
      }
      if (state.phase === 'LOBBY') {
        this.reveal = null;
        this.leaderboard = [];
        this.leaderboardFinal = false;
        this.review = null;
      }
    });

    socket.on('question_started', ({ question, deadlineMs, serverTimeMs }) => {
      this.question = question;
      this.reveal = null;
      this.revealHighlight = false;
      this.roundDetailVisible = false;
      this.clock.sync(serverTimeMs, deadlineMs, question.durationSeconds * 1000);
      sound.play('question');
      this.startTicker();
    });

    socket.on('timer_sync', ({ serverTimeMs, remainingMs, durationMs }) => {
      this.clock.sync(serverTimeMs, serverTimeMs + remainingMs, durationMs);
    });

    socket.on('answer_progress', ({ answeredCount, playerCount }) => {
      // room_state wird nicht pro Antwort gebroadcastet -- der Zaehler kommt hierueber.
      if (this.roomState) {
        this.roomState = { ...this.roomState, answeredCount, playerCount };
      }
    });

    socket.on('question_locked', () => {
      this.clock.stop();
      this.stopTicker();
    });

    socket.on('reveal_answer', (payload) => {
      this.reveal = payload;
      this.revealHighlight = false;
      this.clock.stop();
      this.stopTicker();
      sound.play('reveal');
      if (this.highlightHandle) clearTimeout(this.highlightHandle);
      this.highlightHandle = setTimeout(() => {
        this.revealHighlight = true;
      }, 1400);

      // Details sofort holen oder auf den Host warten -- je nach Konfiguration.
      if (this.roomState?.config.autoRevealAnswers) {
        void this.showRoundDetail();
      } else {
        this.roundDetailVisible = false;
      }
    });

    socket.on('leaderboard', (payload: LeaderboardPayload) => {
      this.leaderboard = payload.entries;
      this.leaderboardFinal = payload.final;
      sound.play('leaderboard');
    });

    socket.on('game_finished', (payload: GameFinishedPayload) => {
      this.leaderboard = payload.entries;
      this.leaderboardFinal = true;
      this.clock.stop();
      this.stopTicker();
      sound.play('finish');
      // Auswertung direkt nachladen, damit die Endkarte vollstaendig ist.
      void this.loadReview();
    });

    socket.on('player_joined', () => {
      sound.play('join');
    });

    socket.on('room_closed', ({ reason }) => {
      this.notice = reason;
      this.roomState = null;
      this.code = null;
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

  get isAuthenticated(): boolean {
    return typeof this.hostToken === 'string' && this.hostToken.length > 0;
  }

  setToken(token: string): void {
    this.hostToken = token;
    saveHostToken(token);
  }

  logout(): void {
    this.hostToken = null;
    this.code = null;
    this.roomState = null;
    clearHostToken();
  }

  private async command<T>(event: Parameters<typeof request>[0], extra: Record<string, unknown> = {}): Promise<boolean> {
    if (!this.hostToken || !this.code) {
      this.notice = 'Keine aktive Host-Sitzung.';
      return false;
    }
    this.busy = true;
    const result = await request<T>(event, { hostToken: this.hostToken, code: this.code, ...extra });
    this.busy = false;
    if (!result.ok) {
      this.notice = result.error.message;
      if (result.error.code === 'UNAUTHORIZED') this.logout();
      return false;
    }
    this.notice = null;
    return true;
  }

  async createGame(config: GameConfig): Promise<string | null> {
    if (!this.hostToken) {
      this.notice = 'Bitte zuerst als Host anmelden.';
      return null;
    }
    this.busy = true;
    const result = await request<{ code: string }>('host_create_game', { hostToken: this.hostToken, config });
    this.busy = false;
    if (!result.ok) {
      this.notice = result.error.message;
      if (result.error.code === 'UNAUTHORIZED') this.logout();
      return null;
    }
    return result.data.code;
  }

  async joinRoom(code: string): Promise<boolean> {
    if (!this.hostToken) {
      this.notice = 'Bitte zuerst als Host anmelden.';
      return false;
    }
    this.busy = true;
    const result = await request<RoomState>('host_join_room', { hostToken: this.hostToken, code });
    this.busy = false;
    if (!result.ok) {
      this.notice = result.error.message;
      if (result.error.code === 'UNAUTHORIZED') this.logout();
      return false;
    }
    this.code = result.data.code;
    this.roomState = result.data;
    this.question = result.data.question;
    if (result.data.phase === 'QUESTION' && result.data.deadlineMs) {
      this.clock.sync(
        result.data.serverTimeMs,
        result.data.deadlineMs,
        (result.data.question?.durationSeconds ?? 20) * 1000,
      );
    }
    return true;
  }

  start(): Promise<boolean> {
    return this.command<{ started: true }>('host_start_game');
  }

  revealAnswer(): Promise<boolean> {
    return this.command<{ revealed: true }>('host_reveal');
  }

  next(): Promise<boolean> {
    return this.command<{ finished: boolean }>('host_next');
  }

  showLeaderboard(): Promise<boolean> {
    return this.command<{ shown: true }>('host_show_leaderboard');
  }

  endGame(): Promise<boolean> {
    return this.command<{ ended: true }>('host_end_game');
  }

  kick(playerId: string): Promise<boolean> {
    return this.command<{ kicked: true }>('host_kick_player', { playerId });
  }

  /** Automatik anhalten oder fortsetzen. */
  setAutoPaused(paused: boolean): Promise<boolean> {
    return this.command<{ autoPaused: boolean }>('host_set_auto', { paused });
  }

  /** Blendet die Rundendetails ein und laedt sie bei Bedarf nach. */
  async showRoundDetail(): Promise<void> {
    this.roundDetailVisible = true;
    await this.loadReview();
  }

  async loadReview(): Promise<void> {
    if (!this.hostToken || !this.code) return;
    this.reviewLoading = true;
    const result = await request<GameReview>('host_get_review', { hostToken: this.hostToken, code: this.code });
    this.reviewLoading = false;
    if (result.ok) {
      this.review = result.data;
    } else if (result.error.code === 'UNAUTHORIZED') {
      this.logout();
    }
  }

  dismissNotice(): void {
    this.notice = null;
  }
}

export const hostGame = new HostGame();
