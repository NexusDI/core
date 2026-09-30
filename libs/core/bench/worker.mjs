/** One dispatch build under measurement. argv[2] is the bundle path. */
import { serveSamples } from '@nexusdi/bench-kit';

import { makeGraph } from './graph.mjs';

const core = await import(process.argv[2]);
const ops = {};
for (const size of [50, 2000]) {
  const { providers, lookups } = makeGraph(core, size);
  ops[`create-${size}`] = {
    gc: true,
    run: () => core.Nexus.create(providers),
    teardown: (ship) => ship[Symbol.asyncDispose](),
  };
  ops[`get-${size}`] = {
    gc: true,
    setup: () => core.Nexus.create(providers),
    run: (ship) => {
      let last;
      for (let i = 0; i < 10_000; i++)
        last = ship.get(lookups[i % lookups.length]);
      return last;
    },
  };
  ops[`createScope-${size}`] = {
    gc: true,
    setup: () => core.Nexus.create(providers),
    run: async (ship) => {
      let last;
      for (let i = 0; i < 1_000; i++) {
        last = await ship.createScope();
        await last[Symbol.asyncDispose]();
      }
      return last;
    },
  };
}
serveSamples(ops);
