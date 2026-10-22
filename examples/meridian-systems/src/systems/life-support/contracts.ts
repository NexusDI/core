import { Token } from '@nexusdi/core';

import type {
  AtmosphereReading,
  LifeSupportRatings,
  PumpMode,
  SensorCalibration,
} from '../../physics/atmosphere';
import type { QueuedCommand } from '../../simulation/commands';
import type { CompartmentId } from '../../simulation/contracts';

/**
 * The actions life support takes and their ranges, in words. shipText reads
 * it after "It takes".
 */
export const LIFE_SUPPORT_ACTIONS =
  'online with no arguments, heater with a compartment and on true or false or a target from 283 to 303 K, scrubber and oxygen with a compartment and on true or false, vent with a compartment and open true or false, and pump with a compartment and mode off, evacuate or fill';

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
  /** Brings life support online. G2 has no command that takes it offline. */
  online(): QueuedCommand;
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
export const ATMOSPHERE_CONTROL = new Token<IAtmosphereControl>(
  'AtmosphereControl',
);
export const LIFE_SUPPORT_OPTIONS = new Token<LifeSupportOptions>(
  'LifeSupportOptions',
);
