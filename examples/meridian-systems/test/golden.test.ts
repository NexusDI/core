import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { goldenText, idleScript } from '../e2e/golden';
import pinNode from '../e2e/node-pin';

// The golden holds values the Node version can change in the last bit.
pinNode();

it('renders the idle script to the bytes of the recorded idle golden', async () => {
  const text = await goldenText(idleScript);
  const recorded = readFileSync(
    join(import.meta.dirname, '../e2e/golden/idle.seed-7.json'),
    'utf-8',
  );
  expect(text).toBe(recorded);
});
