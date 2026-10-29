import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import type {
  DeckPlan,
  ShipSnapshot,
  TickContext,
} from '../../simulation/contracts';
import { SeededRandom } from '../../simulation/seeded-random';
import { shipState } from '../../../test/ship-state';

import { FTL_SPOOL } from './ftl-model';
import { FtlPhysics } from './ftl-physics';

const start = shipState(deck satisfies DeckPlan).snapshot();
const tick: TickContext = {
  tick: 301,
  dt: 0.5,
  rng: new SeededRandom({ seed: 7 }),
  start,
};

/** The ship at the start with the drive's record at `idle` and the drive unarmed. */
const idle = {
  ...start,
  ftl: { status: 'idle', charge: 0, sector: 'Sol', jumped: null },
  setpoints: { ...start.setpoints, ftl: { armed: false, jump: null } },
} satisfies ShipSnapshot;

/** The idle ship after a phase 1 that allocated the spool `allocated` W, armed. */
function armed(allocated: number): ShipSnapshot {
  return {
    ...idle,
    power: {
      ...idle.power,
      loads: [
        ...idle.power.loads,
        { id: 'ftl-spool', priority: 7, demand: 900e6, allocated },
      ],
    },
    setpoints: { ...idle.setpoints, ftl: { armed: true, jump: null } },
  };
}

/** A full spool with a jump to Kepler-442b commanded. */
const commanded: ShipSnapshot = {
  ...idle,
  ftl: { ...idle.ftl, status: 'charged', charge: FTL_SPOOL.energy },
  setpoints: { ...idle.setpoints, ftl: { armed: true, jump: 'Kepler-442b' } },
};

describe('FtlPhysics', () => {
  it('runs in phase 3 as FtlDrive', () => {
    const physics = new FtlPhysics(FTL_SPOOL);
    expect(physics.name).toBe('FtlDrive');
    expect(physics.phase).toBe(3);
    expect(FtlPhysics.phase).toBe(3);
  });

  it('returns the ship it got on an idle tick', () => {
    expect(new FtlPhysics(FTL_SPOOL).step(idle, tick)).toBe(idle);
  });

  it("charges with the spool's allocation and keeps the setpoints and the loop", () => {
    const ship = armed(900e6);
    const next = new FtlPhysics(FTL_SPOOL).step(ship, tick);
    expect(next.ftl).toEqual({
      status: 'spooling',
      charge: 450_000_000,
      sector: 'Sol',
      jumped: null,
    });
    expect(next.setpoints).toBe(ship.setpoints);
    expect(next.coolant).toBe(ship.coolant);
  });

  it('jumps on a full charge, disarms the drive and heats the loop by 10.7914 K', () => {
    const next = new FtlPhysics(FTL_SPOOL).step(commanded, tick);
    expect(next.ftl).toEqual({
      status: 'idle',
      charge: 0,
      sector: 'Kepler-442b',
      jumped: 301,
    });
    expect(next.setpoints).toEqual({
      ...commanded.setpoints,
      ftl: { armed: false, jump: null },
    });
    expect(
      next.coolant.temperature - commanded.coolant.temperature,
    ).toBeCloseTo(10.7914, 4);
  });

  it('freezes the snapshot it builds at every level', () => {
    const next = new FtlPhysics(FTL_SPOOL).step(commanded, tick);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.ftl)).toBe(true);
    expect(Object.isFrozen(next.setpoints)).toBe(true);
    expect(Object.isFrozen(next.setpoints.ftl)).toBe(true);
    expect(Object.isFrozen(next.coolant)).toBe(true);
  });
});
