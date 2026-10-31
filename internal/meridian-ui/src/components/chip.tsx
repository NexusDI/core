import type { ReactNode } from 'react';

import { cx } from './class-names.js';

export interface ChipProps {
  children?: ReactNode;
  className?: string;
}

/**
 * A small neutral label in the condensed micro face. It names a fact in words
 * (an export kind, for one) in `text-secondary` on a `seam` border, so no hue
 * carries the fact.
 */
export function Chip({ children, className }: ChipProps) {
  return <span className={cx('meridian-chip', className)}>{children}</span>;
}
