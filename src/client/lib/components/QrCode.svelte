<script lang="ts">
  import QRCode from 'qrcode';

  interface Props {
    value: string;
    size?: number;
    label?: string;
  }

  let { value, size = 220, label = 'QR-Code zum Beitreten' }: Props = $props();

  let svgMarkup = $state<string>('');
  let failed = $state(false);

  $effect(() => {
    const target = value;
    let cancelled = false;

    QRCode.toString(target, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#05070f', light: '#ffffff' },
    })
      .then((markup: string) => {
        if (!cancelled) {
          svgMarkup = markup;
          failed = false;
        }
      })
      .catch(() => {
        if (!cancelled) {
          svgMarkup = '';
          failed = true;
        }
      });

    return () => {
      cancelled = true;
    };
  });
</script>

<div class="qr" style={`--qr-size:${size}px`} role="img" aria-label={`${label}: ${value}`}>
  {#if svgMarkup}
    <!-- Markup wird lokal aus dem Join-Link erzeugt, keine externe Quelle. -->
    {@html svgMarkup}
  {:else if failed}
    <span class="fallback">QR-Code nicht verfügbar</span>
  {:else}
    <span class="fallback">…</span>
  {/if}
</div>

<style>
  .qr {
    width: var(--qr-size);
    height: var(--qr-size);
    padding: 0.6rem;
    border-radius: 1rem;
    background: #ffffff;
    display: grid;
    place-items: center;
    box-shadow: 0 18px 40px rgb(0 0 0 / 45%);
  }

  .qr :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
    shape-rendering: crispEdges;
  }

  .fallback {
    color: #334155;
    font-size: 0.8rem;
    text-align: center;
  }
</style>
