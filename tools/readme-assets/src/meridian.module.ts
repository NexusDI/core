/**
 * The Starship Meridian app the README graph draws. Two modules, five
 * interface tokens: four bound with useClass and one async factory.
 * libs/devtools/assets/graph.svg is this file run through `nexusdi graph`.
 */
import { Token, defineModule, provide } from '@nexusdi/core';

interface IReactor {
  readonly output: number;
}
interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  course(to: string): string;
}
interface IShipLog {
  write(line: string): void;
}
interface IHelm {
  engage(to: string): string;
}

const REACTOR = new Token<IReactor>('Reactor');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const SHIP_COMPUTER = new Token<IShipComputer>('ShipComputer');
const SHIP_LOG = new Token<IShipLog>('ShipLog');
const HELM = new Token<IHelm>('Helm');

class FusionReactor implements IReactor {
  readonly output = 42;
}
class MainComputer implements IShipComputer {
  static deps = [REACTOR, NAV_CHARTS] as const;
  readonly reactor: IReactor;
  readonly charts: INavCharts;
  constructor(reactor: IReactor, charts: INavCharts) {
    this.reactor = reactor;
    this.charts = charts;
  }
  course(to: string) {
    return `${this.charts.plot(to)} at ${this.reactor.output} GW`;
  }
}
class CaptainsLog implements IShipLog {
  readonly lines: string[] = [];
  write(line: string) {
    this.lines.push(line);
  }
}
class BridgeHelm implements IHelm {
  static deps = [SHIP_COMPUTER, SHIP_LOG] as const;
  readonly computer: IShipComputer;
  readonly log: IShipLog;
  constructor(computer: IShipComputer, log: IShipLog) {
    this.computer = computer;
    this.log = log;
  }
  engage(to: string) {
    this.log.write(`engage ${to}`);
    return this.computer.course(to);
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(NAV_CHARTS, {
      useFactory: async () => ({ plot: (to: string) => `course to ${to}` }),
    }),
    provide(SHIP_COMPUTER, { useClass: MainComputer }),
  ],
  exports: [SHIP_COMPUTER],
});

export const Bridge = defineModule({
  name: 'Bridge',
  imports: [Engineering],
  providers: [
    provide(SHIP_LOG, { useClass: CaptainsLog }),
    provide(HELM, { useClass: BridgeHelm }),
  ],
});
