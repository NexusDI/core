import { it } from 'vitest';

import { recordGolden } from './golden';

it('pins a course and a burn on the offline ship, seed 7, to the golden', () =>
  recordGolden('helm', ({ desk, loop, capture }) => {
    // The router sheds both loads at tick 1 and the drive through tick 49. The
    // drive burns along the start-of-tick attitude while the helm turns, and
    // the helm settles on the course at tick 688.
    desk.submit({ system: 'engineering', action: 'throttle', level: 0.6 });
    desk.submit({ system: 'helm', action: 'course', to: 'Kepler-442b' });
    desk.submit({ system: 'helm', action: 'burn', level: 1 });

    capture(loop.advance(1));
    capture(loop.advance(49));
    capture(loop.advance(638));
    capture(loop.advance(512));
  }));
