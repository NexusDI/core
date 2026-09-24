import { REQUEST, defineModule, lazy, provide } from '@nexusdi/core';

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

class Bridge {
  readonly computer: ShipComputer;
  readonly charts: NavCharts;
  constructor(computer: ShipComputer, charts: NavCharts) {
    this.computer = computer;
    this.charts = charts;
  }
  course(to: string) {
    return this.charts.plot(to);
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    ReactorCore,
    provide(ShipComputer, { deps: [ReactorCore] }),
    provide(PowerRouter, { deps: [lazy(ShieldGrid)] }),
    provide(ShieldGrid, { deps: [PowerRouter] }),
  ],
  exports: [ShipComputer, PowerRouter],
});

const Tactical = defineModule({
  name: 'Tactical',
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
    provide(Bridge, { deps: [ShipComputer, NAV_CHARTS] }),
  ],
  exports: [Bridge, MISSION, Engineering],
});

export const Meridian = defineModule({ name: 'Meridian', imports: [Tactical] });

export const handles = makeHandles(Bridge);
