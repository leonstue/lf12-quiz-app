<script lang="ts">
  interface Props {
    /** Ruhigere Variante für Teilnehmer-Screens. */
    calm?: boolean;
  }
  let { calm = false }: Props = $props();
</script>

<div class="backdrop" aria-hidden="true" class:calm>
  <div class="glow glow-1"></div>
  <div class="glow glow-2"></div>
  <div class="glow glow-3"></div>
  <div class="grid-bg grid"></div>
  <svg class="lifelines" preserveAspectRatio="none" viewBox="0 0 100 100">
    {#each [12, 30, 50, 70, 88] as x, i (x)}
      <line
        x1={x}
        y1="0"
        x2={x}
        y2="100"
        stroke="url(#lifeline-gradient)"
        stroke-width="0.12"
        stroke-dasharray="1.6 2.4"
        style={`animation-delay:${i * 0.7}s`}
      />
    {/each}
    <defs>
      <linearGradient id="lifeline-gradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0" />
        <stop offset="45%" stop-color="#38bdf8" stop-opacity="0.5" />
        <stop offset="100%" stop-color="#a78bfa" stop-opacity="0" />
      </linearGradient>
    </defs>
  </svg>
  <div class="vignette"></div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    background: radial-gradient(120% 90% at 50% -10%, #0d1730 0%, #070b16 55%, #05070f 100%);
  }

  .glow {
    position: absolute;
    border-radius: 999px;
    filter: blur(90px);
    opacity: 0.42;
  }

  .glow-1 {
    inset: -18% auto auto -12%;
    width: 46vw;
    height: 46vw;
    background: #0ea5e9;
  }

  .glow-2 {
    inset: auto -14% -22% auto;
    width: 52vw;
    height: 52vw;
    background: #7c3aed;
    opacity: 0.32;
  }

  .glow-3 {
    inset: 32% 30% auto auto;
    width: 30vw;
    height: 30vw;
    background: #14b8a6;
    opacity: 0.2;
  }

  .grid {
    position: absolute;
    inset: 0;
    mask-image: radial-gradient(85% 70% at 50% 30%, #000 30%, transparent 100%);
  }

  .lifelines {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0.75;
  }

  .lifelines line {
    animation: drift 14s linear infinite;
  }

  @keyframes drift {
    from {
      stroke-dashoffset: 0;
    }
    to {
      stroke-dashoffset: 40;
    }
  }

  .vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(110% 80% at 50% 45%, transparent 55%, rgb(3 5 12 / 65%) 100%);
  }

  .calm .glow {
    opacity: 0.25;
  }

  .calm .lifelines {
    opacity: 0.4;
  }

  @media (prefers-reduced-motion: reduce) {
    .lifelines line {
      animation: none;
    }
  }
</style>
