import { Nexus } from '@nexusdi/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { meridian } from '../src/ship/meridian';
import { bridgePlugins } from '../src/ship/plugins';
import { cases, type Leg } from './cases';
import { startRelay } from './relay';
import { servers } from './servers';

let relay: Awaited<ReturnType<typeof startRelay>>;
beforeAll(async () => {
  relay = await startRelay();
});
afterAll(async () => {
  await relay.close();
});

/** The Node leg of a framework: the relay graph, whose charts download over a local relay. */
function nodeLeg(framework: Leg['framework']): Leg {
  const downloads = relay.downloads();
  return {
    framework,
    start: servers[framework],
    ship: (plugins = []) =>
      Nexus.create(meridian(relay.url), {
        plugins: [...bridgePlugins(), ...plugins],
      }),
    check: (what, actual, expected) => expect(actual, what).toEqual(expected),
    // One build downloads the charts once.
    afterFunctionForm: () =>
      expect(relay.downloads() - downloads, 'downloads').toBe(1),
  };
}

describe.each(['hono', 'express', 'fastify'] as const)(
  'the bridge API on %s',
  (framework) => {
    for (const each of cases) {
      if (each.frameworks && !each.frameworks.includes(framework)) continue;
      it(each.name, () => each.run(nodeLeg(framework)));
    }
  },
);
