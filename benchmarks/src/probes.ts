/**
 * The wiring-mistake probes of spec 4.6. Each probe is a fixture with one
 * mistake, type-checked with tsc --noEmit under its profile, built with tsc
 * whatever the check said, and run by probe-run.mjs. The row records where
 * the mistake first surfaced.
 *
 *   node src/probes.ts              writes results/probes.json
 *   node src/probes.ts --check      also fails when the file changed
 *   node src/probes.ts --only=a,b   those libraries, written to tmp/
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { compile, outputOf } from '@nexusdi/toolchain-matrix/recipes';

import { countReported, detectedAt } from './detect.ts';
import { makeCell, prepareConsumer } from './consumer.ts';
import {
  BENCHMARKS,
  FIXTURES,
  configsFor,
  readLibraries,
  type Library,
} from './libraries.ts';
import { versionsOf } from './matrix.ts';
import {
  LIBRARIES,
  PROBES,
  validate,
  type LibraryId,
  type ProbeRow,
  type ProbesFile,
  type Variant,
} from './schema.ts';
import { firstLine, stripPaths } from './text.ts';

/**
 * The two mistakes of two-mistakes, as every library's error names them:
 * NavCharts or awilix's `charts`, and PowerRouter or awilix's `router`.
 */
const TWO: readonly [string, string] = ['charts', 'router'];

interface Run {
  loadError: string | null;
  readyError: string | null;
  resolveError: string | null;
}

function runProbe(
  dir: string,
  lib: Library,
  variant: Variant,
  probe: (typeof PROBES)[number],
): ProbeRow {
  const spec = lib.variants[variant];
  if (spec === undefined) throw new Error(`${lib.id} has no ${variant}`);
  const cellDir = makeCell(
    dir,
    `probe-${lib.id}-${variant}-${probe}`,
    join(FIXTURES, 'probes', lib.id, variant, `${probe}.ts`),
    spec.profile,
  );
  const configs = configsFor(spec.profile, 'tsc');
  const check = spawnSync(
    process.execPath,
    [
      join(cellDir, 'node_modules', 'typescript', 'bin', 'tsc'),
      '--noEmit',
      '-p',
      configs.tsconfig,
    ],
    { cwd: cellDir, encoding: 'utf8' },
  );
  const typecheckFailed = check.status !== 0;
  // tsc emits on type errors (no profile sets noEmitOnError) and exits
  // non-zero, so a failed build still leaves a module to run.
  let buildError: string | null = null;
  try {
    compile('tsc', cellDir, 'src/main.ts', configs);
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    buildError = firstLine(err.stderr || err.stdout || err.message);
  }
  const modulePath = outputOf('tsc', 'src/main.ts', configs);
  const buildOk = existsSync(join(cellDir, modulePath));
  let run: Run = {
    loadError: buildOk ? null : buildError,
    readyError: null,
    resolveError: null,
  };
  if (buildOk) {
    const r = spawnSync(
      process.execPath,
      [join(dir, 'probe-run.mjs'), modulePath],
      { cwd: cellDir, encoding: 'utf8', timeout: 60_000 },
    );
    const line = r.stdout.trim().split('\n').at(-1) ?? '';
    try {
      run = JSON.parse(line) as Run;
    } catch {
      run.loadError = firstLine(r.stderr) || `exit ${r.status}`;
    }
  }
  const at = detectedAt({ typecheckFailed, buildOk, ...run });
  const row: ProbeRow = { library: lib.id, variant, probe, detectedAt: at };
  const raw = typecheckFailed
    ? firstLine(check.stdout || check.stderr)
    : (run.loadError ?? run.readyError ?? run.resolveError);
  if (probe === 'two-mistakes' && raw !== null && !typecheckFailed)
    row.reported = countReported(raw, TWO);
  if (raw !== null) {
    // The first message alone; a BlueprintError's later ones joined after " | ".
    const message = stripPaths(firstLine(raw.split(' | ')[0] ?? raw), cellDir);
    if (message !== '') row.message = message;
  }
  rmSync(cellDir, { recursive: true, force: true });
  return row;
}

export function runProbes(opts: { only?: LibraryId[] }): ProbesFile {
  const libraries = readLibraries()
    .libraries.filter(
      (l) => opts.only === undefined || opts.only.includes(l.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const dir = prepareConsumer({ libraries: libraries.map((l) => l.id) });
  const probes: ProbeRow[] = [];
  try {
    for (const lib of libraries)
      for (const variant of (Object.keys(lib.variants) as Variant[]).sort())
        for (const probe of [...PROBES].sort()) {
          const row =
            probe === 'captive-scoped' && lib.notApplicable.scoped !== undefined
              ? {
                  library: lib.id,
                  variant,
                  probe,
                  detectedAt: 'not-applicable' as const,
                }
              : runProbe(dir, lib, variant, probe);
          probes.push(row);
          console.log(
            `  ${row.detectedAt.padEnd(14)} ${lib.id} ${variant} ${probe}${
              row.reported === undefined ? '' : ` (reported ${row.reported})`
            }${row.message === undefined ? '' : `: ${row.message}`}`,
          );
        }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { schema: 1, versions: versionsOf(), probes };
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
  const file = runProbes({ only });
  const where = only === undefined ? 'results' : 'tmp';
  validate('probes', file, where);
  mkdirSync(join(BENCHMARKS, where), { recursive: true });
  const out = join(BENCHMARKS, where, 'probes.json');
  const text = JSON.stringify(file, null, 2) + '\n';
  const committed = existsSync(out) ? readFileSync(out, 'utf8') : '';
  writeFileSync(out, text);
  console.log(`Wrote ${out}`);
  if (check && committed !== text) {
    console.error('probes.json changed. Commit the file the run wrote.');
    process.exit(1);
  }
}
