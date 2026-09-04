import { ANSWER_IDS, MAX_ANSWERS, MIN_ANSWERS, type Difficulty, type QuizDefinition } from '../../shared/types.js';

/**
 * Bearbeitbare Fassung eines Quiz.
 *
 * Unterschied zum gespeicherten Format: Die richtige Antwort steckt hier als
 * Index, nicht als Buchstabe. Beim Umsortieren oder Entfernen einer Antwort
 * bleibt damit automatisch die richtige markiert.
 */
export interface DraftAnswer {
  text: string;
}

export interface DraftQuestion {
  id: string;
  question: string;
  category: string;
  difficulty: Difficulty;
  /** Leerer Text = Standarddauer der Schwierigkeit. */
  duration: string;
  image: string;
  imageAlt: string;
  answers: DraftAnswer[];
  correctIndex: number;
  explanation: string;
  inDefault: boolean;
}

export interface QuizDraft {
  id: string;
  name: string;
  description: string;
  subject: string;
  questions: DraftQuestion[];
}

export function emptyQuestion(id: string): DraftQuestion {
  return {
    id,
    question: '',
    category: 'Allgemein',
    difficulty: 1,
    duration: '',
    image: '',
    imageAlt: '',
    answers: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
    correctIndex: 0,
    explanation: '',
    inDefault: true,
  };
}

export function emptyDraft(): QuizDraft {
  return {
    id: '',
    name: '',
    description: '',
    subject: 'Allgemein',
    questions: [emptyQuestion('1')],
  };
}

export function toDraft(quiz: QuizDefinition): QuizDraft {
  const defaults = new Set(quiz.defaultQuestionIds);
  return {
    id: quiz.id,
    name: quiz.name,
    description: quiz.description,
    subject: quiz.subject,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      question: question.question,
      category: question.category,
      difficulty: question.difficulty,
      // Nur abweichende Dauern anzeigen -- sonst gilt der Standard der Schwierigkeit.
      duration: question.durationSeconds === defaultDuration(question.difficulty) ? '' : String(question.durationSeconds),
      image: question.image ?? '',
      imageAlt: question.imageAlt ?? '',
      answers: question.answers.map((answer) => ({ text: answer.text })),
      correctIndex: Math.max(
        0,
        question.answers.findIndex((answer) => answer.id === question.correctAnswer),
      ),
      explanation: question.explanation,
      // Ohne gepflegte Standardauswahl gehoeren alle Fragen dazu.
      inDefault: quiz.defaultQuestionIds.length === 0 || defaults.has(question.id),
    })),
  };
}

export function defaultDuration(difficulty: Difficulty): number {
  return difficulty === 3 ? 25 : 20;
}

/** Nächste freie numerische Frage-id. */
export function nextQuestionId(questions: DraftQuestion[]): string {
  const used = new Set(questions.map((question) => question.id));
  let candidate = questions.length + 1;
  while (used.has(String(candidate))) candidate += 1;
  return String(candidate);
}

export interface DraftIssue {
  questionIndex: number | null;
  message: string;
}

/**
 * Prüfung für sofortiges Feedback im Editor. Die verbindliche Prüfung macht
 * weiterhin der Server -- diese hier soll nur früh und verständlich warnen.
 */
export function validateDraft(draft: QuizDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];

  if (!/^[a-z0-9][a-z0-9-]*$/i.test(draft.id)) {
    issues.push({ questionIndex: null, message: 'Die id darf nur Buchstaben, Ziffern und Bindestriche enthalten.' });
  }
  if (draft.name.trim().length === 0) {
    issues.push({ questionIndex: null, message: 'Das Quiz braucht einen Namen.' });
  }
  if (draft.questions.length === 0) {
    issues.push({ questionIndex: null, message: 'Mindestens eine Frage ist nötig.' });
  }

  const seen = new Set<string>();
  draft.questions.forEach((question, index) => {
    const at = (message: string) => issues.push({ questionIndex: index, message });

    if (question.id.trim().length === 0) at('Die Frage braucht eine id.');
    else if (seen.has(question.id)) at(`Die id "${question.id}" wird mehrfach verwendet.`);
    seen.add(question.id);

    if (question.question.trim().length === 0) at('Der Fragetext fehlt.');
    if (question.explanation.trim().length === 0) at('Die Erklärung fehlt.');
    if (question.category.trim().length === 0) at('Die Kategorie fehlt.');

    if (question.answers.length < MIN_ANSWERS || question.answers.length > MAX_ANSWERS) {
      at(`Es müssen ${MIN_ANSWERS} bis ${MAX_ANSWERS} Antworten sein.`);
    }
    if (question.answers.some((answer) => answer.text.trim().length === 0)) {
      at('Alle Antworten brauchen einen Text.');
    }

    const texts = question.answers.map((answer) => answer.text.trim().toLocaleLowerCase('de-DE'));
    if (new Set(texts).size !== texts.length) at('Die Antworttexte müssen sich unterscheiden.');

    if (question.correctIndex < 0 || question.correctIndex >= question.answers.length) {
      at('Es ist keine richtige Antwort markiert.');
    }

    if (question.duration.trim().length > 0) {
      const value = Number(question.duration);
      if (!Number.isFinite(value) || value < 5 || value > 300) at('Die Dauer muss zwischen 5 und 300 Sekunden liegen.');
    }
  });

  return issues;
}

/** Wandelt den Entwurf in das Speicherformat. */
export function toQuizJson(draft: QuizDraft): Record<string, unknown> {
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    subject: draft.subject.trim() || 'Allgemein',
    defaultQuestionIds: draft.questions.filter((question) => question.inDefault).map((question) => question.id.trim()),
    questions: draft.questions.map((question) => {
      const answers = question.answers.map((answer, index) => ({
        id: ANSWER_IDS[index],
        text: answer.text.trim(),
      }));

      const entry: Record<string, unknown> = {
        id: question.id.trim(),
        category: question.category.trim(),
        difficulty: question.difficulty,
        question: question.question.trim(),
        answers,
        correctAnswer: ANSWER_IDS[Math.min(question.correctIndex, answers.length - 1)],
        explanation: question.explanation.trim(),
      };

      if (question.duration.trim().length > 0) entry.durationSeconds = Number(question.duration);
      if (question.image.trim().length > 0) {
        entry.image = question.image.trim();
        if (question.imageAlt.trim().length > 0) entry.imageAlt = question.imageAlt.trim();
      }
      return entry;
    }),
  };
}
