// Probe missing-provider (benchmarks spec 4.6) on tsyringe decorated: NAV_CHARTS is never registered.
// The rest is fixtures/tsyringe/decorated.ts, with ready() creating and
// configuring the container and resolving nothing.
import 'reflect-metadata';
import {
  Lifecycle,
  container,
  inject,
  injectable,
  scoped,
  singleton,
} from 'tsyringe';

interface INavCharts {
  readonly kind: 'NavCharts';
}
@singleton()
class FusionReactor {
  readonly kind = 'ReactorCore';
}
@singleton()
class QuantumComputer {
  readonly kind = 'ShipComputer';
  readonly reactor: FusionReactor;
  constructor(reactor: FusionReactor) {
    this.reactor = reactor;
  }
}
@singleton()
class PowerRouter {
  readonly kind = 'PowerRouter';
  readonly reactor: FusionReactor;
  constructor(reactor: FusionReactor) {
    this.reactor = reactor;
  }
}
@singleton()
class ShieldGrid {
  readonly kind = 'ShieldGrid';
  readonly router: PowerRouter;
  constructor(router: PowerRouter) {
    this.router = router;
  }
}
@singleton()
class Bridge {
  readonly kind = 'Bridge';
  readonly computer: QuantumComputer;
  readonly charts: INavCharts;
  readonly shield: ShieldGrid;
  constructor(
    computer: QuantumComputer,
    @inject('NavCharts') charts: INavCharts,
    shield: ShieldGrid,
  ) {
    this.computer = computer;
    this.charts = charts;
    this.shield = shield;
  }
}
@injectable()
class SurveyDrone {
  readonly kind = 'SurveyDrone';
  readonly computer: QuantumComputer;
  constructor(computer: QuantumComputer) {
    this.computer = computer;
  }
}
@scoped(Lifecycle.ContainerScoped)
class FlightLog {
  readonly kind = 'FlightLog';
  readonly computer: QuantumComputer;
  constructor(computer: QuantumComputer) {
    this.computer = computer;
  }
}

const IDS = {
  bridge: Bridge,
  computer: QuantumComputer,
  charts: 'NavCharts',
  shield: ShieldGrid,
  router: PowerRouter,
  reactor: FusionReactor,
  drone: SurveyDrone,
  flightLog: FlightLog,
} as const;
type Resolver = { resolve(id: unknown): unknown };
const view = (c: Resolver) => ({
  get: (name: keyof typeof IDS) => c.resolve(IDS[name]) as { kind: string },
});

export const adapter = {
  lifetimes: ['singleton', 'transient', 'scoped'] as const,
  ready() {
    container.clearInstances();
    return view(container);
  },
  scope() {
    const child = container.createChildContainer();
    return Object.assign(view(child), { close: () => child.dispose() });
  },
};

/** The first resolve the probe runner makes. */
export function resolveBridge(ship: { get(name: 'bridge'): unknown }): unknown {
  return ship.get('bridge');
}
