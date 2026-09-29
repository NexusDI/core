// Probe captive-scoped (benchmarks spec 4.6) on tsyringe decorated-explicit: the singleton Bridge takes the scoped FlightLog.
// The rest is fixtures/tsyringe/decorated-explicit.ts, with ready() creating and
// configuring the container and resolving nothing.
//
// Meridian-8 in tsyringe with @inject(token) on every constructor
// parameter, under the legacy profile (experimentalDecorators on,
// emitDecoratorMetadata off): the workaround for a toolchain without
// decorator metadata (spec 4.3). reflect-metadata stays imported, because
// tsyringe throws "tsyringe requires a reflect polyfill." at import
// without it.
// Docs: https://github.com/microsoft/tsyringe#readme (4.10.0), read 2026-09-30.
// Departures: every parameter names its token with @inject; fields instead
// of constructor parameter properties (node-strip-types is a cell);
// ready() clears the global container's instances, as in decorated.ts.
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
  constructor(@inject(FusionReactor) reactor: FusionReactor) {
    this.reactor = reactor;
  }
}
@singleton()
class PowerRouter {
  readonly kind = 'PowerRouter';
  readonly reactor: FusionReactor;
  constructor(@inject(FusionReactor) reactor: FusionReactor) {
    this.reactor = reactor;
  }
}
@singleton()
class ShieldGrid {
  readonly kind = 'ShieldGrid';
  readonly router: PowerRouter;
  constructor(@inject(PowerRouter) router: PowerRouter) {
    this.router = router;
  }
}
@scoped(Lifecycle.ContainerScoped)
class FlightLog {
  readonly kind = 'FlightLog';
  readonly computer: QuantumComputer;
  constructor(@inject(QuantumComputer) computer: QuantumComputer) {
    this.computer = computer;
  }
}
@singleton()
class Bridge {
  readonly kind = 'Bridge';
  readonly computer: QuantumComputer;
  readonly charts: INavCharts;
  readonly shield: ShieldGrid;
  readonly log: FlightLog;
  constructor(
    @inject(QuantumComputer) computer: QuantumComputer,
    @inject('NavCharts') charts: INavCharts,
    @inject(ShieldGrid) shield: ShieldGrid,
    @inject(FlightLog) log: FlightLog,
  ) {
    this.log = log;
    this.computer = computer;
    this.charts = charts;
    this.shield = shield;
  }
}
@injectable()
class SurveyDrone {
  readonly kind = 'SurveyDrone';
  readonly computer: QuantumComputer;
  constructor(@inject(QuantumComputer) computer: QuantumComputer) {
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
    container.register<INavCharts>('NavCharts', {
      useValue: { kind: 'NavCharts' },
    });
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
