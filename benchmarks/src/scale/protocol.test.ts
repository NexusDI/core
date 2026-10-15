import { mulberry32 } from '@nexusdi/bench-kit';
import { describe, expect, it, vi } from 'vitest';

// Each prefix runs a bootstrap per ratio of the metric set.
vi.setConfig({ testTimeout: 30_000 });

import { prefixWidths, protocolCheck, type ProtocolRow } from './protocol.ts';

const ROUNDS = 33;
const rand = mulberry32(11);

/** Per-round startup times: a base level times noise shared by the cell's three modes. */
function rowsFor(
  library: ProtocolRow['library'],
  size: number,
  level: number,
  factor: { heap: number; timing: number; 'timing-no-gc': number },
  noise = 0,
): ProtocolRow[] {
  const shared = Array.from(
    { length: ROUNDS },
    () => 1 + (rand() - 0.5) * noise,
  );
  return (['heap', 'timing', 'timing-no-gc'] as const).map((mode) => ({
    library,
    variant: library === 'tsyringe' ? 'decorated' : 'plain',
    size,
    mode,
    startup: shared.map((x) => x * level * factor[mode]),
  }));
}
const same = { heap: 1, timing: 0.5, 'timing-no-gc': 0.5 };

describe('protocolCheck', () => {
  it('stands when timing mode shifts every library alike', () => {
    // Halving every library's time leaves each double ratio at 1.
    const rows = [
      ...rowsFor('nexusdi', 50, 100, same),
      ...rowsFor('tsyringe', 50, 80, same),
      ...rowsFor('nexusdi', 1000, 400, same),
      ...rowsFor('tsyringe', 1000, 300, same),
    ];
    const check = protocolCheck(rows, 1);
    expect(check.timingStands).toBe(true);
    expect(check.gcBeforeCreate).toBe('keep');
    expect(check.timingVsHeap).toHaveLength(2);
    for (const d of check.timingVsHeap) {
      expect(d.ratio.median).toBeCloseTo(1, 9);
      expect(d.pass).toBe(true);
    }
  });

  it('fails when timing mode makes only NexusDI faster at one size', () => {
    const rows = [
      ...rowsFor('nexusdi', 50, 100, same),
      ...rowsFor('tsyringe', 50, 80, same),
      // NexusDI 10% faster under timing mode at 5,000, the competitor unmoved.
      ...rowsFor('nexusdi', 5000, 400, {
        heap: 1,
        timing: 0.9,
        'timing-no-gc': 0.9,
      }),
      ...rowsFor('tsyringe', 5000, 300, {
        heap: 1,
        timing: 1,
        'timing-no-gc': 1,
      }),
    ];
    const check = protocolCheck(rows, 1);
    expect(check.timingStands).toBe(false);
    const failed = check.timingVsHeap.filter((d) => !d.pass);
    expect(failed.map((d) => [d.library, d.size])).toEqual([
      ['tsyringe', 5000],
    ]);
    expect(failed[0]?.ratio.median).toBeCloseTo(0.9, 9);
  });

  it('passes a pair whose median is off by more than 2% when its interval contains 1', () => {
    // A noisy ratio: per-round double ratios scatter around 0.95.
    const rows = [
      ...rowsFor(
        'nexusdi',
        200,
        100,
        { heap: 1, timing: 0.95, 'timing-no-gc': 0.95 },
        0,
      ),
      ...rowsFor(
        'tsyringe',
        200,
        80,
        { heap: 1, timing: 1, 'timing-no-gc': 1 },
        0,
      ),
    ].map((r) =>
      // The competitor's timing rounds alternate, so its shift scatters.
      r.library === 'tsyringe' && r.mode === 'timing'
        ? {
            ...r,
            startup: r.startup.map((x, i) => x * (i % 2 === 0 ? 1.3 : 0.75)),
          }
        : r,
    );
    const check = protocolCheck(rows, 1);
    const d = check.timingVsHeap[0];
    expect(Math.abs((d?.ratio.median ?? 1) - 1)).toBeGreaterThan(0.02);
    expect(d?.ratio.low).toBeLessThanOrEqual(1);
    expect(d?.ratio.high).toBeGreaterThanOrEqual(1);
    expect(d?.pass).toBe(true);
  });

  it('drops the gc before create when mode N moves one library against another', () => {
    const rows = [
      ...rowsFor('nexusdi', 50, 100, {
        heap: 1,
        timing: 1,
        'timing-no-gc': 1.1,
      }),
      ...rowsFor('tsyringe', 50, 80, { heap: 1, timing: 1, 'timing-no-gc': 1 }),
    ];
    const check = protocolCheck(rows, 1);
    expect(check.timingStands).toBe(true);
    expect(check.gcBeforeCreate).toBe('drop');
    expect(check.noGcVsTiming[0]?.ratio.median).toBeCloseTo(1.1, 9);
  });

  it('compares each competitor and size once, NexusDI plain as the reference', () => {
    const rows = [
      ...rowsFor('nexusdi', 50, 100, same),
      ...rowsFor('awilix', 50, 70, same),
      ...rowsFor('tsyringe', 50, 80, same),
    ];
    const check = protocolCheck(rows, 1);
    expect(check.timingVsHeap.map((d) => d.library)).toEqual([
      'tsyringe',
      'awilix',
    ]);
    expect(check.rounds).toBe(ROUNDS);
  });

  it('refuses rows without NexusDI plain or without all three modes', () => {
    expect(() => protocolCheck(rowsFor('tsyringe', 50, 80, same), 1)).toThrow(
      /NexusDI plain/,
    );
    const partial = [
      ...rowsFor('nexusdi', 50, 100, same),
      ...rowsFor('tsyringe', 50, 80, same).filter((r) => r.mode !== 'heap'),
    ];
    expect(() => protocolCheck(partial, 1)).toThrow(/tsyringe.*heap/);
  });
});

describe('prefixWidths', () => {
  // Two libraries, two sizes, rounds with shared noise: widths shrink with rounds.
  const make = (n: number) => {
    const noise = Array.from({ length: n }, () => 1 + (rand() - 0.5) * 0.2);
    const cell = (
      library: 'nexusdi' | 'tsyringe',
      size: number,
      level: number,
    ) => {
      const startup = noise.map(
        (x, i) => x * level * (1 + (rand() - 0.5) * 0.05 + (i % 7) * 0.001),
      );
      return {
        library,
        variant:
          library === 'nexusdi' ? ('plain' as const) : ('decorated' as const),
        size,
        load: startup,
        create: startup,
        firstGet: startup,
        rest: startup,
        heapReady: [] as number[],
        firstResolve: startup,
        ready: startup,
        startup,
        warmup: [],
        mode: 'timing' as const,
      };
    };
    return [
      cell('nexusdi', 50, 100),
      cell('tsyringe', 50, 80),
      cell('nexusdi', 1000, 400),
      cell('tsyringe', 1000, 300),
    ];
  };

  it('reports the maximum relative width of the metric set at each prefix that fits', () => {
    const widths = prefixWidths(
      'mixed',
      make(450),
      [],
      1,
      [100, 200, 300, 400, 600, 1000],
      500,
    );
    expect(widths.map((w) => w.rounds)).toEqual([100, 200, 300, 400]);
    for (const w of widths) {
      expect(w.shape).toBe('mixed');
      expect(w.maxWidth).toBeGreaterThan(0);
      expect(w.metric).toMatch(
        /^(startup|ready|first-resolve|growth|heap-ready) /,
      );
    }
    // More rounds narrow the interval.
    expect(widths[3]?.maxWidth).toBeLessThan(widths[0]?.maxWidth ?? 0);
  });

  it('includes the growth ratios between adjacent sizes in the metric set', () => {
    const widths = prefixWidths('mixed', make(120), [], 1, [100], 200);
    expect(widths).toHaveLength(1);
  });

  it('adds the heap-ready ratios from the heap block', () => {
    const heap = make(30).map((c) => ({
      ...c,
      heapReady: c.startup,
      startup: [] as number[],
    }));
    const widths = prefixWidths('mixed', make(100), heap, 1, [100], 200);
    expect(widths).toHaveLength(1);
    expect(widths[0]?.maxWidth).toBeGreaterThan(0);
  });
});
