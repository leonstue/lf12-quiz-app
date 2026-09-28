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

  <!-- Zwei Sternenebenen mit unterschiedlichem Tempo ergeben Tiefe. -->
  <div class="stars stars-far"></div>
  <div class="stars stars-near"></div>

  <div class="grid-bg grid"></div>
  <div class="ticks"></div>

  {#if traffic}
    <!-- Ein Scan zieht alle 26 Sekunden einmal durchs Bild. -->
    <div class="scan"></div>
    <div class="ping ping-1"></div>
    <div class="ping ping-2"></div>

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
  <!--
    HUD-Winkel. Als vier Kaesten in Pixeln statt als gestrecktes SVG -- sonst
    haetten die Ecken je nach Fensterformat verschiedene Winkel.
  -->
  <div class="hud">
    <span class="corner tl"></span>
    <span class="corner tr"></span>
    <span class="corner br"></span>
    <span class="corner bl"></span>
  </div>

  <div class="grain"></div>
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

  /* ------------------------------------------------------------ Sterne */

  /*
   * Zwei Kachelmuster statt vieler Einzelelemente: das sind zwei Animationen
   * fuer ein ganzes Sternenfeld. Die Ebenen laufen unterschiedlich schnell,
   * das ergibt Tiefe. `alternate` spart einen Sprung am Schleifenende -- bei
   * dreieinhalb Minuten Laufzeit faellt die Umkehr niemandem auf.
   */
  .stars {
    position: absolute;
    inset: -12%;
  }

  .stars-far {
    background-image:
      radial-gradient(1px 1px at 13% 21%, rgb(219 234 254 / 55%), transparent),
      radial-gradient(1px 1px at 47% 9%, rgb(186 230 253 / 45%), transparent),
      radial-gradient(1px 1px at 78% 33%, rgb(226 232 240 / 40%), transparent),
      radial-gradient(1px 1px at 31% 58%, rgb(191 219 254 / 50%), transparent),
      radial-gradient(1px 1px at 63% 71%, rgb(224 231 255 / 35%), transparent),
      radial-gradient(1px 1px at 88% 84%, rgb(186 230 253 / 45%), transparent),
      radial-gradient(1px 1px at 8% 88%, rgb(226 232 240 / 30%), transparent);
    background-size: 530px 530px;
    opacity: 0.5;
    animation: star-far 240s ease-in-out infinite alternate;
  }

  .stars-near {
    background-image:
      radial-gradient(1.6px 1.6px at 22% 14%, rgb(125 211 252 / 70%), transparent),
      radial-gradient(1.6px 1.6px at 68% 26%, rgb(255 255 255 / 55%), transparent),
      radial-gradient(1.4px 1.4px at 41% 47%, rgb(167 139 250 / 60%), transparent),
      radial-gradient(1.6px 1.6px at 84% 62%, rgb(255 255 255 / 45%), transparent),
      radial-gradient(1.4px 1.4px at 15% 76%, rgb(45 212 191 / 55%), transparent);
    background-size: 370px 370px;
    opacity: 0.55;
    animation:
      star-near 150s ease-in-out infinite alternate,
      twinkle 9s ease-in-out infinite;
  }

  @keyframes star-far {
    to {
      transform: translate3d(2.5%, -1.8%, 0);
    }
  }

  @keyframes star-near {
    to {
      transform: translate3d(-4%, 2.6%, 0);
    }
  }

  /* Szintillation fuer das ganze Feld -- billiger als einzeln blinkende Punkte. */
  @keyframes twinkle {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 0.68;
    }
  }

  .grid {
    position: absolute;
    inset: 0;
    mask-image: radial-gradient(85% 70% at 50% 30%, #000 30%, transparent 100%);
  }

  /* Messmarken im Raster -- das Gitter bekommt dadurch etwas Technisches. */
  .ticks {
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cpath d='M80 74v12M74 80h12' stroke='%2338bdf8' stroke-width='1' stroke-opacity='0.5' stroke-linecap='round'/%3E%3C/svg%3E");
    opacity: 0.35;
    mask-image: radial-gradient(70% 60% at 50% 45%, transparent 25%, #000 90%);
    animation: ticks-drift 120s linear infinite;
  }

  @keyframes ticks-drift {
    to {
      background-position: 160px 160px;
    }
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

  /* ------------------------------------------------- Scan, Ping, Rahmen */

  /*
   * Der Scan ist der eine auffaellige Moment im Hintergrund: ein weiches Band
   * zieht in 26 Sekunden einmal durchs Bild und laesst danach lange Ruhe.
   */
  .scan {
    position: absolute;
    left: 0;
    right: 0;
    top: -30vh;
    height: 30vh;
    background: linear-gradient(
      180deg,
      transparent,
      rgb(56 189 248 / 4%) 55%,
      rgb(125 211 252 / 7%) 88%,
      transparent
    );
    animation: scan-down 26s cubic-bezier(0.4, 0, 0.55, 1) infinite;
  }

  /* Die scharfe Kante unten macht aus dem Schleier einen Scanner. */
  .scan::after {
    content: '';
    position: absolute;
    left: 6%;
    right: 6%;
    bottom: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in oklab, var(--color-brand) 55%, transparent) 30%,
      color-mix(in oklab, var(--color-brand) 55%, transparent) 70%,
      transparent
    );
  }

  @keyframes scan-down {
    0% {
      transform: translateY(0);
      opacity: 0;
    }
    7% {
      opacity: 1;
    }
    48% {
      opacity: 1;
    }
    58% {
      transform: translateY(132vh);
      opacity: 0;
    }
    100% {
      transform: translateY(132vh);
      opacity: 0;
    }
  }

  /* Zwei Radarringe, weit auseinander getaktet. */
  /* vmin, nicht vmax: sonst richtet sich der Ring auf dem Handy nach der
     Hoehe und deckt das halbe Display ab. */
  .ping {
    position: absolute;
    width: 16vmin;
    height: 16vmin;
    border-radius: 50%;
    border: 1px solid color-mix(in oklab, var(--color-brand) 40%, transparent);
  }

  .ping-1 {
    top: 12%;
    left: 4%;
    animation: ping-out 17s ease-out infinite;
  }

  .ping-2 {
    right: 4%;
    bottom: 10%;
    border-color: color-mix(in oklab, var(--color-accent) 35%, transparent);
    animation: ping-out 23s ease-out 8s infinite;
  }

  @keyframes ping-out {
    0% {
      transform: scale(0.25);
      opacity: 0;
    }
    10% {
      opacity: 0.28;
    }
    45% {
      transform: scale(2.2);
      opacity: 0;
    }
    100% {
      transform: scale(2.2);
      opacity: 0;
    }
  }

  .hud {
    position: absolute;
    inset: 0;
  }

  .corner {
    position: absolute;
    width: 1.4rem;
    height: 1.4rem;
    border: 1px solid color-mix(in oklab, var(--color-brand) 38%, transparent);
    animation: corner-pulse 7s ease-in-out infinite;
  }

  .tl {
    top: 0.85rem;
    left: 0.85rem;
    border-right: 0;
    border-bottom: 0;
  }

  .tr {
    top: 0.85rem;
    right: 0.85rem;
    border-left: 0;
    border-bottom: 0;
    animation-delay: 1.75s;
  }

  .br {
    right: 0.85rem;
    bottom: 0.85rem;
    border-left: 0;
    border-top: 0;
    animation-delay: 3.5s;
  }

  .bl {
    bottom: 0.85rem;
    left: 0.85rem;
    border-right: 0;
    border-top: 0;
    animation-delay: 5.25s;
  }

  @keyframes corner-pulse {
    0%,
    100% {
      opacity: 0.35;
    }
    50% {
      opacity: 0.85;
    }
  }

  /*
   * Feines Korn. Es bewegt sich nicht: die Textur soll dem Verlauf die
   * Plastikglaette nehmen, nicht flimmern.
   */
  .grain {
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
    /*
     * Bewusst ohne mix-blend-mode: ein Blend ueber die volle Flaeche zwingt den
     * Compositor, bei jeder Bewegung darunter neu zu mischen. Als einfache
     * Deckschicht bleibt das Korn eine gecachte Textur.
     */
    opacity: 0.05;
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

  /* Auf Teilnehmer-Screens tritt alles Technische einen Schritt zurueck. */
  .calm .stars {
    opacity: 0.32;
  }

  .calm .ticks {
    opacity: 0.18;
  }

  .calm .corner {
    opacity: 0.22;
    animation: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .lifelines line,
    .glow,
    .stars,
    .ticks,
    .corner {
      animation: none;
    }

    /* Ohne Bewegung sind das nur noch Flecken und Streifen. */
    .traffic,
    .scan,
    .ping {
      display: none;
    }
  }
</style>
