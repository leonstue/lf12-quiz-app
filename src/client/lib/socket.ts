import { io, type Socket } from 'socket.io-client';

import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/events.js';
import type { QuizSummary, SocketError } from '../../shared/types.js';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let instance: ClientSocket | null = null;

export function getSocket(): ClientSocket {
  if (!instance) {
    instance = io({
      path: '/socket.io',
      // WebSocket bevorzugt, Polling als Fallback (z. B. restriktive Schul-WLANs).
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
      timeout: 10_000,
    });
  }
  return instance;
}

export type AckResult<T> = { ok: true; data: T } | { ok: false; error: SocketError };

interface LooseEmitter {
  emit(event: string, payload: unknown, ack: (result: unknown) => void): void;
}

function isAckResult<T>(value: unknown): value is AckResult<T> {
  return typeof value === 'object' && value !== null && 'ok' in value;
}

/** Emit mit Ack und Timeout -- der Aufrufer bekommt immer ein Ergebnis. */
export function request<T>(event: keyof ClientToServerEvents, payload: unknown, timeoutMs = 10_000): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    const socket = getSocket();
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        error: { code: 'INVALID_STATE', message: 'Der Server antwortet nicht. Bitte Verbindung prüfen.' },
      });
    }, timeoutMs);

    const emitter = socket as unknown as LooseEmitter;
    emitter.emit(event as string, payload, (result: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (isAckResult<T>(result)) {
        resolve(result);
      } else {
        resolve({ ok: false, error: { code: 'INVALID_PAYLOAD', message: 'Unerwartete Serverantwort.' } });
      }
    });
  });
}

export async function hostLogin(secret: string): Promise<{ ok: true; hostToken: string } | { ok: false; error: string }> {
  try {
    const response = await fetch('/api/host/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret }),
    });
    const data = (await response.json()) as { ok?: boolean; hostToken?: string; error?: string };
    if (response.ok && data.ok && typeof data.hostToken === 'string') {
      return { ok: true, hostToken: data.hostToken };
    }
    if (response.status === 429) {
      return { ok: false, error: 'Zu viele Anmeldeversuche. Bitte eine Minute warten.' };
    }
    return { ok: false, error: data.error ?? 'Anmeldung fehlgeschlagen.' };
  } catch {
    return { ok: false, error: 'Der Server ist nicht erreichbar.' };
  }
}

export interface QuizListResult {
  quizzes: QuizSummary[];
  errors: { file: string; message: string }[];
}

/** Auswahlliste der Quizze -- enthaelt weder Fragen noch Loesungen. */
export async function fetchQuizzes(): Promise<QuizListResult> {
  try {
    const response = await fetch('/api/quizzes');
    if (!response.ok) return { quizzes: [], errors: [] };
    return (await response.json()) as QuizListResult;
  } catch {
    return { quizzes: [], errors: [] };
  }
}

export interface RoomProbe {
  exists: boolean;
  phase?: string;
  joinable?: boolean;
  playerCount?: number;
}

export async function probeRoom(code: string): Promise<RoomProbe> {
  try {
    const response = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
    if (!response.ok) return { exists: false };
    return (await response.json()) as RoomProbe;
  } catch {
    return { exists: false };
  }
}
