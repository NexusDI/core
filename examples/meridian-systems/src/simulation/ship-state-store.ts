import {
  type HeaterSetpoint,
  LIFE_SUPPORT_DEVICES,
  LIFE_SUPPORT_LOAD,
  type LifeSupportRecord,
  type LifeSupportSetpoints,
  type PumpMode,
} from '../physics/atmosphere';
import { COMMS_LOAD } from '../physics/comms';
import { HOME_SECTOR } from '../physics/ftl';
import { AIR, molesAt } from '../physics/gas';
import { MAIN_DRIVE_LOAD, THRUSTERS_LOAD } from '../physics/motion';
import { allocatePower, DEFLECTOR_GRID } from '../physics/power';
import type { SafetyRecord, SafetySetpoints } from '../physics/safety';
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
  DOOR_IDS,
  type DoorId,
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

/** Refuses a flood charge that is not a positive finite number of moles. */
function checkFloodCharge(room: CompartmentPlan): void {
  const charge = room.floodCharge;
  if (charge === undefined) return;
  if (!Number.isFinite(charge) || charge <= 0) {
    throw new Error(
      `The deck plan gives compartment '${room.id}' a floodCharge of ${charge}. A charge is a positive finite number of moles.`,
    );
  }
}

/** A compartment id or `space`. */
function isSide(id: string): boolean {
  return id === 'space' || (COMPARTMENT_IDS as readonly string[]).includes(id);
}

/**
 * Refuses a deck whose doors differ from `DOOR_IDS`, or a door whose
 * `between` does not hold two distinct sides, each a compartment id or
 * `space`.
 */
function checkDoors(deck: DeckPlan): void {
  const seen = new Set<string>();
  for (const door of deck.doors) {
    if (!(DOOR_IDS as readonly string[]).includes(door.id)) {
      throw new Error(`The deck plan names an unknown door '${door.id}'.`);
    }
    if (seen.has(door.id)) {
      throw new Error(`The deck plan names door '${door.id}' twice.`);
    }
    seen.add(door.id);
    const [a, b] = door.between;
    const sides = door.between.length === 2 && a !== b;
    if (!sides || !door.between.every(isSide)) {
      throw new Error(
        `The deck plan gives door '${door.id}' the sides ${JSON.stringify(door.between)}. A door joins two compartments, or one compartment and space.`,
      );
    }
  }
  for (const id of DOOR_IDS) {
    if (!seen.has(id)) throw new Error(`The deck plan has no door '${id}'.`);
  }
}

/**
 * Every door shut, and the flood valve and the drill flag of each room with
 * a flood charge off. No room burns and no alarm is active; each charged
 * room's flood count starts at 0.
 */
function initialSafety(
  rooms: Readonly<Record<CompartmentId, CompartmentPlan>>,
): {
  setpoints: SafetySetpoints<CompartmentId, DoorId>;
  record: SafetyRecord<CompartmentId>;
} {
  const doors = {} as Record<DoorId, boolean>;
  for (const id of DOOR_IDS) doors[id] = false;
  const floods: Partial<Record<CompartmentId, boolean>> = {};
  const drills: Partial<Record<CompartmentId, boolean>> = {};
  const fires = {} as Record<CompartmentId, number>;
  const flooded: Partial<Record<CompartmentId, number>> = {};
  for (const id of COMPARTMENT_IDS) {
    fires[id] = 0;
    if (rooms[id].floodCharge === undefined) continue;
    floods[id] = false;
    drills[id] = false;
    flooded[id] = 0;
  }
  return {
    setpoints: Object.freeze({
      doors: Object.freeze(doors),
      floods: Object.freeze(floods),
      drills: Object.freeze(drills),
    }),
    record: Object.freeze({
      fires: Object.freeze(fires),
      flooded: Object.freeze(flooded),
      alarms: Object.freeze([]),
    }),
  };
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
    checkFloodCharge(room);
  }
  checkDoors(deck);
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
  const safety = initialSafety(rooms);
  const power = allocatePower(0, [
    { ...LIFE_SUPPORT_LOAD, demand: 0 },
    { ...DEFLECTOR_GRID, demand: 0 },
    { ...COMMS_LOAD, demand: 0 },
    { ...THRUSTERS_LOAD, demand: 0 },
    { ...MAIN_DRIVE_LOAD, demand: 0 },
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
    comms: Object.freeze({
      status: 'standby',
      sent: null,
      messages: Object.freeze([]),
    }),
    drive: Object.freeze({
      thrust: 0,
      massFlow: 0,
      acceleration: 0,
      velocity: 0,
      distance: 0,
    }),
    helm: Object.freeze({ attitude: 0, rate: 0, torque: 0 }),
    ftl: Object.freeze({
      status: 'offline',
      charge: 0,
      sector: HOME_SECTOR,
      jumped: null,
    }),
    safety: safety.record,
    setpoints: Object.freeze({
      reactor: Object.freeze({ throttle: 0 }),
      shields: Object.freeze({ raised: false }),
      lifeSupport: lifeSupport.setpoints,
      comms: Object.freeze({ hail: false }),
      drive: Object.freeze({ throttle: 0 }),
      helm: Object.freeze({ heading: 0 }),
      ftl: Object.freeze({ armed: false, jump: null }),
      safety: safety.setpoints,
    }),
  });
}
