import { afterEach, it, vi } from 'vitest';

import { RELAY_URL } from '../test/support';
import { BUNDLED_CHARTS } from '../src/systems/tactical/star-charts';

import { recordGolden } from './golden';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('pins a hail and its reply on the linked ship, seed 7, to the golden', () => {
  // The relay graph downloads its charts at build, from a stubbed relay.
  vi.stubGlobal('fetch', () => Promise.resolve(Response.json(BUNDLED_CHARTS)));
  return recordGolden(
    'comms',
    ({ desk, loop, capture }) => {
      // The reactor at 1 % powers the hail's 5 MW on the tick the array sends it.
      desk.submit({ system: 'engineering', action: 'throttle', level: 0.01 });
      desk.submit({ system: 'life-support', action: 'online' });
      desk.submit({ system: 'comms', action: 'hail' });

      capture(loop.advance(1));
      capture(loop.advance(4));
      capture(loop.advance(595));
    },
    { relayUrl: RELAY_URL },
  );
});
