/**
 * Torwächter für die Bühne.
 *
 * Phasen kommen nicht immer einzeln herein. Drückt der Host "Next", während
 * eine Frage läuft, löst der Server die Runde erst auf und startet dann die
 * nächste -- die Phase springt also QUESTION → REVEAL → QUESTION, und zwar
 * innerhalb weniger Millisekunden. Jede dieser Stationen wäre ein eigener
 * Bühnenwechsel mit eigener Animation; sichtbar wird das als zwei Ansichten,
 * die gleichzeitig hinausgleiten.
 *
 * Deshalb wartet ein Wechsel eine kurze Frist ab. Kommt in dieser Zeit eine
 * weitere Phase, gilt nur die letzte. Die Frist ist kürzer als jede
 * wahrnehmbare Verzögerung und deutlich kürzer als ein Übergang.
 */
const FRIST_MS = 90;

export class StageGate<T> {
  #wert = $state<T>() as T;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(start: T) {
    this.#wert = start;
  }

  /** Was die Bühne gerade zeigen soll. */
  get value(): T {
    return this.#wert;
  }

  /**
   * Meldet einen vollständigen Zustand an. Der erste nach einer Ruhephase
   * zählt sofort nicht -- erst wenn die Frist ohne weitere Meldung verstreicht.
   */
  propose(next: T): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#wert = next;
    }, FRIST_MS);
  }

  /** Ohne Frist setzen -- für den ersten Aufbau einer Ansicht. */
  set(next: T): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#wert = next;
  }

  dispose(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }
}
