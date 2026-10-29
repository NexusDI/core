import { Token } from '@nexusdi/core';

import type { Gas } from '../../physics/gas';
import type { QueuedCommand } from '../../simulation/commands';
import type {
  CompartmentId,
  CompartmentState,
} from '../../simulation/contracts';

/** The name life support answers to on the command desk. */
export const LIFE_SUPPORT_SYSTEM = 'life-support';

/**
 * The actions life support takes and their ranges, in words. shipText reads
 * it after "It takes".
 */
export const LIFE_SUPPORT_ACTIONS =
  'online and offline with no arguments, heater with a compartment and on true or false or a target from 283 to 303 K, scrubber and oxygen with a compartment and on true or false, vent with a compartment and open true or false, and pump with a compartment and mode off, evacuate or fill';

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
 * The calibrated sensors of every compartment. A route's analyzer and
 * Safety's step read through the same probe, so both see the same noisy
 * numbers.
 */
export interface IAtmosphereProbe {
  /**
   * Reads `air` as the sensors of `compartment` read it at `tick`. One
   * compartment, air and tick always give the same reading. Throws a plain
   * `Error` when the deck has no such compartment.
   */
  read(
    compartment: CompartmentId,
    air: CompartmentState,
    tick: number,
  ): AtmosphereReading<CompartmentId>;
}

/** A gas analyzer in one compartment. */
export interface IAtmosphereSensor {
  /** The sample the analyzer took when the container built it. */
  read(): AtmosphereReading<CompartmentId>;
}

/**
 * The life-support panel. Each method queues a setpoint for the next tick,
 * and each device method throws `BadCommandError` (`reason: 'argument'`)
 * when `compartment` has no such device on the deck.
 */
export interface IAtmosphereControl {
  /** Brings life support online. */
  online(): QueuedCommand;
  /**
   * Takes life support offline. The step then leaves the air as it is, and
   * the queued device setpoints stay for the next `online`.
   */
  offline(): QueuedCommand;
  /** Switches the heater, sets its thermostat target in K, or both. */
  heater(
    compartment: string,
    setting: { readonly on?: boolean; readonly target?: number },
  ): QueuedCommand;
  scrubber(compartment: string, on: boolean): QueuedCommand;
  oxygen(compartment: string, on: boolean): QueuedCommand;
  /** Opens or shuts the vent to space. */
  vent(compartment: string, open: boolean): QueuedCommand;
  pump(compartment: string, mode: PumpMode): QueuedCommand;
}

/** What `LifeSupport.forRoot` and `forRootAsync` take. */
export interface LifeSupportOptions {
  /** The analyzers' noise and resolution, one entry per compartment. */
  readonly calibration: SensorCalibration;
  readonly ratings: LifeSupportRatings;
}

/**
 * Transient: each `get()` builds an analyzer that samples the compartment of
 * the scope's request at the current tick.
 */
export const ATMOSPHERE_SENSOR = new Token<IAtmosphereSensor>(
  'AtmosphereSensor',
);
export const ATMOSPHERE_PROBE = new Token<IAtmosphereProbe>('AtmosphereProbe');
export const ATMOSPHERE_CONTROL = new Token<IAtmosphereControl>(
  'AtmosphereControl',
);
export const LIFE_SUPPORT_OPTIONS = new Token<LifeSupportOptions>(
  'LifeSupportOptions',
);

declare module '../../simulation/contracts' {
  interface ShipRecords {
    readonly lifeSupport: LifeSupportRecord<CompartmentId>;
  }
  interface ShipSetpoints {
    readonly lifeSupport: LifeSupportSetpoints<CompartmentId>;
  }
}
