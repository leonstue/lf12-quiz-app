import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  QuizRegistry,
  UploadError,
  buildCountOptions,
  loadQuizzes,
  parseQuiz,
  toSummary,
} from '../src/server/quiz/loader.js';

/** Minimal gültige Frage, die einzelne Felder gezielt überschreiben kann. */
function question(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '1',
    category: 'Test',
    difficulty: 1,
    question: 'Eine Frage?',
    answers: [
      { id: 'A', text: 'Antwort A' },
      { id: 'B', text: 'Antwort B' },
      { id: 'C', text: 'Antwort C' },
      { id: 'D', text: 'Antwort D' },
    ],
    correctAnswer: 'A',
    explanation: 'Weil das so ist und hier eine ausreichend lange Begründung steht.',
    ...overrides,
  };
}

function quiz(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'test-quiz', name: 'Testquiz', questions: [question()], ...overrides };
}

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-test-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('parseQuiz', () => {
  it('akzeptiert ein minimales Quiz und ergänzt Standardwerte', () => {
    const parsed = parseQuiz(quiz(), 'dateiname');
    expect(parsed.id).toBe('test-quiz');
    expect(parsed.name).toBe('Testquiz');
    expect(parsed.subject).toBe('Allgemein');
    expect(parsed.description).toBe('');
    expect(parsed.defaultQuestionIds).toEqual([]);
    expect(parsed.questions).toHaveLength(1);
    // difficulty 1 => 20 s, difficulty 3 => 25 s
    expect(parsed.questions[0].durationSeconds).toBe(20);
  });

  it('nimmt den Dateinamen als id, wenn keine angegeben ist', () => {
    const parsed = parseQuiz({ name: 'X', questions: [question()] }, 'mein-quiz');
    expect(parsed.id).toBe('mein-quiz');
  });

  it('setzt 25 s für schwere Fragen und respektiert eigene Dauern', () => {
    const parsed = parseQuiz(
      quiz({ questions: [question({ difficulty: 3 }), question({ id: '2', durationSeconds: 45 })] }),
      'x',
    );
    expect(parsed.questions[0].durationSeconds).toBe(25);
    expect(parsed.questions[1].durationSeconds).toBe(45);
  });

  it('begrenzt unsinnige Dauern', () => {
    expect(parseQuiz(quiz({ questions: [question({ durationSeconds: 1 })] }), 'x').questions[0].durationSeconds).toBe(5);
    expect(
      parseQuiz(quiz({ questions: [question({ durationSeconds: 9999 })] }), 'x').questions[0].durationSeconds,
    ).toBe(300);
  });

  it('lehnt fehlende Pflichtfelder ab', () => {
    expect(() => parseQuiz(quiz({ questions: [question({ question: '' })] }), 'x')).toThrow(/question/);
    expect(() => parseQuiz(quiz({ questions: [question({ explanation: undefined })] }), 'x')).toThrow(/explanation/);
    expect(() => parseQuiz(quiz({ questions: [] }), 'x')).toThrow(/questions/);
    expect(() => parseQuiz(null, 'x')).toThrow();
    expect(() => parseQuiz('kein objekt', 'x')).toThrow();
  });

  it('akzeptiert 2 bis 6 Antworten und lehnt alles andere ab', () => {
    const withAnswers = (texts: string[], correct = 'A') =>
      quiz({
        questions: [
          question({
            answers: texts.map((text, index) => ({ id: 'ABCDEF'[index], text })),
            correctAnswer: correct,
          }),
        ],
      });

    expect(parseQuiz(withAnswers(['a', 'b']), 'x').questions[0].answers).toHaveLength(2);
    expect(parseQuiz(withAnswers(['a', 'b', 'c', 'd', 'e', 'f']), 'x').questions[0].answers).toHaveLength(6);

    expect(() => parseQuiz(withAnswers(['a']), 'x')).toThrow(/2 bis 6 Antworten/);
    expect(() => parseQuiz(withAnswers(['a', 'b', 'c', 'd', 'e', 'f', 'g']), 'x')).toThrow(/2 bis 6 Antworten/);
  });

  it('verlangt die ids A, B, C ... in dieser Reihenfolge', () => {
    const wrongIds = question({
      answers: [
        { id: 'A', text: 'a' },
        { id: 'X', text: 'b' },
        { id: 'C', text: 'c' },
        { id: 'D', text: 'd' },
      ],
    });
    expect(() => parseQuiz(quiz({ questions: [wrongIds] }), 'x')).toThrow(/id "B"/);
  });

  it('lehnt doppelte Antworttexte ab', () => {
    const duplicate = question({
      answers: [
        { id: 'A', text: 'gleich' },
        { id: 'B', text: 'Gleich' },
        { id: 'C', text: 'c' },
        { id: 'D', text: 'd' },
      ],
    });
    expect(() => parseQuiz(quiz({ questions: [duplicate] }), 'x')).toThrow(/unterscheiden/);
  });

  it('lehnt eine ungültige correctAnswer ab', () => {
    expect(() => parseQuiz(quiz({ questions: [question({ correctAnswer: 'E' })] }), 'x')).toThrow(/correctAnswer/);
    expect(() => parseQuiz(quiz({ questions: [question({ correctAnswer: 1 })] }), 'x')).toThrow();
  });

  it('lehnt eine ungültige difficulty ab', () => {
    expect(() => parseQuiz(quiz({ questions: [question({ difficulty: 0 })] }), 'x')).toThrow(/difficulty/);
    expect(() => parseQuiz(quiz({ questions: [question({ difficulty: 4 })] }), 'x')).toThrow(/difficulty/);
  });

  it('lehnt doppelte Frage-ids ab', () => {
    expect(() => parseQuiz(quiz({ questions: [question(), question()] }), 'x')).toThrow(/doppelte id/);
  });

  it('prüft defaultQuestionIds gegen die vorhandenen Fragen', () => {
    expect(() => parseQuiz(quiz({ defaultQuestionIds: ['99'] }), 'x')).toThrow(/unbekannte Fragen/);
    expect(() => parseQuiz(quiz({ defaultQuestionIds: ['1', '1'] }), 'x')).toThrow(/Duplikate/);
    expect(parseQuiz(quiz({ defaultQuestionIds: ['1'] }), 'x').defaultQuestionIds).toEqual(['1']);
  });

  it('lehnt unbrauchbare ids ab', () => {
    expect(() => parseQuiz(quiz({ id: 'mit leerzeichen' }), 'x')).toThrow(/id/);
    expect(() => parseQuiz(quiz({ id: '../etc/passwd' }), 'x')).toThrow(/id/);
  });
});

describe('Bilder', () => {
  it('übernimmt einen relativen Pfad und die Bildbeschreibung', () => {
    const parsed = parseQuiz(
      quiz({ questions: [question({ image: 'diagramme/ablauf.png', imageAlt: 'Ein Ablauf' })] }),
      'x',
    );
    expect(parsed.questions[0].image).toBe('diagramme/ablauf.png');
    expect(parsed.questions[0].imageAlt).toBe('Ein Ablauf');
  });

  it('lässt das Bild weg, wenn nichts angegeben ist', () => {
    const parsed = parseQuiz(quiz(), 'x');
    expect(parsed.questions[0].image).toBeNull();
    expect(parsed.questions[0].imageAlt).toBeNull();
  });

  it('lehnt Pfade ab, die das Verzeichnis verlassen', () => {
    for (const bad of ['../geheim.png', 'a/../../b.png', '/etc/passwd.png', 'C:/x.png']) {
      expect(() => parseQuiz(quiz({ questions: [question({ image: bad })] }), 'x')).toThrow();
    }
  });

  it('lehnt unzulässige Zeichen und Dateitypen ab', () => {
    expect(() => parseQuiz(quiz({ questions: [question({ image: 'bild.exe' })] }), 'x')).toThrow(/enden/);
    expect(() => parseQuiz(quiz({ questions: [question({ image: 'bild.png?x=1' })] }), 'x')).toThrow(/Zeichen/);
    expect(() => parseQuiz(quiz({ questions: [question({ image: 'ohne-endung' })] }), 'x')).toThrow();
  });

  it('erlaubt die üblichen Bildformate', () => {
    for (const good of ['a.png', 'a.jpg', 'a.jpeg', 'a.gif', 'a.webp', 'a.avif', 'a.svg']) {
      expect(parseQuiz(quiz({ questions: [question({ image: good })] }), 'x').questions[0].image).toBe(good);
    }
  });
});

describe('buildCountOptions', () => {
  it('bietet nur Werte an, die der Pool hergibt', () => {
    expect(buildCountOptions(30)).toEqual([5, 10, 12, 15, 20, 30]);
    expect(buildCountOptions(8)).toEqual([5, 8]);
    expect(buildCountOptions(3)).toEqual([3]);
    expect(buildCountOptions(1)).toEqual([1]);
  });

  it('nimmt die Standardauswahl mit auf', () => {
    // 9 Fragen, davon 6 in der Standardauswahl -> 6 muss waehlbar sein.
    expect(buildCountOptions(9, 6)).toEqual([5, 6, 9]);
    expect(buildCountOptions(30, 12)).toEqual([5, 10, 12, 15, 20, 30]);
  });

  it('ignoriert unsinnige Standardwerte', () => {
    expect(buildCountOptions(9, 0)).toEqual([5, 9]);
    expect(buildCountOptions(9, 99)).toEqual([5, 9]);
  });
});

describe('toSummary', () => {
  it('liefert eine Auswahlliste ohne Fragen und ohne Lösungen', () => {
    const summary = toSummary(
      parseQuiz(
        quiz({
          description: 'Beschreibung',
          subject: 'Fach',
          defaultQuestionIds: ['1'],
          questions: [question(), question({ id: '2', category: 'Andere' })],
        }),
        'x',
      ),
    );

    expect(summary).toMatchObject({
      id: 'test-quiz',
      name: 'Testquiz',
      description: 'Beschreibung',
      subject: 'Fach',
      questionCount: 2,
      defaultCount: 1,
    });
    expect(summary.categories).toEqual(['Andere', 'Test']);
    expect(summary.countOptions).toContain(summary.defaultCount);
    expect(JSON.stringify(summary)).not.toContain('correctAnswer');
    expect(JSON.stringify(summary)).not.toContain('explanation');
  });
});

describe('loadQuizzes', () => {
  it('liest alle gültigen Dateien und meldet defekte', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'gut.json'), JSON.stringify(quiz({ id: 'gut', name: 'Gut' })));
    writeFileSync(join(dir, 'kaputt.json'), '{ das ist kein json');
    writeFileSync(join(dir, 'ungueltig.json'), JSON.stringify(quiz({ id: 'ungueltig', questions: [] })));
    writeFileSync(join(dir, 'ignoriert.txt'), 'egal');

    const result = loadQuizzes(dir);
    expect(result.quizzes.map((q) => q.id)).toEqual(['gut']);
    expect(result.errors.map((e) => e.file).sort()).toEqual(['kaputt.json', 'ungueltig.json']);
  });

  it('ignoriert die zweite Datei mit derselben id', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'a.json'), JSON.stringify(quiz({ id: 'gleich', name: 'A' })));
    writeFileSync(join(dir, 'b.json'), JSON.stringify(quiz({ id: 'gleich', name: 'B' })));

    const result = loadQuizzes(dir);
    expect(result.quizzes).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/Doppelte Quiz-id/);
  });

  it('kommt mit einem fehlenden Verzeichnis klar', () => {
    const result = loadQuizzes(join(tempDir(), 'gibtsnicht'));
    expect(result.quizzes).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it('sortiert nach Namen', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'z.json'), JSON.stringify(quiz({ id: 'z', name: 'Zebra' })));
    writeFileSync(join(dir, 'a.json'), JSON.stringify(quiz({ id: 'a', name: 'Antenne' })));
    expect(loadQuizzes(dir).quizzes.map((q) => q.name)).toEqual(['Antenne', 'Zebra']);
  });
});

describe('QuizRegistry', () => {
  it('findet Quizze über die id und fällt sonst auf das erste zurück', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'a.json'), JSON.stringify(quiz({ id: 'alpha', name: 'Alpha' })));
    writeFileSync(join(dir, 'b.json'), JSON.stringify(quiz({ id: 'beta', name: 'Beta' })));

    const registry = new QuizRegistry(dir, 0);
    expect(registry.size).toBe(2);
    expect(registry.get('beta')?.name).toBe('Beta');
    expect(registry.get('gibtsnicht')).toBeUndefined();
    expect(registry.get(undefined)).toBeUndefined();
    expect(registry.get(42)).toBeUndefined();
    expect(registry.first()?.id).toBe('alpha');
  });

  it('nimmt neue Dateien ohne Neustart auf', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'a.json'), JSON.stringify(quiz({ id: 'alpha', name: 'Alpha' })));

    const registry = new QuizRegistry(dir, 0);
    expect(registry.size).toBe(1);

    writeFileSync(join(dir, 'b.json'), JSON.stringify(quiz({ id: 'beta', name: 'Beta' })));
    expect(registry.size).toBe(2);
  });

  it('liefert Zusammenfassungen ohne Lösungen', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'a.json'), JSON.stringify(quiz({ id: 'alpha', name: 'Alpha' })));
    const registry = new QuizRegistry(dir, 0);
    expect(JSON.stringify(registry.summaries())).not.toContain('correctAnswer');
  });
});

describe('Ausgelieferte Quiz-Dateien', () => {
  it('lassen sich alle fehlerfrei laden', () => {
    const result = loadQuizzes('quizzes');
    expect(result.errors).toEqual([]);
    expect(result.quizzes.length).toBeGreaterThanOrEqual(2);
    expect(result.quizzes.map((q) => q.id)).toContain('uml-sequenzdiagramme');
    expect(result.quizzes.map((q) => q.id)).toContain('beispiel-quiz');
  });

  it('haben je Frage eine gültige Kategorie', () => {
    for (const quizDefinition of loadQuizzes('quizzes').quizzes) {
      for (const item of quizDefinition.questions) {
        expect(item.category.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('verweisen nur auf vorhandene Bilddateien', () => {
    for (const quizDefinition of loadQuizzes('quizzes').quizzes) {
      for (const item of quizDefinition.questions) {
        if (item.image) {
          expect(existsSync(join('quizzes', 'media', item.image))).toBe(true);
        }
      }
    }
  });

  it('haben je Frage genau eine Lösung und eine Erklärung', () => {
    for (const quizDefinition of loadQuizzes('quizzes').quizzes) {
      for (const item of quizDefinition.questions) {
        expect(item.answers.filter((answer) => answer.id === item.correctAnswer)).toHaveLength(1);
        expect(item.explanation.trim().length).toBeGreaterThan(10);
      }
    }
  });
});

describe('Hochgeladene Quizze', () => {
  function registry(): QuizRegistry {
    const dir = tempDir();
    writeFileSync(join(dir, 'datei.json'), JSON.stringify(quiz({ id: 'aus-datei', name: 'Aus Datei' })));
    return new QuizRegistry(dir, 0, { maxUploads: 2, maxQuestions: 3 });
  }

  it('nimmt ein gültiges Quiz auf und macht es spielbar', () => {
    const reg = registry();
    const added = reg.addUpload(quiz({ id: 'hoch', name: 'Hochgeladen' }));

    expect(added.id).toBe('hoch');
    expect(reg.get('hoch')?.name).toBe('Hochgeladen');
    expect(reg.sourceOf('hoch')).toBe('upload');
    expect(reg.sourceOf('aus-datei')).toBe('file');
    expect(reg.list().map((entry) => entry.id).sort()).toEqual(['aus-datei', 'hoch']);
    expect(reg.uploadCount).toBe(1);
  });

  it('lehnt ungültige Inhalte mit verständlicher Meldung ab', () => {
    const reg = registry();
    expect(() => reg.addUpload({ name: 'Ohne Fragen', questions: [] })).toThrow(UploadError);
    expect(() => reg.addUpload('kein objekt')).toThrow(/JSON-Objekt/);
    expect(reg.uploadCount).toBe(0);
  });

  it('verhindert das Überschreiben eines Quiz aus dem Ordner', () => {
    const reg = registry();
    try {
      reg.addUpload(quiz({ id: 'aus-datei', name: 'Kollision' }));
      throw new Error('haette werfen muessen');
    } catch (error) {
      expect(error).toBeInstanceOf(UploadError);
      expect((error as UploadError).code).toBe('CONFLICT');
    }
    expect(reg.get('aus-datei')?.name).toBe('Aus Datei');
  });

  it('ersetzt ein bereits hochgeladenes Quiz mit derselben id', () => {
    const reg = registry();
    reg.addUpload(quiz({ id: 'hoch', name: 'Erst' }));
    reg.addUpload(quiz({ id: 'hoch', name: 'Dann' }));
    expect(reg.uploadCount).toBe(1);
    expect(reg.get('hoch')?.name).toBe('Dann');
  });

  it('begrenzt die Anzahl der Uploads', () => {
    const reg = registry();
    reg.addUpload(quiz({ id: 'a', name: 'A' }));
    reg.addUpload(quiz({ id: 'b', name: 'B' }));
    try {
      reg.addUpload(quiz({ id: 'c', name: 'C' }));
      throw new Error('haette werfen muessen');
    } catch (error) {
      expect((error as UploadError).code).toBe('LIMIT');
    }
  });

  it('begrenzt die Anzahl der Fragen je Quiz', () => {
    const reg = registry();
    const many = Array.from({ length: 4 }, (_, index) => question({ id: String(index + 1) }));
    try {
      reg.addUpload(quiz({ id: 'gross', name: 'Gross', questions: many }));
      throw new Error('haette werfen muessen');
    } catch (error) {
      expect((error as UploadError).code).toBe('LIMIT');
    }
  });

  it('entfernt ein hochgeladenes Quiz wieder', () => {
    const reg = registry();
    reg.addUpload(quiz({ id: 'hoch', name: 'Hoch' }));
    reg.removeUpload('hoch');
    expect(reg.get('hoch')).toBeUndefined();
    expect(reg.uploadCount).toBe(0);
  });

  it('kann Dateien nicht über removeUpload löschen', () => {
    const reg = registry();
    try {
      reg.removeUpload('aus-datei');
      throw new Error('haette werfen muessen');
    } catch (error) {
      expect((error as UploadError).code).toBe('NOT_FOUND');
    }
    expect(reg.get('aus-datei')).toBeDefined();
  });

  it('ist robust gegen unsinnige ids beim Entfernen', () => {
    const reg = registry();
    for (const bad of [undefined, null, 42, {}]) {
      expect(() => reg.removeUpload(bad)).toThrow(UploadError);
    }
  });

  it('listet Bilder aus dem media-Ordner', () => {
    const dir = tempDir();
    const media = join(dir, 'media');
    mkdirSync(media, { recursive: true });
    writeFileSync(join(media, 'bild.png'), 'x');
    writeFileSync(join(media, 'notiz.txt'), 'x');
    mkdirSync(join(media, 'unter'), { recursive: true });
    writeFileSync(join(media, 'unter', 'zeichnung.svg'), 'x');

    const reg = new QuizRegistry(dir, 0);
    expect(reg.listMedia()).toEqual(['bild.png', 'unter/zeichnung.svg']);
  });
});

describe('Bilddateien im Ordner quizzes/media', () => {
  const dir = join('quizzes', 'media');
  const svgs = existsSync(dir) ? readdirSync(dir).filter((file) => file.toLowerCase().endsWith('.svg')) : [];

  it('es gibt überhaupt welche', () => {
    expect(svgs.length).toBeGreaterThan(0);
  });

  // Ein SVG wird als XML geparst. Zwei Fallen fallen dabei erst im Browser auf:
  // "--" innerhalb eines Kommentars und HTML-Entities, die XML nicht kennt.
  // Beides laesst das Bild kommentarlos verschwinden.
  it.each(svgs)('%s ist wohlgeformtes XML', (file) => {
    const content = readFileSync(join(dir, file), 'utf8');

    for (const [, inner] of content.matchAll(/<!--([\s\S]*?)-->/g)) {
      expect(inner, `Kommentar in ${file} enthält "--"`).not.toContain('--');
    }

    const allowed = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);
    for (const [full, name] of content.matchAll(/&([a-zA-Z][a-zA-Z0-9]*);/g)) {
      expect(allowed.has(name), `${file} verwendet die in XML unbekannte Entity ${full}`).toBe(true);
    }

    // Grobe Struktur: genau ein Wurzelelement, sauber geschlossen.
    expect(content.trimStart().startsWith('<svg') || content.includes('<svg')).toBe(true);
    expect(content.trimEnd().endsWith('</svg>')).toBe(true);
    expect((content.match(/<svg[\s>]/g) ?? []).length).toBe(1);
  });
});
