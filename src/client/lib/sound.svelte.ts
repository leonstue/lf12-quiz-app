import { loadSoundEnabled, saveSoundEnabled } from './storage.js';

/**
 * Dezente, komplett per WebAudio erzeugte Töne.
 * Keine externen Assets, kein CDN.
 */
export type SoundName =
  | 'question'
  | 'tick'
  | 'reveal'
  | 'leaderboard'
  | 'correct'
  | 'wrong'
  | 'lock'
  | 'join'
  | 'finish';

interface Tone {
  freq: number;
  /** Sekunden ab Start des Sounds. */
  at: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
}

const RECIPES: Record<SoundName, Tone[]> = {
  question: [
    { freq: 392.0, at: 0, duration: 0.16, gain: 0.16 },
    { freq: 587.33, at: 0.09, duration: 0.24, gain: 0.14 },
  ],
  tick: [{ freq: 880, at: 0, duration: 0.06, gain: 0.07, type: 'triangle' }],
  reveal: [
    { freq: 523.25, at: 0, duration: 0.18, gain: 0.14 },
    { freq: 659.25, at: 0.1, duration: 0.22, gain: 0.13 },
    { freq: 783.99, at: 0.2, duration: 0.3, gain: 0.12 },
  ],
  leaderboard: [
    { freq: 349.23, at: 0, duration: 0.2, gain: 0.12 },
    { freq: 523.25, at: 0.12, duration: 0.28, gain: 0.12 },
  ],
  correct: [
    { freq: 659.25, at: 0, duration: 0.14, gain: 0.15 },
    { freq: 987.77, at: 0.09, duration: 0.24, gain: 0.13 },
  ],
  wrong: [
    { freq: 233.08, at: 0, duration: 0.22, gain: 0.13, type: 'triangle' },
    { freq: 174.61, at: 0.12, duration: 0.26, gain: 0.11, type: 'triangle' },
  ],
  lock: [{ freq: 523.25, at: 0, duration: 0.09, gain: 0.1, type: 'triangle' }],
  join: [{ freq: 698.46, at: 0, duration: 0.1, gain: 0.09 }],
  finish: [
    { freq: 523.25, at: 0, duration: 0.18, gain: 0.14 },
    { freq: 659.25, at: 0.14, duration: 0.18, gain: 0.13 },
    { freq: 830.61, at: 0.28, duration: 0.2, gain: 0.12 },
    { freq: 1046.5, at: 0.42, duration: 0.4, gain: 0.12 },
  ],
};

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

class SoundEngine {
  enabled = $state(true);

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.enabled = loadSoundEnabled();
      const unlock = () => this.unlock();
      window.addEventListener('pointerdown', unlock, { once: true, passive: true });
      window.addEventListener('keydown', unlock, { once: true });
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    saveSoundEnabled(value);
    if (value) this.unlock();
  }

  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  /** Muss aus einer Nutzerinteraktion heraus laufen (Autoplay-Policy). */
  unlock(): void {
    if (this.unlocked) return;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = prefersReducedMotion() ? 0.35 : 0.6;
      this.master.connect(this.ctx.destination);
      this.unlocked = true;
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  play(name: SoundName): void {
    if (!this.enabled) return;
    this.unlock();
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const start = ctx.currentTime + 0.01;
    for (const tone of RECIPES[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type ?? 'sine';
      osc.frequency.setValueAtTime(tone.freq, start + tone.at);

      const t0 = start + tone.at;
      const t1 = t0 + tone.duration;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(tone.gain, 0.0002), t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);

      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    }
  }
}

export const sound = new SoundEngine();
