import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runTimings, type TimingFixture } from './orchestrator.ts';

const fake: TimingFixture = {
  library: 'fake',
  variant: 'plain',
  module: join(
    import.meta.dirname,
    '..',
    '..',
    'fixtures',
    '__test__',
    'fake.mjs',
  ),
  scenarios: ['ready', 'resolve-singleton', 'resolve-transient', 'scope-cycle'],
};

afterEach(() => {
  delete process.env.FAKE_BREAK;
});

describe('runTimings', () => {
  it('samples every scenario the fixture passes', async () => {
    const rows = await runTimings({ fixtures: [fake], quick: true, seed: 1 });
    expect(rows.map((r) => r.scenario)).toEqual([
      'ready',
      'resolve-singleton',
      'resolve-transient',
      'scope-cycle',
    ]);
    for (const r of rows) {
      expect(r.batch).toBeGreaterThanOrEqual(1);
      expect(r.samples.measured).toHaveLength(50);
    }
    expect(rows[0]?.heapBytes).toBeTypeOf('number');
  }, 120_000);
  it('fails the run naming the fixture and scenario when a worker throws', async () => {
    process.env.FAKE_BREAK = 'throw';
    await expect(
      runTimings({ fixtures: [fake], quick: true, seed: 1 }),
    ).rejects.toThrow(/fake\/plain resolve-transient (calibration|round \d+)/);
  }, 120_000);
});
