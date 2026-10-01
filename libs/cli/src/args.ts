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

export type Command =
  GraphCommand | { readonly kind: 'help' } | { readonly kind: 'version' };

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
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const satisfies ParseArgsConfig['options'];

const HELP_FIX = 'Run nexusdi --help for the options.';

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
  if (command !== 'graph')
    throw new CliError(
      2,
      command === undefined
        ? 'no command given.'
        : `unknown command "${command}".`,
      'Run: nexusdi graph <entry>',
    );
  if (entryArg === undefined)
    throw new CliError(
      2,
      'graph needs an entry file.',
      'Run: nexusdi graph src/app.module.ts#AppModule',
    );
  if (rest.length > 0)
    throw new CliError(
      2,
      `unexpected argument "${rest[0]}".`,
      'Pass one entry, and --load for each module to compile after it.',
    );

  const out = values.out === undefined ? null : resolve(cwd, values.out);
  const format = formatOf(values.format, out);
  const view = values.view ?? 'providers';
  if (!isOneOf(VIEWS, view))
    throw new CliError(
      2,
      `unknown view "${view}".`,
      `Use one of: ${VIEWS.join(', ')}.`,
    );

  const entry = parseEntryRef(entryArg, cwd);
  const load = (values.load ?? []).map((value) => parseEntryRef(value, cwd));
  const plugins =
    values.plugins === undefined ? null : parseEntryRef(values.plugins, cwd);
  if (entryKind(entry) === 'json' && (load.length > 0 || plugins !== null))
    throw new CliError(
      2,
      '--load and --plugins need a module entry; a .json entry is a finished graph.',
      'Drop --load and --plugins, or pass the file that defines the root module.',
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
  return { kind: 'graph', entry, format, out, view, load, plugins };
}
