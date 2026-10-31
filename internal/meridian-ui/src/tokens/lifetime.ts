/**
 * A lifetime shows as its word plus a glyph in the `data` colour (design
 * system spec section 4.6). The glyph replaces the hue as the second channel,
 * so the four lifetimes share one colour and differ in shape.
 */
export const lifetimeGlyph = {
  singleton: 'filled-diamond',
  scoped: 'half-diamond',
  transient: 'outline-diamond',
  none: 'dash',
} as const;

export type LifetimeName = keyof typeof lifetimeGlyph;

/** The colour role every lifetime glyph takes. */
export const lifetimeRole = 'data' as const;
