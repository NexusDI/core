import { CliError } from './cli-error.js';
import type { EntryRef } from './entry.js';

/** Where a ref came from, so the fix line repeats the right flag. */
export interface ExportUse {
  /** What precedes path#export in the fix line: `nexusdi graph`, `--load` or `--plugins`. */
  readonly via: string;
  /** Picks the export the fix line suggests; the first export when absent. */
  readonly fits?: (value: unknown) => boolean;
}

const ENTRY_USE: ExportUse = { via: 'nexusdi graph' };

/** The export `ref` names, or the default export. Throws CliError 2 listing the exports. */
export function pickExport(
  namespace: Readonly<Record<string, unknown>>,
  ref: EntryRef,
  use: ExportUse = ENTRY_USE,
): unknown {
  const name = ref.exportName ?? 'default';
  if (Object.hasOwn(namespace, name) && namespace[name] !== undefined)
    return namespace[name];
  const names = Object.keys(namespace).filter(
    (key) => key !== 'default' && key !== 'module.exports',
  );
  const fits = use.fits;
  const suggested =
    (fits === undefined
      ? undefined
      : names.find((key) => fits(namespace[key]))) ?? names[0];
  throw new CliError(
    2,
    ref.exportName === null
      ? `${ref.shown} has no default export.`
      : `${ref.shown} has no export named ${name}.`,
    `Its exports: ${
      names.length === 0 ? 'none' : names.join(', ')
    }\n  Pass one: ${use.via} ${ref.shown}#${suggested ?? '<export>'}`,
  );
}
