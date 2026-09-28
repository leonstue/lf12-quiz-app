import { cubicOut, cubicIn } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

/**
 * Übergänge zwischen den Spielphasen.
 *
 * Zwei Regeln halten das sprungfrei:
 * 1. Die Phasen liegen im selben Rasterfeld übereinander (siehe `.stage-slot`
 *    in Play.svelte und HostGame.svelte), also verschiebt der Wechsel nichts.
 * 2. Die neue Phase wartet, bis die alte fast verschwunden ist. Ohne diese
 *    Verzögerung überlagern sich zwei Ansichten sichtbar.
 */
const OUT_MS = 170;
const IN_MS = 380;

export interface StageOptions {
  /** Richtung des Einlaufs in Pixeln -- positiv heißt von unten. */
  y?: number;
  duration?: number;
  delay?: number;
}

export function stageIn(_node: Element, { y = 18, duration = IN_MS, delay = OUT_MS }: StageOptions = {}): TransitionConfig {
  return {
    duration,
    delay,
    easing: cubicOut,
    css: (t, u) => `
      opacity: ${t};
      transform: translate3d(0, ${u * y}px, 0) scale(${0.982 + t * 0.018});
      filter: blur(${u * 4}px);
    `,
  };
}

export function stageOut(_node: Element, { y = -12, duration = OUT_MS }: StageOptions = {}): TransitionConfig {
  return {
    duration,
    easing: cubicIn,
    css: (t, u) => `
      opacity: ${t};
      transform: translate3d(0, ${u * y}px, 0) scale(${1 - u * 0.012});
      filter: blur(${u * 3}px);
    `,
  };
}

/**
 * Für Listen, die beim Aufdecken nacheinander erscheinen: jede Zeile bekommt
 * über `index` ihren eigenen Versatz. Der Deckel bei 6 verhindert, dass die
 * letzte Zeile einer langen Liste sekundenlang auf sich warten lässt.
 */
export function revealItem(
  _node: Element,
  {
    index = 0,
    step = 55,
    duration = 320,
    /** Vorlauf, bis der Phasenwechsel drumherum durch ist. */
    base = OUT_MS,
  }: { index?: number; step?: number; duration?: number; base?: number } = {},
): TransitionConfig {
  return {
    duration,
    delay: base + Math.min(index, 6) * step,
    easing: cubicOut,
    css: (t, u) => `
      opacity: ${t};
      transform: translate3d(0, ${u * 10}px, 0) scale(${0.97 + t * 0.03});
    `,
  };
}
