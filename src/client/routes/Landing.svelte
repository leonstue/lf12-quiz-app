<script lang="ts">
  import { ArrowRight, MonitorPlay, Smartphone, Timer, Users } from '@lucide/svelte';

  import Backdrop from '../lib/components/Backdrop.svelte';
  import Brand from '../lib/components/Brand.svelte';
  import SoundToggle from '../lib/components/SoundToggle.svelte';
  import { navigate } from '../lib/router.svelte.js';

  const features = [
    { icon: Smartphone, title: 'Nur ein Nickname', text: 'Kein Login, keine E-Mail, kein Passwort. Code eingeben und mitspielen.' },
    { icon: Timer, title: 'Server-Timer', text: 'Punkte, Zeit und Lösung liegen ausschließlich beim Server.' },
    { icon: Users, title: 'Ganze Klasse', text: 'Beamer-Ansicht für vorne, Smartphone-Ansicht für alle anderen.' },
  ];
</script>

<Backdrop />

<div class="page">
  <header class="head">
    <Brand size="md" />
    <SoundToggle compact />
  </header>

  <main class="hero">
    <p class="label-mono kicker">UML &middot; Sequenzdiagramme &middot; Live-Quiz</p>

    <h1 class="headline title">
      <span class="gradient-text">Sequence</span><br />Challenge
    </h1>

    <p class="lead">
      Ein Live-Quiz für die Unterrichtsstunde: Lifelines, Nachrichten, Combined Fragments. Der Host steuert vorne,
      alle anderen spielen auf dem Smartphone mit.
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
        <li class="panel feature">
          <span class="feature-icon"><Icon size={20} strokeWidth={2.2} /></span>
          <div>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </div>
        </li>
      {/each}
    </ul>
  </main>

  <footer class="foot label-mono">
    <span>30 Fragen im Pool</span>
    <span class="dot">&bull;</span>
    <span>In-Memory Sessions</span>
    <span class="dot">&bull;</span>
    <span>Keine Registrierung</span>
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

  .features {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.85rem;
    grid-template-columns: 1fr;
  }

  .feature {
    display: flex;
    gap: 0.9rem;
    padding: 1.1rem;
  }

  .feature-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 0.8rem;
    background: rgb(56 189 248 / 12%);
    border: 1px solid rgb(56 189 248 / 25%);
    color: var(--color-brand);
  }

  .feature h2 {
    margin: 0 0 0.25rem;
    font-size: 0.98rem;
    font-weight: 700;
  }

  .feature p {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.5;
    color: var(--color-ink-muted);
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-line);
  }

  .dot {
    color: var(--color-line-strong);
  }

  @media (min-width: 768px) {
    .page {
      padding: 2rem;
    }

    .features {
      grid-template-columns: repeat(3, 1fr);
    }
  }
</style>
