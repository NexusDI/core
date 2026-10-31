import { describe, expect, it } from 'vitest';

import { colour, CONTRAST_FLOOR } from './colour.js';
import { contrast } from './contrast.js';
import { exportKinds, kindChip } from './kind.js';
import { lifetimeGlyph, lifetimeRole } from './lifetime.js';

describe('the export kinds', () => {
  it('names the six kinds the reference loader emits', () => {
    expect(exportKinds).toEqual([
      'error',
      'class',
      'function',
      'constant',
      'interface',
      'type-alias',
    ]);
  });

  it('shows every kind, errors included, as the same neutral chip', () => {
    expect(kindChip).toEqual({ text: 'textSecondary', border: 'seam' });
  });

  it('keeps the chip text legible on the plate in both themes', () => {
    for (const theme of ['dark', 'light'] as const) {
      expect(
        contrast(colour[theme].textSecondary, colour[theme].plate),
      ).toBeGreaterThanOrEqual(CONTRAST_FLOOR.text);
    }
  });
});

describe('the lifetime glyphs', () => {
  it('gives each lifetime its own shape, in the data colour', () => {
    expect(lifetimeGlyph).toEqual({
      singleton: 'filled-diamond',
      scoped: 'half-diamond',
      transient: 'outline-diamond',
      none: 'dash',
    });
    expect(lifetimeRole).toBe('data');
    expect(new Set(Object.values(lifetimeGlyph)).size).toBe(4);
  });
});
