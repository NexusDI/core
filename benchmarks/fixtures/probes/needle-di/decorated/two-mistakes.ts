// Probe two-mistakes (benchmarks spec 4.6) on needle-di decorated: missing-provider and cycle together.
// The rest is fixtures/needle-di/decorated.ts, with ready() creating and
// configuring the container and resolving nothing.
//
// Meridian-8 in needle-di, as needle-di.io sets it up: standard decorators
// (no compiler flag), @injectable() classes, inject() for every dependency,
// an InjectionToken for the value, and container.get() to bootstrap.
// Docs: https://needle-di.io (1.2.1), read 2026-09-30; the pages "Getting
// started", "Injection" and "Tokens".
// Departures: initializer injection, which the Injection page documents.
// The page recommends constructor parameter properties, and Node's type
// stripping rejects them in the node-strip-types cell. needle-di documents singletons only, so the transient and
// scoped sections are not-applicable (libraries.json).
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
  readonly reactor = inject(ShieldGrid);
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
