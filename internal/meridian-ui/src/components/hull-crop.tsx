import type { ReactNode } from 'react';

import { cx } from './class-names.js';

/** A box in the cutaway's coordinates: x, y, width, height. */
export type CropBox = readonly [
  x: number,
  y: number,
  width: number,
  height: number,
];

export interface HullCropProps {
  /** The cutaway's full `viewBox` as numbers. */
  full: CropBox;
  /** The part of it to show, around one hull section. */
  crop: CropBox;
  /**
   * The `view-transition-name` of the crop. With none, the crop sets none.
   * The docs app wraps the crop in React's `<ViewTransition>`; the package
   * only sets the name.
   */
  transitionName?: string;
  /** A `Schematic` sized to the full width of the crop's stage. */
  children?: ReactNode;
  className?: string;
}

/**
 * A crop of the cutaway around one hull section (site UX spec 9). It clips
 * its child to `crop` and sizes the child so that `full` fills the stage, so
 * the overlay of a `Schematic` crops with the ship.
 */
export function HullCrop({
  full,
  crop,
  transitionName,
  children,
  className,
}: HullCropProps) {
  const [fx, fy, fw, fh] = full;
  const [cx0, cy0, cw, ch] = crop;
  return (
    <div
      className={cx('meridian-hull-crop', className)}
      style={{
        aspectRatio: `${cw} / ${ch}`,
        ...(transitionName ? { viewTransitionName: transitionName } : {}),
      }}
    >
      <div
        className="meridian-hull-crop__stage"
        style={{
          width: `${(fw / cw) * 100}%`,
          insetInlineStart: `${(-(cx0 - fx) / cw) * 100}%`,
          insetBlockStart: `${(-(cy0 - fy) / ch) * 100}%`,
          aspectRatio: `${fw} / ${fh}`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
