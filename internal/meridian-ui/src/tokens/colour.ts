/**
 * The Meridian colour roles, per theme, from spec §8.2.
 *
 * No text renders on the background canvas. Every text role sits on a reading
 * surface, so each floor below is measured against the worst composite that
 * surface can produce: in dark mode the `hull` at 86% over a white pixel
 * (`#2d314d`), in light mode the darkest light ground (`#e6eaf7`). The floor
 * and the measured ratio are written beside each value; `contrast.test.ts`
 * recomputes both.
 */

export const CONTRAST_FLOOR = { text: 4.5, control: 3 } as const;

export const colour = {
  dark: {
    space0: '#070a1c', // ground
    space2: '#1a2150', // ground
    rule: '#2a3470', // decorative only
    controlBorder: '#6b78c8', // floor 3:1, measured 3.10:1
    text: '#e8edff', // floor 4.5:1, measured 10.85:1
    textSecondary: '#aab4e0', // floor 4.5:1, measured 6.22:1
    textTertiary: '#8e99cc', // floor 4.5:1, measured 4.57:1
    signalCyan: '#5eeaff', // floor 4.5:1, measured 8.86:1
    signalMagenta: '#ff5ec8', // floor 4.5:1, measured 4.64:1
    signalAmber: '#ffc75e', // floor 4.5:1, measured 8.19:1
    statusPass: '#5effa8', // floor 4.5:1, measured 9.86:1
    statusFail: '#ff7b7b', // floor 4.5:1, measured 5.05:1
    nebulaViolet: '#8b6cff', // background only
  },
  light: {
    space0: '#f4f6fc', // ground
    space2: '#e6eaf7', // ground, the darkest light ground
    rule: '#cfd5ee', // decorative only
    controlBorder: '#7f89b0', // floor 3:1 on #fdfdfe, measured 3.38:1
    text: '#0b1030', // floor 4.5:1, measured 15.45:1
    textSecondary: '#3a4470', // floor 4.5:1, measured 7.80:1
    textTertiary: '#4f5a8a', // floor 4.5:1, measured 5.53:1
    signalCyan: '#006b85', // floor 4.5:1, measured 5.08:1
    signalMagenta: '#b0006e', // floor 4.5:1, measured 5.69:1
    signalAmber: '#8a5a00', // floor 4.5:1, measured 4.93:1
    statusPass: '#0a7040', // floor 4.5:1, measured 5.13:1
    statusFail: '#b3261e', // floor 4.5:1, measured 5.44:1
    nebulaViolet: '#8b6cff', // unused in light mode: the background draws nothing there
  },
} as const;

export type ColourRole = keyof (typeof colour)['dark'];

/** The roles that carry text, each held to `CONTRAST_FLOOR.text`. */
export const TEXT_ROLES = [
  'text',
  'textSecondary',
  'textTertiary',
  'signalCyan',
  'signalMagenta',
  'signalAmber',
  'statusPass',
  'statusFail',
] as const satisfies readonly ColourRole[];

/** The reading surfaces, as a colour and an opacity. */
export const surface = {
  dark: {
    hull: { hex: '#0b1030', alpha: 0.86 },
    hullRaised: { hex: '#161d48', alpha: 0.92 },
  },
  light: {
    hull: { hex: '#ffffff', alpha: 0.92 },
    hullRaised: { hex: '#ffffff', alpha: 1 },
  },
} as const;
