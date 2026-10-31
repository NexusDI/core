import type { SchematicBase } from '@nexusdi/meridian-ui';

import unlit1024Avif from '../ship-art/cutaway-unlit/meridian-cutaway-unlit-1024.avif';
import unlit1024Webp from '../ship-art/cutaway-unlit/meridian-cutaway-unlit-1024.webp';
import unlit1536Avif from '../ship-art/cutaway-unlit/meridian-cutaway-unlit-1536.avif';
import unlit1536Webp from '../ship-art/cutaway-unlit/meridian-cutaway-unlit-1536.webp';
import unlit2048Avif from '../ship-art/cutaway-unlit/meridian-cutaway-unlit-2048.avif';
import unlit2048Webp from '../ship-art/cutaway-unlit/meridian-cutaway-unlit-2048.webp';
import side1024Avif from '../ship-art/side/meridian-side-1024.avif';
import side1024Webp from '../ship-art/side/meridian-side-1024.webp';
import side1536Avif from '../ship-art/side/meridian-side-1536.avif';
import side1536Webp from '../ship-art/side/meridian-side-1536.webp';
import side2048Avif from '../ship-art/side/meridian-side-2048.avif';
import side2048Webp from '../ship-art/side/meridian-side-2048.webp';

/**
 * The painted views as `Schematic` and the strip take them (design system
 * 8.1 and 8.3). Next reads no size from an AVIF file, so each set takes its
 * width and height from the WebP file of the same name. The unlit cutaway's
 * sources are one set that the bay and the ship systems crops share, so the
 * browser loads each file once whichever of them asks first (TL30).
 */

const set = (files: readonly { src: string; width: number }[]): string =>
  files.map((file) => `${file.src} ${file.width}w`).join(', ');

const WIDTHS = [1024, 1536, 2048];

/** The two sources of a view: the AVIF files by their widths, and the WebP files by their own. */
const sourcesOf = (
  avif: readonly { src: string }[],
  webp: readonly { src: string; width: number }[],
): SchematicBase['sources'] => [
  {
    type: 'image/avif',
    srcSet: set(
      avif.map((file, at) => ({ src: file.src, width: WIDTHS[at] ?? 0 })),
    ),
  },
  { type: 'image/webp', srcSet: set(webp) },
];

const unlitSources = sourcesOf(
  [unlit1024Avif, unlit1536Avif, unlit2048Avif],
  [unlit1024Webp, unlit1536Webp, unlit2048Webp],
);
const sideSources = sourcesOf(
  [side1024Avif, side1536Avif, side2048Avif],
  [side1024Webp, side1536Webp, side2048Webp],
);

/** The frame of both side views in metres: `x y width height`. */
export const FRAME: readonly [number, number, number, number] = [-5, 0, 80, 20];

const baseOf = (
  widest: { src: string; width: number; height: number },
  sources: SchematicBase['sources'],
  sizes: string,
): SchematicBase => ({
  src: widest.src,
  width: widest.width,
  height: widest.height,
  sources,
  sizes,
  loading: 'lazy',
});

/**
 * The unlit cutaway of the pre-flight bay (design system 8.1, OR5): the base
 * that the deck view lights at run time, and that the painted tints of
 * `Schematic` light without it.
 */
export const unlitCutawayBase = (sizes: string): SchematicBase =>
  baseOf(unlit2048Webp, unlitSources, sizes);

/** The painted side exterior, the backdrop of the ship systems strip. */
export const sideBase = (sizes: string): SchematicBase =>
  baseOf(side2048Webp, sideSources, sizes);
