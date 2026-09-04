import { describe, expect, it } from 'vitest';

import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  generateRoomCode,
  generateUniqueRoomCode,
  isValidRoomCodeFormat,
  normalizeRoomCode,
} from '../src/server/game/roomCode.js';

describe('generateRoomCode', () => {
  it('erzeugt sechsstellige Codes', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH);
    }
  });

  it('verwendet nur Zeichen aus dem lesbaren Alphabet', () => {
    for (let i = 0; i < 500; i += 1) {
      for (const char of generateRoomCode()) {
        expect(ROOM_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it('vermeidet leicht verwechselbare Zeichen', () => {
    for (const char of ['0', 'O', '1', 'I', 'L', '5', 'S', '8', 'B', 'U', 'V']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(char);
    }
  });

  it('erzeugt praktisch immer unterschiedliche Codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 2_000; i += 1) codes.add(generateRoomCode());
    // Bei 25^6 Möglichkeiten sind Kollisionen extrem selten.
    expect(codes.size).toBeGreaterThan(1_990);
  });
});

describe('generateUniqueRoomCode', () => {
  it('umgeht belegte Codes', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const code = generateUniqueRoomCode((candidate) => taken.has(candidate));
      expect(taken.has(code)).toBe(false);
      taken.add(code);
    }
    expect(taken.size).toBe(50);
  });

  it('verlängert den Code, wenn alles belegt scheint', () => {
    let calls = 0;
    const code = generateUniqueRoomCode(() => {
      calls += 1;
      return calls <= 200;
    }, 200);
    expect(code.length).toBeGreaterThan(ROOM_CODE_LENGTH);
  });

  it('wirft, wenn dauerhaft kein Code frei ist', () => {
    expect(() => generateUniqueRoomCode(() => true, 5)).toThrow();
  });
});

describe('normalizeRoomCode', () => {
  it('normalisiert Nutzereingaben', () => {
    expect(normalizeRoomCode(' 7f3-k9q ')).toBe('7F3K9Q');
    expect(normalizeRoomCode('7f3k9q')).toBe('7F3K9Q');
  });

  it('ist robust gegen Nicht-Strings', () => {
    expect(normalizeRoomCode(undefined)).toBe('');
    expect(normalizeRoomCode(null)).toBe('');
    expect(normalizeRoomCode(42)).toBe('');
    expect(normalizeRoomCode({ code: 'X' })).toBe('');
  });

  it('begrenzt die Länge', () => {
    expect(normalizeRoomCode('A'.repeat(200)).length).toBeLessThanOrEqual(ROOM_CODE_LENGTH + 4);
  });
});

describe('isValidRoomCodeFormat', () => {
  it('akzeptiert gültige Codes', () => {
    expect(isValidRoomCodeFormat('7F3K9Q')).toBe(true);
  });

  it('lehnt zu kurze oder ungültige Codes ab', () => {
    expect(isValidRoomCodeFormat('7F3K')).toBe(false);
    expect(isValidRoomCodeFormat('7f3k9q')).toBe(false);
    expect(isValidRoomCodeFormat('')).toBe(false);
  });
});
