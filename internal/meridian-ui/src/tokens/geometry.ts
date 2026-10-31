import { colour } from './colour.js';

/** Spacing, radii, measure, chamfer, elevation and focus from design system spec section 6. */
export const space = {
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.5rem',
  6: '2rem',
  7: '3rem',
  8: '4rem',
} as const;

export const measure = '64ch';

/** A marker is square-cornered, so it never reads as a control. */
export const radius = {
  plate: '2px',
  control: '3px',
  chip: '3px',
  marker: '0',
} as const;

/** The corner cut across the top-left of a plate, at 45 degrees (section 6.3). */
export const chamfer = '8px';

/**
 * The plate's elevation per theme: a 1px inner highlight along the top edge
 * and a drop shadow of `0 8px 20px -12px` at 60% black in dark mode and 18% in
 * light mode. `raised` adds a second, tighter shadow for dialogs and menus.
 * `drop` is the same shadow as a `filter` for the wrapper of a chamfered plate,
 * where `box-shadow` would be clipped; `filter: drop-shadow()` takes no spread,
 * so it is a lighter blur at the same offset.
 */
export const elevation = {
  dark: {
    highlight: 'rgb(255 255 255 / 0.04)',
    plate: '0 8px 20px -12px rgb(0 0 0 / 0.6)',
    raised:
      '0 8px 20px -12px rgb(0 0 0 / 0.6), 0 2px 6px -2px rgb(0 0 0 / 0.5)',
    drop: 'drop-shadow(0 6px 6px rgb(0 0 0 / 0.35))',
  },
  light: {
    highlight: 'rgb(255 255 255 / 0.6)',
    plate: '0 8px 20px -12px rgb(0 0 0 / 0.18)',
    raised:
      '0 8px 20px -12px rgb(0 0 0 / 0.18), 0 2px 6px -2px rgb(0 0 0 / 0.14)',
    drop: 'drop-shadow(0 6px 6px rgb(0 0 0 / 0.1))',
  },
} as const;

/** The focus ring colour per theme (the `action` amber): 2px wide, 2px offset. */
export const focus = {
  dark: colour.dark.action,
  light: colour.light.action,
} as const;
