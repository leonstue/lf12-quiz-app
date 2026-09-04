import type { AnswerId } from '../../shared/types.js';

export interface OptionMeta {
  id: AnswerId;
  color: string;
  /** Zusätzliches, nicht-farbliches Unterscheidungsmerkmal (Accessibility). */
  shape: 'square' | 'triangle' | 'circle' | 'diamond';
  label: string;
}

export const OPTION_META: Record<AnswerId, OptionMeta> = {
  A: { id: 'A', color: 'var(--color-opt-a)', shape: 'square', label: 'Antwort A' },
  B: { id: 'B', color: 'var(--color-opt-b)', shape: 'triangle', label: 'Antwort B' },
  C: { id: 'C', color: 'var(--color-opt-c)', shape: 'circle', label: 'Antwort C' },
  D: { id: 'D', color: 'var(--color-opt-d)', shape: 'diamond', label: 'Antwort D' },
};

export const SHAPE_PATHS: Record<OptionMeta['shape'], string> = {
  square: 'M4 4h16v16H4z',
  triangle: 'M12 3l9 18H3z',
  circle: 'M12 3a9 9 0 100 18 9 9 0 000-18z',
  diamond: 'M12 2l10 10-10 10L2 12z',
};
