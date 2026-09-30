import type { BlueprintView } from '@nexusdi/core';

// A third-party package's graph annotator, declared the way such a package
// declares one: it matches devtools' GraphAnnotator by shape and imports
// nothing from @nexusdi/devtools.

/** Notes every factory provider as fed from the fuel line. */
export function fuelLineNotes(
  view: BlueprintView,
): readonly { provider: string; label: string }[] {
  return view.providers
    .filter((p) => p.kind === 'factory')
    .map((p) => ({ provider: p.id, label: 'fed from the fuel line' }));
}
