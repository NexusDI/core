import type { NexusErrorOptions, NexusPlugin } from '@acme/nexusdi-core';

import { CacheMissError } from './errors.js';

export const cache = (options: NexusErrorOptions): NexusPlugin => ({
  name: 'acme:cache',
  apiVersion: 1,
  compile: {
    check(view, report) {
      if (view.providers.length === 0)
        report(new CacheMissError({ key: 'root' }, options));
    },
  },
});
