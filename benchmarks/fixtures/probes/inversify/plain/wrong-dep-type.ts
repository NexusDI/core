// Probe wrong-dep-type (benchmarks spec 4.6) on inversify plain: ShipComputer is wired to PowerRouter where it takes ReactorCore.
// The rest is fixtures/inversify/plain.ts, with ready() creating and
// configuring the container and resolving nothing.
//
// Meridian-8 in InversifyJS without decorators: symbol identifiers typed
// with ServiceIdentifier, and toResolvedValue bindings that name each
// dependency (the binding syntax page's toResolvedValue section).
// Docs: https://inversify.io/docs/introduction/getting-started/ and
// https://inversify.io/docs/api/binding-syntax/ (8.2.3), read 2026-09-30.
// Departures: fields for dependencies, because Node's type stripping
// rejects constructor parameter properties (node-strip-types is a cell). ready() builds the container, so each call
// starts empty.
import { Container, type ServiceIdentifier } from 'inversify';

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

const REACTOR: ServiceIdentifier<IReactorCore> = Symbol.for('ReactorCore');
const COMPUTER: ServiceIdentifier<IShipComputer> = Symbol.for('ShipComputer');
const POWER_ROUTER: ServiceIdentifier<IPowerRouter> = Symbol.for('PowerRouter');
const SHIELD_GRID: ServiceIdentifier<IShieldGrid> = Symbol.for('ShieldGrid');
const NAV_CHARTS: ServiceIdentifier<INavCharts> = Symbol.for('NavCharts');
const BRIDGE: ServiceIdentifier<IBridge> = Symbol.for('Bridge');
const DRONE: ServiceIdentifier<ISurveyDrone> = Symbol.for('SurveyDrone');

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
  constructor(
    computer: IShipComputer,
    charts: INavCharts,
    shield: IShieldGrid,
  ) {
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

const IDS = {
  bridge: BRIDGE,
  computer: COMPUTER,
  charts: NAV_CHARTS,
  shield: SHIELD_GRID,
  router: POWER_ROUTER,
  reactor: REACTOR,
  drone: DRONE,
} as const;

export const adapter = {
  lifetimes: ['singleton', 'transient'] as const,
  ready() {
    const container = new Container();
    container
      .bind(REACTOR)
      .toResolvedValue(() => new FusionReactor())
      .inSingletonScope();
    container
      .bind(COMPUTER)
      .toResolvedValue(
        (reactor: IReactorCore) => new QuantumComputer(reactor),
        [POWER_ROUTER],
      )
      .inSingletonScope();
    container
      .bind(POWER_ROUTER)
      .toResolvedValue(
        (reactor: IReactorCore) => new PowerRouter(reactor),
        [REACTOR],
      )
      .inSingletonScope();
    container
      .bind(SHIELD_GRID)
      .toResolvedValue(
        (router: IPowerRouter) => new ShieldGrid(router),
        [POWER_ROUTER],
      )
      .inSingletonScope();
    container.bind(NAV_CHARTS).toConstantValue({ kind: 'NavCharts' });
    container
      .bind(BRIDGE)
      .toResolvedValue(
        (computer: IShipComputer, charts: INavCharts, shield: IShieldGrid) =>
          new Bridge(computer, charts, shield),
        [COMPUTER, NAV_CHARTS, SHIELD_GRID],
      )
      .inSingletonScope();
    container
      .bind(DRONE)
      .toResolvedValue(
        (computer: IShipComputer) => new SurveyDrone(computer),
        [COMPUTER],
      )
      .inTransientScope();
    return {
      get: (name: keyof typeof IDS) =>
        container.get(IDS[name] as ServiceIdentifier<{ kind: string }>),
    };
  },
};

/** The first resolve the probe runner makes. */
export function resolveBridge(ship: { get(name: 'bridge'): unknown }): unknown {
  return ship.get('bridge');
}
