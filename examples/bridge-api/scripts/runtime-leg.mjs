#!/usr/bin/env node
/**
 * Bundles an entry, test/runtime/smoke.ts unless --entry names another, to
 * one ESM file and runs it on the Deno or Bun on PATH, which must be the
 * version examples/toolchain-matrix/toolchains.json pins: this leg and the
 * toolchain matrix test one version of each runtime (spec 9.1). CI installs
 * it with setup-deno or setup-bun. The bundle keeps node:async_hooks
 * external: each runtime resolves it.
 *
 *   node scripts/runtime-leg.mjs --leg=deno|bun [--entry=<path>]
 *
 * The runtime-leg target runs smoke.ts, and e2e-growth runs
 * test/runtime/growth.ts.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { build } from 'esbuild';

import { reportsPin } from './runtime-version.mjs';

const { values } = parseArgs({
  options: {
    leg: { type: 'string' },
    entry: { type: 'string', default: 'test/runtime/smoke.ts' },
  },
});
const { leg, entry } = values;
if (leg !== 'deno' && leg !== 'bun') throw new Error('--leg=deno or --leg=bun');

const here = resolve(import.meta.dirname, '..');
const root = resolve(here, '../..');
const toolchains = JSON.parse(
  readFileSync(join(root, 'examples/toolchain-matrix/toolchains.json'), 'utf8'),
).toolchains;
const pinned = toolchains.find((t) => t.id === leg)?.version;
if (!pinned) throw new Error(`toolchains.json pins no ${leg}`);

const needs = `The runtime-leg and e2e-growth targets need ${leg} ${pinned}, the version toolchains.json pins, first on PATH.`;
let reported;
try {
  reported = execFileSync(leg, ['--version'], { encoding: 'utf8' });
} catch (error) {
  throw new Error(`${leg} --version failed: ${error.message}. ${needs}`);
}
if (!reportsPin(leg, reported, pinned))
  throw new Error(`${leg} on PATH reports ${reported.trim()}. ${needs}`);

const outfile = join(
  here,
  'tmp/runtime',
  `${basename(entry, extname(entry))}.mjs`,
);
await build({
  entryPoints: [join(here, entry)],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  external: ['node:async_hooks', 'node:stream'],
  mainFields: ['module', 'main'],
  outfile,
  logLevel: 'warning',
});

const args =
  leg === 'deno' ? ['run', '--allow-net', '--allow-env', outfile] : [outfile];
console.log(`Running the bridge API checks on ${leg} ${pinned}`);
execFileSync(leg, args, { stdio: 'inherit', cwd: here });
