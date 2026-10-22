import { allocatePower, loadHeat } from '../../physics/power';
import { stepCoolant, stepReactor, tripped } from '../../physics/thermal';
import type {
  IShipSystem,
  Phase,
  ShipSnapshot,
  TickContext,
} from '../../simulation/contracts';
import {
  COOLANT_LOOP,
  type ICoolantLoop,
  type IPowerRouter,
  type IReactorCore,
  POWER_ROUTER,
  REACTOR,
} from './contracts';

/** Steps the reactor, the power router and the coolant loop in phase 1 of each tick. */
export class EngineeringPhysics implements IShipSystem {
  static deps = [REACTOR, COOLANT_LOOP, POWER_ROUTER] as const;
  /** The graph reads the phase without building the class. */
  static readonly phase: Phase = 1;

  readonly name = 'Engineering';
  readonly phase = EngineeringPhysics.phase;

  constructor(
    private readonly reactor: IReactorCore,
    private readonly coolant: ICoolantLoop,
    private readonly router: IPowerRouter,
  ) {}

  /**
   * The loop trips the reactor when the coolant is at its trip temperature
   * at the start of the tick or after this tick's step, and the trip holds.
   * So every snapshot whose loop reads the trip temperature or more shows a
   * tripped reactor. A reactor tripped at the start of the tick steps toward
   * 0 whatever the crew asked, and a tripped reactor has its throttle
   * setpoint written to 0. The heat into the loop is the reactor's
   * `P_th − P_e` plus the load heat.
   */
  step(ship: ShipSnapshot, { dt }: TickContext): ShipSnapshot {
    const rating = this.coolant.rating;
    const tripAtStart = ship.reactor.tripped || tripped(ship.coolant, rating);
    const stepped = stepReactor(
      { ...ship.reactor, tripped: tripAtStart },
      tripAtStart ? 0 : ship.setpoints.reactor.throttle,
      this.reactor.rating,
      dt,
    );
    const loads = this.router.loads(ship);
    const power = allocatePower(stepped.electric, loads);
    const coolant = stepCoolant(
      ship.coolant,
      stepped.thermal - stepped.electric + loadHeat(power, loads),
      rating,
      dt,
    );
    const reactor = {
      ...stepped,
      tripped: tripAtStart || tripped(coolant, rating),
    };
    const setpoints =
      reactor.tripped && ship.setpoints.reactor.throttle !== 0
        ? Object.freeze({
            ...ship.setpoints,
            reactor: Object.freeze({ throttle: 0 }),
          })
        : ship.setpoints;
    return Object.freeze({
      ...ship,
      reactor: Object.freeze(reactor),
      coolant: Object.freeze(coolant),
      power: Object.freeze({
        ...power,
        loads: Object.freeze(power.loads.map((entry) => Object.freeze(entry))),
        shed: Object.freeze(power.shed),
      }),
      setpoints,
    });
  }
}
