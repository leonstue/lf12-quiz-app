<script lang="ts">
  import { AlertTriangle, X } from '@lucide/svelte';

  interface Props {
    message: string | null;
    tone?: 'error' | 'info';
    ondismiss?: () => void;
  }

  let { message, tone = 'error', ondismiss }: Props = $props();
</script>

{#if message}
  <div class="notice" class:info={tone === 'info'} role="alert">
    <AlertTriangle size={18} strokeWidth={2.5} />
    <span class="text">{message}</span>
    {#if ondismiss}
      <button type="button" class="close" onclick={ondismiss} aria-label="Meldung schließen">
        <X size={16} strokeWidth={3} />
      </button>
    {/if}
  </div>
{/if}

<style>
  .notice {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.7rem 0.9rem;
    border-radius: 0.85rem;
    border: 1px solid color-mix(in oklab, var(--color-bad) 55%, transparent);
    background: color-mix(in oklab, var(--color-bad) 14%, rgb(9 13 24 / 90%));
    color: #fecaca;
    font-size: 0.92rem;
    animation: var(--animate-fade);
  }

  .notice.info {
    border-color: color-mix(in oklab, var(--color-brand) 50%, transparent);
    background: color-mix(in oklab, var(--color-brand) 12%, rgb(9 13 24 / 90%));
    color: #bae6fd;
  }

  .text {
    flex: 1;
  }

  .close {
    display: grid;
    place-items: center;
    width: 1.9rem;
    height: 1.9rem;
    border: none;
    border-radius: 999px;
    background: rgb(255 255 255 / 8%);
    color: inherit;
    cursor: pointer;
  }

  .close:hover {
    background: rgb(255 255 255 / 16%);
  }
</style>
