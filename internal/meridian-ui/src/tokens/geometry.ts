/** Spacing, radii, measure, elevation and focus from spec §8.4. */
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
  panel: '14px',
  control: '8px',
  chip: '4px',
  marker: '0',
} as const;

export const elevation = {
  glass:
    'inset 0 0 0 1px rgb(94 234 255 / 0.12), 0 12px 32px -16px rgb(0 0 0 / 0.8)',
  raised:
    'inset 0 0 0 1px rgb(94 234 255 / 0.12), 0 12px 32px -16px rgb(0 0 0 / 0.8), 0 4px 12px -6px rgb(0 0 0 / 0.6)',
} as const;

/** The focus ring colour per theme: 2px wide, 2px offset. */
export const focus = { dark: '#5eeaff', light: '#006b85' } as const;
