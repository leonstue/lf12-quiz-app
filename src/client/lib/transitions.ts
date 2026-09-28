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

const FLIP_OUT_MS = 340;
const FLIP_IN_MS = 440;

/**
 * Kartendreher. Die alte Ansicht kippt um die Hochachse weg, die neue kommt
 * von der anderen Seite herein -- wie eine Karte, die umgedreht wird.
 *
 * Beide Hälften drehen in dieselbe Richtung, sonst wirkt es wie ein Zurück-
 * schnappen statt wie eine Drehung. Die Perspektive steckt in der Transform
 * selbst; am Container gesetzt würden alle Karten dieselbe Fluchtlinie teilen
 * und die Drehung sähe bei breiten Ansichten schief aus.
 *
 * Kein blur hier: Weichzeichner zwingt den Browser, die 3D-Ebene in eine
 * Textur zu rastern, und genau das frisst bei grossen Flächen die Bildrate.
 */
export function flipIn(_node: Element, { duration = FLIP_IN_MS, delay = FLIP_OUT_MS - 60 } = {}): TransitionConfig {
  return {
    duration,
    delay,
    easing: cubicOut,
    css: (t, u) => `
      opacity: ${Math.min(1, t * 2.4)};
      transform: perspective(1800px) rotateY(${u * 88}deg) translateZ(${u * -90}px) scale(${0.94 + t * 0.06});
      transform-origin: 50% 50%;
      backface-visibility: hidden;
    `,
  };
}

export function flipOut(_node: Element, { duration = FLIP_OUT_MS } = {}): TransitionConfig {
  return {
    duration,
    easing: cubicIn,
    css: (t, u) => `
      opacity: ${Math.min(1, t * 2.4)};
      transform: perspective(1800px) rotateY(${u * -88}deg) translateZ(${u * -90}px) scale(${1 - u * 0.06});
      transform-origin: 50% 50%;
      backface-visibility: hidden;
    `,
  };
}

/**
 * Teilnehmeransicht: die Karte wird nach hinten weggekippt und die nächste
 * kommt von unten aus dem Stapel -- eine Drehung um die Querachse.
 *
 * Bewusst anders als der Dreher am Beamer: Auf dem Handy liegt der Schirm
 * hochkant in der Hand, da liest sich eine Bewegung nach oben natürlicher als
 * eine seitliche Drehung. Am Beamer ist es umgekehrt -- dort ist die Breite
 * die Bühne.
 */
export function deckIn(_node: Element, { duration = 420, delay = 260 } = {}): TransitionConfig {
  return {
    duration,
    delay,
    easing: cubicOut,
    css: (t, u) => `
      opacity: ${Math.min(1, t * 2.2)};
      transform: perspective(1200px) rotateX(${u * -32}deg) translate3d(0, ${u * 46}px, ${u * -120}px);
      transform-origin: 50% 0%;
      backface-visibility: hidden;
    `,
  };
}

export function deckOut(_node: Element, { duration = 300 } = {}): TransitionConfig {
  return {
    duration,
    easing: cubicIn,
    css: (t, u) => `
      opacity: ${Math.min(1, t * 2.2)};
      transform: perspective(1200px) rotateX(${u * 26}deg) translate3d(0, ${u * -38}px, ${u * -140}px);
      transform-origin: 50% 100%;
      backface-visibility: hidden;
    `,
  };
}

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
