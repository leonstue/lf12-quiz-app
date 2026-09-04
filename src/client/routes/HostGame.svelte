<script lang="ts">
  import {
    ArrowLeft,
    ChevronRight,
    Eye,
    Maximize2,
    Minimize2,
    Pause,
    Play,
    Square,
    Trophy,
    Users,
  } from '@lucide/svelte';

  import type { GamePhase, TimerPreset } from '../../shared/types.js';
  import Backdrop from '../lib/components/Backdrop.svelte';
  import AnswerOption from '../lib/components/AnswerOption.svelte';
  import Brand from '../lib/components/Brand.svelte';
  import Credit from '../lib/components/Credit.svelte';
  import DistributionChart from '../lib/components/DistributionChart.svelte';
  import Leaderboard from '../lib/components/Leaderboard.svelte';
  import ReviewMatrix from '../lib/components/ReviewMatrix.svelte';
  import RoundAnswers from '../lib/components/RoundAnswers.svelte';
  import NoticeBar from '../lib/components/NoticeBar.svelte';
  import QrCode from '../lib/components/QrCode.svelte';
  import SoundToggle from '../lib/components/SoundToggle.svelte';
  import TimerBar from '../lib/components/TimerBar.svelte';
  import { hostGame } from '../lib/hostGame.svelte.js';
  import { navigate } from '../lib/router.svelte.js';

  interface Props {
    code: string;
  }
  let { code }: Props = $props();

  let loading = $state(true);
  let fullscreen = $state(false);
  let nowTick = $state(Date.now());

  const room = $derived(hostGame.roomState);
  const phase = $derived<GamePhase>(room?.phase ?? 'LOBBY');
  const question = $derived(hostGame.question);
  const reveal = $derived(hostGame.reveal);
  const players = $derived(room?.players ?? []);

  const joinUrl = $derived.by(() => {
    const raw = room?.joinUrl ?? '';
    if (!raw) return '';
    if (raw.startsWith('/')) {
      return typeof window === 'undefined' ? raw : `${window.location.origin}${raw}`;
    }
    return raw;
  });

  const joinHost = $derived.by(() => {
    if (!joinUrl) return '';
    try {
      return new URL(joinUrl).host;
    } catch {
      return joinUrl;
    }
  });

  const timerLabel: Record<TimerPreset, string> = {
    relaxed: 'Relaxed (30 s)',
    standard: 'Standard (20 s, schwere Fragen 25 s)',
    fast: 'Fast (12 s)',
  };

  const phaseLabel: Record<GamePhase, string> = {
    LOBBY: 'Lobby',
    QUESTION: 'Frage läuft',
    LOCKED: 'Antworten gesperrt',
    REVEAL: 'Auflösung',
    LEADERBOARD: 'Rangliste',
    FINISHED: 'Beendet',
  };

  // Countdown bis zum naechsten automatischen Schritt.
  const autoMsLeft = $derived.by(() => {
    const at = room?.pendingAtMs;
    if (!at) return null;
    return Math.max(0, at - (nowTick + hostGame.serverOffsetMs));
  });
  const autoLabel: Record<string, string> = {
    reveal: 'Auflösung',
    next: 'Weiter',
    finish: 'Abschluss',
  };

  /** Position der laufenden Runde innerhalb der geladenen Auswertung. */
  const detailSlot = $derived.by(() => {
    const review = hostGame.review;
    if (!review || !question) return -1;
    return review.rounds.findIndex((round) => round.index === question.index);
  });

  const canStart = $derived(phase === 'LOBBY' && !hostGame.busy);
  const canReveal = $derived((phase === 'QUESTION' || phase === 'LOCKED') && !hostGame.busy);
  // Auf der Endkarte steht die Rangliste bereits -- der Button waere dort wirkungslos.
  const canLeaderboard = $derived(phase !== 'LOBBY' && phase !== 'FINISHED' && !hostGame.busy);
  const canNext = $derived(phase !== 'LOBBY' && phase !== 'FINISHED' && !hostGame.busy);
  const canEnd = $derived(phase !== 'FINISHED' && !hostGame.busy);
  const isLastRound = $derived((room?.roundIndex ?? -1) + 1 >= (room?.totalRounds ?? 0));

  function toggleFullscreen(): void {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      void document.exitFullscreen?.().catch(() => undefined);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    switch (event.key.toLowerCase()) {
      case 's':
        if (canStart) void hostGame.start();
        break;
      case 'r':
        if (canReveal) void hostGame.revealAnswer();
        break;
      case 'l':
        if (canLeaderboard) void hostGame.showLeaderboard();
        break;
      case 'n':
      case ' ':
        if (canNext) {
          event.preventDefault();
          void hostGame.next();
        } else if (canStart) {
          event.preventDefault();
          void hostGame.start();
        }
        break;
      case 'f':
        toggleFullscreen();
        break;
      default:
        break;
    }
  }

  $effect(() => {
    hostGame.attach();
    if (!hostGame.isAuthenticated) {
      navigate('/host', { replace: true });
      return;
    }
    void (async () => {
      await hostGame.joinRoom(code);
      loading = false;
    })();
  });

  $effect(() => {
    const handle = setInterval(() => (nowTick = Date.now()), 250);
    return () => clearInterval(handle);
  });

  $effect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => (fullscreen = Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<Backdrop />

<div class="stage">
  <header class="top">
    <div class="top-left">
      <button type="button" class="btn icon" onclick={() => navigate('/host')} aria-label="Zurück zur Host-Übersicht">
        <ArrowLeft size={18} strokeWidth={2.4} />
      </button>
      <Brand size="sm" />
    </div>

    <div class="top-meta">
      <span class="status-pill" data-phase={phase}>{phaseLabel[phase]}</span>
      {#if phase !== 'LOBBY'}
        <span class="round label-mono">Runde {(room?.roundIndex ?? 0) + 1} / {room?.totalRounds ?? 0}</span>
      {/if}
      <span class="players"><Users size={16} strokeWidth={2.4} /> {room?.playerCount ?? 0}</span>
      <SoundToggle compact />
      <button
        type="button"
        class="btn icon"
        onclick={toggleFullscreen}
        aria-label={fullscreen ? 'Vollbild beenden' : 'Vollbild'}
      >
        {#if fullscreen}
          <Minimize2 size={18} strokeWidth={2.4} />
        {:else}
          <Maximize2 size={18} strokeWidth={2.4} />
        {/if}
      </button>
    </div>
  </header>

  <div class="notice-slot">
    <NoticeBar message={hostGame.notice} ondismiss={() => hostGame.dismissNotice()} />
  </div>

  <main class="content">
    {#if loading}
      <section class="center">
        <h1 class="headline hero-title">Session wird geladen …</h1>
      </section>
    {:else if !room}
      <section class="center">
        <h1 class="headline hero-title">Session nicht gefunden</h1>
        <p class="muted">Der Raum <span class="mono">{code}</span> existiert nicht mehr.</p>
        <button type="button" class="btn btn-primary" onclick={() => navigate('/host')}>Neues Quiz erstellen</button>
      </section>
    {:else if phase === 'LOBBY'}
      <section class="lobby">
        <div class="lobby-main">
          <p class="label-mono">Live-Quiz &middot; UML-Sequenzdiagramme</p>
          <h1 class="headline hero-title"><span class="gradient-text">Sequence</span> Challenge</h1>

          <div class="join-grid">
            <div class="join-block">
              <span class="label-mono">Join</span>
              <span class="join-value">{joinHost || 'diese Adresse'}</span>
            </div>
            <div class="join-block">
              <span class="label-mono">Code</span>
              <span class="code-value">{room.code}</span>
            </div>
          </div>

          <p class="muted lobby-hint">
            {room.totalRounds} Fragen &middot;
            {room.config.randomizeQuestions ? 'zufällige Auswahl' : 'Standardauswahl'} &middot;
            {timerLabel[room.config.timerPreset]}
          </p>
        </div>

        <div class="lobby-side">
          {#if joinUrl}
            <QrCode value={joinUrl} size={230} />
          {/if}
          <p class="qr-caption label-mono">QR scannen oder Code eingeben</p>
          <Credit compact align="center" />
        </div>
      </section>

      <section class="roster">
        <div class="roster-head">
          <span class="label-mono">{room.playerCount} Teilnehmer verbunden</span>
        </div>
        {#if players.length === 0}
          <p class="muted">Noch niemand beigetreten. Die Liste aktualisiert sich automatisch.</p>
        {:else}
          <ul class="chips">
            {#each players as player (player.id)}
              <li class="player-chip" class:offline={!player.connected}>{player.nickname}</li>
            {/each}
          </ul>
        {/if}
      </section>
    {:else if (phase === 'QUESTION' || phase === 'LOCKED') && question}
      <section class="question">
        <div class="q-head">
          <span class="label-mono">Runde {question.index + 1} / {question.total}</span>
          <span class="label-mono">{question.category}</span>
        </div>

        <h1 class="q-text">{question.question}</h1>

        <TimerBar
          progress={hostGame.clock.progress}
          seconds={hostGame.clock.remainingSeconds}
          locked={phase === 'LOCKED'}
        />

        <div class="q-options">
          {#each question.answers as answer (answer.id)}
            <AnswerOption id={answer.id} text={answer.text} disabled />
          {/each}
        </div>

        <p class="answer-count">
          <strong class="tabular">{room.answeredCount}</strong>
          <span class="of tabular">/ {room.playerCount}</span>
          <span class="label-mono">Antworten</span>
        </p>
      </section>
    {:else if phase === 'REVEAL' && reveal && question}
      <section class="reveal">
        <div class="reveal-left">
          <span class="label-mono">Runde {question.index + 1} / {question.total} &middot; Auflösung</span>
          <h1 class="q-text small">{question.question}</h1>
          <DistributionChart
            distribution={reveal.distribution}
            highlight={hostGame.revealHighlight}
            totalAnswers={reveal.totalAnswers}
          />
        </div>

        <aside class="reveal-right" class:visible={hostGame.revealHighlight}>
          <div class="solution-card panel">
            <span class="label-mono">Richtige Antwort</span>
            <div class="solution-answer">
              <span class="solution-letter">{reveal.correctAnswer}</span>
              <span class="solution-text">
                {reveal.distribution.find((entry) => entry.correct)?.text ?? ''}
              </span>
            </div>
          </div>
          <div class="explain-card panel">
            <span class="label-mono">Erklärung</span>
            <p>{reveal.explanation}</p>
          </div>

          <div class="detail-card panel">
            {#if hostGame.roundDetailVisible && hostGame.review && detailSlot >= 0}
              <RoundAnswers
                round={hostGame.review.rounds[detailSlot]}
                players={hostGame.review.players}
                slot={detailSlot}
              />
            {:else if hostGame.roundDetailVisible}
              <p class="label-mono">Antworten werden geladen …</p>
            {:else}
              <button type="button" class="btn full" onclick={() => hostGame.showRoundDetail()}>
                <Eye size={16} strokeWidth={2.4} />
                Wer hat was geantwortet?
              </button>
            {/if}
          </div>
        </aside>
      </section>
    {:else if phase === 'LEADERBOARD'}
      <section class="board">
        <div class="board-head">
          <Trophy size={30} strokeWidth={2.2} />
          <div>
            <p class="label-mono">Nach Runde {(room.roundIndex ?? 0) + 1}</p>
            <h1 class="headline hero-title small">Rangliste</h1>
          </div>
        </div>
        <Leaderboard entries={hostGame.leaderboard} />
      </section>
    {:else if phase === 'FINISHED'}
      <section class="endcard">
        <div class="end-head">
          <Trophy size={30} strokeWidth={2.2} />
          <div>
            <p class="label-mono">Endstand &middot; Raum {room.code}</p>
            <h1 class="headline hero-title small">Finale Rangliste</h1>
          </div>
          <button type="button" class="btn btn-primary new-game" onclick={() => navigate('/host')}>
            Neues Quiz erstellen
          </button>
        </div>

        <div class="end-grid">
          <div class="end-board">
            <Leaderboard entries={hostGame.leaderboard} />
          </div>

          <div class="end-review panel">
            {#if hostGame.reviewLoading && !hostGame.review}
              <p class="label-mono">Auswertung wird geladen …</p>
            {:else if hostGame.review}
              <ReviewMatrix review={hostGame.review} />
            {:else}
              <div class="review-fallback">
                <p class="label-mono">Auswertung nicht geladen</p>
                <button type="button" class="btn" onclick={() => hostGame.loadReview()}>Erneut versuchen</button>
              </div>
            {/if}
          </div>
        </div>
      </section>
    {:else}
      <section class="center">
        <h1 class="headline hero-title">Bereit</h1>
        <p class="muted">Nächsten Schritt über die Steuerung unten auslösen.</p>
      </section>
    {/if}
  </main>

  <footer class="controls">
    <div class="stats">
      <div class="stat">
        <span class="label-mono">Status</span>
        <strong>{phaseLabel[phase]}</strong>
      </div>
      <div class="stat">
        <span class="label-mono">Runde</span>
        <strong class="tabular">
          {phase === 'LOBBY' ? '–' : `${(room?.roundIndex ?? 0) + 1} / ${room?.totalRounds ?? 0}`}
        </strong>
      </div>
      <div class="stat">
        <span class="label-mono">Antworten</span>
        <strong class="tabular">{room?.answeredCount ?? 0} / {room?.playerCount ?? 0}</strong>
      </div>
      <div class="stat">
        <span class="label-mono">Code</span>
        <strong class="mono">{room?.code ?? code}</strong>
      </div>
      {#if room?.config.autoAdvance}
        <div class="stat">
          <span class="label-mono">Automatik</span>
          {#if room.autoPaused}
            <strong class="auto-paused">angehalten</strong>
          {:else if autoMsLeft !== null && room.pendingAction}
            <strong class="auto-run tabular">
              {autoLabel[room.pendingAction]} in {Math.ceil(autoMsLeft / 1000)}s
            </strong>
          {:else}
            <strong class="auto-run">aktiv</strong>
          {/if}
        </div>
      {/if}
    </div>

    <div class="buttons">
      <button type="button" class="btn btn-primary" disabled={!canStart} onclick={() => hostGame.start()}>
        <Play size={18} strokeWidth={2.6} /> Start
      </button>
      <button type="button" class="btn" disabled={!canReveal} onclick={() => hostGame.revealAnswer()}>
        <Eye size={18} strokeWidth={2.4} /> Reveal
      </button>
      <button type="button" class="btn" disabled={!canLeaderboard} onclick={() => hostGame.showLeaderboard()}>
        <Trophy size={18} strokeWidth={2.4} /> Leaderboard
      </button>
      <button type="button" class="btn" disabled={!canNext} onclick={() => hostGame.next()}>
        <ChevronRight size={18} strokeWidth={2.6} />
        {isLastRound && phase !== 'LOBBY' ? 'Abschluss' : 'Next'}
      </button>
      {#if room?.config.autoAdvance && phase !== 'FINISHED'}
        <button
          type="button"
          class="btn"
          onclick={() => hostGame.setAutoPaused(!room.autoPaused)}
          aria-pressed={room.autoPaused}
        >
          {#if room.autoPaused}
            <Play size={18} strokeWidth={2.6} /> Automatik fortsetzen
          {:else}
            <Pause size={18} strokeWidth={2.6} /> Automatik anhalten
          {/if}
        </button>
      {/if}
      <button type="button" class="btn btn-danger" disabled={!canEnd} onclick={() => hostGame.endGame()}>
        <Square size={16} strokeWidth={2.6} /> End Game
      </button>
    </div>

    <p class="shortcuts label-mono">Tasten: S Start &middot; R Reveal &middot; L Leaderboard &middot; N / Leertaste Next &middot; F Vollbild</p>
  </footer>
</div>

<style>
  .stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 108rem;
    margin: 0 auto;
    padding: 0.9rem 1.1rem 1rem;
    gap: 0.75rem;
    min-height: 100dvh;
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .top-left,
  .top-meta {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .icon {
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
  }

  .status-pill {
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border: 1px solid var(--color-line-strong);
    background: rgb(255 255 255 / 5%);
  }

  .status-pill[data-phase='QUESTION'] {
    border-color: var(--color-brand);
    color: #bae6fd;
    background: rgb(56 189 248 / 14%);
  }

  .status-pill[data-phase='REVEAL'] {
    border-color: var(--color-good);
    color: #bbf7d0;
    background: rgb(52 211 153 / 14%);
  }

  .status-pill[data-phase='FINISHED'] {
    border-color: #fbbf24;
    color: #fde68a;
    background: rgb(251 191 36 / 14%);
  }

  .round {
    color: var(--color-ink-muted);
  }

  .players {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-weight: 700;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 5%);
    border: 1px solid var(--color-line);
  }

  .notice-slot:empty {
    display: none;
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    min-height: 0;
  }

  .center {
    margin: auto;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.9rem;
  }

  .hero-title {
    font-size: clamp(2rem, 6vw, 4.5rem);
    margin: 0.3rem 0 1rem;
  }

  .hero-title.small {
    font-size: clamp(1.6rem, 3.4vw, 2.6rem);
    margin: 0;
  }

  .muted {
    color: var(--color-ink-muted);
    margin: 0;
  }

  .mono {
    font-family: var(--font-mono);
    letter-spacing: 0.12em;
  }

  /* ------------------------------------------------------------- Lobby */

  .lobby {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
    align-items: center;
    animation: var(--animate-rise);
  }

  .join-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.85rem;
    margin: 1.25rem 0;
  }

  .join-block {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.9rem 1.15rem;
    border-radius: 1rem;
    border: 1px solid var(--color-line);
    background: rgb(255 255 255 / 4%);
  }

  .join-value {
    font-size: clamp(1.2rem, 3.4vw, 2.1rem);
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .code-value {
    font-family: var(--font-mono);
    font-size: clamp(2.4rem, 7vw, 4.5rem);
    font-weight: 800;
    letter-spacing: 0.14em;
    line-height: 1;
    background: linear-gradient(100deg, #7dd3fc, #a78bfa 60%, #2dd4bf);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .lobby-hint {
    font-size: 0.9rem;
  }

  .lobby-side {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.65rem;
  }

  .qr-caption {
    text-align: center;
  }

  .roster {
    padding: 0.9rem 1rem;
    border-radius: var(--radius-panel);
    border: 1px solid var(--color-line);
    background: rgb(255 255 255 / 3%);
    max-height: 22vh;
    overflow-y: auto;
  }

  .roster-head {
    margin-bottom: 0.6rem;
  }

  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .player-chip {
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: rgb(56 189 248 / 12%);
    border: 1px solid rgb(56 189 248 / 28%);
    font-size: 0.88rem;
    font-weight: 600;
    animation: var(--animate-fade);
  }

  .player-chip.offline {
    background: rgb(255 255 255 / 4%);
    border-color: var(--color-line);
    color: var(--color-ink-dim);
  }

  /* ------------------------------------------------------------ Frage */

  .question {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1rem;
    animation: var(--animate-rise);
  }

  .q-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .q-text {
    margin: 0;
    font-size: clamp(1.4rem, 3.6vw, 2.8rem);
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .q-text.small {
    font-size: clamp(1.1rem, 2vw, 1.6rem);
    margin-bottom: 1rem;
  }

  .q-options {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.6rem;
  }

  .answer-count {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 0.4rem;
    margin: 1.25rem 0 0;
  }

  .answer-count strong {
    font-size: clamp(1.6rem, 4vw, 2.6rem);
    font-weight: 800;
  }

  .of {
    font-size: 1.1rem;
    color: var(--color-ink-dim);
    font-weight: 700;
  }

  /* ----------------------------------------------------------- Reveal */

  .reveal {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr;
    align-content: center;
    gap: 1rem;
    animation: var(--animate-rise);
    min-height: 0;
  }

  .reveal-left {
    min-width: 0;
  }

  .reveal-right {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
    overflow-y: auto;
    opacity: 0;
    transform: translateY(10px);
    transition:
      opacity 0.5s ease,
      transform 0.5s ease;
  }

  .reveal-right.visible {
    opacity: 1;
    transform: none;
  }

  .solution-card,
  .explain-card,
  .detail-card {
    padding: 1rem 1.15rem;
  }

  .detail-card {
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .detail-card .full {
    width: 100%;
  }

  .solution-card {
    border-color: color-mix(in oklab, var(--color-good) 50%, var(--color-line));
  }

  .solution-answer {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .solution-letter {
    flex: none;
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 0.75rem;
    background: var(--color-good);
    color: #04140d;
    font-family: var(--font-mono);
    font-weight: 800;
    font-size: 1.3rem;
  }

  .solution-text {
    font-size: 1.05rem;
    font-weight: 600;
    line-height: 1.4;
  }

  .explain-card p {
    margin: 0.5rem 0 0;
    color: var(--color-ink-muted);
    line-height: 1.6;
    font-size: 0.98rem;
  }

  /* ------------------------------------------------------- Leaderboard */

  .board {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1rem;
    animation: var(--animate-rise);
    min-height: 0;
  }

  .board-head {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    color: #fcd34d;
  }

  .board-head h1 {
    color: var(--color-ink);
  }

  .new-game {
    align-self: flex-start;
  }

  /* ----------------------------------------------------------- Endkarte */

  .endcard {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    min-height: 0;
    animation: var(--animate-rise);
  }

  .end-head {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    color: #fcd34d;
  }

  .end-head h1 {
    color: var(--color-ink);
  }

  .end-head .new-game {
    margin-left: auto;
    align-self: center;
  }

  .end-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.9rem;
    min-height: 0;
  }

  .end-board {
    overflow-y: auto;
    min-height: 0;
  }

  .end-review {
    padding: 0.9rem 1rem;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .review-fallback {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    align-items: flex-start;
  }

  .auto-run {
    color: var(--color-brand);
  }

  .auto-paused {
    color: #fbbf24;
  }

  @media (min-width: 1100px) {
    .end-grid {
      grid-template-columns: minmax(20rem, 0.8fr) 1.2fr;
    }
  }

  /* --------------------------------------------------------- Controls */

  .controls {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.85rem 1rem;
    border-radius: var(--radius-panel);
    border: 1px solid var(--color-line);
    background: rgb(7 11 22 / 82%);
    backdrop-filter: blur(12px);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .stat strong {
    font-size: 1.05rem;
    font-weight: 700;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .buttons .btn {
    flex: 1 1 8rem;
  }

  .shortcuts {
    display: none;
  }

  /* ------------------------------------------------------ Breakpoints */

  @media (min-width: 900px) {
    .lobby {
      grid-template-columns: 1.4fr 0.6fr;
    }

    .join-grid {
      grid-template-columns: 1fr 1fr;
    }

    .q-options {
      grid-template-columns: 1fr 1fr;
    }

    .reveal {
      grid-template-columns: 1.15fr 0.85fr;
    }

    .stats {
      grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    }

    .controls {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
    }

    .stats {
      flex: 1 1 26rem;
    }

    .buttons {
      flex: 0 0 auto;
    }

    .buttons .btn {
      flex: 0 0 auto;
    }

    .shortcuts {
      display: block;
      flex-basis: 100%;
      margin: 0;
    }
  }

  @media (min-width: 1400px) {
    .stage {
      padding: 1.4rem 2rem 1.4rem;
      gap: 1rem;
    }

    .q-options {
      gap: 0.85rem;
    }
  }
</style>
