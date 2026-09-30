import type { NexusPlugin, PluginContext } from '@acme/nexusdi-core';

import { CacheMissError } from './errors.js';

interface State {
  context?: PluginContext;
}

interface Request {
  readonly context: { format(text: string): string };
}

const state: State = {};

export function cache(): NexusPlugin {
  return {
    name: 'acme:cache',
    apiVersion: 1,
    setup(context) {
      state.context = context;
    },
    onResolve() {
      if (state.context !== undefined)
        throw state.context.format(new CacheMissError({ key: 'a' }));
    },
  };
}

export function describe(request: Request): string {
  return request.context.format('miss');
}
