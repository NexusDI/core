/**
 * One scale cell, from graph to outcome (scale spec sections 5 and 6.1):
 * render the library-variant's app into a cell of the consumer, compile it
 * with tsc and `importHelpers`, bundle the output into one ESM file with
 * every package but tslib external, and run verify-child.mjs on it. Cells
 * are independent, so `pool` runs four at once.
 */
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { build, type Plugin } from 'esbuild';

import { buildCommand, outputOf } from '@nexusdi/toolchain-matrix/recipes';

import { emptyCell } from '../consumer.ts';
import { configsFor, type Library } from '../libraries.ts';
import { classifyScale } from '../outcome.ts';
import type { Outcome, Profile, Variant } from '../schema.ts';
import { firstLine, stripPaths } from '../text.ts';
import { expectedDigest, type ScaleGraph } from './graph.ts';
import { rendererFor } from './render/index.ts';
import type { Files } from './render/shared.ts';

const run = promisify(execFile);
const VERIFY_CHILD = join(import.meta.dirname, 'verify-child.mjs');
const ENTRY = 'src/app.ts';

/** Runs `job` over `items`, at most `limit` at once; results keep input order. */
export async function pool<T, R>(
  items: readonly T[],
  job: (item: T, index: number) => Promise<R>,
  limit = 4,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await job(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/**
 * A consumer cell holding `files` under src/, the graph as graph.json and
 * the profile's tsconfig.json with `importHelpers` on.
 */
export function stageCell(
  dir: string,
  name: string,
  files: Files,
  graph: ScaleGraph,
  profile: Profile,
): string {
  const cellDir = emptyCell(dir, name, profile);
  for (const [file, text] of Object.entries(files))
    writeFileSync(join(cellDir, 'src', file), text);
  writeFileSync(join(cellDir, 'graph.json'), JSON.stringify(graph));
  const tsconfig = join(cellDir, 'tsconfig.json');
  const config = JSON.parse(readFileSync(tsconfig, 'utf8')) as {
    compilerOptions: Record<string, unknown>;
  };
  // tsc otherwise emits its decorator helpers once per file (spec 6.1).
  config.compilerOptions.importHelpers = true;
  writeFileSync(tsconfig, JSON.stringify(config, null, 2) + '\n');
  return cellDir;
}

/** A tsc failure, with the message a results file stores. */
class CompileError extends Error {}

/** Compiles the cell with tsc; returns the emitted app.js, relative to the cell. */
export async function compileCell(
  cellDir: string,
  profile: Profile,
): Promise<string> {
  const configs = configsFor(profile, 'tsc');
  const step = buildCommand('tsc', cellDir, ENTRY, configs);
  if (step === null) throw new Error('tsc has no build step');
  try {
    // Plain diagnostics whatever the caller's terminal, so the stored
    // message reproduces.
    await run(step.cmd, [...step.args, '--pretty', 'false'], {
      cwd: cellDir,
      encoding: 'utf8',
    });
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    throw new CompileError(firstLine(err.stderr || err.stdout || err.message));
  }
  return outputOf('tsc', ENTRY, configs);
}

/**
 * Leaves every bare import external except tslib: the library packages and
 * the polyfill load from node_modules as they would in an app, and tslib's
 * helpers join the app's code once.
 */
const packagesExternal: Plugin = {
  name: 'packages-external',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) =>
      args.path === 'tslib' || args.path.startsWith('tslib/')
        ? undefined
        : { path: args.path, external: true },
    );
  },
};

/** Bundles the compiled app into one unminified ESM file; returns its path. */
export async function bundleCell(
  cellDir: string,
  modulePath: string,
): Promise<string> {
  const outfile = join(cellDir, 'bundle.mjs');
  try {
    await build({
      entryPoints: [join(cellDir, modulePath)],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile,
      logLevel: 'silent',
      plugins: [packagesExternal],
    });
  } catch (e) {
    const err = e as { errors?: Array<{ text: string }>; message: string };
    throw new CompileError(err.errors?.[0]?.text ?? firstLine(err.message));
  }
  return outfile;
}

/** Runs verify-child.mjs on the bundle and classifies the line it printed. */
async function verifyCell(
  cellDir: string,
  bundle: string,
  graph: ScaleGraph,
): Promise<{ outcome: Outcome; message?: string }> {
  let stdout = '';
  let stderr = '';
  let code: number | string = 0;
  try {
    ({ stdout, stderr } = await run(
      process.execPath,
      [VERIFY_CHILD, bundle, join(cellDir, 'graph.json')],
      { cwd: cellDir, encoding: 'utf8', timeout: 600_000 },
    ));
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: number };
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
    code = err.code ?? 'killed';
  }
  let printed: Record<string, unknown>;
  try {
    printed = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as Record<
      string,
      unknown
    >;
  } catch {
    // The child died before it printed, a stack overflow on a deep graph
    // among the causes: the library failed at run time.
    printed = { error: firstLine(stderr) || `exit ${code}` };
  }
  return classifyScale(printed, null, expectedDigest(graph));
}

export interface CellResult {
  outcome: Outcome;
  message?: string;
  cellDir: string;
  /** The verified bundle, for the timed children. Absent on a compile error. */
  bundle?: string;
}

/** Stages, compiles, bundles and verifies one cell from its rendered files. */
export async function runCell(
  dir: string,
  name: string,
  files: Files,
  graph: ScaleGraph,
  profile: Profile,
): Promise<CellResult> {
  const cellDir = stageCell(dir, name, files, graph, profile);
  const failed = (outcome: Outcome, message: string): CellResult => ({
    outcome,
    message: stripPaths(message, cellDir),
    cellDir,
  });
  let bundle: string;
  try {
    bundle = await bundleCell(cellDir, await compileCell(cellDir, profile));
  } catch (e) {
    if (e instanceof CompileError) return failed('compile-error', e.message);
    throw e;
  }
  const { outcome, message } = await verifyCell(cellDir, bundle, graph);
  if (message !== undefined) return { ...failed(outcome, message), bundle };
  return { outcome, cellDir, bundle };
}

/** The scale cell of a library-variant on a graph, rendered by its renderer. */
export function scaleCell(
  dir: string,
  lib: Library,
  variant: Variant,
  graph: ScaleGraph,
): Promise<CellResult> {
  const spec = lib.variants[variant];
  if (spec === undefined) throw new Error(`${lib.id} has no ${variant}`);
  return runCell(
    dir,
    `scale-${lib.id}-${variant}-${graph.shape}-${graph.size}`,
    rendererFor(lib.id, variant)(graph),
    graph,
    spec.profile,
  );
}
