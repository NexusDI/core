import type { ReactNode } from 'react';

export type NoticeKind = 'note' | 'exception' | 'warning' | 'ship';

/** The four notice labels, public guidance decisions 7 and 8 with `Ship note`. */
export const NOTICE_LABELS = {
  note: 'Note',
  exception: 'Exception',
  warning: 'Warning',
  ship: 'Ship note',
} as const satisfies Record<NoticeKind, string>;

export interface NoticeProps {
  kind: NoticeKind;
  children?: ReactNode;
}

export function Notice({ kind, children }: NoticeProps) {
  return (
    <aside role="note" className={`meridian-notice meridian-notice--${kind}`}>
      <p className="meridian-notice__label">{NOTICE_LABELS[kind]}</p>
      <div className="meridian-notice__body">{children}</div>
    </aside>
  );
}
