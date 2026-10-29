import { all } from '@nexusdi/core';

import { PowerBudgetError } from '../../errors';
import {
  type IShipState,
  SHIP_STATE,
  type ShipSnapshot,
} from '../../simulation/contracts';

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
   * Every consumer by its load id: those of POWER_CONSUMERS in registration
   * order, then those `register` added, in the order it added them.
   */
  private readonly consumers = new Map<string, IPowerConsumer>();

  constructor(
    private readonly state: IShipState,
    consumers: readonly IPowerConsumer[],
  ) {
    for (const consumer of consumers) this.register(consumer);
  }

  /**
   * The unregister removes `consumer` only while it still draws its load, so
   * a stale unregister leaves a later consumer of that id in place.
   */
  register(consumer: IPowerConsumer): () => void {
    if (this.consumers.has(consumer.id)) {
      throw new Error(`Two power consumers draw the load '${consumer.id}'.`);
    }
    this.consumers.set(consumer.id, consumer);
    return () => {
      if (this.consumers.get(consumer.id) === consumer) {
        this.consumers.delete(consumer.id);
      }
    };
  }

  /** Each consumer's draw, in the order of `consumers`. */
  loads(ship: ShipSnapshot): readonly PowerLoad[] {
    return [...this.consumers.values()].map((consumer) => consumer.draw(ship));
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
