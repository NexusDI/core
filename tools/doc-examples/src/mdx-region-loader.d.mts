/**
 * Types for `mdx-region-loader.mjs`. That module is plain JavaScript because
 * `apps/docs/next.config.ts` loads it, and Nx loads that config under Node's
 * built-in type stripping while building the project graph.
 */

export declare function expandRegions(
  source: string,
  root: string,
  file: string,
): string;

export default function mdxRegionLoader(
  this: {
    getOptions(): { root: string };
    addDependency(path: string): void;
    resourcePath: string;
  },
  source: string,
): string;
