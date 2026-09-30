import { subpathEntryOf } from './entry-graph.js';

/**
 * Every `./text` export has a size fixture (spec section 12.4).
 *
 * scripts/size-report.mjs measures a package's pack only when
 * examples/size/src/<dir>-text.ts exists, so a pack with no fixture goes
 * unmeasured and the report says nothing. The check fails on a package
 * whose manifest exports `./text` with no `<dir>-text.ts` fixture, and on a
 * `<dir>-text.ts` fixture whose package exports no `./text`.
 */

/** The part of a package under libs/ the check reads. */
export interface SizedPackage {
  /** The folder under libs/, such as `federation`. */
  readonly dir: string;
  readonly exports: unknown;
}

const PACK_FIXTURE = /^(.+)-text\.ts$/;

/** True when the package's manifest exports `./text`. */
export function hasTextExport(pkg: SizedPackage): boolean {
  return subpathEntryOf(pkg.exports, './text') !== null;
}

/**
 * The violations across `packages`, given the file names in
 * examples/size/src.
 */
export function sizeFixtureViolations(
  packages: readonly SizedPackage[],
  fixtures: readonly string[],
): string[] {
  const present = new Set(fixtures);
  const packed = new Set(packages.filter(hasTextExport).map((pkg) => pkg.dir));
  const violations: string[] = [];
  for (const dir of packed)
    if (!present.has(`${dir}-text.ts`))
      violations.push(
        `libs/${dir} exports ./text, and examples/size/src/${dir}-text.ts is missing, so npm run size does not measure its pack`,
      );
  for (const fixture of [...fixtures].sort()) {
    const dir = PACK_FIXTURE.exec(fixture)?.[1];
    if (dir !== undefined && !packed.has(dir))
      violations.push(
        `examples/size/src/${fixture} measures a pack, and libs/${dir} has no ./text export`,
      );
  }
  return violations;
}
