<script lang="ts">
  interface Props {
    size?: 'sm' | 'md' | 'lg';
    subtitle?: string | null;
  }
  let { size = 'md', subtitle = null }: Props = $props();

  const dimension = $derived(size === 'lg' ? 44 : size === 'sm' ? 26 : 34);
</script>

<div class="flex items-center gap-3">
  <svg
    width={dimension}
    height={dimension}
    viewBox="0 0 48 48"
    role="img"
    aria-label="Quiz App Logo"
    class="shrink-0"
  >
    <rect x="4" y="4" width="12" height="8" rx="2" fill="#38bdf8" opacity="0.9" />
    <rect x="32" y="4" width="12" height="8" rx="2" fill="#a78bfa" opacity="0.9" />
    <line x1="10" y1="12" x2="10" y2="44" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.6" />
    <line x1="38" y1="12" x2="38" y2="44" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.6" />
    <rect x="8" y="18" width="4" height="12" rx="1" fill="#38bdf8" opacity="0.35" />
    <rect x="36" y="24" width="4" height="12" rx="1" fill="#a78bfa" opacity="0.35" />
    <path d="M12 22h22" stroke="#e8edf7" stroke-width="2" stroke-linecap="round" />
    <path d="M30 18l5 4-5 4" fill="none" stroke="#e8edf7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M36 34H14" stroke="#2dd4bf" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 3" />
    <path d="M18 30l-5 4 5 4" fill="none" stroke="#2dd4bf" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>

  <div class="leading-tight">
    <div
      class="font-mono uppercase tracking-[0.28em] text-ink"
      class:text-xs={size === 'sm'}
      class:text-sm={size === 'md'}
      class:text-base={size === 'lg'}
    >
      Quiz&nbsp;<span class="text-brand">App</span>
    </div>
    {#if subtitle}
      <div class="label-mono mt-1">{subtitle}</div>
    {/if}
  </div>
</div>
