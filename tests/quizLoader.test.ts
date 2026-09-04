import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { QuizRegistry, buildCountOptions, loadQuizzes, parseQuiz, toSummary } from '../src/server/quiz/loader.js';

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

  it('verlangt genau vier Antworten mit den ids A bis D', () => {
    const threeAnswers = question({ answers: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }, { id: 'C', text: 'c' }] });
    expect(() => parseQuiz(quiz({ questions: [threeAnswers] }), 'x')).toThrow(/genau 4 Antworten/);

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

describe('buildCountOptions', () => {
  it('bietet nur Werte an, die der Pool hergibt', () => {
    expect(buildCountOptions(30)).toEqual([5, 10, 12, 15, 20, 30]);
    expect(buildCountOptions(8)).toEqual([5, 8]);
    expect(buildCountOptions(3)).toEqual([3]);
    expect(buildCountOptions(1)).toEqual([1]);
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

  it('haben je Frage genau eine Lösung und eine Erklärung', () => {
    for (const quizDefinition of loadQuizzes('quizzes').quizzes) {
      for (const item of quizDefinition.questions) {
        expect(item.answers.filter((answer) => answer.id === item.correctAnswer)).toHaveLength(1);
        expect(item.explanation.trim().length).toBeGreaterThan(10);
      }
    }
  });
});
