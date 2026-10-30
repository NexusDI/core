import { Nexus } from '@nexusdi/core';
import { SHIP_STATE, TICK_LOOP } from '@nexusdi/meridian-systems';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { meridian } from '../src/ship/meridian.module';
import { bridgePlugins } from '../src/ship/plugins';
import { FRAMEWORKS } from '../test/support';
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

describe.each(FRAMEWORKS)('the bridge API on %s', (framework) => {
  for (const each of cases) {
    if (each.frameworks && !each.frameworks.includes(framework)) continue;
    it(each.name, () => each.run(nodeLeg(framework)));
  }
});

it('the real relay sees a handshake at startup and a sign-off after the ship disposes', async () => {
  const handshakes = relay.handshakes();
  const signOffs = relay.signOffs().length;
  const ship = await Nexus.create(meridian(relay.url), {
    plugins: [...bridgePlugins()],
  });
  expect(relay.handshakes() - handshakes, 'handshakes').toBe(1);
  // The reactor puts out power for the sign-off only at a throttle, after some ticks.
  ship.get(SHIP_STATE).queue({ reactor: { throttle: 1 } });
  ship.get(TICK_LOOP).advance(20);
  expect(relay.signOffs(), 'sign-offs before dispose').toHaveLength(signOffs);
  await ship[Symbol.asyncDispose]();
  expect(relay.signOffs(), 'sign-offs after dispose').toHaveLength(
    signOffs + 1,
  );
});
