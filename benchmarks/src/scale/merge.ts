/**
 * Merges the parts of a scale run (scale spec 10.2): one part per shape and
 * one for the steady get-cycle, each made by its own job. A part is
 * published only as one file, so the merge refuses unless every part came
 * from the same run: same sha, seed, graph seed, core, versions and
 * scale.json, graph hashes that match scale.json, every shape once, the
 * steady part once and the same `mixed` bundles in the steady part as in the
 * `mixed` part, since get-cycle and startup must time the same code.
 */
import { createHash } from 'node:crypto';

import type {
  Design,
  LibraryId,
  ScaleCell,
  ScaleFile,
  ScaleBlockInfo,
  ScaleGrowth,
  ScaleMarginal,
  ScaleTimingRow,
  ScaleTimingsFile,
  Variant,
} from '../schema.ts';
import { SHAPES, type Shape } from './config.ts';

/** The SHA-256 of one built `mixed` bundle. */
export interface BundleHash {
  library: LibraryId;
  variant: Variant;
  shape: Shape;
  size: number;
  sha256: string;
}

/** What one job writes: the part of a timing file its blocks produced. */
export interface ScalePart {
  part: Shape | 'steady';
  sha: string;
  startedAt: string;
  versions: ScaleTimingsFile['versions'];
  seed: number;
  graphSeed: number;
  /** SHA-256 of the scale.json the job validated against. */
  scaleSha256: string;
  /** The child protocol of the part's fresh-process block. */
  protocol: ScaleTimingsFile['design']['protocol'];
  coreRef: ScaleTimingsFile['coreRef'];
  graphs: ScaleTimingsFile['graphs'];
  cells: ScaleCell[];
  blocks: ScaleBlockInfo[];
  design: {
    'fresh-process'?: { shape: Shape; design: Design };
    'steady-get'?: Design;
  };
  results: ScaleTimingRow[];
  growth: ScaleGrowth[];
  marginal: ScaleMarginal[];
  /** The `mixed` bundles the part timed. */
  bundles: BundleHash[];
}

/**
 * The SHA-256 of a built bundle with the path comments esbuild writes
 * (`// tmp/<consumer>/cells/<cell>/out/tsc/src/app.js` for the app and
 * `// ../../node_modules/tslib/tslib.es6.mjs` for a bundled package) reduced
 * to the file below out/tsc or node_modules, so two jobs that build the same
 * cell in different consumer directories hash alike.
 */
export function bundleSha256(text: string): string {
  const normal = text
    .replace(/^\/\/ \S*\/out\/tsc\/(\S*)$/gm, '// $1')
    .replace(/^\/\/ (?:\S*\/)?node_modules\/(\S*)$/gm, '// node_modules/$1');
  return createHash('sha256').update(normal).digest('hex');
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Fields that every part of a run shares. */
const SHARED = [
  'sha',
  'seed',
  'graphSeed',
  'coreRef',
  'versions',
  'scaleSha256',
  'protocol',
] as const;

export function mergeParts(
  parts: readonly ScalePart[],
  opts: {
    scale: ScaleFile;
    scaleSha256: string;
    /** A local run of some shapes: they need not all be there, nor the steady part. */
    partial?: boolean;
    /** The steady-get design a partial run without a steady part records. */
    steadyFallback?: Design;
  },
): { file: ScaleTimingsFile } {
  const problems: string[] = [];
  const first = parts[0];
  if (first === undefined) throw new Error('merge refused: no parts');

  for (const p of parts) {
    for (const field of SHARED)
      if (!same(p[field], first[field]))
        problems.push(
          `${p.part} differs from ${first.part} in ${field}: ${JSON.stringify(p[field])} against ${JSON.stringify(first[field])}`,
        );
    if (p.scaleSha256 !== opts.scaleSha256)
      problems.push(
        `${p.part} validated against a scale.json with SHA-256 ${p.scaleSha256}, the merge job has ${opts.scaleSha256}`,
      );
    for (const g of p.graphs) {
      const s = opts.scale.graphs.find(
        (x) => x.shape === g.shape && x.size === g.size,
      );
      if (s === undefined)
        problems.push(
          `${p.part}: graph ${g.shape} ${g.size} is not in scale.json`,
        );
      else if (s.hash !== g.hash)
        problems.push(
          `${p.part}: graph ${g.shape} ${g.size} has hash ${g.hash}, scale.json has ${s.hash}`,
        );
    }
  }

  for (const name of [...SHAPES, 'steady'] as const) {
    const n = parts.filter((p) => p.part === name).length;
    if (n === 0 && opts.partial !== true)
      problems.push(`the ${name} part is missing`);
    if (n > 1) problems.push(`the ${name} part appears twice`);
  }

  const mixed = parts.find((p) => p.part === 'mixed');
  const steady = parts.find((p) => p.part === 'steady');
  if (mixed !== undefined && steady !== undefined)
    for (const b of steady.bundles) {
      const built = mixed.bundles.find(
        (x) =>
          x.library === b.library &&
          x.variant === b.variant &&
          x.size === b.size,
      );
      const name = `${b.library}/${b.variant} ${b.shape} ${b.size}`;
      if (built === undefined)
        problems.push(
          `steady times ${name}, which the mixed part did not build`,
        );
      else if (built.sha256 !== b.sha256)
        problems.push(
          `steady times a ${name} bundle (${b.sha256}) that differs from the one the mixed part built (${built.sha256})`,
        );
    }

  // The steady part builds the same `mixed` cells; it must have judged them alike.
  if (mixed !== undefined && steady !== undefined)
    for (const c of steady.cells) {
      const m = mixed.cells.find(
        (x) =>
          x.library === c.library &&
          x.variant === c.variant &&
          x.shape === c.shape &&
          x.size === c.size,
      );
      if (m !== undefined && m.outcome !== c.outcome)
        problems.push(
          `steady judged ${c.library}/${c.variant} ${c.shape} ${c.size} as ${c.outcome}, the mixed part as ${m.outcome}`,
        );
    }

  if (problems.length > 0)
    throw new Error(`merge refused:\n  ${problems.join('\n  ')}`);

  const ordered = [...parts].sort(
    (a, b) =>
      (a.part === 'steady' ? SHAPES.length : SHAPES.indexOf(a.part)) -
      (b.part === 'steady' ? SHAPES.length : SHAPES.indexOf(b.part)),
  );
  const graphs = new Map<string, ScaleTimingsFile['graphs'][number]>();
  for (const p of ordered)
    for (const g of p.graphs) graphs.set(`${g.shape} ${g.size}`, g);
  const freshProcess: ScaleTimingsFile['design']['fresh-process'] = {};
  for (const p of ordered) {
    const d = p.design['fresh-process'];
    if (d !== undefined) freshProcess[d.shape] = d.design;
  }
  const steadyDesign = steady?.design['steady-get'] ?? opts.steadyFallback;
  if (steadyDesign === undefined)
    throw new Error('merge refused: the steady part has no steady-get design');
  const file: ScaleTimingsFile = {
    schema: 1,
    sha: first.sha,
    startedAt: [...parts].map((p) => p.startedAt).sort()[0] ?? first.startedAt,
    versions: first.versions,
    seed: first.seed,
    graphSeed: first.graphSeed,
    scaleSha256: first.scaleSha256,
    blocks: ordered.flatMap((p) => p.blocks),
    coreRef: first.coreRef,
    graphs: [...graphs.values()].sort(
      (a, b) =>
        SHAPES.indexOf(a.shape) - SHAPES.indexOf(b.shape) || a.size - b.size,
    ),
    // The steady part's cells are the mixed part's, built again.
    cells: ordered
      .filter((p) => p.part !== 'steady' || mixed === undefined)
      .flatMap((p) => p.cells)
      .sort(
        (a, b) =>
          a.library.localeCompare(b.library) ||
          a.variant.localeCompare(b.variant) ||
          SHAPES.indexOf(a.shape) - SHAPES.indexOf(b.shape) ||
          a.size - b.size,
      ),
    design: {
      'fresh-process': freshProcess,
      'steady-get': steadyDesign,
      protocol: first.protocol,
    },
    results: ordered.flatMap((p) => p.results),
    growth: ordered.flatMap((p) => p.growth),
    marginal: ordered.flatMap((p) => p.marginal),
  };
  return { file };
}
