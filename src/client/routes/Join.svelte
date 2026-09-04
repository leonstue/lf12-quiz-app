<script lang="ts">
  import { ArrowLeft, LogIn, Loader2 } from '@lucide/svelte';

  import Backdrop from '../lib/components/Backdrop.svelte';
  import Brand from '../lib/components/Brand.svelte';
  import NoticeBar from '../lib/components/NoticeBar.svelte';
  import SoundToggle from '../lib/components/SoundToggle.svelte';
  import { playerGame } from '../lib/playerGame.svelte.js';
  import { navigate } from '../lib/router.svelte.js';
  import { probeRoom } from '../lib/socket.js';

  interface Props {
    code?: string;
  }
  let { code = '' }: Props = $props();

  // Bewusst nur der Startwert: bei /join/CODE wird die Komponente per {#key} neu erzeugt.
  // svelte-ignore state_referenced_locally
  let roomCode = $state(code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10));
  let nickname = $state(playerGame.session?.nickname ?? '');
  let error = $state<string | null>(null);
  let roomHint = $state<string | null>(null);
  let submitting = $state(false);
  let probing = $state(false);

  const trimmedNickname = $derived(nickname.trim());
  const savedSession = $derived(playerGame.session);
  const canSubmit = $derived(
    roomCode.length >= 6 && trimmedNickname.length >= 2 && trimmedNickname.length <= 24 && !submitting,
  );

  function onCodeInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    roomCode = target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    target.value = roomCode;
    roomHint = null;
  }

  async function checkRoom(): Promise<void> {
    if (roomCode.length < 6) {
      roomHint = null;
      return;
    }
    probing = true;
    const probe = await probeRoom(roomCode);
    probing = false;
    if (!probe.exists) {
      roomHint = 'Kein Raum mit diesem Code gefunden.';
    } else if (!probe.joinable) {
      roomHint = 'Das Quiz läuft bereits -- ein Beitritt ist nicht mehr möglich.';
    } else {
      roomHint = `Raum gefunden${typeof probe.playerCount === 'number' ? ` (${probe.playerCount} Teilnehmer)` : ''}.`;
    }
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;
    error = null;
    submitting = true;
    const result = await playerGame.join(roomCode, trimmedNickname);
    submitting = false;
    if (result.ok) {
      navigate('/play');
    } else {
      error = result.error ?? 'Beitritt fehlgeschlagen.';
    }
  }

  $effect(() => {
    playerGame.attach();
  });

  let probedOnce = false;
  $effect(() => {
    // Nur einmal beim Aufruf von /join/CODE prüfen, nicht bei jedem Tastendruck.
    if (!probedOnce && code && roomCode.length >= 6) {
      probedOnce = true;
      void checkRoom();
    }
  });
</script>

<Backdrop calm />

<div class="page">
  <header class="head">
    <button type="button" class="btn back" onclick={() => navigate('/')} aria-label="Zurück zur Startseite">
      <ArrowLeft size={18} strokeWidth={2.4} />
    </button>
    <Brand size="sm" />
    <SoundToggle compact />
  </header>

  <main class="main">
    <div class="panel card">
      <p class="label-mono">Beitreten</p>
      <h1 class="headline title">Mitspielen</h1>
      <p class="sub">Raumcode vom Beamer eingeben oder QR-Code scannen. Danach nur noch einen Nickname wählen.</p>

      <form onsubmit={submit} novalidate>
        <label class="field-label" for="room-code">Raumcode</label>
        <input
          id="room-code"
          class="field code-input"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="10"
          placeholder="7F3K9Q"
          value={roomCode}
          oninput={onCodeInput}
          onblur={checkRoom}
          required
        />
        {#if probing}
          <p class="hint">Prüfe Raum …</p>
        {:else if roomHint}
          <p class="hint" class:ok={roomHint.startsWith('Raum gefunden')}>{roomHint}</p>
        {/if}

        <label class="field-label" for="nickname">Nickname</label>
        <input
          id="nickname"
          class="field"
          type="text"
          autocomplete="nickname"
          maxlength="24"
          placeholder="z. B. LifelineLisa"
          bind:value={nickname}
          required
        />
        <p class="hint">{trimmedNickname.length}/24 Zeichen &middot; mindestens 2</p>

        <div class="notice-slot">
          <NoticeBar message={error} ondismiss={() => (error = null)} />
        </div>

        <button type="submit" class="btn btn-primary submit" disabled={!canSubmit}>
          {#if submitting}
            <span class="spin"><Loader2 size={20} strokeWidth={2.6} /></span>
            Verbinde …
          {:else}
            <LogIn size={20} strokeWidth={2.4} />
            Beitreten
          {/if}
        </button>
      </form>
    </div>

    {#if savedSession}
      <button type="button" class="btn resume" onclick={() => navigate('/play')}>
        Laufende Sitzung als „{savedSession.nickname}“ fortsetzen
      </button>
    {/if}
  </main>
</div>

<style>
  .page {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 34rem;
    margin: 0 auto;
    padding: 1rem;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
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
    gap: 1rem;
    padding: 1.5rem 0;
  }

  .card {
    padding: 1.5rem;
    animation: var(--animate-rise);
  }

  .title {
    font-size: 2.1rem;
    margin: 0.4rem 0 0.6rem;
  }

  .sub {
    margin: 0 0 1.5rem;
    color: var(--color-ink-muted);
    font-size: 0.94rem;
    line-height: 1.55;
  }

  .field-label {
    display: block;
    margin-bottom: 0.4rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-ink-muted);
  }

  .code-input {
    font-family: var(--font-mono);
    font-size: 1.75rem;
    letter-spacing: 0.35em;
    text-align: center;
    text-transform: uppercase;
    padding-left: 0.5rem;
    padding-right: 0;
    min-height: 3.6rem;
  }

  .hint {
    margin: 0.4rem 0 1.1rem;
    font-size: 0.8rem;
    color: var(--color-ink-dim);
  }

  .hint.ok {
    color: #6ee7b7;
  }

  .notice-slot:empty {
    display: none;
  }

  .submit {
    width: 100%;
    min-height: 3.4rem;
    margin-top: 1rem;
    font-size: 1.05rem;
  }

  .resume {
    width: 100%;
    font-size: 0.88rem;
  }

  .spin {
    display: inline-flex;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
