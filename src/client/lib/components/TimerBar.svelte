<script lang="ts">
  interface Props {
    /** 1 = volle Zeit, 0 = abgelaufen. */
    progress: number;
    seconds: number;
    /** Zeigt den Balken als gesperrt/abgelaufen an. */
    locked?: boolean;
    compact?: boolean;
  }
  let { progress, seconds, locked = false, compact = false }: Props = $props();

  const critical = $derived(!locked && seconds <= 5);
  const width = $derived(`${Math.max(0, Math.min(1, progress)) * 100}%`);
</script>

<div
  class="timer"
  class:compact
  role="timer"
  aria-live="off"
  aria-label={locked ? 'Zeit abgelaufen' : `${seconds} Sekunden verbleibend`}
>
  <div class="track">
    <div class="fill" class:critical class:locked style={`width:${width}`}></div>
  </div>
  <div class="value tabular" class:critical>
    {#if locked}
      <span class="label-mono">Zeit abgelaufen</span>
    {:else}
      {seconds}<span class="unit">s</span>
    {/if}
  </div>
</div>

<style>
  .timer {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
  }

  .track {
    flex: 1;
    height: 0.75rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 6%);
    border: 1px solid var(--color-line);
    overflow: hidden;
  }

  .compact .track {
    height: 0.5rem;
  }

  .fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #2dd4bf, #38bdf8 55%, #a78bfa);
    transition: width 0.12s linear;
  }

  .fill.critical {
    background: linear-gradient(90deg, #fb923c, #f87171);
  }

  .fill.locked {
    background: var(--color-line-strong);
  }

  .value {
    min-width: 3.5rem;
    text-align: right;
    font-weight: 700;
    font-size: 1.4rem;
    color: var(--color-ink-muted);
  }

  .compact .value {
    font-size: 1rem;
    min-width: 3rem;
  }

  .value.critical {
    color: #fca5a5;
  }

  .unit {
    font-size: 0.7em;
    margin-left: 0.1em;
    color: var(--color-ink-dim);
  }
</style>
