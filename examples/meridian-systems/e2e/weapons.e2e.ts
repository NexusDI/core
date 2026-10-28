import { it } from 'vitest';

import { recordGolden } from './golden';

it('pins two railgun shots on the offline ship, seed 7, to the golden', () =>
  recordGolden('weapons', ({ desk, loop, capture }) => {
    // The fire after tick 30 arms the mount. The capacitor holds 150 MJ at
    // tick 31 and fires the hit at 10,000 m at tick 32. It fills at tick 35 on
    // a tapered 200 MW. The fire after tick 40 leaves the full bank at tick 41
    // and misses at 50,000 m.
    desk.submit({ system: 'engineering', action: 'throttle', level: 1 });
    loop.advance(30);
    desk.submit({ system: 'weapons', action: 'fire', range: 10_000 });
    capture(loop.advance(1));
    capture(loop.advance(1));
    capture(loop.advance(3));
    loop.advance(5);
    desk.submit({ system: 'weapons', action: 'fire', range: 50_000 });
    capture(loop.advance(1));
  }));
