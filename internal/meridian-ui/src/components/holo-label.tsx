import type { ReactNode } from 'react';

import { cx } from './class-names.js';

export interface HoloReadout {
  label: string;
  value: ReactNode;
  /** The SI unit, printed in the micro face beside the figure. */
  unit?: string;
}

/** One to four readouts: a holographic label never carries a fifth. */
export type HoloReadouts =
  | readonly [HoloReadout]
  | readonly [HoloReadout, HoloReadout]
  | readonly [HoloReadout, HoloReadout, HoloReadout]
  | readonly [HoloReadout, HoloReadout, HoloReadout, HoloReadout];

export interface HoloLabelProps {
  /** The part of the ship the label names. */
  title: string;
  readouts: HoloReadouts;
  /** Which edge the leader line to the named part leaves from. */
  leader?: 'top' | 'bottom' | 'start' | 'end';
  className?: string;
}

/**
 * A holographic data label (design system spec sections 4.4 and 7.3): a
 * `holo` backing at 94% opacity, a 1px `data` hairline, a leader line to the
 * part it names and at most four readouts. An alarm in a label also raises the
 * alarm banner, so the label is never the only place an alarm shows.
 */
export function HoloLabel({
  title,
  readouts,
  leader,
  className,
}: HoloLabelProps) {
  return (
    <aside
      className={cx(
        'meridian-holo',
        leader && `meridian-holo--leader-${leader}`,
        className,
      )}
      aria-label={title}
    >
      <p className="meridian-holo__title">{title}</p>
      <dl className="meridian-holo__readouts">
        {readouts.map((readout) => (
          <div className="meridian-holo__readout" key={readout.label}>
            <dt className="meridian-holo__label">{readout.label}</dt>
            <dd className="meridian-holo__value">
              {readout.value}
              {readout.unit ? (
                <span className="meridian-holo__unit">{readout.unit}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      {leader ? (
        <span className="meridian-holo__leader" aria-hidden="true" />
      ) : null}
    </aside>
  );
}
