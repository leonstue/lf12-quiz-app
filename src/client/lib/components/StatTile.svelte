<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    value: string | number;
    hint?: string | null;
    accent?: boolean;
    icon?: Snippet;
  }

  let { label, value, hint = null, accent = false, icon }: Props = $props();
</script>

<div class="tile panel-flat" class:accent>
  <div class="head">
    {#if icon}
      <span class="icon">{@render icon()}</span>
    {/if}
    <span class="label-mono">{label}</span>
  </div>
  <div class="value tabular">{value}</div>
  {#if hint}
    <div class="hint">{hint}</div>
  {/if}
</div>

<style>
  .tile {
    padding: 0.85rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .icon {
    display: inline-flex;
    color: var(--color-ink-dim);
  }

  .value {
    font-size: 1.6rem;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.02em;
  }

  .accent .value {
    color: var(--color-brand);
  }

  .hint {
    font-size: 0.78rem;
    color: var(--color-ink-dim);
  }

  @media (min-width: 1280px) {
    .value {
      font-size: 2rem;
    }
  }
</style>
