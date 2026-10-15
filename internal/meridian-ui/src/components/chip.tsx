import type { ReactNode } from 'react';

import { cx } from './class-names.js';

export interface ChipProps {
  children?: ReactNode;
  className?: string;
}

/**
 * A small label in the mono micro face. It names a fact in words, so its
 * colour is never the only channel that carries the fact. Inside an element
 * with a `meridian-kind-<kind>` class, or carrying one itself, it takes that
 * kind's hue.
 */
export function Chip({ children, className }: ChipProps) {
  return <span className={cx('meridian-chip', className)}>{children}</span>;
}
