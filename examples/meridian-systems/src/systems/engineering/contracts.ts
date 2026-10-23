import { MultiToken, Token } from '@nexusdi/core';

import type { PowerLoad } from '../../physics/power';
import type { CoolantRating, ReactorRating } from '../../physics/thermal';
import type { QueuedCommand } from '../../simulation/commands';
import type { ShipSnapshot } from '../../simulation/contracts';

export interface IReactorCore {
  /** Electric output now, in GW (docs §7.1). */
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
