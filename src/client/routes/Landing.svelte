<script lang="ts">
  import { ArrowRight, ChartColumn, KeyRound, MonitorPlay, Smartphone, Timer, Users } from '@lucide/svelte';

  import Backdrop from '../lib/components/Backdrop.svelte';
  import Brand from '../lib/components/Brand.svelte';
  import Credit from '../lib/components/Credit.svelte';
  import SoundToggle from '../lib/components/SoundToggle.svelte';
  import { navigate } from '../lib/router.svelte.js';

  const features = [
    { icon: KeyRound, title: 'Kein Login' },
    { icon: Timer, title: 'Individueller Timer' },
    { icon: Users, title: 'Beliebig viele Teilnehmer' },
    { icon: ChartColumn, title: 'Auswertung je Teilnehmer', accent: true },
  ];
</script>

<Backdrop traffic />

<div class="page">
  <header class="head">
    <Brand size="md" />
    <SoundToggle compact />
  </header>

  <main class="hero">
    <p class="label-mono kicker">Live-Quiz &middot; Echtzeit &middot; Jedes Gerät</p>

    <h1 class="headline title">
      <span class="gradient-text">Quiz</span><br />App
    </h1>

    <p class="lead">
      Quiz auswählen, Code teilen, loslegen. Punkte, Zeitbonus und Auswertung laufen automatisch mit.
    </p>

    <div class="actions">
      <button type="button" class="btn btn-primary big" onclick={() => navigate('/join')}>
        <Smartphone size={20} strokeWidth={2.4} />
        Quiz beitreten
        <ArrowRight size={18} strokeWidth={2.6} />
      </button>
      <button type="button" class="btn big" onclick={() => navigate('/host')}>
        <MonitorPlay size={20} strokeWidth={2.2} />
        Host
      </button>
    </div>

    <ul class="features">
      {#each features as feature (feature.title)}
        {@const Icon = feature.icon}
        <li class="panel feature" class:accent={feature.accent}>
          <Icon size={17} strokeWidth={2.3} />
          <h2>{feature.title}</h2>
        </li>
      {/each}
    </ul>
  </main>

  <footer class="foot">
    <div class="foot-meta label-mono">
      <span>Quizze als JSON</span>
      <span class="dot">&bull;</span>
      <span>In-Memory Sessions</span>
      <span class="dot">&bull;</span>
      <span>Eigene Quizze</span>
    </div>
    <Credit />
  </footer>
</div>

<style>
  .page {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1.25rem;
    max-width: 76rem;
    margin: 0 auto;
    width: 100%;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 3rem 0 2rem;
    animation: var(--animate-rise);
  }

  .kicker {
    margin: 0 0 1rem;
  }

  .title {
    font-size: clamp(2.75rem, 11vw, 6.5rem);
    margin: 0 0 1.25rem;
  }

  /*
   * Der Verlauf im Wort "Quiz" wandert langsam hin und her. Er ist breiter
   * als der Text, sonst gaebe es nichts zu verschieben.
   */
  .title :global(.gradient-text) {
    background-size: 240% 100%;
    animation: var(--animate-flow);
  }

  .lead {
    max-width: 40rem;
    margin: 0 0 2rem;
    font-size: clamp(1rem, 2.4vw, 1.2rem);
    line-height: 1.6;
    color: var(--color-ink-muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem;
    margin-bottom: 3rem;
  }

  .big {
    min-height: 3.4rem;
    padding: 0.9rem 1.6rem;
    font-size: 1.05rem;
  }

  /*
   * Nur der Haupteinstieg bewegt sich, und nur hier auf der Startseite --
   * im laufenden Quiz soll kein Knopf die Aufmerksamkeit ziehen.
   */
  .actions :global(.btn-primary) {
    background-size: 220% 100%;
    animation: var(--animate-flow);
  }

  .features {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* Bewusst flach: nur Symbol und Begriff, damit die Zeile nicht zur Textwand wird. */
  .feature {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.6rem 0.95rem;
    border-radius: 999px;
    color: var(--color-ink-muted);
  }

  /*
   * Ein Lichtreflex laeuft der Reihe nach durch die vier Begriffe -- eine Welle,
   * kein Lauflicht: zwischen zwei Durchgaengen liegen zwoelf Sekunden Ruhe.
   */
  .feature::after {
    content: '';
    position: absolute;
    inset: 0;
    width: 45%;
    background: linear-gradient(100deg, transparent, rgb(255 255 255 / 9%), transparent);
    animation: sheen 12s ease-in-out infinite;
  }

  .feature:nth-child(2)::after {
    animation-delay: 0.7s;
  }

  .feature:nth-child(3)::after {
    animation-delay: 1.4s;
  }

  .feature:nth-child(4)::after {
    animation-delay: 2.1s;
  }

  .feature :global(svg) {
    flex: none;
    color: var(--color-brand);
  }

  .feature h2 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    white-space: nowrap;
  }

  /* Die Auswertung ist das Verkaufsargument -- die darf leuchten. */
  .feature.accent {
    color: var(--color-ink);
    background: rgb(56 189 248 / 10%);
    border-color: rgb(56 189 248 / 35%);
  }

  .feature.accent :global(svg) {
    animation: var(--animate-breathe);
  }

  .feature.accent h2 {
    font-weight: 700;
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-line);
  }

  .foot-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .dot {
    color: var(--color-line-strong);
  }

  @media (min-width: 768px) {
    .page {
      padding: 2rem;
    }
  }

  /* Flache Fenster: die Seite soll auch hier ohne Scrollen auskommen. */
  @media (max-height: 780px) {
    .hero {
      padding: 1.5rem 0 1rem;
    }

    .title {
      margin-bottom: 0.9rem;
    }

    .lead {
      margin-bottom: 1.4rem;
    }

    .actions {
      margin-bottom: 1.6rem;
    }
  }

  /* Sehr flache Fenster: die Kopfzeile schrumpft, das Kleingedruckte tritt ab. */
  @media (max-height: 680px) {
    .title {
      font-size: clamp(2.2rem, 9vw, 3.4rem);
    }

    .hero {
      padding: 1rem 0 0.5rem;
    }

    .foot-meta {
      display: none;
    }

    .page {
      padding: 0.85rem 1.25rem;
    }

    .foot {
      padding-top: 0.6rem;
    }
  }
</style>
