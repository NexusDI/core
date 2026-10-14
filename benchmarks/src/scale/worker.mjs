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

// get-cycle runs on `mixed` only (scale spec 6.2). An app that resolves
// asynchronously would put a microtask turn in every run, so refuse it.
if (typeof scale.getAsync === 'function') {
  console.error(
    'get-cycle needs synchronous resolution: this app has async providers (getAsync)',
  );
  process.exit(1);
}

serveSamples({
  'get-cycle': {
    async setup() {
      let handle = scale.create();
      if (typeof handle?.then === 'function') handle = await handle;
      for (let i = 0; i < scale.count; i++) scale.get(handle, i);
      return { handle, next: 0 };
    },
    run(state) {
      const index = scale.entries[state.next];
      state.next = (state.next + 1) % scale.entries.length;
      return scale.get(state.handle, index);
    },
  },
});
