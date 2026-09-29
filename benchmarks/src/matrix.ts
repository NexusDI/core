/**
 * The matrix of spec 4.4: every library, variant and toolchain cell builds
 * its fixture with the variant's profile, runs scenario.mjs under the
 * cell's runtime, and classifies what it printed against golden.json.
 *
 *   node src/matrix.ts              writes results/matrix.json
 *   node src/matrix.ts --check      also fails when the file changed
 *   node src/matrix.ts --only=a,b   those libraries, written to tmp/
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import {
  compile,
  readToolchains,
  runCommand,
} from '@nexusdi/toolchain-matrix/recipes';

import { coreVersion, prepareConsumer } from './consumer.ts';
import {
  BENCHMARKS,
  FIXTURES,
  configsFor,
  readLibraries,
} from './libraries.ts';
import { classify } from './outcome.ts';
import {
  LIBRARIES,
  validate,
  type LibraryId,
  type MatrixCell,
  type MatrixFile,
  type Variant,
  type Versions,
} from './schema.ts';

const golden = JSON.parse(
  readFileSync(join(FIXTURES, 'golden.json'), 'utf8'),
) as Parameters<typeof classify>[2];

/**
 * The line of a tool's output that names the error: the first that says
 * "error", else the first non-empty one. Build durations are dropped, so
 * the file reproduces.
 */
function firstLine(text: string): string {
  const lines = stripVTControlCharacters(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const at = Math.max(
    lines.findIndex((l) => /error/i.test(l)),
    0,
  );
  // "error during build:" and the like put the error on the next line.
  let line = lines[at] ?? '';
  for (let next = at + 1; line.endsWith(':') && next < lines.length; next++)
    line = `${line} ${lines[next]}`;
  return line.replace(/ in \d+(?:\.\d+)?m?s\b/g, '');
}

/**
 * A message with the throwaway directory's paths and every line and column
 * number removed, so the file reproduces byte for byte.
 */
export function stripPaths(message: string, dir: string): string {
  let out = message;
  for (const path of new Set([dir, realpathSync(dir)]))
    out = out.split(path).join('<cell>');
  return out
    .replace(/(\.[cm]?[jt]s):\d+(?::\d+)?/g, '$1')
    .replace(/\((\d+),(\d+)\)/g, '')
    .replace(/[ \t]+$/, '');
}

/** Versions every results file records. */
export function versionsOf(): Versions {
  const core = coreVersion();
  const libraries = Object.fromEntries(
    readLibraries().libraries.map((l) => [
      l.id,
      l.id === 'nexusdi' ? core : l.version,
    ]),
  ) as Record<LibraryId, string>;
  const toolchains = Object.fromEntries(
    readToolchains().map((t) => [t.id, t.version ?? process.versions.node]),
  );
  return { core, libraries, toolchains, node: process.versions.node };
}

interface Printed {
  stdout: string;
  stderr: string;
  status: number | null;
}

function runCell(
  dir: string,
  cellDir: string,
  toolchain: string,
  modulePath: string,
  configs: ReturnType<typeof configsFor>,
): Printed {
  const step = runCommand(toolchain, join(dir, 'scenario.mjs'), configs, [
    modulePath,
  ]);
  const r = spawnSync(step.cmd, step.args, {
    cwd: cellDir,
    encoding: 'utf8',
    timeout: 120_000,
  });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

/** The deprecation warning Deno prints for the legacy decorator flags. */
function denoNote(stderr: string): string | undefined {
  const line = stderr
    .split('\n')
    .map((l) => stripVTControlCharacters(l).trim())
    .find((l) => /deprecat/i.test(l));
  return line === undefined || line === '' ? undefined : line;
}

function runOne(
  dir: string,
  lib: ReturnType<typeof readLibraries>['libraries'][number],
  variant: Variant,
  toolchain: ReturnType<typeof readToolchains>[number],
): MatrixCell {
  const spec = lib.variants[variant];
  if (spec === undefined) throw new Error(`${lib.id} has no ${variant}`);
  const profile = spec.profile;
  const cellDir = join(
    dir,
    'cells',
    `${lib.id}-${variant}-${toolchain.id.replace(/[^a-z0-9]+/gi, '-')}`,
  );
  mkdirSync(join(cellDir, 'src'), { recursive: true });
  copyFileSync(
    join(FIXTURES, lib.id, `${variant}.ts`),
    join(cellDir, 'src', 'main.ts'),
  );
  cpSync(join(dir, 'config'), join(cellDir, 'config'), { recursive: true });
  copyFileSync(
    join(dir, 'config', profile, 'tsconfig.json'),
    join(cellDir, 'tsconfig.json'),
  );
  symlinkSync(join(dir, 'node_modules'), join(cellDir, 'node_modules'), 'dir');
  const configs = configsFor(profile, toolchain.id);

  let modulePath: string | null = null;
  let buildError: string | null = null;
  try {
    modulePath = compile(toolchain.id, cellDir, 'src/main.ts', configs);
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    buildError = firstLine(err.stderr || err.stdout || err.message);
  }
  let printed: Record<string, unknown> | null = null;
  let note: string | undefined;
  if (modulePath !== null) {
    const run = runCell(dir, cellDir, toolchain.id, modulePath, configs);
    if (toolchain.id === 'deno') note = denoNote(run.stderr);
    const line = run.stdout.trim().split('\n').at(-1) ?? '';
    try {
      printed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // The process died before the scenario printed: the module loaded
      // (or the runtime refused it), so the whole cell failed at run time.
      printed = {
        singleton: { error: firstLine(run.stderr) || `exit ${run.status}` },
        transient: 'not-applicable',
        scoped: 'not-applicable',
      };
    }
    if (run.status !== 0 && printed !== null && !('load' in printed))
      printed.singleton ??= { error: firstLine(run.stderr) };
  }

  const result = classify(printed, buildError, golden);
  const cell: MatrixCell = {
    library: lib.id,
    variant,
    toolchain: toolchain.id,
    profile,
    sections: result.sections,
    outcome: result.outcome,
    polyfill: lib.polyfill,
  };
  if (result.message !== undefined)
    cell.message = stripPaths(result.message, cellDir);
  const documented = toolchain.documented?.[profile];
  if (documented !== undefined && result.outcome !== 'pass')
    cell.documented = documented;
  if (note !== undefined) cell.note = note;
  rmSync(cellDir, { recursive: true, force: true });
  return cell;
}

export function runMatrix(opts: {
  check: boolean;
  only?: LibraryId[];
}): MatrixFile {
  const libraries = readLibraries()
    .libraries.filter(
      (l) => opts.only === undefined || opts.only.includes(l.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const toolchains = [...readToolchains()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const dir = prepareConsumer({ libraries: libraries.map((l) => l.id) });
  const cells: MatrixCell[] = [];
  try {
    for (const lib of libraries) {
      const variants = (Object.keys(lib.variants) as Variant[]).sort();
      for (const variant of variants)
        for (const toolchain of toolchains) {
          const cell = runOne(dir, lib, variant, toolchain);
          cells.push(cell);
          console.log(
            `  ${cell.outcome.padEnd(15)} ${lib.id} ${variant} ${toolchain.id}${
              cell.message === undefined ? '' : `: ${cell.message}`
            }`,
          );
        }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { schema: 1, versions: versionsOf(), cells };
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
  const file = runMatrix({ check, only });
  const where = only === undefined ? 'results' : 'tmp';
  validate('matrix', file, where);
  const out = join(BENCHMARKS, where, 'matrix.json');
  mkdirSync(join(BENCHMARKS, where), { recursive: true });
  const text = JSON.stringify(file, null, 2) + '\n';
  const committed = existsSync(out) ? readFileSync(out, 'utf8') : '';
  writeFileSync(out, text);
  console.log(`Wrote ${out}`);
  if (check && committed !== text) {
    console.error('matrix.json changed. Commit the file the run wrote.');
    process.exit(1);
  }
}
