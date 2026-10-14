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
  renameSync,
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

export function testConsumer(
  name: string,
  ids: readonly LibraryId[],
  install: (dir: string, specs: string[]) => void = installConsumer,
): string {
  const tmp = join(BENCHMARKS, 'tmp');
  mkdirSync(tmp, { recursive: true });
  const libraries = readLibraries().libraries.filter((l) => ids.includes(l.id));
  const tsc = readToolchains().find((t) => t.id === 'tsc');
  if (tsc === undefined) throw new Error('toolchains.json lost tsc');
  const specs = [
    ...libraries.map((l) => `${l.package}@${l.version}`),
    ...EXTRA,
    ...Object.entries(tsc.packages).map(([pkg, v]) => `${pkg}@${v}`),
  ].sort();
  const pins = createHash('sha256').update(JSON.stringify(specs)).digest('hex');
  const shared = join(tmp, `${name}-install-${pins.slice(0, 12)}`);
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
