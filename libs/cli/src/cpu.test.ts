import type { CpuProfile } from '@nexusdi/devtools';
import { describe, expect, it } from 'vitest';

import { alignClocks, startCpu, stopCpu } from './cpu.js';

const frame = (functionName: string) => ({
  functionName,
  scriptId: '1',
  url: '',
  lineNumber: 0,
  columnNumber: 0,
});
const profile: CpuProfile = {
  nodes: [
    { id: 1, callFrame: frame('(root)'), children: [2, 3] },
    { id: 2, callFrame: frame('nexusdiAnchorStart'), children: [4] },
    { id: 3, callFrame: frame('nexusdiAnchorEnd'), children: [5] },
    { id: 4, callFrame: frame('nexusdiAnchorSpin') },
    { id: 5, callFrame: frame('nexusdiAnchorSpin') },
  ],
  startTime: 1_000_000,
  endTime: 1_010_000,
  samples: [1, 4, 4, 1, 5],
  timeDeltas: [0, 100, 100, 5000, 100],
};

// Sample times: 1000.0, 1000.1, 1000.2, 1005.2 and 1005.3 ms.
describe('alignClocks', () => {
  it('bounds the offset by every spin sample of both anchors and takes the middle', () => {
    // Start: 1000.1 and 1000.2 ms in [10, 10.15] -> offset in [990.05, 990.1].
    // End: 1005.3 ms in [15.2, 15.35] -> [989.95, 990.1]; both: [990.05, 990.1].
    const aligned = alignClocks(profile, [
      ['nexusdiAnchorStart', 10, 10.15],
      ['nexusdiAnchorEnd', 15.2, 15.35],
    ]);
    expect(aligned?.offsetMs).toBeCloseTo(990.075, 6);
    expect(aligned?.errorMs).toBeCloseTo(0.025, 6);
  });

  it('reports half the gap when the anchors disagree', () => {
    // End: 1005.3 ms in [16, 16.1] -> [989.2, 989.3], below Start's 990.05.
    const aligned = alignClocks(profile, [
      ['nexusdiAnchorStart', 10, 10.15],
      ['nexusdiAnchorEnd', 16, 16.1],
    ]);
    expect(aligned?.offsetMs).toBeCloseTo(989.675, 6);
    expect(aligned?.errorMs).toBeCloseTo(0.375, 6);
  });

  it('skips a sample in the anchor before its spin, where the clock read was still running', () => {
    // Sample 2 holds the anchor but no spin; only 1000.2 ms counts.
    const aligned = alignClocks({ ...profile, samples: [1, 2, 4, 1, 5] }, [
      ['nexusdiAnchorStart', 10, 10.15],
    ]);
    expect(aligned?.offsetMs).toBeCloseTo(990.125, 6);
    expect(aligned?.errorMs).toBeCloseTo(0.075, 6);
  });

  it('aligns from one anchor when the other has no sample', () => {
    const aligned = alignClocks({ ...profile, samples: [1, 1, 1, 1, 5] }, [
      ['nexusdiAnchorStart', 10, 10.15],
      ['nexusdiAnchorEnd', 15.2, 15.35],
    ]);
    expect(aligned?.offsetMs).toBeCloseTo(990.025, 6);
  });

  it('returns null when no anchor has a sample', () => {
    expect(
      alignClocks({ ...profile, samples: [1, 1, 1, 1, 1] }, [
        ['nexusdiAnchorStart', 10, 12],
        ['nexusdiAnchorEnd', 15, 17],
      ]),
    ).toBeNull();
  });
});

describe('startCpu and stopCpu', () => {
  // The error depends on how often the OS lets the sampler run, so this
  // test holds only that the anchors get a sample; the CLI warns on error.
  it('sample the anchors in this process', async () => {
    const { profile: recorded, anchors } = await stopCpu(await startCpu(100));
    expect(anchors.map(([name]) => name)).toEqual([
      'nexusdiAnchorStart',
      'nexusdiAnchorEnd',
    ]);
    for (const [, startMs, endMs] of anchors)
      expect(endMs - startMs).toBeGreaterThanOrEqual(10);
    expect(alignClocks(recorded, anchors)).not.toBeNull();
  });
});
