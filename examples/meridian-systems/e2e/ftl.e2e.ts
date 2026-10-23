import { Nexus } from '@nexusdi/core';
import { expect, it } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { COMMAND_DESK } from '../src/simulation/commands';
import { TICK_LOOP } from '../src/simulation/contracts';
import { roundSnapshot } from '../src/simulation/round-snapshot';
import { FTL_DRIVE } from '../src/systems/ftl/contracts';
import { FtlDrive } from '../src/systems/ftl/ftl-drive.module';

it('pins a spool and a jump on the offline ship, seed 7, to the golden', async () => {
  await using nexus = await Nexus.create(meridianSystems({ seed: 7, dt: 0.5 }));
  await nexus.load(FtlDrive);
  const desk = nexus.get(COMMAND_DESK);
  const loop = nexus.get(TICK_LOOP);
  const drive = nexus.get(FTL_DRIVE);

  // The reactor reaches full output by tick 100, so the spool charges from
  // tick 101 and holds the full 90 GJ at tick 300. The jump at tick 301
  // empties it and heats the coolant loop by 10.7914 K.
  desk.submit({ system: 'engineering', action: 'throttle', level: 1 });
  loop.advance(100);
  drive.spool();
  const record = [
    roundSnapshot(loop.advance(1)),
    roundSnapshot(loop.advance(199)),
  ];
  drive.jump('Kepler-442b');
  record.push(roundSnapshot(loop.advance(1)));

  await expect(JSON.stringify(record, null, 2) + '\n').toMatchFileSnapshot(
    'golden/ftl.seed-7.json',
  );
});
