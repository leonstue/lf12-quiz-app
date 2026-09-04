export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 24;

/** Steuerzeichen (C0/C1) ohne Tab, LF und CR -- die werden unten zu Leerzeichen zusammengefasst. */
// eslint-disable-next-line no-control-regex -- genau diese Zeichen sollen entfernt werden
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
/** Zero-Width-, Bidi- und Word-Joiner-Tricks. */
const INVISIBLE_CHARS = /[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\uFEFF]/g;

/**
 * HTML-Escaping für Kontexte, in denen ein Nickname in Markup landen könnte.
 * Die Svelte-Templates escapen ohnehin -- das hier ist die zweite Verteidigungslinie.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Normalisiert einen Nickname:
 * - trimmen, Whitespace zusammenfassen
 * - Steuer- und unsichtbare Zeichen entfernen
 * - HTML-relevante Zeichen (< >) entfernen, damit kein Markup entstehen kann
 * - auf {@link NICKNAME_MAX_LENGTH} kürzen
 *
 * Gibt `null` zurück, wenn nichts Verwendbares übrig bleibt.
 */
export function sanitizeNickname(input: unknown): string | null {
  if (typeof input !== 'string') return null;

  const cleaned = input
    .replace(CONTROL_CHARS, '')
    .replace(INVISIBLE_CHARS, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NICKNAME_MAX_LENGTH)
    .trim();

  if (cleaned.length < NICKNAME_MIN_LENGTH) return null;
  return cleaned;
}

/** Vergleichsschlüssel für Duplikatprüfung (case- und whitespace-insensitiv). */
export function nicknameKey(nickname: string): string {
  return nickname.toLocaleLowerCase('de-DE').replace(/\s+/g, '');
}
