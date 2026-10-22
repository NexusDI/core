import {
  type HeaterSetpoint,
  LIFE_SUPPORT_DEVICES,
  LIFE_SUPPORT_LOAD,
  type LifeSupportRecord,
  type LifeSupportSetpoints,
  type PumpMode,
} from '../physics/atmosphere';
import { AIR, molesAt } from '../physics/gas';
import { allocatePower, DEFLECTOR_GRID } from '../physics/power';
import { LITHIUM_LOOP } from '../physics/thermal';
import type {
  DeepPartial,
  LoggedChange,
  QueuedCommand,
  SetpointChange,
  Setpoints,
} from './commands';
import {
  COMPARTMENT_IDS,
  type CompartmentId,
  type CompartmentPlan,
  type CompartmentState,
  DECK_PLAN,
  type DeckPlan,
  type IShipState,
  type ShipSnapshot,
} from './contracts';

/**
 * The most entries `log()` keeps. The store logs one entry per tick that
 * applied a change, so the log covers the newest 1,000 such ticks.
 */
const LOG_SIZE = 1_000;

/**
 * Holds the current snapshot, which starts at tick 0 with the deck's initial
 * air and every system idle, and one pending change: the merge of every
 * setpoint change the crew queued since the last tick. A client that sends
 * commands in a loop between two ticks replaces fields of that one change,
 * so the store keeps one change however many commands arrive.
 */
export class ShipStateStore implements IShipState {
  static deps = [DECK_PLAN] as const;

  private current: ShipSnapshot;
  private pending: SetpointChange | undefined;
  private entries: LoggedChange[] = [];

  constructor(deck: DeckPlan) {
    this.current = initialSnapshot(deck);
  }

  snapshot(): ShipSnapshot {
    return this.current;
  }

  commit(next: ShipSnapshot): void {
    this.current = next;
  }

  queue(change: SetpointChange): QueuedCommand {
    this.pending = mergeFrozen<SetpointChange>(this.pending ?? {}, change);
    return Object.freeze({ tick: this.current.tick + 1 });
  }

  applyQueued(tick: number): ShipSnapshot {
    const change = this.pending;
    if (!change) return this.current;
    this.pending = undefined;
    const setpoints = mergeFrozen<Setpoints>(this.current.setpoints, change);
    this.entries.push(Object.freeze({ tick, change }));
    if (this.entries.length > LOG_SIZE) {
      this.entries.splice(0, this.entries.length - LOG_SIZE);
    }
    this.current = Object.freeze({ ...this.current, setpoints });
    return this.current;
  }

  log(): readonly LoggedChange[] {
    return Object.freeze([...this.entries]);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** `value` when it is frozen, else a frozen copy of every plain object level under it. */
function frozen(value: unknown): unknown {
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) return Object.freeze([...(value as unknown[])]);
  if (isPlainObject(value)) return mergeFrozen(value, {});
  return value;
}

/**
 * A new frozen object that holds `base` with `change` merged over it, the
 * later value winning. A plain object in `change` merges key by key into the
 * one at the same key of `base`; a primitive or an array replaces the value
 * there. A key set to undefined leaves the value of `base` in place. The
 * merge copies every level it touches and freezes every level of the result,
 * so a caller that keeps `base` or `change` cannot alter the setpoints, the
 * pending change or the log.
 */
function mergeFrozen<T extends object>(base: T, change: DeepPartial<T>): T {
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    merged[key] = frozen(value);
  }
  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) continue;
    const current = merged[key];
    merged[key] = isPlainObject(value)
      ? mergeFrozen(isPlainObject(current) ? current : {}, value)
      : frozen(value);
  }
  return Object.freeze(merged) as T;
}

/**
 * Refuses a plan whose `equipment` lists an unknown device or one device
 * twice, a pump with no `pumpReservoir` or the reverse, or a reservoir that is
 * unknown or the pump's own room.
 */
function checkEquipment(room: CompartmentPlan): void {
  const devices = new Set<string>();
  for (const device of room.equipment ?? []) {
    if (!(LIFE_SUPPORT_DEVICES as readonly string[]).includes(device)) {
      throw new Error(
        `The deck plan gives compartment '${room.id}' an unknown device '${device}'.`,
      );
    }
    if (devices.has(device)) {
      throw new Error(
        `The deck plan gives compartment '${room.id}' the device '${device}' twice.`,
      );
    }
    devices.add(device);
  }
  const reservoir = room.pumpReservoir;
  if (devices.has('pump') && reservoir === undefined) {
    throw new Error(
      `The deck plan gives compartment '${room.id}' a pump and no pumpReservoir.`,
    );
  }
  if (reservoir === undefined) return;
  if (!devices.has('pump')) {
    throw new Error(
      `The deck plan gives compartment '${room.id}' a pumpReservoir and no pump.`,
    );
  }
  if (reservoir === room.id) {
    throw new Error(`The deck plan pumps compartment '${room.id}' to itself.`);
  }
  if (!(COMPARTMENT_IDS as readonly string[]).includes(reservoir)) {
    throw new Error(
      `The deck plan pumps compartment '${room.id}' to an unknown compartment '${reservoir}'.`,
    );
  }
}

/**
 * Life support offline, with one setpoint for each device a room lists:
 * heaters on at the deck's initial temperature, scrubbers and oxygen
 * generators on, vents shut and pumps off. Each heater starts at 0 W.
 */
function initialLifeSupport(
  rooms: Readonly<Record<CompartmentId, CompartmentPlan>>,
  temperature: number,
): {
  setpoints: LifeSupportSetpoints<CompartmentId>;
  record: LifeSupportRecord<CompartmentId>;
} {
  const heaters: Partial<Record<CompartmentId, HeaterSetpoint>> = {};
  const scrubbers: Partial<Record<CompartmentId, boolean>> = {};
  const oxygen: Partial<Record<CompartmentId, boolean>> = {};
  const vents: Partial<Record<CompartmentId, boolean>> = {};
  const pumps: Partial<Record<CompartmentId, PumpMode>> = {};
  const power: Partial<Record<CompartmentId, number>> = {};
  for (const id of COMPARTMENT_IDS) {
    const equipment = rooms[id].equipment ?? [];
    if (equipment.includes('heater')) {
      heaters[id] = Object.freeze({ on: true, target: temperature });
      power[id] = 0;
    }
    if (equipment.includes('scrubber')) scrubbers[id] = true;
    if (equipment.includes('oxygen')) oxygen[id] = true;
    if (equipment.includes('vent')) vents[id] = false;
    if (equipment.includes('pump')) pumps[id] = 'off';
  }
  return {
    setpoints: Object.freeze({
      online: false,
      heaters: Object.freeze(heaters),
      scrubbers: Object.freeze(scrubbers),
      oxygen: Object.freeze(oxygen),
      vents: Object.freeze(vents),
      pumps: Object.freeze(pumps),
    }),
    record: Object.freeze({ heaters: Object.freeze(power) }),
  };
}

function initialSnapshot(deck: DeckPlan): ShipSnapshot {
  const { temperature, pressure } = deck.initial;
  const seen = new Set<string>();
  for (const room of deck.compartments) {
    if (!(COMPARTMENT_IDS as readonly string[]).includes(room.id)) {
      throw new Error(
        `The deck plan names an unknown compartment '${room.id}'.`,
      );
    }
    if (seen.has(room.id)) {
      throw new Error(`The deck plan names compartment '${room.id}' twice.`);
    }
    seen.add(room.id);
    checkEquipment(room);
  }
  const rooms = {} as Record<CompartmentId, CompartmentPlan>;
  const compartments = {} as Record<CompartmentId, CompartmentState>;
  for (const id of COMPARTMENT_IDS) {
    const room = deck.compartments.find((plan) => plan.id === id);
    if (!room) throw new Error(`The deck plan has no compartment '${id}'.`);
    rooms[id] = room;
    compartments[id] = Object.freeze({
      moles: Object.freeze(molesAt(pressure, temperature, room.volume, AIR)),
      temperature,
    });
  }
  const lifeSupport = initialLifeSupport(rooms, temperature);
  const power = allocatePower(0, [
    { ...LIFE_SUPPORT_LOAD, demand: 0 },
    { ...DEFLECTOR_GRID, demand: 0 },
  ]);
  return Object.freeze({
    tick: 0,
    time: 0,
    compartments: Object.freeze(compartments),
    reactor: Object.freeze({
      level: 0,
      thermal: 0,
      electric: 0,
      tripped: false,
    }),
    coolant: Object.freeze({ temperature: LITHIUM_LOOP.standby }),
    power: Object.freeze({
      ...power,
      loads: Object.freeze(power.loads.map((entry) => Object.freeze(entry))),
      shed: Object.freeze(power.shed),
    }),
    lifeSupport: lifeSupport.record,
    setpoints: Object.freeze({
      reactor: Object.freeze({ throttle: 0 }),
      shields: Object.freeze({ raised: false }),
      lifeSupport: lifeSupport.setpoints,
    }),
  });
}
