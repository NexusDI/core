/**
 * One library-variant under measurement (spec 4.7, the sampler). Plain
 * JavaScript, never compiled. argv[2] is the tsc build of the fixture; the
 * worker serves one operation per scenario the library has a lifetime for.
 */
import { pathToFileURL } from 'node:url';

import { serveSamples } from '@nexusdi/bench-kit';

const { adapter } = await import(pathToFileURL(process.argv[2]).href);
const lifetimes = new Set(adapter.lifetimes);
const ops = {
  ready: {
    gc: true,
    run: () => adapter.ready(),
    teardown: (ship) => adapter.dispose?.(ship),
  },
  'resolve-singleton': {
    setup: () => adapter.ready(),
    run: (ship) => ship.get('bridge'),
  },
};
if (lifetimes.has('transient'))
  ops['resolve-transient'] = {
    setup: () => adapter.ready(),
    run: (ship) => ship.get('drone'),
  };
if (lifetimes.has('scoped') && lifetimes.has('transient'))
  ops['scope-cycle'] = {
    gc: true,
    setup: () => adapter.ready(),
    run: async (ship) => {
      const scope = await adapter.scope(ship);
      scope.get('flightLog');
      const drone = scope.get('drone');
      await scope.close();
      return drone;
    },
  };
serveSamples(ops);
