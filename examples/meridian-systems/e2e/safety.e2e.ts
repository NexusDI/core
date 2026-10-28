import { it } from 'vitest';

import { recordGolden } from './golden';

it('pins an airlock cycle through an open door, seed 7, to the golden', () =>
  recordGolden('safety', ({ desk, loop, capture }) => {
    // A cold reactor sheds life support, so the reactor climbs to 1 % beside it.
    desk.submit({ system: 'engineering', action: 'throttle', level: 0.01 });
    desk.submit({ system: 'life-support', action: 'online' });
    desk.submit({
      system: 'life-support',
      action: 'pump',
      compartment: 'airlock',
      mode: 'evacuate',
    });
    capture(loop.advance(120));

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

    capture(loop.advance(1));
    capture(loop.advance(19));
  }));
