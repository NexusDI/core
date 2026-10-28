import { describe, expect, it } from 'vitest';

import deck from '../../deck/meridian.deck.json';
import { AIR, molesAt } from '../physics/gas';
import type { LoadRecord } from '../systems/engineering/contracts';
import { LITHIUM_LOOP } from '../systems/engineering/engineering-model';

import {
  COMPARTMENT_IDS,
  type CompartmentId,
  type CompartmentPlan,
  type DeckPlan,
  DOOR_IDS,
  type DoorPlan,
  type ShipSnapshot,
} from './contracts';
import { ShipStateStore } from './ship-state-store';

const plan = deck satisfies DeckPlan;
const initial = new ShipStateStore(plan).snapshot();

function load(ship: ShipSnapshot, id: string): LoadRecord | undefined {
  return ship.power.loads.find((entry) => entry.id === id);
}

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
    expect(ship.power.output).toBe(0);
    expect(ship.power.shed).toEqual([]);
    expect(load(ship, 'shields')).toEqual({
      id: 'shields',
      priority: 2,
      demand: 0,
      allocated: 0,
    });
    expect(ship.setpoints.reactor).toEqual({ throttle: 0 });
    expect(ship.setpoints.shields).toEqual({ raised: false });
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
    const store = new ShipStateStore(plan);
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
    expect(merged.log()[0].change).toEqual({
      reactor: ship.setpoints.reactor,
      shields: ship.setpoints.shields,
    });
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

describe('ShipStateStore life support', () => {
  it('starts life support offline with every device the deck lists at its initial setting', () => {
    const ship = new ShipStateStore(plan).snapshot();
    expect(ship.setpoints.lifeSupport).toStrictEqual({
      online: false,
      heaters: {
        bridge: { on: true, target: 293 },
        habitat: { on: true, target: 293 },
      },
      scrubbers: { bridge: true, habitat: true },
      oxygen: { bridge: true, habitat: true },
      vents: { airlock: false },
      pumps: { airlock: 'off' },
    });
    expect(ship.lifeSupport).toStrictEqual({
      heaters: { bridge: 0, habitat: 0 },
    });
  });

  it('lists the 0 W life-support load first, beside the lowered shields', () => {
    const ship = new ShipStateStore(plan).snapshot();
    expect(ship.power.loads).toEqual([
      { id: 'life-support', priority: 1, demand: 0, allocated: 0 },
      { id: 'shields', priority: 2, demand: 0, allocated: 0 },
      { id: 'comms', priority: 3, demand: 0, allocated: 0 },
      { id: 'thrusters', priority: 4, demand: 0, allocated: 0 },
      { id: 'main-drive', priority: 5, demand: 0, allocated: 0 },
      { id: 'railgun', priority: 6, demand: 0, allocated: 0 },
    ]);
  });

  it('freezes every level of the initial snapshot', () => {
    const ship = new ShipStateStore(plan).snapshot();
    for (const level of levels(ship)) {
      expect(Object.isFrozen(level)).toBe(true);
    }
  });

  it('applies a target and an off queued in one tick as one heater setting, and leaves the bridge heater as it was', () => {
    const store = new ShipStateStore(plan);
    const bridge = store.snapshot().setpoints.lifeSupport.heaters.bridge;
    store.queue({ lifeSupport: { heaters: { habitat: { target: 295 } } } });
    store.queue({ lifeSupport: { heaters: { habitat: { on: false } } } });
    const ship = store.applyQueued(1);
    expect(ship.setpoints.lifeSupport.heaters).toStrictEqual({
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
    const store = new ShipStateStore(plan);
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
    const store = new ShipStateStore(plan);
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
    const store = new ShipStateStore(plan);
    const change = { lifeSupport: { heaters: { habitat: { target: 295 } } } };
    store.queue(change);
    change.lifeSupport.heaters.habitat.target = 300;
    expect(store.applyQueued(1).setpoints.lifeSupport.heaters.habitat).toEqual({
      on: true,
      target: 295,
    });
  });

  it.each([
    [
      'an unknown device',
      withRoom('bridge', { equipment: ['heater', 'fan'] }),
      "The deck plan gives compartment 'bridge' an unknown device 'fan'.",
    ],
    [
      'a device twice',
      withRoom('bridge', { equipment: ['heater', 'heater'] }),
      "The deck plan gives compartment 'bridge' the device 'heater' twice.",
    ],
    [
      'a pump with no reservoir',
      withRoom('airlock', { pumpReservoir: undefined }),
      "The deck plan gives compartment 'airlock' a pump and no pumpReservoir.",
    ],
    [
      'a reservoir with no pump',
      withRoom('habitat', { pumpReservoir: 'bridge' }),
      "The deck plan gives compartment 'habitat' a pumpReservoir and no pump.",
    ],
    [
      'an unknown reservoir',
      withRoom('airlock', { pumpReservoir: 'galley' }),
      "The deck plan pumps compartment 'airlock' to an unknown compartment 'galley'.",
    ],
    [
      'a reservoir that is the pump room',
      withRoom('airlock', { pumpReservoir: 'airlock' }),
      "The deck plan pumps compartment 'airlock' to itself.",
    ],
  ])('refuses a deck plan with %s', (_, deckPlan, message) => {
    expect(() => new ShipStateStore(deckPlan)).toThrow(message);
  });
});

/** The deck with `door`'s plan changed by `change`. */
function withDoor(door: string, change: Partial<DoorPlan>): DeckPlan {
  return {
    ...plan,
    doors: plan.doors.map((entry) =>
      entry.id === door ? { ...entry, ...change } : entry,
    ),
  };
}

describe('ShipStateStore safety', () => {
  it('starts with every door shut, no flood, no drill, no fire and no alarm', () => {
    const ship = new ShipStateStore(plan).snapshot();
    expect(ship.setpoints.safety).toStrictEqual({
      doors: {
        'bridge-habitat': false,
        'habitat-reactor-bay': false,
        'habitat-airlock': false,
        'airlock-outer': false,
      },
      floods: { bridge: false, habitat: false, 'reactor-bay': false },
      drills: { bridge: false, habitat: false, 'reactor-bay': false },
    });
    expect(ship.safety).toStrictEqual({
      fires: { bridge: 0, habitat: 0, 'reactor-bay': 0, airlock: 0 },
      flooded: { bridge: 0, habitat: 0, 'reactor-bay': 0 },
      alarms: [],
    });
    expect(Object.keys(ship.setpoints.safety.doors)).toEqual([...DOOR_IDS]);
  });

  it('opens one door a queued change names and leaves the others shut', () => {
    const store = new ShipStateStore(plan);
    const before = store.snapshot().setpoints;
    store.queue({ safety: { doors: { 'bridge-habitat': true } } });
    const ship = store.applyQueued(1);
    expect(ship.setpoints.safety.doors).toStrictEqual({
      'bridge-habitat': true,
      'habitat-reactor-bay': false,
      'habitat-airlock': false,
      'airlock-outer': false,
    });
    expect(ship.setpoints.safety.floods).toBe(before.safety.floods);
    expect(ship.setpoints.safety.drills).toBe(before.safety.drills);
    expect(ship.setpoints.lifeSupport).toBe(before.lifeSupport);
  });

  it.each([
    [
      'an unknown door',
      {
        ...plan,
        doors: [
          ...plan.doors,
          { id: 'bridge-galley', between: ['bridge', 'habitat'], area: 1 },
        ],
      },
      "The deck plan names an unknown door 'bridge-galley'.",
    ],
    [
      'a door twice',
      { ...plan, doors: [...plan.doors, plan.doors[2]] },
      "The deck plan names door 'habitat-airlock' twice.",
    ],
    [
      'a door left out',
      {
        ...plan,
        doors: plan.doors.filter((door) => door.id !== 'airlock-outer'),
      },
      "The deck plan has no door 'airlock-outer'.",
    ],
    [
      'a door with one side',
      withDoor('bridge-habitat', { between: ['bridge'] }),
      'The deck plan gives door \'bridge-habitat\' the sides ["bridge"]. A door joins two compartments, or one compartment and space.',
    ],
    [
      'a door with three sides',
      withDoor('bridge-habitat', { between: ['bridge', 'habitat', 'airlock'] }),
      'The deck plan gives door \'bridge-habitat\' the sides ["bridge","habitat","airlock"]. A door joins two compartments, or one compartment and space.',
    ],
    [
      'a door to one room on both sides',
      withDoor('bridge-habitat', { between: ['bridge', 'bridge'] }),
      'The deck plan gives door \'bridge-habitat\' the sides ["bridge","bridge"]. A door joins two compartments, or one compartment and space.',
    ],
    [
      'a door to space on both sides',
      withDoor('airlock-outer', { between: ['space', 'space'] }),
      'The deck plan gives door \'airlock-outer\' the sides ["space","space"]. A door joins two compartments, or one compartment and space.',
    ],
    [
      'a door to an unknown compartment',
      withDoor('habitat-airlock', { between: ['habitat', 'galley'] }),
      'The deck plan gives door \'habitat-airlock\' the sides ["habitat","galley"]. A door joins two compartments, or one compartment and space.',
    ],
    [
      'a flood charge of 0 mol',
      withRoom('bridge', { floodCharge: 0 }),
      "The deck plan gives compartment 'bridge' a floodCharge of 0. A charge is a positive finite number of moles.",
    ],
    [
      'a negative flood charge',
      withRoom('habitat', { floodCharge: -5 }),
      "The deck plan gives compartment 'habitat' a floodCharge of -5. A charge is a positive finite number of moles.",
    ],
    [
      'an infinite flood charge',
      withRoom('habitat', { floodCharge: Number.POSITIVE_INFINITY }),
      "The deck plan gives compartment 'habitat' a floodCharge of Infinity. A charge is a positive finite number of moles.",
    ],
    [
      'a flood charge that is no number',
      withRoom('habitat', { floodCharge: Number.NaN }),
      "The deck plan gives compartment 'habitat' a floodCharge of NaN. A charge is a positive finite number of moles.",
    ],
    [
      'a flood charge that is a string',
      withRoom('habitat', { floodCharge: '5' as unknown as number }),
      "The deck plan gives compartment 'habitat' a floodCharge of 5. A charge is a positive finite number of moles.",
    ],
  ])('refuses a deck plan with %s', (_, deckPlan: DeckPlan, message) => {
    expect(() => new ShipStateStore(deckPlan)).toThrow(message);
  });
});

describe('ShipStateStore comms', () => {
  it('starts the phased array on standby with no hail queued', () => {
    const ship = new ShipStateStore(plan).snapshot();
    expect(ship.comms).toStrictEqual({
      status: 'standby',
      sent: null,
      messages: [],
    });
    expect(ship.setpoints.comms).toStrictEqual({ hail: false });
    const keys = Object.keys(ship);
    expect(keys.indexOf('comms')).toBe(keys.indexOf('lifeSupport') + 1);
    const setpoints = Object.keys(ship.setpoints);
    expect(setpoints.indexOf('comms')).toBe(
      setpoints.indexOf('lifeSupport') + 1,
    );
    for (const record of [
      ship.comms,
      ship.comms.messages,
      ship.setpoints.comms,
    ]) {
      expect(Object.isFrozen(record)).toBe(true);
    }
  });

  it('applies a queued hail and leaves the record to phase 6', () => {
    const store = new ShipStateStore(plan);
    const record = store.snapshot().comms;
    store.queue({ comms: { hail: true } });
    const ship = store.applyQueued(1);
    expect(ship.setpoints.comms).toEqual({ hail: true });
    expect(ship.comms).toBe(record);
  });
});

describe('ShipStateStore drive and helm', () => {
  it('starts the drive and the helm at rest after comms, frozen', () => {
    const ship = new ShipStateStore(plan).snapshot();
    expect(ship.drive).toStrictEqual({
      thrust: 0,
      massFlow: 0,
      acceleration: 0,
      velocity: 0,
      distance: 0,
    });
    expect(ship.helm).toStrictEqual({ attitude: 0, rate: 0, torque: 0 });
    expect(ship.setpoints.drive).toStrictEqual({ throttle: 0 });
    expect(ship.setpoints.helm).toStrictEqual({ heading: 0 });
    expect(Object.keys(ship).slice(-4)).toEqual([
      'helm',
      'ftl',
      'safety',
      'setpoints',
    ]);
    expect(Object.keys(ship.setpoints).slice(-4)).toEqual([
      'drive',
      'helm',
      'ftl',
      'safety',
    ]);
    for (const record of [
      ship.drive,
      ship.helm,
      ship.setpoints.drive,
      ship.setpoints.helm,
    ]) {
      expect(Object.isFrozen(record)).toBe(true);
    }
  });

  it('applies a queued throttle and course and leaves the records to phase 2', () => {
    const store = new ShipStateStore(plan);
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

describe('ShipStateStore ftl', () => {
  it('starts the ftl record offline at Sol and the setpoints idle after helm, frozen', () => {
    const ship = new ShipStateStore(plan).snapshot();
    expect(ship.ftl).toStrictEqual({
      status: 'offline',
      charge: 0,
      sector: 'Sol',
      jumped: null,
    });
    expect(ship.setpoints.ftl).toStrictEqual({ armed: false, jump: null });
    const keys = Object.keys(ship);
    expect(keys.indexOf('ftl')).toBe(keys.indexOf('helm') + 1);
    const setpoints = Object.keys(ship.setpoints);
    expect(setpoints.indexOf('ftl')).toBe(setpoints.indexOf('helm') + 1);
    expect(Object.isFrozen(ship.ftl)).toBe(true);
    expect(Object.isFrozen(ship.setpoints.ftl)).toBe(true);
  });
});

describe('ShipStateStore weapons', () => {
  it('starts the weapons record idle and the setpoints unarmed after comms, frozen', () => {
    const ship = new ShipStateStore(plan).snapshot();
    expect(ship.weapons).toStrictEqual({
      status: 'idle',
      charge: 0,
      shots: 0,
      hits: 0,
      lastShot: null,
    });
    expect(ship.setpoints.weapons).toStrictEqual({ armed: false, range: null });
    const keys = Object.keys(ship);
    expect(keys.indexOf('weapons')).toBe(keys.indexOf('comms') + 1);
    const setpoints = Object.keys(ship.setpoints);
    expect(setpoints.indexOf('weapons')).toBe(setpoints.indexOf('comms') + 1);
    expect(Object.isFrozen(ship.weapons)).toBe(true);
    expect(Object.isFrozen(ship.setpoints.weapons)).toBe(true);
  });
});
