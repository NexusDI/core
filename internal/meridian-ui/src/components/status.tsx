import { Glyph, type GlyphName } from './glyph.js';

export const STATUS_STATES = [
  'nominal',
  'active',
  'standby',
  'warning',
  'alarm',
  'offline',
] as const;

export type StatusState = (typeof STATUS_STATES)[number];

/** The glyph of each state (design system spec section 7.5). */
export const STATUS_GLYPHS = {
  nominal: 'filled-square',
  active: 'filled-circle',
  standby: 'outline-circle',
  warning: 'triangle',
  alarm: 'filled-diamond',
  offline: 'crossed-circle',
} as const satisfies Record<StatusState, GlyphName>;

export interface StatusProps {
  /** The system's own word, such as a snapshot's `status` field. */
  word: string;
  /** The app's table from each word to a state. */
  states: Readonly<Record<string, StatusState>>;
}

/**
 * A glyph, a word and a hue, always all three. The app owns the vocabulary; a
 * word its table lacks shows as standby, so a new system adds its words
 * without a change here.
 */
export function Status({ word, states }: StatusProps) {
  const state: StatusState = Object.hasOwn(states, word)
    ? (states[word] ?? 'standby')
    : 'standby';

  return (
    <span className={`meridian-status meridian-status--${state}`}>
      <Glyph name={STATUS_GLYPHS[state]} />
      <span className="meridian-status__word">{word}</span>
    </span>
  );
}
