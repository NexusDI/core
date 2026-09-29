/**
 * Bundle sizes and emit counts (spec 4.7, 4.9). Per library-variant: the
 * tsc build of Meridian-8 bundled with esbuild (core D12's flags) and with
 * Rollup, minified and gzipped at level 9, with the polyfill's share, and
 * whether the bundle still passes the scenario. Then scale-200 compiled
 * with tsc and counted.
 *
 *   node src/size.ts              writes results/size.json
 *   node src/size.ts --check      also fails when the file changed
 *   node src/size.ts --only=a,b   those libraries, written to tmp/
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import { build, version as esbuildVersion } from 'esbuild';
import { rollup, VERSION as rollupVersion } from 'rollup';

import { compile } from '@nexusdi/toolchain-matrix/recipes';

import { makeCell, prepareConsumer } from './consumer.ts';
import { countEmit } from './emit.ts';
import {
  BENCHMARKS,
  FIXTURES,
  configsFor,
  readLibraries,
  type Library,
} from './libraries.ts';
import { versionsOf } from './matrix.ts';
import { classify } from './outcome.ts';
import { countImports, generateScale } from './scale.ts';
import {
  LIBRARIES,
  validate,
  type EmitRow,
  type LibraryId,
  type SizeFile,
  type SizeRow,
  type Variant,
} from './schema.ts';
import { bundleRunner, sizeEntry } from './size-entry.ts';

type Bundler = 'esbuild' | 'rollup';

const golden = JSON.parse(
  readFileSync(join(FIXTURES, 'golden.json'), 'utf8'),
) as Parameters<typeof classify>[2];

/** Bundles `entry` to `outfile`, minified ESM, and returns the bytes. */
async function bundle(
  bundler: Bundler,
  entry: string,
  outfile: string,
): Promise<Buffer> {
  if (bundler === 'esbuild') {
    // Core D12: --bundle --minify --format=esm, esbuild's default platform.
    await build({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: 'esm',
      outfile,
      logLevel: 'silent',
    });
  } else {
    const b = await rollup({
      input: entry,
      plugins: [nodeResolve({ browser: true }), terser()],
      onwarn: () => undefined,
    });
    await b.write({ file: outfile, format: 'es', inlineDynamicImports: true });
    await b.close();
  }
  return readFileSync(outfile);
}

const gzip = (buf: Buffer) => gzipSync(buf, { level: 9 }).length;

/** The gzip bytes the library's polyfill alone bundles to, 0 without one. */
async function polyfillGzip(
  cellDir: string,
  bundler: Bundler,
  polyfill: string | null,
): Promise<number> {
  if (polyfill === null) return 0;
  const name = polyfill.slice(0, polyfill.lastIndexOf('@'));
  const entry = join(cellDir, 'polyfill-entry.mjs');
  writeFileSync(entry, `import '${name}';\n`);
  return gzip(
    await bundle(bundler, entry, join(cellDir, `polyfill-${bundler}.mjs`)),
  );
}

/** Runs scenario.mjs on a bundle and classifies what it printed. */
function runs(dir: string, cellDir: string, bundleFile: string) {
  const runner = join(cellDir, `run-${bundleFile}`);
  writeFileSync(runner, bundleRunner(bundleFile));
  const r = spawnSync(process.execPath, [join(dir, 'scenario.mjs'), runner], {
    cwd: cellDir,
    encoding: 'utf8',
    timeout: 60_000,
  });
  let printed: Record<string, unknown> | null = null;
  try {
    printed = JSON.parse(r.stdout.trim().split('\n').at(-1) ?? '') as Record<
      string,
      unknown
    >;
  } catch {
    printed = null;
  }
  return classify(printed, printed === null ? 'no output' : null, golden)
    .outcome;
}

async function sizesOf(
  dir: string,
  lib: Library,
  variant: Variant,
): Promise<SizeRow[]> {
  const spec = lib.variants[variant];
  if (spec === undefined) throw new Error(`${lib.id} has no ${variant}`);
  const cellDir = makeCell(
    dir,
    `size-${lib.id}-${variant}`,
    join(FIXTURES, lib.id, `${variant}.ts`),
    spec.profile,
  );
  const modulePath = compile(
    'tsc',
    cellDir,
    'src/main.ts',
    configsFor(spec.profile, 'tsc'),
  );
  const entry = join(cellDir, 'size-entry.mjs');
  writeFileSync(entry, sizeEntry(modulePath));
  const rows: SizeRow[] = [];
  for (const bundler of ['esbuild', 'rollup'] as const) {
    const file = `bundle-${bundler}.mjs`;
    const min = await bundle(bundler, entry, join(cellDir, file));
    rows.push({
      library: lib.id,
      variant,
      bundler,
      minified: min.length,
      gzip: gzip(min),
      polyfillGzip: await polyfillGzip(cellDir, bundler, lib.polyfill),
      runs: runs(dir, cellDir, file),
    });
  }
  rmSync(cellDir, { recursive: true, force: true });
  return rows;
}

/** Every .js file under `dir`, with its path relative to it. */
function emitted(dir: string): Array<{ path: string; text: string }> {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => ({ path: f, text: readFileSync(join(dir, f), 'utf8') }));
}

function emitOf(dir: string, lib: Library, variant: Variant): EmitRow {
  const spec = lib.variants[variant];
  if (spec === undefined) throw new Error(`${lib.id} has no ${variant}`);
  const cellDir = makeCell(
    dir,
    `emit-${lib.id}-${variant}`,
    join(FIXTURES, lib.id, `${variant}.ts`),
    spec.profile,
  );
  const sources = generateScale(lib.id, variant, join(cellDir, 'src'));
  const configs = configsFor(spec.profile, 'tsc');
  const main = compile('tsc', cellDir, 'src/main.ts', configs);
  const outDir = join(cellDir, dirname(main));
  const counts = countEmit(
    emitted(outDir),
    countImports(sources.map((s) => readFileSync(s, 'utf8'))),
  );
  rmSync(cellDir, { recursive: true, force: true });
  return {
    library: lib.id,
    variant,
    fixture: 'scale-200',
    toolchain: 'tsc',
    ...counts,
  };
}

export async function runSize(opts: { only?: LibraryId[] }): Promise<SizeFile> {
  const libraries = readLibraries()
    .libraries.filter(
      (l) => opts.only === undefined || opts.only.includes(l.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const dir = prepareConsumer({ libraries: libraries.map((l) => l.id) });
  const sizes: SizeRow[] = [];
  const emit: EmitRow[] = [];
  try {
    for (const lib of libraries)
      for (const variant of (Object.keys(lib.variants) as Variant[]).sort()) {
        for (const row of await sizesOf(dir, lib, variant)) {
          sizes.push(row);
          console.log(
            `  ${lib.id} ${variant} ${row.bundler}: ${row.gzip} B gzip (${row.polyfillGzip} polyfill), ${row.runs}`,
          );
        }
        const row = emitOf(dir, lib, variant);
        emit.push(row);
        console.log(
          `  ${lib.id} ${variant} scale-200: ${row.emittedBytes} B, ${row.decorateCalls} __decorate, ${row.metadataCalls} __metadata`,
        );
      }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return {
    schema: 1,
    versions: {
      ...versionsOf(),
      bundlers: { esbuild: esbuildVersion, rollup: rollupVersion },
    },
    sizes,
    emit,
  };
}

if (import.meta.main) {
  const check = process.argv.includes('--check');
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg
    ?.slice('--only='.length)
    .split(',')
    .filter((id): id is LibraryId =>
      (LIBRARIES as readonly string[]).includes(id),
    );
  const file = await runSize({ only });
  const where = only === undefined ? 'results' : 'tmp';
  validate('size', file, where);
  mkdirSync(join(BENCHMARKS, where), { recursive: true });
  const out = join(BENCHMARKS, where, 'size.json');
  const text = JSON.stringify(file, null, 2) + '\n';
  const committed = existsSync(out) ? readFileSync(out, 'utf8') : '';
  writeFileSync(out, text);
  console.log(`Wrote ${out}`);
  if (check && committed !== text) {
    console.error('size.json changed. Commit the file the run wrote.');
    process.exit(1);
  }
}
