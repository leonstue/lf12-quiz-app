import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

/**
 * Basis-URL für QR-Codes und die auf der Beameransicht angezeigte Join-Adresse.
 * Ist nichts konfiguriert, liefert der Server relative Pfade aus und der
 * Client ergänzt seinen eigenen Origin.
 */
function resolvePublicBaseUrl(): string | null {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const domain = process.env.DOMAIN?.trim();
  if (domain && domain !== 'quiz.example.de') {
    return `https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  }
  return null;
}

function resolveHostSecret(): string {
  const secret = process.env.HOST_SECRET?.trim();
  // Bewusst nur "nicht leer": Ein manuell gesetztes Kurz-Secret ist erlaubt.
  // Gegen Erraten schuetzt das Rate-Limit von 10 Login-Versuchen pro Minute und IP.
  if (secret && secret.length >= 1) {
    if (secret.length < 8) {
      console.warn(`[config] HOST_SECRET ist sehr kurz (${secret.length} Zeichen). Fuer oeffentliche Server nicht empfohlen.`);
    }
    return secret;
  }

  if (isProduction) {
    throw new Error(
      'HOST_SECRET fehlt. Bitte in der .env setzen -- "make up" erzeugt automatisch einen Wert.',
    );
  }

  const generated = randomBytes(8).toString('hex');
  console.warn(`[config] Kein HOST_SECRET gesetzt. Entwicklungs-Secret: ${generated}`);
  return generated;
}

/**
 * Verzeichnis mit den Quiz-Dateien. Im Container liegt es unter /app/quizzes,
 * in der Entwicklung im Projektverzeichnis.
 */
function resolveQuizzesDir(): string {
  const explicit = process.env.QUIZZES_DIR?.trim();
  if (explicit) return explicit;
  return resolve(process.cwd(), 'quizzes');
}

export const config = {
  nodeEnv,
  isProduction,
  port: readInt(process.env.PORT, 3000),
  host: process.env.HOST_BIND ?? '0.0.0.0',
  hostSecret: resolveHostSecret(),
  publicBaseUrl: resolvePublicBaseUrl(),
  /** Maximale Teilnehmerzahl pro Raum. */
  maxPlayersPerRoom: readInt(process.env.MAX_PLAYERS, 300),
  /** Maximale Anzahl gleichzeitiger Räume. */
  maxRooms: readInt(process.env.MAX_ROOMS, 50),
  /** Räume ohne Aktivität werden nach dieser Zeit aufgeräumt. */
  roomTtlMs: readInt(process.env.ROOM_TTL_MINUTES, 240) * 60_000,
  /** Gültigkeit eines Host-Tokens. */
  hostTokenTtlMs: readInt(process.env.HOST_TOKEN_TTL_MINUTES, 480) * 60_000,
  /** Kulanz in ms, damit Netzwerklatenz keine gültige Antwort verwirft. */
  answerGraceMs: readInt(process.env.ANSWER_GRACE_MS, 750),
  /** Verzeichnis mit den Quiz-Dateien (*.json). */
  quizzesDir: resolveQuizzesDir(),
} as const;

export type AppConfig = typeof config;
