/**
 * Types for `examples-file.mjs`.
 *
 * That module is plain JavaScript for the reason `regions.d.mts` gives: the
 * docs app's MDX loaders import it, and Nx loads `next.config.ts` under Node's
 * built-in type stripping while building the project graph.
 */

export declare function examplesFilesIn(packageDir: string): string[];
export declare function packageDirOf(file: string): string;
export declare function regionFileOf(
  files: string[],
  region: string,
  read?: (path: string) => string,
): string;
