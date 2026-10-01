import { describe, expect, it } from 'vitest';

import { hsl, meridianBackground, meridianColor } from './meridian-theme';

describe('hsl', () => {
  it('converts the dark signal cyan', () => {
    expect(hsl('#5eeaff')).toEqual({
      hue: 188,
      saturation: 100,
      lightness: 68,
    });
  });

  it('converts the light signal cyan ink', () => {
    expect(hsl('#006b85')).toEqual({
      hue: 192,
      saturation: 100,
      lightness: 26,
    });
  });
});

describe('the Nextra theme props', () => {
  it('derives the primary from signal cyan in each theme', () => {
    expect(meridianColor).toEqual({
      hue: { dark: 188, light: 192 },
      saturation: { dark: 100, light: 100 },
      lightness: { dark: 68, light: 26 },
    });
  });

  it('takes the ground from space-0 in each theme', () => {
    expect(meridianBackground).toEqual({ dark: '#070a1c', light: '#f4f6fc' });
  });
});
