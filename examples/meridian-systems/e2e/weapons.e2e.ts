import { Nexus } from '@nexusdi/core';
import { expect, it } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { COMMAND_DESK } from '../src/simulation/commands';
import { TICK_LOOP } from '../src/simulation/contracts';
import { roundSnapshot } from '../src/simulation/round-snapshot';

it('pins two railgun shots on the offline ship, seed 7, to the golden', async () => {
  await using nexus = await Nexus.create(meridianSystems({ seed: 7, dt: 0.5 }));
  const desk = nexus.get(COMMAND_DESK);
  const loop = nexus.get(TICK_LOOP);

  // The fire after tick 30 arms the mount. The capacitor holds 150 MJ at
  // tick 31 and fires the hit at 10,000 m at tick 32. It fills at tick 35 on
  // a tapered 200 MW. The fire after tick 40 leaves the full bank at tick 41
  // and misses at 50,000 m.
  desk.submit({ system: 'engineering', action: 'throttle', level: 1 });
  loop.advance(30);
  desk.submit({ system: 'weapons', action: 'fire', range: 10_000 });
  const record = [
    roundSnapshot(loop.advance(1)),
    roundSnapshot(loop.advance(1)),
    roundSnapshot(loop.advance(3)),
  ];
  loop.advance(5);
  desk.submit({ system: 'weapons', action: 'fire', range: 50_000 });
  record.push(roundSnapshot(loop.advance(1)));

  await expect(JSON.stringify(record, null, 2) + '\n').toMatchFileSnapshot(
    'golden/weapons.seed-7.json',
  );
});
