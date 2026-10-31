import type { ReactNode } from 'react';

export type GlyphName =
  | 'filled-square'
  | 'filled-circle'
  | 'outline-circle'
  | 'triangle'
  | 'filled-diamond'
  | 'crossed-circle'
  | 'circled-i'
  | 'crossed-square'
  | 'ship';

const SHAPES: Record<GlyphName, ReactNode> = {
  'filled-square': (
    <rect x="1.5" y="1.5" width="7" height="7" fill="currentColor" />
  ),
  'filled-circle': <circle cx="5" cy="5" r="3.5" fill="currentColor" />,
  'outline-circle': <circle cx="5" cy="5" r="3.5" />,
  triangle: <path d="M5 1.2 9 8.6H1Z" strokeLinejoin="round" />,
  'filled-diamond': <path d="M5 .8 9.2 5 5 9.2.8 5Z" fill="currentColor" />,
  'crossed-circle': (
    <>
      <circle cx="5" cy="5" r="3.7" />
      <path d="M2.4 7.6 7.6 2.4" />
    </>
  ),
  'circled-i': (
    <>
      <circle cx="5" cy="5" r="3.9" />
      <path d="M5 4.4v2.6M5 2.9v.1" />
    </>
  ),
  'crossed-square': (
    <>
      <rect x="1.2" y="1.2" width="7.6" height="7.6" />
      <path d="m3 3 4 4M7 3 3 7" />
    </>
  ),
  ship: (
    <path
      d="M.8 5 3.2 3.4 4.4 1.4H5.6L6.2 3.4H9.2V6.6H6.2L5.6 8.6H4.4L3.2 6.6Z"
      fill="currentColor"
      strokeLinejoin="round"
    />
  ),
};

/**
 * The glyphs the status, the callout kinds and the alert banner share. Each
 * draws on a 10 by 10 grid in `currentColor`, so the surrounding class sets the
 * hue, and hides from assistive tech: the word beside it carries the meaning.
 */
export function Glyph({ name }: { name: GlyphName }) {
  return (
    <svg
      className="meridian-glyph"
      viewBox="0 0 10 10"
      width="10"
      height="10"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      {SHAPES[name]}
    </svg>
  );
}
