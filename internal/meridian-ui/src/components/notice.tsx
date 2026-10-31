import type { ReactNode } from 'react';

import { Glyph, type GlyphName } from './glyph.js';

export type NoticeKind = 'note' | 'exception' | 'warning' | 'ship';

/** The four notice labels, public guidance decisions 7 and 8 with `Ship note`. */
export const NOTICE_LABELS = {
  note: 'Note',
  exception: 'Exception',
  warning: 'Warning',
  ship: 'Ship note',
} as const satisfies Record<NoticeKind, string>;

/** The glyph each kind carries, so the label never rests on the edge colour alone. */
const NOTICE_GLYPHS = {
  note: 'circled-i',
  exception: 'crossed-square',
  warning: 'triangle',
  ship: 'ship',
} as const satisfies Record<NoticeKind, GlyphName>;

export interface NoticeProps {
  kind: NoticeKind;
  children?: ReactNode;
}

export function Notice({ kind, children }: NoticeProps) {
  return (
    <aside role="note" className={`meridian-notice meridian-notice--${kind}`}>
      <p className="meridian-notice__label">
        <Glyph name={NOTICE_GLYPHS[kind]} />
        {NOTICE_LABELS[kind]}
      </p>
      <div className="meridian-notice__body">{children}</div>
    </aside>
  );
}
