<script lang="ts">
  import { ArrowLeft, ArrowRight, KeyRound, LogOut, Play, Shuffle } from '@lucide/svelte';

  import { QUESTION_COUNT_OPTIONS, type GameConfig, type TimerPreset } from '../../shared/types.js';
  import Backdrop from '../lib/components/Backdrop.svelte';
  import Brand from '../lib/components/Brand.svelte';
  import NoticeBar from '../lib/components/NoticeBar.svelte';
  import SoundToggle from '../lib/components/SoundToggle.svelte';
  import { hostGame } from '../lib/hostGame.svelte.js';
  import { navigate } from '../lib/router.svelte.js';
  import { hostLogin } from '../lib/socket.js';

  let secret = $state('');
  let loginError = $state<string | null>(null);
  let loggingIn = $state(false);

  let questionCount = $state<number>(12);
  let randomizeQuestions = $state(false);
  let timerPreset = $state<TimerPreset>('standard');
  let creating = $state(false);
  let rejoinCode = $state('');

  const timerOptions: { value: TimerPreset; label: string; hint: string }[] = [
    { value: 'relaxed', label: 'Relaxed', hint: '30 s pro Frage' },
    { value: 'standard', label: 'Standard', hint: '20 s, schwere Fragen 25 s' },
    { value: 'fast', label: 'Fast', hint: '12 s pro Frage' },
  ];

  async function submitLogin(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!secret.trim() || loggingIn) return;
    loggingIn = true;
    loginError = null;
    const result = await hostLogin(secret.trim());
    loggingIn = false;
    if (result.ok) {
      hostGame.setToken(result.hostToken);
      secret = '';
    } else {
      loginError = result.error;
    }
  }

  async function createGame(): Promise<void> {
    if (creating) return;
    creating = true;
    const config: GameConfig = { questionCount, randomizeQuestions, timerPreset };
    const code = await hostGame.createGame(config);
    creating = false;
    if (code) navigate(`/host/game/${code}`);
  }

  function openExisting(event: SubmitEvent): void {
    event.preventDefault();
    const code = rejoinCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length >= 6) navigate(`/host/game/${code}`);
  }

  $effect(() => {
    hostGame.attach();
  });
</script>

<Backdrop />

<div class="page">
  <header class="head">
    <button type="button" class="btn back" onclick={() => navigate('/')} aria-label="Zurück zur Startseite">
      <ArrowLeft size={18} strokeWidth={2.4} />
    </button>
    <Brand size="sm" subtitle="Host" />
    <div class="head-actions">
      <SoundToggle compact />
      {#if hostGame.isAuthenticated}
        <button type="button" class="btn" onclick={() => hostGame.logout()}>
          <LogOut size={16} strokeWidth={2.4} />
          Abmelden
        </button>
      {/if}
    </div>
  </header>

  <main class="main">
    {#if !hostGame.isAuthenticated}
      <section class="panel card">
        <p class="label-mono">Zugang</p>
        <h1 class="headline title">Host-Anmeldung</h1>
        <p class="sub">
          Das Host-Secret steht in der <code>.env</code> des Servers und wird serverseitig geprüft. Teilnehmer
          benötigen es nie.
        </p>

        <form onsubmit={submitLogin}>
          <label class="field-label" for="host-secret">HOST_SECRET</label>
          <input
            id="host-secret"
            class="field"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••••••"
            bind:value={secret}
            required
          />

          <div class="notice-slot">
            <NoticeBar message={loginError} ondismiss={() => (loginError = null)} />
          </div>

          <button type="submit" class="btn btn-primary full" disabled={loggingIn || secret.trim().length === 0}>
            <KeyRound size={18} strokeWidth={2.4} />
            {loggingIn ? 'Prüfe …' : 'Anmelden'}
          </button>
        </form>
      </section>
    {:else}
      <section class="panel card">
        <p class="label-mono">Neues Quiz</p>
        <h1 class="headline title">Session konfigurieren</h1>

        <div class="notice-slot">
          <NoticeBar message={hostGame.notice} ondismiss={() => hostGame.dismissNotice()} />
        </div>

        <fieldset class="group">
          <legend class="field-label">Anzahl Fragen</legend>
          <div class="chips">
            {#each QUESTION_COUNT_OPTIONS as option (option)}
              <button
                type="button"
                class="chip"
                class:active={questionCount === option}
                aria-pressed={questionCount === option}
                onclick={() => (questionCount = option)}
              >
                {option}
              </button>
            {/each}
          </div>
          <p class="hint">Standard: 12 kuratierte Fragen quer durch alle Themenbereiche.</p>
        </fieldset>

        <fieldset class="group">
          <legend class="field-label">Timer</legend>
          <div class="chips">
            {#each timerOptions as option (option.value)}
              <button
                type="button"
                class="chip wide"
                class:active={timerPreset === option.value}
                aria-pressed={timerPreset === option.value}
                onclick={() => (timerPreset = option.value)}
              >
                <span class="chip-label">{option.label}</span>
                <span class="chip-hint">{option.hint}</span>
              </button>
            {/each}
          </div>
        </fieldset>

        <button
          type="button"
          class="toggle"
          role="switch"
          aria-checked={randomizeQuestions}
          onclick={() => (randomizeQuestions = !randomizeQuestions)}
        >
          <span class="switch" class:on={randomizeQuestions}><span class="knob"></span></span>
          <span class="toggle-text">
            <span class="toggle-title"><Shuffle size={15} strokeWidth={2.4} /> Zufällige Auswahl aus dem Pool</span>
            <span class="hint">
              {randomizeQuestions
                ? 'Fragen werden zufällig und duplikatfrei aus 30 Fragen gezogen.'
                : 'Feste, didaktisch sortierte Standardauswahl.'}
            </span>
          </span>
        </button>

        <button type="button" class="btn btn-primary full big" onclick={createGame} disabled={creating}>
          <Play size={20} strokeWidth={2.6} />
          {creating ? 'Erstelle …' : 'Quiz erstellen'}
        </button>
      </section>

      <section class="panel card slim">
        <p class="label-mono">Bestehende Session</p>
        <form class="rejoin" onsubmit={openExisting}>
          <input
            class="field"
            type="text"
            maxlength="10"
            placeholder="Raumcode"
            aria-label="Raumcode einer bestehenden Session"
            bind:value={rejoinCode}
          />
          <button
            type="submit"
            class="btn"
            disabled={rejoinCode.replace(/[^A-Za-z0-9]/g, '').length < 6}
            aria-label="Session öffnen"
          >
            <ArrowRight size={18} strokeWidth={2.6} />
          </button>
        </form>
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
    max-width: 42rem;
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

  .back {
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.85rem;
    padding: 1.5rem 0;
  }

  .card {
    padding: 1.5rem;
    animation: var(--animate-rise);
  }

  .slim {
    padding: 1.1rem 1.5rem;
  }

  .title {
    font-size: 1.9rem;
    margin: 0.4rem 0 0.6rem;
  }

  .sub {
    margin: 0 0 1.4rem;
    color: var(--color-ink-muted);
    font-size: 0.92rem;
    line-height: 1.55;
  }

  code {
    font-family: var(--font-mono);
    font-size: 0.86em;
    padding: 0.1em 0.35em;
    border-radius: 0.35rem;
    background: rgb(255 255 255 / 7%);
  }

  .field-label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-ink-muted);
    padding: 0;
  }

  .group {
    border: none;
    padding: 0;
    margin: 0 0 1.4rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .chip {
    min-width: 3.2rem;
    min-height: 2.9rem;
    padding: 0.5rem 0.9rem;
    border-radius: 0.75rem;
    border: 1px solid var(--color-line-strong);
    background: rgb(255 255 255 / 3%);
    font-weight: 700;
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease;
  }

  .chip:hover {
    border-color: var(--color-brand);
  }

  .chip.active {
    border-color: transparent;
    background: linear-gradient(135deg, var(--color-brand-deep), var(--color-accent));
    color: #05070f;
  }

  .chip.wide {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    flex: 1 1 8rem;
  }

  .chip-label {
    font-size: 0.95rem;
  }

  .chip-hint {
    font-size: 0.72rem;
    font-weight: 500;
    opacity: 0.75;
  }

  .hint {
    margin: 0.55rem 0 0;
    font-size: 0.8rem;
    color: var(--color-ink-dim);
    line-height: 1.45;
  }

  .toggle {
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
    width: 100%;
    padding: 0.9rem 1rem;
    margin-bottom: 1.4rem;
    text-align: left;
    border-radius: 0.9rem;
    border: 1px solid var(--color-line);
    background: rgb(255 255 255 / 3%);
    cursor: pointer;
  }

  .switch {
    flex: none;
    position: relative;
    width: 2.75rem;
    height: 1.6rem;
    border-radius: 999px;
    background: var(--color-line-strong);
    transition: background-color 0.2s ease;
    margin-top: 0.1rem;
  }

  .switch.on {
    background: linear-gradient(135deg, var(--color-brand-deep), var(--color-accent));
  }

  .knob {
    position: absolute;
    top: 0.2rem;
    left: 0.2rem;
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 999px;
    background: #f8fafc;
    transition: transform 0.2s ease;
  }

  .switch.on .knob {
    transform: translateX(1.15rem);
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .toggle-title {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 600;
    font-size: 0.95rem;
  }

  .toggle .hint {
    margin: 0;
  }

  .full {
    width: 100%;
  }

  .big {
    min-height: 3.4rem;
    font-size: 1.05rem;
  }

  .notice-slot:empty {
    display: none;
  }

  .notice-slot {
    margin-bottom: 0.85rem;
  }

  .rejoin {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }

  .rejoin .field {
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.2em;
  }
</style>
