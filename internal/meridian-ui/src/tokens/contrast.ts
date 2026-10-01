/**
 * WCAG 2.1 relative luminance and contrast, over sRGB hex strings.
 *
 * This file holds the arithmetic because three test files need it and because
 * the floors in the token modules are only claims until something computes them.
 * Not exported from `./tokens`. A consumer needs the values and the floors.
 * `./tokens` exports only those.
 */

/** The sRGB transfer function, inverted, per WCAG 2.1 relative luminance. */
function channel(value: number): number {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

/** The red, green and blue components of a `#rrggbb` colour, 0 to 255. */
function channels(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);

  if (!match?.[1]) {
    throw new Error(`not a six-digit hex colour: ${hex}`);
  }

  const value = Number.parseInt(match[1], 16);

  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Relative luminance of a `#rrggbb` colour. */
export function luminance(hex: string): number {
  const [red, green, blue] = channels(hex);

  return (
    0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
  );
}

/** Contrast ratio between two colours, 1 to 21, order-independent. */
export function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort(
    (one, other) => other - one,
  ) as [number, number];

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * A colour at `alpha` over an opaque background, per channel in sRGB, rounded
 * to the nearest integer. Spec §8.2 measures the dark surface this way: the
 * surface at 86% over white, the brightest pixel the nebula can put behind it.
 */
export function composite(
  foreground: string,
  alpha: number,
  background: string,
): string {
  const front = channels(foreground);
  const back = channels(background);

  return `#${front
    .map((value, at) =>
      Math.round(value * alpha + (back[at] as number) * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
