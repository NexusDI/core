import { cx } from './class-names.js';

export interface MarkerProps {
  shape: 'corner' | 'tick' | 'lifetime';
  lifetime?: 'singleton' | 'scoped' | 'transient' | 'none';
}

/** A thin geometric mark. Decoration only, so it is hidden from assistive tech. */
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
