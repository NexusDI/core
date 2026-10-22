import { Nexus } from '@nexusdi/core';
import { expect, it } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { COMMAND_DESK } from '../src/simulation/commands';
import { TICK_LOOP } from '../src/simulation/contracts';
import { roundSnapshot } from '../src/simulation/round-snapshot';

it('pins an hour of life support, seed 7, to the golden', async () => {
  await using nexus = await Nexus.create(meridianSystems({ seed: 7, dt: 0.5 }));
  const desk = nexus.get(COMMAND_DESK);
  const loop = nexus.get(TICK_LOOP);

  // A cold reactor sheds life support, so the reactor climbs to 1 % beside it.
  desk.submit({ system: 'engineering', action: 'throttle', level: 0.01 });
  desk.submit({ system: 'life-support', action: 'online' });

  const record = [
    roundSnapshot(loop.advance(1)),
    roundSnapshot(loop.advance(599)),
    roundSnapshot(loop.advance(6_600)),
  ];

  await expect(JSON.stringify(record, null, 2) + '\n').toMatchFileSnapshot(
    'golden/life-support.seed-7.json',
  );
});
