import { allocatePower, loadHeat } from '../../physics/power';
import { stepCoolant, stepReactor, tripped } from '../../physics/thermal';
import {
  type IShipSystem,
  type ShipSnapshot,
  type TickContext,
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

  readonly name = 'Engineering';
  readonly phase = 1;

  constructor(
    private readonly reactor: IReactorCore,
    private readonly coolant: ICoolantLoop,
    private readonly router: IPowerRouter,
  ) {}

  /**
   * The loop trips the reactor when the coolant reaches its trip temperature
   * at the start of the tick, and the trip holds. A tripped reactor steps
   * toward 0 whatever the crew asked, and the step writes its throttle
   * setpoint to 0. The heat into the loop is the reactor's `P_th − P_e` plus
   * the load heat.
   */
  step(ship: ShipSnapshot, { dt }: TickContext): ShipSnapshot {
    const trip =
      ship.reactor.tripped || tripped(ship.coolant, this.coolant.rating);
    const throttle = trip ? 0 : ship.setpoints.reactor.throttle;
    const reactor = stepReactor(
      { ...ship.reactor, tripped: trip },
      throttle,
      this.reactor.rating,
      dt,
    );
    const loads = this.router.loads(ship);
    const power = allocatePower(reactor.electric, loads);
    const coolant = stepCoolant(
      ship.coolant,
      reactor.thermal - reactor.electric + loadHeat(power, loads),
      this.coolant.rating,
      dt,
    );
    const setpoints =
      throttle === ship.setpoints.reactor.throttle
        ? ship.setpoints
        : Object.freeze({
            ...ship.setpoints,
            reactor: Object.freeze({ throttle }),
          });
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
