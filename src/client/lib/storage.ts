/** localStorage-Zugriffe scheitern in Private-Modi -- deshalb immer gekapselt. */
function safeStorage(): Storage | null {
  try {
    const probe = '__sc_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const store = typeof window === 'undefined' ? null : safeStorage();
const memoryFallback = new Map<string, string>();

export function readValue(key: string): string | null {
  if (store) {
    try {
      return store.getItem(key);
    } catch {
      return memoryFallback.get(key) ?? null;
    }
  }
  return memoryFallback.get(key) ?? null;
}

export function writeValue(key: string, value: string): void {
  memoryFallback.set(key, value);
  try {
    store?.setItem(key, value);
  } catch {
    /* Speicher voll oder blockiert -- In-Memory reicht für die Session. */
  }
}

export function removeValue(key: string): void {
  memoryFallback.delete(key);
  try {
    store?.removeItem(key);
  } catch {
    /* ignorieren */
  }
}

export interface PlayerSession {
  roomCode: string;
  playerToken: string;
  nickname: string;
}

const SESSION_KEY = 'sc.player.session';
const HOST_TOKEN_KEY = 'sc.host.token';
const SOUND_KEY = 'sc.sound.enabled';

export function loadPlayerSession(): PlayerSession | null {
  const raw = readValue(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PlayerSession>;
    if (
      typeof parsed?.roomCode === 'string' &&
      typeof parsed?.playerToken === 'string' &&
      typeof parsed?.nickname === 'string'
    ) {
      return { roomCode: parsed.roomCode, playerToken: parsed.playerToken, nickname: parsed.nickname };
    }
  } catch {
    /* kaputter Eintrag -- verwerfen */
  }
  removeValue(SESSION_KEY);
  return null;
}

export function savePlayerSession(session: PlayerSession): void {
  writeValue(SESSION_KEY, JSON.stringify(session));
}

export function clearPlayerSession(): void {
  removeValue(SESSION_KEY);
}

export function loadHostToken(): string | null {
  return readValue(HOST_TOKEN_KEY);
}

export function saveHostToken(token: string): void {
  writeValue(HOST_TOKEN_KEY, token);
}

export function clearHostToken(): void {
  removeValue(HOST_TOKEN_KEY);
}

export function loadSoundEnabled(): boolean {
  return readValue(SOUND_KEY) !== '0';
}

export function saveSoundEnabled(enabled: boolean): void {
  writeValue(SOUND_KEY, enabled ? '1' : '0');
}
