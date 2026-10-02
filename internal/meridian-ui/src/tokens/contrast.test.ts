import { describe, expect, it } from 'vitest';

import { colour, CONTRAST_FLOOR, surface, TEXT_ROLES } from './colour.js';
import { composite, contrast } from './contrast.js';

/** The composites spec §8.2 measures against. */
const WHITE = '#ffffff';
const DARK_WORST = composite(
  surface.dark.hull.hex,
  surface.dark.hull.alpha,
  WHITE,
);
const LIGHT_GROUND = colour.light.space2;
const LIGHT_CONTROL_GROUND = composite(
  surface.light.hull.hex,
  surface.light.hull.alpha,
  LIGHT_GROUND,
);

/** The spec §8.2 figures, to two decimals, recomputed by the review. */
const FIGURES: Record<string, { dark: number; light: number }> = {
  controlBorder: { dark: 3.1, light: 3.38 },
  text: { dark: 10.85, light: 15.45 },
  textSecondary: { dark: 6.22, light: 7.8 },
  textTertiary: { dark: 4.57, light: 5.53 },
  signalCyan: { dark: 8.86, light: 5.08 },
  signalMagenta: { dark: 4.64, light: 5.69 },
  signalAmber: { dark: 8.19, light: 4.93 },
  statusPass: { dark: 9.86, light: 5.13 },
  statusFail: { dark: 5.05, light: 5.44 },
};

describe('composite', () => {
  it('blends the dark surface over white into the worst dark ground', () => {
    expect(DARK_WORST).toBe('#2d314d');
  });

  it('blends the light surface over the darkest light ground', () => {
    expect(LIGHT_CONTROL_GROUND).toBe('#fdfdfe');
  });

  it('returns the foreground at alpha 1 and the background at alpha 0', () => {
    expect(composite('#5eeaff', 1, '#000000')).toBe('#5eeaff');
    expect(composite('#5eeaff', 0, '#000000')).toBe('#000000');
  });
});

describe('every text role', () => {
  for (const role of TEXT_ROLES) {
    it(`holds ${CONTRAST_FLOOR.text}:1 for ${role} in dark mode over any nebula pixel`, () => {
      const ratio = contrast(colour.dark[role], DARK_WORST);
      expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR.text);
      expect(ratio).toBeCloseTo(FIGURES[role]!.dark, 2);
    });

    it(`holds ${CONTRAST_FLOOR.text}:1 for ${role} in light mode on the darkest light ground`, () => {
      const ratio = contrast(colour.light[role], LIGHT_GROUND);
      expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR.text);
      expect(ratio).toBeCloseTo(FIGURES[role]!.light, 2);
    });
  }
});

describe('control-border', () => {
  it(`holds ${CONTRAST_FLOOR.control}:1 in dark mode over any nebula pixel`, () => {
    const ratio = contrast(colour.dark.controlBorder, DARK_WORST);
    expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR.control);
    expect(ratio).toBeCloseTo(FIGURES.controlBorder!.dark, 2);
  });

  it(`holds ${CONTRAST_FLOOR.control}:1 in light mode on the light surface composite`, () => {
    const ratio = contrast(colour.light.controlBorder, LIGHT_CONTROL_GROUND);
    expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR.control);
    expect(ratio).toBeCloseTo(FIGURES.controlBorder!.light, 2);
  });
});
