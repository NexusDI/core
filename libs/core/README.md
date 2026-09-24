# @nexusdi/core

<div align="center">
  <img src="https://nexus.js.org/img/logo.svg" alt="NexusDI Logo" width="120" height="120" />
  <br />
  <p><strong>A modern, lightweight dependency injection container for TypeScript with decorators, inspired by industry-leading frameworks.</strong></p>
  <p><em>The DI library that doesn't make you want to inject yourself with coffee ☕</em></p>
</div>

<div align="center">

[![npm version](https://img.shields.io/npm/v/@nexusdi/core.svg)](https://www.npmjs.com/package/@nexusdi/core)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/nexusdi/core/ci.yml)
![Libraries.io dependency status for GitHub repo](https://img.shields.io/librariesio/github/nexusdi/core)

![npm bundle size (scoped)](https://img.shields.io/bundlephobia/min/%40nexusdi/core)
![NPM Unpacked Size](https://img.shields.io/npm/unpacked-size/%40nexusdi%2Fcore)
![Source language](https://img.shields.io/badge/language-TypeScript-blue)

[![npm downloads](https://img.shields.io/npm/dm/@nexusdi/core.svg)](https://www.npmjs.com/package/@nexusdi/core)
![GitHub License](https://img.shields.io/github/license/NexusDI/core)
![Released with provenance](https://img.shields.io/badge/provenance-signed-green)
[![GitHub stars](https://img.shields.io/github/stars/NexusDI/core.svg?style=social&label=Star)](https://github.com/NexusDI/core)

</div>

A dependency injection container for TypeScript that compiles your module graph before it builds anything. Every missing provider, dependency cycle and lifetime mistake is reported at startup, in one error, with the fix. After startup the container is sealed: `get()` is synchronous and cheap.

```bash
npm install @nexusdi/core
```

Node 22.12 or later, TypeScript 5.4 or later. No runtime dependencies.

ESM only. CommonJS projects can `require()` it.

NexusDI's decorators are standard (TC39) decorators and need no compiler flag. A project that keeps `experimentalDecorators` for another library registers its classes with `provide()`, `static deps` and `defineModule()`; the decorators throw `NEXUS_LEGACY_DECORATORS` under that flag.

## Quick start

Depend on interfaces. A `Token<T>` names an interface, `provide()` binds it to a class, a value or a factory, and a class lists the tokens its constructor takes in `static deps`. TypeScript checks each list against the constructor that receives it.

<!-- #region quick-start -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/core/testing';

interface IReactorCore {
  readonly output: number;
}
interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  course(to: string): string;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class ShipComputer implements IShipComputer {
  static deps = [REACTOR, NAV_CHARTS] as const;
  constructor(
    readonly reactor: IReactorCore,
    readonly charts: INavCharts,
  ) {}
  course(to: string) {
    return this.charts.plot(to);
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(NAV_CHARTS, {
      useFactory: async () => ({ plot: (to: string) => `course to ${to}` }),
    }),
    provide(COMPUTER, { useClass: ShipComputer }),
  ],
  exports: [COMPUTER],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

await using ship = await Nexus.create(Meridian);
ship.get(COMPUTER).course('Kepler-442b'); // -> 'course to Kepler-442b'
ship.has(REACTOR); // -> false

class FakeReactor implements IReactorCore {
  readonly output = 0;
}
const fakeCharts: INavCharts = { plot: () => 'loopback' };
await using sim = await createTestingContainer(Meridian)
  .override(REACTOR, { useClass: FakeReactor })
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create();
sim.get(COMPUTER).course('anywhere'); // -> 'loopback'
```

<!-- #endregion quick-start -->

`Nexus.create` awaits every async factory, so `NAV_CHARTS` exists before the first `get()`. `REACTOR` is private to `Engineering`, which exports only `COMPUTER`. No consumer names `FusionReactor` or `ShipComputer`, so the testing container swaps the reactor and the charts without touching the computer.

## Providers

<!-- #region providers -->

```ts @import.meta.vitest
import { MultiToken, Nexus, Token } from '@nexusdi/core';
import { defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/core/testing';

interface IDiagnostic {
  run(): boolean;
}
interface IDrone {
  readonly serial: number;
}
const DIAGNOSTICS = new MultiToken<IDiagnostic>('Diagnostics');
const CALLSIGN = new Token<string>('Callsign');
const HAIL = new Token<string>('Hail');
const DRONE = new Token<IDrone>('SurveyDrone');

let built = 0;
class SurveyDrone implements IDrone {
  readonly serial = ++built;
}

const Hangar = defineModule({
  name: 'Hangar',
  providers: [
    provide(CALLSIGN, { useValue: 'Meridian' }),
    provide(HAIL, { useExisting: CALLSIGN }),
    provide(DRONE, { useClass: SurveyDrone, lifetime: 'transient' }),
    provide(DIAGNOSTICS, { useValue: { run: () => true } }),
    provide(DIAGNOSTICS, { useValue: { run: () => false } }),
  ],
});

await using ship = await Nexus.create(Hangar);
ship.get(HAIL); // -> 'Meridian'
ship.get(DRONE) === ship.get(DRONE); // -> false
ship.get(DIAGNOSTICS).map((check) => check.run()); // -> [true, false]

class TrainingDrone implements IDrone {
  readonly serial = 0;
}
await using sim = await createTestingContainer(Hangar)
  .override(DRONE, { useClass: TrainingDrone })
  .create();
sim.get(DRONE).serial; // -> 0
```

<!-- #endregion providers -->

Lifetimes are `'singleton'` (the default), `'scoped'` and `'transient'`; an override keeps the lifetime of the binding it replaces. A `MultiToken` collects one contribution per `provide()` call and resolves to an array; in a `deps` list it is written `all(DIAGNOSTICS)`. `optional(T)` resolves to `undefined` when nothing provides `T`, and `lazy(T)` to a thunk. A factory without `deps` takes no arguments.

### Object literals

`providers` also takes plain objects in the 0.3 shape, `{ token, ... }`. `defineModule` checks each one with the rules `provide()` enforces and reports an error on the element that breaks one. A literal cannot give a factory's parameters their types from `deps`, so annotate them. `provide()` types them for you, and the rest of this README uses it.

<!-- #region provider-literals -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const CALLSIGN = new Token<string>('Callsign');
const STATUS = new Token<string>('Status');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

const Bridge = defineModule({
  name: 'Bridge',
  providers: [
    { token: REACTOR, useClass: FusionReactor },
    { token: CALLSIGN, useValue: 'Meridian' },
    {
      token: STATUS,
      useFactory: (callsign: string, core: IReactorCore) =>
        `${callsign} at ${core.output} GW`,
      deps: [CALLSIGN, REACTOR],
    },
  ],
});

await using ship = await Nexus.create(Bridge);
ship.get(STATUS); // -> 'Meridian at 1.21 GW'
```

<!-- #endregion provider-literals -->

## Modules

A module sees its own providers, the exports of the modules it imports, and the exports of every `global: true` module. The root container resolves what the root module sees.

<!-- #region modules -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import type { NexusError } from '@nexusdi/core';

interface ISubspaceLink {
  readonly frequency: number;
}
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
class SubspaceRelay implements ISubspaceLink {
  readonly frequency = 1420;
}
const Comms = defineModule({
  name: 'Comms',
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
});

await using ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [Comms] }),
);
ship.has(SUBSPACE_LINK); // -> false
ship.get(SUBSPACE_LINK, { module: Comms }).frequency; // -> 1420

let code = '';
try {
  ship.get(SUBSPACE_LINK);
} catch (error) {
  code = (error as NexusError).code;
}
code; // -> 'NEXUS_NOT_VISIBLE'
```

<!-- #endregion modules -->

A configurable module declares an options token and takes its options through `with()`. Call `with()` once and import the result: each call makes a new module instance.

```ts
const COMMS_OPTIONS = new Token<{ frequency: number }>('CommsOptions');
const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  schema: commsOptionsSchema, // any Standard Schema validator
  providers: [
    provide(SUBSPACE_LINK, { useClass: SubspaceRelay, deps: [COMMS_OPTIONS] }),
  ],
  exports: [SUBSPACE_LINK],
});
const Tactical = defineModule({
  name: 'Tactical',
  imports: [Comms.with({ frequency: 1420 })],
});
```

## Scopes

A scope is a child container for one unit of work, such as a request. `REQUEST` resolves to the request the scope was created with. Declare its shape once:

```ts
declare module '@nexusdi/core' {
  interface NexusRequest {
    mission: string;
  }
}
```

<!-- #region scopes -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule } from '@nexusdi/core';
import { provide, type NexusError } from '@nexusdi/core';

interface IFlightLog {
  readonly mission: string;
}
const MISSION = new Token<string>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
class ShuttleFlightLog implements IFlightLog {
  constructor(readonly mission: string) {}
}

const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, {
      useClass: ShuttleFlightLog,
      deps: [MISSION],
      lifetime: 'scoped',
    }),
  ],
});

await using ship = await Nexus.create(Tactical);
await using shuttle = await ship.createScope({
  request: { mission: 'survey-7' },
});
shuttle.get(FLIGHT_LOG).mission; // -> 'survey-7'
shuttle.get(FLIGHT_LOG) === shuttle.get(FLIGHT_LOG); // -> true

let code = '';
try {
  ship.get(FLIGHT_LOG);
} catch (error) {
  code = (error as NexusError).code;
}
code; // -> 'NEXUS_SCOPE_REQUIRED'
```

<!-- #endregion scopes -->

`createScope` builds every scoped factory before it returns, so a scoped factory runs once per scope even when the request never asks for its token. Put an on-demand resource, such as a per-request database transaction, in a scoped class, which builds on first `get()`. A singleton that depends on a scoped provider is a compile error: it would outlive the scope.

## Lifecycle

<!-- #region lifecycle -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

const log: string[] = [];
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
  async onInit() {
    log.push('reactor online');
  }
  async [Symbol.asyncDispose]() {
    log.push('reactor scrammed');
  }
}
class ShipComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
  onInit() {
    log.push('computer self-test');
  }
  [Symbol.dispose]() {
    log.push('computer off');
  }
}

const ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(REACTOR, { useClass: FusionReactor }),
      provide(COMPUTER, { useClass: ShipComputer }),
    ],
  }),
);
log; // -> ['reactor online', 'computer self-test']
await ship[Symbol.asyncDispose]();
log; // -> ['reactor online', 'computer self-test', 'computer off', 'reactor scrammed']
```

<!-- #endregion lifecycle -->

`onInit` runs on singletons only, after every singleton is built, dependencies first. Disposal runs in reverse creation order, once per object. A factory hands ownership of its result to the container, which disposes it; a `useValue` is never disposed. A second disposal call returns the first call's promise, so a `SIGTERM` handler and a `SIGINT` handler can both call it.

## Cycles

`lazy(T)` is the only way to express a dependency cycle. The thunk works once startup has finished.

<!-- #region lazy -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, lazy, provide } from '@nexusdi/core';

interface IShieldGrid {
  draw(): number;
}
interface IPowerRouter {
  divert(): number;
}
const SHIELD_GRID = new Token<IShieldGrid>('ShieldGrid');
const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');

class ShieldGrid implements IShieldGrid {
  static deps = [POWER_ROUTER] as const;
  constructor(readonly router: IPowerRouter) {}
  draw() {
    return 0.4;
  }
}
class PowerRouter implements IPowerRouter {
  static deps = [lazy(SHIELD_GRID)] as const;
  constructor(private readonly shields: () => IShieldGrid) {}
  divert() {
    return this.shields().draw();
  }
}

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(POWER_ROUTER, { useClass: PowerRouter }),
      provide(SHIELD_GRID, { useClass: ShieldGrid }),
    ],
  }),
);
ship.get(POWER_ROUTER).divert(); // -> 0.4
```

<!-- #endregion lazy -->

## Testing

A unit test calls the constructor with fakes and needs no container. `@nexusdi/core/testing` builds the real module graph with replacements.

<!-- #region testing -->

```ts @import.meta.vitest
import { Token, defineModule, provide } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/core/testing';

interface INavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(NAV_CHARTS, {
      useFactory: async (): Promise<INavCharts> => {
        throw new Error('no subspace link in tests');
      },
    }),
  ],
  exports: [NAV_CHARTS],
});

const fakeCharts: INavCharts = { plot: () => 'loopback' };
await using ship = await createTestingContainer(Engineering)
  .override(NAV_CHARTS, { useValue: fakeCharts })
  .create({ onInit: false });
ship.get(NAV_CHARTS).plot('anywhere'); // -> 'loopback'
```

<!-- #endregion testing -->

The testing container runs the full compiler, so an override that introduces a missing dependency fails exactly as it would in production.

## Errors

Every error extends `NexusError` and carries a stable `code`. Compilation reports all of its errors at once.

<!-- #region errors -->

```ts @import.meta.vitest
import { BlueprintError, Nexus, Token } from '@nexusdi/core';
import { defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
interface ISensor {
  readonly range: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const SENSOR = new Token<ISensor>('Sensor');

class ShipComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}
class LongRangeSensor implements ISensor {
  constructor(readonly range: number) {}
}

let caught: BlueprintError | undefined;
try {
  await Nexus.create(
    defineModule({
      name: 'Broken',
      providers: [
        provide(COMPUTER, { useClass: ShipComputer }),
        provide(SENSOR, { useClass: LongRangeSensor }),
      ],
    }),
  );
} catch (error) {
  caught = error as BlueprintError;
}
caught?.code; // -> 'NEXUS_BLUEPRINT_INVALID'
caught?.errors.map((error) => error.code); // -> ['NEXUS_MISSING_DEPS', 'NEXUS_MISSING_PROVIDER']
```

<!-- #endregion errors -->

## Graph and trace

<!-- #region graph -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import type { TraceEvent } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class ShipComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}
const events: TraceEvent[] = [];

await using ship = await Nexus.create(
  defineModule({
    name: 'Engineering',
    providers: [
      provide(REACTOR, { useClass: FusionReactor }),
      provide(COMPUTER, { useClass: ShipComputer }),
    ],
  }),
  { trace: (event) => events.push(event) },
);
ship.graph().edges; // -> [{ from: 'p1', to: 'p0', kind: 'required' }]
events.map((event) => event.type); // -> ['compile', 'construct', 'construct']
```

<!-- #endregion graph -->

`graph()` returns plain JSON. Ids are stable for a given set of definitions. Minifiers rename classes, so a production graph can show `t` in place of `ShipComputer`; give tokens a description, or keep class names, where names matter.

## Node

On Node, `@nexusdi/core/node` binds a scope to the async context of a request, so code deep in the call chain finds it.

<!-- #region node -->

```ts @import.meta.vitest
import { Nexus, REQUEST, Token, defineModule, provide } from '@nexusdi/core';
import { nodeScopeContext } from '@nexusdi/core/node';

const MISSION = new Token<string>('Mission');
const Tactical = defineModule({
  name: 'Tactical',
  providers: [
    provide(MISSION, {
      useFactory: (request) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
  ],
});
await using ship = await Nexus.create(Tactical, {
  scopeContext: nodeScopeContext(),
});

async function dispatch() {
  await Promise.resolve();
  return ship.currentScope()?.get(MISSION);
}

await using shuttle = await ship.createScope({
  request: { mission: 'survey-7' },
});
const mission = await ship.runInScope(shuttle, () => dispatch()); // -> 'survey-7'
```

<!-- #endregion node -->

## Decorators

The decorators write the same definitions `provide()` and `defineModule()` build. A `useClass` binding reads the deps `@Injectable` declares.

<!-- #region decorators -->

```ts @import.meta.vitest
import { Inject, Injectable, Module, Nexus, Token } from '@nexusdi/core';
import { optional, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface INavCharts {
  plot(to: string): string;
}
interface ISubspaceLink {
  readonly frequency: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
interface IBridge {
  readonly charts: INavCharts;
  readonly link: ISubspaceLink | undefined;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
const BRIDGE = new Token<IBridge>('Bridge');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

@Injectable({ deps: [REACTOR] })
class ShipComputer implements IShipComputer {
  constructor(readonly reactor: IReactorCore) {}
}

class Bridge implements IBridge {
  @Inject(NAV_CHARTS) accessor charts!: INavCharts;
  @Inject(optional(SUBSPACE_LINK)) accessor link!: ISubspaceLink | undefined;
}

@Module({
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: ShipComputer }),
    provide(BRIDGE, { useClass: Bridge }),
    provide(NAV_CHARTS, {
      useValue: { plot: (to: string) => `course to ${to}` },
    }),
  ],
  exports: [COMPUTER, BRIDGE],
})
class Command {}

await using ship = await Nexus.create(Command);
ship.get(COMPUTER).reactor.output; // -> 1.21
ship.get(BRIDGE).charts.plot('Kepler-442b'); // -> 'course to Kepler-442b'
ship.get(BRIDGE).link; // -> undefined
```

<!-- #endregion decorators -->

`@Module` classes are not configurable; configurable modules use `defineModule`.

## Good to know

- A class with constructor parameters declares them in `static deps`, in `@Injectable`, or in `provide(C, { deps })`. The compiler reads `C.length`, which does not count parameters with defaults or rest parameters, so a class whose parameters all have defaults builds with them.
- A disposable transient resolved from the root has no owner, and nothing disposes it. Resolve disposable transients inside a scope; the `untracked` trace event names each one.
- A factory result that is a thenable is awaited. A `useValue` is stored as it is.
- The package's type declarations reference TypeScript's `esnext.disposable` library, which adds `Symbol.asyncDispose` and `AsyncDisposable` to your program, so `await using` compiles with `lib: ["es2022"]`.

## License

MIT
