// Probe captive-scoped (benchmarks spec 4.6) on nexusdi decorated: the singleton Bridge takes the scoped FlightLog.
// The rest is fixtures/nexusdi/decorated.ts, with ready() creating and
// configuring the container and resolving nothing.
import { Nexus, Token, provide } from '@nexusdi/core';
import { Injectable, Module } from '@nexusdi/decorators';

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

@Injectable({ deps: [] })
class FusionReactor implements IReactorCore {
  readonly kind = 'ReactorCore';
}
@Injectable({ deps: [REACTOR] })
class QuantumComputer implements IShipComputer {
  readonly kind = 'ShipComputer';
  readonly reactor: IReactorCore;
  constructor(reactor: IReactorCore) {
    this.reactor = reactor;
  }
}
@Injectable({ deps: [REACTOR] })
class PowerRouter implements IPowerRouter {
  readonly kind = 'PowerRouter';
  readonly reactor: IReactorCore;
  constructor(reactor: IReactorCore) {
    this.reactor = reactor;
  }
}
@Injectable({ deps: [POWER_ROUTER] })
class ShieldGrid implements IShieldGrid {
  readonly kind = 'ShieldGrid';
  readonly router: IPowerRouter;
  constructor(router: IPowerRouter) {
    this.router = router;
  }
}
@Injectable({ deps: [COMPUTER, NAV_CHARTS, SHIELD_GRID, FLIGHT_LOG] })
class Bridge implements IBridge {
  readonly kind = 'Bridge';
  readonly computer: IShipComputer;
  readonly charts: INavCharts;
  readonly shield: IShieldGrid;
  readonly log: IFlightLog;
  constructor(
    computer: IShipComputer,
    charts: INavCharts,
    shield: IShieldGrid,
    log: IFlightLog,
  ) {
    this.log = log;
    this.computer = computer;
    this.charts = charts;
    this.shield = shield;
  }
}
@Injectable({ deps: [COMPUTER] })
class SurveyDrone implements ISurveyDrone {
  readonly kind = 'SurveyDrone';
  readonly computer: IShipComputer;
  constructor(computer: IShipComputer) {
    this.computer = computer;
  }
}
@Injectable({ deps: [COMPUTER] })
class FlightLog implements IFlightLog {
  readonly kind = 'FlightLog';
  readonly computer: IShipComputer;
  constructor(computer: IShipComputer) {
    this.computer = computer;
  }
}

@Module({
  providers: [
    provide(REACTOR, { useClass: FusionReactor, lifetime: 'singleton' }),
    provide(COMPUTER, { useClass: QuantumComputer, lifetime: 'singleton' }),
    provide(POWER_ROUTER, { useClass: PowerRouter, lifetime: 'singleton' }),
    provide(SHIELD_GRID, { useClass: ShieldGrid, lifetime: 'singleton' }),
    provide(NAV_CHARTS, { useValue: { kind: 'NavCharts' } }),
    provide(BRIDGE, { useClass: Bridge, lifetime: 'singleton' }),
    provide(DRONE, { useClass: SurveyDrone, lifetime: 'transient' }),
    provide(FLIGHT_LOG, { useClass: FlightLog, lifetime: 'scoped' }),
  ],
})
class Meridian {}

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
