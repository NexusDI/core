import { Nexus } from '@nexusdi/core';
import { afterEach, expect, it, vi } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { COMMAND_DESK } from '../src/simulation/commands';
import { TICK_LOOP } from '../src/simulation/contracts';
import { roundSnapshot } from '../src/simulation/round-snapshot';
import { BUNDLED_CHARTS } from '../src/systems/tactical/star-charts';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('pins a hail and its reply on the linked ship, seed 7, to the golden', async () => {
  // The relay graph downloads its charts at build, from a stubbed relay.
  vi.stubGlobal('fetch', () => Promise.resolve(Response.json(BUNDLED_CHARTS)));
  await using nexus = await Nexus.create(
    meridianSystems({ seed: 7, dt: 0.5, relayUrl: 'https://relay.test' }),
  );
  const desk = nexus.get(COMMAND_DESK);
  const loop = nexus.get(TICK_LOOP);

  // The reactor at 1 % powers the hail's 5 MW on the tick the array sends it.
  desk.submit({ system: 'engineering', action: 'throttle', level: 0.01 });
  desk.submit({ system: 'life-support', action: 'online' });
  desk.submit({ system: 'comms', action: 'hail' });

  const record = [
    roundSnapshot(loop.advance(1)),
    roundSnapshot(loop.advance(4)),
    roundSnapshot(loop.advance(595)),
  ];

  await expect(JSON.stringify(record, null, 2) + '\n').toMatchFileSnapshot(
    'golden/comms.seed-7.json',
  );
});
