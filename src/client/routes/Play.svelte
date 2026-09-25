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

<Backdrop calm traffic={phase === 'LOBBY'} />

<div class="page" class:fixed-height={phase === 'QUESTION' || phase === 'LOCKED'}>
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
        <!-- Warteanzeige als das, worum es geht: zwei Lifelines, die miteinander reden. -->
        <div class="wait" aria-hidden="true">
          <span class="line"></span>
          <span class="line"></span>
          <span class="line"></span>
          <span class="hop hop-1"></span>
          <span class="hop hop-2"></span>
          <span class="hop hop-3"></span>
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
          <QuestionImage src={question.imageUrl} alt={question.imageAlt} />
        {/if}

        <TimerBar
          progress={playerGame.clock.progress}
          seconds={playerGame.clock.remainingSeconds}
          locked={phase === 'LOCKED'}
          compact
        />

        <div class="options" class:many={question.answers.length > 4}>
          {#each question.answers as answer (answer.id)}
            <AnswerOption
              id={answer.id}
              text={answer.text}
              selected={selected === answer.id}
              disabled={selected !== null || phase !== 'QUESTION'}
              compact={question.answers.length > 4}
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
            <QuestionImage src={question.imageUrl} alt={question.imageAlt} variant="inline" />
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
    min-height: 0;
  }

  /* Waehrend einer laufenden Frage darf nichts scrollen: Alles muss auf den
     Schirm, das Bild gibt dafuer Hoehe ab. */
  .page.fixed-height {
    height: 100dvh;
    padding-bottom: 0.85rem;
    gap: 0.5rem;
    overflow: hidden;
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
    min-height: 0;
  }

  .center-card {
    position: relative;
    overflow: hidden;
    margin: auto 0;
    padding: 2rem 1.5rem;
    text-align: center;
    animation: var(--animate-rise);
  }

  /* Ein Licht wandert die Oberkante entlang und rahmt die Wartezeit. */
  .center-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 1px;
    width: 55%;
    background: linear-gradient(90deg, transparent, var(--color-brand), var(--color-accent), transparent);
    animation: edge-run 7s ease-in-out infinite;
  }

  @keyframes edge-run {
    0%,
    100% {
      transform: translateX(-60%);
    }
    50% {
      transform: translateX(160%);
    }
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
    animation: code-glow 4.5s ease-in-out infinite;
  }

  @keyframes code-glow {
    0%,
    100% {
      text-shadow: 0 0 0 transparent;
    }
    50% {
      text-shadow: 0 0 14px color-mix(in oklab, var(--color-brand) 55%, transparent);
    }
  }

  /*
   * Drei Lifelines, zwischen denen Nachrichten hin- und herspringen. Solange
   * hier etwas laeuft, weiss man ohne Text, dass die Verbindung steht.
   */
  .wait {
    position: relative;
    width: min(15rem, 78%);
    height: 6rem;
    margin: 1.7rem auto 1.1rem;
  }

  .wait .line {
    position: absolute;
    top: 0.75rem;
    bottom: 0;
    width: 1.5px;
    background: linear-gradient(
      180deg,
      color-mix(in oklab, var(--color-brand) 90%, transparent),
      color-mix(in oklab, var(--color-accent) 70%, transparent) 70%,
      transparent
    );
  }

  /* Der Kopf macht aus drei Strichen erkennbar drei Teilnehmer. */
  .wait .line::before {
    content: '';
    position: absolute;
    top: -0.75rem;
    left: 50%;
    width: 1.5rem;
    height: 0.62rem;
    margin-left: -0.75rem;
    border-radius: 0.2rem;
    border: 1px solid color-mix(in oklab, var(--color-brand) 60%, transparent);
    background: color-mix(in oklab, var(--color-brand) 18%, transparent);
    animation: var(--animate-breathe);
  }

  .wait .line:nth-child(2)::before {
    border-color: color-mix(in oklab, var(--color-teal) 60%, transparent);
    background: color-mix(in oklab, var(--color-teal) 18%, transparent);
    animation-delay: 1.2s;
  }

  .wait .line:nth-child(3)::before {
    border-color: color-mix(in oklab, var(--color-accent) 60%, transparent);
    background: color-mix(in oklab, var(--color-accent) 18%, transparent);
    animation-delay: 2.4s;
  }

  .wait .line:nth-child(1) {
    left: 12%;
  }

  .wait .line:nth-child(2) {
    left: 50%;
  }

  .wait .line:nth-child(3) {
    left: 88%;
  }

  .hop {
    position: absolute;
    height: 2px;
    border-radius: 999px;
    overflow: hidden;
  }

  .hop::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 38%;
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, currentcolor);
    box-shadow: 0 0 8px 0 currentcolor;
    animation: hop-travel 3.2s cubic-bezier(0.5, 0, 0.3, 1) infinite;
  }

  .hop-1 {
    top: 26%;
    left: 12%;
    width: 38%;
    color: var(--color-brand);
  }

  /* Die Antwort laeuft zurueck -- gespiegelt statt zweiter Keyframes. */
  .hop-2 {
    top: 52%;
    left: 50%;
    width: 38%;
    color: var(--color-teal);
    transform: scaleX(-1);
  }

  .hop-2::after {
    animation-delay: 1.05s;
  }

  .hop-3 {
    top: 78%;
    left: 50%;
    width: 38%;
    color: var(--color-accent);
  }

  .hop-3::after {
    animation-delay: 2.1s;
  }

  @keyframes hop-travel {
    0% {
      transform: translateX(-100%);
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    55% {
      opacity: 1;
    }
    68%,
    100% {
      transform: translateX(263%);
      opacity: 0;
    }
  }

  .question-view {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    animation: var(--animate-rise);
  }

  .round-line {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    flex: none;
  }

  /* Sehr flache Geraete: der Hinweis ist verzichtbar, die Antwortflaechen nicht. */
  @media (max-height: 620px) {
    .saved.hint-only {
      display: none;
    }

    .page.fixed-height {
      padding: 0.5rem 0.6rem;
      gap: 0.35rem;
    }

    .question-view {
      gap: 0.4rem;
    }

    .round-line {
      font-size: 0.66rem;
    }
  }

  .question-text {
    margin: 0;
    /* Auch an der Bildschirmhoehe orientiert -- auf kleinen Geraeten kleiner. */
    font-size: clamp(1rem, min(4.6vw, 2.4vh), 1.6rem);
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.01em;
    flex: none;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: none;
  }

  .options.many {
    gap: 0.35rem;
  }

  .saved {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    margin: 0;
    flex: none;
    padding: 0.5rem;
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
