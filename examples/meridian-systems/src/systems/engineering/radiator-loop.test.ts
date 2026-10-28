import { expect, it } from 'vitest';

import { LITHIUM_LOOP } from '../../physics/thermal';

import { RadiatorLoop } from './radiator-loop';

it('carries the lithium loop rating', () => {
  expect(new RadiatorLoop().rating).toBe(LITHIUM_LOOP);
});
