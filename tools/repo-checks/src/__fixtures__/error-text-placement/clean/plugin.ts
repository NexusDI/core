import type { NexusPlugin, PluginContext } from '@acme/nexusdi-core';

import { cacheMiss, StoreError, storeFull } from './errors.js';

export function cache(): NexusPlugin {
  let context: PluginContext | undefined;
  return {
    name: 'acme:cache',
    apiVersion: 1,
    setup(c) {
      context = c;
    },
    compile: {
      check(view, report) {
        if (view.providers.length === 0) report(cacheMiss('root'));
        report(storeFull('main'));
      },
    },
    onResolve() {
      if (context !== undefined)
        throw context.format(
          new StoreError({ code: 'ACME_STORE_LOCKED', store: 'main' }),
        );
    },
  };
}
