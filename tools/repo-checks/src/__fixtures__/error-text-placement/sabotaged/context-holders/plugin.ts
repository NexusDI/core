import type { NexusPlugin, PluginContext } from '@acme/nexusdi-core';

import { CacheMissError } from './errors.js';

class Holder {
  set ctx(value: PluginContext) {
    throw value.format(new CacheMissError({ key: 'a' }, { text: 'a' }));
  }
}

export function cache(): NexusPlugin {
  const holder = new Holder();
  const target = {};
  return {
    name: 'acme:cache',
    apiVersion: 1,
    setup(context) {
      holder.ctx = context;
      Object.defineProperty(target, 'x', { value: context });
      Object.entries({ context });
      let k: PluginContext | null = null;
      ({ k } = { k: context });
      k?.format(new CacheMissError({ key: 'b' }, { text: 'b' }));
      const h = { a: context };
      let j: PluginContext | null = null;
      ({ a: j } = h);
      throw j?.format(new CacheMissError({ key: 'c' }, { text: 'c' }));
    },
  };
}
