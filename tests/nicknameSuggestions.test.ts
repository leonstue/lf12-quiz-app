import { describe, expect, it } from 'vitest';

import { NICKNAME_SUGGESTIONS, randomNickname } from '../src/client/lib/nicknameSuggestions.js';
import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, nicknameKey, sanitizeNickname } from '../src/server/game/nickname.js';

describe('Nickname-Vorschläge', () => {
  it('bietet 80 Namen an', () => {
    expect(NICKNAME_SUGGESTIONS).toHaveLength(80);
  });

  it('enthält die Namen, die den Ton vorgeben', () => {
    expect(NICKNAME_SUGGESTIONS).toContain('LifelineLisa');
    expect(NICKNAME_SUGGESTIONS).toContain('ReturnRudolf');
  });

  it('überlebt die Entschärfung des Servers unverändert', () => {
    for (const name of NICKNAME_SUGGESTIONS) {
      expect(sanitizeNickname(name)).toBe(name);
    }
  });

  it('bleibt in den erlaubten Längen', () => {
    for (const name of NICKNAME_SUGGESTIONS) {
      expect(name.length).toBeGreaterThanOrEqual(NICKNAME_MIN_LENGTH);
      expect(name.length).toBeLessThanOrEqual(NICKNAME_MAX_LENGTH);
    }
  });

  it('kollidiert nicht untereinander -- auch nicht bei der Duplikatprüfung', () => {
    const keys = NICKNAME_SUGGESTIONS.map(nicknameKey);
    expect(new Set(keys).size).toBe(NICKNAME_SUGGESTIONS.length);
  });
});

describe('randomNickname', () => {
  it('liefert nur Namen aus der Liste', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(NICKNAME_SUGGESTIONS).toContain(randomNickname() as (typeof NICKNAME_SUGGESTIONS)[number]);
    }
  });

  it('wiederholt den ausgeschlossenen Namen nicht', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(randomNickname('ReturnRudolf')).not.toBe('ReturnRudolf');
    }
  });

  it('kommt mit einem unbekannten Ausschluss klar', () => {
    expect(NICKNAME_SUGGESTIONS).toContain(
      randomNickname('GibtsNichtInDerListe') as (typeof NICKNAME_SUGGESTIONS)[number],
    );
  });

  it('schöpft die Liste über viele Züge aus', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i += 1) seen.add(randomNickname());
    expect(seen.size).toBe(NICKNAME_SUGGESTIONS.length);
  });
});
