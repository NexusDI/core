import { it } from 'vitest';

import { recordGolden } from './golden';

it('pins an hour of life support, seed 7, to the golden', () =>
  recordGolden('life-support', ({ desk, loop, capture }) => {
    // A cold reactor sheds life support, so the reactor climbs to 1 % beside it.
    desk.submit({ system: 'engineering', action: 'throttle', level: 0.01 });
    desk.submit({ system: 'life-support', action: 'online' });

    capture(loop.advance(1));
    capture(loop.advance(599));
    capture(loop.advance(6_600));
  }));
