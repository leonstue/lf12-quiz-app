import type { QuizDefinition } from '../../shared/types.js';

export interface HostQuiz extends QuizDefinition {
  /** `file` = aus dem Ordner quizzes, `upload` = nur im Arbeitsspeicher. */
  source: 'file' | 'upload';
}

export interface HostQuizzesResponse {
  quizzes: HostQuiz[];
  errors: { file: string; message: string }[];
  media: string[];
  uploads: { count: number; maxUploads: number; maxQuestions: number };
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

async function call<T>(url: string, token: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!response.ok) {
      const message =
        typeof body.error === 'string'
          ? body.error
          : response.status === 401
            ? 'Host-Sitzung abgelaufen. Bitte erneut anmelden.'
            : `Fehler ${response.status}`;
      return { ok: false, error: message, status: response.status };
    }
    return { ok: true, data: body as T };
  } catch (error) {
    return { ok: false, error: `Der Server ist nicht erreichbar (${String(error)})`, status: 0 };
  }
}

export function fetchHostQuizzes(token: string): Promise<ApiResult<HostQuizzesResponse>> {
  return call<HostQuizzesResponse>('/api/host/quizzes', token);
}

/** Lädt ein Quiz in den Arbeitsspeicher des Servers -- danach ist es spielbar. */
export function uploadQuiz(token: string, quiz: unknown): Promise<ApiResult<{ quiz: QuizDefinition }>> {
  return call('/api/host/quizzes', token, { method: 'POST', body: JSON.stringify(quiz) });
}

/** Entfernt ein hochgeladenes Quiz wieder. Dateien bleiben unberührt. */
export function removeUploadedQuiz(token: string, id: string): Promise<ApiResult<Record<string, never>>> {
  return call(`/api/host/quizzes/${encodeURIComponent(id)}`, token, { method: 'DELETE' });
}
