import { describe, expect, it } from 'vitest';

import { colour, CONTRAST_FLOOR, surface } from './colour.js';
import { composite, contrast } from './contrast.js';
import { exportKinds, kindRole } from './kind.js';
import { lifetimeRole } from './lifetime.js';

const DARK_WORST = composite(
  surface.dark.hull.hex,
  surface.dark.hull.alpha,
  '#ffffff',
);

describe('the export-kind hues', () => {
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

  for (const kind of exportKinds) {
    it(`keeps ${kind} legible on both grounds`, () => {
      const role = kindRole[kind];
      expect(contrast(colour.dark[role], DARK_WORST)).toBeGreaterThanOrEqual(
        CONTRAST_FLOOR.text,
      );
      expect(
        contrast(colour.light[role], colour.light.space2),
      ).toBeGreaterThanOrEqual(CONTRAST_FLOOR.text);
    });
  }
});

describe('a kind chip on the raised hull', () => {
  // The API filter's kind toggles are chips on the sticky filter row, which
  // paints `--meridian-hull-raised`. A chip outside a kind wrapper takes
  // `textSecondary`.
  const DARK_RAISED_WORST = composite(
    surface.dark.hullRaised.hex,
    surface.dark.hullRaised.alpha,
    '#ffffff',
  );
  const LIGHT_RAISED = composite(
    surface.light.hullRaised.hex,
    surface.light.hullRaised.alpha,
    colour.light.space2,
  );

  for (const role of new Set([
    ...exportKinds.map((kind) => kindRole[kind]),
    'textSecondary' as const,
  ])) {
    it(`keeps ${role} legible on the raised hull in both themes`, () => {
      expect(
        contrast(colour.dark[role], DARK_RAISED_WORST),
      ).toBeGreaterThanOrEqual(CONTRAST_FLOOR.text);
      expect(contrast(colour.light[role], LIGHT_RAISED)).toBeGreaterThanOrEqual(
        CONTRAST_FLOOR.text,
      );
    });
  }
});

describe('the lifetime roles', () => {
  it('reuses the signal colours spec §8.2 names', () => {
    expect(lifetimeRole).toEqual({
      singleton: 'signalCyan',
      scoped: 'signalMagenta',
      transient: 'signalAmber',
      none: 'textSecondary',
    });
  });
});
