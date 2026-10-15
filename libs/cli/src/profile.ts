import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ProfileReport, Profiler } from '@nexusdi/devtools';

import type { ProfileCommand } from './args.js';
import { CliError } from './cli-error.js';
import {
  alignClocks,
  cpuWarning,
  startCpu,
  stopCpu,
  type Sampling,
} from './cpu.js';
import { loadDevtools, type DevtoolsApi } from './devtools.js';
import { entryKind } from './entry.js';
import { loadEntry } from './graph.js';
import type { Io } from './main.js';
import { resolveFrom } from './resolve.js';
import { emit, writeTo } from './write.js';

type Outcome =
  | { readonly kind: 'done'; readonly report: ProfileReport }
  | { readonly kind: 'failed'; readonly error: unknown }
  | { readonly kind: 'timeout' };

/** Waits for `work` up to `ms`. The hung operation stays parked on its promise. */
function within(work: Promise<ProfileReport>, ms: number): Promise<Outcome> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ kind: 'timeout' }), ms);
    work.then(
      (report) => {
        clearTimeout(timer);
        resolve({ kind: 'done', report });
      },
      (error: unknown) => {
        clearTimeout(timer);
        resolve({ kind: 'failed', error });
      },
    );
  });
}

/**
 * The error's message, then each cause under it: core's ProviderError names
 * the provider, and the cause says what its constructor or factory threw.
 */
export function describeFailure(error: unknown): string {
  const lines: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current !== undefined && depth < 5; depth++) {
    const text =
      current instanceof Error
        ? `${current.name}: ${current.message}`
        : String(current);
    // The errors() plugin ends the message's first line with its cause;
    // print that cause once.
    if (depth === 0)
      lines.push(current instanceof Error ? current.message : text);
    else if (!(lines.at(-1) ?? '').split('\n', 1)[0].endsWith(`: ${text}`))
      lines.push(`  caused by ${text}`);
    current = current instanceof Error ? current.cause : undefined;
  }
  return lines.join('\n');
}

async function readReports(
  command: ProfileCommand,
  devtools: DevtoolsApi,
): Promise<ProfileReport[]> {
  const { path, shown } = command.entry;
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new CliError(
      2,
      `${shown} is not a readable JSON file: ${(error as Error).message}`,
      'Pass a file written by nexusdi profile --json.',
    );
  }
  const values = Array.isArray(value) ? value : [value];
  try {
    return values.map((v) => devtools.parseProfileReport(v));
  } catch (error) {
    // devtools' message ends in its Fix line.
    throw new CliError(2, `${shown}: ${(error as Error).message}`);
  }
}

/**
 * The version of the @nexusdi/core that `fromFile` resolves, which ran the
 * app, or null when none resolves. Core exports no version constant, so its
 * package.json is the source (spec 7.4).
 */
function coreVersion(fromFile: string): string | null {
  const manifest = resolveFrom('@nexusdi/core/package.json', fromFile);
  if (manifest === null) return null;
  return (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string })
    .version;
}

/** Where a startup is recorded: this Node, and the core the entry resolves. */
export function environmentOf(
  fromFile: string,
): NonNullable<ProfileReport['environment']> {
  return {
    node: process.versions.node,
    core: coreVersion(fromFile) ?? '(unresolved)',
  };
}

async function writeOutputs(
  io: Io,
  command: ProfileCommand,
  devtools: DevtoolsApi,
  reports: readonly ProfileReport[],
  cpu: Parameters<DevtoolsApi['toChromeTrace']>[1],
): Promise<void> {
  const [first] = reports;
  if (first === undefined) return;
  // The core that recorded the report, never this machine's (spec 7.4).
  const core = first.environment?.core;
  if (command.json !== null)
    await emit(JSON.stringify(reports), command.json, io.stdout);
  if (command.chrome !== null)
    await emit(
      JSON.stringify(devtools.toChromeTrace(first, cpu)),
      command.chrome,
      io.stdout,
    );
  if (command.perfetto !== null) {
    const file = devtools.toPerfettoTrace(first);
    await emit(
      JSON.stringify({
        ...file,
        metadata: {
          ...file.metadata,
          ...(core === undefined || core === '(unresolved)'
            ? {}
            : { 'nexusdi-core': core }),
        },
      }),
      command.perfetto,
      io.stdout,
    );
  }
}

/**
 * Stops the sampling and aligns its clock to performance.now() by the two
 * anchors (spec 8). Warns and returns no CPU profile when no anchor has a
 * sample; warns when the anchors disagree or the alignment error passes
 * max(1 ms, 4 samples), and keeps the profile.
 */
async function mergeCpu(
  io: Io,
  sampling: Sampling,
): Promise<Parameters<DevtoolsApi['toChromeTrace']>[1]> {
  const { profile, anchors } = await stopCpu(sampling);
  const aligned = alignClocks(profile, anchors, sampling.interval);
  if (aligned === null) {
    await writeTo(
      io.stderr,
      'nexusdi: warning: no CPU sample fell inside an anchor, so the Chrome trace has no CPU profile.\n',
    );
    return undefined;
  }
  const warning = cpuWarning(aligned, sampling.interval);
  if (warning !== null) await writeTo(io.stderr, warning);
  return { cpuProfile: { profile, offsetMs: aligned.offsetMs } };
}

export async function runProfile(
  command: ProfileCommand,
  io: Io,
  version: string,
): Promise<number> {
  if (entryKind(command.entry) === 'json') {
    // A saved report carries the environment it was recorded in, or none.
    const devtools = await loadDevtools(join(io.cwd, 'package.json'), version);
    const reports = await readReports(command, devtools);
    await writeOutputs(io, command, devtools, reports, undefined);
    if (!command.quiet)
      await writeTo(
        io.stdout,
        devtools.profileTable(reports, { top: command.top }),
      );
    return 0;
  }
  const environment = environmentOf(command.entry.path);

  const { root, load, plugins, devtools } = await loadEntry(
    command,
    version,
    'nexusdi profile',
  );
  const reports: ProfileReport[] = [];
  let code = 0;
  let cpu: Parameters<DevtoolsApi['toChromeTrace']>[1];
  for (let i = 0; i <= command.repeat; i++) {
    const profiler: Profiler = devtools.profile();
    // The CPU samples go into the --chrome file, which shows iteration 1.
    const sampling =
      i === 0 && command.cpu ? await startCpu(command.cpuInterval) : null;
    const outcome = await within(
      devtools.profileStartup(root as never, {
        plugins: plugins as never,
        load: load as never,
        profiler,
      }),
      command.timeout,
    );
    if (sampling !== null) cpu = await mergeCpu(io, sampling);
    if (outcome.kind === 'done') {
      reports.push({ ...outcome.report, environment });
      if (outcome.report.dispose !== null && outcome.report.dispose.errors > 0)
        await writeTo(
          io.stderr,
          `nexusdi: warning: disposal after iteration ${i + 1} raised ${outcome.report.dispose.errors} errors; the startup figures stand.\n`,
        );
      continue;
    }
    const partial = { ...profiler.report(), environment };
    reports.push(partial);
    const open = partial.runs.find((r) => r.ok === null);
    if (
      outcome.kind === 'timeout' &&
      open === undefined &&
      partial.runs.length > 0
    ) {
      // Every run settled, so the wait was the disposal profileStartup ends
      // with. The startup figures stand, as for a disposal error (spec 9.3);
      // a further iteration would build next to the stuck one, so it stops.
      await writeTo(
        io.stderr,
        `nexusdi: warning: disposal after iteration ${i + 1} did not settle within ${command.timeout} ms; the startup figures stand.\n`,
      );
      break;
    }
    if (outcome.kind === 'timeout') {
      const waiting = (open?.pending ?? [])
        .map(
          (p) =>
            `${p.token} (${p.module}) ${p.what === 'construct' ? 'factory' : 'onInit'}, ${Math.round(partial.reportedMs - p.startMs)} ms`,
        )
        .join('; ');
      await writeTo(
        io.stderr,
        `nexusdi: ${open?.kind ?? 'create'} did not settle within ${command.timeout} ms.\n${waiting === '' ? '' : `  Still awaiting: ${waiting}\n`}`,
      );
    } else {
      const failed = partial.runs.find((r) => r.ok === false);
      const detail = describeFailure(outcome.error);
      await writeTo(
        io.stderr,
        `nexusdi: ${failed?.kind ?? 'create'} failed:\n${detail}\n`,
      );
      // A run that failed before it compiled, or no run at all, is an input error
      // (spec 9.5, plan choice 10). The profiler's data decides; no error code is read.
      if (failed === undefined || failed.compile === null) {
        code = 2;
        break;
      }
    }
    code = 1;
    break;
  }
  await writeOutputs(io, command, devtools, reports, cpu);
  if (!command.quiet)
    await writeTo(
      io.stdout,
      devtools.profileTable(reports, { top: command.top }),
    );
  return code;
}
