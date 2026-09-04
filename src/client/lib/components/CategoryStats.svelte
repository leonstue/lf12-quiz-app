<script lang="ts">
  import type { CategoryStat } from '../../../shared/types.js';

  interface Props {
    categories: CategoryStat[];
  }
  let { categories }: Props = $props();

  /** Unter 60 % gilt als Lücke, ab 80 % als sitzend. */
  function tone(percent: number): 'weak' | 'mid' | 'strong' {
    if (percent < 60) return 'weak';
    if (percent < 80) return 'mid';
    return 'strong';
  }

  /** Die drei schwächsten Themen mit Antworten -- mehr wird in einer Zeile unlesbar. */
  const weakest = $derived(
    categories
      .filter((entry) => entry.answered > 0 && entry.percent < 60)
      .slice(-3)
      .reverse(),
  );
  const hasAnswers = $derived(categories.some((entry) => entry.answered > 0));
</script>

{#if categories.length > 0}
  <div class="stats">
    <div class="head">
      <span class="label-mono">Nach Themen</span>
      {#if weakest.length > 0}
        <span class="verdict label-mono" title="Themen unter 60 Prozent">
          Üben: {weakest.map((entry) => `${entry.category} ${entry.percent}%`).join(' · ')}
        </span>
      {:else if hasAnswers}
        <span class="verdict good label-mono">Alle Themen über 60 %</span>
      {/if}
    </div>

    <ul class="list">
      {#each categories as entry, index (entry.category)}
        <li class="row" style={`--delay:${index * 60}ms`}>
          <span class="name" title={`${entry.questionCount} Frage(n)`}>{entry.category}</span>
          <span class="track">
            <span class="bar" data-tone={tone(entry.percent)} style={`--target:${entry.percent}%`}></span>
          </span>
          <span class="value tabular" data-tone={tone(entry.percent)}>{entry.percent}%</span>
          <span class="ratio tabular">{entry.correct}/{entry.answered}</span>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .stats {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .verdict {
    color: #fca5a5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .verdict.good {
    color: #6ee7b7;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    max-height: 22vh;
    overflow-y: auto;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(6rem, 10rem) 1fr auto auto;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.84rem;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .track {
    height: 0.7rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 6%);
    border: 1px solid var(--color-line);
    overflow: hidden;
  }

  .bar {
    display: block;
    height: 100%;
    width: var(--target);
    border-radius: 999px;
    transform-origin: left center;
    animation: grow-bar 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: var(--delay);
  }

  .bar[data-tone='weak'] {
    background: linear-gradient(90deg, #fb7185, #f87171);
  }

  .bar[data-tone='mid'] {
    background: linear-gradient(90deg, #fbbf24, #fb923c);
  }

  .bar[data-tone='strong'] {
    background: linear-gradient(90deg, #2dd4bf, #34d399);
  }

  .value {
    min-width: 2.8rem;
    text-align: right;
    font-weight: 800;
  }

  .value[data-tone='weak'] {
    color: #fca5a5;
  }

  .value[data-tone='mid'] {
    color: #fcd34d;
  }

  .value[data-tone='strong'] {
    color: #6ee7b7;
  }

  .ratio {
    min-width: 3.2rem;
    text-align: right;
    font-size: 0.74rem;
    color: var(--color-ink-dim);
  }
</style>
