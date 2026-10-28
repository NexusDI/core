import { expect, it } from 'vitest';

import { LITHIUM_LOOP } from './engineering-model';
import { RadiatorLoop } from './radiator-loop';

it('carries the lithium loop rating', () => {
  expect(new RadiatorLoop().rating).toBe(LITHIUM_LOOP);
});
