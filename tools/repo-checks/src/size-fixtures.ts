import { subpathEntryOf } from './entry-graph.js';

/**
 * Every `./text` export has a size fixture (spec section 12.4).
 *
 * scripts/size-report.mjs measures a package's pack only when
 * examples/size/src/<dir>-text.ts exists, so a pack with no fixture goes
 * unmeasured and the report says nothing. The check fails on a package
 * whose manifest exports `./text` with no `<dir>-text.ts` fixture, and on a
 * `<dir>-text.ts` fixture whose package exports no `./text`. A
 * `<dir>-<feature>.ts` fixture measures one feature of a package, so it
 * fails when `<dir>` is no folder under libs/.
 */

/** The part of a package under libs/ the check reads. */
export interface SizedPackage {
  /** The folder under libs/, such as `federation`. */
  readonly dir: string;
  readonly exports: unknown;
}

const PACK_FIXTURE = /^(.+)-text\.ts$/;
/** `<dir>-<feature>.ts`: a fixture of one package feature. */
const FEATURE_FIXTURE = /^([a-z0-9]+)-[a-z0-9-]+\.ts$/;

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
  const dirs = new Set(packages.map((pkg) => pkg.dir));
  for (const fixture of [...fixtures].sort()) {
    const dir = PACK_FIXTURE.exec(fixture)?.[1];
    if (dir !== undefined) {
      if (!packed.has(dir))
        violations.push(
          `examples/size/src/${fixture} measures a pack, and libs/${dir} has no ./text export`,
        );
      continue;
    }
    const owner = FEATURE_FIXTURE.exec(fixture)?.[1];
    if (owner !== undefined && !dirs.has(owner))
      violations.push(
        `examples/size/src/${fixture} measures a feature of libs/${owner}, which is no package`,
      );
  }
  return violations;
}

/** An entry of examples/size/src/fixtures.json, as budgetViolations reads it. */
export interface FixtureEntry {
  readonly external?: readonly string[];
  readonly budget?: unknown;
  readonly reason?: unknown;
}

/**
 * Every fixtures.json entry names a fixture that exists, a positive budget
 * in gzip bytes, and the reason for that budget (spec 13.6).
 */
export function budgetViolations(
  options: Readonly<Record<string, FixtureEntry>>,
  fixtures: readonly string[],
): string[] {
  const present = new Set(fixtures);
  const violations: string[] = [];
  const at = 'examples/size/src/fixtures.json';
  for (const [name, entry] of Object.entries(options)) {
    if (typeof entry.budget !== 'number' || entry.budget <= 0)
      violations.push(`${at}: ${name} has no positive budget`);
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '')
      violations.push(`${at}: ${name} gives no reason for its budget`);
    if (!present.has(`${name}.ts`))
      violations.push(`${at}: ${name} has no fixture ${name}.ts`);
  }
  return violations;
}
