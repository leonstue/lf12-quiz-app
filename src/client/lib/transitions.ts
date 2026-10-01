import { cubicOut, cubicIn, quadIn } from 'svelte/easing';
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
export function flipIn(_node: Element, { duration = FLIP_IN_MS, delay = FLIP_OUT_MS } = {}): TransitionConfig {
  return {
    duration,
    delay,
    easing: cubicOut,
    // Erst sichtbar werden, waehrend die Karte sich schon aufrichtet. Blendete
    // sie sofort auf, stuende sie neben der alten im Bild -- bei zwei Ansichten
    // im selben Rasterfeld sieht man dann beide uebereinander.
    css: (t, u) => `
      opacity: ${t < 0.45 ? t / 0.45 : 1};
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
    // Voll sichtbar bleiben, solange die Karte noch Flaeche zeigt, und erst
    // auf dem letzten Stueck der Drehung verschwinden.
    css: (t, u) => `
      opacity: ${t > 0.55 ? 1 : t / 0.55};
      transform: perspective(1800px) rotateY(${u * -88}deg) translateZ(${u * -90}px) scale(${1 - u * 0.06});
      transform-origin: 50% 50%;
      backface-visibility: hidden;
    `,
  };
}

/**
 * Teilnehmeransicht: die Karte kippt nach vorn weg und gibt den Blick auf die
 * frei, die dahinter liegt -- wie ein Deckel, der nach vorn umfällt.
 *
 * Bewusst anders als der Dreher am Beamer: Auf dem Handy liegt der Schirm
 * hochkant in der Hand, da liest sich ein Kippen um die Querachse natürlicher
 * als eine seitliche Drehung. Am Beamer ist die Breite die Bühne.
 */
const DECK_FALL_MS = 400;

/**
 * Die alte Karte klappt um ihre Unterkante nach vorn weg: Die Oberkante kommt
 * dem Betrachter entgegen, die Fläche wird dabei immer flacher, bis nur noch
 * die Kante zu sehen ist. Dahinter wird frei, was darunter liegt.
 *
 * Drehpunkt unten statt in der Mitte -- sonst sänke die Karte als Ganzes ab,
 * statt umzukippen. Sie bleibt fast bis zuletzt voll sichtbar: Sie soll
 * kippen, nicht verblassen.
 *
 * Zwei Dinge halten die Karte dabei im Bild. Die Perspektive ist flach
 * (1500 px statt der sonst üblichen 900), und sie weicht beim Kippen zugleich
 * nach hinten zurück. Ohne beides wächst die nach vorn kommende Oberkante über
 * den Schirm hinaus: gemessen 543 px Breite auf einem 390 px breiten Gerät,
 * also 90 px Überstand je Seite.
 */
export function deckOut(_node: Element, { duration = DECK_FALL_MS } = {}): TransitionConfig {
  return {
    duration,
    /*
     * Beschleunigend wie ein Fall, aber nur quadratisch: mit cubicIn haengt
     * die Karte die halbe Zeit fast still und schiesst dann hinaus -- gemessen
     * waren nach 52 % der Zeit erst 15 % des Wegs zurueckgelegt.
     */
    easing: quadIn,
    css: (t, u) => `
      opacity: ${t < 0.18 ? t / 0.18 : 1};
      transform: perspective(1500px) rotateX(${u * -84}deg) translate3d(0, ${u * 22}%, ${u * -120}px)
        scale(${1 - u * 0.3});
      transform-origin: 50% 100%;
      backface-visibility: hidden;
    `,
  };
}

/**
 * Was darunter lag, wird freigelegt -- erst wenn die alte Karte durch ist.
 * Deshalb kein Hereinfliegen: ein zweiter Weg würde die Illusion zerstören,
 * dass die neue Ansicht die ganze Zeit dahinter gelegen hat.
 */
export function deckIn(_node: Element, { duration = 340, delay = DECK_FALL_MS } = {}): TransitionConfig {
  return {
    duration,
    delay,
    easing: cubicOut,
    css: (t) => `
      opacity: ${t};
      transform: scale(${0.955 + t * 0.045});
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
