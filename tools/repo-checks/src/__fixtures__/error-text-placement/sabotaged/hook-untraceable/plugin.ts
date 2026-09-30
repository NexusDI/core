import type { NexusPlugin } from '@acme/nexusdi-core';

import { cacheMiss } from './errors.js';
import { makeCheck } from './make-check.js';

export const cache = (): NexusPlugin => ({
  name: 'acme:cache',
  apiVersion: 1,
  compile: { check: makeCheck() },
});

export const rest = (): NexusPlugin => ({
  name: 'acme:rest',
  apiVersion: 1,
  compile: {
    check(...args) {
      const [, report] = args;
      report(cacheMiss('root'));
    },
  },
});
