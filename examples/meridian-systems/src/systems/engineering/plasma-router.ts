import { all, lazy } from '@nexusdi/core';

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
 * output. The router reaches every system's consumer, Engineering's
 * `ShieldPower` among them, through `lazy(all(POWER_CONSUMERS))`.
 */
export class PlasmaRouter implements IPowerRouter {
  // The shield grid and the railgun mount call the router, and the router
  // reads their loads, so the router reads the consumers through a thunk.
  // One lazy(all()) breaks the cycle for every consumer, and each consumer
  // takes POWER_ROUTER directly.
  static deps = [SHIP_STATE, lazy(all(POWER_CONSUMERS))] as const;

  /** The consumers `register` added, by load id, in the order it added them. */
  private readonly registered = new Map<string, IPowerConsumer>();
  /** The consumers of POWER_CONSUMERS, read once on the first call that needs them. */
  private contributed: readonly IPowerConsumer[] | undefined;

  constructor(
    private readonly state: IShipState,
    private readonly consumers: () => IPowerConsumer[],
  ) {}

  /**
   * The unregister removes `consumer` only while it still draws its load, so
   * a stale unregister leaves a later consumer of that id in place.
   */
  register(consumer: IPowerConsumer): () => void {
    if (this.drawn(consumer.id) !== undefined) {
      throw duplicate(consumer.id);
    }
    this.registered.set(consumer.id, consumer);
    return () => {
      if (this.registered.get(consumer.id) === consumer) {
        this.registered.delete(consumer.id);
      }
    };
  }

  /** Each consumer's draw: those of POWER_CONSUMERS, then the registered ones. */
  loads(ship: ShipSnapshot): readonly PowerLoad[] {
    return [...this.contributions(), ...this.registered.values()].map(
      (consumer) => consumer.draw(ship),
    );
  }

  /**
   * Runs the tick's own `allocatePower` over the current loads with `load` in
   * place of the load of its id, at the reactor's current electric output.
   * `available` in the refusal is the output less what the trial gave the
   * loads served before `load`, and `ahead` names those that got power.
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
    const ahead: string[] = [];
    for (const entry of trial.loads) {
      if (entry.id === load.id) break;
      available -= entry.allocated;
      if (entry.allocated > 0) ahead.push(entry.id);
    }
    throw new PowerBudgetError({
      consumer: load.id,
      demand: load.demand,
      available,
      throttle: ship.setpoints.reactor.throttle,
      ahead,
      climbing: ship.reactor.level < ship.setpoints.reactor.throttle,
    });
  }

  /** The consumer that draws the load `id`, contributed or registered. */
  private drawn(id: string): IPowerConsumer | undefined {
    return (
      this.contributions().find((consumer) => consumer.id === id) ??
      this.registered.get(id)
    );
  }

  /**
   * The consumers of POWER_CONSUMERS. The list is fixed once the container
   * starts, so the router reads it once and refuses two consumers of one id.
   */
  private contributions(): readonly IPowerConsumer[] {
    if (this.contributed === undefined) {
      const consumers = this.consumers();
      const ids = new Set<string>();
      for (const { id } of consumers) {
        if (ids.has(id)) throw duplicate(id);
        ids.add(id);
      }
      this.contributed = consumers;
    }
    return this.contributed;
  }
}

/** The refusal of a second consumer of the load `id`. */
function duplicate(id: string): Error {
  return new Error(`Two power consumers draw the load '${id}'.`);
}
