<script lang="ts">
  import { Check, X } from '@lucide/svelte';

  import type { ReviewPlayer, ReviewRound } from '../../../shared/types.js';

  interface Props {
    round: ReviewRound;
    players: ReviewPlayer[];
    /** Position der Runde innerhalb der Auswertung. */
    slot: number;
  }
  let { round, players, slot }: Props = $props();

  interface Entry {
    nickname: string;
    answer: string;
    correct: boolean;
    answered: boolean;
    elapsedMs: number | null;
  }

  /** Schnellste zuerst, dann alle ohne Antwort. */
  const entries = $derived.by<Entry[]>(() =>
    players
      .map((player) => {
        const answer = player.answers[slot];
        return {
          nickname: player.nickname,
          answer: answer?.answer ?? '–',
          correct: answer?.correct ?? false,
          answered: (answer?.answer ?? null) !== null,
          elapsedMs: answer?.elapsedMs ?? null,
        };
      })
      .sort((a, b) => {
        if (a.answered !== b.answered) return a.answered ? -1 : 1;
        return (a.elapsedMs ?? Infinity) - (b.elapsedMs ?? Infinity);
      }),
  );

  const missing = $derived(entries.filter((entry) => !entry.answered).length);

  function seconds(ms: number | null): string {
    return ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`;
  }
</script>

<div class="detail">
  <div class="head">
    <span class="label-mono">Antworten im Detail</span>
    <span class="stat label-mono">
      {round.correctCount}/{round.answeredCount} richtig
      {#if missing > 0}
        &middot; {missing} ohne Antwort
      {/if}
    </span>
  </div>

  <ul class="list">
    {#each entries as entry, index (entry.nickname)}
      <li
        class="row"
        class:correct={entry.correct}
        class:wrong={entry.answered && !entry.correct}
        class:missing={!entry.answered}
        style={`--delay:${Math.min(index, 20) * 30}ms`}
      >
        <span class="mark" aria-hidden="true">
          {#if entry.correct}
            <Check size={13} strokeWidth={3.5} />
          {:else if entry.answered}
            <X size={13} strokeWidth={3.5} />
          {:else}
            &ndash;
          {/if}
        </span>
        <span class="nick">{entry.nickname}</span>
        <span class="letter">{entry.answer}</span>
        <span class="time tabular">{seconds(entry.elapsedMs)}</span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    min-height: 0;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .stat {
    color: var(--color-ink-muted);
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.2rem;
    overflow-y: auto;
    max-height: 30vh;
  }

  .row {
    display: grid;
    grid-template-columns: 1.1rem 1fr auto auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.28rem 0.5rem;
    border-radius: 0.5rem;
    background: rgb(255 255 255 / 3%);
    font-size: 0.86rem;
    animation: var(--animate-fade);
    animation-delay: var(--delay);
  }

  .row.correct {
    background: rgb(52 211 153 / 13%);
  }

  .row.wrong {
    background: rgb(248 113 113 / 11%);
  }

  .row.missing {
    opacity: 0.55;
  }

  .mark {
    display: grid;
    place-items: center;
    color: var(--color-ink-dim);
  }

  .correct .mark {
    color: #6ee7b7;
  }

  .wrong .mark {
    color: #fca5a5;
  }

  .nick {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .letter {
    font-family: var(--font-mono);
    font-weight: 700;
    min-width: 1ch;
    text-align: center;
  }

  .correct .letter {
    color: #6ee7b7;
  }

  .wrong .letter {
    color: #fca5a5;
  }

  .time {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--color-ink-dim);
    min-width: 3.4rem;
    text-align: right;
  }

  @media (min-width: 1500px) {
    .list {
      grid-template-columns: 1fr 1fr;
      gap: 0.2rem 0.5rem;
    }
  }
</style>
