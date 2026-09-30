import { extname, resolve } from 'node:path';

import { CliError } from './cli-error.js';

/** A file and one of its exports, from the path#export syntax. */
export interface EntryRef {
  /** Absolute. */
  readonly path: string;
  /** null takes the default export. */
  readonly exportName: string | null;
  /** The file as the user typed it, for messages. */
  readonly shown: string;
}

const KINDS: Readonly<Record<string, 'ts' | 'js' | 'json'>> = {
  '.ts': 'ts',
  '.mts': 'ts',
  '.cts': 'ts',
  '.js': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.json': 'json',
};

/**
 * The index of the `#` that starts the export name, or -1. A `#` inside the
 * path (`d#x/app.module.ts`) is part of the path: the split needs no path
 * separator after it and a loadable extension before it.
 */
function exportHash(value: string): number {
  const hash = value.lastIndexOf('#');
  if (hash === -1 || /[\\/]/.test(value.slice(hash + 1))) return -1;
  const file = value.slice(0, hash);
  return file === '' || Object.hasOwn(KINDS, extname(file)) ? hash : -1;
}

export function parseEntryRef(value: string, cwd: string): EntryRef {
  const hash = exportHash(value);
  const file = hash === -1 ? value : value.slice(0, hash);
  const exportName = hash === -1 ? null : value.slice(hash + 1);
  if (file === '')
    throw new CliError(
      2,
      `"${value}" names no file.`,
      'Pass path#export, such as src/app.module.ts#AppModule.',
    );
  if (exportName === '')
    throw new CliError(
      2,
      `"${value}" ends in # with no export name.`,
      `Pass ${file}#<export>, or drop the # for the default export.`,
    );
  return { path: resolve(cwd, file), exportName, shown: file };
}

export function entryKind(ref: EntryRef): 'ts' | 'js' | 'json' {
  const kind = KINDS[extname(ref.path)];
  if (kind === undefined)
    throw new CliError(
      2,
      `${ref.shown} is not a file nexusdi can load.`,
      'Pass a .ts, .mts, .cts, .js, .mjs, .cjs or .json file.',
    );
  return kind;
}
