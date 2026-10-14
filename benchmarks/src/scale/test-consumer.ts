/**
 * A small consumer for renderer tests: the pinned competitor packages, the
 * harness extras and the pinned tsc, installed once under benchmarks/tmp and
 * reused while the pins hold. The full consumer (consumer.ts) also builds
 * and packs the workspace, which a renderer test does not need.
 *
 * The install is shared and immutable: it goes into a temporary sibling
 * directory and is renamed into place under a name that carries the hash of
 * the pins, so it either exists whole or not at all, and a pin change makes
 * a new directory. Each call returns its own run directory, with its own
 * `cells/`, so overlapping runs never delete each other's cells.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  statSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import {
  installConsumer,
  readToolchains,
} from '@nexusdi/toolchain-matrix/recipes';

import { EXTRA } from '../consumer.ts';
import { BENCHMARKS, FIXTURES, readLibraries } from '../libraries.ts';
import type { LibraryId } from '../schema.ts';

function specsFor(ids: readonly LibraryId[]): string[] {
  const libraries = readLibraries().libraries.filter((l) => ids.includes(l.id));
  const tsc = readToolchains().find((t) => t.id === 'tsc');
  if (tsc === undefined) throw new Error('toolchains.json lost tsc');
  return [
    ...libraries.map((l) => `${l.package}@${l.version}`),
    ...EXTRA,
    ...Object.entries(tsc.packages).map(([pkg, v]) => `${pkg}@${v}`),
  ].sort();
}

/** The directory name of the shared install for these pins, under benchmarks/tmp. */
export function sharedInstallName(
  name: string,
  ids: readonly LibraryId[],
): string {
  const pins = createHash('sha256')
    .update(JSON.stringify(specsFor(ids)))
    .digest('hex');
  return `${name}-install-${pins.slice(0, 12)}`;
}

const HOUR = 3600 * 1000;

/**
 * Removes what earlier runs left: installs for other pins, staging and run
 * directories more than an hour old (a live run is younger), and the cache
 * directory the layout before this one used, named `name` alone.
 */
function sweep(tmp: string, name: string, current: string): void {
  const gone = (entry: string) =>
    rmSync(join(tmp, entry), { recursive: true, force: true });
  for (const entry of readdirSync(tmp)) {
    const old = () => {
      try {
        return Date.now() - statSync(join(tmp, entry)).mtimeMs > HOUR;
      } catch {
        // Another run deleted it since the listing.
        return false;
      }
    };
    if (entry === name) gone(entry);
    else if (entry.startsWith(`${name}-install-`) && entry !== current)
      gone(entry);
    else if (
      (entry.startsWith(`${name}-staging-`) ||
        entry.startsWith(`${name}-run-`)) &&
      old()
    )
      gone(entry);
  }
}

export function testConsumer(
  name: string,
  ids: readonly LibraryId[],
  install: (dir: string, specs: string[]) => void = installConsumer,
): string {
  const tmp = join(BENCHMARKS, 'tmp');
  mkdirSync(tmp, { recursive: true });
  const specs = specsFor(ids);
  const current = sharedInstallName(name, ids);
  sweep(tmp, name, current);
  const shared = join(tmp, current);
  if (!existsSync(shared)) {
    const staging = mkdtempSync(join(tmp, `${name}-staging-`));
    try {
      writeFileSync(
        join(staging, 'package.json'),
        JSON.stringify({ name, private: true, type: 'module' }),
      );
      install(staging, specs);
      try {
        renameSync(staging, shared);
      } catch (error) {
        // A concurrent run installed the same pins first: use its install.
        if (!existsSync(shared)) throw error;
      }
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }
  const run = mkdtempSync(join(tmp, `${name}-run-`));
  process.once('exit', () => rmSync(run, { recursive: true, force: true }));
  symlinkSync(join(shared, 'node_modules'), join(run, 'node_modules'), 'dir');
  cpSync(join(FIXTURES, 'config'), join(run, 'config'), { recursive: true });
  return run;
}
