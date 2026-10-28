import { it } from 'vitest';

import { idleScript, recordGolden } from './golden';

it('pins the idle ship, seed 7, to the golden', () =>
  recordGolden('idle', idleScript));
