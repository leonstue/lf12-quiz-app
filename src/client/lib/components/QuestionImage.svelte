<script lang="ts">
  interface Props {
    src: string;
    alt: string | null;
    /** `beamer` nutzt die volle Höhe, `mobile` bleibt kompakt. */
    variant?: 'beamer' | 'mobile';
  }
  let { src, alt, variant = 'beamer' }: Props = $props();

  let failed = $state(false);

  // Bei einem Wechsel der Frage den Fehlerzustand zurücksetzen.
  $effect(() => {
    void src;
    failed = false;
  });
</script>

{#if !failed}
  <figure class="shot" class:mobile={variant === 'mobile'}>
    <img {src} alt={alt ?? ''} loading="eager" decoding="async" onerror={() => (failed = true)} />
  </figure>
{:else}
  <p class="missing label-mono">Bild konnte nicht geladen werden</p>
{/if}

<style>
  .shot {
    margin: 0;
    padding: 0.5rem;
    border-radius: 0.9rem;
    border: 1px solid var(--color-line);
    background: #ffffff;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 0;
    overflow: hidden;
  }

  .shot img {
    display: block;
    max-width: 100%;
    max-height: 34vh;
    height: auto;
    object-fit: contain;
    border-radius: 0.45rem;
  }

  .mobile img {
    max-height: 26vh;
  }

  .missing {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: 0.75rem;
    border: 1px dashed var(--color-line-strong);
    color: var(--color-ink-dim);
    text-align: center;
  }

  @media (min-width: 1280px) {
    .shot img {
      max-height: 42vh;
    }
  }
</style>
