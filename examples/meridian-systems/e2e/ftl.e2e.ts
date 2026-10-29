import { it } from 'vitest';

import { FtlDrive } from '../src/systems/ftl/ftl-drive.module';

import { recordGolden } from './golden';

it('pins a spool and a jump on the offline ship, seed 7, to the golden', () =>
  recordGolden('ftl', async ({ nexus, desk, loop, capture }) => {
    // The loaded drive registers its commands, so the desk serves ftl.
    await nexus.load(FtlDrive);

    // The reactor reaches full output by tick 100, so the spool charges from
    // tick 101 and holds the full 90 GJ at tick 300. The jump at tick 301
    // empties it and heats the coolant loop by 10.7914 K.
    desk.submit({ system: 'engineering', action: 'throttle', level: 1 });
    loop.advance(100);
    desk.submit({ system: 'ftl', action: 'spool' });
    capture(loop.advance(1));
    capture(loop.advance(199));
    desk.submit({ system: 'ftl', action: 'jump', to: 'Kepler-442b' });
    capture(loop.advance(1));
  }));
