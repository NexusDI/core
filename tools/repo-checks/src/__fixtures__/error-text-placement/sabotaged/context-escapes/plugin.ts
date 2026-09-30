import type { NexusPlugin, PluginContext } from '@acme/nexusdi-core';

import { CacheMissError } from './errors.js';

const CONTEXTS = new Map<string, PluginContext>();

function track(held: PluginContext): void {
  const saved = { context: held };
  queueMicrotask(() => {
    throw saved.context.format(new CacheMissError({ key: 'a' }, { text: 'a' }));
  });
}

export function cache(): NexusPlugin {
  return {
    name: 'acme:cache',
    apiVersion: 1,
    setup(context) {
      track(context);
      CONTEXTS.set('cache', context);
    },
    onResolve() {
      const context = CONTEXTS.get('cache');
      if (context !== undefined)
        throw context.format(new CacheMissError({ key: 'b' }, { text: 'b' }));
    },
  };
}

declare function makeSetup(): (context: PluginContext) => void;

export function store(): NexusPlugin {
  return { name: 'acme:store', apiVersion: 1, setup: makeSetup() };
}

export function queue(): NexusPlugin {
  return { name: 'acme:queue', apiVersion: 1, setup: (...args) => args };
}

export function lock(): NexusPlugin {
  return {
    name: 'acme:lock',
    apiVersion: 1,
    setup({ format }) {
      throw format(new CacheMissError({ key: 'c' }, { text: 'c' }));
    },
  };
}
