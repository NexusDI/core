/**
 * Cold build times (spec 4.7, Build time). For one fixture, every build
 * cell (library-variant x toolchain with a build step, matrix outcome not
 * compile-error) is staged in its own directory and built once unmeasured.
 * Then each round builds every cell once, in the round's row of the
 * balanced square, timed from spawn to exit.
 *
 *   node src/build.ts --fixture=meridian-8 --out=a.json   one fixture's samples
 *   node src/build.ts --merge a.json b.json               writes results/build.json
 *   node src/build.ts                                     both fixtures, then merge
 *
 * --quick runs 3 rounds and writes under tmp/. --only=a,b limits the
 * libraries (NexusDI stays in, for the ratios) and writes under tmp/.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, totalmem, type } from 'node:os';
import { join } from 'node:path';

import {
  blockSize,
  pairedRatio,
  summarize,
  type PairedRatio,
} from '@nexusdi/bench-kit';
import {
  buildCommand,
  readToolchains,
  type Command,
} from '@nexusdi/toolchain-matrix/recipes';

import { headlineOf, planRounds } from './build-rounds.ts';
import { ROOT, prepareConsumer } from './consumer.ts';
import {
  BENCHMARKS,
  configsFor,
  readLibraries,
  type Library,
} from './libraries.ts';
import { versionsOf } from './matrix.ts';
import { generateScale } from './scale.ts';
import {
  LIBRARIES,
  validate,
  type BuildCell,
  type BuildFile,
  type BuildMeasure,
  type Design,
  type LibraryId,
  type Outcome,
  type Runner,
  type Variant,
} from './schema.ts';
import {
  argValue,
  fixtureCell,
  onlyArg,
  readMatrix,
  seedArg,
  selectLibraries,
} from './cli.ts';

export type Fixture = 'meridian-8' | 'scale-200';

/** One fixture's raw build times, the input of --merge. */
export interface BuildSamples {
  fixture: Fixture;
  seed: number;
  rounds: number;
  cells: Array<{
    library: LibraryId;
    variant: Variant;
    toolchain: string;
    outcome: Outcome;
    ms: number[];
  }>;
}

interface Staged {
  library: Library;
  variant: Variant;
  toolchain: string;
  outcome: Outcome;
  dir: string;
  step: Command;
  outDir: string;
}

/** Empties the build output and every tool cache before a cold build. */
function clean(cell: Staged): void {
  rmSync(join(cell.dir, cell.outDir), { recursive: true, force: true });
  // Vite's cache lives in node_modules/.vite, which every cell shares.
  rmSync(join(cell.dir, 'node_modules', '.vite'), {
    recursive: true,
    force: true,
  });
}

function buildOnce(cell: Staged): number {
  clean(cell);
  const t0 = process.hrtime.bigint();
  const r = spawnSync(cell.step.cmd, cell.step.args, {
    cwd: cell.dir,
    stdio: 'ignore',
    env: { ...process.env, BABEL_DISABLE_CACHE: '1' },
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (r.status !== 0)
    throw new Error(
      `${cell.library.id} ${cell.variant} ${cell.toolchain}: the build exited ${r.status}`,
    );
  return ms;
}

function stage(
  dir: string,
  fixture: Fixture,
  libraries: readonly Library[],
): Staged[] {
  const matrix = readMatrix();
  const toolchains = readToolchains();
  const staged: Staged[] = [];
  for (const cell of matrix.cells) {
    const library = libraries.find((l) => l.id === cell.library);
    if (library === undefined || cell.outcome === 'compile-error') continue;
    if (library.variants[cell.variant] === undefined) continue;
    const toolchain = toolchains.find((t) => t.id === cell.toolchain);
    if (toolchain === undefined) continue;
    const { cellDir, profile } = fixtureCell(
      dir,
      `build-${fixture}-${cell.library}-${cell.variant}-${cell.toolchain}`,
      library,
      cell.variant,
    );
    if (fixture === 'scale-200')
      generateScale(cell.library, cell.variant, join(cellDir, 'src'));
    const configs = configsFor(profile, cell.toolchain);
    const step = buildCommand(cell.toolchain, cellDir, 'src/main.ts', configs);
    if (step === null) {
      rmSync(cellDir, { recursive: true, force: true });
      continue;
    }
    // Every recipe writes under out/<toolchain>/, which clean() empties.
    staged.push({
      library,
      variant: cell.variant,
      toolchain: cell.toolchain,
      outcome: cell.outcome,
      dir: cellDir,
      step,
      outDir: 'out',
    });
  }
  return staged;
}

export function timeBuilds(opts: {
  fixture: Fixture;
  rounds: number;
  seed: number;
  only?: LibraryId[];
}): BuildSamples {
  const libraries = selectLibraries(opts.only, 'nexusdi');
  const dir = prepareConsumer({ libraries: libraries.map((l) => l.id) });
  try {
    const cells = stage(dir, opts.fixture, libraries);
    console.log(`${opts.fixture}: ${cells.length} cells, warming up…`);
    for (const cell of cells) buildOnce(cell);
    const ms = new Map<Staged, number[]>(cells.map((c) => [c, []]));
    planRounds(cells, opts.rounds, opts.seed).forEach((order, round) => {
      for (const cell of order) ms.get(cell)?.push(buildOnce(cell));
      console.log(`  round ${round + 1}/${opts.rounds}`);
    });
    return {
      fixture: opts.fixture,
      seed: opts.seed,
      rounds: opts.rounds,
      cells: cells
        .map((c) => ({
          library: c.library.id,
          variant: c.variant,
          toolchain: c.toolchain,
          outcome: c.outcome,
          ms: ms.get(c) ?? [],
        }))
        .sort(
          (a, b) =>
            a.library.localeCompare(b.library) ||
            a.variant.localeCompare(b.variant) ||
            a.toolchain.localeCompare(b.toolchain),
        ),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function design(rounds: number): Design {
  return {
    order: 'williams',
    warmup: 1,
    measured: rounds,
    bootstrap: {
      resamples: 10000,
      block: blockSize(rounds),
      prng: 'mulberry32',
    },
  };
}

export function runnerInfo(): Runner {
  return {
    os: type(),
    cpu: cpus()[0]?.model ?? 'unknown',
    cores: cpus().length,
    memoryGb: Math.round(totalmem() / 2 ** 30),
    hosted: process.env.GITHUB_ACTIONS === 'true',
  };
}

export function gitSha(): string {
  return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
}

/** Combines the two fixtures' samples into the BuildFile of spec 4.9. */
export function mergeBuilds(
  meridian: BuildSamples,
  scale: BuildSamples,
): BuildFile {
  if (meridian.seed !== scale.seed)
    throw new Error('the two fixtures ran with different seeds');
  const seed = scale.seed;
  const key = (c: { library: string; variant: string; toolchain: string }) =>
    `${c.library}/${c.variant}/${c.toolchain}`;
  const nexusPlain = (s: BuildSamples, toolchain: string) =>
    s.cells.find(
      (c) =>
        c.library === 'nexusdi' &&
        c.variant === 'plain' &&
        c.toolchain === toolchain,
    );
  const measure = (
    s: BuildSamples,
    c: BuildSamples['cells'][number],
  ): BuildMeasure => {
    const nexus = nexusPlain(s, c.toolchain);
    const m: BuildMeasure = summarize(c.ms);
    if (c.library !== 'nexusdi' && nexus !== undefined)
      m.vsNexus = pairedRatio(nexus.ms, c.ms, seed);
    return m;
  };
  const meridianByKey = new Map(meridian.cells.map((c) => [key(c), c]));
  const libraries = readLibraries().libraries;
  const build = Object.fromEntries(
    LIBRARIES.map((l) => [l, {}]),
  ) as BuildFile['build'];
  for (const c of scale.cells) {
    const m8 = meridianByKey.get(key(c));
    if (m8 === undefined) continue;
    const cell: BuildCell = {
      ...measure(scale, c),
      outcome: c.outcome,
      headline: false,
      'meridian-8': measure(meridian, m8),
    };
    (build[c.library][c.variant] ??= {})[c.toolchain] = cell;
  }

  const headline = {} as BuildFile['headline'];
  const headlineMs = new Map<LibraryId, number[]>();
  for (const lib of libraries) {
    const documented = Object.entries(lib.variants)
      .filter(([, v]) => v.documented === true)
      .map(([name]) => name as Variant);
    const candidates = scale.cells
      .filter((c) => c.library === lib.id && documented.includes(c.variant))
      .map((c) => ({ ...c, median: summarize(c.ms).median }));
    const best = headlineOf(lib, candidates);
    if (best === null) continue;
    const cell = build[lib.id][best.variant as Variant]?.[best.toolchain];
    if (cell !== undefined) cell.headline = true;
    headline[lib.id] = best as { variant: Variant; toolchain: string };
    const ms = candidates.find(
      (c) => c.variant === best.variant && c.toolchain === best.toolchain,
    )?.ms;
    if (ms !== undefined) headlineMs.set(lib.id, ms);
  }
  const nexusHeadline = headlineMs.get('nexusdi');
  for (const [id, ms] of headlineMs)
    if (id !== 'nexusdi' && nexusHeadline !== undefined)
      (headline[id] as { vsNexus?: PairedRatio }).vsNexus = pairedRatio(
        nexusHeadline,
        ms,
        seed,
      );

  return {
    schema: 1,
    sha: gitSha(),
    startedAt: new Date().toISOString(),
    versions: versionsOf(),
    runner: runnerInfo(),
    seed,
    design: {
      'meridian-8': design(meridian.rounds),
      'scale-200': design(scale.rounds),
    },
    build,
    headline,
  };
}

if (import.meta.main) {
  const quick = process.argv.includes('--quick');
  const only = onlyArg();
  const where = quick || only !== undefined ? 'tmp' : 'results';
  const rounds = quick ? 3 : 30;
  const seed = seedArg();
  const merge = process.argv.indexOf('--merge');
  let file: BuildFile;
  if (merge !== -1) {
    const [a, b] = process.argv
      .slice(merge + 1, merge + 3)
      .map((p) => JSON.parse(readFileSync(p, 'utf8')) as BuildSamples);
    if (a === undefined || b === undefined)
      throw new Error('--merge takes two sample files');
    const [m8, s200] = a.fixture === 'meridian-8' ? [a, b] : [b, a];
    file = mergeBuilds(m8, s200);
  } else {
    const fixture = argValue('fixture') as Fixture | undefined;
    if (fixture !== undefined) {
      const samples = timeBuilds({ fixture, rounds, seed, only });
      const out =
        argValue('out') ?? join(BENCHMARKS, 'tmp', `build-${fixture}.json`);
      mkdirSync(join(out, '..'), { recursive: true });
      writeFileSync(out, JSON.stringify(samples) + '\n');
      console.log(`Wrote ${out}`);
      process.exit(0);
    }
    file = mergeBuilds(
      timeBuilds({ fixture: 'meridian-8', rounds, seed, only }),
      timeBuilds({ fixture: 'scale-200', rounds, seed, only }),
    );
  }
  validate('build', file, where);
  mkdirSync(join(BENCHMARKS, where), { recursive: true });
  const out = join(BENCHMARKS, where, 'build.json');
  writeFileSync(out, JSON.stringify(file, null, 2) + '\n');
  console.log(`Wrote ${out}`);
}
