import type { BlueprintView, NexusPlugin } from '@acme/nexusdi-core';

import { CacheMissError } from './errors.js';

function checkRoot(
  view: BlueprintView,
  report: (error: CacheMissError) => void,
): void {
  if (view.providers.length === 0) report(new CacheMissError({ key: 'root' }));
}

export const cache = (): NexusPlugin => ({
  name: 'acme:cache',
  apiVersion: 1,
  compile: {
    check(view, report) {
      checkRoot(view, report);
    },
  },
});
