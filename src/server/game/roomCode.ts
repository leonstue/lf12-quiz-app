import { randomInt } from 'node:crypto';

/**
 * Gut lesbares Alphabet: ohne 0/O, 1/I/L, 5/S, 8/B, U/V.
 * Damit lassen sich Codes vom Beamer fehlerfrei abtippen.
 */
export const ROOM_CODE_ALPHABET = '234679ACDEFGHJKMNPQRTWXYZ';

export const ROOM_CODE_LENGTH = 6;

/** Erzeugt einen zufälligen, gut lesbaren Raumcode. */
export function generateRoomCode(length: number = ROOM_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Erzeugt einen Code, der laut `isTaken` noch frei ist.
 * Nach zu vielen Kollisionen wird der Code verlängert, damit die Funktion
 * garantiert terminiert.
 */
export function generateUniqueRoomCode(isTaken: (code: string) => boolean, maxAttempts = 200): string {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateRoomCode();
    if (!isTaken(code)) return code;
  }
  for (let extra = 1; extra <= 4; extra += 1) {
    const code = generateRoomCode(ROOM_CODE_LENGTH + extra);
    if (!isTaken(code)) return code;
  }
  throw new Error('Es konnte kein freier Raumcode erzeugt werden.');
}

/** Normalisiert Nutzereingaben (Kleinbuchstaben, Leerzeichen, Bindestriche). */
export function normalizeRoomCode(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH + 4);
}

export function isValidRoomCodeFormat(code: string): boolean {
  return code.length >= ROOM_CODE_LENGTH && code.length <= ROOM_CODE_LENGTH + 4 && /^[A-Z0-9]+$/.test(code);
}
