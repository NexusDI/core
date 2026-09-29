#!/usr/bin/env node
/**
 * Packs @nexusdi/core, @nexusdi/decorators, @nexusdi/errors and
 * @nexusdi/devtools, installs the tarballs and every pinned toolchain into
 * one throwaway consumer, builds each variant with each toolchain, runs the
 * output, and compares what it prints with golden.json.
 *
 * Writes toolchain-matrix.json. With --check it also fails when the fresh
 * results differ from the committed file, so the docs page and the launch
 * post always read what CI last proved.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  compile,
  installConsumer,
  packInto,
  readToolchains,
  runModule,
} from './recipes.mjs';

const HERE = resolve(import.meta.dirname, '..');
const ROOT = resolve(HERE, '..', '..');
const CHECK = process.argv.includes('--check');
const RESULTS = join(HERE, 'toolchain-matrix.json');
/** The packages the scenario imports, by folder and name. */
const PACKAGES = [
  ['libs/core', '@nexusdi/core'],
  ['libs/decorators', '@nexusdi/decorators'],
  ['libs/errors', '@nexusdi/errors'],
  ['libs/devtools', '@nexusdi/devtools'],
];

const toolchains = readToolchains();
const golden = JSON.parse(readFileSync(join(HERE, 'golden.json'), 'utf8'));
const variants = readdirSync(join(HERE, 'src'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const dir = mkdtempSync(join(tmpdir(), 'nexusdi-toolchains-'));
const results = [];
let failed = false;

try {
  console.log(`Packing ${PACKAGES.map(([, name]) => name).join(', ')}…`);
  for (const [lib] of PACKAGES)
    rmSync(join(ROOT, lib, 'dist'), { recursive: true, force: true });
  execFileSync(
    'npx',
    [
      'nx',
      'run-many',
      '-t',
      'build',
      '-p',
      ...PACKAGES.map(([, name]) => name),
      '--skip-nx-cache',
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' },
  );
  const tarballs = packInto(dir, ROOT, PACKAGES);

  for (const file of [
    'src',
    'tsconfig.matrix.json',
    '.swcrc',
    'babel.config.json',
    'vite.matrix.config.mjs',
    'vite.babel.config.mjs',
  ]) {
    cpSync(join(HERE, file), join(dir, file), { recursive: true });
  }
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'toolchain-matrix-run',
      private: true,
      type: 'module',
    }),
  );

  const pins = toolchains.flatMap((t) =>
    Object.entries(t.packages).map(([pkg, version]) => `${pkg}@${version}`),
  );
  console.log(`Installing ${pins.join(', ')}…`);
  installConsumer(dir, [...tarballs.map((t) => `./${t}`), ...pins]);

  for (const toolchain of toolchains) {
    const version = toolchain.version ?? process.versions.node;
    for (const variant of variants) {
      const cell = { toolchain: toolchain.id, version, variant };
      if (variant === 'decorated' && !toolchain.decorators) {
        results.push({ ...cell, result: 'unsupported', note: toolchain.note });
        continue;
      }
      try {
        const configs = {
          rootDir: 'src',
          tsconfig: 'tsconfig.matrix.json',
          swcrc: '.swcrc',
          babelrc: 'babel.config.json',
          viteConfig:
            toolchain.id === 'vite'
              ? 'vite.matrix.config.mjs'
              : 'vite.babel.config.mjs',
        };
        const modulePath = compile(
          toolchain.id,
          dir,
          `src/${variant}/main.ts`,
          configs,
        );
        const printed = JSON.parse(
          runModule(toolchain.id, dir, modulePath, configs),
        );
        const pass = isDeepStrictEqual(printed, golden);
        if (!pass)
          console.error(
            `${toolchain.id} ${variant}: output differs from golden.json\n${JSON.stringify(printed, null, 2)}`,
          );
        results.push({ ...cell, result: pass ? 'pass' : 'fail' });
      } catch (error) {
        console.error(
          `${toolchain.id} ${variant}: ${error.stderr || error.message}`,
        );
        results.push({ ...cell, result: 'fail' });
      }
      console.log(
        `  ${results.at(-1).result.padEnd(11)} ${toolchain.id} ${version} ${variant}`,
      );
    }
  }

  results.sort(
    (a, b) =>
      a.toolchain.localeCompare(b.toolchain) ||
      a.variant.localeCompare(b.variant),
  );
  const text = JSON.stringify(results, null, 2) + '\n';
  const committed = existsSync(RESULTS) ? readFileSync(RESULTS, 'utf8') : '';
  writeFileSync(RESULTS, text);

  if (results.some((r) => r.result === 'fail')) failed = true;
  if (CHECK && committed !== text) {
    console.error(
      'toolchain-matrix.json changed. Commit the file the run wrote.',
    );
    failed = true;
  }
} catch (error) {
  failed = true;
  console.error(error.stdout || error.message);
  if (error.stderr) console.error(error.stderr);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(
  failed ? '\nToolchain matrix FAILED' : '\nToolchain matrix passed.',
);
process.exit(failed ? 1 : 0);
