<script lang="ts">
  import { Volume2, VolumeX } from '@lucide/svelte';

  import { sound } from '../sound.svelte.js';

  interface Props {
    compact?: boolean;
  }
  let { compact = false }: Props = $props();

  function toggle(): void {
    sound.toggle();
    if (sound.enabled) sound.play('lock');
  }
</script>

<button
  type="button"
  class="btn sound-btn"
  class:compact
  onclick={toggle}
  aria-pressed={sound.enabled}
  title={sound.enabled ? 'Sounds deaktivieren' : 'Sounds aktivieren'}
>
  {#if sound.enabled}
    <Volume2 size={18} strokeWidth={2.2} />
  {:else}
    <VolumeX size={18} strokeWidth={2.2} />
  {/if}
  {#if !compact}
    <span>{sound.enabled ? 'Sound an' : 'Sound aus'}</span>
  {/if}
  <span class="sr-only">{sound.enabled ? 'Sounds sind aktiviert' : 'Sounds sind deaktiviert'}</span>
</button>

<style>
  .sound-btn.compact {
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
