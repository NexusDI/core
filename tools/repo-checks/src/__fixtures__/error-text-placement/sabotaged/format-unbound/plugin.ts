import type { NexusPlugin, PluginContext } from '@acme/nexusdi-core';

import { CacheMissError } from './errors.js';

declare function later(format: (error: Error) => Error): void;

export function cache(): NexusPlugin {
  let context: PluginContext | undefined;
  return {
    name: 'acme:cache',
    apiVersion: 1,
    setup(c) {
      context = c;
      const { format } = c;
      later(format);
    },
    onResolve() {
      if (context === undefined) return;
      const { format } = context;
      if (Math.random() > 0.5)
        throw format(new CacheMissError({ key: 'a' }, { text: 'a' }));
      throw context['format'](new CacheMissError({ key: 'b' }, { text: 'b' }));
    },
  };
}
