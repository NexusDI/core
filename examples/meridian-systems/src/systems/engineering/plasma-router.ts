import { all, lazy } from '@nexusdi/core';

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
  type IShieldGrid,
  POWER_CONSUMERS,
  type PowerLoad,
  SHIELD_GRID,
} from './contracts';
import { allocatePower } from './engineering-model';

/**
 * Lists the loads of a tick and checks a new load against the reactor's
 * output. It reads the shield grid through a thunk, since the grid reads the
 * router to check its own raised load, and the loads of other
 * systems through `POWER_CONSUMERS`.
 */
export class PlasmaRouter implements IPowerRouter {
  // all(POWER_CONSUMERS) reads Engineering's own providers plus the exports of
  // the global modules. LifeSupport's consumer reaches the router through the
  // global MeridianSystems, which re-exports LifeSupport.
  static deps = [SHIP_STATE, lazy(SHIELD_GRID), all(POWER_CONSUMERS)] as const;

  /**
   * The consumers `attach` added, in the order it added them. Each attach
   * holds its own entry, so a detach removes that attach alone.
   */
  private readonly attached = new Subscribers<IPowerConsumer>();

  // The container builds the grid after the router, so the constructor never
  // calls the thunk.
  constructor(
    private readonly state: IShipState,
    private readonly shields: () => IShieldGrid,
    private readonly consumers: readonly IPowerConsumer[],
  ) {}

  attach(consumer: IPowerConsumer): () => void {
    return this.attached.add(consumer);
  }

  /**
   * The shields load, then each consumer's draw in registration order, then
   * the draws of the attached consumers.
   */
  loads(ship: ShipSnapshot): readonly PowerLoad[] {
    return [
      this.shields().draw(ship),
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
