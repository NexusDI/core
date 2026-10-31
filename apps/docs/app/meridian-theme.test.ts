import { describe, expect, it } from 'vitest';

import { hsl, meridianBackground, meridianColor } from './meridian-theme';

describe('hsl', () => {
  it('converts the dark action amber', () => {
    expect(hsl('#f0a43a')).toEqual({
      hue: 35,
      saturation: 86,
      lightness: 58,
    });
  });

  it('converts the light action ink', () => {
    expect(hsl('#985700')).toEqual({
      hue: 34,
      saturation: 100,
      lightness: 30,
    });
  });
});

describe('the Nextra theme props', () => {
  it('derives the primary from action in each theme', () => {
    expect(meridianColor).toEqual({
      hue: { dark: 35, light: 34 },
      saturation: { dark: 86, light: 100 },
      lightness: { dark: 58, light: 30 },
    });
  });

  it('takes the ground from the bulkhead in each theme', () => {
    expect(meridianBackground).toEqual({ dark: '#14191f', light: '#eceef1' });
  });
});
