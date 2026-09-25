<script lang="ts">
  interface Props {
    /** Ruhigere Variante für Teilnehmer-Screens. */
    calm?: boolean;
    /** Nachrichten zwischen den Lifelines -- für Startseite und Lobby. */
    traffic?: boolean;
  }
  let { calm = false, traffic = false }: Props = $props();

  /**
   * Nachrichten laufen zwischen den Lifelines, genau wie im Diagramm:
   * `from`/`to` sind Prozent der Breite, `back` markiert eine Reply nach links.
   * Die krummen Dauern sorgen dafür, dass sich das Muster nicht wiederholt.
   */
  const MESSAGES = [
    { top: 18, from: 12, to: 30, duration: 7.5, delay: 0, back: false, tint: 'var(--color-brand)' },
    { top: 27, from: 30, to: 12, duration: 9.1, delay: 3.4, back: true, tint: 'var(--color-accent)' },
    { top: 38, from: 30, to: 70, duration: 11.3, delay: 1.2, back: false, tint: 'var(--color-teal)' },
    { top: 52, from: 50, to: 88, duration: 8.7, delay: 5.1, back: false, tint: 'var(--color-brand)' },
    { top: 63, from: 70, to: 30, duration: 12.9, delay: 2.6, back: true, tint: 'var(--color-accent)' },
    { top: 74, from: 12, to: 50, duration: 10.4, delay: 6.8, back: false, tint: 'var(--color-brand)' },
    { top: 86, from: 88, to: 70, duration: 6.9, delay: 4.3, back: true, tint: 'var(--color-teal)' },
  ];
</script>

<div class="backdrop" aria-hidden="true" class:calm>
  <div class="glow glow-1"></div>
  <div class="glow glow-2"></div>
  <div class="glow glow-3"></div>
  <div class="grid-bg grid"></div>

  {#if traffic}
    <div class="traffic">
      {#each MESSAGES as message (message.top)}
        <span
          class="msg"
          class:back={message.back}
          style="
            --top: {message.top}%;
            --left: {Math.min(message.from, message.to)}%;
            --len: {Math.abs(message.to - message.from)}%;
            --duration: {message.duration}s;
            --delay: {message.delay}s;
            --tint: {message.tint};
          "
        ></span>
      {/each}
    </div>
  {/if}
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
    animation: wander-1 54s ease-in-out infinite alternate;
  }

  .glow-2 {
    inset: auto -14% -22% auto;
    width: 52vw;
    height: 52vw;
    background: #7c3aed;
    opacity: 0.32;
    animation: wander-2 67s ease-in-out infinite alternate;
  }

  .glow-3 {
    inset: 32% 30% auto auto;
    width: 30vw;
    height: 30vw;
    background: #14b8a6;
    opacity: 0.2;
    animation: wander-3 43s ease-in-out infinite alternate;
  }

  /*
   * Die Lichter wandern minutenlang und nie im Gleichschritt: die drei Dauern
   * sind teilerfremd, also wiederholt sich die Gesamtstellung praktisch nie.
   * Bewegt wird ausschliesslich transform -- der teure Blur bleibt gecacht.
   */
  @keyframes wander-1 {
    to {
      transform: translate3d(9vw, 6vh, 0) scale(1.12);
    }
  }

  @keyframes wander-2 {
    to {
      transform: translate3d(-7vw, -5vh, 0) scale(1.08);
    }
  }

  @keyframes wander-3 {
    to {
      transform: translate3d(-11vw, 8vh, 0) scale(0.9);
    }
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

  /* ------------------------------------------------- Nachrichtenverkehr */

  /*
   * Die Mitte bleibt frei: dort steht auf jeder dieser Seiten Text, und ein
   * Lichtstreifen quer durch eine Zeile liest sich wie eine Unterstreichung.
   */
  .traffic {
    position: absolute;
    inset: 0;
    opacity: 0.8;
    mask-image: radial-gradient(68% 58% at 46% 46%, transparent 12%, #000 88%);
  }

  .msg {
    position: absolute;
    top: var(--top);
    left: var(--left);
    width: var(--len);
    height: 1px;
    overflow: hidden;
  }

  /* Reply: dieselbe Strecke, nur andersherum gespiegelt. */
  .msg.back {
    transform: scaleX(-1);
  }

  .msg::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    /* Breite als Anteil der Strecke -- damit passt der Weg unten ohne Rechnen. */
    width: 26%;
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, var(--tint));
    box-shadow: 0 0 5px 0 var(--tint);
    animation: travel var(--duration) cubic-bezier(0.5, 0, 0.3, 1) var(--delay) infinite;
  }

  /*
   * Der Kopf startet ausserhalb der Strecke und laeuft bis ans Ende:
   * -100% (eigene Breite links draussen) bis 285% (= Ende der Strecke).
   * Danach bleibt die Bahn eine Weile leer, sonst wirkt es wie ein Lauflicht.
   */
  @keyframes travel {
    0% {
      transform: translateX(-100%);
      opacity: 0;
    }
    8% {
      opacity: 0.7;
    }
    42% {
      opacity: 0.7;
    }
    52% {
      transform: translateX(285%);
      opacity: 0;
    }
    100% {
      transform: translateX(285%);
      opacity: 0;
    }
  }

  .calm .traffic {
    opacity: 0.55;
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
    .lifelines line,
    .glow {
      animation: none;
    }

    /* Ohne Bewegung ist eine wandernde Nachricht nur noch ein Fleck. */
    .traffic {
      display: none;
    }
  }
</style>
