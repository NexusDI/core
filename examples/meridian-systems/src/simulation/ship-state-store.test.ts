import { describe, expect, it } from 'vitest';

import deck from '../../deck/meridian.deck.json';
import { AIR, molesAt } from '../physics/gas';
import { COMMS_RECORD } from '../systems/comms/comms-record';
import { FTL_RECORD } from '../systems/ftl/ftl-record';
import { shipRecords, shipState } from '../../test/ship-state';

import {
  COMPARTMENT_IDS,
  type CompartmentId,
  type CompartmentPlan,
  type DeckPlan,
  DOOR_IDS,
} from './contracts';
import { ShipStateStore } from './ship-state-store';

const plan = deck satisfies DeckPlan;
const initial = shipState(plan).snapshot();

/** The deck with `room`'s plan changed by `change`. */
function withRoom(
  room: CompartmentId,
  change: Partial<CompartmentPlan>,
): DeckPlan {
  return {
    ...plan,
    compartments: plan.compartments.map((entry) =>
      entry.id === room ? { ...entry, ...change } : entry,
    ),
  };
}

/** Every object level under `value`, `value` included. */
function levels(value: unknown): object[] {
  if (typeof value !== 'object' || value === null) return [];
  return [value, ...Object.values(value).flatMap(levels)];
}

describe('ShipStateStore', () => {
  it('starts at tick 0 and time 0', () => {
    const ship = shipState(plan).snapshot();
    expect(ship.tick).toBe(0);
    expect(ship.time).toBe(0);
  });

  it('holds one record per compartment id, in the order of the list', () => {
    const ship = shipState(plan).snapshot();
    expect(Object.keys(ship.compartments)).toEqual([...COMPARTMENT_IDS]);
  });

  it('fills every pressurised compartment with the deck initial air at 293 K, and leaves the two bays empty', () => {
    const ship = shipState(plan).snapshot();
    for (const room of plan.compartments) {
      const fill = room.pressurised === false ? 0 : 101_300;
      expect(ship.compartments[room.id as CompartmentId]).toEqual({
        moles: molesAt(fill, 293, room.volume, AIR),
        temperature: 293,
      });
    }
    expect(
      plan.compartments
        .filter((room) => room.pressurised === false)
        .map(({ id }) => id),
    ).toEqual(['shuttle-bay', 'drone-bay']);
  });

  it('fills a room the deck marks pressurised as it fills a room with no flag', () => {
    const ship = shipState(
      withRoom('bridge', { pressurised: true }),
    ).snapshot();
    expect(ship.compartments.bridge).toEqual(initial.compartments.bridge);
  });

  it('starts a room the deck marks unpressurised with no gas', () => {
    const ship = shipState(
      withRoom('reactor-bay', {
        pressurised: false,
        floodCharge: undefined,
        coolantConductance: undefined,
      }),
    ).snapshot();
    expect(ship.compartments['reactor-bay']).toEqual({
      moles: { O2: 0, N2: 0, CO2: 0, H2O: 0, volatiles: 0 },
      temperature: 293,
    });
    expect(ship.compartments.bridge).toEqual(initial.compartments.bridge);
  });

  it.each([
    [
      'equipment',
      withRoom('airlock', { pressurised: false }),
      "The deck plan gives the unpressurised compartment 'airlock' the equipment vent, pump. A room with no air carries no device.",
    ],
    [
      'a flood charge',
      withRoom('reactor-bay', { pressurised: false }),
      "The deck plan gives the unpressurised compartment 'reactor-bay' a floodCharge. A room with no air takes no flood.",
    ],
  ])(
    'refuses an unpressurised room that lists %s with a plain Error',
    (_, deckPlan, message) => {
      const refuse = () => shipState(deckPlan);
      expect(refuse).toThrow(message);
      expect(refuse).toThrow(
        expect.objectContaining({ constructor: Error, name: 'Error' }),
      );
    },
  );

  it('freezes the snapshot and its records', () => {
    const ship = shipState(plan).snapshot();
    expect(Object.isFrozen(ship)).toBe(true);
    expect(Object.isFrozen(ship.compartments)).toBe(true);
    for (const id of COMPARTMENT_IDS) {
      expect(Object.isFrozen(ship.compartments[id])).toBe(true);
      expect(Object.isFrozen(ship.compartments[id].moles)).toBe(true);
    }
  });

  it('lists the kernel fields, then each record and each setpoint in code-unit order', () => {
    expect(Object.keys(initial)).toEqual([
      'tick',
      'time',
      'compartments',
      'comms',
      'coolant',
      'drive',
      'helm',
      'lifeSupport',
      'power',
      'reactor',
      'safety',
      'weapons',
      'setpoints',
    ]);
    expect(Object.keys(initial.setpoints)).toEqual([
      'comms',
      'drive',
      'helm',
      'lifeSupport',
      'reactor',
      'safety',
      'shields',
      'weapons',
    ]);
  });

  it('takes each record and setpoint from the contributions, frozen at every level', () => {
    for (const record of shipRecords(plan)) {
      for (const [key, value] of Object.entries(record.records)) {
        expect(initial).toHaveProperty([key], value);
      }
      for (const [key, value] of Object.entries(record.setpoints)) {
        expect(initial.setpoints).toHaveProperty([key], value);
      }
    }
    for (const level of levels(initial)) {
      expect(Object.isFrozen(level)).toBe(true);
    }
  });

  it('starts the router with no loads, since tick 1 lists each one', () => {
    expect(initial.power).toStrictEqual({ output: 0, loads: [], shed: [] });
  });

  it('holds no FTL record before the drive registers one', () => {
    expect(initial).not.toHaveProperty('ftl');
    expect(initial.setpoints).not.toHaveProperty('ftl');
  });

  it('refuses two contributions that hold one key', () => {
    const records = shipRecords(plan);
    expect(() => new ShipStateStore(plan, [...records, COMMS_RECORD])).toThrow(
      "Two ship records hold the key 'comms'.",
    );
    expect(
      () =>
        new ShipStateStore(plan, [
          ...records,
          { records: {}, setpoints: { shields: { raised: true } } },
        ]),
    ).toThrow("Two ship records hold the key 'shields'.");
  });

  it('replaces the snapshot on commit', () => {
    const store = shipState(plan);
    const next = { ...store.snapshot(), tick: 1, time: 0.5 };
    store.commit(next);
    expect(store.snapshot()).toBe(next);
  });

  it('refuses a deck plan that leaves out a compartment', () => {
    const partial: DeckPlan = {
      ...plan,
      compartments: plan.compartments.filter((room) => room.id !== 'airlock'),
    };
    expect(() => shipState(partial)).toThrow(/'airlock'/);
  });
});

describe('ShipStateStore setpoint queue', () => {
  it('answers a queued change with the next tick', () => {
    const store = shipState(plan);
    expect(store.queue({ reactor: { throttle: 1 } })).toEqual({ tick: 1 });
    store.commit({ ...store.snapshot(), tick: 4, time: 2 });
    expect(store.queue({ shields: { raised: true } })).toEqual({ tick: 5 });
  });

  it('merges the queued changes in queue order at applyQueued', () => {
    const store = shipState(plan);
    store.queue({ reactor: { throttle: 0.5 } });
    store.queue({ shields: { raised: true } });
    store.queue({ reactor: { throttle: 1 } });
    const ship = store.applyQueued(1);
    expect(ship.setpoints).toEqual({
      ...initial.setpoints,
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
    const store = shipState(plan);
    store.queue({ reactor: { throttle: 0.4 } });
    store.applyQueued(1);
    store.queue({ shields: { raised: true } });
    expect(store.applyQueued(2).setpoints).toEqual({
      ...initial.setpoints,
      reactor: { throttle: 0.4 },
      shields: { raised: true },
    });
  });

  it('logs the changes of one tick as one merged entry under that tick', () => {
    const store = shipState(plan);
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
    const store = shipState(plan);
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
    const merged = shipState(plan);
    const stepped = shipState(plan);
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
    expect(merged.log()[0].change).toEqual({
      reactor: ship.setpoints.reactor,
      shields: ship.setpoints.shields,
    });
  });

  it('leaves a change it merged earlier as it was', () => {
    const store = shipState(plan);
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
    const store = shipState(plan);
    store.queue({ reactor: { throttle: 0.5 } });
    const first = store.applyQueued(1);
    expect(store.applyQueued(2)).toBe(first);
    expect(store.log()).toHaveLength(1);
  });

  it('returns the current snapshot when nothing is queued', () => {
    const store = shipState(plan);
    expect(store.applyQueued(1)).toBe(store.snapshot());
    expect(store.log()).toEqual([]);
  });

  it('keeps a change from the caller mutating it after the queue', () => {
    const store = shipState(plan);
    const change = { reactor: { throttle: 0.5 } };
    store.queue(change);
    change.reactor.throttle = 0.9;
    expect(store.applyQueued(1).setpoints.reactor.throttle).toBe(0.5);
    expect(store.log()[0].change).toEqual({ reactor: { throttle: 0.5 } });
  });

  it('drops a field a change sets to undefined, from the setpoints and the log', () => {
    const store = shipState(plan);
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
    const store = shipState(plan);
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

describe('ShipStateStore life support', () => {
  it('freezes every level of the initial snapshot', () => {
    const ship = shipState(plan).snapshot();
    for (const level of levels(ship)) {
      expect(Object.isFrozen(level)).toBe(true);
    }
  });

  it('applies a target and an off queued in one tick as one heater setting, and leaves the bridge heater as it was', () => {
    const store = shipState(plan);
    const bridge = store.snapshot().setpoints.lifeSupport.heaters.bridge;
    store.queue({ lifeSupport: { heaters: { habitat: { target: 295 } } } });
    store.queue({ lifeSupport: { heaters: { habitat: { on: false } } } });
    const ship = store.applyQueued(1);
    expect(ship.setpoints.lifeSupport.heaters).toStrictEqual({
      ...initial.setpoints.lifeSupport.heaters,
      bridge: { on: true, target: 293 },
      habitat: { on: false, target: 295 },
    });
    expect(ship.setpoints.lifeSupport.heaters.bridge).toEqual(bridge);
    expect(store.log()).toStrictEqual([
      {
        tick: 1,
        change: {
          lifeSupport: { heaters: { habitat: { target: 295, on: false } } },
        },
      },
    ]);
  });

  it('applies a throttle and a heater change queued in one tick', () => {
    const store = shipState(plan);
    store.queue({ reactor: { throttle: 0.01 } });
    store.queue({
      lifeSupport: { online: true, heaters: { bridge: { target: 290 } } },
    });
    const ship = store.applyQueued(1);
    expect(ship.setpoints.reactor).toEqual({ throttle: 0.01 });
    expect(ship.setpoints.lifeSupport.online).toBe(true);
    expect(ship.setpoints.lifeSupport.heaters.bridge).toEqual({
      on: true,
      target: 290,
    });
    expect(ship.setpoints.shields).toEqual({ raised: false });
  });

  it('freezes every level of the merged setpoints and of the logged change', () => {
    const store = shipState(plan);
    const change = {
      lifeSupport: {
        heaters: { habitat: { target: 295 } },
        pumps: { airlock: 'evacuate' as const },
      },
    };
    store.queue(change);
    const ship = store.applyQueued(1);
    for (const level of [...levels(ship), ...levels(store.log())]) {
      expect(Object.isFrozen(level)).toBe(true);
    }
    expect(Object.isFrozen(change.lifeSupport.heaters.habitat)).toBe(false);
  });

  it('keeps a nested change from the caller mutating it after the queue', () => {
    const store = shipState(plan);
    const change = { lifeSupport: { heaters: { habitat: { target: 295 } } } };
    store.queue(change);
    change.lifeSupport.heaters.habitat.target = 300;
    expect(store.applyQueued(1).setpoints.lifeSupport.heaters.habitat).toEqual({
      on: true,
      target: 295,
    });
  });
});

describe('ShipStateStore safety', () => {
  it('opens one door a queued change names and leaves the others shut', () => {
    const store = shipState(plan);
    const before = store.snapshot().setpoints;
    store.queue({ safety: { doors: { 'bridge-habitat': true } } });
    const ship = store.applyQueued(1);
    expect(ship.setpoints.safety.doors).toStrictEqual({
      ...Object.fromEntries(DOOR_IDS.map((id) => [id, false])),
      'bridge-habitat': true,
    });
    expect(Object.keys(ship.setpoints.safety.doors)).toEqual([...DOOR_IDS]);
    expect(ship.setpoints.safety.floods).toBe(before.safety.floods);
    expect(ship.setpoints.safety.drills).toBe(before.safety.drills);
    expect(ship.setpoints.lifeSupport).toBe(before.lifeSupport);
  });
});

describe('ShipStateStore comms', () => {
  it('applies a queued hail and leaves the record to phase 6', () => {
    const store = shipState(plan);
    const record = store.snapshot().comms;
    store.queue({ comms: { hail: true } });
    const ship = store.applyQueued(1);
    expect(ship.setpoints.comms).toEqual({ hail: true });
    expect(ship.comms).toBe(record);
  });
});

describe('ShipStateStore drive and helm', () => {
  it('applies a queued throttle and course and leaves the records to phase 2', () => {
    const store = shipState(plan);
    const { drive, helm } = store.snapshot();
    store.queue({ drive: { throttle: 1 } });
    store.queue({ helm: { heading: 0.5 } });
    const ship = store.applyQueued(1);
    expect(ship.setpoints.drive).toEqual({ throttle: 1 });
    expect(ship.setpoints.helm).toEqual({ heading: 0.5 });
    expect(Object.isFrozen(ship.setpoints.helm)).toBe(true);
    expect(ship.drive).toBe(drive);
    expect(ship.helm).toBe(helm);
  });
});

describe('ShipStateStore register', () => {
  it('writes the record and its setpoints into the current snapshot, frozen', () => {
    const store = shipState(plan);
    store.register(FTL_RECORD);
    const ship = store.snapshot();
    expect(ship.ftl).toStrictEqual(FTL_RECORD.records.ftl);
    expect(ship.setpoints.ftl).toStrictEqual(FTL_RECORD.setpoints.ftl);
    for (const level of levels(ship)) {
      expect(Object.isFrozen(level)).toBe(true);
    }
  });

  it('drops a key no register holds from a commit, so a register starts from the record it gets', () => {
    const store = shipState(plan);
    const ship = store.snapshot();
    store.commit({
      ...ship,
      ftl: { status: 'spooling', charge: 5, sector: 'Sol', jumped: null },
    });
    expect(store.snapshot()).not.toHaveProperty('ftl');
    store.register(FTL_RECORD);
    expect(store.snapshot().ftl).toStrictEqual(FTL_RECORD.records.ftl);
  });

  it('removes the keys on unregister, twice safely, and keeps the other records', () => {
    const store = shipState(plan);
    const unregister = store.register(FTL_RECORD);
    const before = store.snapshot();
    unregister();
    unregister();
    const ship = store.snapshot();
    expect(ship).not.toHaveProperty('ftl');
    expect(ship.setpoints).not.toHaveProperty('ftl');
    expect(ship.helm).toBe(before.helm);
    expect(ship.setpoints.helm).toBe(before.setpoints.helm);
  });

  it('drops the pending change of a key it unregisters', () => {
    const store = shipState(plan);
    const unregister = store.register(FTL_RECORD);
    store.queue({ ftl: { armed: true } });
    unregister();
    expect(store.applyQueued(1).setpoints).not.toHaveProperty('ftl');
    expect(store.log()).toEqual([]);

    const again = store.register(FTL_RECORD);
    store.queue({ ftl: { armed: true }, reactor: { throttle: 1 } });
    again();
    const ship = store.applyQueued(2);
    expect(ship.setpoints).not.toHaveProperty('ftl');
    expect(ship.setpoints.reactor).toEqual({ throttle: 1 });
    expect(store.log()).toEqual([
      { tick: 2, change: { reactor: { throttle: 1 } } },
    ]);
  });

  it('puts the record and its setpoints in code-unit order between the others', () => {
    const store = shipState(plan);
    store.register(FTL_RECORD);
    const ship = store.snapshot();
    expect(Object.keys(ship).slice(5, 8)).toEqual(['drive', 'ftl', 'helm']);
    expect(Object.keys(ship.setpoints).slice(1, 4)).toEqual([
      'drive',
      'ftl',
      'helm',
    ]);
  });

  it('keeps a registered record in a snapshot the caller built before the register', () => {
    const store = shipState(plan);
    const before = store.snapshot();
    store.register(FTL_RECORD);
    const next = { ...before, tick: 1, time: 0.5 };
    store.commit(next);
    const ship = store.snapshot();
    expect(ship.tick).toBe(1);
    expect(ship.ftl).toStrictEqual(FTL_RECORD.records.ftl);
    expect(ship.setpoints.ftl).toStrictEqual(FTL_RECORD.setpoints.ftl);
    expect(Object.keys(ship).slice(5, 8)).toEqual(['drive', 'ftl', 'helm']);
  });

  it('drops an unregistered record from a snapshot the caller built before the unregister', () => {
    const store = shipState(plan);
    const unregister = store.register(FTL_RECORD);
    const before = store.snapshot();
    unregister();
    store.commit({ ...before, tick: 1, time: 0.5 });
    expect(store.snapshot()).not.toHaveProperty('ftl');
    expect(store.snapshot().setpoints).not.toHaveProperty('ftl');
  });

  it('commits a snapshot that holds the keys it holds as it is', () => {
    const store = shipState(plan);
    const next = { ...store.snapshot(), tick: 1, time: 0.5 };
    store.commit(next);
    expect(store.snapshot()).toBe(next);
  });

  it.each(['tick', 'time', 'compartments', 'setpoints'])(
    'refuses a contribution that holds the kernel key %s with a plain Error',
    (key) => {
      const records = [
        ...shipRecords(plan),
        { records: { [key]: 0 }, setpoints: {} },
      ];
      const refuse = () => new ShipStateStore(plan, records);
      expect(refuse).toThrow(
        `A ship record cannot hold the snapshot's own key '${key}'.`,
      );
      expect(refuse).toThrow(
        expect.objectContaining({ constructor: Error, name: 'Error' }),
      );
    },
  );

  it('refuses a register that holds a kernel key', () => {
    expect(() =>
      shipState(plan).register({
        records: Object.fromEntries([['tick', 3]]),
        setpoints: {},
      }),
    ).toThrow("A ship record cannot hold the snapshot's own key 'tick'.");
  });

  it('refuses a key a contribution holds', () => {
    expect(() => shipState(plan).register(COMMS_RECORD)).toThrow(
      "Two ship records hold the key 'comms'.",
    );
  });

  it('refuses a key an earlier register holds until it unregisters', () => {
    const store = shipState(plan);
    const unregister = store.register(FTL_RECORD);
    expect(() => store.register(FTL_RECORD)).toThrow(
      "Two ship records hold the key 'ftl'.",
    );
    unregister();
    expect(() => store.register(FTL_RECORD)).not.toThrow();
  });
});
