<script lang="ts">
  import { Maximize2, X } from '@lucide/svelte';

  interface Props {
    src: string;
    alt: string | null;
    /**
     * `fill` nimmt den verbleibenden Platz der Spalte ein und schrumpft mit --
     * damit die Frage ohne Scrollen auf den Schirm passt.
     * `inline` behält die natürliche Größe (Auflösung, Rückblick).
     */
    variant?: 'fill' | 'inline';
    /** Antippen öffnet das Bild formatfüllend. Auf dem Beamer unnötig. */
    zoomable?: boolean;
  }
  let { src, alt, variant = 'fill', zoomable = true }: Props = $props();

  let failed = $state(false);
  let zoomed = $state(false);

  // Bei einem Wechsel der Frage Fehler- und Zoomzustand zurücksetzen.
  $effect(() => {
    void src;
    failed = false;
    zoomed = false;
  });

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') zoomed = false;
  }
</script>

<svelte:window onkeydown={zoomed ? onKey : undefined} />

{#if failed}
  <p class="missing label-mono">Bild konnte nicht geladen werden</p>
{:else if zoomable}
  <button
    type="button"
    class="shot as-button"
    class:fill={variant === 'fill'}
    onclick={() => (zoomed = true)}
    aria-label={alt ? `Bild vergrößern: ${alt}` : 'Bild vergrößern'}
  >
    <img {src} alt={alt ?? ''} loading="eager" decoding="async" onerror={() => (failed = true)} />
    <span class="zoom-hint" aria-hidden="true"><Maximize2 size={14} strokeWidth={2.6} /></span>
  </button>
{:else}
  <figure class="shot" class:fill={variant === 'fill'}>
    <img {src} alt={alt ?? ''} loading="eager" decoding="async" onerror={() => (failed = true)} />
  </figure>
{/if}

{#if zoomed}
  <!-- Formatfüllende Ansicht: auf kleinen Geräten ist das Bild sonst zu klein. -->
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-label={alt ?? 'Bild'}
    tabindex="-1"
    onclick={() => (zoomed = false)}
    onkeydown={onKey}
  >
    <img class="big" {src} alt={alt ?? ''} />
    <button type="button" class="close" onclick={() => (zoomed = false)} aria-label="Schließen">
      <X size={20} strokeWidth={3} />
    </button>
  </div>
{/if}

<style>
  .shot {
    margin: 0;
    padding: 0.4rem;
    border-radius: 0.9rem;
    border: 1px solid var(--color-line);
    background: #ffffff;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 0;
    overflow: hidden;
  }

  .as-button {
    position: relative;
    width: 100%;
    cursor: zoom-in;
  }

  .shot img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 0.45rem;
  }

  /* Nimmt den Rest der Spalte und gibt ihn wieder her, wenn es eng wird. */
  .shot.fill {
    flex: 1 1 0;
    min-height: 2.5rem;
  }

  .shot.fill img {
    width: auto;
    height: 100%;
  }

  /* Ohne fill: natürliche Größe, aber nie höher als ein Drittel des Schirms. */
  .shot:not(.fill) img {
    height: auto;
    max-height: 32vh;
  }

  .zoom-hint {
    position: absolute;
    right: 0.35rem;
    bottom: 0.35rem;
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 0.45rem;
    background: rgb(5 7 15 / 72%);
    color: #e8edf7;
  }

  .missing {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: 0.75rem;
    border: 1px dashed var(--color-line-strong);
    color: var(--color-ink-dim);
    text-align: center;
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 0.75rem;
    background: rgb(3 5 12 / 92%);
    cursor: zoom-out;
    animation: var(--animate-fade);
  }

  .big {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 0.6rem;
    background: #ffffff;
    padding: 0.5rem;
  }

  .close {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 999px;
    border: 1px solid var(--color-line-strong);
    background: rgb(13 20 36 / 92%);
    color: var(--color-ink);
    cursor: pointer;
  }

  @media (min-width: 1280px) {
    .shot:not(.fill) img {
      max-height: 40vh;
    }
  }
</style>
