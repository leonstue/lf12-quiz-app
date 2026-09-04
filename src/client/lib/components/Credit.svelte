<script lang="ts">
  interface Props {
    /** Kompakt: nur der Herstellername, ohne Produktzeile. */
    compact?: boolean;
    align?: 'start' | 'center';
  }
  let { compact = false, align = 'start' }: Props = $props();

  const year = new Date().getFullYear();
</script>

<p class="credit label-mono" class:center={align === 'center'}>
  {#if !compact}
    <span>Quiz App</span>
    <span class="sep" aria-hidden="true">&middot;</span>
  {/if}
  <span>&copy; {year} <span class="vendor">leonstue software</span></span>
</p>

<style>
  .credit {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
  }

  .credit.center {
    justify-content: center;
    text-align: center;
  }

  .sep {
    color: var(--color-line-strong);
  }

  .vendor {
    color: var(--color-ink-muted);
    font-weight: 700;
    letter-spacing: 0.14em;
  }
</style>
