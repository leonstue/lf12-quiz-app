<script lang="ts">
  import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    Copy,
    Download,
    FileJson,
    Plus,
    Image as ImageIcon,
    Trash2,
    Upload,
    X,
  } from '@lucide/svelte';

  import { ANSWER_IDS, MAX_ANSWERS, MIN_ANSWERS, type Difficulty } from '../../shared/types.js';
  import Backdrop from '../lib/components/Backdrop.svelte';
  import Brand from '../lib/components/Brand.svelte';
  import Credit from '../lib/components/Credit.svelte';
  import NoticeBar from '../lib/components/NoticeBar.svelte';
  import { hostGame } from '../lib/hostGame.svelte.js';
  import {
    fetchHostQuizzes,
    removeImage,
    removeUploadedQuiz,
    uploadImage,
    uploadQuiz,
    type HostQuiz,
    type HostQuizzesResponse,
  } from '../lib/hostApi.js';
  import {
    emptyDraft,
    emptyQuestion,
    nextQuestionId,
    toDraft,
    toQuizJson,
    validateDraft,
    type QuizDraft,
  } from '../lib/quizDraft.svelte.js';
  import { navigate } from '../lib/router.svelte.js';

  let info = $state<HostQuizzesResponse | null>(null);
  let loading = $state(true);
  let notice = $state<string | null>(null);
  let success = $state<string | null>(null);
  let busy = $state(false);

  let draft = $state<QuizDraft>(emptyDraft());
  let openIndex = $state(0);
  let fileInput = $state<HTMLInputElement | null>(null);
  let imageInput = $state<HTMLInputElement | null>(null);
  /** Fuer welche Frage der naechste Bild-Upload gilt. */
  let imageTarget = $state(-1);

  const issues = $derived(validateDraft(draft));
  const blocking = $derived(issues.filter((issue) => issue.questionIndex === null));
  const token = $derived(hostGame.hostToken);

  function issuesFor(index: number): string[] {
    return issues.filter((issue) => issue.questionIndex === index).map((issue) => issue.message);
  }

  async function load(): Promise<void> {
    if (!token) return;
    loading = true;
    const result = await fetchHostQuizzes(token);
    loading = false;
    if (result.ok) {
      info = result.data;
      notice = null;
    } else {
      notice = result.error;
      if (result.status === 401) hostGame.logout();
    }
  }

  // ------------------------------------------------------------- Entwurf

  function startNew(): void {
    draft = emptyDraft();
    openIndex = 0;
    success = null;
  }

  function loadIntoEditor(quiz: HostQuiz): void {
    draft = toDraft(quiz);
    openIndex = 0;
    success = `„${quiz.name}“ in den Editor geladen. Änderungen wirken erst nach Herunterladen und Hochladen.`;
  }

  function addQuestion(): void {
    draft.questions.push(emptyQuestion(nextQuestionId(draft.questions)));
    openIndex = draft.questions.length - 1;
  }

  function duplicateQuestion(index: number): void {
    const source = draft.questions[index];
    draft.questions.splice(index + 1, 0, {
      ...source,
      id: nextQuestionId(draft.questions),
      answers: source.answers.map((answer) => ({ ...answer })),
    });
    openIndex = index + 1;
  }

  function removeQuestion(index: number): void {
    draft.questions.splice(index, 1);
    if (openIndex >= draft.questions.length) openIndex = Math.max(0, draft.questions.length - 1);
  }

  function move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= draft.questions.length) return;
    const [item] = draft.questions.splice(index, 1);
    draft.questions.splice(target, 0, item);
    openIndex = target;
  }

  function addAnswer(index: number): void {
    const question = draft.questions[index];
    if (question.answers.length >= MAX_ANSWERS) return;
    question.answers.push({ text: '' });
  }

  function removeAnswer(questionIndex: number, answerIndex: number): void {
    const question = draft.questions[questionIndex];
    if (question.answers.length <= MIN_ANSWERS) return;
    question.answers.splice(answerIndex, 1);
    if (question.correctIndex >= question.answers.length) question.correctIndex = question.answers.length - 1;
    else if (question.correctIndex > answerIndex) question.correctIndex -= 1;
  }

  // ------------------------------------------------- Herunterladen / Laden

  function download(): void {
    const json = JSON.stringify(toQuizJson(draft), null, 2) + '\n';
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${draft.id || 'quiz'}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    success = `${link.download} heruntergeladen. Für dauerhafte Nutzung in den Ordner quizzes/ legen.`;
  }

  async function publish(): Promise<void> {
    if (!token || issues.length > 0 || busy) return;
    busy = true;
    const result = await uploadQuiz(token, toQuizJson(draft));
    busy = false;
    if (result.ok) {
      success = `„${result.data.quiz.name}“ ist jetzt spielbar.`;
      notice = null;
      await load();
    } else {
      notice = result.error;
      if (result.status === 401) hostGame.logout();
    }
  }

  async function handleFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !token) return;

    if (file.size > 512 * 1024) {
      notice = 'Die Datei ist größer als 512 kB.';
      return;
    }

    busy = true;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = await uploadQuiz(token, parsed);
      if (result.ok) {
        success = `„${result.data.quiz.name}“ wurde geprüft und ist jetzt spielbar.`;
        notice = null;
        await load();
      } else {
        notice = result.error;
        if (result.status === 401) hostGame.logout();
      }
    } catch (error) {
      notice = `Die Datei ist kein gültiges JSON: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      busy = false;
    }
  }

  // ------------------------------------------------------------- Bilder

  function pickImage(index: number): void {
    imageTarget = index;
    imageInput?.click();
  }

  async function handleImage(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !token || imageTarget < 0) return;

    busy = true;
    const result = await uploadImage(token, file);
    busy = false;

    if (result.ok) {
      const question = draft.questions[imageTarget];
      question.image = result.data.path;
      if (question.imageAlt.trim().length === 0) question.imageAlt = file.name.replace(/[.][^.]*$/, '');
      success = `Bild „${result.data.path}“ hochgeladen.`;
      notice = null;
      await load();
    } else {
      notice = result.error;
      if (result.status === 401) hostGame.logout();
    }
    imageTarget = -1;
  }

  async function dropImage(path: string): Promise<void> {
    if (!token) return;
    busy = true;
    const result = await removeImage(token, path);
    busy = false;
    if (result.ok) {
      for (const question of draft.questions) {
        if (question.image === path) question.image = '';
      }
      success = `Bild „${path}“ entfernt.`;
      await load();
    } else {
      notice = result.error;
    }
  }

  async function remove(quiz: HostQuiz): Promise<void> {
    if (!token || quiz.source !== 'upload') return;
    busy = true;
    const result = await removeUploadedQuiz(token, quiz.id);
    busy = false;
    if (result.ok) {
      success = `„${quiz.name}“ wurde entfernt.`;
      await load();
    } else {
      notice = result.error;
    }
  }

  $effect(() => {
    hostGame.attach();
    if (!hostGame.isAuthenticated) {
      navigate('/host', { replace: true });
      return;
    }
    void load();
  });

  const difficulties: { value: Difficulty; label: string }[] = [
    { value: 1, label: 'leicht' },
    { value: 2, label: 'mittel' },
    { value: 3, label: 'schwer' },
  ];
</script>

<Backdrop calm />

<div class="page">
  <header class="head">
    <button type="button" class="btn icon" onclick={() => navigate('/host')} aria-label="Zurück zur Host-Übersicht">
      <ArrowLeft size={18} strokeWidth={2.4} />
    </button>
    <Brand size="sm" subtitle="Quizverwaltung" />
    <div class="head-actions">
      <input
        bind:this={fileInput}
        type="file"
        accept="application/json,.json"
        class="hidden-input"
        onchange={handleFile}
      />
      <input
        bind:this={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
        class="hidden-input"
        onchange={handleImage}
      />
      <button type="button" class="btn" onclick={() => fileInput?.click()} disabled={busy}>
        <Upload size={16} strokeWidth={2.4} />
        JSON hochladen
      </button>
    </div>
  </header>

  <div class="notice-slot">
    <NoticeBar message={notice} ondismiss={() => (notice = null)} />
    <NoticeBar message={success} tone="info" ondismiss={() => (success = null)} />
  </div>

  <main class="grid">
    <!-- ------------------------------------------------------ Übersicht -->
    <section class="panel column list-column">
      <div class="col-head">
        <div>
          <p class="label-mono">Verfügbar</p>
          <h2>Quizze</h2>
        </div>
        <button type="button" class="btn small" onclick={startNew}>
          <Plus size={15} strokeWidth={2.6} /> Neu
        </button>
      </div>

      {#if loading}
        <p class="hint">Wird geladen …</p>
      {:else if info}
        <ul class="quiz-list">
          {#each info.quizzes as quiz (quiz.id)}
            <li class="quiz-row">
              <div class="quiz-info">
                <span class="quiz-name">{quiz.name}</span>
                <span class="quiz-meta label-mono">
                  {quiz.questions.length} Fragen &middot;
                  {quiz.source === 'upload' ? 'hochgeladen' : 'Datei'}
                </span>
              </div>
              <div class="quiz-actions">
                <button type="button" class="btn tiny" onclick={() => loadIntoEditor(quiz)} title="In den Editor laden">
                  <Copy size={14} strokeWidth={2.4} />
                </button>
                {#if quiz.source === 'upload'}
                  <button
                    type="button"
                    class="btn tiny btn-danger"
                    onclick={() => remove(quiz)}
                    disabled={busy}
                    title="Hochgeladenes Quiz entfernen"
                  >
                    <Trash2 size={14} strokeWidth={2.4} />
                  </button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>

        <p class="hint">
          {info.uploads.count} von {info.uploads.maxUploads} Uploads belegt. Hochgeladene Quizze liegen im
          Arbeitsspeicher und sind nach einem Neustart weg — für dauerhafte Quizze die Datei in den Ordner
          <code>quizzes/</code> legen.
        </p>

        {#each info.errors as error (error.file)}
          <p class="hint warn">{error.file}: {error.message}</p>
        {/each}
      {/if}
    </section>

    <!-- --------------------------------------------------------- Editor -->
    <section class="panel column editor-column">
      <div class="col-head">
        <div>
          <p class="label-mono">Editor</p>
          <h2>{draft.name || 'Neues Quiz'}</h2>
        </div>
        <div class="editor-actions">
          <button type="button" class="btn small" onclick={download} disabled={issues.length > 0}>
            <Download size={15} strokeWidth={2.4} /> JSON
          </button>
          <button
            type="button"
            class="btn btn-primary small"
            onclick={publish}
            disabled={issues.length > 0 || busy}
          >
            <FileJson size={15} strokeWidth={2.4} />
            {busy ? 'Prüfe …' : 'Übernehmen'}
          </button>
        </div>
      </div>

      {#if blocking.length > 0}
        <ul class="issues">
          {#each blocking as issue (issue.message)}
            <li>{issue.message}</li>
          {/each}
        </ul>
      {/if}

      <div class="meta-grid">
        <label class="field-block">
          <span class="field-label">id (Dateiname)</span>
          <input class="field" bind:value={draft.id} placeholder="mein-quiz" maxlength="64" />
        </label>
        <label class="field-block">
          <span class="field-label">Name</span>
          <input class="field" bind:value={draft.name} placeholder="Mein Quiz" maxlength="80" />
        </label>
        <label class="field-block">
          <span class="field-label">Fachbereich</span>
          <input class="field" bind:value={draft.subject} placeholder="Allgemein" maxlength="60" />
        </label>
        <label class="field-block wide">
          <span class="field-label">Beschreibung</span>
          <input class="field" bind:value={draft.description} placeholder="Worum es geht." maxlength="300" />
        </label>
      </div>

      <div class="questions-head">
        <span class="label-mono">{draft.questions.length} Fragen</span>
        <button type="button" class="btn small" onclick={addQuestion}>
          <Plus size={15} strokeWidth={2.6} /> Frage
        </button>
      </div>

      <ol class="questions">
        {#each draft.questions as question, index (question.id + index)}
          {@const problems = issuesFor(index)}
          <li class="question" class:open={openIndex === index} class:has-issue={problems.length > 0}>
            <div class="q-row">
              <button
                type="button"
                class="q-toggle"
                onclick={() => (openIndex = openIndex === index ? -1 : index)}
                aria-expanded={openIndex === index}
              >
                <span class="q-no label-mono">{index + 1}</span>
                <span class="q-title">{question.question || 'Neue Frage'}</span>
                {#if problems.length > 0}
                  <span class="q-badge">{problems.length}</span>
                {/if}
              </button>
              <div class="q-actions">
                <button type="button" class="btn tiny" onclick={() => move(index, -1)} disabled={index === 0} title="Nach oben">
                  <ArrowUp size={14} strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  class="btn tiny"
                  onclick={() => move(index, 1)}
                  disabled={index === draft.questions.length - 1}
                  title="Nach unten"
                >
                  <ArrowDown size={14} strokeWidth={2.4} />
                </button>
                <button type="button" class="btn tiny" onclick={() => duplicateQuestion(index)} title="Duplizieren">
                  <Copy size={14} strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  class="btn tiny btn-danger"
                  onclick={() => removeQuestion(index)}
                  disabled={draft.questions.length <= 1}
                  title="Frage löschen"
                >
                  <X size={14} strokeWidth={2.6} />
                </button>
              </div>
            </div>

            {#if openIndex === index}
              <div class="q-body">
                {#if problems.length > 0}
                  <ul class="issues">
                    {#each problems as problem (problem)}
                      <li>{problem}</li>
                    {/each}
                  </ul>
                {/if}

                <label class="field-block">
                  <span class="field-label">Frage</span>
                  <textarea class="field area" rows="2" bind:value={question.question} maxlength="500"></textarea>
                </label>

                <div class="row-3">
                  <label class="field-block">
                    <span class="field-label">Kategorie</span>
                    <input class="field" bind:value={question.category} maxlength="60" />
                  </label>
                  <div class="field-block">
                    <span class="field-label">Schwierigkeit</span>
                    <div class="chips">
                      {#each difficulties as level (level.value)}
                        <button
                          type="button"
                          class="chip"
                          class:active={question.difficulty === level.value}
                          onclick={() => (question.difficulty = level.value)}
                        >
                          {level.label}
                        </button>
                      {/each}
                    </div>
                  </div>
                  <label class="field-block">
                    <span class="field-label">Dauer in s (optional)</span>
                    <input class="field" type="number" min="5" max="300" bind:value={question.duration} />
                  </label>
                </div>

                <div class="image-block">
                  <div class="image-fields">
                  <label class="field-block">
                    <span class="field-label">Bild (optional)</span>
                    <select class="field" bind:value={question.image}>
                      <option value="">kein Bild</option>
                      {#each info?.media ?? [] as file (file)}
                        <option value={file}>{file}</option>
                      {/each}
                      {#if question.image && !(info?.media ?? []).includes(question.image)}
                        <option value={question.image}>{question.image} (fehlt)</option>
                      {/if}
                    </select>
                  </label>
                  <label class="field-block">
                    <span class="field-label">Bildbeschreibung</span>
                    <input class="field" bind:value={question.imageAlt} maxlength="300" disabled={!question.image} />
                  </label>
                  <div class="image-buttons">
                    <button type="button" class="btn small" onclick={() => pickImage(index)} disabled={busy}>
                      <ImageIcon size={15} strokeWidth={2.4} /> Bild hochladen
                    </button>
                    {#if question.image && (info?.uploadedMedia ?? []).includes(question.image)}
                      <button
                        type="button"
                        class="btn small btn-danger"
                        onclick={() => dropImage(question.image)}
                        disabled={busy}
                      >
                        <Trash2 size={15} strokeWidth={2.4} /> Bild entfernen
                      </button>
                    {/if}
                  </div>
                  </div>

                  <div class="image-preview">
                    {#if question.image}
                      <img src={`/quiz-media/${question.image}`} alt={question.imageAlt || 'Vorschau'} />
                    {:else}
                      <span class="label-mono">keine Vorschau</span>
                    {/if}
                  </div>
                </div>

                <div class="field-block">
                  <span class="field-label">
                    Antworten &middot; die richtige markieren ({question.answers.length}/{MAX_ANSWERS})
                  </span>
                  <ul class="answers">
                    {#each question.answers as answer, answerIndex (answerIndex)}
                      <li class="answer" class:is-correct={question.correctIndex === answerIndex}>
                        <label class="radio">
                          <input
                            type="radio"
                            name={`correct-${index}`}
                            checked={question.correctIndex === answerIndex}
                            onchange={() => (question.correctIndex = answerIndex)}
                          />
                          <span class="letter">{ANSWER_IDS[answerIndex]}</span>
                        </label>
                        <input class="field" bind:value={answer.text} maxlength="300" placeholder="Antworttext" />
                        <button
                          type="button"
                          class="btn tiny"
                          onclick={() => removeAnswer(index, answerIndex)}
                          disabled={question.answers.length <= MIN_ANSWERS}
                          title="Antwort entfernen"
                        >
                          <X size={14} strokeWidth={2.6} />
                        </button>
                      </li>
                    {/each}
                  </ul>
                  <button
                    type="button"
                    class="btn small"
                    onclick={() => addAnswer(index)}
                    disabled={question.answers.length >= MAX_ANSWERS}
                  >
                    <Plus size={15} strokeWidth={2.6} /> Antwort
                  </button>
                </div>

                <label class="field-block">
                  <span class="field-label">Erklärung (erscheint bei der Auflösung)</span>
                  <textarea class="field area" rows="2" bind:value={question.explanation} maxlength="1000"></textarea>
                </label>

                <label class="check">
                  <input type="checkbox" bind:checked={question.inDefault} />
                  <span>Teil der Standardauswahl (wenn nicht zufällig gemischt wird)</span>
                </label>
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    </section>
  </main>

  <Credit align="center" />
</div>

<style>
  .page {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    width: 100%;
    max-width: 84rem;
    margin: 0 auto;
    padding: 1rem;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .head-actions {
    display: flex;
    gap: 0.4rem;
  }

  .icon {
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
  }

  .hidden-input {
    display: none;
  }

  .notice-slot:empty {
    display: none;
  }

  .grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.85rem;
    min-height: 0;
  }

  .column {
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
  }

  .col-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .col-head h2 {
    margin: 0.15rem 0 0;
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .editor-actions {
    display: flex;
    gap: 0.4rem;
  }

  .small {
    min-height: 2.4rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
  }

  .tiny {
    min-height: 2rem;
    padding: 0.3rem 0.45rem;
  }

  .quiz-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    max-height: 34vh;
    overflow-y: auto;
  }

  .quiz-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.7rem;
    border-radius: 0.75rem;
    border: 1px solid var(--color-line);
    background: rgb(255 255 255 / 3%);
  }

  .quiz-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .quiz-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quiz-actions {
    display: flex;
    gap: 0.25rem;
  }

  .hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--color-ink-dim);
    line-height: 1.45;
  }

  .hint.warn {
    color: #fca5a5;
  }

  code {
    font-family: var(--font-mono);
    font-size: 0.9em;
    padding: 0.05em 0.3em;
    border-radius: 0.3rem;
    background: rgb(255 255 255 / 7%);
  }

  .issues {
    list-style: disc;
    margin: 0;
    padding: 0.5rem 0.75rem 0.5rem 1.6rem;
    border-radius: 0.7rem;
    background: rgb(248 113 113 / 10%);
    border: 1px solid color-mix(in oklab, var(--color-bad) 40%, transparent);
    color: #fca5a5;
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.6rem;
  }

  .field-block {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }

  .field-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-ink-muted);
  }

  .area {
    resize: vertical;
    line-height: 1.45;
    font-family: inherit;
  }

  select.field {
    appearance: none;
  }

  .questions-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding-top: 0.25rem;
    border-top: 1px solid var(--color-line);
  }

  .questions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    overflow-y: auto;
    min-height: 0;
  }

  .question {
    border-radius: 0.8rem;
    border: 1px solid var(--color-line);
    background: rgb(255 255 255 / 2.5%);
  }

  .question.open {
    border-color: var(--color-line-strong);
    background: rgb(255 255 255 / 4%);
  }

  .question.has-issue {
    border-color: color-mix(in oklab, var(--color-bad) 45%, var(--color-line));
  }

  .q-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.5rem;
  }

  .q-toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
    padding: 0.35rem 0.3rem;
    border: none;
    background: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .q-no {
    flex: none;
  }

  .q-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
  }

  .q-badge {
    flex: none;
    min-width: 1.3rem;
    padding: 0.05rem 0.35rem;
    border-radius: 999px;
    background: var(--color-bad);
    color: #1a0505;
    font-size: 0.7rem;
    font-weight: 800;
    text-align: center;
  }

  .q-actions {
    display: flex;
    gap: 0.2rem;
  }

  .q-body {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.35rem 0.75rem 0.85rem;
  }

  .row-3 {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.6rem;
  }

  .image-block {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.6rem;
  }

  .image-fields {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
  }

  .image-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .image-preview {
    display: grid;
    place-items: center;
    min-height: 7rem;
    padding: 0.4rem;
    border-radius: 0.8rem;
    border: 1px dashed var(--color-line-strong);
    background: rgb(255 255 255 / 4%);
    overflow: hidden;
  }

  .image-preview img {
    max-width: 100%;
    max-height: 12rem;
    object-fit: contain;
    border-radius: 0.5rem;
    background: #ffffff;
    padding: 0.3rem;
  }

  .chips {
    display: flex;
    gap: 0.3rem;
  }

  .chip {
    flex: 1;
    min-height: 2.6rem;
    padding: 0.4rem 0.5rem;
    border-radius: 0.6rem;
    border: 1px solid var(--color-line-strong);
    background: rgb(255 255 255 / 3%);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }

  .chip.active {
    border-color: transparent;
    background: linear-gradient(135deg, var(--color-brand-deep), var(--color-accent));
    color: #05070f;
  }

  .answers {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .answer {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.25rem 0.4rem;
    border-radius: 0.6rem;
    border: 1px solid transparent;
  }

  .answer.is-correct {
    border-color: color-mix(in oklab, var(--color-good) 50%, transparent);
    background: rgb(52 211 153 / 10%);
  }

  .radio {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
    flex: none;
  }

  .radio input {
    accent-color: var(--color-good);
    width: 1.05rem;
    height: 1.05rem;
  }

  .letter {
    font-family: var(--font-mono);
    font-weight: 700;
    width: 1ch;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.84rem;
    color: var(--color-ink-muted);
    cursor: pointer;
  }

  .check input {
    accent-color: var(--color-brand);
    width: 1.05rem;
    height: 1.05rem;
  }

  @media (min-width: 900px) {
    .meta-grid {
      grid-template-columns: 1fr 1fr;
    }

    .meta-grid .wide {
      grid-column: 1 / -1;
    }

    .row-3 {
      grid-template-columns: 1.2fr 1.4fr 0.8fr;
    }

    .image-block {
      grid-template-columns: 1.25fr 0.75fr;
      align-items: start;
    }
  }

  @media (min-width: 1100px) {
    .grid {
      grid-template-columns: minmax(17rem, 0.55fr) 1.45fr;
    }

    .questions {
      max-height: 52vh;
    }
  }
</style>
