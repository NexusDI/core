import type { NexusPlugin } from '@acme/nexusdi-core';

import { CacheMissError } from './errors.js';

export const cache = (): NexusPlugin => ({
  name: 'acme:cache',
  apiVersion: 1,
  compile: {
    check(view, report) {
      const error = new CacheMissError({ key: 'root' });
      if (view.providers.length === 0) report(error);
    },
  },
});
