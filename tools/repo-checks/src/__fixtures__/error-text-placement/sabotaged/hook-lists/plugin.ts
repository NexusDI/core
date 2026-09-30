import type { BlueprintView, NexusPlugin } from '@acme/nexusdi-core';

import { cacheMiss } from './errors.js';

// Registries that hold hooks under a check key. An array is never a hook.
export const NO_HOOKS = Object.freeze({ check: Object.freeze([]) });
export const collected = { check: [] as unknown[] };

function hook(view: BlueprintView, report: (error: unknown) => void): void {
  if (view.providers.length === 0) report(cacheMiss('root'));
}

// A compile object built apart from the plugin is still inspected.
const compile = { check: hook };

export const cache = (): NexusPlugin => ({
  name: 'acme:cache',
  apiVersion: 1,
  compile,
});
