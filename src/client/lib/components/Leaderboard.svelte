<script lang="ts">
  import { ArrowDown, ArrowUp, Flame, Minus } from '@lucide/svelte';

  import type { LeaderboardEntry } from '../../../shared/types.js';

  interface Props {
    entries: LeaderboardEntry[];
    highlightPlayerId?: string | null;
    compact?: boolean;
    showStreak?: boolean;
  }

  let { entries, highlightPlayerId = null, compact = false, showStreak = true }: Props = $props();
</script>

{#if entries.length === 0}
  <p class="empty label-mono">Noch keine Wertung vorhanden</p>
{:else}
  <ol class="board" class:compact aria-label="Rangliste">
    {#each entries as entry, index (entry.playerId)}
      <li
        class="row"
        class:top1={entry.rank === 1}
        class:top2={entry.rank === 2}
        class:top3={entry.rank === 3}
        class:me={entry.playerId === highlightPlayerId}
        style={`--delay:${index * 55}ms`}
      >
        <span class="rank tabular">{entry.rank}</span>

        <span class="name">{entry.nickname}</span>

        {#if showStreak && entry.streak >= 2}
          <span class="streak" title={`${entry.streak} richtige Antworten in Folge`}>
            <Flame size={14} strokeWidth={2.5} />
            {entry.streak}
          </span>
        {/if}

        {#if entry.delta !== null && entry.delta !== 0}
          <span class="delta" class:up={entry.delta > 0} class:down={entry.delta < 0}>
            {#if entry.delta > 0}
              <ArrowUp size={14} strokeWidth={3} />
            {:else}
              <ArrowDown size={14} strokeWidth={3} />
            {/if}
            {Math.abs(entry.delta)}
          </span>
        {:else if entry.delta === 0}
          <span class="delta neutral" aria-label="Platzierung unverändert"><Minus size={14} strokeWidth={3} /></span>
        {/if}

        <span class="score tabular">{entry.score.toLocaleString('de-DE')}</span>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .empty {
    margin: 0;
    padding: 1rem 0;
  }

  .board {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem 0.9rem;
    border-radius: 0.85rem;
    border: 1px solid var(--color-line);
    background: rgb(255 255 255 / 3%);
    animation: var(--animate-rise);
    animation-delay: var(--delay);
  }

  .compact .row {
    padding: 0.5rem 0.7rem;
    gap: 0.6rem;
  }

  .row.top1 {
    border-color: color-mix(in oklab, #fbbf24 55%, var(--color-line));
    background: linear-gradient(90deg, rgb(251 191 36 / 14%), rgb(255 255 255 / 3%));
  }

  .row.top2 {
    border-color: color-mix(in oklab, #cbd5e1 40%, var(--color-line));
    background: linear-gradient(90deg, rgb(203 213 225 / 10%), rgb(255 255 255 / 3%));
  }

  .row.top3 {
    border-color: color-mix(in oklab, #fb923c 40%, var(--color-line));
    background: linear-gradient(90deg, rgb(251 146 60 / 10%), rgb(255 255 255 / 3%));
  }

  .row.me {
    outline: 1px solid var(--color-brand);
    outline-offset: 1px;
  }

  .rank {
    flex: none;
    min-width: 2rem;
    font-family: var(--font-mono);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--color-ink-dim);
    text-align: right;
  }

  .top1 .rank {
    color: #fcd34d;
  }

  .top2 .rank {
    color: #e2e8f0;
  }

  .top3 .rank {
    color: #fdba74;
  }

  .name {
    flex: 1;
    font-weight: 600;
    font-size: 1.02rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .streak,
  .delta {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    flex: none;
    font-size: 0.78rem;
    font-weight: 700;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
  }

  .streak {
    color: #fdba74;
    background: rgb(251 146 60 / 14%);
  }

  .delta.up {
    color: #6ee7b7;
    background: rgb(52 211 153 / 14%);
  }

  .delta.down {
    color: #fca5a5;
    background: rgb(248 113 113 / 12%);
  }

  .delta.neutral {
    color: var(--color-ink-dim);
    background: transparent;
  }

  .score {
    flex: none;
    min-width: 5rem;
    text-align: right;
    font-weight: 800;
    font-size: 1.05rem;
  }

  @media (min-width: 1280px) {
    .row {
      padding: 0.9rem 1.1rem;
    }

    .name {
      font-size: 1.35rem;
    }

    .score {
      font-size: 1.4rem;
      min-width: 7rem;
    }

    .rank {
      font-size: 1.4rem;
      min-width: 2.6rem;
    }
  }
</style>
