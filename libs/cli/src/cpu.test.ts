import { appendFileSync } from 'node:fs';

import type { CpuProfile } from '@nexusdi/devtools';
import { describe, expect, it } from 'vitest';

import { alignClocks, cpuWarning, startCpu, stopCpu } from './cpu.js';

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
    const aligned = alignClocks(
      profile,
      [
        ['nexusdiAnchorStart', 10, 10.15],
        ['nexusdiAnchorEnd', 15.2, 15.35],
      ],
      100,
    );
    expect(aligned?.offsetMs).toBeCloseTo(990.075, 6);
    expect(aligned?.errorMs).toBeCloseTo(0.025, 6);
    expect(aligned?.consistent).toBe(true);
  });

  it('reports half the gap when the bounds cross, and stays consistent within max(1 ms, 4 samples)', () => {
    // End: 1005.3 ms in [16, 16.1] -> [989.2, 989.3]; a 0.75 ms gap below Start's 990.05.
    const aligned = alignClocks(
      profile,
      [
        ['nexusdiAnchorStart', 10, 10.15],
        ['nexusdiAnchorEnd', 16, 16.1],
      ],
      100,
    );
    expect(aligned?.offsetMs).toBeCloseTo(989.675, 6);
    expect(aligned?.errorMs).toBeCloseTo(0.375, 6);
    expect(aligned?.consistent).toBe(true);
  });

  it('is inconsistent when the bounds cross by more than max(1 ms, 4 samples)', () => {
    // End: 1005.3 ms in [17, 17.1] -> [988.2, 988.3]; a 1.75 ms gap.
    const anchors = [
      ['nexusdiAnchorStart', 10, 10.15],
      ['nexusdiAnchorEnd', 17, 17.1],
    ] as const;
    const aligned = alignClocks(profile, anchors, 100);
    expect(aligned?.errorMs).toBeCloseTo(0.875, 6);
    expect(aligned?.consistent).toBe(false);
    // At 500 µs the bound is 2 ms, so the same gap is consistent.
    expect(alignClocks(profile, anchors, 500)?.consistent).toBe(true);
  });

  it('counts a sample whose spin frame the optimizer inlined away', () => {
    // Sample 2 holds the anchor alone, as an optimized anchor with its spin
    // inlined reports it: 1000.1 and 1000.2 ms both count.
    const aligned = alignClocks(
      { ...profile, samples: [1, 2, 4, 1, 5] },
      [['nexusdiAnchorStart', 10, 10.15]],
      100,
    );
    expect(aligned?.offsetMs).toBeCloseTo(990.075, 6);
    expect(aligned?.errorMs).toBeCloseTo(0.025, 6);
  });

  it('aligns from one anchor when the other has no sample', () => {
    const aligned = alignClocks(
      { ...profile, samples: [1, 1, 1, 1, 5] },
      [
        ['nexusdiAnchorStart', 10, 10.15],
        ['nexusdiAnchorEnd', 15.2, 15.35],
      ],
      100,
    );
    expect(aligned?.offsetMs).toBeCloseTo(990.025, 6);
  });

  it('returns null when no anchor has a sample', () => {
    expect(
      alignClocks(
        { ...profile, samples: [1, 1, 1, 1, 1] },
        [
          ['nexusdiAnchorStart', 10, 12],
          ['nexusdiAnchorEnd', 15, 17],
        ],
        100,
      ),
    ).toBeNull();
  });
});

describe('cpuWarning', () => {
  it('says the clocks disagree, by the gap between the bounds, when they cross', () => {
    expect(
      cpuWarning({ offsetMs: 0, errorMs: 0.875, consistent: false }, 100),
    ).toBe(
      'nexusdi: warning: the CPU clock and performance.now() disagree by 1.8 ms; CPU samples may sit up to 0.9 ms off the provider spans.\n',
    );
  });

  it('says the sampler ran too rarely when the error passes max(1 ms, 4 samples)', () => {
    expect(
      cpuWarning({ offsetMs: 0, errorMs: 1.84, consistent: true }, 100),
    ).toBe(
      'nexusdi: warning: the sampler ran too rarely to align the clocks; CPU samples may sit up to 1.8 ms off the provider spans.\n',
    );
    expect(
      cpuWarning({ offsetMs: 0, errorMs: 1.9, consistent: true }, 500),
    ).toBeNull();
  });

  it('says nothing for a consistent alignment within the bound', () => {
    expect(
      cpuWarning({ offsetMs: 0, errorMs: 0.05, consistent: true }, 100),
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
    expect(alignClocks(recorded, anchors, 100)).not.toBeNull();
  });

  // The figure the docs' error bar cites (spec 8). CI appends it to the job
  // summary; the max goes unasserted, since it follows the runner's load.
  it('align 10 runs at 100 µs with a median error within max(1 ms, 4 samples)', async () => {
    const interval = 100;
    const errors: number[] = [];
    let inconsistent = 0;
    for (let run = 0; run < 10; run++) {
      const { profile: recorded, anchors } = await stopCpu(
        await startCpu(interval),
      );
      const aligned = alignClocks(recorded, anchors, interval);
      expect(aligned).not.toBeNull();
      if (aligned === null) return;
      errors.push(aligned.errorMs);
      if (!aligned.consistent) inconsistent++;
    }
    errors.sort((a, b) => a - b);
    const median = ((errors[4] ?? 0) + (errors[5] ?? 0)) / 2;
    const max = errors[9] ?? 0;
    const line = `CPU clock alignment on ${process.platform}, Node ${process.versions.node}, 10 runs at ${interval} µs: errorMs median ${median.toFixed(3)} ms, max ${max.toFixed(3)} ms, ${inconsistent} inconsistent.`;
    console.log(line);
    const summary = process.env['GITHUB_STEP_SUMMARY'];
    if (summary !== undefined) appendFileSync(summary, `${line}\n`);
    expect(median).toBeLessThanOrEqual(Math.max(1, (4 * interval) / 1000));
  });
});
