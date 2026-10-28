import { MultiToken, Token } from '@nexusdi/core';

import type { QueuedCommand } from '../../simulation/commands';
import type { ShipSnapshot } from '../../simulation/contracts';

/** The name engineering answers to on the command desk. */
export const ENGINEERING_SYSTEM = 'engineering';

/**
 * The actions engineering takes and their ranges, in words. shipText reads
 * it after "It takes".
 */
export const ENGINEERING_ACTIONS =
  'throttle with a level from 0 to 1 and shields with raised true or false';

/** The fixed figures of a fusion reactor. */
export interface ReactorRating {
  /** Thermal output at full level, in W. */
  readonly thermal: number;
  /** The share of the thermal output the reactor turns into electricity, 0 to 1. */
  readonly efficiency: number;
  /** The most the level moves toward its setpoint, per second. */
  readonly ramp: number;
}

/** The reactor's state at the end of a tick. */
export interface ReactorRecord {
  /** The output level, 0 to 1. */
  readonly level: number;
  /** Thermal output, in W. */
  readonly thermal: number;
  /** Electric output, in W. */
  readonly electric: number;
  /** True once the coolant loop has tripped the reactor. */
  readonly tripped: boolean;
}

/** The fixed figures of a coolant loop and its radiators. */
export interface CoolantRating {
  /** Coolant mass, in kg. */
  readonly mass: number;
  /** Specific heat capacity of the coolant, in J/(kg K). */
  readonly heatCapacity: number;
  /** Radiator area, in m². */
  readonly area: number;
  /** Radiator emissivity, 0 to 1. */
  readonly emissivity: number;
  /** The temperature the louvres hold the loop at, in K. They open above it. */
  readonly standby: number;
  /** The span above `standby` over which the louvres open fully, in K. */
  readonly band: number;
  /** The temperature the coolant alarm sounds at, in K. */
  readonly alarm: number;
  /** The temperature the loop trips the reactor at, in K. */
  readonly trip: number;
}

/** The coolant loop's state at the end of a tick. */
export interface CoolantRecord {
  /** Coolant temperature, in K. */
  readonly temperature: number;
}

/** A consumer that asks the power router for electricity this tick. */
export interface PowerLoad {
  /** The consumer's name, unique among the loads of one tick. */
  readonly id: string;
  /** Its place in the queue. The router serves 1 first. */
  readonly priority: number;
  /** The power it asks for, in W. */
  readonly demand: number;
  /** The share of its allocated power that ends in the coolant loop, 0 to 1. */
  readonly heatShare: number;
}

/** What one load asked for and what the router gave it. */
export interface LoadRecord {
  readonly id: string;
  readonly priority: number;
  /** The power it asked for, in W. */
  readonly demand: number;
  /** The power it got, in W: either 0 or its whole demand. */
  readonly allocated: number;
}

/** The router's allocation at the end of a tick. */
export interface PowerRecord {
  /** The electric output the router shared out, in W. */
  readonly output: number;
  /** Every load, in the order the router served them. */
  readonly loads: readonly LoadRecord[];
  /** The ids of the loads that asked for power and got none, in serving order. */
  readonly shed: readonly string[];
}

export interface IReactorCore {
  /** Electric output now, in GW. */
  readonly output: number;
  /** The reactor's fixed figures, in W and per second. */
  readonly rating: ReactorRating;
  /** Queues the reactor level the crew asks for, 0 to 1. */
  throttle(level: number): QueuedCommand;
}

export interface ICoolantLoop {
  readonly rating: CoolantRating;
}

export interface IPowerRouter {
  /** Every load that asks for power on the tick that reads `ship`. */
  loads(ship: ShipSnapshot): readonly PowerLoad[];
  /**
   * Checks that `load` fits beside the other loads at the reactor's current
   * electric output, and throws `PowerBudgetError` when it does not.
   */
  divert(load: PowerLoad): void;
  /**
   * Lists `consumer`'s draw after the consumers of POWER_CONSUMERS and returns
   * a function that removes it and runs twice safely. The router resolved
   * `all(POWER_CONSUMERS)` at its construction, so a consumer that a module
   * loaded later joins this way.
   */
  attach(consumer: IPowerConsumer): () => void;
}

export interface IShieldGrid {
  /** The grid's load on the tick that reads `ship`, from its setpoint. */
  draw(ship: ShipSnapshot): PowerLoad;
  /** Queues the raised setpoint once the router fits the raised load. */
  raise(): QueuedCommand;
  lower(): QueuedCommand;
}

/** A system that asks the power router for electricity on each tick. */
export interface IPowerConsumer {
  /** The system's load on the tick that reads `ship`. */
  draw(ship: ShipSnapshot): PowerLoad;
}

export const REACTOR = new Token<IReactorCore>('ReactorCore');
export const COOLANT_LOOP = new Token<ICoolantLoop>('CoolantLoop');
export const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');
export const SHIELD_GRID = new Token<IShieldGrid>('ShieldGrid');
/**
 * The loads other systems add to the router. A system's module provides its
 * consumer here and exports the token.
 */
export const POWER_CONSUMERS = new MultiToken<IPowerConsumer>('PowerConsumers');
