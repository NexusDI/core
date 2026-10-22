import { Nexus } from '@nexusdi/core';
import { expect, it } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { COMMAND_DESK } from '../src/simulation/commands';
import { TICK_LOOP } from '../src/simulation/contracts';
import { roundSnapshot } from '../src/simulation/round-snapshot';

it('pins an airlock cycle through an open door, seed 7, to the golden', async () => {
  await using nexus = await Nexus.create(meridianSystems({ seed: 7, dt: 0.5 }));
  const desk = nexus.get(COMMAND_DESK);
  const loop = nexus.get(TICK_LOOP);

  // A cold reactor sheds life support, so the reactor climbs to 1 % beside it.
  desk.submit({ system: 'engineering', action: 'throttle', level: 0.01 });
  desk.submit({ system: 'life-support', action: 'online' });
  desk.submit({
    system: 'life-support',
    action: 'pump',
    compartment: 'airlock',
    mode: 'evacuate',
  });
  const evacuated = roundSnapshot(loop.advance(120));

  desk.submit({
    system: 'life-support',
    action: 'pump',
    compartment: 'airlock',
    mode: 'fill',
  });
  loop.advance(69);

  // At tick 189 the door holds 4,391 Pa, under the interlock's 5,000 Pa.
  desk.submit({
    system: 'life-support',
    action: 'pump',
    compartment: 'airlock',
    mode: 'off',
  });
  desk.submit({ system: 'safety', action: 'open', door: 'habitat-airlock' });

  const record = [
    evacuated,
    roundSnapshot(loop.advance(1)),
    roundSnapshot(loop.advance(19)),
  ];

  await expect(JSON.stringify(record, null, 2) + '\n').toMatchFileSnapshot(
    'golden/safety.seed-7.json',
  );
});
