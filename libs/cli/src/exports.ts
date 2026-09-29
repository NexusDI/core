import { CliError } from './cli-error.js';
import type { EntryRef } from './entry.js';

/** The export `ref` names, or the default export. Throws CliError 2 listing the exports. */
export function pickExport(
  namespace: Readonly<Record<string, unknown>>,
  ref: EntryRef,
): unknown {
  const name = ref.exportName ?? 'default';
  if (Object.hasOwn(namespace, name) && namespace[name] !== undefined)
    return namespace[name];
  const names = Object.keys(namespace).filter(
    (key) => key !== 'default' && key !== 'module.exports',
  );
  throw new CliError(
    2,
    ref.exportName === null
      ? `${ref.shown} has no default export.`
      : `${ref.shown} has no export named ${name}.`,
    `Its exports: ${
      names.length === 0 ? 'none' : names.join(', ')
    }\n  Pass one: nexusdi graph ${ref.shown}#${names[0] ?? '<export>'}`,
  );
}
