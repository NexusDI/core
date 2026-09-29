// Probe missing-provider (benchmarks spec 4.6) on needle-di decorated: NAV_CHARTS is never registered.
// The rest is fixtures/needle-di/decorated.ts, with ready() creating and
// configuring the container and resolving nothing.
import { Container, InjectionToken, inject, injectable } from '@needle-di/core';

interface INavCharts {
  readonly kind: 'NavCharts';
}
const NAV_CHARTS = new InjectionToken<INavCharts>('NavCharts');

@injectable()
class FusionReactor {
  readonly kind = 'ReactorCore';
}
@injectable()
class QuantumComputer {
  readonly kind = 'ShipComputer';
  readonly reactor = inject(FusionReactor);
}
@injectable()
class PowerRouter {
  readonly kind = 'PowerRouter';
  readonly reactor = inject(FusionReactor);
}
@injectable()
class ShieldGrid {
  readonly kind = 'ShieldGrid';
  readonly router = inject(PowerRouter);
}
@injectable()
class Bridge {
  readonly kind = 'Bridge';
  readonly computer = inject(QuantumComputer);
  readonly charts = inject(NAV_CHARTS);
  readonly shield = inject(ShieldGrid);
}

const IDS = {
  bridge: Bridge,
  computer: QuantumComputer,
  charts: NAV_CHARTS,
  shield: ShieldGrid,
  router: PowerRouter,
  reactor: FusionReactor,
} as const;

export const adapter = {
  lifetimes: ['singleton'] as const,
  ready() {
    const container = new Container();
    return {
      get: (name: keyof typeof IDS) =>
        container.get(IDS[name] as never) as { kind: string },
    };
  },
};

/** The first resolve the probe runner makes. */
export function resolveBridge(ship: { get(name: 'bridge'): unknown }): unknown {
  return ship.get('bridge');
}
