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
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import {
  compile,
  readToolchains,
  runCommand,
} from '@nexusdi/toolchain-matrix/recipes';

import { coreVersion } from './consumer.ts';
import { checkSnippets } from './snippets.ts';
import { firstLine, stripPaths } from './text.ts';
import { FIXTURES, configsFor, readLibraries } from './libraries.ts';
import { classify } from './outcome.ts';
import {
  type LibraryId,
  type MatrixCell,
  type MatrixFile,
  type Variant,
  type Versions,
} from './schema.ts';
import {
  fixtureCell,
  onlyArg,
  selectLibraries,
  variantsOf,
  withConsumer,
  writeResult,
} from './cli.ts';

const golden = JSON.parse(
  readFileSync(join(FIXTURES, 'golden.json'), 'utf8'),
) as Parameters<typeof classify>[2];

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
  const { cellDir, profile } = fixtureCell(
    dir,
    `${lib.id}-${variant}-${toolchain.id}`,
    lib,
    variant,
  );
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

export function runMatrix(opts: { only?: LibraryId[] }): MatrixFile {
  const libraries = selectLibraries(opts.only);
  const toolchains = [...readToolchains()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const cells: MatrixCell[] = [];
  withConsumer(libraries, (dir) => {
    for (const lib of libraries)
      for (const variant of variantsOf(lib))
        for (const toolchain of toolchains) {
          const cell = runOne(dir, lib, variant, toolchain);
          cells.push(cell);
          console.log(
            `  ${cell.outcome.padEnd(15)} ${lib.id} ${variant} ${toolchain.id}${
              cell.message === undefined ? '' : `: ${cell.message}`
            }`,
          );
        }
    const snippets = checkSnippets(dir, libraries);
    for (const s of snippets)
      console.log(
        `  snippets ${s.ok ? 'ok' : 'FAILED'} ${s.library}${
          s.message === undefined ? '' : `: ${s.message}`
        }`,
      );
    if (snippets.some((s) => !s.ok))
      throw new Error('a snippets file failed its check');
  });
  return { schema: 1, versions: versionsOf(), cells };
}

if (import.meta.main) {
  const only = onlyArg();
  writeResult('matrix', runMatrix({ only }), only);
}
