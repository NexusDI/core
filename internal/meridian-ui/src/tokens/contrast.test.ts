import { describe, expect, it } from 'vitest';

import {
  colour,
  CONTRAST_FLOOR,
  HOLO_ALPHA,
  screen,
  TEXT_ROLES,
} from './colour.js';
import { composite, contrast } from './contrast.js';

/**
 * The surfaces design system spec section 4.1 measures against: dark text on
 * `plateRaised`, the lightest dark surface, and light text on `bulkhead`, the
 * darkest light surface.
 */
const DARK_SURFACE = colour.dark.plateRaised;
const LIGHT_SURFACE = colour.light.bulkhead;

/** The holo backing over a pure white pixel, the brightest the art can put behind it (4.4). */
const HOLO_COMPOSITE = composite(screen.holo, HOLO_ALPHA, '#ffffff');

/** The spec figures, to two decimals. */
const FIGURES: Record<string, { dark: number; light: number }> = {
  edge: { dark: 3.06, light: 3.23 },
  text: { dark: 11.88, light: 15.64 },
  textSecondary: { dark: 7.1, light: 8.52 },
  textTertiary: { dark: 4.88, light: 5.6 },
  data: { dark: 8.14, light: 5.05 },
  action: { dark: 6.77, light: 4.89 },
  alarm: { dark: 5.05, light: 5.62 },
  nominal: { dark: 7.34, light: 5.04 },
};

describe('composite', () => {
  it('blends the holo backing over white into the worst callout ground', () => {
    expect(HOLO_COMPOSITE).toBe('#1c373f');
  });

  it('returns the foreground at alpha 1 and the background at alpha 0', () => {
    expect(composite('#4dd6ea', 1, '#000000')).toBe('#4dd6ea');
    expect(composite('#4dd6ea', 0, '#000000')).toBe('#000000');
  });
});

describe('every text role', () => {
  for (const role of TEXT_ROLES) {
    it(`holds ${CONTRAST_FLOOR.text}:1 for ${role} in dark mode on plate-raised`, () => {
      const ratio = contrast(colour.dark[role], DARK_SURFACE);
      expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR.text);
      expect(ratio).toBeCloseTo(FIGURES[role]!.dark, 2);
    });

    it(`holds ${CONTRAST_FLOOR.text}:1 for ${role} in light mode on the bulkhead`, () => {
      const ratio = contrast(colour.light[role], LIGHT_SURFACE);
      expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR.text);
      expect(ratio).toBeCloseTo(FIGURES[role]!.light, 2);
    });
  }
});

describe('edge', () => {
  it(`holds ${CONTRAST_FLOOR.control}:1 in dark mode on plate-raised`, () => {
    const ratio = contrast(colour.dark.edge, DARK_SURFACE);
    expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR.control);
    expect(ratio).toBeCloseTo(FIGURES.edge!.dark, 2);
  });

  it(`holds ${CONTRAST_FLOOR.control}:1 in light mode on the bulkhead`, () => {
    const ratio = contrast(colour.light.edge, LIGHT_SURFACE);
    expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR.control);
    expect(ratio).toBeCloseTo(FIGURES.edge!.light, 2);
  });
});

describe('the screen roles', () => {
  it('keeps screen-text at 16.09:1 on the screen', () => {
    expect(contrast(screen.screenText, screen.screen)).toBeCloseTo(16.09, 2);
  });

  // The dark values of the roles that appear in a terminal, on the screen.
  const ON_SCREEN: Record<string, number> = {
    data: 11.03,
    action: 9.17,
    alarm: 6.84,
    nominal: 9.94,
    textSecondary: 9.62,
    textTertiary: 6.61,
  };

  for (const [role, figure] of Object.entries(ON_SCREEN)) {
    it(`holds ${CONTRAST_FLOOR.text}:1 for ${role} on the screen`, () => {
      const ratio = contrast(
        colour.dark[role as keyof typeof colour.dark],
        screen.screen,
      );
      expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR.text);
      expect(ratio).toBeCloseTo(figure, 2);
    });
  }
});

describe('the holo composite', () => {
  // text-tertiary measures 4.36:1 here and is not allowed in a callout.
  const ALLOWED: Record<string, number> = {
    text: 10.61,
    textSecondary: 6.34,
    data: 7.27,
    action: 6.04,
    alarm: 4.51,
  };

  for (const [role, figure] of Object.entries(ALLOWED)) {
    it(`holds ${CONTRAST_FLOOR.text}:1 for ${role}`, () => {
      const ratio = contrast(
        colour.dark[role as keyof typeof colour.dark],
        HOLO_COMPOSITE,
      );
      expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR.text);
      expect(ratio).toBeCloseTo(figure, 2);
    });
  }

  it('shows text-tertiary below the floor, so a callout never uses it', () => {
    const ratio = contrast(colour.dark.textTertiary, HOLO_COMPOSITE);
    expect(ratio).toBeLessThan(CONTRAST_FLOOR.text);
    expect(ratio).toBeCloseTo(4.36, 2);
  });
});

describe('the button pairs (spec 7.4)', () => {
  it.each([
    ['dark', colour.dark, 8.87],
    ['light', colour.light, 8.09],
  ] as const)('holds on-action on action-fill in %s mode', (_, set, figure) => {
    const ratio = contrast(set.onAction, set.actionFill);
    expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR.text);
    expect(ratio).toBeCloseTo(figure, 2);
  });

  it('holds the light primary boundary: the action border on the light plate', () => {
    const ratio = contrast(colour.light.action, colour.light.plate);
    expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR.control);
    expect(ratio).toBeCloseTo(5.39, 2);
  });

  it('shows why the light primary needs that border: the fill alone is 2.17:1', () => {
    expect(contrast(colour.light.actionFill, colour.light.plate)).toBeCloseTo(
      2.17,
      2,
    );
  });
});

describe('the alert pairs (spec 7.6)', () => {
  it.each([
    ['dark', colour.dark, 5.45],
    ['light', colour.light, 6.54],
  ] as const)('holds on-alarm on alarm-fill in %s mode', (_, set, figure) => {
    const ratio = contrast(set.onAlarm, set.alarmFill);
    expect(ratio).toBeGreaterThanOrEqual(CONTRAST_FLOOR.text);
    expect(ratio).toBeCloseTo(figure, 2);
  });

  it('holds the alarm border on the dark plate and the fill falls short, as the spec says', () => {
    expect(contrast(colour.dark.alarm, colour.dark.plate)).toBeCloseTo(5.74, 2);
    expect(contrast(colour.dark.alarmFill, colour.dark.plate)).toBeCloseTo(
      2.94,
      2,
    );
  });
});
