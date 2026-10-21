import { Nexus } from '@nexusdi/core';
import { expect, it } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { SHIP_STATE, TICK_LOOP } from '../src/simulation/contracts';
import { roundSnapshot } from '../src/simulation/round-snapshot';

it('pins the idle ship, seed 7, to the golden', async () => {
  await using nexus = await Nexus.create(meridianSystems({ seed: 7, dt: 0.5 }));
  const loop = nexus.get(TICK_LOOP);
  const state = nexus.get(SHIP_STATE);

  const record = [
    roundSnapshot(state.snapshot()),
    roundSnapshot(loop.advance(1)),
    roundSnapshot(loop.advance(599)),
  ];

  await expect(JSON.stringify(record, null, 2) + '\n').toMatchFileSnapshot(
    'golden/idle.seed-7.json',
  );
});
