#!/usr/bin/env node
/**
 * Packs @nexusdi/core, installs the tarball and every pinned toolchain into
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

const HERE = resolve(import.meta.dirname, '..');
const ROOT = resolve(HERE, '..', '..');
const CHECK = process.argv.includes('--check');
const RESULTS = join(HERE, 'toolchain-matrix.json');

const { toolchains } = JSON.parse(
  readFileSync(join(HERE, 'toolchains.json'), 'utf8'),
);
const golden = JSON.parse(readFileSync(join(HERE, 'golden.json'), 'utf8'));
const variants = readdirSync(join(HERE, 'src'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });

/**
 * The path of a package's binary. typescript 6 and its typescript7 alias both
 * name their binary tsc, so the run calls each by path.
 */
function binOf(dir, pkg, name) {
  const manifest = JSON.parse(
    readFileSync(join(dir, 'node_modules', pkg, 'package.json'), 'utf8'),
  );
  const bin =
    typeof manifest.bin === 'string'
      ? manifest.bin
      : (manifest.bin?.[name] ?? Object.values(manifest.bin ?? {})[0]);
  return join(dir, 'node_modules', pkg, bin);
}

const runBin = (path, args, cwd) =>
  /\.[cm]?js$/.test(path)
    ? run(process.execPath, [path, ...args], cwd)
    : run(path, args, cwd);

const viteBuild = (dir, v, config, outDir) => {
  run(
    'npx',
    [
      'vite',
      'build',
      '--config',
      config,
      '--ssr',
      `src/${v}/main.ts`,
      '--outDir',
      `${outDir}/${v}`,
    ],
    dir,
  );
  return run('node', [`${outDir}/${v}/main.js`], dir);
};

/** How each toolchain builds a variant and runs the result. Each returns what the program printed. */
const recipes = {
  tsc: (dir, v) => {
    runBin(
      binOf(dir, 'typescript', 'tsc'),
      ['-p', 'tsconfig.matrix.json', '--outDir', 'out/tsc'],
      dir,
    );
    return run('node', [`out/tsc/${v}/main.js`], dir);
  },
  tsgo: (dir, v) => {
    runBin(
      binOf(dir, 'typescript7', 'tsc'),
      ['-p', 'tsconfig.matrix.json', '--outDir', 'out/tsgo'],
      dir,
    );
    return run('node', [`out/tsgo/${v}/main.js`], dir);
  },
  esbuild: (dir, v) => {
    const out = `out/esbuild/${v}.mjs`;
    run(
      'npx',
      [
        'esbuild',
        `src/${v}/main.ts`,
        '--bundle',
        '--platform=node',
        '--format=esm',
        '--target=es2022',
        '--packages=external',
        `--outfile=${out}`,
      ],
      dir,
    );
    return run('node', [out], dir);
  },
  swc: (dir, v) => {
    run(
      'npx',
      [
        'swc',
        'src',
        '-d',
        'out/swc',
        '--strip-leading-paths',
        '--config-file',
        '.swcrc',
      ],
      dir,
    );
    return run('node', [`out/swc/${v}/main.js`], dir);
  },
  babel: (dir, v) => {
    run(
      'npx',
      [
        'babel',
        'src',
        '--out-dir',
        'out/babel',
        '--extensions',
        '.ts',
        '--config-file',
        './babel.config.json',
      ],
      dir,
    );
    return run('node', [`out/babel/${v}/main.js`], dir);
  },
  vite: (dir, v) => viteBuild(dir, v, 'vite.matrix.config.mjs', 'out/vite'),
  'vite8+babel-plugin': (dir, v) =>
    viteBuild(dir, v, 'vite.babel.config.mjs', 'out/vite-babel'),
  bun: (dir, v) => {
    const out = `out/bun/${v}.mjs`;
    run(
      'npx',
      [
        'bun',
        'build',
        `src/${v}/main.ts`,
        '--target=node',
        '--packages=external',
        `--outfile=${out}`,
      ],
      dir,
    );
    return run('npx', ['bun', out], dir);
  },
  deno: (dir, v) =>
    run(
      'npx',
      [
        'deno',
        'run',
        '--allow-read',
        '--allow-env',
        '--allow-sys',
        '--node-modules-dir=manual',
        `src/${v}/main.ts`,
      ],
      dir,
    ),
  // Plain Node 24: it strips the types and runs the sources as they are.
  'node-strip-types': (dir, v) =>
    run(process.execPath, [`src/${v}/main.ts`], dir),
};

const dir = mkdtempSync(join(tmpdir(), 'nexusdi-toolchains-'));
const results = [];
let failed = false;

try {
  console.log('Packing @nexusdi/core…');
  rmSync(join(ROOT, 'libs/core/dist'), { recursive: true, force: true });
  run('npx', ['nx', 'run', 'core:build', '--skip-nx-cache'], ROOT);
  run('npm', ['pack', '--pack-destination', dir], join(ROOT, 'libs/core'));
  const [tarball] = readdirSync(dir).filter((f) => f.endsWith('.tgz'));

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
  run(
    'npm',
    ['install', '--silent', '--no-audit', '--no-fund', `./${tarball}`, ...pins],
    dir,
  );

  for (const toolchain of toolchains) {
    const version = toolchain.version ?? process.versions.node;
    for (const variant of variants) {
      const cell = { toolchain: toolchain.id, version, variant };
      if (variant === 'decorated' && !toolchain.decorators) {
        results.push({ ...cell, result: 'unsupported', note: toolchain.note });
        continue;
      }
      try {
        const printed = JSON.parse(recipes[toolchain.id](dir, variant));
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
