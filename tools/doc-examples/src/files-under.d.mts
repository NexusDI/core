/** Types for `files-under.mjs`. */

export declare function filesUnder(
  dir: string,
  keep: (name: string) => boolean,
  skipDir?: (dir: string) => boolean,
): string[];
