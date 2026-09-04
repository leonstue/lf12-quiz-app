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

  function handleClick(): void {
    if (disabled) return;
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

  .option.dimmed {
    opacity: 0.42;
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
