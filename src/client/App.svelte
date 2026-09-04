<script lang="ts">
  import { router } from './lib/router.svelte.js';
  import HostGame from './routes/HostGame.svelte';
  import HostLogin from './routes/HostLogin.svelte';
  import Join from './routes/Join.svelte';
  import Landing from './routes/Landing.svelte';
  import NotFound from './routes/NotFound.svelte';
  import Play from './routes/Play.svelte';

  const route = $derived(router.current);
</script>

{#if route.name === 'landing'}
  <Landing />
{:else if route.name === 'join'}
  {#key route.params.code ?? ''}
    <Join code={route.params.code ?? ''} />
  {/key}
{:else if route.name === 'play'}
  <Play />
{:else if route.name === 'host-login'}
  <HostLogin />
{:else if route.name === 'host-game'}
  {#key route.params.code}
    <HostGame code={route.params.code ?? ''} />
  {/key}
{:else}
  <NotFound />
{/if}
