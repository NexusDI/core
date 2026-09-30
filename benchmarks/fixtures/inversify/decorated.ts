// Meridian-8 in InversifyJS, as its getting-started page sets it up: the
// reflect-metadata package installed, experimentalDecorators and
// emitDecoratorMetadata on, @injectable() on every class, and @inject(id)
// naming every constructor dependency.
// Docs: https://inversify.io/docs/introduction/getting-started/ (8.2.3), read 2026-09-30.
// The page imports no polyfill itself: @inversifyjs/container imports
// reflect-metadata/lite.
// Departures: fields for dependencies, because
// Node's type stripping rejects parameter properties and node-strip-types
// is a cell. Every binding sets its scope, since InversifyJS defaults to
// transient (spec 4.3 rule 1). ready() builds the container, so each call
// starts empty. InversifyJS documents no per-request child container, so
// the scoped section is not-applicable (libraries.json).
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
    container
      .bind<INavCharts>(NAV_CHARTS)
      .toConstantValue({ kind: 'NavCharts' });
    container.bind(Bridge).toSelf().inSingletonScope();
    container.bind(SurveyDrone).toSelf().inTransientScope();
    container.get(FusionReactor);
    container.get(QuantumComputer);
    container.get(PowerRouter);
    container.get(ShieldGrid);
    container.get(Bridge);
    return {
      get: (name: keyof typeof IDS) =>
        container.get(IDS[name] as ServiceIdentifier<{ kind: string }>),
    };
  },
};
