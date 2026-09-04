<script lang="ts">
  import { Check, Flame, LogOut, Trophy, WifiOff, X } from '@lucide/svelte';

  import type { AnswerId } from '../../shared/types.js';
  import Backdrop from '../lib/components/Backdrop.svelte';
  import AnswerOption from '../lib/components/AnswerOption.svelte';
  import Leaderboard from '../lib/components/Leaderboard.svelte';
  import NoticeBar from '../lib/components/NoticeBar.svelte';
  import QuestionImage from '../lib/components/QuestionImage.svelte';
  import SoundToggle from '../lib/components/SoundToggle.svelte';
  import TimerBar from '../lib/components/TimerBar.svelte';
  import { playerGame } from '../lib/playerGame.svelte.js';
  import { navigate } from '../lib/router.svelte.js';

  let restoring = $state(true);

  const phase = $derived(playerGame.roomState?.phase ?? 'LOBBY');
  const question = $derived(playerGame.question);
  const personal = $derived(playerGame.personal);
  const session = $derived(playerGame.session);
  const selected = $derived(playerGame.selectedAnswer);
  const standing = $derived(playerGame.standing);

  function optionState(id: AnswerId): 'none' | 'correct' | 'wrong' | 'dimmed' {
    if (!personal || phase === 'QUESTION') return 'none';
    if (id === personal.correctAnswer) return 'correct';
    if (id === personal.selected) return 'wrong';
    return 'dimmed';
  }

  function handleSelect(id: AnswerId): void {
    void playerGame.submit(id);
  }

  async function leave(): Promise<void> {
    await playerGame.leave();
    navigate('/');
  }

  $effect(() => {
    playerGame.attach();
    void (async () => {
      const result = await playerGame.reconnect();
      restoring = false;
      if (!result.ok) {
        // Ohne gültige Sitzung zurück zum Beitritt.
        navigate('/join', { replace: true });
      }
    })();
  });
</script>

<Backdrop calm />

<div class="page">
  <header class="head">
    <div class="identity">
      <span class="label-mono">Du spielst als</span>
      <strong class="nick">{session?.nickname ?? '…'}</strong>
    </div>
    <div class="head-actions">
      {#if !playerGame.connected}
        <span class="offline" title="Keine Verbindung"><WifiOff size={16} strokeWidth={2.4} /> Offline</span>
      {/if}
      <SoundToggle compact />
      <button type="button" class="btn btn-danger leave" onclick={leave} aria-label="Quiz verlassen">
        <LogOut size={16} strokeWidth={2.4} />
      </button>
    </div>
  </header>

  <div class="notice-slot">
    <NoticeBar message={playerGame.notice} ondismiss={() => playerGame.dismissNotice()} />
  </div>

  <main class="main">
    {#if restoring}
      <section class="panel center-card">
        <p class="label-mono">Verbinde</p>
        <h1 class="headline big">Sitzung wird geladen …</h1>
      </section>
    {:else if phase === 'LOBBY'}
      <section class="panel center-card">
        <p class="label-mono">Lobby</p>
        <h1 class="headline big">Gleich geht&rsquo;s los</h1>
        <p class="muted">
          Du bist im Raum <span class="code">{playerGame.roomState?.code ?? ''}</span>. Warte, bis der Host das Quiz
          startet.
        </p>
        <div class="pulse-row" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <p class="muted small">{playerGame.roomState?.playerCount ?? 0} Teilnehmer verbunden</p>
      </section>
    {:else if (phase === 'QUESTION' || phase === 'LOCKED') && question}
      <section class="question-view">
        <div class="round-line">
          <span class="label-mono">Frage {question.index + 1} / {question.total}</span>
          <span class="label-mono">{question.category}</span>
        </div>

        <h1 class="question-text">{question.question}</h1>

        {#if question.imageUrl}
          <QuestionImage src={question.imageUrl} alt={question.imageAlt} variant="mobile" />
        {/if}

        <TimerBar
          progress={playerGame.clock.progress}
          seconds={playerGame.clock.remainingSeconds}
          locked={phase === 'LOCKED'}
          compact
        />

        <div class="options">
          {#each question.answers as answer (answer.id)}
            <AnswerOption
              id={answer.id}
              text={answer.text}
              selected={selected === answer.id}
              disabled={selected !== null || phase !== 'QUESTION'}
              onselect={handleSelect}
            />
          {/each}
        </div>

        {#if selected}
          <p class="saved"><Check size={16} strokeWidth={3} /> Antwort {selected} gespeichert</p>
        {:else if phase === 'LOCKED'}
          <p class="saved missed">Keine Antwort abgegeben</p>
        {:else}
          <p class="saved hint-only">Tippe auf deine Antwort</p>
        {/if}
      </section>
    {:else if phase === 'REVEAL' && personal}
      <section class="panel result" class:correct={personal.correct} class:wrong={!personal.correct}>
        <div class="result-head">
          <span class="result-icon">
            {#if personal.correct}
              <Check size={28} strokeWidth={3.5} />
            {:else}
              <X size={28} strokeWidth={3.5} />
            {/if}
          </span>
          <div>
            <p class="label-mono">Runde {(playerGame.roomState?.roundIndex ?? 0) + 1}</p>
            <h1 class="headline big">{personal.correct ? 'Richtig' : personal.selected ? 'Leider falsch' : 'Keine Antwort'}</h1>
          </div>
        </div>

        <p class="correct-line">
          Korrekte Antwort: <strong>{personal.correctAnswer}</strong>
        </p>

        {#if question?.imageUrl}
          <div class="reveal-image">
            <QuestionImage src={question.imageUrl} alt={question.imageAlt} variant="mobile" />
          </div>
        {/if}

        {#if question}
          <div class="reveal-options">
            {#each question.answers as answer (answer.id)}
              <AnswerOption id={answer.id} text={answer.text} disabled state={optionState(answer.id)} />
            {/each}
          </div>
        {/if}

        <p class="explanation">{personal.explanation}</p>

        <div class="score-grid">
          <div class="score-tile">
            <span class="label-mono">Punkte</span>
            <strong class="tabular">+{personal.pointsAwarded.toLocaleString('de-DE')}</strong>
            {#if personal.correct}
              <span class="detail">{personal.basePoints} + {personal.timeBonus} Zeitbonus</span>
              {#if personal.streakMultiplier > 1}
                <span class="detail">x{personal.streakMultiplier.toFixed(2)} Streak</span>
              {/if}
            {/if}
          </div>
          <div class="score-tile">
            <span class="label-mono">Gesamt</span>
            <strong class="tabular">{personal.totalScore.toLocaleString('de-DE')}</strong>
            <span class="detail">Platz {personal.rank} von {personal.playerCount}</span>
          </div>
          <div class="score-tile">
            <span class="label-mono">Streak</span>
            <strong class="tabular streak"><Flame size={18} strokeWidth={2.6} />{personal.streak}</strong>
            <span class="detail">{personal.streak >= 2 ? 'in Folge richtig' : 'zurückgesetzt'}</span>
          </div>
        </div>
      </section>
    {:else if phase === 'LEADERBOARD' || phase === 'FINISHED'}
      <section class="panel board-card">
        <div class="board-head">
          <Trophy size={22} strokeWidth={2.2} />
          <div>
            <p class="label-mono">{phase === 'FINISHED' ? 'Endstand' : 'Zwischenstand'}</p>
            <h1 class="headline big">Rangliste</h1>
          </div>
        </div>

        {#if standing}
          <div class="own-standing">
            <span class="label-mono">Dein Platz</span>
            <strong class="tabular">{standing.rank} <span class="of">/ {standing.playerCount}</span></strong>
            <span class="own-score tabular">{standing.score.toLocaleString('de-DE')} Punkte</span>
          </div>
        {/if}

        <Leaderboard entries={playerGame.leaderboard} compact />

        {#if phase === 'FINISHED'}
          <button type="button" class="btn full" onclick={leave}>Quiz verlassen</button>
        {/if}
      </section>
    {:else}
      <section class="panel center-card">
        <p class="label-mono">Warten</p>
        <h1 class="headline big">Gleich geht es weiter</h1>
        <p class="muted">Der Host steuert den nächsten Schritt.</p>
      </section>
    {/if}
  </main>
</div>

<style>
  .page {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 40rem;
    margin: 0 auto;
    padding: 0.85rem 0.85rem 1.5rem;
    gap: 0.75rem;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }

  .identity {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .nick {
    font-size: 1.05rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .head-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: none;
  }

  .offline {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.75rem;
    font-weight: 700;
    color: #fca5a5;
    padding: 0.3rem 0.5rem;
    border-radius: 999px;
    background: rgb(248 113 113 / 14%);
  }

  .leave {
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
  }

  .notice-slot:empty {
    display: none;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .center-card {
    margin: auto 0;
    padding: 2rem 1.5rem;
    text-align: center;
    animation: var(--animate-rise);
  }

  .big {
    font-size: 1.8rem;
    margin: 0.4rem 0 0.8rem;
  }

  .muted {
    color: var(--color-ink-muted);
    margin: 0;
    line-height: 1.55;
  }

  .small {
    font-size: 0.85rem;
    margin-top: 1rem;
  }

  .code {
    font-family: var(--font-mono);
    letter-spacing: 0.2em;
    color: var(--color-brand);
    font-weight: 700;
  }

  .pulse-row {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    margin: 1.5rem 0 0.5rem;
  }

  .pulse-row span {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 999px;
    background: var(--color-brand);
    animation: var(--animate-pulse-soft);
  }

  .pulse-row span:nth-child(2) {
    animation-delay: 0.3s;
    background: var(--color-accent);
  }

  .pulse-row span:nth-child(3) {
    animation-delay: 0.6s;
    background: var(--color-teal);
  }

  .question-view {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    animation: var(--animate-rise);
  }

  .round-line {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .question-text {
    margin: 0;
    font-size: clamp(1.15rem, 5vw, 1.6rem);
    font-weight: 700;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-top: 0.35rem;
  }

  .saved {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    margin: 0.4rem 0 0;
    padding: 0.6rem;
    border-radius: 0.75rem;
    font-size: 0.9rem;
    font-weight: 600;
    background: rgb(52 211 153 / 12%);
    color: #6ee7b7;
  }

  .saved.missed {
    background: rgb(248 113 113 / 12%);
    color: #fca5a5;
  }

  .saved.hint-only {
    background: transparent;
    color: var(--color-ink-dim);
    font-weight: 500;
  }

  .result {
    padding: 1.5rem 1.25rem;
    animation: var(--animate-rise);
    border-width: 1px;
  }

  .result.correct {
    border-color: color-mix(in oklab, var(--color-good) 55%, var(--color-line));
  }

  .result.wrong {
    border-color: color-mix(in oklab, var(--color-bad) 45%, var(--color-line));
  }

  .result-head {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    margin-bottom: 1rem;
  }

  .result-icon {
    display: grid;
    place-items: center;
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 1rem;
    flex: none;
  }

  .correct .result-icon {
    background: var(--color-good);
    color: #04140d;
  }

  .wrong .result-icon {
    background: var(--color-bad);
    color: #1a0505;
  }

  .correct-line {
    margin: 0 0 0.6rem;
    color: var(--color-ink-muted);
  }

  .correct-line strong {
    font-family: var(--font-mono);
    color: var(--color-ink);
  }

  .reveal-image {
    margin-bottom: 0.9rem;
  }

  .reveal-options {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    margin-bottom: 1.1rem;
  }

  .explanation {
    margin: 0 0 1.25rem;
    padding: 0.85rem 1rem;
    border-left: 3px solid var(--color-brand);
    border-radius: 0 0.6rem 0.6rem 0;
    background: rgb(56 189 248 / 8%);
    font-size: 0.94rem;
    line-height: 1.6;
    color: var(--color-ink-muted);
  }

  .score-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .score-tile {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.7rem 0.6rem;
    border-radius: 0.8rem;
    background: rgb(255 255 255 / 4%);
    border: 1px solid var(--color-line);
  }

  .score-tile strong {
    font-size: 1.3rem;
    font-weight: 800;
  }

  .score-tile .streak {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: #fdba74;
  }

  .detail {
    font-size: 0.72rem;
    color: var(--color-ink-dim);
  }

  .board-card {
    padding: 1.35rem 1.1rem;
    animation: var(--animate-rise);
  }

  .board-head {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin-bottom: 1rem;
    color: #fcd34d;
  }

  .board-head h1 {
    color: var(--color-ink);
  }

  .own-standing {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    padding: 0.8rem 1rem;
    margin-bottom: 1rem;
    border-radius: 0.85rem;
    background: linear-gradient(90deg, rgb(56 189 248 / 14%), rgb(167 139 250 / 10%));
    border: 1px solid var(--color-line-strong);
  }

  .own-standing strong {
    font-size: 1.7rem;
    font-weight: 800;
  }

  .of {
    font-size: 0.9rem;
    color: var(--color-ink-dim);
    font-weight: 600;
  }

  .own-score {
    margin-left: auto;
    font-weight: 700;
    color: var(--color-ink-muted);
  }

  .full {
    width: 100%;
    margin-top: 1rem;
  }
</style>
