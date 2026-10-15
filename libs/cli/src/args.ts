import { extname, resolve } from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';

import { CliError } from './cli-error.js';
import { entryKind, parseEntryRef, type EntryRef } from './entry.js';

export const FORMATS = ['mermaid', 'dot', 'json', 'svg', 'png'] as const;
export type Format = (typeof FORMATS)[number];
export const VIEWS = ['providers', 'modules'] as const;
export type View = (typeof VIEWS)[number];

export interface GraphCommand {
  readonly kind: 'graph';
  readonly entry: EntryRef;
  readonly format: Format;
  /** Absolute; null writes to stdout. */
  readonly out: string | null;
  readonly view: View;
  readonly load: readonly EntryRef[];
  readonly plugins: EntryRef | null;
}

export interface ProfileCommand {
  readonly kind: 'profile';
  readonly entry: EntryRef;
  readonly load: readonly EntryRef[];
  readonly plugins: EntryRef | null;
  /** Warm iterations after the first. */
  readonly repeat: number;
  /** Absolute paths; null writes no file. */
  readonly chrome: string | null;
  readonly perfetto: string | null;
  readonly json: string | null;
  readonly cpu: boolean;
  /** µs. */
  readonly cpuInterval: number;
  readonly top: number;
  /** ms. */
  readonly timeout: number;
  readonly quiet: boolean;
}

export type Command =
  | GraphCommand
  | ProfileCommand
  | { readonly kind: 'help' }
  | { readonly kind: 'version' };

const BY_EXTENSION: Readonly<Record<string, Format>> = {
  '.mmd': 'mermaid',
  '.mermaid': 'mermaid',
  '.dot': 'dot',
  '.gv': 'dot',
  '.json': 'json',
  '.svg': 'svg',
  '.png': 'png',
};

/** The flags `nexusdi` accepts, as node:util's parseArgs reads them. */
export const OPTIONS = {
  format: { type: 'string', short: 'f' },
  out: { type: 'string', short: 'o' },
  view: { type: 'string' },
  load: { type: 'string', multiple: true },
  plugins: { type: 'string' },
  repeat: { type: 'string' },
  chrome: { type: 'string' },
  perfetto: { type: 'string' },
  json: { type: 'string' },
  cpu: { type: 'boolean' },
  'cpu-interval': { type: 'string' },
  top: { type: 'string' },
  timeout: { type: 'string' },
  quiet: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const satisfies ParseArgsConfig['options'];

const HELP_FIX = 'Run nexusdi --help for the options.';

const GRAPH_ONLY = ['format', 'out', 'view'] as const;
const PROFILE_ONLY = [
  'repeat',
  'chrome',
  'perfetto',
  'json',
  'cpu',
  'cpu-interval',
  'top',
  'timeout',
  'quiet',
] as const;

/** Refuses any of `names` given on a command that `owner` owns them for. */
function refuseFlags(
  values: Readonly<Record<string, unknown>>,
  names: readonly (keyof typeof OPTIONS)[],
  owner: string,
): void {
  for (const name of names)
    if (values[name] !== undefined) {
      const option = OPTIONS[name];
      throw new CliError(
        2,
        `${'short' in option ? `-${option.short}` : `--${name}`} is a ${owner} option.`,
        HELP_FIX,
      );
    }
}

/** A whole-number flag of at least `min`, or `fallback` when absent. */
function count(
  flag: string,
  value: string | undefined,
  fallback: number,
  min: number,
): number {
  if (value === undefined) return fallback;
  // Digits only: Number() also reads '', '0x10', '1e2' and ' 5' as numbers.
  const n = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(n) || n < min)
    throw new CliError(
      2,
      `${flag} takes a whole number of at least ${min}; got "${value}".`,
      HELP_FIX,
    );
  return n;
}

function isOneOf<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return (values as readonly string[]).includes(value);
}

function formatOf(flag: string | undefined, out: string | null): Format {
  if (flag !== undefined) {
    if (!isOneOf(FORMATS, flag))
      throw new CliError(
        2,
        `unknown format "${flag}".`,
        `Use one of: ${FORMATS.join(', ')}.`,
      );
    return flag;
  }
  return (out === null ? undefined : BY_EXTENSION[extname(out)]) ?? 'mermaid';
}

export function parseCommand(argv: readonly string[], cwd: string): Command {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: OPTIONS,
    });
  } catch (error) {
    throw new CliError(2, (error as Error).message, HELP_FIX);
  }
  const { values, positionals } = parsed;
  if (values.help === true) return { kind: 'help' };
  if (values.version === true) return { kind: 'version' };

  const [command, entryArg, ...rest] = positionals;
  if (command !== 'graph' && command !== 'profile')
    throw new CliError(
      2,
      command === undefined
        ? 'no command given.'
        : `unknown command "${command}".`,
      'Run: nexusdi graph <entry> or nexusdi profile <entry>',
    );
  if (entryArg === undefined)
    throw new CliError(
      2,
      `${command} needs an entry file.`,
      `Run: nexusdi ${command} src/app.module.ts#AppModule`,
    );
  if (rest.length > 0)
    throw new CliError(
      2,
      `unexpected argument "${rest[0]}".`,
      'Pass one entry, and --load for each module to compile after it.',
    );
  refuseFlags(
    values,
    command === 'graph' ? PROFILE_ONLY : GRAPH_ONLY,
    command === 'graph' ? 'profile' : 'graph',
  );

  const entry = parseEntryRef(entryArg, cwd);
  const load = (values.load ?? []).map((value) => parseEntryRef(value, cwd));
  const plugins =
    values.plugins === undefined ? null : parseEntryRef(values.plugins, cwd);
  const finished = entryKind(entry) === 'json';
  if (command === 'graph' && finished && (load.length > 0 || plugins !== null))
    throw new CliError(
      2,
      '--load and --plugins need a module entry; a .json entry is a finished graph.',
      'Drop --load and --plugins, or pass the file that defines the root module.',
    );
  const repeat = count('--repeat', values.repeat, 0, 0);
  const cpu = values.cpu === true;
  if (
    command === 'profile' &&
    finished &&
    (load.length > 0 || plugins !== null || repeat > 0 || cpu)
  )
    throw new CliError(
      2,
      '--load, --plugins, --repeat and --cpu need a module entry; a .json entry is a finished report.',
      'Drop them, or pass the file that defines the root module.',
    );
  for (const [flag, ref] of [
    ...load.map((ref) => ['--load', ref] as const),
    ...(plugins === null ? [] : [['--plugins', plugins] as const]),
  ])
    if (entryKind(ref) === 'json')
      throw new CliError(
        2,
        `${flag} ${ref.shown}: ${flag} takes a module file, and a .json file holds no exports.`,
        `Pass the .ts or .js file that exports it: ${flag} src/file.ts#Export`,
      );

  if (command === 'profile') {
    const chrome =
      values.chrome === undefined ? null : resolve(cwd, values.chrome);
    if (cpu && chrome === null)
      throw new CliError(
        2,
        '--cpu needs --chrome: the CPU profile merges into the Chrome trace.',
        'Add --chrome startup.json',
      );
    return {
      kind: 'profile',
      entry,
      load,
      plugins,
      repeat,
      chrome,
      perfetto:
        values.perfetto === undefined ? null : resolve(cwd, values.perfetto),
      json: values.json === undefined ? null : resolve(cwd, values.json),
      cpu,
      cpuInterval: count('--cpu-interval', values['cpu-interval'], 100, 1),
      top: count('--top', values.top, 20, 1),
      timeout: count('--timeout', values.timeout, 60_000, 1),
      quiet: values.quiet === true,
    };
  }

  const out = values.out === undefined ? null : resolve(cwd, values.out);
  const format = formatOf(values.format, out);
  const view = values.view ?? 'providers';
  if (!isOneOf(VIEWS, view))
    throw new CliError(
      2,
      `unknown view "${view}".`,
      `Use one of: ${VIEWS.join(', ')}.`,
    );
  return { kind: 'graph', entry, format, out, view, load, plugins };
}
