<script lang="ts">
  import { Check, X } from '@lucide/svelte';

  import type { AnswerId } from '../../../shared/types.js';
  import { OPTION_META } from '../options.js';
  import OptionGlyph from './OptionGlyph.svelte';

  interface Props {
    id: AnswerId;
    text: string;
    selected?: boolean;
    disabled?: boolean;
    /** Nach dem Reveal: markiert die Lösung bzw. eine falsche Auswahl. */
    state?: 'none' | 'correct' | 'wrong' | 'dimmed';
    /** Flacher, wenn viele Optionen auf einen kleinen Schirm müssen. */
    compact?: boolean;
    onselect?: (id: AnswerId) => void;
  }

  let { id, text, selected = false, disabled = false, state = 'none', compact = false, onselect }: Props = $props();

  const meta = $derived(OPTION_META[id]);

  /**
   * Die Fülle startet dort, wo der Finger war. Der Ursprung geht direkt als
   * CSS-Variable ans Element -- ein reaktiver Zustand wäre hier Ballast, und
   * `state` ist als Prop-Name ohnehin schon vergeben.
   */
  function handleClick(event: MouseEvent): void {
    if (disabled) return;
    const element = event.currentTarget as HTMLElement;
    const box = element.getBoundingClientRect();
    // Tastaturbedienung meldet 0/0 -- dann bleibt es bei der Mitte aus dem CSS.
    if (event.clientX > 0 || event.clientY > 0) {
      element.style.setProperty('--origin-x', `${((event.clientX - box.left) / box.width) * 100}%`);
      element.style.setProperty('--origin-y', `${((event.clientY - box.top) / box.height) * 100}%`);
    }
    onselect?.(id);
  }
</script>

<button
  type="button"
  class="option"
  class:compact
  class:selected
  class:correct={state === 'correct'}
  class:wrong={state === 'wrong'}
  class:dimmed={state === 'dimmed'}
  style={`--option-color:${meta.color}`}
  {disabled}
  aria-pressed={selected}
  aria-label={`${meta.label}: ${text}`}
  onclick={handleClick}
>
  <span class="fill" aria-hidden="true"></span>

  <span class="badge">
    <OptionGlyph {id} size={20} muted={state === 'dimmed'} />
    <span class="letter">{id}</span>
  </span>

  <span class="text">{text}</span>

  {#if state === 'correct'}
    <span class="marker correct-marker" aria-hidden="true"><Check size={20} strokeWidth={3} /></span>
  {:else if state === 'wrong'}
    <span class="marker wrong-marker" aria-hidden="true"><X size={20} strokeWidth={3} /></span>
  {:else if selected}
    <span class="marker selected-marker" aria-hidden="true"><Check size={18} strokeWidth={3} /></span>
  {/if}
</button>

<style>
  .option {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    width: 100%;
    /* Nie unter 44 px, sonst ist das Ziel zu klein zum Tippen. */
    min-height: max(2.75rem, min(4.25rem, 8.5vh));
    padding: 0.75rem 1rem;
    text-align: left;
    border-radius: 1rem;
    border: 1px solid var(--color-line-strong);
    background:
      linear-gradient(
        135deg,
        color-mix(in oklab, var(--option-color) 14%, transparent),
        color-mix(in oklab, var(--option-color) 4%, transparent)
      ),
      rgb(9 13 24 / 85%);
    color: var(--color-ink);
    cursor: pointer;
    transition:
      transform 0.14s ease,
      border-color 0.2s ease,
      background-color 0.2s ease,
      opacity 0.25s ease;
  }

  .option:hover:not(:disabled) {
    border-color: color-mix(in oklab, var(--option-color) 60%, transparent);
    transform: translateY(-1px);
  }

  .option:active:not(:disabled) {
    transform: translateY(1px);
  }

  .option:disabled {
    cursor: default;
  }

  .option.selected {
    border-color: var(--option-color);
    box-shadow: 0 0 0 1px color-mix(in oklab, var(--option-color) 65%, transparent) inset;
  }

  /*
   * Die Fuelle laeuft vom Finger aus ueber das ganze Feld. Ein Kreis, der bis
   * ueber die Ecken hinauswaechst -- 170 % reichen von jeder Position aus.
   * Skaliert wird der Kreis, nie die Box: das bleibt auf der GPU, waehrend
   * eine wachsende Breite jedes Bild neu umbrechen wuerde.
   */
  .fill {
    position: absolute;
    top: var(--origin-y, 50%);
    left: var(--origin-x, 50%);
    width: 170%;
    aspect-ratio: 1;
    margin: -85% 0 0 -85%;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      color-mix(in oklab, var(--option-color) 88%, transparent) 0%,
      color-mix(in oklab, var(--option-color) 58%, transparent) 55%,
      color-mix(in oklab, var(--option-color) 24%, transparent) 100%
    );
    transform: scale(0);
    opacity: 0;
    pointer-events: none;
  }

  .option.selected .fill {
    animation: pick-fill 0.66s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes pick-fill {
    0% {
      transform: scale(0);
      opacity: 0.95;
    }
    70% {
      opacity: 0.6;
    }
    100% {
      transform: scale(1);
      opacity: 0.34;
    }
  }

  /* Der gewaehlte Knopf federt einmal kurz nach. */
  .option.selected {
    animation: pick-pop 0.42s cubic-bezier(0.3, 1.6, 0.4, 1) both;
  }

  @keyframes pick-pop {
    0% {
      transform: scale(1);
    }
    45% {
      transform: scale(1.028);
    }
    100% {
      transform: scale(1);
    }
  }

  /* Abzeichen, Text und Haken bleiben ueber der Fuelle. */
  .badge,
  .text,
  .marker {
    position: relative;
    z-index: 1;
  }

  .option.dimmed {
    opacity: 0.42;
    /* Etwas zurueckgenommen statt nur blasser -- das trennt die Wahl klarer. */
    transform: scale(0.985);
  }

  .option.correct {
    border-color: var(--color-good);
    background:
      linear-gradient(135deg, rgb(52 211 153 / 22%), rgb(52 211 153 / 6%)),
      rgb(9 13 24 / 85%);
    box-shadow: 0 0 0 1px var(--color-good) inset;
  }

  .option.wrong {
    border-color: var(--color-bad);
    background:
      linear-gradient(135deg, rgb(248 113 113 / 18%), rgb(248 113 113 / 5%)),
      rgb(9 13 24 / 85%);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex: none;
    padding: 0.4rem 0.6rem;
    border-radius: 0.7rem;
    background: rgb(255 255 255 / 5%);
    border: 1px solid var(--color-line);
  }

  .letter {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--color-ink);
  }

  .text {
    flex: 1;
    font-size: clamp(0.9rem, min(3.8vw, 2vh), 1.05rem);
    line-height: 1.3;
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .option.compact {
    min-height: max(2.75rem, min(3.4rem, 6.4vh));
    padding: 0.5rem 0.8rem;
    gap: 0.6rem;
  }

  .option.compact .badge {
    padding: 0.3rem 0.45rem;
  }

  .marker {
    flex: none;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
  }

  .correct-marker {
    background: var(--color-good);
    color: #04140d;
  }

  .wrong-marker {
    background: var(--color-bad);
    color: #1a0505;
  }

  .selected-marker {
    background: rgb(255 255 255 / 12%);
    color: var(--color-ink);
  }

  @media (min-width: 768px) {
    .option {
      min-height: min(4.75rem, 11vh);
      padding: 1rem 1.15rem;
    }

    .text {
      font-size: clamp(1rem, 1.6vh, 1.15rem);
    }
  }
</style>
