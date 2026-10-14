/**
 * The steady get() worker of one scale cell (scale spec 6.2). Plain
 * JavaScript, never compiled; one long-lived process per library and size:
 *
 *   node --expose-gc worker.mjs <bundle.mjs>
 *
 * Setup builds the app and resolves every provider. The one operation,
 * `get-cycle`, calls get on the next index of `entries`, cycling, so no
 * single hot token turns the figure into one inline-cache hit. The sampler,
 * calibration and sink are bench-kit's serveSamples.
 */
import { pathToFileURL } from 'node:url';

import { serveSamples } from '@nexusdi/bench-kit';

const { scale } = await import(pathToFileURL(process.argv[2]).href);

const get =
  typeof scale.getAsync === 'function'
    ? (handle, index) => scale.getAsync(handle, index)
    : (handle, index) => scale.get(handle, index);

serveSamples({
  'get-cycle': {
    async setup() {
      const handle = await scale.create();
      for (let i = 0; i < scale.count; i++) await get(handle, i);
      return { handle, next: 0 };
    },
    run(state) {
      const index = scale.entries[state.next];
      state.next = (state.next + 1) % scale.entries.length;
      return get(state.handle, index);
    },
  },
});
