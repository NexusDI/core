/**
 * The four motion tiers from design system spec section 9.1. Under reduced
 * motion every duration is 0ms.
 */
export const motion = {
  interaction: '140ms',
  console: '200ms',
  curve: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
  /** The power-up and a startup trace replay: one step each, 2.4s at most. */
  sequence: { step: '120ms', max: '2.4s' },
  /** The starfield and conduit flow: periods from 40s to 240s, linear. */
  ambient: { min: '40s', max: '240s' },
} as const;
