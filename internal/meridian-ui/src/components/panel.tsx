import type { ReactNode } from 'react';

import { cx } from './class-names.js';

export interface PanelProps {
  as?: 'div' | 'section' | 'aside';
  raised?: boolean;
  /** A placard in a 32px header band above a seam rule. */
  title?: ReactNode;
  /** Controls at the end of the header band. */
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * The plate every text role sits on (design system spec sections 6.3 and
 * 7.1). The outer element carries the drop shadow, which follows the clipped
 * shape; the inner face carries the chamfer and the seam.
 */
export function Panel({
  as: Tag = 'div',
  raised = false,
  title,
  actions,
  className,
  children,
}: PanelProps) {
  return (
    <Tag
      className={cx(
        'meridian-panel',
        raised && 'meridian-panel--raised',
        className,
      )}
    >
      <div className="meridian-panel__face">
        {title || actions ? (
          <header className="meridian-panel__head">
            {title ? <p className="meridian-panel__title">{title}</p> : null}
            {actions ? (
              <div className="meridian-panel__actions">{actions}</div>
            ) : null}
          </header>
        ) : null}
        <div className="meridian-panel__body">{children}</div>
      </div>
    </Tag>
  );
}
