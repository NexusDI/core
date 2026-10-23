import { Nexus } from '@nexusdi/core';
import { expect, it } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { COMMAND_DESK } from '../src/simulation/commands';
import { TICK_LOOP } from '../src/simulation/contracts';
import { roundSnapshot } from '../src/simulation/round-snapshot';

it('pins a course and a burn on the offline ship, seed 7, to the golden', async () => {
  await using nexus = await Nexus.create(meridianSystems({ seed: 7, dt: 0.5 }));
  const desk = nexus.get(COMMAND_DESK);
  const loop = nexus.get(TICK_LOOP);

  // The router sheds both loads at tick 1 and the drive through tick 49. The
  // drive burns along the start-of-tick attitude while the helm turns, and
  // the helm settles on the course at tick 688.
  desk.submit({ system: 'engineering', action: 'throttle', level: 0.6 });
  desk.submit({ system: 'helm', action: 'course', to: 'Kepler-442b' });
  desk.submit({ system: 'helm', action: 'burn', level: 1 });

  const record = [
    roundSnapshot(loop.advance(1)),
    roundSnapshot(loop.advance(49)),
    roundSnapshot(loop.advance(638)),
    roundSnapshot(loop.advance(512)),
  ];

  await expect(JSON.stringify(record, null, 2) + '\n').toMatchFileSnapshot(
    'golden/helm.seed-7.json',
  );
});
