import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import { validate } from '../../../benchmarks/src/schema.ts';

/**
 * `docs:benchmark-data` (docs spec §4.6, benchmarks spec §4.11): reads
 * `benchmarks/results/`, validates each file with the harness's own
 * validator, and writes the tree every benchmark component and `<Figure of>`
 * path reads. Node 24 strips the types of the `.ts` import, the way the
 * harness itself runs.
 */

const WORKSPACE = join(import.meta.dirname, '../../..');
const OUTPUT = join(import.meta.dirname, '../generated/benchmark-data.json');
const FILES = ['matrix', 'probes', 'size', 'build'];
const RUN = /^\d{4}-\d{2}-\d{2}-[0-9a-f]{7}\.json$/;

/** `major.minor`: the line a page documents. */
function lineOf(version) {
  return version.split('-')[0].split('.').slice(0, 2).join('.');
}

function load(results, name, kind) {
  const path = join(results, name);
  if (!existsSync(path)) {
    throw new Error(
      `benchmarks/results/${name} is missing. Run \`npx nx run @nexusdi/benchmarks:bench\`, or merge the results pull request the bench-full job opened.`,
    );
  }
  const value = JSON.parse(readFileSync(path, 'utf8'));
  try {
    validate(kind, value, 'results');
  } catch (error) {
    throw new Error(
      `benchmarks/results/${name}: ${error.message}. benchmark-data.mjs reads what benchmarks/src/schema.ts declares; a new schema needs this reader updated with it.`,
    );
  }
  return value;
}

function put(tree, keys, value, file) {
  let node = tree;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  const last = keys.at(-1);
  if (last in node) {
    throw new Error(
      `benchmarks/results/${file} holds '${keys.join('.')}' twice. A writer emits each cell once.`,
    );
  }
  node[last] = value;
}

function omit(record, keys) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !keys.includes(key)),
  );
}

/** The libraries.json fields a page reads, keyed by id. Claims stay in phase 2. */
function indexLibraries(libraries, core) {
  return Object.fromEntries(
    libraries.map((library) => {
      const documented = Object.entries(library.variants)
        .filter(([, variant]) => variant.documented === true)
        .map(([name]) => name);
      if (documented.length !== 1) {
        throw new Error(
          `benchmarks/libraries.json: ${library.id} marks ${documented.length} variants documented. Mark exactly one.`,
        );
      }
      return [
        library.id,
        {
          package: library.package,
          version: library.version === 'workspace' ? core : library.version,
          docs: library.docs,
          polyfill: library.polyfill,
          documentedToolchains: library.documentedToolchains,
          documented: documented[0],
          notApplicable: library.notApplicable,
        },
      ];
    }),
  );
}

/** A file's identity for `<MeasuredWith />`: where it is and what measured it. */
function sourceOf(name, file, commitOf) {
  const path = `benchmarks/results/${name}`;
  return {
    path,
    commit: commitOf(path),
    versions: file.versions,
    ...('runner' in file
      ? {
          runner: file.runner,
          startedAt: file.startedAt,
          sha: file.sha,
          seed: file.seed,
        }
      : {}),
  };
}

/**
 * Reads, validates and indexes `results`. `coreVersion` is the version of
 * `libs/core/package.json`, and every file the pages render by default must
 * describe the same release line. `commitOf(path)` returns the commit that
 * holds a results file as it is on disk, or null.
 */
export function buildBenchmarkData({
  results,
  libraries,
  coreVersion,
  commitOf,
}) {
  const files = Object.fromEntries(
    FILES.map((kind) => [kind, load(results, `${kind}.json`, kind)]),
  );
  const dir = join(results, 'timings');
  const runs = existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => RUN.test(name))
        .sort()
        .map((name) => name.slice(0, -'.json'.length))
    : [];
  if (runs.length === 0) {
    throw new Error(
      'benchmarks/results/timings/ holds no <YYYY-MM-DD>-<sha7>.json file. Merge the results pull request the bench-full job opened, or run `npx nx run @nexusdi/benchmarks:bench`.',
    );
  }
  const timingFiles = Object.fromEntries(
    runs.map((run) => [run, load(results, `timings/${run}.json`, 'timings')]),
  );
  const newest = runs.at(-1);

  for (const [name, file] of [
    ...FILES.map((kind) => [`${kind}.json`, files[kind]]),
    [`timings/${newest}.json`, timingFiles[newest]],
  ]) {
    if (lineOf(file.versions.core) !== lineOf(coreVersion)) {
      throw new Error(
        `benchmarks/results/${name} measured @nexusdi/core ${file.versions.core}, and libs/core/package.json is ${coreVersion}. A ${lineOf(coreVersion)} page shows ${lineOf(coreVersion)} figures: merge the results pull request for ${coreVersion}, or run the harness against it.`,
      );
    }
  }

  const matrix = {};
  for (const cell of files.matrix.cells) {
    put(
      matrix,
      [cell.library, cell.variant, cell.toolchain],
      omit(cell, ['library', 'variant', 'toolchain']),
      'matrix.json',
    );
  }
  const probes = {};
  for (const row of files.probes.probes) {
    put(
      probes,
      [row.library, row.variant, row.probe],
      omit(row, ['library', 'variant', 'probe']),
      'probes.json',
    );
  }
  const size = {};
  for (const row of files.size.sizes) {
    put(
      size,
      [row.library, row.variant, row.bundler],
      omit(row, ['library', 'variant', 'bundler']),
      'size.json',
    );
  }
  const emit = {};
  for (const row of files.size.emit) {
    put(
      emit,
      [row.library, row.variant],
      omit(row, ['library', 'variant']),
      'size.json',
    );
  }
  const timings = {};
  for (const [run, file] of Object.entries(timingFiles)) {
    const tree = (timings[run] = {});
    for (const row of file.results) {
      put(
        tree,
        [row.library, row.variant, row.scenario],
        {
          ...row.stats,
          batch: row.batch,
          ...omit(row, [
            'library',
            'variant',
            'scenario',
            'stats',
            'batch',
            'toolchain',
          ]),
        },
        `timings/${run}.json`,
      );
    }
  }

  return {
    schema: 1,
    core: coreVersion,
    newest,
    sources: {
      matrix: sourceOf('matrix.json', files.matrix, commitOf),
      probes: sourceOf('probes.json', files.probes, commitOf),
      size: sourceOf('size.json', files.size, commitOf),
      build: sourceOf('build.json', files.build, commitOf),
      timings: Object.fromEntries(
        runs.map((run) => [
          run,
          sourceOf(`timings/${run}.json`, timingFiles[run], commitOf),
        ]),
      ),
    },
    libraries: indexLibraries(libraries, files.matrix.versions.core),
    matrix,
    probes,
    size,
    emit,
    timings,
    build: { ...files.build.build, headline: files.build.headline },
  };
}

/**
 * The commit that holds `path` as the working tree has it, or null when the
 * file is new or edited (a local run). The results link points at it.
 * `build-site.mjs` copies main's results into the tag tree, where git sees
 * them as changed, so it sets BENCHMARK_COMMITS_FROM to main's checkout.
 */
export function gitCommit(root) {
  return (path) => {
    try {
      const git = (...args) =>
        execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
      if (git('status', '--porcelain', '--', path) !== '') return null;
      return git('log', '-1', '--format=%H', '--', path) || null;
    } catch {
      return null;
    }
  };
}

/** The tree for the workspace at `root`, as the build writes it. */
export function readBenchmarkData(root = WORKSPACE) {
  return buildBenchmarkData({
    results: join(root, 'benchmarks/results'),
    libraries: JSON.parse(
      readFileSync(join(root, 'benchmarks/libraries.json'), 'utf8'),
    ).libraries,
    coreVersion: JSON.parse(
      readFileSync(join(root, 'libs/core/package.json'), 'utf8'),
    ).version,
    commitOf: gitCommit(process.env.BENCHMARK_COMMITS_FROM || root),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const data = readBenchmarkData();
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(data)}\n`);
  console.log(
    `wrote ${relative(WORKSPACE, OUTPUT)}: @nexusdi/core ${data.libraries.nexusdi?.version}, timings run ${data.newest}`,
  );
}
