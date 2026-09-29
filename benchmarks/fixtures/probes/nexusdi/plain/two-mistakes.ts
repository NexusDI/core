// Probe two-mistakes (benchmarks spec 4.6) on nexusdi plain: missing-provider and cycle together.
// The rest is fixtures/nexusdi/plain.ts, with ready() creating and
// configuring the container and resolving nothing.
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly kind: 'ReactorCore';
}
interface IShipComputer {
  readonly kind: 'ShipComputer';
  readonly reactor: IReactorCore;
}
interface IPowerRouter {
  readonly kind: 'PowerRouter';
  readonly shield: IShieldGrid;
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

const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');
const SHIELD_GRID = new Token<IShieldGrid>('ShieldGrid');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const BRIDGE = new Token<IBridge>('Bridge');
const DRONE = new Token<ISurveyDrone>('SurveyDrone');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

class FusionReactor implements IReactorCore {
  readonly kind = 'ReactorCore';
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  readonly kind = 'ShipComputer';
  readonly reactor: IReactorCore;
  constructor(reactor: IReactorCore) {
    this.reactor = reactor;
  }
}
class PowerRouter implements IPowerRouter {
  static deps = [SHIELD_GRID] as const;
  readonly kind = 'PowerRouter';
  readonly shield: IShieldGrid;
  constructor(shield: IShieldGrid) {
    this.shield = shield;
  }
}
class ShieldGrid implements IShieldGrid {
  static deps = [POWER_ROUTER] as const;
  readonly kind = 'ShieldGrid';
  readonly router: IPowerRouter;
  constructor(router: IPowerRouter) {
    this.router = router;
  }
}
class Bridge implements IBridge {
  static deps = [COMPUTER, NAV_CHARTS, SHIELD_GRID] as const;
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
  static deps = [COMPUTER] as const;
  readonly kind = 'SurveyDrone';
  readonly computer: IShipComputer;
  constructor(computer: IShipComputer) {
    this.computer = computer;
  }
}
class FlightLog implements IFlightLog {
  static deps = [COMPUTER] as const;
  readonly kind = 'FlightLog';
  readonly computer: IShipComputer;
  constructor(computer: IShipComputer) {
    this.computer = computer;
  }
}

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(REACTOR, { useClass: FusionReactor, lifetime: 'singleton' }),
    provide(COMPUTER, { useClass: QuantumComputer, lifetime: 'singleton' }),
    provide(POWER_ROUTER, { useClass: PowerRouter, lifetime: 'singleton' }),
    provide(SHIELD_GRID, { useClass: ShieldGrid, lifetime: 'singleton' }),
    provide(BRIDGE, { useClass: Bridge, lifetime: 'singleton' }),
    provide(DRONE, { useClass: SurveyDrone, lifetime: 'transient' }),
    provide(FLIGHT_LOG, { useClass: FlightLog, lifetime: 'scoped' }),
  ],
});

const TOKENS = {
  bridge: BRIDGE,
  computer: COMPUTER,
  charts: NAV_CHARTS,
  shield: SHIELD_GRID,
  router: POWER_ROUTER,
  reactor: REACTOR,
  drone: DRONE,
  flightLog: FLIGHT_LOG,
};
type Name = keyof typeof TOKENS;
type Getter = { get(token: Token<unknown>): unknown };
const view = (c: Getter) => ({
  get: (name: Name) => c.get(TOKENS[name]) as { kind: string },
});

export const adapter = {
  lifetimes: ['singleton', 'transient', 'scoped'] as const,
  async ready() {
    const ship = await Nexus.create(Meridian);
    return Object.assign(view(ship), { ship });
  },
  async scope(handle: { ship: Nexus }) {
    const scope = await handle.ship.createScope();
    return Object.assign(view(scope), {
      close: () => scope[Symbol.asyncDispose](),
    });
  },
  dispose: (handle: { ship: Nexus }) => handle.ship[Symbol.asyncDispose](),
};

/** The first resolve the probe runner makes. */
export function resolveBridge(ship: { get(name: 'bridge'): unknown }): unknown {
  return ship.get('bridge');
}
