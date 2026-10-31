import type { SchematicBase } from '@nexusdi/meridian-ui';

import cutaway1024Avif from '../ship-art/cutaway/meridian-cutaway-1024.avif';
import cutaway1024Webp from '../ship-art/cutaway/meridian-cutaway-1024.webp';
import cutaway1536Avif from '../ship-art/cutaway/meridian-cutaway-1536.avif';
import cutaway1536Webp from '../ship-art/cutaway/meridian-cutaway-1536.webp';
import cutaway2048Avif from '../ship-art/cutaway/meridian-cutaway-2048.avif';
import cutaway2048Webp from '../ship-art/cutaway/meridian-cutaway-2048.webp';
import side1024Avif from '../ship-art/side/meridian-side-1024.avif';
import side1024Webp from '../ship-art/side/meridian-side-1024.webp';
import side1536Avif from '../ship-art/side/meridian-side-1536.avif';
import side1536Webp from '../ship-art/side/meridian-side-1536.webp';
import side2048Avif from '../ship-art/side/meridian-side-2048.avif';
import side2048Webp from '../ship-art/side/meridian-side-2048.webp';

/**
 * The painted views as `Schematic` and the strip take them (design system
 * 8.1 and 8.3). Next reads no size from an AVIF file, so each set takes its
 * width and height from the WebP file of the same name. The cutaway's sources
 * are one set that the bay and the ship systems strip share, so the browser
 * loads each file once whichever of them asks first.
 */

const set = (files: readonly { src: string; width: number }[]): string =>
  files.map((file) => `${file.src} ${file.width}w`).join(', ');

const cutawayAvif = [cutaway1024Avif, cutaway1536Avif, cutaway2048Avif].map(
  (file, at) => ({ src: file.src, width: [1024, 1536, 2048][at] ?? 0 }),
);
const cutawayWebp = [cutaway1024Webp, cutaway1536Webp, cutaway2048Webp].map(
  (file) => ({ src: file.src, width: file.width }),
);
const sideAvif = [side1024Avif, side1536Avif, side2048Avif].map((file, at) => ({
  src: file.src,
  width: [1024, 1536, 2048][at] ?? 0,
}));
const sideWebp = [side1024Webp, side1536Webp, side2048Webp].map((file) => ({
  src: file.src,
  width: file.width,
}));

/** The frame of both side views in metres: `x y width height`. */
export const FRAME: readonly [number, number, number, number] = [
  -5, -1.5, 80, 20,
];

/** The painted cutaway for a `Schematic`, with the `sizes` of where it is shown. */
export function cutawayBase(sizes: string): SchematicBase {
  return {
    src: cutaway2048Webp.src,
    width: cutaway2048Webp.width,
    height: cutaway2048Webp.height,
    sources: [
      { type: 'image/avif', srcSet: set(cutawayAvif) },
      { type: 'image/webp', srcSet: set(cutawayWebp) },
    ],
    sizes,
    loading: 'lazy',
  };
}

/** The painted side exterior, the backdrop of the ship systems strip. */
export function sideBase(sizes: string): SchematicBase {
  return {
    src: side2048Webp.src,
    width: side2048Webp.width,
    height: side2048Webp.height,
    sources: [
      { type: 'image/avif', srcSet: set(sideAvif) },
      { type: 'image/webp', srcSet: set(sideWebp) },
    ],
    sizes,
    loading: 'lazy',
  };
}
