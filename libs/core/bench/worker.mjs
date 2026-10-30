/** One dispatch build under measurement. argv[2] is the bundle path. */
import { serveSamples } from '@nexusdi/bench-kit';

import { makeGraph, makeModularGraph } from './graph.mjs';

const core = await import(process.argv[2]);
const ops = {};
for (const size of [50, 2000]) {
  const { providers, lookups, singletons } = makeGraph(core, size);
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
  const reads = singletons.slice(0, 10);
  class Reader {
    static deps = reads.map((C) => core.lazy(C));
    constructor(...thunks) {
      this.thunks = thunks;
    }
  }
  ops[`lazy-read-${size}`] = {
    gc: true,
    setup: () => core.Nexus.create([...providers, Reader]),
    run: (ship) => {
      const { thunks } = ship.get(Reader);
      let last;
      for (let i = 0; i < 10_000; i++) last = thunks[i % thunks.length]();
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
{
  const { root, lookups } = makeModularGraph(core);
  ops['create-modules'] = {
    gc: true,
    run: () => core.Nexus.create(root),
    teardown: (ship) => ship[Symbol.asyncDispose](),
  };
  ops['get-modules'] = {
    gc: true,
    setup: () => core.Nexus.create(root),
    run: (ship) => {
      let last;
      for (let i = 0; i < 10_000; i++)
        last = ship.get(lookups[i % lookups.length]);
      return last;
    },
  };
  ops['createScope-modules'] = {
    gc: true,
    setup: () => core.Nexus.create(root),
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
