import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { coldStart } from './cold-start.ts';

const fake = join(
  import.meta.dirname,
  '..',
  '..',
  'fixtures',
  '__test__',
  'fake.mjs',
);

describe('coldStart', () => {
  it('times every fixture once per measured round, spawn included', async () => {
    const rows = await coldStart(
      [
        { library: 'a', variant: 'plain', module: fake },
        { library: 'b', variant: 'plain', module: fake },
      ],
      { warmup: 1, measured: 3, seed: 1 },
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.spawnNs).toHaveLength(3);
      expect(row.childMs).toHaveLength(3);
      row.spawnNs.forEach((ns, i) =>
        expect(ns).toBeGreaterThan((row.childMs[i] ?? 0) * 1e6),
      );
    }
  }, 60_000);
});
