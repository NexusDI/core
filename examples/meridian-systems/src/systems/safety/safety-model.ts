import { doorFractions, type DoorPlan } from '../../physics/doors';
import {
  exchange,
  heatCapacity,
  pressure,
  totalMoles,
  vent,
  ventFraction,
  type Air,
  type Gas,
} from '../../physics/gas';
import { LITHIUM_LOOP } from '../engineering/engineering-model';
import type { AtmosphereReading, RoomPlan } from '../life-support/contracts';

import type {
  Alarm,
  AlarmCode,
  RecordedAlarm,
  FloodPlan,
  SafetyRecord,
  SafetySetpoints,
} from './contracts';

/** The constants of the fire law. */
export const FIRE = {
  /** K. A room lights by chance only above this temperature. */
  ignition: 330,
  /** Ignitions per second in an eligible room. */
  lambda: 1e-3,
  /** Intensity gained per second while the room can burn. */
  growth: 0.05,
  /** Decay rate per second while the room cannot burn. */
  decay: 0.2,
  /** A fire below this intensity goes out. */
  out: 0.01,
  /** The intensity of a fire that just lit. */
  start: 0.05,
  /** mol/s at intensity 1: the O₂ a fire burns and the CO₂ and H₂O it adds. */
  burn: { O2: 0.5, CO2: 0.4, H2O: 0.2 },
  /** J per mol of O₂ burned. */
  energy: 400_000,
  /** A room burns only above both limits: the O₂ mole fraction and `p_O₂` in Pa. */
  oxygen: { fraction: 0.16, partial: 16_000 },
} as const;

/** A flood releases a room's whole charge over `seconds`. */
export const FLOOD = { seconds: 10 } as const;

/**
 * Whether a room of `volume` (m³) holds the oxygen a fire needs: an O₂ mole
 * fraction above 16 % and `p_O₂` above 16 kPa. The fraction catches dilution
 * by inert gas, and the partial pressure catches a room vented to space.
 */
export function burns(air: Air, volume: number): boolean {
  return (
    air.moles.O2 / totalMoles(air.moles) > FIRE.oxygen.fraction &&
    pressure(air.moles.O2, air.temperature, volume) > FIRE.oxygen.partial
  );
}

/**
 * One room's fire over `dt` seconds, from its `intensity` φ (0 for no fire).
 *
 * A room with no fire lights at φ = 0.05 when `burns` holds and either
 * `drill` is set or the room is above 330 K and one `draw` falls under
 * `1 − exp(−λ · dt)`. Any other room with no fire calls no `draw` and keeps
 * its air. A burning room grows `φ' = min(1, φ + 0.05 · dt)` while `burns`
 * holds, else decays to `φ' = φ · exp(−0.2 · dt)`, and goes out under 0.01.
 * The fire burns `min(n_O₂, 0.5 · φ' · dt)` mol of O₂, adds CO₂ and H₂O at
 * 0.4 and 0.2 per 0.5 burned, and heats the room by `400 kJ` per mol burned
 * over the heat capacity of the air before the burn.
 */
export function stepFire(
  air: Air,
  room: Pick<RoomPlan, 'volume' | 'structureHeatCapacity'>,
  intensity: number,
  dt: number,
  draw: () => number,
  drill: boolean,
): { readonly air: Air; readonly intensity: number } {
  const fuel = burns(air, room.volume);
  let next: number;
  if (intensity === 0) {
    if (!fuel) return Object.freeze({ air, intensity: 0 });
    if (!drill) {
      if (air.temperature <= FIRE.ignition) {
        return Object.freeze({ air, intensity: 0 });
      }
      if (draw() >= 1 - Math.exp(-FIRE.lambda * dt)) {
        return Object.freeze({ air, intensity: 0 });
      }
    }
    next = FIRE.start;
  } else {
    next = fuel
      ? Math.min(1, intensity + FIRE.growth * dt)
      : intensity * Math.exp(-FIRE.decay * dt);
    if (next < FIRE.out) return Object.freeze({ air, intensity: 0 });
  }
  const demand = FIRE.burn.O2 * next * dt;
  const burned = Math.min(air.moles.O2, demand);
  const share = burned / demand;
  const moles: Record<Gas, number> = {
    ...air.moles,
    O2: air.moles.O2 - burned,
    CO2: air.moles.CO2 + FIRE.burn.CO2 * next * dt * share,
    H2O: air.moles.H2O + FIRE.burn.H2O * next * dt * share,
  };
  const capacity = heatCapacity(air, room.structureHeatCapacity);
  return Object.freeze({
    air: Object.freeze({
      moles: Object.freeze(moles),
      temperature: air.temperature + (FIRE.energy * burned) / capacity,
    }),
    intensity: next,
  });
}

/**
 * Where each atmosphere alarm raises and, once active at the start of the
 * tick, where it clears. Each gap is at least ten times the noise of
 * `deck/sensors.calibration.json` (0.05 K, 20 Pa total, 5 Pa partial), so a
 * noisy reading near a limit raises the alarm once.
 */
const ALARM_LIMITS = {
  /** Active while `p_O₂` (Pa) sits under the limit. */
  HYPOXIA: { raise: 16_000, clear: 16_500 },
  /** Active while `p_CO₂` (Pa) sits over the limit. */
  CO2_HIGH: { raise: 1_000, clear: 950 },
  /** Active while the total pressure (Pa) sits under the limit. */
  PRESSURE_LOW: { raise: 70_000, clear: 72_000 },
  /** Active while the temperature (K) sits outside the band. */
  TEMPERATURE: {
    raise: { low: 283, high: 303 },
    clear: { low: 283.5, high: 302.5 },
  },
  /** Active while `dP/dt` (Pa/s) sits under the limit. */
  DECOMPRESSION: { raise: -2_000, clear: -1_000 },
} as const;

/** Everything one safety step reads. */
export interface SafetyInput<
  Id extends string = string,
  Door extends string = string,
> {
  /** Every compartment, in the order the step evaluates them. */
  readonly ids: readonly Id[];
  /** The ship as `applyQueued` committed it before any system stepped. */
  readonly start: {
    readonly compartments: Readonly<Record<Id, Air>>;
    readonly alarms: readonly RecordedAlarm[];
  };
  /** Each room's air after phase 4. */
  readonly compartments: Readonly<Record<Id, Air>>;
  readonly rooms: readonly (RoomPlan & FloodPlan)[];
  /** Every door, in deck order. */
  readonly doors: readonly DoorPlan[];
  readonly setpoints: SafetySetpoints<Id, Door>;
  /** The safety record of the tick before. */
  readonly record: SafetyRecord<Id>;
  /** The engineering records Safety reads this tick, with `coolant` in K. */
  readonly engineering: {
    readonly coolant: number;
    readonly tripped: boolean;
    readonly shed: readonly string[];
  };
  /** One analyzer sample of `air` as the room held it at `tick`. Any throw counts as a fault. */
  read(id: Id, air: Air, tick: number): AtmosphereReading<Id>;
  /** The next number in [0, 1) from the safety fork. */
  draw(): number;
  /** The tick this step computes. */
  readonly tick: number;
  /** Seconds. */
  readonly dt: number;
}

export interface SafetyStep<
  Id extends string = string,
  Door extends string = string,
> {
  /** The incoming object when the step changed no air. */
  readonly compartments: Readonly<Record<Id, Air>>;
  readonly safety: SafetyRecord<Id>;
  /** The incoming object when the step changed no setpoint. */
  readonly setpoints: SafetySetpoints<Id, Door>;
}

/**
 * The air of every room, copied on the first change. `result()` hands back
 * the incoming object while nothing changed.
 */
class Rooms<Id extends string> {
  private copy: Record<Id, Air> | undefined;

  constructor(private readonly incoming: Readonly<Record<Id, Air>>) {}

  get(id: Id): Air {
    return (this.copy ?? this.incoming)[id];
  }

  set(id: Id, air: Air): void {
    if (air === this.get(id)) return;
    this.copy ??= { ...this.incoming };
    this.copy[id] = air;
  }

  result(): Readonly<Record<Id, Air>> {
    return this.copy ? Object.freeze(this.copy) : this.incoming;
  }
}

/**
 * Writes `value` under each key of `keys` and returns `record` itself when
 * every key already held it.
 */
function writeAll<Key extends string, Value>(
  record: Readonly<Partial<Record<Key, Value>>>,
  keys: Iterable<Key>,
  value: Value,
): Readonly<Partial<Record<Key, Value>>> {
  let copy: Partial<Record<Key, Value>> | undefined;
  for (const key of keys) {
    if (record[key] === value) continue;
    copy ??= { ...record };
    copy[key] = value;
  }
  return copy ? Object.freeze(copy) : record;
}

function plan<Id extends string>(
  rooms: readonly (RoomPlan & FloodPlan)[],
  id: Id,
): RoomPlan & FloodPlan {
  const room = rooms.find((entry) => entry.id === id);
  if (!room) throw new Error(`The safety step has no room '${id}'.`);
  return room;
}

/** Runs every open door in deck order, each from the air the door before it left. */
function runDoors<Id extends string, Door extends string>(
  input: SafetyInput<Id, Door>,
  air: Rooms<Id>,
): void {
  const open: Readonly<Record<string, boolean>> = input.setpoints.doors;
  for (const door of input.doors) {
    if (open[door.id] !== true) continue;
    const [a, b] = door.between as readonly Id[];
    if (a === 'space' || b === 'space') {
      const id = a === 'space' ? b : a;
      const room = plan(input.rooms, id);
      air.set(
        id,
        vent(air.get(id), ventFraction(door.area, room.volume, input.dt)),
      );
      continue;
    }
    const roomA = plan(input.rooms, a);
    const roomB = plan(input.rooms, b);
    const { fromA, fromB } = doorFractions(
      door.area,
      roomA.volume,
      roomB.volume,
      input.dt,
    );
    const next = exchange(
      air.get(a),
      air.get(b),
      roomA.structureHeatCapacity,
      roomB.structureHeatCapacity,
      fromA,
      fromB,
    );
    air.set(a, next.a);
    air.set(b, next.b);
  }
}

/**
 * Releases `charge / (FLOOD.seconds / dt)` mol of N₂ a tick into each room
 * whose valve stands open, at the room's temperature. The tick that
 * releases the last of the charge writes the valve false and the count 0.
 */
function runFloods<Id extends string, Door extends string>(
  input: SafetyInput<Id, Door>,
  air: Rooms<Id>,
): {
  readonly flooded: Readonly<Partial<Record<Id, number>>>;
  readonly done: readonly Id[];
} {
  const flooded: Partial<Record<Id, number>> = { ...input.record.flooded };
  const done: Id[] = [];
  for (const id of input.ids) {
    if (input.setpoints.floods[id] !== true) continue;
    const charge = plan(input.rooms, id).floodCharge;
    if (charge === undefined)
      throw new Error(`The room '${id}' carries no flood charge.`);
    const perTick = (charge * input.dt) / FLOOD.seconds;
    const released = flooded[id] ?? 0;
    const remaining = charge - released;
    // The tolerance lets a charge that `perTick` does not divide in binary
    // finish on its last whole tick.
    const last = remaining <= perTick * (1 + 1e-9);
    const amount = last ? remaining : perTick;
    const room = air.get(id);
    const moles: Record<Gas, number> = {
      ...room.moles,
      N2: room.moles.N2 + amount,
    };
    air.set(
      id,
      Object.freeze({
        moles: Object.freeze(moles),
        temperature: room.temperature,
      }),
    );
    flooded[id] = last ? 0 : released + amount;
    if (last) done.push(id);
  }
  return { flooded: Object.freeze(flooded), done };
}

const alarmKey = (alarm: Alarm) => `${alarm.code}:${alarm.subject}`;

/** Whether `code` stood active for `subject` at the start of the tick. */
function activeAt(
  alarms: readonly Alarm[],
): (code: AlarmCode, subject: string) => boolean {
  const keys = new Set(alarms.map((alarm) => `${alarm.code}:${alarm.subject}`));
  return (code, subject) => keys.has(`${code}:${subject}`);
}

/**
 * The five atmosphere alarms of one occupied room, each past its raise
 * limit, or past its clear limit while it stood active.
 */
function atmosphereAlarms(
  now: AtmosphereReading,
  before: AtmosphereReading,
  dt: number,
  was: (code: AlarmCode) => boolean,
): AlarmCode[] {
  const codes: AlarmCode[] = [];
  const pick = <Raise, Clear>(
    code: AlarmCode,
    band: { readonly raise: Raise; readonly clear: Clear },
  ): Raise | Clear => (was(code) ? band.clear : band.raise);
  if (now.partial.O2 < pick('HYPOXIA', ALARM_LIMITS.HYPOXIA))
    codes.push('HYPOXIA');
  if (now.partial.CO2 > pick('CO2_HIGH', ALARM_LIMITS.CO2_HIGH))
    codes.push('CO2_HIGH');
  if (now.pressure < pick('PRESSURE_LOW', ALARM_LIMITS.PRESSURE_LOW))
    codes.push('PRESSURE_LOW');
  const band = pick('TEMPERATURE', ALARM_LIMITS.TEMPERATURE);
  if (now.temperature < band.low || now.temperature > band.high)
    codes.push('TEMPERATURE');
  const rate = (now.pressure - before.pressure) / dt;
  if (rate < pick('DECOMPRESSION', ALARM_LIMITS.DECOMPRESSION))
    codes.push('DECOMPRESSION');
  return codes;
}

/**
 * One safety step in phase 5: the doors, the fires,
 * the floods and the alarms, in that order.
 *
 * Each open door trades gas in deck order. Each room's fire runs on
 * `stepFire`, which draws from `draw` only for a room with no fire, above
 * 330 K, where `burns` holds. Every drill flag returns to false. Each open
 * valve releases its flood.
 * Then each compartment in `ids` order raises `FIRE` while φ > 0 and reads
 * the analyzer twice, on the start-of-tick air at `tick − 1` and on the
 * stepped air at `tick`. A throw from either read raises `SENSOR_FAULT` and
 * skips the room's atmosphere alarms. An occupied room raises those on the
 * reads with the deadband of `ALARM_LIMITS`, and while `DECOMPRESSION` stays
 * active the step shuts every door of the room. `COOLANT_HIGH`,
 * `REACTOR_TRIP` and one `LOAD_SHED` per shed load follow.
 *
 * With every door shut, no fire, no room above 330 K, no drill and no valve
 * open, the step returns the incoming `compartments` and `setpoints` and
 * never calls `draw`.
 */
export function stepSafety<Id extends string, Door extends string>(
  input: SafetyInput<Id, Door>,
): SafetyStep<Id, Door> {
  const air = new Rooms(input.compartments);
  runDoors(input, air);

  const fires = {} as Record<Id, number>;
  for (const id of input.ids) {
    const fire = stepFire(
      air.get(id),
      plan(input.rooms, id),
      input.record.fires[id] ?? 0,
      input.dt,
      () => input.draw(),
      input.setpoints.drills[id] === true,
    );
    air.set(id, fire.air);
    fires[id] = fire.intensity;
  }
  const drills = writeAll(
    input.setpoints.drills,
    Object.keys(input.setpoints.drills) as Id[],
    false,
  );

  const floods = runFloods(input, air);

  const was = activeAt(input.start.alarms);
  const alarms: Alarm[] = [];
  const sealed: Door[] = [];
  for (const id of input.ids) {
    if (fires[id] > 0) alarms.push({ code: 'FIRE', subject: id });
    let now: AtmosphereReading<Id>;
    let before: AtmosphereReading<Id>;
    try {
      before = input.read(id, input.start.compartments[id], input.tick - 1);
      now = input.read(id, air.get(id), input.tick);
    } catch {
      alarms.push({ code: 'SENSOR_FAULT', subject: id });
      continue;
    }
    if (plan(input.rooms, id).occupants === 0) continue;
    for (const code of atmosphereAlarms(now, before, input.dt, (alarm) =>
      was(alarm, id),
    )) {
      alarms.push({ code, subject: id });
      if (code !== 'DECOMPRESSION') continue;
      for (const door of input.doors)
        if (door.between.includes(id)) sealed.push(door.id as Door);
    }
  }
  const { coolant, tripped, shed } = input.engineering;
  if (coolant > LITHIUM_LOOP.alarm)
    alarms.push({ code: 'COOLANT_HIGH', subject: 'reactor' });
  if (tripped) alarms.push({ code: 'REACTOR_TRIP', subject: 'reactor' });
  for (const load of shed) alarms.push({ code: 'LOAD_SHED', subject: load });

  const valves = writeAll(input.setpoints.floods, floods.done, false);
  const doors = writeAll(
    input.setpoints.doors as Readonly<Partial<Record<Door, boolean>>>,
    sealed,
    false,
  ) as Readonly<Record<Door, boolean>>;
  const acknowledged = new Set(
    input.start.alarms.filter((alarm) => alarm.acknowledged).map(alarmKey),
  );
  const acknowledge = input.setpoints.acknowledge;
  const unchanged =
    !acknowledge &&
    drills === input.setpoints.drills &&
    valves === input.setpoints.floods &&
    doors === input.setpoints.doors;

  return Object.freeze({
    compartments: air.result(),
    safety: Object.freeze({
      fires: Object.freeze(fires),
      flooded: floods.flooded,
      alarms: Object.freeze(
        alarms.map((alarm) =>
          Object.freeze({
            ...alarm,
            acknowledged: acknowledge || acknowledged.has(alarmKey(alarm)),
          }),
        ),
      ),
    }),
    setpoints: unchanged
      ? input.setpoints
      : Object.freeze({ doors, floods: valves, drills, acknowledge: false }),
  });
}
