import type { NexusPlugin, PluginContext } from '@acme/nexusdi-core';

import { CacheMissError } from './errors.js';

export function cache(): NexusPlugin {
  let context: PluginContext | undefined;
  return {
    name: 'acme:cache',
    apiVersion: 1,
    setup(c) {
      context = c;
    },
    onResolve() {
      if (context !== undefined)
        throw context.format(
          new CacheMissError({ key: 'root' }, { text: 'root is not cached.' }),
        );
    },
  };
}
