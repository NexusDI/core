// Probe missing-provider (benchmarks spec 4.6) on inversify decorated-explicit: NAV_CHARTS is never registered.
// The rest is fixtures/inversify/decorated-explicit.ts, with ready() creating and
// configuring the container and resolving nothing.
//
// Meridian-8 in InversifyJS with the getting-started page's code under the
// legacy profile: experimentalDecorators on, emitDecoratorMetadata off. The
// page already names every dependency with @inject(id), the form a user on
// a toolchain without decorator metadata needs, so the source is the
// documented variant's.
// Docs: https://inversify.io/docs/introduction/getting-started/ (8.2.3), read 2026-09-30.
// Departures: emitDecoratorMetadata off; the rest as in decorated.ts.
import {
  Container,
  inject,
  injectable,
  type ServiceIdentifier,
} from 'inversify';

interface INavCharts {
  readonly kind: 'NavCharts';
}
const NAV_CHARTS = Symbol.for('NavCharts');

@injectable()
class FusionReactor {
  readonly kind = 'ReactorCore';
}
@injectable()
class QuantumComputer {
  readonly kind = 'ShipComputer';
  readonly reactor: FusionReactor;
  constructor(@inject(FusionReactor) reactor: FusionReactor) {
    this.reactor = reactor;
  }
}
@injectable()
class PowerRouter {
  readonly kind = 'PowerRouter';
  readonly reactor: FusionReactor;
  constructor(@inject(FusionReactor) reactor: FusionReactor) {
    this.reactor = reactor;
  }
}
@injectable()
class ShieldGrid {
  readonly kind = 'ShieldGrid';
  readonly router: PowerRouter;
  constructor(@inject(PowerRouter) router: PowerRouter) {
    this.router = router;
  }
}
@injectable()
class Bridge {
  readonly kind = 'Bridge';
  readonly computer: QuantumComputer;
  readonly charts: INavCharts;
  readonly shield: ShieldGrid;
  constructor(
    @inject(QuantumComputer) computer: QuantumComputer,
    @inject(NAV_CHARTS) charts: INavCharts,
    @inject(ShieldGrid) shield: ShieldGrid,
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
  constructor(@inject(QuantumComputer) computer: QuantumComputer) {
    this.computer = computer;
  }
}

const IDS = {
  bridge: Bridge,
  computer: QuantumComputer,
  charts: NAV_CHARTS,
  shield: ShieldGrid,
  router: PowerRouter,
  reactor: FusionReactor,
  drone: SurveyDrone,
} as const;

export const adapter = {
  lifetimes: ['singleton', 'transient'] as const,
  ready() {
    const container = new Container();
    container.bind(FusionReactor).toSelf().inSingletonScope();
    container.bind(QuantumComputer).toSelf().inSingletonScope();
    container.bind(PowerRouter).toSelf().inSingletonScope();
    container.bind(ShieldGrid).toSelf().inSingletonScope();
    container.bind(Bridge).toSelf().inSingletonScope();
    container.bind(SurveyDrone).toSelf().inTransientScope();
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
