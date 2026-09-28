import type { BlueprintView } from '../blueprint/views.js';
import type { BlueprintError, NexusError } from '../errors/index.js';
import { layoutText, type ErrorText } from '../runtime/plugins.js';
import { BUILDERS } from './builders.js';

/** Revision 1's aggregate text, with each inner error rendered and indented. */
function blueprintText(
  error: BlueprintError,
  view: BlueprintView | undefined,
): ErrorText {
  const count = `${error.errors.length} error${error.errors.length === 1 ? '' : 's'}`;
  const lines = error.errors.map(
    (inner) => `  ${render(inner, view).split('\n').join('\n    ')}`,
  );
  return {
    message: `the module graph has ${count}; nothing was built.\n${lines.join('\n')}`,
  };
}

/** Revision 1's text for an error, or undefined for a code it does not know. */
export function textOf(
  error: NexusError,
  view?: BlueprintView,
): ErrorText | undefined {
  if (error.code === 'NEXUS_BLUEPRINT_INVALID')
    return blueprintText(error as BlueprintError, view);
  return BUILDERS[error.code as keyof typeof BUILDERS]?.(error as never, view);
}

/** The full message a formatter writes: the code, the body, the hints, the fix. */
export function render(error: NexusError, view?: BlueprintView): string {
  const text = textOf(error, view);
  return text === undefined ? error.message : layoutText(error.code, text);
}
