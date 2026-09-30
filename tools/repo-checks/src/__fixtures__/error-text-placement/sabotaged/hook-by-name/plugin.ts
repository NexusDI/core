import type { BlueprintView, NexusPlugin } from '@acme/nexusdi-core';

import { cacheMiss } from './errors.js';

// The hook is a package-local function the plugin names by reference.
function checkCache(
  view: BlueprintView,
  report: (error: unknown) => void,
): void {
  if (view.providers.length === 0) report(cacheMiss('root'));
}

export const cache = (): NexusPlugin => ({
  name: 'acme:cache',
  apiVersion: 1,
  compile: { check: checkCache },
});
