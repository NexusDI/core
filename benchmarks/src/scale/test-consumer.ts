/**
 * A small consumer for renderer tests: the pinned competitor packages, the
 * harness extras and the pinned tsc, installed once under benchmarks/tmp
 * and reused while the pins hold. The full consumer (consumer.ts) also
 * builds and packs the workspace, which a renderer test does not need.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  installConsumer,
  readToolchains,
} from '@nexusdi/toolchain-matrix/recipes';

import { EXTRA } from '../consumer.ts';
import { BENCHMARKS, FIXTURES, readLibraries } from '../libraries.ts';
import type { LibraryId } from '../schema.ts';

export function testConsumer(name: string, ids: readonly LibraryId[]): string {
  const dir = join(BENCHMARKS, 'tmp', name);
  const libraries = readLibraries().libraries.filter((l) => ids.includes(l.id));
  const tsc = readToolchains().find((t) => t.id === 'tsc');
  if (tsc === undefined) throw new Error('toolchains.json lost tsc');
  const specs = [
    ...libraries.map((l) => `${l.package}@${l.version}`),
    ...EXTRA,
    ...Object.entries(tsc.packages).map(([pkg, v]) => `${pkg}@${v}`),
  ].sort();
  const marker = join(dir, 'pins.json');
  const pins = JSON.stringify(specs);
  if (!existsSync(marker) || readFileSync(marker, 'utf8') !== pins) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name, private: true, type: 'module' }),
    );
    installConsumer(dir, specs);
    writeFileSync(marker, pins);
  }
  rmSync(join(dir, 'cells'), { recursive: true, force: true });
  cpSync(join(FIXTURES, 'config'), join(dir, 'config'), { recursive: true });
  return dir;
}
