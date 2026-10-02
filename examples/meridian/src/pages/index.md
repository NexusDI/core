# NexusDI examples

Regions for `apps/docs/content/index.mdx`. Every block runs as a test.

<!-- #region meridian -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  status(): string;
}
interface ISubspaceLink {
  readonly frequency: number;
  send(message: string): string;
}
interface INavCharts {
  plot(target: string): string;
}
interface ISurveyDrone {
  survey(target: string): string;
}
interface IFlightLog {
  readonly entries: string[];
}
interface CommsOptions {
  readonly frequency: number;
  readonly transport: 'relay' | 'laser';
}

const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const COMMS_OPTIONS = new Token<CommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const DRONE = new Token<ISurveyDrone>('SurveyDrone');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(private readonly reactor: IReactorCore) {}
  status() {
    return `ShipComputer online. Reactor output ${this.reactor.output} GW.`;
  }
}
class SubspaceRelay implements ISubspaceLink {
  constructor(readonly frequency: number) {}
  send(message: string) {
    return `relay ${this.frequency}: ${message}`;
  }
}
class LaserLink implements ISubspaceLink {
  constructor(readonly frequency: number) {}
  send(message: string) {
    return `laser ${this.frequency}: ${message}`;
  }
}
class ScoutDrone implements ISurveyDrone {
  static deps = [COMPUTER] as const;
  constructor(private readonly computer: IShipComputer) {}
  survey(target: string) {
    return `${target} surveyed. ${this.computer.status()}`;
  }
}
class ShuttleFlightLog implements IFlightLog {
  readonly entries: string[] = [];
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  exports: [COMPUTER],
});

const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [
    provide(SUBSPACE_LINK, {
      useFactory: (options) =>
        options.transport === 'laser'
          ? new LaserLink(options.frequency)
          : new SubspaceRelay(options.frequency),
      deps: [COMMS_OPTIONS],
    }),
  ],
  exports: [SUBSPACE_LINK],
});

const Tactical = defineModule({
  name: 'Tactical',
  imports: [
    Engineering,
    Comms.forRoot({ frequency: 1420, transport: 'laser' }),
  ],
  providers: [
    provide(NAV_CHARTS, {
      useFactory: async (link) => ({
        plot: (target: string) => link.send(`course to ${target}`),
      }),
      deps: [SUBSPACE_LINK],
    }),
    provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' }),
  ],
  exports: [NAV_CHARTS, DRONE],
});

const BridgeApi = defineModule({
  name: 'BridgeApi',
  providers: [
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [FLIGHT_LOG],
});

const Meridian = defineModule({
  name: 'Meridian',
  imports: [Tactical, BridgeApi],
});

await using ship = await Nexus.create(Meridian);

const course = ship.get(NAV_CHARTS).plot('Kepler-442b'); // -> 'laser 1420: course to Kepler-442b'
console.log(course);
```

<!-- #endregion meridian -->
