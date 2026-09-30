#!/usr/bin/env node
/**
 * Core's ESM gzip size by the one method spec §12.4 fixes (D12): an ESM
 * consumer (examples/size), esbuild --bundle --minify --format=esm, gzip
 * level 9. Each package's figure is its fixture minus core's. A package
 * with an error text pack at `./text` adds a `<dir>-text.ts` fixture, and
 * the report lists it as `<dir>/text`, also minus core.
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
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

export async function gzipOf(fixture, root, file) {
  const result = await build({
    entryPoints: [join(fixture, file)],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    write: false,
    absWorkingDir: root,
    logLevel: 'silent',
  });
  return gzipSync(result.outputFiles[0].contents, { level: 9 }).length;
}

// `swallow` is true only for `--root` (measuring another checkout, the
// workflow's merge base): that checkout's core can predate this fixture
// (the merge base of the first 0.4 pull request is core 0.3.1, which has
// no provide() or Token), so it reports no figure for the entry instead of
// failing the whole measurement (R22; size-compare.mjs reads the `null`).
// A pull request's own head (no `--root`) must always bundle; a failure
// there is the fixture, or core itself, breaking in that pull request, and
// has to fail the "Measure this pull request" step hard, not read as core
// having shrunk to nothing (reviewer finding, fix round 1).
export async function measure(fixture, root, file, swallow) {
  try {
    return await gzipOf(fixture, root, file);
  } catch (err) {
    if (swallow) return null;
    throw err;
  }
}

// Measures every package with a `<dir>.ts` or `<dir>-text.ts` fixture,
// each as its fixture minus `core`. A new package or pack needs only its
// fixture file. `core.ts` is the baseline itself, so core reports only its
// pack.
export async function measurePackages(fixture, root, libs, core, swallow) {
  const packages = {};
  for (const dir of libs) {
    for (const [name, file] of [
      [dir, `${dir}.ts`],
      [`${dir}/text`, `${dir}-text.ts`],
    ]) {
      if (name === 'core' || !existsSync(join(fixture, file))) continue;
      const size = await measure(fixture, root, file, swallow);
      packages[name] = size === null || core === null ? null : size - core;
    }
  }
  return packages;
}

async function main() {
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
  const swallow = Boolean(values.root);

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
    cpSync(join(HERE, 'examples', 'size', 'src'), fixture, {
      recursive: true,
    });
    writeFileSync(join(fixture, 'package.json'), '{ "type": "module" }');
  }

  const core = await measure(fixture, ROOT, 'core.ts', swallow);
  const packages = await measurePackages(fixture, ROOT, libs, core, swallow);
  const sizes = { core, packages };
  console.log(JSON.stringify(sizes, null, 2));
  if (values.json) writeFileSync(values.json, JSON.stringify(sizes));

  if (values.record) {
    if (core === null)
      throw new Error(
        'core.ts did not bundle, so there is no figure to record.',
      );
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
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
