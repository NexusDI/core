// Meridian-8 in awilix, as its README sets it up: PROXY injection, strict
// mode, asClass and asValue registrations, and a scope per request from
// container.createScope().
// Docs: https://github.com/jeffijoe/awilix#readme (13.0.5), read 2026-09-30.
// Departures: every registration sets its lifetime, since awilix defaults
// to transient (spec 4.3 rule 1). ready() builds the container, so each
// call starts empty.
import { InjectionMode, asClass, asValue, createContainer } from 'awilix';

interface Cradle {
  reactor: FusionReactor;
  computer: QuantumComputer;
  router: PowerRouter;
  shield: ShieldGrid;
  charts: { kind: string };
  bridge: Bridge;
  drone: SurveyDrone;
  flightLog: FlightLog;
}
class FusionReactor {
  readonly kind = 'ReactorCore';
}
class QuantumComputer {
  readonly kind = 'ShipComputer';
  readonly reactor: FusionReactor;
  constructor({ reactor }: Cradle) {
    this.reactor = reactor;
  }
}
class PowerRouter {
  readonly kind = 'PowerRouter';
  readonly reactor: FusionReactor;
  constructor({ reactor }: Cradle) {
    this.reactor = reactor;
  }
}
class ShieldGrid {
  readonly kind = 'ShieldGrid';
  readonly router: PowerRouter;
  constructor({ router }: Cradle) {
    this.router = router;
  }
}
class Bridge {
  readonly kind = 'Bridge';
  readonly computer: QuantumComputer;
  readonly charts: { kind: string };
  readonly shield: ShieldGrid;
  constructor({ computer, charts, shield }: Cradle) {
    this.computer = computer;
    this.charts = charts;
    this.shield = shield;
  }
}
class SurveyDrone {
  readonly kind = 'SurveyDrone';
  readonly computer: QuantumComputer;
  constructor({ computer }: Cradle) {
    this.computer = computer;
  }
}
class FlightLog {
  readonly kind = 'FlightLog';
  readonly computer: QuantumComputer;
  constructor({ computer }: Cradle) {
    this.computer = computer;
  }
}

function build() {
  const container = createContainer<Cradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });
  container.register({
    reactor: asClass(FusionReactor).singleton(),
    computer: asClass(QuantumComputer).singleton(),
    router: asClass(PowerRouter).singleton(),
    shield: asClass(ShieldGrid).singleton(),
    charts: asValue({ kind: 'NavCharts' }),
    bridge: asClass(Bridge).singleton(),
    drone: asClass(SurveyDrone).transient(),
    flightLog: asClass(FlightLog).scoped(),
  });
  return container;
}

type Resolver = { resolve(name: keyof Cradle): unknown };
const view = (c: Resolver) => ({
  get: (name: keyof Cradle) => c.resolve(name) as { kind: string },
});

export const adapter = {
  lifetimes: ['singleton', 'transient', 'scoped'] as const,
  ready() {
    const container = build();
    for (const name of [
      'reactor',
      'computer',
      'router',
      'shield',
      'bridge',
    ] as const)
      container.resolve(name);
    return Object.assign(view(container), { container });
  },
  scope(ship: { container: ReturnType<typeof build> }) {
    const scope = ship.container.createScope();
    return Object.assign(view(scope), { close: () => scope.dispose() });
  },
  dispose: (ship: { container: ReturnType<typeof build> }) =>
    ship.container.dispose(),
};
