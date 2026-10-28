import { all } from '@nexusdi/core';

import { PowerBudgetError } from '../../errors';
import {
  type IShipState,
  SHIP_STATE,
  type ShipSnapshot,
} from '../../simulation/contracts';
import { Subscribers } from '../../simulation/subscribers';

import {
  type IPowerConsumer,
  type IPowerRouter,
  POWER_CONSUMERS,
  type PowerLoad,
} from './contracts';
import { allocatePower } from './engineering-model';

/**
 * Lists the loads of a tick and checks a new load against the reactor's
 * output. Every system's consumer, Engineering's `ShieldPower` among them,
 * reaches it through `all(POWER_CONSUMERS)`.
 */
export class PlasmaRouter implements IPowerRouter {
  // all(POWER_CONSUMERS) reads Engineering's own providers plus the
  // contributions of every module that names POWER_CONSUMERS in its exports.
  // LifeSupport's consumer reaches the router because LifeSupport exports
  // POWER_CONSUMERS.
  static deps = [SHIP_STATE, all(POWER_CONSUMERS)] as const;

  /**
   * The consumers `attach` added, in the order it added them. Each attach
   * holds its own entry, so a detach removes that attach alone.
   */
  private readonly attached = new Subscribers<IPowerConsumer>();

  constructor(
    private readonly state: IShipState,
    private readonly consumers: readonly IPowerConsumer[],
  ) {}

  attach(consumer: IPowerConsumer): () => void {
    return this.attached.add(consumer);
  }

  /**
   * Each consumer's draw in registration order, then the draws of the
   * attached consumers.
   */
  loads(ship: ShipSnapshot): readonly PowerLoad[] {
    return [
      ...this.consumers.map((consumer) => consumer.draw(ship)),
      ...[...this.attached].map((consumer) => consumer.draw(ship)),
    ];
  }

  /**
   * Runs the tick's own `allocatePower` over the current loads with `load` in
   * place of the load of its id, at the reactor's current electric output.
   * `available` in the refusal is the output less what the trial gave the
   * loads served before `load`.
   */
  divert(load: PowerLoad): void {
    const ship = this.state.snapshot();
    const loads = [
      ...this.loads(ship).filter((current) => current.id !== load.id),
      load,
    ];
    const trial = allocatePower(ship.reactor.electric, loads);
    if (!trial.shed.includes(load.id)) return;
    let available = trial.output;
    for (const entry of trial.loads) {
      if (entry.id === load.id) break;
      available -= entry.allocated;
    }
    throw new PowerBudgetError({
      consumer: load.id,
      demand: load.demand,
      available,
    });
  }
}
