import type { Server as HttpServer } from 'node:http';

import { Server, type Socket } from 'socket.io';

import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from '../shared/events.js';
import type { Ack, SocketError } from '../shared/types.js';
import { config } from './config.js';
import { GameManager } from './game/GameManager.js';
import { normalizeRoomCode } from './game/roomCode.js';
import type { Room, RoomEmitter } from './game/Room.js';
import type { HostAuth } from './hostAuth.js';
import { createLogger } from './logger.js';
import { RateLimiter } from './rateLimit.js';

const log = createLogger('socket');

type QuizSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type QuizServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const roomChannel = (code: string) => `room:${code}`;
const playerChannel = (playerId: string) => `player:${playerId}`;

function errorResult(code: SocketError['code'], message: string) {
  return { ok: false as const, error: { code, message } };
}

/** Ruft `ack` nur auf, wenn der Client tatsächlich einen Callback geschickt hat. */
function safeAck<T>(ack: unknown, result: Parameters<Ack<T>>[0]): void {
  if (typeof ack === 'function') {
    try {
      (ack as Ack<T>)(result);
    } catch (error) {
      log.warn('Ack konnte nicht zugestellt werden', { error: String(error) });
    }
  }
}

export interface SocketLayer {
  io: QuizServer;
  games: GameManager;
}

export function createSocketLayer(httpServer: HttpServer, hostAuth: HostAuth): SocketLayer {
  const io: QuizServer = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    // Long-Polling als Fallback belassen: funktioniert auch, wenn ein Proxy
    // kein WebSocket-Upgrade durchreicht.
    transports: ['websocket', 'polling'],
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 8_000,
    cors: config.isProduction ? { origin: false } : { origin: true, credentials: true },
  });

  const emitter: RoomEmitter = {
    toRoom(code, event, payload) {
      io.to(roomChannel(code)).emit(event as keyof ServerToClientEvents, payload as never);
    },
    toPlayer(playerId, event, payload) {
      io.to(playerChannel(playerId)).emit(event as keyof ServerToClientEvents, payload as never);
    },
  };

  const games = new GameManager({
    emitter,
    publicBaseUrl: config.publicBaseUrl,
    maxRooms: config.maxRooms,
    maxPlayers: config.maxPlayersPerRoom,
    answerGraceMs: config.answerGraceMs,
    roomTtlMs: config.roomTtlMs,
  });
  games.startSweeper();

  // Wichtig: Eine ganze Schulklasse sitzt hinter EINER oeffentlichen IP.
  // Deshalb ist das enge Limit an die Socket-Verbindung gebunden (ein Browser =
  // ein Socket); das IP-Limit ist nur ein grober Missbrauchsschutz.
  const joinSocketLimiter = new RateLimiter(8, 60_000);
  const joinIpLimiter = new RateLimiter(400, 60_000);
  const reconnectLimiter = new RateLimiter(60, 60_000);
  const answerLimiter = new RateLimiter(40, 60_000);
  const hostLimiter = new RateLimiter(240, 60_000);
  for (const limiter of [joinSocketLimiter, joinIpLimiter, reconnectLimiter, answerLimiter, hostLimiter]) {
    limiter.startCleanup();
  }

  function clientKey(socket: QuizSocket): string {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
    return (first ?? socket.handshake.address ?? socket.id).trim();
  }

  /** Prüft Host-Token und liefert den zugehörigen Raum. */
  function requireHostRoom(socket: QuizSocket, payload: unknown) {
    if (!hostLimiter.take(socket.id)) {
      return errorResult('RATE_LIMITED', 'Zu viele Host-Aktionen. Bitte kurz warten.');
    }
    const data = (payload ?? {}) as { hostToken?: unknown; code?: unknown };
    if (!hostAuth.verifyToken(data.hostToken)) {
      log.warn('Host-Kommando ohne gültiges Token abgelehnt', { socket: socket.id });
      return errorResult('UNAUTHORIZED', 'Host-Sitzung abgelaufen. Bitte erneut anmelden.');
    }
    const room = games.getRoom(data.code);
    if (!room) {
      return errorResult('ROOM_NOT_FOUND', 'Dieser Raum existiert nicht (mehr).');
    }
    return { ok: true as const, room };
  }

  io.on('connection', (socket: QuizSocket) => {
    log.debug('Socket verbunden', { socket: socket.id });

    // ------------------------------------------------------------ Teilnehmer

    socket.on('join_room', (payload, ack) => {
      try {
        if (!joinSocketLimiter.take(socket.id) || !joinIpLimiter.take(clientKey(socket))) {
          safeAck(ack, errorResult('RATE_LIMITED', 'Zu viele Beitrittsversuche. Bitte kurz warten.'));
          return;
        }
        const data = (payload ?? {}) as { code?: unknown; nickname?: unknown };
        const code = normalizeRoomCode(data.code);
        const room = games.getRoom(code);
        if (!room) {
          safeAck(ack, errorResult('ROOM_NOT_FOUND', 'Kein Raum mit diesem Code gefunden.'));
          return;
        }

        const result = room.addPlayer(data.nickname, socket.id);
        if (!result.ok) {
          safeAck(ack, result);
          return;
        }

        const player = result.data;
        void socket.join([roomChannel(room.code), playerChannel(player.id)]);
        socket.data.roomCode = room.code;
        socket.data.playerId = player.id;
        socket.data.isHost = false;

        safeAck(ack, {
          ok: true,
          data: {
            playerToken: player.token,
            playerId: player.id,
            nickname: player.nickname,
            roomCode: room.code,
          },
        });
        socket.emit('room_state', room.getState());
      } catch (error) {
        log.error('join_room fehlgeschlagen', { error: String(error) });
        safeAck(ack, errorResult('INVALID_PAYLOAD', 'Beitritt fehlgeschlagen.'));
      }
    });

    socket.on('reconnect_player', (payload, ack) => {
      try {
        if (!reconnectLimiter.take(socket.id)) {
          safeAck(ack, errorResult('RATE_LIMITED', 'Zu viele Versuche. Bitte kurz warten.'));
          return;
        }
        const data = (payload ?? {}) as { code?: unknown; playerToken?: unknown };
        const room = games.getRoom(data.code);
        if (!room) {
          safeAck(ack, errorResult('ROOM_NOT_FOUND', 'Der Raum existiert nicht mehr.'));
          return;
        }
        const result = room.reconnectPlayer(data.playerToken, socket.id);
        if (!result.ok) {
          safeAck(ack, result);
          return;
        }

        const player = result.data;
        void socket.join([roomChannel(room.code), playerChannel(player.id)]);
        socket.data.roomCode = room.code;
        socket.data.playerId = player.id;
        socket.data.isHost = false;

        safeAck(ack, {
          ok: true,
          data: {
            playerToken: player.token,
            playerId: player.id,
            nickname: player.nickname,
            roomCode: room.code,
          },
        });

        socket.emit('room_state', room.getState());

        // Laufenden Rundenzustand nachliefern.
        const submitted = room.getSubmittedAnswer(player.id);
        if (submitted) {
          socket.emit('answer_locked', {
            roundIndex: room.getState().roundIndex,
            answer: submitted,
            answeredCount: room.answeredCount,
            playerCount: room.playerCount,
          });
        }
        const personal = room.getPersonalResult(player.id);
        if (personal && (room.phase === 'REVEAL' || room.phase === 'LEADERBOARD')) {
          socket.emit('personal_result', personal);
        }
        if (room.phase === 'LEADERBOARD' || room.phase === 'FINISHED') {
          socket.emit('leaderboard', {
            entries: room.buildLeaderboard(10),
            final: room.phase === 'FINISHED',
            roundIndex: room.getState().roundIndex,
            totalRounds: room.totalRounds,
          });
        }
      } catch (error) {
        log.error('reconnect_player fehlgeschlagen', { error: String(error) });
        safeAck(ack, errorResult('INVALID_PAYLOAD', 'Reconnect fehlgeschlagen.'));
      }
    });

    socket.on('submit_answer', (payload, ack) => {
      try {
        if (!answerLimiter.take(socket.id)) {
          safeAck(ack, errorResult('RATE_LIMITED', 'Zu viele Antwortversuche.'));
          return;
        }
        const { roomCode, playerId } = socket.data;
        if (!roomCode || !playerId) {
          safeAck(ack, errorResult('UNKNOWN_PLAYER', 'Nicht in einem Raum angemeldet.'));
          return;
        }
        const room = games.getRoom(roomCode);
        if (!room) {
          safeAck(ack, errorResult('ROOM_NOT_FOUND', 'Der Raum existiert nicht mehr.'));
          return;
        }
        const data = (payload ?? {}) as { roundIndex?: unknown; answer?: unknown };
        safeAck(ack, room.submitAnswer(playerId, data.roundIndex, data.answer));
      } catch (error) {
        log.error('submit_answer fehlgeschlagen', { error: String(error) });
        safeAck(ack, errorResult('INVALID_PAYLOAD', 'Antwort konnte nicht verarbeitet werden.'));
      }
    });

    socket.on('leave_room', (_payload, ack) => {
      try {
        const { roomCode, playerId } = socket.data;
        if (roomCode && playerId) {
          games.getRoom(roomCode)?.removePlayer(playerId);
          void socket.leave(roomChannel(roomCode));
          void socket.leave(playerChannel(playerId));
        }
        socket.data.roomCode = undefined;
        socket.data.playerId = undefined;
        safeAck(ack, { ok: true, data: { left: true } });
      } catch (error) {
        log.error('leave_room fehlgeschlagen', { error: String(error) });
        safeAck(ack, errorResult('INVALID_PAYLOAD', 'Verlassen fehlgeschlagen.'));
      }
    });

    // ------------------------------------------------------------------ Host

    socket.on('host_create_game', (payload, ack) => {
      try {
        if (!hostLimiter.take(socket.id)) {
          safeAck(ack, errorResult('RATE_LIMITED', 'Zu viele Anfragen. Bitte kurz warten.'));
          return;
        }
        const data = (payload ?? {}) as { hostToken?: unknown; config?: unknown };
        if (!hostAuth.verifyToken(data.hostToken)) {
          safeAck(ack, errorResult('UNAUTHORIZED', 'Host-Sitzung abgelaufen. Bitte erneut anmelden.'));
          return;
        }
        const room = games.createRoom(data.config as never);
        safeAck(ack, { ok: true, data: { code: room.code } });
      } catch (error) {
        log.error('host_create_game fehlgeschlagen', { error: String(error) });
        safeAck(ack, errorResult('INVALID_STATE', 'Die Session konnte nicht erstellt werden.'));
      }
    });

    socket.on('host_join_room', (payload, ack) => {
      try {
        const guard = requireHostRoom(socket, payload);
        if (!guard.ok) {
          safeAck(ack, guard);
          return;
        }
        void socket.join(roomChannel(guard.room.code));
        socket.data.roomCode = guard.room.code;
        socket.data.isHost = true;
        safeAck(ack, { ok: true, data: guard.room.getState() });
      } catch (error) {
        log.error('host_join_room fehlgeschlagen', { error: String(error) });
        safeAck(ack, errorResult('INVALID_STATE', 'Beitritt zur Host-Ansicht fehlgeschlagen.'));
      }
    });

    const hostCommand = <T>(
      payload: unknown,
      ack: unknown,
      action: (room: Room) => { ok: true; data: T } | { ok: false; error: SocketError },
    ) => {
      try {
        const guard = requireHostRoom(socket, payload);
        if (!guard.ok) {
          safeAck(ack, guard);
          return;
        }
        safeAck(ack, action(guard.room));
      } catch (error) {
        log.error('Host-Kommando fehlgeschlagen', { error: String(error) });
        safeAck(ack, errorResult('INVALID_STATE', 'Aktion fehlgeschlagen.'));
      }
    };

    socket.on('host_start_game', (payload, ack) => hostCommand(payload, ack, (room) => room.start()));
    socket.on('host_reveal', (payload, ack) => hostCommand(payload, ack, (room) => room.reveal()));
    socket.on('host_next', (payload, ack) => hostCommand(payload, ack, (room) => room.next()));
    socket.on('host_show_leaderboard', (payload, ack) => hostCommand(payload, ack, (room) => room.showLeaderboard()));
    socket.on('host_end_game', (payload, ack) => hostCommand(payload, ack, (room) => room.end()));

    socket.on('host_set_auto', (payload, ack) => {
      hostCommand(payload, ack, (room) => {
        const data = (payload ?? {}) as { paused?: unknown };
        return room.setAutoPaused(data.paused === true);
      });
    });

    socket.on('host_get_review', (payload, ack) => {
      hostCommand(payload, ack, (room) => ({ ok: true as const, data: room.buildReview() }));
    });

    socket.on('host_kick_player', (payload, ack) => {
      hostCommand(payload, ack, (room) => {
        const data = (payload ?? {}) as { playerId?: unknown };
        if (typeof data.playerId !== 'string' || !room.removePlayer(data.playerId)) {
          return errorResult('UNKNOWN_PLAYER', 'Teilnehmer nicht gefunden.');
        }
        return { ok: true as const, data: { kicked: true as const } };
      });
    });

    // ------------------------------------------------------------ Verbindung

    socket.on('disconnect', (reason) => {
      const { roomCode, playerId, isHost } = socket.data;
      if (roomCode && playerId && !isHost) {
        // socket.id mitgeben: Ein bereits abgeloester Socket darf den
        // inzwischen wieder verbundenen Spieler nicht offline schalten.
        games.getRoom(roomCode)?.markDisconnected(playerId, socket.id);
      }
      log.debug('Socket getrennt', { socket: socket.id, reason });
    });

    socket.on('error', (error) => {
      log.warn('Socket-Fehler', { socket: socket.id, error: String(error) });
    });
  });

  return { io, games };
}
