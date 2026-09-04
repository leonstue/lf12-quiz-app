<script lang="ts">
  import type { AnswerId } from '../../../shared/types.js';
  import { OPTION_META, SHAPE_PATHS } from '../options.js';

  interface Props {
    id: AnswerId;
    size?: number;
    muted?: boolean;
  }
  let { id, size = 22, muted = false }: Props = $props();

  const meta = $derived(OPTION_META[id]);
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" class="glyph" class:muted>
  <path d={SHAPE_PATHS[meta.shape]} fill={meta.color} />
</svg>

<style>
  .glyph {
    flex: none;
    filter: drop-shadow(0 0 8px rgb(0 0 0 / 35%));
  }

  .glyph.muted {
    opacity: 0.45;
    filter: grayscale(0.6);
  }
</style>
