/**
 * The Meridian colour roles, per theme, from design system spec section 4.1.
 *
 * Dark text roles are measured on `plateRaised`, the lightest dark surface.
 * Light text roles are measured on `bulkhead`, the darkest light surface. Each
 * value carries its floor and its measured ratio in the comment beside it, and
 * `contrast.test.ts` recomputes both.
 */

export const CONTRAST_FLOOR = { text: 4.5, control: 3 } as const;

export const colour = {
  dark: {
    bulkhead: '#14191f', // the page ground
    plate: '#1c2229', // panels and the article
    plateRaised: '#252c34', // dialogs and menus
    seam: '#333b45', // decorative only
    edge: '#6b7684', // control borders, floor 3:1, measured 3.06:1
    text: '#e8ecf0', // floor 4.5:1, measured 11.88:1
    textSecondary: '#b0b9c3', // floor 4.5:1, measured 7.10:1
    textTertiary: '#8f99a5', // floor 4.5:1, measured 4.88:1
    data: '#4dd6ea', // floor 4.5:1, measured 8.14:1
    action: '#f0a43a', // floor 4.5:1, measured 6.77:1
    actionFill: '#f0a43a', // the primary button face, pairs in contrast.test.ts
    onAction: '#1b1207', // text on actionFill, measured 8.87:1
    alarm: '#ff6b5e', // floor 4.5:1, measured 5.05:1
    alarmFill: '#c2362b', // the alarm banner face, pairs in contrast.test.ts
    onAlarm: '#ffffff', // text on alarmFill, measured 5.45:1
    nominal: '#6ccf8a', // floor 4.5:1, measured 7.34:1
  },
  light: {
    bulkhead: '#eceef1', // the page ground
    plate: '#f8f9fa', // panels and the article
    plateRaised: '#ffffff', // dialogs and menus
    seam: '#d3d8de', // decorative only
    edge: '#7a8591', // control borders, floor 3:1, measured 3.23:1
    text: '#11161c', // floor 4.5:1, measured 15.64:1
    textSecondary: '#3a444f', // floor 4.5:1, measured 8.52:1
    textTertiary: '#545f6b', // floor 4.5:1, measured 5.60:1
    data: '#006e86', // floor 4.5:1, measured 5.05:1
    action: '#985700', // floor 4.5:1, measured 4.89:1
    actionFill: '#eb9a2c', // the primary button face, pairs in contrast.test.ts
    onAction: '#1b1207', // text on actionFill, measured 8.09:1
    alarm: '#b3261e', // floor 4.5:1, measured 5.62:1
    alarmFill: '#b3261e', // the alarm banner face, pairs in contrast.test.ts
    onAlarm: '#ffffff', // text on alarmFill, measured 6.54:1
    nominal: '#1f7340', // floor 4.5:1, measured 5.04:1
  },
} as const;

export type ColourRole = keyof (typeof colour)['dark'];

/**
 * The screen roles do not switch with the theme (spec V1): a screen stays dark
 * in both.
 */
export const screen = {
  space: '#070b12', // the void behind the bridge windows and the hero
  screen: '#0b1015', // the terminal face and the deck view's floor
  screenText: '#e8ecf0', // terminal text, measured 16.09:1 on screen
  holo: '#0e2a33', // the backing of a holographic callout
} as const;

export type ScreenRole = keyof typeof screen;

/** The opacity of the `holo` backing (spec section 4.4). */
export const HOLO_ALPHA = 0.94;

/** The roles that carry text on a plate, each held to `CONTRAST_FLOOR.text`. */
export const TEXT_ROLES = [
  'text',
  'textSecondary',
  'textTertiary',
  'data',
  'action',
  'alarm',
  'nominal',
] as const satisfies readonly ColourRole[];
