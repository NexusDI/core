/**
 * The toolchain recipes of spec 3.3: how each pinned toolchain builds a
 * consumer's TypeScript, and which runtime runs the output. run-matrix.mjs
 * proves them on the packed packages; the benchmarks reuse them.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

const HERE = resolve(import.meta.dirname, '..');

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

export const readToolchains = () =>
  JSON.parse(readFileSync(join(HERE, 'toolchains.json'), 'utf8')).toolchains;

const RUNTIME = {
  tsc: 'node',
  tsgo: 'node',
  esbuild: 'node',
  swc: 'node',
  babel: 'node',
  vite: 'node',
  'vite8+babel-plugin': 'node',
  bun: 'bun',
  deno: 'deno',
  'node-strip-types': 'node',
};

export function runtimeFor(id) {
  const r = RUNTIME[id];
  if (r === undefined) throw new Error(`unknown toolchain ${id}`);
  return r;
}

const outDirOf = (id, entry) =>
  join('out', id.replace(/[^a-z0-9]+/gi, '-'), dirname(entry));
const jsOf = (outDir, rootDir, entry) =>
  join(outDir, relative(rootDir, entry)).replace(/\.ts$/, '.js');

/** The build step alone, for timing. null for toolchains that transpile at load. */
export function buildCommand(id, dir, entry, c) {
  const out = outDirOf(id, entry);
  switch (id) {
    case 'tsc':
    case 'tsgo': {
      const bin = binOf(
        dir,
        id === 'tsc' ? 'typescript' : 'typescript7',
        'tsc',
      );
      const args = ['-p', c.tsconfig, '--rootDir', c.rootDir, '--outDir', out];
      // A .js binary runs under this Node; any other is an executable.
      return /\.[cm]?js$/.test(bin)
        ? { cmd: process.execPath, args: [bin, ...args] }
        : { cmd: bin, args };
    }
    case 'esbuild':
      return {
        cmd: 'npx',
        args: [
          'esbuild',
          entry,
          '--bundle',
          '--platform=node',
          '--format=esm',
          '--target=es2022',
          '--packages=external',
          `--tsconfig=${c.tsconfig}`,
          `--outfile=${out}/${basename(entry, '.ts')}.mjs`,
        ],
      };
    case 'swc':
      return {
        cmd: 'npx',
        args: [
          'swc',
          c.rootDir,
          '-d',
          out,
          '--strip-leading-paths',
          '--config-file',
          c.swcrc,
        ],
      };
    case 'babel':
      return {
        cmd: 'npx',
        args: [
          'babel',
          c.rootDir,
          '--out-dir',
          out,
          '--extensions',
          '.ts',
          '--config-file',
          `./${c.babelrc}`,
        ],
      };
    case 'vite':
    case 'vite8+babel-plugin':
      return {
        cmd: 'npx',
        args: [
          'vite',
          'build',
          '--config',
          c.viteConfig,
          '--ssr',
          entry,
          '--outDir',
          out,
          '--emptyOutDir',
        ],
      };
    case 'bun':
      return {
        cmd: 'npx',
        args: [
          'bun',
          'build',
          entry,
          '--target=node',
          '--packages=external',
          `--tsconfig-override=${c.tsconfig}`,
          `--outfile=${out}/${basename(entry, '.ts')}.mjs`,
        ],
      };
    case 'deno':
    case 'node-strip-types':
      return null;
    default:
      throw new Error(`unknown toolchain ${id}`);
  }
}

/** Builds `entry` and returns the module the runtime loads, relative to `dir`. */
export function compile(id, dir, entry, c) {
  rmSync(join(dir, outDirOf(id, entry)), { recursive: true, force: true });
  const step = buildCommand(id, dir, entry, c);
  if (step !== null) run(step.cmd, step.args, dir);
  const out = outDirOf(id, entry);
  switch (id) {
    case 'tsc':
    case 'tsgo':
    case 'swc':
    case 'babel':
      return jsOf(out, c.rootDir, entry);
    case 'esbuild':
    case 'bun':
      return `${out}/${basename(entry, '.ts')}.mjs`;
    case 'vite':
    case 'vite8+babel-plugin':
      return `${out}/${basename(entry, '.ts')}.js`;
    default:
      return entry;
  }
}

/** The command that runs `modulePath` under the toolchain's runtime, from `dir`. */
export function runCommand(id, modulePath, c, args = []) {
  switch (runtimeFor(id)) {
    case 'bun':
      return { cmd: 'npx', args: ['bun', modulePath, ...args] };
    case 'deno':
      return {
        cmd: 'npx',
        args: [
          'deno',
          'run',
          '--allow-read',
          '--allow-env',
          '--allow-sys',
          '--node-modules-dir=manual',
          ...(c.denoConfig ? ['--config', c.denoConfig] : []),
          modulePath,
          ...args,
        ],
      };
    default:
      return { cmd: process.execPath, args: [modulePath, ...args] };
  }
}

/** Runs `modulePath` under the toolchain's runtime and returns its stdout. */
export function runModule(id, dir, modulePath, c, args = []) {
  const step = runCommand(id, modulePath, c, args);
  return run(step.cmd, step.args, dir);
}

export function packInto(dir, root, packages) {
  for (const [folder] of packages)
    run('npm', ['pack', '--pack-destination', dir], join(root, folder));
  return readdirSync(dir).filter((f) => f.endsWith('.tgz'));
}

export function installConsumer(dir, specs) {
  run('npm', ['install', '--silent', '--no-audit', '--no-fund', ...specs], dir);
}
