import { extname, resolve, sep } from 'node:path';

import { createLogger } from '../logger.js';

const log = createLogger('media');

export const MEDIA_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

export function contentTypeFor(path: string): string | null {
  return MEDIA_CONTENT_TYPES[extname(path).toLowerCase()] ?? null;
}

/**
 * Löst einen relativen Pfad innerhalb eines Wurzelverzeichnisses auf.
 * Gibt `null` zurück, sobald der Pfad das Verzeichnis verlassen würde.
 */
export function resolveInside(root: string, relative: string): string | null {
  if (relative.length === 0 || relative.length > 200) return null;
  if (relative.startsWith('/') || relative.startsWith('\\') || /^[a-z]:/i.test(relative)) return null;
  if (relative.split(/[\\/]/).some((segment) => segment === '..' || segment === '')) return null;

  const base = resolve(root);
  const target = resolve(base, relative);
  return target === base || target.startsWith(base + sep) ? target : null;
}

export class MediaError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID' | 'LIMIT' | 'NOT_FOUND',
  ) {
    super(message);
  }
}

/**
 * Erkennt den Bildtyp am Dateianfang. Der Dateiname zaehlt bewusst nicht --
 * sonst koennte beliebiger Inhalt als Bild ausgeliefert werden.
 *
 * SVG ist absichtlich nicht dabei: Eine SVG-Datei darf Skripte enthalten und
 * wuerde vom selben Ursprung ausgeliefert. SVGs im Ordner quizzes/media sind
 * dagegen in Ordnung -- die stammen aus dem Repository.
 */
export function sniffImageType(data: Buffer): string | null {
  if (data.length < 12) return null;

  const startsWith = (...bytes: number[]): boolean => bytes.every((byte, index) => data[index] === byte);
  const ascii = (offset: number, text: string): boolean => data.subarray(offset, offset + text.length).toString('latin1') === text;

  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return '.png';
  if (startsWith(0xff, 0xd8, 0xff)) return '.jpg';
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return '.gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return '.webp';
  // ISO-BMFF: Laenge, dann 'ftyp', dann die Marke.
  if (ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis'))) return '.avif';

  return null;
}

export interface StoredImage {
  data: Buffer;
  contentType: string;
  size: number;
  uploadedAt: number;
}

export interface MediaLimits {
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
}

export const DEFAULT_MEDIA_LIMITS: MediaLimits = {
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 24 * 1024 * 1024,
  maxFiles: 40,
};

/**
 * Vom Host hochgeladene Bilder -- ausschliesslich im Arbeitsspeicher.
 * Sie liegen unter dem Namensraum `uploads/` und ueberschreiben nie eine Datei
 * aus `quizzes/media`.
 */
export class MediaStore {
  static readonly PREFIX = 'uploads/';

  private readonly files = new Map<string, StoredImage>();

  constructor(private readonly limits: MediaLimits = DEFAULT_MEDIA_LIMITS) {}

  get limitsInfo(): MediaLimits {
    return this.limits;
  }

  get count(): number {
    return this.files.size;
  }

  get totalBytes(): number {
    let total = 0;
    for (const file of this.files.values()) total += file.size;
    return total;
  }

  get(path: string): StoredImage | undefined {
    return this.files.get(path);
  }

  /** Namen inklusive Prefix, damit sie direkt als `image` verwendbar sind. */
  list(): string[] {
    return [...this.files.keys()].sort((a, b) => a.localeCompare(b, 'de-DE'));
  }

  remove(path: string): void {
    if (!this.files.delete(path)) {
      throw new MediaError('Dieses Bild wurde nicht hochgeladen.', 'NOT_FOUND');
    }
    log.info('Bild entfernt', { path, files: this.files.size });
  }

  /**
   * Nimmt ein Bild auf. `rawName` dient nur als Vorschlag -- der gespeicherte
   * Name wird daraus entschaerft und mit dem Prefix versehen.
   */
  add(rawName: unknown, data: Buffer): string {
    const detected = sniffImageType(data);
    if (!detected) {
      throw new MediaError(
        'Das ist keine unterstützte Bilddatei. Erlaubt sind PNG, JPG, GIF, WebP und AVIF.',
        'INVALID',
      );
    }
    if (data.length > this.limits.maxFileBytes) {
      throw new MediaError(
        `Das Bild ist ${(data.length / 1024 / 1024).toFixed(1)} MB groß. Erlaubt sind ${(this.limits.maxFileBytes / 1024 / 1024).toFixed(0)} MB.`,
        'LIMIT',
      );
    }

    const name = safeName(rawName, detected);
    const path = `${MediaStore.PREFIX}${name}`;
    const replacing = this.files.get(path);

    if (!replacing && this.files.size >= this.limits.maxFiles) {
      throw new MediaError(`Es sind bereits ${this.limits.maxFiles} Bilder hochgeladen.`, 'LIMIT');
    }
    const projected = this.totalBytes - (replacing?.size ?? 0) + data.length;
    if (projected > this.limits.maxTotalBytes) {
      throw new MediaError(
        `Damit wären mehr als ${(this.limits.maxTotalBytes / 1024 / 1024).toFixed(0)} MB belegt. Bitte zuerst Bilder entfernen.`,
        'LIMIT',
      );
    }

    this.files.set(path, {
      data,
      contentType: MEDIA_CONTENT_TYPES[detected] ?? 'application/octet-stream',
      size: data.length,
      uploadedAt: Date.now(),
    });
    log.info('Bild hochgeladen', { path, bytes: data.length, files: this.files.size });
    return path;
  }
}

/** Macht aus einem beliebigen Dateinamen einen harmlosen, eindeutigen Namen. */
function safeName(rawName: unknown, extension: string): string {
  const base = typeof rawName === 'string' ? rawName.split(/[\\/]/).pop() ?? '' : '';
  const withoutExt = base.replace(/\.[^.]*$/, '');
  const cleaned = withoutExt
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .toLowerCase();
  return `${cleaned || 'bild'}${extension}`;
}
