/**
 * Types for `behaviours.mjs`.
 *
 * That module is plain JavaScript for the reason `regions.d.mts` gives: the
 * docs app's build steps import it, and Nx loads `next.config.ts` under Node's
 * built-in type stripping while building the project graph.
 */

/** One case, or one block of generated cases, as the chain above it. */
export interface Chain {
  /** The `describe` titles above the case, outermost first, ending in its own. */
  chain: string[];
  /**
   * Whether this stands for a block of cases whose titles the runner computes
   * per row, in which case the chain ends at the `describe` naming what they
   * are about.
   */
  generated: boolean;
  /** The test source the case is written in. */
  file: string;
  /** The line the case's own call stands on. */
  line: number;
  /** What the case does, as the author wrote it, dedented. */
  body: string;
}

/** One chain with the number the package's own walk gave it. */
export interface Stated extends Chain {
  /** Its position in `chains`, which is what the sidecar keys a body by. */
  id: number;
}

/** What a package's tests state, keyed by the name each `describe` spells. */
export interface Behaviours {
  /** The test sources the chains were read from. */
  files: string[];
  /** Every chain the package states, each one once. */
  chains: Stated[];
  states: Map<string, Map<string, Stated>>;
}

export declare function filesUnder(
  dir: string,
  keep: (name: string) => boolean,
  skipDir?: (dir: string) => boolean,
): string[];

export declare function testFilesOf(packageRoot: string): string[];
export declare function chainsOf(path: string): Chain[];
export declare function behavioursOf(packageRoot: string): Behaviours;
export declare function describedBy(packageRoot: string): Set<string>;
