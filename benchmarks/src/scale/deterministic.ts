/**
 * results/scale.json (scale spec 8.1): the descriptor and hash of every
 * generated graph, the outcome of every documented library-variant on
 * every covered graph, and the bundle bytes of `mixed` with the marginal
 * bytes per provider. Deterministic: no timestamp, sorted, rounded.
 *
 *   node src/scale/deterministic.ts                  writes results/scale.json
 *   node src/scale/deterministic.ts --check          also fails when the file changed
 *   node src/scale/deterministic.ts --only=a,b       those libraries, written to tmp/
 *   node src/scale/deterministic.ts --sizes=50,200   those sizes, written to tmp/
 *   node src/scale/deterministic.ts --shapes=mixed   those shapes, written to tmp/
 *
 * Cells run four at a time.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { build, version as esbuildVersion } from 'esbuild';

import {
  onlyArg,
  selectLibraries,
  shapesArg,
  sizesArg,
  withConsumer,
  writeResult,
} from '../cli.ts';
import { tslibVersion } from '../consumer.ts';
import type { Library } from '../libraries.ts';
import { versionsOf } from '../matrix.ts';
import type {
  ScaleCell,
  ScaleFile,
  ScaleGraphRow,
  ScalePerProvider,
  ScaleSizeRow,
  Variant,
} from '../schema.ts';
import { pool, scaleCell } from './cells.ts';
import {
  GRAPH_SEED,
  PER_PROVIDER,
  SHAPES,
  SIZES,
  type Shape,
  type Size,
} from './config.ts';
import { describeGraph } from './graph.ts';
import { graphOf } from './shapes.ts';

/** Rounds to 0.01, so the file is identical across machines whose last bits differ. */
export const round2 = (x: number) => Math.round(x * 100) / 100;

/** The two sizes the marginal bytes per provider come from (ruling 11). */
const { from: FROM, to: TO } = PER_PROVIDER;

/**
 * (bytes at 5,000 - bytes at 1,000) / 4,000 for each library-variant with
 * both rows, minified and gzip: one more provider's bytes, with the
 * library's fixed size out of the figure.
 */
export function perProvider(rows: readonly ScaleSizeRow[]): ScalePerProvider[] {
  const out: ScalePerProvider[] = [];
  for (const lo of rows.filter((r) => r.size === FROM)) {
    const hi = rows.find(
      (r) =>
        r.size === TO && r.library === lo.library && r.variant === lo.variant,
    );
    if (hi === undefined) continue;
    for (const bytes of ['minified', 'gzip'] as const)
      out.push({
        library: lo.library,
        variant: lo.variant,
        shape: 'mixed',
        bytes,
        perProvider: round2((hi[bytes] - lo[bytes]) / (TO - FROM)),
      });
  }
  return out;
}

/**
 * The graphs whose cells a run compiles and verifies: every shape at 50,
 * 200 and 1,000, and `mixed` alone at 5,000 (scale spec 8.1). Equivalence
 * at 5,000 for the other shapes is left to the timing job, which verifies
 * every cell it times. Shapes keep the order asked for, sizes too.
 */
export function coverage(
  shapes: readonly Shape[],
  sizes: readonly Size[],
): Array<{ shape: Shape; size: Size }> {
  return shapes.flatMap((shape) =>
    sizes
      .filter((size) => size !== TO || shape === 'mixed')
      .map((size) => ({ shape, size })),
  );
}

const byShape = (a: Shape, b: Shape) => SHAPES.indexOf(a) - SHAPES.indexOf(b);
const byLibrary = (
  a: { library: string; variant: Variant },
  b: { library: string; variant: Variant },
) => a.library.localeCompare(b.library) || a.variant.localeCompare(b.variant);

/** The file, sorted: shapes in SHAPES order, libraries and variants by id. */
export function assembleScale(parts: {
  versions: ScaleFile['versions'];
  graphs: readonly ScaleGraphRow[];
  cells: readonly ScaleCell[];
  sizes: readonly ScaleSizeRow[];
}): ScaleFile {
  const sizes = [...parts.sizes].sort(
    (a, b) => byLibrary(a, b) || a.size - b.size,
  );
  return {
    schema: 1,
    versions: parts.versions,
    graphSeed: GRAPH_SEED,
    graphs: [...parts.graphs].sort(
      (a, b) => byShape(a.shape, b.shape) || a.size - b.size,
    ),
    cells: [...parts.cells].sort(
      (a, b) => byLibrary(a, b) || byShape(a.shape, b.shape) || a.size - b.size,
    ),
    sizes,
    perProvider: perProvider(sizes),
  };
}

/**
 * The bundle entry of the bytes figure: it imports tsc's app.js, builds
 * the container and keeps the target on globalThis, so no bundler drops
 * the graph (scale spec 6.3).
 */
function sizeEntry(modulePath: string): string {
  return [
    `import { scale } from './${modulePath}';`,
    '',
    'const handle = await scale.create();',
    'globalThis.__scale = scale.get(handle, scale.target);',
    '',
  ].join('\n');
}

/** Minified and gzip bytes of the cell, library included, core D12's esbuild flags. */
async function bundleBytes(
  cellDir: string,
  modulePath: string,
): Promise<{ minified: number; gzip: number }> {
  const entry = join(cellDir, 'size-entry.mjs');
  const outfile = join(cellDir, 'size-bundle.mjs');
  writeFileSync(entry, sizeEntry(modulePath));
  // Core D12: --bundle --minify --format=esm, esbuild's default platform,
  // as size.ts bundles Meridian-8.
  await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    outfile,
    logLevel: 'silent',
  });
  const bytes = readFileSync(outfile);
  return {
    minified: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
  };
}

/** A library's documented variant: the only one the scale suite measures (decision 4). */
export function documentedVariant(lib: Library): Variant {
  const entry = Object.entries(lib.variants).find(
    ([, v]) => v.documented === true,
  );
  if (entry === undefined)
    throw new Error(`${lib.id} has no documented variant`);
  return entry[0] as Variant;
}

async function runScale(opts: {
  only?: Library['id'][];
  sizes?: readonly Size[];
  shapes?: readonly Shape[];
}): Promise<ScaleFile> {
  const libraries = selectLibraries(opts.only);
  const shapes = opts.shapes ?? SHAPES;
  const sizes = opts.sizes ?? SIZES;
  const graphs = shapes.flatMap((shape) =>
    sizes.map((size) => graphOf(shape, size)),
  );
  const covered = coverage(shapes, sizes);
  const jobs = libraries
    .flatMap((lib) =>
      covered.map((c) => ({ lib, variant: documentedVariant(lib), ...c })),
    )
    // Largest first, so a 5,000-provider compile never starts last and
    // runs alone.
    .sort((a, b) => b.size - a.size);
  const cells: ScaleCell[] = [];
  const bytes: ScaleSizeRow[] = [];
  await withConsumer(libraries, (dir) =>
    pool(jobs, async ({ lib, variant, shape, size }) => {
      const graph = graphs.find((g) => g.shape === shape && g.size === size);
      if (graph === undefined) throw new Error(`no ${shape} graph at ${size}`);
      const result = await scaleCell(dir, lib, variant, graph);
      const cell: ScaleCell = {
        library: lib.id,
        variant,
        shape,
        size,
        outcome: result.outcome,
      };
      if (result.message !== undefined) cell.message = result.message;
      cells.push(cell);
      // Bytes only for a cell that builds the graph: a failing app's
      // bundle says nothing about the library at that size.
      if (
        shape === 'mixed' &&
        result.outcome === 'pass' &&
        result.cellDir !== undefined &&
        result.modulePath !== undefined
      ) {
        const b = await bundleBytes(result.cellDir, result.modulePath);
        bytes.push({ library: lib.id, variant, shape, size, ...b });
      }
      if (result.cellDir !== undefined)
        rmSync(result.cellDir, { recursive: true, force: true });
      console.log(
        `  ${lib.id} ${variant} ${shape} ${size}: ${result.outcome}${
          result.message === undefined ? '' : ` (${result.message})`
        }`,
      );
    }),
  );
  return assembleScale({
    versions: {
      ...versionsOf(),
      bundlers: { esbuild: esbuildVersion },
      tslib: tslibVersion(),
    },
    graphs: graphs.map(describeGraph),
    cells,
    sizes: bytes,
  });
}

if (import.meta.main) {
  const only = onlyArg();
  const sizes = sizesArg();
  const shapes = shapesArg();
  writeResult(
    'scale',
    await runScale({ only, sizes, shapes }),
    only !== undefined || sizes !== undefined || shapes !== undefined,
  );
}
