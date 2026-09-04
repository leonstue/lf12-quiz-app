import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { MAX_ANSWERS, MIN_ANSWERS, QUESTION_COUNT_OPTIONS, answerIdsFor } from '../../shared/types.js';
import type { AnswerId, Difficulty, QuizDefinition, QuizQuestion, QuizSummary } from '../../shared/types.js';
import { createLogger } from '../logger.js';

const log = createLogger('quiz');

export interface QuizLoadError {
  file: string;
  message: string;
}

export interface QuizLoadResult {
  quizzes: QuizDefinition[];
  errors: QuizLoadError[];
}

class ValidationError extends Error {}

function fail(message: string): never {
  throw new ValidationError(message);
}

function requireString(value: unknown, field: string, { max = 500, min = 1 } = {}): string {
  if (typeof value !== 'string') fail(`"${field}" muss ein Text sein.`);
  const trimmed = value.trim();
  if (trimmed.length < min) fail(`"${field}" darf nicht leer sein.`);
  if (trimmed.length > max) fail(`"${field}" ist länger als ${max} Zeichen.`);
  return trimmed;
}

function parseDifficulty(value: unknown, field: string): Difficulty {
  if (value === 1 || value === 2 || value === 3) return value;
  fail(`"${field}" muss 1, 2 oder 3 sein.`);
}

/**
 * Bildpfad relativ zu `quizzes/media/`. Bewusst eng gefasst: keine absoluten
 * Pfade, kein Verlassen des Verzeichnisses, nur harmlose Zeichen.
 */
function parseImagePath(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const path = requireString(value, field, { max: 200 });

  if (path.startsWith('/') || path.startsWith('\\') || /^[a-z]:/i.test(path)) {
    fail(`"${field}" muss ein relativer Pfad innerhalb von quizzes/media sein.`);
  }
  if (path.split(/[\\/]/).some((segment) => segment === '..')) {
    fail(`"${field}" darf das Verzeichnis nicht verlassen.`);
  }
  if (!/^[\w./-]+$/.test(path)) {
    fail(`"${field}" enthält unzulässige Zeichen. Erlaubt sind Buchstaben, Ziffern, . _ - und /.`);
  }
  if (!/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path)) {
    fail(`"${field}" muss auf .png, .jpg, .gif, .webp, .avif oder .svg enden.`);
  }
  return path.replace(/\\/g, '/');
}

function parseQuestion(raw: unknown, index: number, seenIds: Set<string>): QuizQuestion {
  if (typeof raw !== 'object' || raw === null) fail(`Frage ${index + 1} ist kein Objekt.`);
  const input = raw as Record<string, unknown>;
  const where = `Frage ${index + 1}`;

  const id = requireString(input.id ?? String(index + 1), `${where}.id`, { max: 64 });
  if (seenIds.has(id)) fail(`${where}: doppelte id "${id}".`);
  seenIds.add(id);

  const difficulty = parseDifficulty(input.difficulty ?? 1, `${where}.difficulty`);

  if (
    !Array.isArray(input.answers) ||
    input.answers.length < MIN_ANSWERS ||
    input.answers.length > MAX_ANSWERS
  ) {
    fail(`${where}: es müssen ${MIN_ANSWERS} bis ${MAX_ANSWERS} Antworten angegeben sein.`);
  }

  const expectedIds = answerIdsFor(input.answers.length);
  const answers = input.answers.map((answer, position) => {
    if (typeof answer !== 'object' || answer === null) fail(`${where}: Antwort ${position + 1} ist kein Objekt.`);
    const entry = answer as Record<string, unknown>;
    const expected = expectedIds[position];
    const answerId = requireString(entry.id ?? expected, `${where}.answers[${position}].id`, { max: 1 });
    if (answerId !== expected) {
      fail(`${where}: Antwort ${position + 1} muss die id "${expected}" haben (gefunden: "${answerId}").`);
    }
    return { id: answerId as AnswerId, text: requireString(entry.text, `${where}.answers[${position}].text`, { max: 300 }) };
  });

  const texts = new Set(answers.map((answer) => answer.text.toLocaleLowerCase('de-DE')));
  if (texts.size !== answers.length) fail(`${where}: die Antworttexte müssen sich unterscheiden.`);

  const correctAnswer = requireString(input.correctAnswer, `${where}.correctAnswer`, { max: 1 });
  if (!expectedIds.includes(correctAnswer as AnswerId)) {
    fail(`${where}: "correctAnswer" muss ${expectedIds.join(', ')} sein.`);
  }

  const rawDuration = input.durationSeconds;
  let durationSeconds = difficulty === 3 ? 25 : 20;
  if (rawDuration !== undefined) {
    if (typeof rawDuration !== 'number' || !Number.isFinite(rawDuration)) {
      fail(`${where}.durationSeconds muss eine Zahl sein.`);
    }
    durationSeconds = Math.min(Math.max(Math.round(rawDuration), 5), 300);
  }

  return {
    id,
    category: requireString(input.category ?? 'Allgemein', `${where}.category`, { max: 60 }),
    difficulty,
    question: requireString(input.question, `${where}.question`, { max: 500 }),
    image: parseImagePath(input.image, `${where}.image`),
    imageAlt: input.imageAlt === undefined ? null : requireString(input.imageAlt, `${where}.imageAlt`, { max: 300 }),
    answers,
    correctAnswer: correctAnswer as AnswerId,
    explanation: requireString(input.explanation, `${where}.explanation`, { max: 1000 }),
    durationSeconds,
  };
}

/**
 * Sinnvolle Auswahlgrößen für "Anzahl Fragen".
 * Die Standardauswahl des Quiz gehört immer dazu -- sonst nennt die Oberfläche
 * einen Standardwert, den man gar nicht auswählen kann.
 */
export function buildCountOptions(questionCount: number, defaultCount?: number): number[] {
  const options: number[] = QUESTION_COUNT_OPTIONS.filter((value) => value < questionCount);
  options.push(questionCount);
  if (defaultCount !== undefined && defaultCount > 0 && defaultCount <= questionCount) {
    options.push(defaultCount);
  }
  return [...new Set(options)].sort((a, b) => a - b);
}

/** Prüft und normalisiert den Inhalt einer Quiz-Datei. Wirft bei Fehlern. */
export function parseQuiz(raw: unknown, fallbackId: string): QuizDefinition {
  if (typeof raw !== 'object' || raw === null) fail('Die Datei enthält kein JSON-Objekt.');
  const input = raw as Record<string, unknown>;

  const id = requireString(input.id ?? fallbackId, 'id', { max: 64 });
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) {
    fail(`"id" darf nur Buchstaben, Ziffern und Bindestriche enthalten (gefunden: "${id}").`);
  }

  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    fail('"questions" muss eine nicht-leere Liste sein.');
  }

  const seenIds = new Set<string>();
  const questions = input.questions.map((question, index) => parseQuestion(question, index, seenIds));

  let defaultQuestionIds: string[] = [];
  if (input.defaultQuestionIds !== undefined) {
    if (!Array.isArray(input.defaultQuestionIds)) fail('"defaultQuestionIds" muss eine Liste sein.');
    defaultQuestionIds = input.defaultQuestionIds.map((value, index) =>
      requireString(value, `defaultQuestionIds[${index}]`, { max: 64 }),
    );
    const unknown = defaultQuestionIds.filter((value) => !seenIds.has(value));
    if (unknown.length > 0) fail(`"defaultQuestionIds" verweist auf unbekannte Fragen: ${unknown.join(', ')}.`);
    if (new Set(defaultQuestionIds).size !== defaultQuestionIds.length) {
      fail('"defaultQuestionIds" enthält Duplikate.');
    }
  }

  return {
    id,
    name: requireString(input.name ?? id, 'name', { max: 80 }),
    description: requireString(input.description ?? '', 'description', { max: 300, min: 0 }),
    subject: requireString(input.subject ?? 'Allgemein', 'subject', { max: 60 }),
    defaultQuestionIds,
    questions,
  };
}

export function toSummary(quiz: QuizDefinition): QuizSummary {
  const categories = [...new Set(quiz.questions.map((question) => question.category))].sort((a, b) =>
    a.localeCompare(b, 'de-DE'),
  );
  const defaultCount = quiz.defaultQuestionIds.length > 0 ? quiz.defaultQuestionIds.length : quiz.questions.length;

  return {
    id: quiz.id,
    name: quiz.name,
    description: quiz.description,
    subject: quiz.subject,
    questionCount: quiz.questions.length,
    categories,
    countOptions: buildCountOptions(quiz.questions.length, defaultCount),
    defaultCount: Math.min(defaultCount, quiz.questions.length),
  };
}

/** Liest alle `*.json` aus einem Verzeichnis. Defekte Dateien werden übersprungen. */
export function loadQuizzes(dir: string): QuizLoadResult {
  const quizzes: QuizDefinition[] = [];
  const errors: QuizLoadError[] = [];

  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((file) => extname(file).toLowerCase() === '.json')
      .sort((a, b) => a.localeCompare(b, 'de-DE'));
  } catch (error) {
    return { quizzes, errors: [{ file: dir, message: `Verzeichnis nicht lesbar: ${String(error)}` }] };
  }

  const seen = new Set<string>();
  for (const file of files) {
    const path = join(dir, file);
    try {
      if (!statSync(path).isFile()) continue;
      const quiz = parseQuiz(JSON.parse(readFileSync(path, 'utf8')), basename(file, extname(file)));
      if (seen.has(quiz.id)) {
        errors.push({ file, message: `Doppelte Quiz-id "${quiz.id}" -- Datei wird ignoriert.` });
        continue;
      }
      seen.add(quiz.id);
      quizzes.push(quiz);
    } catch (error) {
      errors.push({ file, message: error instanceof Error ? error.message : String(error) });
    }
  }

  quizzes.sort((a, b) => a.name.localeCompare(b.name, 'de-DE'));
  return { quizzes, errors };
}

/** Woher ein Quiz stammt. */
export type QuizSource = 'file' | 'upload';

export interface UploadLimits {
  /** Wie viele hochgeladene Quizze gleichzeitig vorgehalten werden. */
  maxUploads: number;
  /** Obergrenze fuer Fragen je Quiz. */
  maxQuestions: number;
}

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = { maxUploads: 20, maxQuestions: 200 };

export class UploadError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID' | 'CONFLICT' | 'LIMIT' | 'NOT_FOUND',
  ) {
    super(message);
  }
}

/**
 * Hält die verfügbaren Quizze.
 *
 * Zwei Quellen:
 * - **Dateien** aus dem Quizordner. `refresh()` liest sie neu ein, sodass neue
 *   Dateien ohne Neustart wirksam werden.
 * - **Uploads** des Hosts. Die liegen ausschliesslich im Arbeitsspeicher und
 *   sind nach einem Neustart wieder weg -- der Server schreibt nie auf die Platte.
 */
export class QuizRegistry {
  private quizzes: QuizDefinition[] = [];
  private errors: QuizLoadError[] = [];
  private lastScan = 0;
  private readonly uploads = new Map<string, QuizDefinition>();

  constructor(
    private readonly dir: string,
    /** Wie lange ein Scan als aktuell gilt. */
    private readonly cacheMs = 5_000,
    private readonly limits: UploadLimits = DEFAULT_UPLOAD_LIMITS,
  ) {}

  refresh(force = false): void {
    if (!force && Date.now() - this.lastScan < this.cacheMs) return;
    const result = loadQuizzes(this.dir);
    this.lastScan = Date.now();
    this.quizzes = result.quizzes;
    this.errors = result.errors;

    for (const error of result.errors) {
      log.error('Quiz-Datei übersprungen', { file: error.file, error: error.message });
    }
  }

  /** Dateien und Uploads zusammen, nach Namen sortiert. */
  list(): QuizDefinition[] {
    this.refresh();
    return [...this.quizzes, ...this.uploads.values()].sort((a, b) => a.name.localeCompare(b.name, 'de-DE'));
  }

  /** Nur die aus Dateien gelesenen Quizze. */
  listFiles(): QuizDefinition[] {
    this.refresh();
    return this.quizzes;
  }

  listUploads(): QuizDefinition[] {
    return [...this.uploads.values()];
  }

  sourceOf(id: string): QuizSource | null {
    if (this.uploads.has(id)) return 'upload';
    this.refresh();
    return this.quizzes.some((quiz) => quiz.id === id) ? 'file' : null;
  }

  /**
   * Prüft ein hochgeladenes Quiz und legt es in den Arbeitsspeicher.
   * Wirft {@link UploadError} mit einer für den Host verständlichen Meldung.
   */
  addUpload(raw: unknown, fallbackId = 'upload'): QuizDefinition {
    let quiz: QuizDefinition;
    try {
      quiz = parseQuiz(raw, fallbackId);
    } catch (error) {
      throw new UploadError(error instanceof Error ? error.message : String(error), 'INVALID');
    }

    if (quiz.questions.length > this.limits.maxQuestions) {
      throw new UploadError(
        `Das Quiz hat ${quiz.questions.length} Fragen. Erlaubt sind höchstens ${this.limits.maxQuestions}.`,
        'LIMIT',
      );
    }

    this.refresh();
    if (this.quizzes.some((existing) => existing.id === quiz.id)) {
      throw new UploadError(
        `Die id "${quiz.id}" gehört bereits zu einem Quiz im Ordner "quizzes". Bitte in der Datei eine andere "id" setzen.`,
        'CONFLICT',
      );
    }
    if (!this.uploads.has(quiz.id) && this.uploads.size >= this.limits.maxUploads) {
      throw new UploadError(
        `Es sind bereits ${this.limits.maxUploads} Quizze hochgeladen. Bitte zuerst eines entfernen.`,
        'LIMIT',
      );
    }

    this.uploads.set(quiz.id, quiz);
    log.info('Quiz hochgeladen', { id: quiz.id, questions: quiz.questions.length, uploads: this.uploads.size });
    return quiz;
  }

  /** Entfernt ein hochgeladenes Quiz. Dateien lassen sich so nicht löschen. */
  removeUpload(id: unknown): void {
    if (typeof id !== 'string' || !this.uploads.has(id)) {
      throw new UploadError('Dieses Quiz wurde nicht hochgeladen und kann hier nicht entfernt werden.', 'NOT_FOUND');
    }
    this.uploads.delete(id);
    log.info('Hochgeladenes Quiz entfernt', { id, uploads: this.uploads.size });
  }

  get uploadCount(): number {
    return this.uploads.size;
  }

  get uploadLimits(): UploadLimits {
    return this.limits;
  }

  summaries(): QuizSummary[] {
    return this.list().map(toSummary);
  }

  get(id: unknown): QuizDefinition | undefined {
    if (typeof id !== 'string') return undefined;
    return this.uploads.get(id) ?? this.listFiles().find((quiz) => quiz.id === id);
  }

  /** Erstes Quiz -- Rückfallebene, wenn der Host keine gültige Auswahl schickt. */
  first(): QuizDefinition | undefined {
    return this.list()[0];
  }

  get loadErrors(): QuizLoadError[] {
    this.refresh();
    return this.errors;
  }

  get size(): number {
    return this.list().length;
  }

  /** Bildnamen aus `media/`, relativ zu diesem Ordner -- für die Bildauswahl im Editor. */
  listMedia(): string[] {
    const mediaDir = join(this.dir, 'media');
    const allowed = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg']);
    const found: string[] = [];

    const walk = (current: string, prefix: string, depth: number): void => {
      if (depth > 3) return;
      for (const entry of readdirSync(current)) {
        const full = join(current, entry);
        try {
          if (statSync(full).isDirectory()) walk(full, `${prefix}${entry}/`, depth + 1);
          else if (allowed.has(extname(entry).toLowerCase())) found.push(`${prefix}${entry}`);
        } catch {
          /* unlesbare Eintraege ueberspringen */
        }
      }
    };

    try {
      walk(mediaDir, '', 0);
    } catch {
      return [];
    }
    return found.sort((a, b) => a.localeCompare(b, 'de-DE'));
  }
}
