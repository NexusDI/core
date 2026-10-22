import { describe, expect, it } from 'vitest';
import deck from '../../deck/meridian.deck.json';
import { AIR, molesAt } from '../physics/gas';
import { LITHIUM_LOOP } from '../physics/thermal';
import {
  COMPARTMENT_IDS,
  type CompartmentId,
  type DeckPlan,
} from './contracts';
import { ShipStateStore } from './ship-state-store';

const plan = deck satisfies DeckPlan;

describe('ShipStateStore', () => {
  it('starts at tick 0 and time 0', () => {
    const ship = new ShipStateStore(plan).snapshot();
    expect(ship.tick).toBe(0);
    expect(ship.time).toBe(0);
  });

  it('holds one record per compartment id, in the order of the list', () => {
    const ship = new ShipStateStore(plan).snapshot();
    expect(Object.keys(ship.compartments)).toEqual([...COMPARTMENT_IDS]);
  });

  it('fills every compartment with the deck initial air at 293 K', () => {
    const ship = new ShipStateStore(plan).snapshot();
    for (const room of plan.compartments) {
      expect(ship.compartments[room.id as CompartmentId]).toEqual({
        moles: molesAt(101_300, 293, room.volume, AIR),
        temperature: 293,
      });
    }
  });

  it('freezes the snapshot and its records', () => {
    const ship = new ShipStateStore(plan).snapshot();
    expect(Object.isFrozen(ship)).toBe(true);
    expect(Object.isFrozen(ship.compartments)).toBe(true);
    for (const id of COMPARTMENT_IDS) {
      expect(Object.isFrozen(ship.compartments[id])).toBe(true);
      expect(Object.isFrozen(ship.compartments[id].moles)).toBe(true);
    }
  });

  it('replaces the snapshot on commit', () => {
    const store = new ShipStateStore(plan);
    const next = { ...store.snapshot(), tick: 1, time: 0.5 };
    store.commit(next);
    expect(store.snapshot()).toBe(next);
  });

  it('refuses a deck plan that leaves out a compartment', () => {
    const partial: DeckPlan = {
      ...plan,
      compartments: plan.compartments.filter((room) => room.id !== 'airlock'),
    };
    expect(() => new ShipStateStore(partial)).toThrow(/'airlock'/);
  });

  it('refuses a deck plan that names an unknown compartment', () => {
    const extra: DeckPlan = {
      ...plan,
      compartments: [
        ...plan.compartments,
        { ...plan.compartments[0], id: 'galley' },
      ],
    };
    expect(() => new ShipStateStore(extra)).toThrow(/'galley'/);
  });

  it('refuses a deck plan that lists one compartment twice', () => {
    const twice: DeckPlan = {
      ...plan,
      compartments: [...plan.compartments, plan.compartments[1]],
    };
    expect(() => new ShipStateStore(twice)).toThrow(
      "The deck plan names compartment 'habitat' twice.",
    );
  });

  it('starts the engineering records idle', () => {
    const ship = new ShipStateStore(plan).snapshot();
    expect(ship.reactor).toEqual({
      level: 0,
      thermal: 0,
      electric: 0,
      tripped: false,
    });
    expect(ship.coolant).toEqual({ temperature: LITHIUM_LOOP.standby });
    expect(ship.power).toEqual({
      output: 0,
      loads: [{ id: 'shields', priority: 2, demand: 0, allocated: 0 }],
      shed: [],
    });
    expect(ship.setpoints).toEqual({
      reactor: { throttle: 0 },
      shields: { raised: false },
    });
    for (const record of [
      ship.reactor,
      ship.coolant,
      ship.power,
      ship.power.loads,
      ...ship.power.loads,
      ship.power.shed,
      ship.setpoints,
      ship.setpoints.reactor,
      ship.setpoints.shields,
    ]) {
      expect(Object.isFrozen(record)).toBe(true);
    }
  });
});

describe('ShipStateStore setpoint queue', () => {
  it('answers a queued change with the next tick', () => {
    const store = new ShipStateStore(plan);
    expect(store.queue({ reactor: { throttle: 1 } })).toEqual({ tick: 1 });
    store.commit({ ...store.snapshot(), tick: 4, time: 2 });
    expect(store.queue({ shields: { raised: true } })).toEqual({ tick: 5 });
  });

  it('merges the queued changes in queue order at applyQueued', () => {
    const store = new ShipStateStore(plan);
    store.queue({ reactor: { throttle: 0.5 } });
    store.queue({ shields: { raised: true } });
    store.queue({ reactor: { throttle: 1 } });
    const ship = store.applyQueued(1);
    expect(ship.setpoints).toEqual({
      reactor: { throttle: 1 },
      shields: { raised: true },
    });
    expect(Object.isFrozen(ship)).toBe(true);
    expect(Object.isFrozen(ship.setpoints)).toBe(true);
    expect(Object.isFrozen(ship.setpoints.reactor)).toBe(true);
    expect(Object.isFrozen(ship.setpoints.shields)).toBe(true);
    expect(store.snapshot()).toBe(ship);
  });

  it('keeps the setpoints a change leaves out', () => {
    const store = new ShipStateStore(plan);
    store.queue({ reactor: { throttle: 0.4 } });
    store.applyQueued(1);
    store.queue({ shields: { raised: true } });
    expect(store.applyQueued(2).setpoints).toEqual({
      reactor: { throttle: 0.4 },
      shields: { raised: true },
    });
  });

  it('logs the changes of one tick as one merged entry under that tick', () => {
    const store = new ShipStateStore(plan);
    store.queue({ reactor: { throttle: 0.5 } });
    store.queue({ shields: { raised: true } });
    store.applyQueued(1);
    expect(store.log()).toEqual([
      {
        tick: 1,
        change: { reactor: { throttle: 0.5 }, shields: { raised: true } },
      },
    ]);
  });

  it('merges throttle 0.2, shields raised and throttle 0.8 into one entry', () => {
    const store = new ShipStateStore(plan);
    store.queue({ reactor: { throttle: 0.2 } });
    store.queue({ shields: { raised: true } });
    store.queue({ reactor: { throttle: 0.8 } });
    store.applyQueued(1);
    expect(store.log()).toStrictEqual([
      {
        tick: 1,
        change: { reactor: { throttle: 0.8 }, shields: { raised: true } },
      },
    ]);
  });

  it('holds 10,000 changes between two ticks as one entry with the setpoints of applying them one by one', () => {
    const merged = new ShipStateStore(plan);
    const stepped = new ShipStateStore(plan);
    for (let i = 1; i <= 10_000; i++) {
      const change =
        i % 3 === 0
          ? { shields: { raised: i % 2 === 0 } }
          : { reactor: { throttle: i / 10_000 } };
      merged.queue(change);
      stepped.queue(change);
      stepped.applyQueued(i);
    }
    const ship = merged.applyQueued(1);
    expect(merged.log()).toHaveLength(1);
    expect(merged.log()[0].tick).toBe(1);
    expect(ship.setpoints).toEqual(stepped.snapshot().setpoints);
    expect(merged.log()[0].change).toEqual(ship.setpoints);
  });

  it('leaves a change it merged earlier as it was', () => {
    const store = new ShipStateStore(plan);
    store.queue({ reactor: { throttle: 0.2 } });
    store.applyQueued(1);
    const first = store.log()[0].change;
    store.queue({ reactor: { throttle: 0.3 } });
    store.queue({ shields: { raised: true } });
    store.applyQueued(2);
    expect(first).toStrictEqual({ reactor: { throttle: 0.2 } });
    const second = store.log()[1].change;
    expect(Object.isFrozen(second)).toBe(true);
    expect(Object.isFrozen(second.reactor)).toBe(true);
    expect(Object.isFrozen(second.shields)).toBe(true);
  });

  it('empties the queue once it applies it', () => {
    const store = new ShipStateStore(plan);
    store.queue({ reactor: { throttle: 0.5 } });
    const first = store.applyQueued(1);
    expect(store.applyQueued(2)).toBe(first);
    expect(store.log()).toHaveLength(1);
  });

  it('returns the current snapshot when nothing is queued', () => {
    const store = new ShipStateStore(plan);
    expect(store.applyQueued(1)).toBe(store.snapshot());
    expect(store.log()).toEqual([]);
  });

  it('keeps a change from the caller mutating it after the queue', () => {
    const store = new ShipStateStore(plan);
    const change = { reactor: { throttle: 0.5 } };
    store.queue(change);
    change.reactor.throttle = 0.9;
    expect(store.applyQueued(1).setpoints.reactor.throttle).toBe(0.5);
    expect(store.log()[0].change).toEqual({ reactor: { throttle: 0.5 } });
  });

  it('drops a field a change sets to undefined, from the setpoints and the log', () => {
    const store = new ShipStateStore(plan);
    store.queue({ reactor: { throttle: 0.5 } });
    store.applyQueued(1);
    store.queue({
      reactor: { throttle: undefined },
      shields: { raised: true },
    });
    const ship = store.applyQueued(2);
    expect(ship.setpoints.reactor).toEqual({ throttle: 0.5 });
    expect(store.log()[1].change).toStrictEqual({
      reactor: {},
      shields: { raised: true },
    });
  });

  it('keeps the newest 1,000 entries in the log', () => {
    const store = new ShipStateStore(plan);
    for (let i = 1; i <= 1_001; i++) {
      store.queue({ reactor: { throttle: i / 1_001 } });
      store.applyQueued(i);
    }
    const log = store.log();
    expect(log).toHaveLength(1_000);
    expect(log[0].tick).toBe(2);
    expect(log[999]).toEqual({
      tick: 1_001,
      change: { reactor: { throttle: 1 } },
    });
  });
});
