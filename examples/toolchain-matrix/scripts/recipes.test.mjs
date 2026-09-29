import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildCommand, readToolchains, runtimeFor } from './recipes.mjs';

const configs = {
  rootDir: 'src',
  tsconfig: 'tsconfig.matrix.json',
  swcrc: '.swcrc',
  babelrc: 'babel.config.json',
  viteConfig: 'vite.matrix.config.mjs',
};

test('every pinned toolchain has a recipe', () => {
  for (const t of readToolchains()) assert.ok(runtimeFor(t.id));
});

test('bun and deno run on their own runtimes', () => {
  assert.equal(runtimeFor('bun'), 'bun');
  assert.equal(runtimeFor('deno'), 'deno');
  assert.equal(runtimeFor('tsc'), 'node');
});

test('load-time toolchains have no build step', () => {
  assert.equal(buildCommand('deno', '/tmp/x', 'src/main.ts', configs), null);
  assert.equal(
    buildCommand('node-strip-types', '/tmp/x', 'src/main.ts', configs),
    null,
  );
  assert.ok(buildCommand('esbuild', '/tmp/x', 'src/main.ts', configs));
});

test('an unknown toolchain throws', () => {
  assert.throws(() => runtimeFor('rspack'), /unknown toolchain rspack/);
});
