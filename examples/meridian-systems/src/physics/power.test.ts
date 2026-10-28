import { describe, expect, it } from 'vitest';

import { allocatePower, loadHeat, type PowerLoad } from './power';
import { splitmix32 } from './rng';

const FULL = 1.21e9;

function load(
  id: string,
  priority: number,
  demand: number,
  heatShare = 0,
): PowerLoad {
  return { id, priority, demand, heatShare };
}

/** The seven consumers on the router at full demand. */
function consumers(drive = 600e6, weapons = 300e6): PowerLoad[] {
  return [
    load('ftl-spool', 7, 900e6, 0.1),
    load('weapons', 6, weapons),
    load('main-drive', 5, drive, 0.4),
    load('helm', 4, 20e6),
    load('comms', 3, 5e6),
    load('shields', 2, 200e6, 0.25),
    load('life-support', 1, 40e3),
  ];
}

function allocated(record: ReturnType<typeof allocatePower>): number {
  return record.loads.reduce((sum, entry) => sum + entry.allocated, 0);
}

describe('allocatePower', () => {
  it('fills the loads in priority order, then by id', () => {
    const record = allocatePower(100, [
      load('b', 2, 10),
      load('c', 1, 10),
      load('a', 2, 10),
    ]);
    expect(record.loads.map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
    expect(record.output).toBe(100);
    expect(record.shed).toEqual([]);
  });

  it('sheds a load that does not fit and still serves a later, smaller one', () => {
    const record = allocatePower(100, [
      load('first', 1, 60),
      load('second', 2, 50),
      load('third', 3, 30),
    ]);
    expect(record.loads).toEqual([
      { id: 'first', priority: 1, demand: 60, allocated: 60 },
      { id: 'second', priority: 2, demand: 50, allocated: 0 },
      { id: 'third', priority: 3, demand: 30, allocated: 30 },
    ]);
    expect(record.shed).toEqual(['second']);
  });

  it('serves two loads of one priority by id, so the later id is shed', () => {
    const record = allocatePower(250e6, [
      load('shields', 2, 200e6, 0.25),
      load('aux', 2, 100e6),
    ]);
    expect(record.loads).toEqual([
      { id: 'aux', priority: 2, demand: 100e6, allocated: 100e6 },
      { id: 'shields', priority: 2, demand: 200e6, allocated: 0 },
    ]);
    expect(record.shed).toEqual(['shields']);
  });

  it('never sheds a load that demands nothing', () => {
    const record = allocatePower(0, [load('idle', 1, 0)]);
    expect(record.loads[0].allocated).toBe(0);
    expect(record.shed).toEqual([]);
  });

  it('sheds the FTL spool alone at full demand and leaves 85 MW', () => {
    const record = allocatePower(FULL, consumers());
    expect(record.shed).toEqual(['ftl-spool']);
    expect(FULL - allocated(record)).toBeCloseTo(84.96e6, 0);
  });

  it('fits the spool with the drive and the weapons at 0', () => {
    const record = allocatePower(FULL, consumers(0, 0));
    expect(record.shed).toEqual([]);
    expect(FULL - allocated(record)).toBeCloseTo(84.96e6, 0);
  });
});

describe('loadHeat', () => {
  it('sums each heat share times the power allocated', () => {
    const loads = consumers();
    const record = allocatePower(FULL, loads);
    // 0.25 · 200 MW for the shields and 0.4 · 600 MW for the drive. The shed spool adds nothing.
    expect(loadHeat(record, loads)).toBeCloseTo(290e6, 0);
  });
});

describe('allocatePower over random loads', () => {
  it('holds its invariants on 500 load sets drawn from seed 7', () => {
    let state = 7;
    const draw = (): number => {
      const step = splitmix32(state);
      state = step.state;
      return step.value;
    };
    for (let set = 0; set < 500; set++) {
      const output = draw() % 1_210_000_001;
      const count = 1 + (draw() % 8);
      const loads: PowerLoad[] = [];
      for (let i = 0; i < count; i++) {
        const demand = draw() % 4 === 0 ? 0 : draw() % 900_000_001;
        loads.push(load(`load-${i}`, 1 + (draw() % 7), demand));
      }
      const record = allocatePower(output, loads);

      expect(record.loads).toHaveLength(loads.length);
      expect(allocated(record)).toBeLessThanOrEqual(output);
      for (const entry of record.loads) {
        expect([0, entry.demand]).toContain(entry.allocated);
      }
      expect(record.shed).toEqual(
        record.loads
          .filter((entry) => entry.demand > 0 && entry.allocated === 0)
          .map((entry) => entry.id),
      );
    }
  });
});
