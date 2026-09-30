import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CliError } from './cli-error.js';
import { entryKind, type EntryRef } from './entry.js';
import { importFile, resolveFrom } from './resolve.js';

let registered = false;

/**
 * For a TypeScript entry, registers tsx from the entry's own project, once.
 * No fallback to this package's location: the project picks its loader.
 *
 * Imports `tsx/esm`, which registers tsx's hooks when it loads, as
 * `node --import tsx/esm` does. The `./esm` export has a single target, so
 * require resolution finds the ESM file. `tsx/esm/api` has import and
 * require targets, and require resolution picks the CJS build, whose
 * register() cannot find its hooks file on Node 22.
 */
export async function prepareLoader(ref: EntryRef): Promise<void> {
  if (registered || entryKind(ref) !== 'ts') return;
  const file = resolveFrom('tsx/esm', ref.path);
  if (file === null) return;
  await importFile<unknown>(file);
  registered = true;
}

const TS_FIX = 'Install tsx in the project: npm i -D tsx';

/** The specifier ERR_MODULE_NOT_FOUND names, when its .ts sibling exists. */
function tsSibling(error: Error, ref: EntryRef): string | null {
  const match = /Cannot find (?:module|package) '([^']+)'/.exec(error.message);
  const specifier = match?.[1];
  if (specifier === undefined || !specifier.endsWith('.js')) return null;
  const path = specifier.startsWith('file:')
    ? fileURLToPath(specifier)
    : isAbsolute(specifier)
      ? specifier
      : resolve(dirname(ref.path), specifier);
  return existsSync(path.replace(/\.js$/, '.ts')) ? specifier : null;
}

/** The entry's module namespace. Throws CliError 2 or 3 with the fix. */
export async function importEntry(
  ref: EntryRef,
): Promise<Record<string, unknown>> {
  const kind = entryKind(ref);
  if (!existsSync(ref.path))
    throw new CliError(
      2,
      `${ref.shown} does not exist.`,
      'Pass the file that defines the root module.',
    );
  try {
    return await importFile<Record<string, unknown>>(ref.path);
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error(String(caught));
    const code = (error as { code?: unknown }).code;
    if (
      kind === 'ts' &&
      (code === 'ERR_UNKNOWN_FILE_EXTENSION' ||
        code === 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX')
    )
      throw new CliError(
        3,
        `${ref.shown} is TypeScript that this Node cannot load (${code}).`,
        TS_FIX,
      );
    if (kind === 'ts' && code === 'ERR_MODULE_NOT_FOUND') {
      const specifier = tsSibling(error, ref);
      if (specifier !== null)
        throw new CliError(
          3,
          `${ref.shown} is TypeScript that this Node cannot load (ERR_MODULE_NOT_FOUND for ${specifier}).`,
          TS_FIX,
        );
    }
    throw new CliError(
      2,
      `${ref.shown} threw while it was imported:\n${
        error.stack ?? error.message
      }`,
      'Point nexusdi at the file that defines the root module, which should not start the app.',
    );
  }
}
