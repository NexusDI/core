import { colour } from '@nexusdi/meridian-ui/tokens';

/**
 * The Meridian tokens in the shapes Nextra's `<Head>` takes. `<Head>` writes
 * `--nextra-bg` and the primary hue into an inline `<style>`, which wins over
 * any stylesheet, so both come from here as props. `global.css` maps the
 * Tailwind scale.
 */

/** A `#rrggbb` colour as hue in degrees and saturation and lightness in percent. */
export function hsl(hex: string): {
  hue: number;
  saturation: number;
  lightness: number;
} {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = ((value >> 16) & 0xff) / 255;
  const green = ((value >> 8) & 0xff) / 255;
  const blue = (value & 0xff) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const span = max - min;
  const lightness = (max + min) / 2;

  if (span === 0)
    return { hue: 0, saturation: 0, lightness: Math.round(lightness * 100) };

  const saturation = span / (1 - Math.abs(2 * lightness - 1));
  const hue =
    max === red
      ? ((green - blue) / span + (green < blue ? 6 : 0)) * 60
      : max === green
        ? ((blue - red) / span + 2) * 60
        : ((red - green) / span + 4) * 60;

  return {
    hue: Math.round(hue),
    saturation: Math.round(saturation * 100),
    lightness: Math.round(lightness * 100),
  };
}

const dark = hsl(colour.dark.signalCyan);
const light = hsl(colour.light.signalCyan);

/** The primary: signal cyan in dark mode, its ink value in light mode (spec §8.6). */
export const meridianColor = {
  hue: { dark: dark.hue, light: light.hue },
  saturation: { dark: dark.saturation, light: light.saturation },
  lightness: { dark: dark.lightness, light: light.lightness },
};

/** The page ground. `global.css` paints the gradient on `html` over it. */
export const meridianBackground = {
  dark: colour.dark.space0,
  light: colour.light.space0,
};
