import { describe, expect, it } from 'vitest';

import { splitmix32 } from '../../physics/rng';

import type { CoolantRecord, PowerLoad, ReactorRecord } from './contracts';
import {
  allocatePower,
  FUSION_REACTOR,
  LITHIUM_LOOP,
  loadHeat,
  louvre,
  pulseCoolant,
  stepCoolant,
  stepReactor,
  tripped,
} from './engineering-model';

const dt = 0.5;
const cold: ReactorRecord = {
  level: 0,
  thermal: 0,
  electric: 0,
  tripped: false,
};
const standby: CoolantRecord = { temperature: 500 };

describe('the fusion reactor', () => {
  it('ramps from 0 to full in 100 steps of 0.01', () => {
    let reactor = cold;
    for (let i = 0; i < 100; i++) {
      const next = stepReactor(reactor, 1, FUSION_REACTOR, dt);
      expect(next.level - reactor.level).toBeLessThanOrEqual(0.01 + 1e-12);
      reactor = next;
    }
    expect(reactor.level).toBe(1);
  });

  it('stops the level at a throttle of 0.3', () => {
    let reactor = cold;
    for (let i = 0; i < 100; i++) {
      reactor = stepReactor(reactor, 0.3, FUSION_REACTOR, dt);
    }
    expect(reactor.level).toBe(0.3);
  });

  it('puts out 3.63 GW of heat and 1.21 GW of electricity at full', () => {
    const full = stepReactor({ ...cold, level: 1 }, 1, FUSION_REACTOR, dt);
    expect(full.thermal).toBe(3.63e9);
    expect(full.electric).toBe(1.21e9);
  });

  it('leaves the trip flag as it found it', () => {
    expect(
      stepReactor({ ...cold, tripped: true }, 1, FUSION_REACTOR, dt).tripped,
    ).toBe(true);
    expect(stepReactor(cold, 1, FUSION_REACTOR, dt).tripped).toBe(false);
  });
});

describe('the radiator louvres', () => {
  it('stay shut at and below 500 K and open fully from 550 K', () => {
    expect(louvre(450, LITHIUM_LOOP)).toBe(0);
    expect(louvre(500, LITHIUM_LOOP)).toBe(0);
    expect(louvre(525, LITHIUM_LOOP)).toBe(0.5);
    expect(louvre(550, LITHIUM_LOOP)).toBe(1);
    expect(louvre(1_200, LITHIUM_LOOP)).toBe(1);
  });
});

describe('the lithium coolant loop', () => {
  it('holds 500 K exactly for 600 steps with no heat', () => {
    let coolant = standby;
    for (let i = 0; i < 600; i++) {
      coolant = stepCoolant(coolant, 0, LITHIUM_LOOP, dt);
      expect(coolant.temperature).toBe(500);
    }
  });

  it('settles at 1,186 K under the full-output heat and never overshoots', () => {
    const heat =
      FUSION_REACTOR.thermal -
      FUSION_REACTOR.efficiency * FUSION_REACTOR.thermal;
    let coolant = standby;
    let hottest = coolant.temperature;
    for (let i = 0; i < 20_000; i++) {
      coolant = stepCoolant(coolant, heat, LITHIUM_LOOP, dt);
      hottest = Math.max(hottest, coolant.temperature);
    }
    expect(Math.abs(coolant.temperature - 1_186)).toBeLessThanOrEqual(5);
    expect(hottest).toBeLessThanOrEqual(1_191);
  });

  it('trips the reactor from 1,450 K', () => {
    expect(tripped({ temperature: 1_449.9 }, LITHIUM_LOOP)).toBe(false);
    expect(tripped({ temperature: 1_450 }, LITHIUM_LOOP)).toBe(true);
  });

  it('raises 500 K to 500.08992805755395 K with a pulse of 75,000,000 J', () => {
    expect(pulseCoolant(standby, 75_000_000, LITHIUM_LOOP)).toEqual({
      temperature: 500.08992805755395,
    });
  });
});

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
