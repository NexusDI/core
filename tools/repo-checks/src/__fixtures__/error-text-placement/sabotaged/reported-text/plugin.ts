import type { NexusPlugin } from '@acme/nexusdi-core';

import { cacheMiss } from './errors.js';

export const cache = (): NexusPlugin => ({
  name: 'acme:cache',
  apiVersion: 1,
  compile: {
    check: (view, report) => {
      if (view.providers.length === 0) report(cacheMiss('root'));
    },
  },
});
