/** Types for `libraries.mjs`. */

/** One package that publishes a library entry. */
export interface Library {
  /** The package name, such as `@nexusdi/core`. */
  name: string;
  /** The package directory, workspace relative: `libs/core`. */
  root: string;
  /** The directory's own name, which the behaviour files are named after. */
  dir: string;
}

export declare function libraries(workspaceRoot: string): Library[];
