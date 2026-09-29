#!/usr/bin/env node
/**
 * Core's ESM gzip size by the one method spec §12.4 fixes (D12): an ESM
 * consumer (examples/size), esbuild --bundle --minify --format=esm, gzip
 * level 9. Each package's figure is its fixture minus core's.
 *
 *   node scripts/size-report.mjs [--root <dir>] [--json <file>]
 *     [--record <step>] [--skip-build]
 *
 * --root measures another checkout (the workflow's merge base) with this
 * script's fixture when that checkout has none.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    json: { type: 'string' },
    record: { type: 'string' },
    'skip-build': { type: 'boolean' },
  },
});
const HERE = resolve(import.meta.dirname, '..');
const ROOT = resolve(values.root ?? HERE);

const libs = readdirSync(join(ROOT, 'libs')).filter((dir) =>
  existsSync(join(ROOT, 'libs', dir, 'package.json')),
);
const names = libs.map(
  (dir) =>
    JSON.parse(readFileSync(join(ROOT, 'libs', dir, 'package.json'), 'utf8'))
      .name,
);

if (!values['skip-build'])
  execFileSync(
    'npx',
    ['nx', 'run-many', '-t', 'build', '-p', ...names, '--skip-nx-cache'],
    { cwd: ROOT, stdio: 'inherit' },
  );

let fixture = join(ROOT, 'examples', 'size', 'src');
if (!existsSync(fixture)) {
  // Inside the root's node_modules, so '@nexusdi/*' resolves to its packages.
  fixture = join(ROOT, 'node_modules', '.size-fixture');
  cpSync(join(HERE, 'examples', 'size', 'src'), fixture, { recursive: true });
  writeFileSync(join(fixture, 'package.json'), '{ "type": "module" }');
}

async function gzipOf(file) {
  const result = await build({
    entryPoints: [join(fixture, file)],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    write: false,
    absWorkingDir: ROOT,
    logLevel: 'silent',
  });
  return gzipSync(result.outputFiles[0].contents, { level: 9 }).length;
}

const core = await gzipOf('core.ts');
const packages = {};
for (const dir of libs) {
  if (dir === 'core' || !existsSync(join(fixture, `${dir}.ts`))) continue;
  packages[dir] = (await gzipOf(`${dir}.ts`)) - core;
}
const sizes = { core, packages };
console.log(JSON.stringify(sizes, null, 2));
if (values.json) writeFileSync(values.json, JSON.stringify(sizes));

if (values.record) {
  const file = join(HERE, 'examples', 'size', 'consolidation.json');
  const history = JSON.parse(readFileSync(file, 'utf8'));
  // A step measured and not kept left no code behind, so the delta compares
  // against the last kept record.
  const last = history.findLast((record) => record.kept);
  history.push({
    step: values.record,
    core,
    delta: last === undefined ? 0 : core - last.core,
    kept: true,
  });
  writeFileSync(file, `${JSON.stringify(history, null, 2)}\n`);
}
