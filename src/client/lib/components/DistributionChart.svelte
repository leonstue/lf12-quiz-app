<script lang="ts">
  import { Check } from '@lucide/svelte';

  import type { AnswerDistributionEntry } from '../../../shared/types.js';
  import { OPTION_META } from '../options.js';
  import OptionGlyph from './OptionGlyph.svelte';

  interface Props {
    distribution: AnswerDistributionEntry[];
    /** Zweite Animationsstufe: richtige Antwort hervorheben. */
    highlight?: boolean;
    totalAnswers: number;
  }

  let { distribution, highlight = false, totalAnswers }: Props = $props();

  const maxCount = $derived(Math.max(1, ...distribution.map((entry) => entry.count)));
</script>

<div class="chart" role="list" aria-label="Antwortverteilung">
  {#each distribution as entry, index (entry.id)}
    <div
      class="row"
      role="listitem"
      class:is-correct={highlight && entry.correct}
      class:is-faded={highlight && !entry.correct}
      style={`--option-color:${OPTION_META[entry.id].color}; --delay:${index * 70}ms`}
    >
      <div class="head">
        <OptionGlyph id={entry.id} size={18} />
        <span class="letter">{entry.id}</span>
        <span class="text">{entry.text}</span>
        {#if highlight && entry.correct}
          <span class="solution" aria-label="Richtige Antwort">
            <Check size={14} strokeWidth={3} /> Lösung
          </span>
        {/if}
      </div>

      <div class="bar-row">
        <div class="track">
          <div class="bar" style={`--target:${(entry.count / maxCount) * 100}%`}></div>
        </div>
        <div class="numbers tabular">
          <span class="count">{entry.count}</span>
          <span class="percent">{entry.percent}%</span>
        </div>
      </div>
    </div>
  {/each}

  <p class="total label-mono">{totalAnswers} Antworten abgegeben</p>
</div>

<style>
  .chart {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .row {
    transition:
      opacity 0.45s ease,
      transform 0.45s ease;
  }

  .row.is-faded {
    opacity: 0.4;
  }

  .row.is-correct {
    transform: translateX(2px);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin-bottom: 0.35rem;
  }

  .letter {
    font-family: var(--font-mono);
    font-weight: 700;
    color: var(--option-color);
  }

  .text {
    flex: 1;
    font-size: 0.95rem;
    color: var(--color-ink-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .solution {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-good) 22%, transparent);
    border: 1px solid var(--color-good);
    color: #bbf7d0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    animation: var(--animate-fade);
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .track {
    flex: 1;
    height: 1.4rem;
    border-radius: 0.5rem;
    background: rgb(255 255 255 / 5%);
    border: 1px solid var(--color-line);
    overflow: hidden;
  }

  .bar {
    height: 100%;
    width: var(--target);
    background: linear-gradient(90deg, color-mix(in oklab, var(--option-color) 85%, transparent), var(--option-color));
    border-radius: 0.5rem;
    transform-origin: left center;
    animation: grow-bar 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--delay);
  }

  .is-correct .bar {
    box-shadow: 0 0 18px color-mix(in oklab, var(--option-color) 60%, transparent);
  }

  .numbers {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 5.5rem;
    justify-content: flex-end;
  }

  .count {
    font-weight: 700;
    font-size: 1.05rem;
  }

  .percent {
    color: var(--color-ink-dim);
    font-size: 0.85rem;
  }

  .total {
    margin: 0.25rem 0 0;
  }

  @media (min-width: 1280px) {
    .text {
      font-size: 1.05rem;
    }

    .track {
      height: 1.75rem;
    }
  }
</style>
