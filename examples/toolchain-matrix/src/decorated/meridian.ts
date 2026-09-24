import {
  Inject,
  Injectable,
  Module,
  REQUEST,
  lazy,
  provide,
} from '@nexusdi/core';

import {
  MISSION,
  NAV_CHARTS,
  PowerRouter,
  ReactorCore,
  ShieldGrid,
  log,
  makeHandles,
  type NavCharts,
} from '../shared.ts';

export { log };

@Injectable({ deps: [ReactorCore] })
class ShipComputer {
  readonly reactor: ReactorCore;
  constructor(reactor: ReactorCore) {
    this.reactor = reactor;
  }
  onInit() {
    log.push('computer self-test');
  }
  [Symbol.dispose]() {
    log.push('computer off');
  }
}

@Injectable({ deps: [ShipComputer] })
class Bridge {
  @Inject(NAV_CHARTS) accessor charts!: NavCharts;
  readonly computer: ShipComputer;
  constructor(computer: ShipComputer) {
    this.computer = computer;
  }
  course(to: string) {
    return this.charts.plot(to);
  }
}

@Module({
  providers: [
    ReactorCore,
    ShipComputer,
    provide(PowerRouter, { deps: [lazy(ShieldGrid)] }),
    provide(ShieldGrid, { deps: [PowerRouter] }),
  ],
  exports: [ShipComputer, PowerRouter],
})
class Engineering {}

@Module({
  imports: [Engineering],
  providers: [
    provide(NAV_CHARTS, {
      useFactory: async () => ({ plot: (to: string) => `course to ${to}` }),
      deps: [],
    }),
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    Bridge,
  ],
  exports: [Bridge, MISSION, Engineering],
})
class Tactical {}

@Module({ imports: [Tactical] })
export class Meridian {}

export const handles = makeHandles(Bridge);
