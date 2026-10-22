import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { stepComms } from '../../physics/comms';
import type {
  DeckPlan,
  ShipSnapshot,
  TickContext,
} from '../../simulation/contracts';
import { SeededRandom } from '../../simulation/seeded-random';
import { ShipStateStore } from '../../simulation/ship-state-store';
import { CommsPhysics } from './comms-physics';
import type { ICommsArray } from './contracts';

const idle = new ShipStateStore(deck satisfies DeckPlan).snapshot();
const tick: TickContext = {
  tick: 1,
  dt: 0.5,
  rng: new SeededRandom({ seed: 7 }),
  start: idle,
};

/** An array that reads `linked` and never queues. */
function array(linked: boolean): ICommsArray {
  return {
    linked,
    hail: () => {
      throw new Error('the step queues nothing');
    },
  };
}

/** The idle ship with a hail queued and the loads `shed`. */
function hailing(shed: readonly string[] = []): ShipSnapshot {
  return {
    ...idle,
    power: { ...idle.power, shed },
    setpoints: { ...idle.setpoints, comms: { hail: true } },
  };
}

describe('CommsPhysics', () => {
  it('runs in phase 6 as Comms', () => {
    const physics = new CommsPhysics(array(true));
    expect(physics.name).toBe('Comms');
    expect(physics.phase).toBe(6);
    expect(CommsPhysics.phase).toBe(6);
  });

  it('returns the ship it got with no hail and no reply due', () => {
    expect(new CommsPhysics(array(true)).step(idle, tick)).toBe(idle);
  });

  it('returns the ship it got once the offline array reports no link', () => {
    const physics = new CommsPhysics(array(false));
    const first = physics.step(hailing(), tick);
    expect(physics.step(first, { ...tick, tick: 2 })).toBe(first);
  });

  it('sends the hail with the link and the power', () => {
    const ship = hailing();
    const next = new CommsPhysics(array(true)).step(ship, tick);
    expect(next.comms).toEqual(
      stepComms(ship.comms, ship.setpoints.comms, {
        tick: 1,
        dt: 0.5,
        linked: true,
        shed: false,
      }).record,
    );
    expect(next.comms).toEqual({
      status: 'awaiting reply',
      sent: 1,
      messages: [],
    });
    expect(next.setpoints.comms).toEqual({ hail: false });
    expect(next.setpoints.safety).toBe(ship.setpoints.safety);
    expect(next.power).toBe(ship.power);
  });

  it('reads the shed comms load from the router', () => {
    const next = new CommsPhysics(array(true)).step(hailing(['comms']), tick);
    expect(next.comms.status).toBe('no power');
    expect(next.setpoints.comms).toEqual({ hail: true });
  });

  it('reports no subspace link without the link', () => {
    const next = new CommsPhysics(array(false)).step(hailing(), tick);
    expect(next.comms.status).toBe('no subspace link');
    expect(next.setpoints.comms).toEqual({ hail: true });
  });

  it('returns a frozen snapshot with frozen setpoints', () => {
    const next = new CommsPhysics(array(true)).step(hailing(), tick);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.setpoints)).toBe(true);
    expect(Object.isFrozen(next.setpoints.comms)).toBe(true);
    expect(Object.isFrozen(next.comms)).toBe(true);
    expect(Object.isFrozen(next.comms.messages)).toBe(true);
  });
});
