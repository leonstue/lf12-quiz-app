import { randomBytes } from 'node:crypto';

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
  if (secret && secret.length >= 8) return secret;

  if (isProduction) {
    throw new Error(
      'HOST_SECRET fehlt oder ist zu kurz (min. 8 Zeichen). Bitte in der .env setzen -- "make up" erzeugt automatisch einen Wert.',
    );
  }

  const generated = randomBytes(8).toString('hex');
  console.warn(`[config] Kein HOST_SECRET gesetzt. Entwicklungs-Secret: ${generated}`);
  return generated;
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
} as const;

export type AppConfig = typeof config;
