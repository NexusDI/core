# Scopes and REQUEST examples

Regions for `apps/docs/content/scopes.mdx`. Every block runs as a test.

<!-- #region two-shuttles -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
interface IFlightLog {
  readonly mission: Mission;
  readonly computer: IShipComputer;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}
class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION, COMPUTER] as const;
  constructor(
    readonly mission: Mission,
    readonly computer: IShipComputer,
  ) {}
}

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
});

await using ship = await Nexus.create(Meridian);
await using first = await ship.createScope({
  request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});
await using second = await ship.createScope({
  request: { mission: { id: 'survey-8', target: 'Gliese 667 Cc' } },
});

const ids = [first.id, second.id]; // -> ['s0', 's1']
console.log(ids);
const firstLog = first.get(FLIGHT_LOG);
const secondLog = second.get(FLIGHT_LOG);
const missions = [firstLog.mission.id, secondLog.mission.id]; // -> ['survey-7', 'survey-8']
console.log(missions);
const sameLog = firstLog === first.get(FLIGHT_LOG); // -> true
console.log(sameLog);
const sharedComputer = firstLog.computer === secondLog.computer; // -> true
console.log(sharedComputer);
```

<!-- #endregion two-shuttles -->

<!-- #region scope-required -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, isNexusError, provide } from '@nexusdi/core';

interface Mission {
  readonly id: string;
  readonly target: string;
}
const MISSION = new Token<Mission>('Mission');

await using ship = await Nexus.create([
  provide(MISSION, {
    useFactory: (request) => request.mission,
    deps: [REQUEST],
    lifetime: 'scoped',
  }),
]);

let error: unknown;
try {
  ship.get(MISSION);
} catch (caught) {
  error = caught;
}
const code = isNexusError(error) ? error.code : null; // -> 'NEXUS_SCOPE_REQUIRED'
console.log(code);
```

<!-- #endregion scope-required -->

<!-- #region captive -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, isNexusError, provide } from '@nexusdi/core';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface IShipComputer {
  readonly mission: Mission;
}
const MISSION = new Token<Mission>('Mission');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class QuantumComputer implements IShipComputer {
  static deps = [MISSION] as const;
  constructor(readonly mission: Mission) {}
}

const blueprint = [
  provide(MISSION, {
    useFactory: (request) => request.mission,
    deps: [REQUEST],
    lifetime: 'scoped',
  }),
  // COMPUTER is a singleton, and MISSION is scoped.
  provide(COMPUTER, { useClass: QuantumComputer }),
];

const error = await Nexus.create(blueprint).catch((caught: unknown) => caught);
const inner = isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')
  ? error.errors
  : [];
const codes = inner.map((each) => each.code); // -> ['NEXUS_LIFETIME_VIOLATION']
console.log(codes);
const pathOf = (each: unknown) =>
  isNexusError(each, 'NEXUS_LIFETIME_VIOLATION') ? each.path : [];
const path = pathOf(inner[0]); // -> ['ShipComputer', 'Mission']
console.log(path);
```

<!-- #endregion captive -->

<!-- #region scoped-factory-runs -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, provide } from '@nexusdi/core';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface IFlightLog {
  record(entry: string): void;
}
const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

const built: string[] = [];
class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  constructor(readonly mission: Mission) {
    built.push(`flight log for ${mission.id}`);
  }
  record(_entry: string) {}
}

await using ship = await Nexus.create([
  provide(MISSION, {
    useFactory: (request) => {
      built.push(`mission ${request.mission.id}`);
      return request.mission;
    },
    deps: [REQUEST],
    lifetime: 'scoped',
  }),
  provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
]);

await using shuttle = await ship.createScope({
  request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});
const atLaunch = [...built]; // -> ['mission survey-7']
console.log(atLaunch);
shuttle.get(FLIGHT_LOG).record('orbit reached');
const afterGet = [...built]; // -> ['mission survey-7', 'flight log for survey-7']
console.log(afterGet);
```

<!-- #endregion scoped-factory-runs -->

<!-- #region drone-with-mission -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, provide } from '@nexusdi/core';

interface Mission {
  readonly id: string;
  readonly target: string;
}
interface IShipComputer {
  plot(target: string): string;
}
interface ISurveyDrone {
  survey(): string;
}
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const MISSION = new Token<Mission>('Mission');
const DRONE = new Token<ISurveyDrone>('SurveyDrone');

class QuantumComputer implements IShipComputer {
  plot(target: string) {
    return `course to ${target}`;
  }
}
class ScoutDrone implements ISurveyDrone {
  static deps = [COMPUTER, MISSION] as const;
  constructor(
    private readonly computer: IShipComputer,
    private readonly mission: Mission,
  ) {}
  survey() {
    return `${this.mission.id}: ${this.computer.plot(this.mission.target)}`;
  }
}

await using ship = await Nexus.create([
  provide(COMPUTER, { useClass: QuantumComputer }),
  provide(MISSION, {
    useFactory: (request) => request.mission,
    deps: [REQUEST],
    lifetime: 'scoped',
  }),
  provide(DRONE, { useClass: ScoutDrone, lifetime: 'transient' }),
]);

await using shuttle = await ship.createScope({
  request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});
const report = shuttle.get(DRONE).survey(); // -> 'survey-7: course to Kepler-442b'
console.log(report);
```

<!-- #endregion drone-with-mission -->
