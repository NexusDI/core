import { cx } from './class-names.js';

export interface MarkerProps {
  shape: 'corner' | 'tick' | 'lifetime';
  lifetime?: 'singleton' | 'scoped' | 'transient' | 'none';
}

/**
 * A thin geometric mark. Decoration only, so it is hidden from assistive tech.
 * A lifetime shape draws the glyph of design system spec section 4.6 in the
 * `data` colour; the lifetime's word sits beside it in the page.
 */
export function Marker({ shape, lifetime }: MarkerProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'meridian-marker',
        `meridian-marker--${shape}`,
        shape === 'lifetime' && `meridian-lifetime-${lifetime ?? 'none'}`,
      )}
    />
  );
}
