<script lang="ts">
  import { Check, Download, Minus, X } from '@lucide/svelte';

  import type { GameReview } from '../../../shared/types.js';

  interface Props {
    review: GameReview;
  }
  let { review }: Props = $props();

  function seconds(ms: number | null): string {
    if (ms === null) return '–';
    return `${(ms / 1000).toFixed(1)}s`;
  }

  /** CSV für die Nachbereitung -- Trennzeichen Semikolon für deutsches Excel. */
  function buildCsv(): string {
    const esc = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const header = [
      'Nickname',
      'Punkte',
      'Richtig',
      'Beantwortet',
      'Zeit-Mittel-s',
      ...review.rounds.flatMap((round) => [`R${round.index + 1}-Antwort`, `R${round.index + 1}-Zeit-s`]),
    ];

    const rows = review.players.map((player) => [
      esc(player.nickname),
      player.score,
      player.correctCount,
      player.answeredCount,
      player.averageElapsedMs === null ? '' : (player.averageElapsedMs / 1000).toFixed(1).replace('.', ','),
      ...player.answers.flatMap((answer) => [
        answer.answer === null ? '-' : `${answer.answer}${answer.correct ? ' (richtig)' : ' (falsch)'}`,
        answer.elapsedMs === null ? '' : (answer.elapsedMs / 1000).toFixed(1).replace('.', ','),
      ]),
    ]);

    const legend = review.rounds.map((round) =>
      [
        esc(`R${round.index + 1}`),
        esc(round.question),
        esc(`Lösung: ${round.correctAnswer}`),
        esc(round.answers.find((a) => a.id === round.correctAnswer)?.text ?? ''),
      ].join(';'),
    );

    return [
      header.join(';'),
      ...rows.map((row) => row.join(';')),
      '',
      'Runde;Frage;Lösung;Antworttext',
      ...legend,
    ].join('\r\n');
  }

  function downloadCsv(): void {
    const blob = new Blob(['﻿' + buildCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sequence-challenge-${review.code}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
</script>

<div class="review">
  <div class="head">
    <div>
      <p class="label-mono">Auswertung</p>
      <h2>Wer hat was geantwortet</h2>
    </div>
    <button type="button" class="btn csv" onclick={downloadCsv}>
      <Download size={16} strokeWidth={2.4} />
      CSV
    </button>
  </div>

  {#if review.playedRounds === 0}
    <p class="empty label-mono">Noch keine aufgelöste Runde</p>
  {:else}
    <div class="scroller">
      <table>
        <thead>
          <tr>
            <th class="sticky name-col" scope="col">Teilnehmer</th>
            {#each review.rounds as round (round.index)}
              <th scope="col" class="round-col" title={round.question}>
                <span class="round-no">R{round.index + 1}</span>
                <span class="round-sol">{round.correctAnswer}</span>
                <span class="round-meta">{round.correctCount}/{round.answeredCount}</span>
                <span class="round-meta">&#216; {seconds(round.averageElapsedMs)}</span>
              </th>
            {/each}
            <th scope="col" class="sum-col">Richtig</th>
            <th scope="col" class="sum-col">&#216; Zeit</th>
            <th scope="col" class="sum-col">Punkte</th>
          </tr>
        </thead>
        <tbody>
          {#each review.players as player (player.playerId)}
            <tr>
              <th class="sticky name-col" scope="row">{player.nickname}</th>
              {#each player.answers as answer, index (index)}
                <td
                  class="cell"
                  class:correct={answer.correct}
                  class:wrong={answer.answer !== null && !answer.correct}
                  class:missing={answer.answer === null}
                  title={`${player.nickname} · Runde ${index + 1} · ${
                    answer.answer === null ? 'keine Antwort' : `Antwort ${answer.answer}`
                  } · ${seconds(answer.elapsedMs)} · ${answer.points} Punkte`}
                >
                  <span class="mark" aria-hidden="true">
                    {#if answer.answer === null}
                      <Minus size={12} strokeWidth={3} />
                    {:else if answer.correct}
                      <Check size={12} strokeWidth={3.5} />
                    {:else}
                      <X size={12} strokeWidth={3.5} />
                    {/if}
                  </span>
                  <span class="letter">{answer.answer ?? '–'}</span>
                  <span class="time">{seconds(answer.elapsedMs)}</span>
                </td>
              {/each}
              <td class="sum tabular">{player.correctCount}/{review.playedRounds}</td>
              <td class="sum tabular">{seconds(player.averageElapsedMs)}</td>
              <td class="sum score tabular">{player.score.toLocaleString('de-DE')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="legend">
      {#each review.rounds as round (round.index)}
        <div class="legend-row">
          <span class="legend-no">R{round.index + 1}</span>
          <span class="legend-q">{round.question}</span>
          <span class="legend-a"
            >{round.correctAnswer} · {round.answers.find((a) => a.id === round.correctAnswer)?.text ?? ''}</span
          >
          {#if round.fastestCorrect}
            <span class="legend-fast"
              >schnellste richtige: {round.fastestCorrect.nickname} ({seconds(round.fastestCorrect.elapsedMs)})</span
            >
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .review {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
  }

  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
  }

  .head h2 {
    margin: 0.15rem 0 0;
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .csv {
    min-height: 2.4rem;
    padding: 0.45rem 0.8rem;
    font-size: 0.85rem;
  }

  .empty {
    margin: 0;
    padding: 1rem 0;
  }

  .scroller {
    overflow: auto;
    max-height: 46vh;
    border: 1px solid var(--color-line);
    border-radius: 0.9rem;
    background: rgb(5 7 15 / 45%);
  }

  table {
    border-collapse: separate;
    border-spacing: 0;
    width: max-content;
    min-width: 100%;
    font-size: 0.8rem;
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: #0d1424;
    border-bottom: 1px solid var(--color-line);
    padding: 0.4rem 0.35rem;
    font-weight: 700;
    color: var(--color-ink-muted);
  }

  .sticky {
    position: sticky;
    left: 0;
    z-index: 3;
    background: #0d1424;
    text-align: left;
    border-right: 1px solid var(--color-line);
  }

  thead .sticky {
    z-index: 4;
  }

  .name-col {
    min-width: 8.5rem;
    max-width: 12rem;
    padding: 0.45rem 0.7rem;
    font-weight: 600;
    color: var(--color-ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .round-col {
    display: table-cell;
    min-width: 3.6rem;
    text-align: center;
    line-height: 1.15;
  }

  .round-no {
    display: block;
    font-family: var(--font-mono);
    color: var(--color-ink);
  }

  .round-sol {
    display: block;
    font-family: var(--font-mono);
    font-size: 0.9rem;
    color: var(--color-good);
  }

  .round-meta {
    display: block;
    font-size: 0.62rem;
    font-weight: 500;
    color: var(--color-ink-dim);
  }

  tbody tr:nth-child(even) td,
  tbody tr:nth-child(even) .sticky {
    background: rgb(255 255 255 / 2.5%);
  }

  .cell {
    padding: 0.3rem 0.25rem;
    text-align: center;
    border-bottom: 1px solid rgb(255 255 255 / 4%);
    line-height: 1.1;
  }

  .mark {
    display: block;
    height: 0.85rem;
    color: var(--color-ink-dim);
  }

  .cell.correct {
    background: rgb(52 211 153 / 14%);
  }

  .cell.correct .mark,
  .cell.correct .letter {
    color: #6ee7b7;
  }

  .cell.wrong {
    background: rgb(248 113 113 / 12%);
  }

  .cell.wrong .mark,
  .cell.wrong .letter {
    color: #fca5a5;
  }

  .cell.missing .letter {
    color: var(--color-ink-dim);
  }

  .letter {
    display: block;
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 0.9rem;
  }

  .time {
    display: block;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: var(--color-ink-dim);
  }

  .sum {
    padding: 0.3rem 0.6rem;
    text-align: right;
    border-bottom: 1px solid rgb(255 255 255 / 4%);
    border-left: 1px solid var(--color-line);
    color: var(--color-ink-muted);
    white-space: nowrap;
  }

  .sum.score {
    font-weight: 800;
    color: var(--color-ink);
  }

  .sum-col {
    text-align: right;
    min-width: 4.2rem;
  }

  .legend {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    max-height: 12vh;
    overflow-y: auto;
    padding-right: 0.25rem;
  }

  .legend-row {
    display: flex;
    gap: 0.55rem;
    font-size: 0.74rem;
    color: var(--color-ink-dim);
    line-height: 1.35;
  }

  .legend-no {
    flex: none;
    font-family: var(--font-mono);
    color: var(--color-ink-muted);
  }

  .legend-q {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .legend-a {
    flex: none;
    color: #6ee7b7;
    max-width: 22rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .legend-fast {
    flex: none;
    color: var(--color-ink-dim);
  }

  @media (min-width: 1400px) {
    table {
      font-size: 0.86rem;
    }

    .round-col {
      min-width: 4rem;
    }
  }
</style>
