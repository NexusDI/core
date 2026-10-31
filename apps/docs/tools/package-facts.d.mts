/** Types for `package-facts.mjs`. */

export interface PackageFact {
  name: string;
  description: string;
  npm: string;
  /** The docs page that claims the package, root-relative, or undefined. */
  docs: string | undefined;
  /** True for `@nexusdi/core`, the one a reader needs. */
  required: boolean;
}

export declare function dependencyCount(
  workspaceRoot: string,
  dir?: string,
): number;
export declare function workspacePackages(workspaceRoot: string): PackageFact[];
