import type { ReactNode } from 'react';

import { cx } from './class-names.js';

export interface PanelProps {
  as?: 'div' | 'section' | 'aside';
  raised?: boolean;
  className?: string;
  children?: ReactNode;
}

/** The glass surface every text role sits on (spec §8.2). */
export function Panel({
  as: Tag = 'div',
  raised = false,
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
      {children}
    </Tag>
  );
}
