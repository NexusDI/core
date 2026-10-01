/**
 * Types for `regions.mjs`.
 *
 * That module is plain JavaScript because `apps/docs/next.config.ts` imports
 * it, and Nx loads that config under Node's native type stripping while
 * building the project graph. A TypeScript import there fails to load.
 */

export interface Region {
  /**
   * The language for the code block the docs app renders: a markdown region's
   * fence info with the doctest marker gone, or `ts`, `tsx` or `astro` from
   * the extension of a source file.
   */
  lang: string;
  /** The code the markers wrap. */
  code: string;
}

export declare class RegionError extends Error {
  constructor(message: string);
}

export declare function parseRegions(
  source: string,
  file: string,
): Map<string, Region>;

export declare function readRegion(
  source: string,
  file: string,
  name: string,
): Region;
