/**
 * The lifetime roles reuse the signal colours (spec §8.2). The graph view
 * always prints the lifetime as a text label too, so the colour repeats that
 * label.
 */
export const lifetimeRole = {
  singleton: 'signalCyan',
  scoped: 'signalMagenta',
  transient: 'signalAmber',
  none: 'textSecondary',
} as const;

export type LifetimeName = keyof typeof lifetimeRole;
