import { describe, expect, it } from 'vitest';

import { escapeHtml, nicknameKey, sanitizeNickname } from '../src/server/game/nickname.js';

describe('sanitizeNickname', () => {
  it('trimmt und akzeptiert normale Namen', () => {
    expect(sanitizeNickname('  Lisa  ')).toBe('Lisa');
    expect(sanitizeNickname('Max Mustermann')).toBe('Max Mustermann');
    expect(sanitizeNickname('Jörg-Uwe')).toBe('Jörg-Uwe');
  });

  it('lehnt zu kurze Namen ab', () => {
    expect(sanitizeNickname('a')).toBeNull();
    expect(sanitizeNickname('  ')).toBeNull();
    expect(sanitizeNickname('')).toBeNull();
  });

  it('kürzt auf 24 Zeichen', () => {
    const result = sanitizeNickname('X'.repeat(80));
    expect(result).not.toBeNull();
    expect(result).toHaveLength(24);
  });

  it('entfernt HTML-relevante Zeichen, sodass kein Markup entstehen kann', () => {
    const result = sanitizeNickname('<img src=x onerror=alert(1)>');
    expect(result).not.toBeNull();
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('entfernt Skript-Tags vollständig als Markup', () => {
    const result = sanitizeNickname('<script>alert(1)</script>');
    expect(result).not.toBeNull();
    expect(result).not.toMatch(/[<>]/);
  });

  it('entfernt Steuer- und unsichtbare Zeichen', () => {
    const withControl = sanitizeNickname('Ann' + String.fromCharCode(0x07) + 'a' + String.fromCharCode(0x200b) + String.fromCharCode(0x202e));
    expect(withControl).toBe('Anna');
  });

  it('fasst Whitespace zusammen', () => {
    expect(sanitizeNickname('Anna    Lena')).toBe('Anna Lena');
    expect(sanitizeNickname('Anna\n\tLena')).toBe('Anna Lena');
  });

  it('ist robust gegen Nicht-Strings', () => {
    expect(sanitizeNickname(undefined)).toBeNull();
    expect(sanitizeNickname(null)).toBeNull();
    expect(sanitizeNickname(1234)).toBeNull();
    expect(sanitizeNickname({ nickname: 'Anna' })).toBeNull();
    expect(sanitizeNickname(['Anna'])).toBeNull();
  });
});

describe('escapeHtml', () => {
  it('escaped alle relevanten Zeichen', () => {
    expect(escapeHtml('<b>&"\'')).toBe('&lt;b&gt;&amp;&quot;&#39;');
  });
});

describe('nicknameKey', () => {
  it('ignoriert Groß-/Kleinschreibung und Leerzeichen', () => {
    expect(nicknameKey('Anna Lena')).toBe(nicknameKey('annalena'));
    expect(nicknameKey('LISA')).toBe(nicknameKey('lisa'));
  });

  it('unterscheidet verschiedene Namen', () => {
    expect(nicknameKey('Anna')).not.toBe(nicknameKey('Anne'));
  });
});
