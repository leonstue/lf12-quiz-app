<script lang="ts">
  import Backdrop from '../lib/components/Backdrop.svelte';
  import Brand from '../lib/components/Brand.svelte';
  import { navigate } from '../lib/router.svelte.js';
</script>

<Backdrop calm />

<div class="page">
  <Brand size="sm" />
  <div class="card panel">
    <p class="label-mono">404</p>
    <h1 class="headline title">Seite nicht gefunden</h1>
    <p class="muted">Diese Adresse gehört nicht zum Quiz.</p>
    <div class="actions">
      <button type="button" class="btn btn-primary" onclick={() => navigate('/')}>Zur Startseite</button>
      <button type="button" class="btn" onclick={() => navigate('/join')}>Quiz beitreten</button>
    </div>
  </div>
</div>

<style>
  .page {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2rem;
    width: 100%;
    max-width: 34rem;
    margin: 0 auto;
    padding: 1.25rem;
  }

  .card {
    margin: auto 0;
    padding: 2rem 1.5rem;
    animation: var(--animate-rise);
  }

  .title {
    font-size: 2rem;
    margin: 0.4rem 0 0.6rem;
  }

  .muted {
    color: var(--color-ink-muted);
    margin: 0 0 1.5rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
</style>
