/**
 * The throwaway consumer every harness writer builds in: the packed
 * @nexusdi/core, @nexusdi/decorators and @nexusdi/testing, the competitor
 * pins, their
 * polyfill, and every pinned toolchain, installed into one temporary
 * directory the way examples/toolchain-matrix does it (spec 4.1).
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  installConsumer,
  packInto,
  readToolchains,
} from '@nexusdi/toolchain-matrix/recipes';

import { BENCHMARKS, FIXTURES, readLibraries } from './libraries.ts';
import type { LibraryId, Profile } from './schema.ts';

export const ROOT = join(BENCHMARKS, '..');

/** The workspace packages a fixture imports, by folder and name. */
const PACKED = [
  ['libs/core', '@nexusdi/core'],
  ['libs/decorators', '@nexusdi/decorators'],
  ['libs/testing', '@nexusdi/testing'],
] as const;

/**
 * Packages a profile or the harness needs beside the libraries and
 * toolchains. The consumer is a Node 24 app, so it has Node's types, as
 * awilix's declarations need.
 */
const EXTRA = [
  'reflect-metadata@0.2.2',
  'babel-plugin-transform-typescript-metadata@0.4.0',
  '@types/node@24.19.0',
];

/** The version of @nexusdi/core the consumer installs. */
export function coreVersion(): string {
  return (
    JSON.parse(
      readFileSync(join(ROOT, 'libs', 'core', 'package.json'), 'utf8'),
    ) as { version: string }
  ).version;
}

/** Pins of every toolchain package, deduplicated. */
function toolchainPins(): string[] {
  const pins = readToolchains().flatMap((t) =>
    Object.entries(t.packages).map(([pkg, version]) => `${pkg}@${version}`),
  );
  return [...new Set(pins)];
}

export function prepareConsumer(opts: { libraries: LibraryId[] }): string {
  const dir = mkdtempSync(join(tmpdir(), 'nexusdi-bench-'));
  console.log(`Building and packing ${PACKED.map(([, n]) => n).join(', ')}…`);
  execFileSync(
    'npx',
    [
      'nx',
      'run-many',
      '-t',
      'build',
      '-p',
      ...PACKED.map(([, name]) => name),
      '--skip-nx-cache',
    ],
    {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, NX_NO_CLOUD: 'true', NX_DAEMON: 'false' },
    },
  );
  const tarballs = packInto(dir, ROOT, PACKED);
  const competitors = readLibraries()
    .libraries.filter(
      (l) => l.id !== 'nexusdi' && opts.libraries.includes(l.id),
    )
    .map((l) => `${l.package}@${l.version}`);
  const specs = [
    ...tarballs.map((t) => `./${t}`),
    ...competitors,
    ...EXTRA,
    ...toolchainPins(),
  ];
  console.log(`Installing ${specs.length} packages…`);
  // ESM, so the .js every compiling toolchain emits loads as a module.
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'nexusdi-bench-run',
      private: true,
      type: 'module',
    }),
  );
  installConsumer(dir, specs);
  cpSync(join(FIXTURES, 'config'), join(dir, 'config'), { recursive: true });
  for (const script of ['scenario.mjs', 'snippets-check.mjs', 'probe-run.mjs'])
    copyFileSync(join(FIXTURES, script), join(dir, script));
  return dir;
}

/**
 * A cell directory inside the consumer: `source` as src/main.ts, the
 * profile configs, the profile's tsconfig.json at its root, and the
 * consumer's node_modules linked in.
 */
export function makeCell(
  dir: string,
  name: string,
  source: string,
  profile: Profile,
): string {
  const cellDir = join(dir, 'cells', name.replace(/[^a-z0-9-]+/gi, '-'));
  mkdirSync(join(cellDir, 'src'), { recursive: true });
  copyFileSync(source, join(cellDir, 'src', 'main.ts'));
  cpSync(join(dir, 'config'), join(cellDir, 'config'), { recursive: true });
  copyFileSync(
    join(dir, 'config', profile, 'tsconfig.json'),
    join(cellDir, 'tsconfig.json'),
  );
  symlinkSync(join(dir, 'node_modules'), join(cellDir, 'node_modules'), 'dir');
  return cellDir;
}
