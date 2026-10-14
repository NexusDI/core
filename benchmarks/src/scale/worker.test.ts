import { forkWorker } from '@nexusdi/bench-kit';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { checkFloor } from '../timings/floor.ts';

const WORKER = join(import.meta.dirname, 'worker.mjs');
const FAKE = join(
  import.meta.dirname,
  '..',
  '..',
  'fixtures',
  '__test__',
  'fake-scale.mjs',
);

const dir = mkdtempSync(join(tmpdir(), 'scale-worker-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const log = join(dir, 'gets.log');

// The fake app with every get logged, so the test sees the visit order.
const bundle = join(dir, 'bundle.mjs');
writeFileSync(
  bundle,
  `import { appendFileSync } from 'node:fs';
import { scale as fake } from ${JSON.stringify(pathToFileURL(FAKE).href)};
export const scale = {
  ...fake,
  get(handle, index) {
    appendFileSync(${JSON.stringify(log)}, index + '\\n');
    return fake.get(handle, index);
  },
};
`,
);

describe('the get-cycle worker', () => {
  it('answers calibrate and sample, visiting every entry in order', async () => {
    writeFileSync(log, '');
    const worker = forkWorker('fake/get-cycle', WORKER, [bundle]);
    try {
      const batch = await worker.calibrate('get-cycle');
      expect(batch).toBeGreaterThanOrEqual(1);
      const s = await worker.sample('get-cycle', 4);
      expect(s.batch).toBe(4);
      expect(s.ns).toBeGreaterThan(0);
    } finally {
      worker.close();
    }
    const visits = readFileSync(log, 'utf8').trim().split('\n').map(Number);
    // Setup resolves every provider once, in index order.
    expect(visits.slice(0, 6)).toEqual([0, 1, 2, 3, 4, 5]);
    // The cycle then alternates over the entries [4, 5], from the first.
    const cycle = visits.slice(6);
    expect(cycle.length).toBeGreaterThan(4);
    cycle.forEach((index, i) => expect(index).toBe(i % 2 === 0 ? 4 : 5));
  }, 60_000);
});

describe('checkFloor on get-cycle', () => {
  it('fails a 1 ns median', () => {
    expect(() =>
      checkFloor([
        {
          library: 'x',
          variant: 'plain',
          scenario: 'get-cycle',
          stats: { median: 1 },
        },
      ]),
    ).toThrow(/below the 2 ns floor: x\/plain get-cycle/);
  });
});
