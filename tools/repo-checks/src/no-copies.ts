import { readFileSync } from 'node:fs';
import { join, matchesGlob, posix } from 'node:path';

import { parse } from 'jsonc-parser';

import { filesUnder, libDirs, TEST_FILE } from './entry-graph.js';

/**
 * P4: no copy of another package's logic (spec section 1.5).
 *
 * The fallow duplicates gate finds copies, so an ignore that spans two
 * packages would hide one. The check matches each `duplicates.ignore` glob
 * in `.fallowrc.jsonc` against every package's code, the non-test files
 * under `libs/<pkg>/src/` and `libs/<pkg>/test-support/`, and fails on a
 * glob that matches code in two packages. Config files and tests hold no
 * package logic, so a glob over them passes. The check also fails on a
 * file under `libs/<pkg>/src/`, tests included, that says "keep them in
 * step with libs/", the comment a hand-kept copy carries.
 */

/** A `duplicates.ignore` glob that may span packages, with its reason. */
export interface CopyAllowance {
  readonly glob: string;
  readonly reason: string;
}

export interface NoCopies {
  readonly violations: readonly string[];
  /** The allowed globs the config holds and that span packages. */
  readonly used: ReadonlySet<string>;
  /** What the check found to hold the rule against. */
  readonly scanned: {
    readonly packages: number;
    readonly globs: number;
    readonly files: number;
  };
}

/** The marker, also when a comment wraps it over lines. */
const COPY_MARKER = new RegExp(
  ['keep', 'them', 'in', 'step', 'with', 'libs/'].join(
    String.raw`(?:\s|//|\*)+`,
  ),
  'gi',
);
const SHARED_HELPER = 'export the shared helper from its owner';

/** The violations of P4 in the repository at `root`. */
export function noCopies(
  root: string,
  allowlist: readonly CopyAllowance[],
): NoCopies {
  const config = parse(readFileSync(join(root, '.fallowrc.jsonc'), 'utf8')) as {
    duplicates?: { ignore?: string[] };
  };
  const globs = config.duplicates?.ignore ?? [];
  const libs = join(root, 'libs');
  const packages = libDirs(libs);
  const code = packages.flatMap((dir) =>
    ['src', 'test-support']
      .flatMap((folder) => filesUnder(join(libs, dir, folder), root))
      .filter((path) => !TEST_FILE.test(path))
      .map((path) => ({ dir, path })),
  );
  const violations: string[] = [];
  const used = new Set<string>();

  for (const glob of globs) {
    const spanned = [
      ...new Set(
        code
          .filter(({ path }) => matchesGlob(path, glob))
          .map(({ dir }) => dir),
      ),
    ];
    if (spanned.length < 2) continue;
    if (allowlist.some((entry) => entry.glob === glob)) used.add(glob);
    else
      violations.push(
        `duplicates.ignore holds ${glob}, which spans ${spanned.map((dir) => posix.join('libs', dir)).join(' and ')}; ${SHARED_HELPER}`,
      );
  }

  for (const dir of packages)
    for (const path of filesUnder(join(libs, dir, 'src'), root)) {
      const text = readFileSync(join(root, path), 'utf8');
      for (const match of text.matchAll(COPY_MARKER))
        violations.push(
          `${path}:${text.slice(0, match.index).split('\n').length} says "keep them in step with libs/"; ${SHARED_HELPER}`,
        );
    }

  return {
    violations,
    used,
    scanned: {
      packages: packages.length,
      globs: globs.length,
      files: code.length,
    },
  };
}
