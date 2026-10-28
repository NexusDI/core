import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import { PowerBudgetError } from '../../errors';
import type { PowerLoad } from '../../physics/power';
import type { DeckPlan, ShipSnapshot } from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';

import type { IPowerConsumer, IShieldGrid } from './contracts';
import { PlasmaRouter } from './plasma-router';

const RAISED: PowerLoad = {
  id: 'shields',
  priority: 2,
  demand: 200e6,
  heatShare: 0.25,
};

/** A consumer that draws `load` on every tick, and the ships it read. */
function consumer(load: PowerLoad) {
  const seen: ShipSnapshot[] = [];
  const double: IPowerConsumer = {
    draw(at) {
      seen.push(at);
      return load;
    },
  };
  return { double, seen };
}

/**
 * A store whose reactor gives `electric` W, a grid that draws `draw`, and the
 * `consumers` on the router.
 */
function build(
  electric: number,
  draw: PowerLoad = { ...RAISED, demand: 0 },
  consumers: IPowerConsumer[] = [],
) {
  const state = new ShipStateStore(deck satisfies DeckPlan);
  const ship = state.snapshot();
  state.commit({ ...ship, reactor: { ...ship.reactor, electric } });
  const seen: ShipSnapshot[] = [];
  let calls = 0;
  const grid: IShieldGrid = {
    draw(at) {
      seen.push(at);
      return draw;
    },
    raise: () => ({ tick: 1 }),
    lower: () => ({ tick: 1 }),
  };
  const router = new PlasmaRouter(
    state,
    () => {
      calls += 1;
      return grid;
    },
    consumers,
  );
  return { state, router, seen, calls: () => calls };
}

/** What `router.divert(load)` threw. */
function refusal(router: PlasmaRouter, load: PowerLoad): unknown {
  try {
    router.divert(load);
  } catch (error) {
    return error;
  }
  throw new Error('divert() accepted the load');
}

describe('PlasmaRouter', () => {
  it('reads the shield grid only when it lists the loads', () => {
    const { state, router, seen, calls } = build(0);
    expect(calls()).toBe(0);
    const ship = state.snapshot();
    expect(router.loads(ship)).toEqual([{ ...RAISED, demand: 0 }]);
    expect(calls()).toBe(1);
    expect(seen).toEqual([ship]);
  });

  it('lists the shields load, then the draw of each consumer in order', () => {
    const pump = consumer({
      id: 'pump',
      priority: 1,
      demand: 400,
      heatShare: 0,
    });
    const lamp = consumer({
      id: 'lamp',
      priority: 3,
      demand: 60,
      heatShare: 0,
    });
    const { state, router } = build(0, RAISED, [pump.double, lamp.double]);
    const ship = state.snapshot();
    expect(router.loads(ship).map((load) => load.id)).toEqual([
      'shields',
      'pump',
      'lamp',
    ]);
    expect(pump.seen).toEqual([ship]);
    expect(lamp.seen).toEqual([ship]);
  });

  it('fits 200 MW of shields beside a consumer of 5.7 MW at 205.7 MW', () => {
    const pump = consumer({
      id: 'pump',
      priority: 1,
      demand: 5.7e6,
      heatShare: 0,
    });
    expect(() =>
      build(205.7e6, undefined, [pump.double]).router.divert(RAISED),
    ).not.toThrow();
  });

  it('refuses 200 MW of shields beside a consumer served first of 5.8 MW at 205.7 MW', () => {
    const pump = consumer({
      id: 'pump',
      priority: 1,
      demand: 5.8e6,
      heatShare: 0,
    });
    const { router } = build(205.7e6, undefined, [pump.double]);
    expect(refusal(router, RAISED)).toMatchObject({
      consumer: 'shields',
      demand: 200e6,
      available: 205.7e6 - 5.8e6,
    });
  });

  it('refuses 200 MW of shields at 193.6 MW', () => {
    const { router } = build(193.6e6);
    const error = refusal(router, RAISED);
    expect(error).toBeInstanceOf(PowerBudgetError);
    expect(error).toMatchObject({
      code: 'MERIDIAN_POWER_BUDGET',
      consumer: 'shields',
      demand: 200e6,
      available: 193.6e6,
    });
  });

  it('fits 200 MW of shields at 205.7 MW', () => {
    expect(() => build(205.7e6).router.divert(RAISED)).not.toThrow();
  });

  it('counts the loads served first against a new load', () => {
    const { router } = build(300e6, RAISED);
    const drive: PowerLoad = {
      id: 'drive',
      priority: 3,
      demand: 150e6,
      heatShare: 0,
    };
    expect(refusal(router, drive)).toMatchObject({
      consumer: 'drive',
      demand: 150e6,
      available: 100e6,
    });
  });

  it('counts a load of the same priority served first by id against a new load', () => {
    const { router } = build(250e6, RAISED);
    const zeta: PowerLoad = {
      id: 'zeta',
      priority: 2,
      demand: 100e6,
      heatShare: 0,
    };
    expect(refusal(router, zeta)).toMatchObject({
      consumer: 'zeta',
      demand: 100e6,
      available: 50e6,
    });
  });

  it('swaps a load in by id, so the current draw of the grid does not count twice', () => {
    expect(() => build(250e6, RAISED).router.divert(RAISED)).not.toThrow();
  });

  describe('attach', () => {
    const pump = (): PowerLoad => ({
      id: 'pump',
      priority: 1,
      demand: 400,
      heatShare: 0,
    });
    const spool: PowerLoad = {
      id: 'ftl-spool',
      priority: 7,
      demand: 0,
      heatShare: 0.1,
    };

    it('lists an attached consumer after the consumers of POWER_CONSUMERS', () => {
      const listed = consumer(pump());
      const attached = consumer(spool);
      const { state, router } = build(0, RAISED, [listed.double]);
      router.attach(attached.double);
      const ship = state.snapshot();
      expect(router.loads(ship).map((load) => load.id)).toEqual([
        'shields',
        'pump',
        'ftl-spool',
      ]);
      expect(attached.seen).toEqual([ship]);
    });

    it('counts an attached load against a new load', () => {
      const { router } = build(250e6, RAISED);
      router.attach(consumer({ ...spool, priority: 1, demand: 100e6 }).double);
      expect(refusal(router, { ...RAISED, priority: 3 })).toMatchObject({
        consumer: 'shields',
        available: 150e6,
      });
    });

    it('removes one attach of a consumer attached twice at its detach', () => {
      const { state, router } = build(0, RAISED);
      const double = consumer(spool).double;
      const detach = router.attach(double);
      router.attach(double);
      detach();
      expect(router.loads(state.snapshot()).map((load) => load.id)).toEqual([
        'shields',
        'ftl-spool',
      ]);
    });

    it('removes the consumer at its detach, which runs twice safely', () => {
      const { state, router } = build(0, RAISED, [consumer(pump()).double]);
      const detach = router.attach(consumer(spool).double);
      detach();
      detach();
      expect(router.loads(state.snapshot()).map((load) => load.id)).toEqual([
        'shields',
        'pump',
      ]);
    });
  });
});
