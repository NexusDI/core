// Probe missing-provider (benchmarks spec 4.6) on needle-di plain: NAV_CHARTS is never registered.
// The rest is fixtures/needle-di/plain.ts, with ready() creating and
// configuring the container and resolving nothing.
import { Container, InjectionToken, inject } from '@needle-di/core';

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

const REACTOR = new InjectionToken<IReactorCore>('ReactorCore');
const COMPUTER = new InjectionToken<IShipComputer>('ShipComputer');
const POWER_ROUTER = new InjectionToken<IPowerRouter>('PowerRouter');
const SHIELD_GRID = new InjectionToken<IShieldGrid>('ShieldGrid');
const NAV_CHARTS = new InjectionToken<INavCharts>('NavCharts');
const BRIDGE = new InjectionToken<IBridge>('Bridge');

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

const IDS = {
  bridge: BRIDGE,
  computer: COMPUTER,
  charts: NAV_CHARTS,
  shield: SHIELD_GRID,
  router: POWER_ROUTER,
  reactor: REACTOR,
} as const;

export const adapter = {
  lifetimes: ['singleton'] as const,
  ready() {
    const container = new Container();
    container.bind({ provide: REACTOR, useFactory: () => new FusionReactor() });
    container.bind({
      provide: COMPUTER,
      useFactory: () => new QuantumComputer(inject(REACTOR)),
    });
    container.bind({
      provide: POWER_ROUTER,
      useFactory: () => new PowerRouter(inject(REACTOR)),
    });
    container.bind({
      provide: SHIELD_GRID,
      useFactory: () => new ShieldGrid(inject(POWER_ROUTER)),
    });
    container.bind({
      provide: BRIDGE,
      useFactory: () =>
        new Bridge(inject(COMPUTER), inject(NAV_CHARTS), inject(SHIELD_GRID)),
    });
    return {
      get: (name: keyof typeof IDS) =>
        container.get(IDS[name] as InjectionToken<{ kind: string }>),
    };
  },
};

/** The first resolve the probe runner makes. */
export function resolveBridge(ship: { get(name: 'bridge'): unknown }): unknown {
  return ship.get('bridge');
}
