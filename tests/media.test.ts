import { describe, expect, it } from 'vitest';

import { MediaError, MediaStore, contentTypeFor, resolveInside, sniffImageType } from '../src/server/quiz/media.js';

/** Kleinstmögliche gültige Dateien der jeweiligen Formate. */
const png = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c630001000005000' +
    '10d0a2db40000000049454e44ae426082',
  'hex',
);
const gif = Buffer.from('474946383961010001008000000000ffffff21f90401000000002c00000000010001000002024401003b', 'hex');
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
const avif = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(8)]);

describe('sniffImageType', () => {
  it('erkennt die unterstützten Formate am Dateianfang', () => {
    expect(sniffImageType(png)).toBe('.png');
    expect(sniffImageType(gif)).toBe('.gif');
    expect(sniffImageType(jpeg)).toBe('.jpg');
    expect(sniffImageType(webp)).toBe('.webp');
    expect(sniffImageType(avif)).toBe('.avif');
  });

  it('lehnt alles andere ab -- auch getarnte Inhalte', () => {
    expect(sniffImageType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImageType(Buffer.from('%PDF-1.7 und noch etwas mehr'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
    expect(sniffImageType(Buffer.alloc(5))).toBeNull();
  });
});

describe('resolveInside', () => {
  it('erlaubt Pfade innerhalb des Verzeichnisses', () => {
    expect(resolveInside('/basis', 'bild.png')).not.toBeNull();
    expect(resolveInside('/basis', 'unter/bild.png')).not.toBeNull();
  });

  it('blockiert alles, was das Verzeichnis verlässt', () => {
    for (const bad of ['../geheim', 'a/../../b', '/etc/passwd', 'C:/x', '', 'a//b', 'a/./../../b']) {
      expect(resolveInside('/basis', bad)).toBeNull();
    }
  });
});

describe('contentTypeFor', () => {
  it('bestimmt den Typ aus der Endung', () => {
    expect(contentTypeFor('a.png')).toBe('image/png');
    expect(contentTypeFor('a.SVG')).toBe('image/svg+xml');
    expect(contentTypeFor('a.exe')).toBeNull();
    expect(contentTypeFor('ohne-endung')).toBeNull();
  });
});

describe('MediaStore', () => {
  it('nimmt ein Bild auf und liefert einen entschärften Pfad', () => {
    const store = new MediaStore();
    const path = store.add('Mein Bild! (2).png', png);

    expect(path).toBe('uploads/mein-bild-2.png');
    expect(store.get(path)?.contentType).toBe('image/png');
    expect(store.count).toBe(1);
    expect(store.list()).toEqual([path]);
  });

  it('richtet sich nach dem Inhalt, nicht nach der Endung', () => {
    const store = new MediaStore();
    // Als .jpg benannt, tatsächlich ein PNG -> landet als .png
    expect(store.add('foto.jpg', png)).toBe('uploads/foto.png');
  });

  it('vergibt einen Ersatznamen, wenn nichts Brauchbares übrig bleibt', () => {
    const store = new MediaStore();
    expect(store.add('///...///', png)).toBe('uploads/bild.png');
    expect(store.add(undefined, gif)).toBe('uploads/bild.gif');
  });

  it('lehnt Inhalte ab, die kein unterstütztes Bild sind', () => {
    const store = new MediaStore();
    expect(() => store.add('x.png', Buffer.from('<html>kein Bild</html>'))).toThrow(MediaError);
    expect(() => store.add('x.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toThrow(/PNG/);
    expect(store.count).toBe(0);
  });

  it('begrenzt die Größe einer einzelnen Datei', () => {
    const store = new MediaStore({ maxFileBytes: 100, maxTotalBytes: 1_000, maxFiles: 5 });
    const big = Buffer.concat([png, Buffer.alloc(200)]);
    try {
      store.add('gross.png', big);
      throw new Error('haette werfen muessen');
    } catch (error) {
      expect((error as MediaError).code).toBe('LIMIT');
    }
  });

  it('begrenzt die Gesamtgröße', () => {
    const store = new MediaStore({ maxFileBytes: 10_000, maxTotalBytes: png.length + 5, maxFiles: 10 });
    store.add('eins.png', png);
    try {
      store.add('zwei.png', png);
      throw new Error('haette werfen muessen');
    } catch (error) {
      expect((error as MediaError).code).toBe('LIMIT');
    }
  });

  it('begrenzt die Anzahl der Dateien', () => {
    const store = new MediaStore({ maxFileBytes: 10_000, maxTotalBytes: 1_000_000, maxFiles: 1 });
    store.add('eins.png', png);
    expect(() => store.add('zwei.png', gif)).toThrow(MediaError);
  });

  it('ersetzt eine gleichnamige Datei, ohne das Limit zu verbrauchen', () => {
    const store = new MediaStore({ maxFileBytes: 10_000, maxTotalBytes: 1_000_000, maxFiles: 1 });
    store.add('eins.png', png);
    store.add('eins.png', png);
    expect(store.count).toBe(1);
  });

  it('entfernt Bilder wieder', () => {
    const store = new MediaStore();
    const path = store.add('weg.png', png);
    store.remove(path);
    expect(store.get(path)).toBeUndefined();
    expect(store.count).toBe(0);
  });

  it('meldet das Entfernen unbekannter Pfade', () => {
    const store = new MediaStore();
    try {
      store.remove('uploads/gibtsnicht.png');
      throw new Error('haette werfen muessen');
    } catch (error) {
      expect((error as MediaError).code).toBe('NOT_FOUND');
    }
  });

  it('rechnet die belegte Größe mit', () => {
    const store = new MediaStore();
    expect(store.totalBytes).toBe(0);
    store.add('a.png', png);
    expect(store.totalBytes).toBe(png.length);
  });
});
