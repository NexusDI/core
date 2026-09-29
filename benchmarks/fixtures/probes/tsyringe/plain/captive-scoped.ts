// Probe captive-scoped (benchmarks spec 4.6) on tsyringe plain: the singleton Bridge takes the scoped FlightLog.
// The rest is fixtures/tsyringe/plain.ts, with ready() creating and
// configuring the container and resolving nothing.
import 'reflect-metadata';
import {
  container as root,
  instanceCachingFactory,
  instancePerContainerCachingFactory,
  type DependencyContainer,
} from 'tsyringe';

interface IReactorCore {
  readonly kind: 'ReactorCore';
}
interface IShipComputer {
  readonly kind: 'ShipComputer';
  readonly reactor: IReactorCore;
}
interface IPowerRouter {
  readonly kind: 'PowerRouter';
  readonly reactor: IReactorCore;
}
interface IShieldGrid {
  readonly kind: 'ShieldGrid';
  readonly router: IPowerRouter;
}
interface INavCharts {
  readonly kind: 'NavCharts';
}
interface IBridge {
  readonly kind: 'Bridge';
  readonly computer: IShipComputer;
  readonly charts: INavCharts;
  readonly shield: IShieldGrid;
}
interface ISurveyDrone {
  readonly kind: 'SurveyDrone';
  readonly computer: IShipComputer;
}
interface IFlightLog {
  readonly kind: 'FlightLog';
  readonly computer: IShipComputer;
}

const REACTOR = 'ReactorCore';
const COMPUTER = 'ShipComputer';
const POWER_ROUTER = 'PowerRouter';
const SHIELD_GRID = 'ShieldGrid';
const NAV_CHARTS = 'NavCharts';
const BRIDGE = 'Bridge';
const DRONE = 'SurveyDrone';
const FLIGHT_LOG = 'FlightLog';

class FusionReactor implements IReactorCore {
  readonly kind = 'ReactorCore';
}
class QuantumComputer implements IShipComputer {
  readonly kind = 'ShipComputer';
  readonly reactor: IReactorCore;
  constructor(reactor: IReactorCore) {
    this.reactor = reactor;
  }
}
class PowerRouter implements IPowerRouter {
  readonly kind = 'PowerRouter';
  readonly reactor: IReactorCore;
  constructor(reactor: IReactorCore) {
    this.reactor = reactor;
  }
}
class ShieldGrid implements IShieldGrid {
  readonly kind = 'ShieldGrid';
  readonly router: IPowerRouter;
  constructor(router: IPowerRouter) {
    this.router = router;
  }
}
class Bridge implements IBridge {
  readonly kind = 'Bridge';
  readonly computer: IShipComputer;
  readonly charts: INavCharts;
  readonly shield: IShieldGrid;
  readonly log: IFlightLog;
  constructor(
    computer: IShipComputer,
    charts: INavCharts,
    shield: IShieldGrid,
    log: IFlightLog,
  ) {
    this.log = log;
    this.computer = computer;
    this.charts = charts;
    this.shield = shield;
  }
}
class SurveyDrone implements ISurveyDrone {
  readonly kind = 'SurveyDrone';
  readonly computer: IShipComputer;
  constructor(computer: IShipComputer) {
    this.computer = computer;
  }
}
class FlightLog implements IFlightLog {
  readonly kind = 'FlightLog';
  readonly computer: IShipComputer;
  constructor(computer: IShipComputer) {
    this.computer = computer;
  }
}

function build(): DependencyContainer {
  const c = root.createChildContainer();
  c.register<IReactorCore>(REACTOR, {
    useFactory: instanceCachingFactory(() => new FusionReactor()),
  });
  c.register<IShipComputer>(COMPUTER, {
    useFactory: instanceCachingFactory(
      (d) => new QuantumComputer(d.resolve<IReactorCore>(REACTOR)),
    ),
  });
  c.register<IPowerRouter>(POWER_ROUTER, {
    useFactory: instanceCachingFactory(
      (d) => new PowerRouter(d.resolve<IReactorCore>(REACTOR)),
    ),
  });
  c.register<IShieldGrid>(SHIELD_GRID, {
    useFactory: instanceCachingFactory(
      (d) => new ShieldGrid(d.resolve<IPowerRouter>(POWER_ROUTER)),
    ),
  });
  c.register<INavCharts>(NAV_CHARTS, { useValue: { kind: 'NavCharts' } });
  c.register<IBridge>(BRIDGE, {
    useFactory: instanceCachingFactory(
      (d) =>
        new Bridge(
          d.resolve<IShipComputer>(COMPUTER),
          d.resolve<INavCharts>(NAV_CHARTS),
          d.resolve<IShieldGrid>(SHIELD_GRID),
          d.resolve<IFlightLog>(FLIGHT_LOG),
        ),
    ),
  });
  c.register<ISurveyDrone>(DRONE, {
    useFactory: (d) => new SurveyDrone(d.resolve<IShipComputer>(COMPUTER)),
  });
  c.register<IFlightLog>(FLIGHT_LOG, {
    useFactory: instancePerContainerCachingFactory(
      (d) => new FlightLog(d.resolve<IShipComputer>(COMPUTER)),
    ),
  });
  return c;
}

const IDS = {
  bridge: BRIDGE,
  computer: COMPUTER,
  charts: NAV_CHARTS,
  shield: SHIELD_GRID,
  router: POWER_ROUTER,
  reactor: REACTOR,
  drone: DRONE,
  flightLog: FLIGHT_LOG,
} as const;
const view = (c: DependencyContainer) => ({
  get: (name: keyof typeof IDS) => c.resolve<{ kind: string }>(IDS[name]),
});

export const adapter = {
  lifetimes: ['singleton', 'transient', 'scoped'] as const,
  ready() {
    const c = build();
    return Object.assign(view(c), { container: c });
  },
  scope(ship: { container: DependencyContainer }) {
    const child = ship.container.createChildContainer();
    return Object.assign(view(child), { close: () => child.dispose() });
  },
};

/** The first resolve the probe runner makes. */
export function resolveBridge(ship: { get(name: 'bridge'): unknown }): unknown {
  return ship.get('bridge');
}
