import { R, T_HULL } from './constants';
import {
  GASES,
  heatCapacity,
  pressure,
  saturationPressure,
  totalMoles,
  transfer,
  vent,
  ventFraction,
  type Air,
  type Gas,
} from './gas';

/** The devices a compartment's plan can list under `equipment`. */
export const LIFE_SUPPORT_DEVICES = [
  'heater',
  'scrubber',
  'oxygen',
  'vent',
  'pump',
] as const;

/**
 * The figures of one room that the atmosphere reads. The deck's
 * `CompartmentPlan` has this shape, so the simulation passes its plans
 * straight in.
 */
export interface RoomPlan {
  readonly id: string;
  /** Cubic metres. */
  readonly volume: number;
  /** Hull conductance in W/K. */
  readonly conductance: number;
  /** J/K. */
  readonly structureHeatCapacity: number;
  readonly occupants: number;
  /** Entries of `LIFE_SUPPORT_DEVICES`. The deck's JSON types them as strings. */
  readonly equipment?: readonly string[];
  /** The room the pump fills from and empties into. */
  readonly pumpReservoir?: string;
  /** The coolant loop's leak into this room, in W/K. */
  readonly coolantConductance?: number;
}

/** `evacuate` moves a room's gas into its reservoir, and `fill` moves reservoir gas into the room. */
export type PumpMode = 'off' | 'evacuate' | 'fill';

export interface HeaterSetpoint {
  readonly on: boolean;
  /** The thermostat's target, in K. */
  readonly target: number;
}

/**
 * What the crew set for life support. Each record holds a key for each room
 * whose plan lists that device. `Id` narrows the keys to the deck's ids.
 */
export interface LifeSupportSetpoints<Id extends string = string> {
  /** False until the crew brings life support online. While false, no term of the atmosphere runs. */
  readonly online: boolean;
  readonly heaters: Readonly<Partial<Record<Id, HeaterSetpoint>>>;
  readonly scrubbers: Readonly<Partial<Record<Id, boolean>>>;
  readonly oxygen: Readonly<Partial<Record<Id, boolean>>>;
  /** True while the vent to space is open. */
  readonly vents: Readonly<Partial<Record<Id, boolean>>>;
  readonly pumps: Readonly<Partial<Record<Id, PumpMode>>>;
}

/** Life support at the end of a tick. */
export interface LifeSupportRecord<Id extends string = string> {
  /** The power each heater put into its room this tick, in W. */
  readonly heaters: Readonly<Partial<Record<Id, number>>>;
}

/** A proportional thermostat on an electric heater. */
export interface HeaterRating {
  /** W/K. */
  readonly gain: number;
  /** W. */
  readonly max: number;
}

export interface ScrubberRating {
  /** m³/s. */
  readonly flow: number;
  /** W. */
  readonly power: number;
  /** The relative humidity it dries the air to, 0 to 1. */
  readonly humidity: number;
}

/** An oxygen generator on a proportional controller. */
export interface ElectrolyserRating {
  /** mol/(s Pa). */
  readonly gain: number;
  /** mol/s. */
  readonly max: number;
  /** J per mol of O₂. */
  readonly energy: number;
  /** The O₂ partial pressure it holds, in Pa. */
  readonly setpoint: number;
}

export interface PumpRating {
  /** m³/s of the source room. */
  readonly rate: number;
  /** The draw at no pressure rise, in W. */
  readonly base: number;
  /** 0 to 1. */
  readonly efficiency: number;
  /** The rise in Pa from which the pump moves no gas. */
  readonly maxRise: number;
}

export interface VentRating {
  /** m². */
  readonly area: number;
}

export interface LifeSupportRatings {
  readonly heater: HeaterRating;
  readonly scrubber: ScrubberRating;
  readonly electrolyser: ElectrolyserRating;
  readonly pump: PumpRating;
  readonly vent: VentRating;
}

/** The bridge and habitat heaters, spec §5.2. */
const ELECTRIC_HEATER: HeaterRating = { gain: 10_000, max: 10_000 };

/** The CO₂ scrubbers, spec §5.3. */
const CO2_SCRUBBER: ScrubberRating = {
  flow: 0.05,
  power: 1_200,
  humidity: 0.4,
};

/**
 * The oxygen generators, spec §5.3. 600 kJ per mol O₂ is about 95 % efficient
 * against the 571.6 kJ higher heating value of the two moles of water that
 * give one mole of O₂, so the full 0.01 mol/s draws 6 kW. The generator takes
 * its water from the ship's tank and none from the room.
 */
const ELECTROLYSER: ElectrolyserRating = {
  gain: 2e-5,
  max: 0.01,
  energy: 600_000,
  setpoint: 21_000,
};

/** The airlock's transfer pump, spec §5.4. */
const TRANSFER_PUMP: PumpRating = {
  rate: 0.2,
  base: 400,
  efficiency: 0.6,
  maxRise: 101_300,
};

/** The airlock's vent to space, spec §5.4. */
const SPACE_VENT: VentRating = { area: 0.01 };

export const LIFE_SUPPORT_RATINGS: LifeSupportRatings = {
  heater: ELECTRIC_HEATER,
  scrubber: CO2_SCRUBBER,
  electrolyser: ELECTROLYSER,
  pump: TRANSFER_PUMP,
  vent: SPACE_VENT,
};

/**
 * One occupant per second: mol/s of each gas and W of body heat, from spec
 * §5.3 (0.84 kg O₂, 1.0 kg CO₂ and 2.5 kg water a day).
 */
export const OCCUPANT = {
  O2: 3.038e-4,
  CO2: 2.63e-4,
  H2O: 1.606e-3,
  heat: 100,
} as const;

/** The volatiles each room releases, in mol/s. */
export const OFF_GASSING = 1e-6;

/** Everything `stepAtmosphere` reads for one tick. */
export interface AtmosphereInput {
  /** Each room's air at the start of the tick, by room id. */
  readonly compartments: Readonly<Record<string, Air>>;
  /** Every room, in the order the tick steps them. */
  readonly rooms: readonly RoomPlan[];
  readonly setpoints: LifeSupportSetpoints;
  /** K. */
  readonly coolantTemperature: number;
  /** True when the router shed the life-support load this tick. */
  readonly shed: boolean;
  /** Seconds. */
  readonly dt: number;
  readonly ratings: LifeSupportRatings;
}

export interface AtmosphereResult {
  readonly compartments: Readonly<Record<string, Air>>;
  readonly lifeSupport: LifeSupportRecord;
}

/** What one room's devices put out this tick. */
interface DeviceOutput {
  /** W. */
  readonly heat: number;
  /** mol/s of O₂. */
  readonly oxygen: number;
  readonly scrubbing: boolean;
}

const IDLE: DeviceOutput = { heat: 0, oxygen: 0, scrubbing: false };

/** The source and target room of a running pump. */
interface PumpRoute {
  readonly source: string;
  readonly target: string;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function roomPressure(air: Air, room: RoomPlan): number {
  return pressure(totalMoles(air.moles), air.temperature, room.volume);
}

function roomOf(rooms: readonly RoomPlan[], id: string): RoomPlan {
  const room = rooms.find((candidate) => candidate.id === id);
  if (!room) throw new Error(`The deck has no room '${id}'.`);
  return room;
}

/** `clamp(K_t · (T_set − T), 0, Q_max)` in W, or 0 while the heater is off. */
function heaterPower(
  air: Air,
  setpoint: HeaterSetpoint | undefined,
  rating: HeaterRating,
): number {
  if (!setpoint?.on) return 0;
  return clamp(
    rating.gain * (setpoint.target - air.temperature),
    0,
    rating.max,
  );
}

/** `clamp(k_o · (p_set − p_O₂), 0, ṅ_max)` in mol/s, for a room of `volume` m³. */
export function oxygenRate(
  air: Air,
  volume: number,
  rating: ElectrolyserRating,
): number {
  const partial = pressure(air.moles.O2, air.temperature, volume);
  return clamp(rating.gain * (rating.setpoint - partial), 0, rating.max);
}

/**
 * `base + rate · clamp(rise, 0, maxRise) / efficiency` in W, for a pump that
 * works against `rise` Pa. A stalled pump draws the full figure.
 */
export function pumpDraw(rise: number, rating: PumpRating): number {
  return (
    rating.base +
    (rating.rate * clamp(rise, 0, rating.maxRise)) / rating.efficiency
  );
}

/** The share of the source room's gas the pump moves in `dt`: `min(1, rate · dt / V)`. */
export function pumpFraction(
  volume: number,
  rating: PumpRating,
  dt: number,
): number {
  return Math.min(1, (rating.rate * dt) / volume);
}

/** True when the pump moves no gas against `rise` Pa. */
export function pumpStalled(rise: number, rating: PumpRating): boolean {
  return rise >= rating.maxRise;
}

/** Where the room's pump moves gas, or undefined while it is off. */
function pumpRoute(
  room: RoomPlan,
  mode: PumpMode | undefined,
): PumpRoute | undefined {
  const reservoir = room.pumpReservoir;
  if (reservoir === undefined) return undefined;
  if (mode === 'evacuate') return { source: room.id, target: reservoir };
  if (mode === 'fill') return { source: reservoir, target: room.id };
  return undefined;
}

/** `P_target − P_source` in Pa, from the start-of-tick air. */
function pumpRise(
  route: PumpRoute,
  compartments: Readonly<Record<string, Air>>,
  rooms: readonly RoomPlan[],
): number {
  return (
    roomPressure(compartments[route.target], roomOf(rooms, route.target)) -
    roomPressure(compartments[route.source], roomOf(rooms, route.source))
  );
}

function deviceOutput(
  room: RoomPlan,
  air: Air,
  setpoints: LifeSupportSetpoints,
  ratings: LifeSupportRatings,
): DeviceOutput {
  return {
    heat: heaterPower(air, setpoints.heaters[room.id], ratings.heater),
    oxygen:
      setpoints.oxygen[room.id] === true
        ? oxygenRate(air, room.volume, ratings.electrolyser)
        : 0,
    scrubbing: setpoints.scrubbers[room.id] === true,
  };
}

function deviceDemand(output: DeviceOutput, ratings: LifeSupportRatings) {
  return (
    output.heat +
    (output.scrubbing ? ratings.scrubber.power : 0) +
    output.oxygen * ratings.electrolyser.energy
  );
}

/**
 * The power life support asks the router for, in W, from the start-of-tick
 * air: each heater and generator at its controller's output, each scrubber
 * that is on, and each pump that is not off. 0 W while offline.
 */
export function lifeSupportDemand(
  compartments: Readonly<Record<string, Air>>,
  rooms: readonly RoomPlan[],
  setpoints: LifeSupportSetpoints,
  ratings: LifeSupportRatings,
): number {
  if (!setpoints.online) return 0;
  let demand = 0;
  for (const room of rooms) {
    const output = deviceOutput(
      room,
      compartments[room.id],
      setpoints,
      ratings,
    );
    demand += deviceDemand(output, ratings);
    const route = pumpRoute(room, setpoints.pumps[room.id]);
    if (route) {
      demand += pumpDraw(pumpRise(route, compartments, rooms), ratings.pump);
    }
  }
  return demand;
}

/** Metabolism and off-gassing over `dt`, on a copy of the moles. */
function breathe(room: RoomPlan, air: Air, dt: number): Record<Gas, number> {
  const crew = room.occupants * dt;
  return {
    ...air.moles,
    O2: air.moles.O2 - OCCUPANT.O2 * crew,
    CO2: air.moles.CO2 + OCCUPANT.CO2 * crew,
    H2O: air.moles.H2O + OCCUPANT.H2O * crew,
    volatiles: air.moles.volatiles + OFF_GASSING * dt,
  };
}

/**
 * Removes the fraction `1 − exp(−dt · S / V)` of the CO₂ and the volatiles.
 * Water above the humidity setpoint `n_set` falls by the same fraction and
 * stops at `n_set`, which the scrubber reads at the start-of-tick
 * temperature.
 */
function scrub(
  moles: Record<Gas, number>,
  room: RoomPlan,
  temperature: number,
  dt: number,
  rating: ScrubberRating,
): void {
  const kept = Math.exp((-dt * rating.flow) / room.volume);
  moles.CO2 *= kept;
  moles.volatiles *= kept;
  const dry =
    (rating.humidity * saturationPressure(temperature) * room.volume) /
    (R * temperature);
  if (moles.H2O > dry) moles.H2O = Math.max(dry, moles.H2O * kept);
}

/**
 * The heat into the room in W: the heater, the occupants and the coolant
 * leak, less the loss to the hull, `G · (T − T_hull)`.
 */
function heatFlow(
  room: RoomPlan,
  air: Air,
  heater: number,
  coolantTemperature: number,
): number {
  const leak =
    (room.coolantConductance ?? 0) * (coolantTemperature - air.temperature);
  return (
    heater +
    OCCUPANT.heat * room.occupants +
    leak -
    room.conductance * (air.temperature - T_HULL)
  );
}

/**
 * One room's own step from its start-of-tick air: metabolism and
 * off-gassing, the generator, the scrubber, then the explicit heat balance
 * with `C` from the start-of-tick moles.
 */
function stepRoom(
  room: RoomPlan,
  air: Air,
  output: DeviceOutput,
  input: AtmosphereInput,
): Air {
  const moles = breathe(room, air, input.dt);
  moles.O2 += output.oxygen * input.dt;
  if (output.scrubbing) {
    scrub(moles, room, air.temperature, input.dt, input.ratings.scrubber);
  }
  const heat = heatFlow(room, air, output.heat, input.coolantTemperature);
  return Object.freeze({
    moles: Object.freeze(moles),
    temperature:
      air.temperature +
      (input.dt * heat) / heatCapacity(air, room.structureHeatCapacity),
  });
}

/** Applies every open vent to `next`. A vent is a valve, so it runs on a shed tick. */
function openVents(next: Record<string, Air>, input: AtmosphereInput): void {
  for (const room of input.rooms) {
    if (input.setpoints.vents[room.id] !== true) continue;
    const kept = ventFraction(input.ratings.vent.area, room.volume, input.dt);
    next[room.id] = vent(next[room.id], kept);
  }
}

/**
 * Runs every pump that is on and has not stalled, in room order. The stall
 * reads the start-of-tick pressures, and the transfer moves gas from the
 * rooms as their own step and the vents left them.
 */
function runPumps(next: Record<string, Air>, input: AtmosphereInput): void {
  for (const room of input.rooms) {
    const route = pumpRoute(room, input.setpoints.pumps[room.id]);
    if (!route) continue;
    const rise = pumpRise(route, input.compartments, input.rooms);
    if (pumpStalled(rise, input.ratings.pump)) continue;
    const source = roomOf(input.rooms, route.source);
    const target = roomOf(input.rooms, route.target);
    const moved = transfer(
      next[route.source],
      next[route.target],
      target.structureHeatCapacity,
      pumpFraction(source.volume, input.ratings.pump, input.dt),
    );
    next[route.source] = moved.source;
    next[route.target] = moved.target;
  }
}

/** The power of each room's heater this tick, in W, by room. */
function heaterRecord(
  input: AtmosphereInput,
  output: (room: RoomPlan) => DeviceOutput,
): LifeSupportRecord {
  const heaters: Record<string, number> = {};
  for (const room of input.rooms) {
    if (Object.hasOwn(input.setpoints.heaters, room.id)) {
      heaters[room.id] = output(room).heat;
    }
  }
  return Object.freeze({ heaters: Object.freeze(heaters) });
}

/**
 * One tick of the air in every room, spec §5.2 to §5.4.
 *
 * Each room first takes its own step from the start-of-tick air. Every open
 * vent then runs, then every pump that has not stalled. A shed tick runs no
 * heater, scrubber, generator or pump; metabolism, hull loss, the coolant
 * leak and the vents still run. Offline, the rooms come back as they went in
 * and every heater reads 0 W.
 */
export function stepAtmosphere(input: AtmosphereInput): AtmosphereResult {
  if (!input.setpoints.online) {
    return Object.freeze({
      compartments: input.compartments,
      lifeSupport: heaterRecord(input, () => IDLE),
    });
  }
  const outputs = new Map<string, DeviceOutput>();
  for (const room of input.rooms) {
    const air = input.compartments[room.id];
    outputs.set(
      room.id,
      input.shed
        ? IDLE
        : deviceOutput(room, air, input.setpoints, input.ratings),
    );
  }
  const output = (room: RoomPlan) => outputs.get(room.id) ?? IDLE;
  const next: Record<string, Air> = {};
  for (const room of input.rooms) {
    next[room.id] = stepRoom(
      room,
      input.compartments[room.id],
      output(room),
      input,
    );
  }
  openVents(next, input);
  if (!input.shed) runPumps(next, input);
  return Object.freeze({
    compartments: Object.freeze(next),
    lifeSupport: heaterRecord(input, output),
  });
}

/** The noise amplitude of one analyzer, for each value it reads. */
export interface SensorNoise {
  /** K. */
  readonly temperature: number;
  /** Pa, of the total pressure. */
  readonly pressure: number;
  /** Pa, of each partial pressure. */
  readonly partial: number;
}

/** The shape of `deck/sensors.calibration.json`. */
export interface SensorCalibration<Id extends string = string> {
  /** The step each reading rounds to: K for the temperature, Pa for every pressure. */
  readonly resolution: {
    readonly temperature: number;
    readonly pressure: number;
  };
  readonly compartments: Readonly<Record<Id, { readonly noise: SensorNoise }>>;
}

/** One analyzer sample of one compartment. */
export interface AtmosphereReading<Id extends string = string> {
  readonly compartment: Id;
  readonly tick: number;
  /** K. */
  readonly temperature: number;
  /** Pa. */
  readonly pressure: number;
  /** Pa, for each gas. */
  readonly partial: Readonly<Record<Gas, number>>;
}

/**
 * The digits `toFixed` keeps for a resolution of `step`, such as 2 for 0.25
 * and 8 for 2.5e-7. `String(step)` writes a small step with an exponent, so
 * the count is the mantissa's decimals less the exponent.
 */
function decimals(step: number): number {
  const [mantissa, exponent = '0'] = String(step).split('e');
  return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent));
}

/**
 * `max(0, value + (2u − 1) · noise)`, rounded to `step` and cleaned through
 * `toFixed`. The floor at 0 keeps a near-vacuum reading from going negative.
 */
function sample(
  value: number,
  noise: number,
  step: number,
  draw: () => number,
): number {
  const noisy = Math.max(0, value + (2 * draw() - 1) * noise);
  return Number((Math.round(noisy / step) * step).toFixed(decimals(step)));
}

/**
 * What a gas analyzer reads in `compartment` at `tick`. `draw` answers
 * numbers in [0, 1), and the reading takes one each for the temperature, the
 * pressure and then each gas in `GASES` order. The caller passes a stream
 * forked for the compartment and the tick, so every read of one tick agrees.
 */
export function readAtmosphere<Id extends string>(
  air: Air,
  plan: RoomPlan,
  compartment: Id,
  tick: number,
  calibration: SensorCalibration,
  draw: () => number,
): AtmosphereReading<Id> {
  const entry = calibration.compartments[compartment];
  if (!entry) {
    throw new Error(
      `The sensor calibration has no entry for '${compartment}'.`,
    );
  }
  const { noise } = entry;
  const { resolution } = calibration;
  const temperature = sample(
    air.temperature,
    noise.temperature,
    resolution.temperature,
    draw,
  );
  const total = sample(
    roomPressure(air, plan),
    noise.pressure,
    resolution.pressure,
    draw,
  );
  const partial = {} as Record<Gas, number>;
  for (const gas of GASES) {
    partial[gas] = sample(
      pressure(air.moles[gas], air.temperature, plan.volume),
      noise.partial,
      resolution.pressure,
      draw,
    );
  }
  return Object.freeze({
    compartment,
    tick,
    temperature,
    pressure: total,
    partial: Object.freeze(partial),
  });
}
