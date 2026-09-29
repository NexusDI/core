# @nexusdi/core

<div align="center">
  <img src="https://nexus.js.org/img/logo.svg" alt="NexusDI Logo" width="120" height="120" />
  <br />
  <p><strong>NestJS-style modules and async startup for any TypeScript app, checked before it runs, with no compiler flags.</strong></p>
  <p>NexusDI validates the whole module graph before it builds anything. No runtime dependencies. The decorator-free core runs under tsc, TypeScript 7, esbuild, SWC, Babel, Vite, Bun, Deno and Node's type stripping.</p>
</div>

<div align="center">

[![npm version](https://img.shields.io/npm/v/@nexusdi/core.svg)](https://www.npmjs.com/package/@nexusdi/core)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/nexusdi/core/ci.yml)
![Libraries.io dependency status for GitHub repo](https://img.shields.io/librariesio/github/nexusdi/core)

![NPM Unpacked Size](https://img.shields.io/npm/unpacked-size/%40nexusdi%2Fcore)
![Source language](https://img.shields.io/badge/language-TypeScript-blue)

[![npm downloads](https://img.shields.io/npm/dm/@nexusdi/core.svg)](https://www.npmjs.com/package/@nexusdi/core)
![GitHub License](https://img.shields.io/github/license/NexusDI/core)
![Released with provenance](https://img.shields.io/badge/provenance-signed-green)
[![GitHub stars](https://img.shields.io/github/stars/NexusDI/core.svg?style=social&label=Star)](https://github.com/NexusDI/core)

</div>

A dependency injection container for TypeScript with modules and async startup. `Nexus.create` compiles your module graph before it builds anything and reports every missing provider, cycle, lifetime mistake and invalid provider at startup, in one error. It awaits every async factory, so after startup the container is sealed and `get()` is synchronous and cheap.

```bash
npm install @nexusdi/core
```

Node 22.12 or later, TypeScript 5.4 or later. No runtime dependencies.

ESM only. CommonJS projects can `require()` it.

Decorators are optional. `provide()`, `static deps` and `defineModule()` need no compiler flag. `@Injectable`, `@Inject` and `@Module`, from `@nexusdi/decorators`, are standard (TC39) decorators, so they need a toolchain that compiles standard decorators: tsc, TypeScript 7, esbuild, SWC, Babel, Bun, Deno and Vite with its Babel plugin. Vite on its own and Node's type stripping cannot run them. A project that keeps `experimentalDecorators` for another library uses `provide()`, `static deps` and `defineModule()`, and the decorators throw `NEXUS_LEGACY_DECORATORS` under that flag.

## Quick start

A class lists the classes its constructor takes in `static deps`, and
`Nexus.create` takes the classes.

<!-- #region quick-start -->

```ts @import.meta.vitest
import { Nexus } from '@nexusdi/core';

class Logger {
  log(line: string) {
    return `[app] ${line}`;
  }
}
class UserService {
  static deps = [Logger] as const;
  constructor(readonly logger: Logger) {}
  greet(name: string) {
    return this.logger.log(`hello ${name}`);
  }
}

const app = await Nexus.create([Logger, UserService]);
app.get(UserService).greet('Ada'); // -> '[app] hello Ada'
```

<!-- #endregion quick-start -->

`Nexus.create` checks the whole graph first: a class missing from the list,
a cycle or a lifetime mistake is one error, before any constructor runs.
TypeScript checks each `static deps` list against the constructor that receives it.

## Interfaces and tokens

When a test or an environment swaps an implementation, depend on an interface: a `Token<T>` names it, and `provide()` binds it to a class, a value or a factory.

<!-- #region interfaces-and-tokens -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

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
```

<!-- #endregion interfaces-and-tokens -->

`Nexus.create` awaits every async factory, so `NAV_CHARTS` exists before the first `get()`. `REACTOR` is private to `Engineering`, which exports only `COMPUTER`. No consumer names `FusionReactor` or `ShipComputer`, so a test built with `@nexusdi/testing` swaps the reactor and the charts and leaves the computer as it is.

## Providers

Use `static deps` and `provide()`. A class lists its constructor's tokens in `static deps`, and a module lists that class, plus `provide(TOKEN, { useClass })`, `provide(TOKEN, { useValue })` or `provide(TOKEN, { useFactory })` for interface tokens, values and factories.

<!-- #region providers -->

```ts @import.meta.vitest
import { MultiToken, Nexus, Token } from '@nexusdi/core';
import { defineModule, provide } from '@nexusdi/core';

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
```

<!-- #endregion providers -->

Lifetimes are `'singleton'` (the default), `'scoped'` and `'transient'`. A `MultiToken` collects one contribution per `provide()` call and resolves to an array; in a `deps` list it is written `all(DIAGNOSTICS)`. `optional(T)` resolves to `undefined` when nothing provides `T`, and `lazy(T)` to a thunk. A factory without `deps` takes no arguments.

### Object literals

0.3 code keeps its provider objects as they are: `providers` also takes plain objects in the 0.3 shape, `{ token, ... }`. `defineModule` checks each one with the rules `provide()` enforces and reports an error on the element that breaks one. A literal cannot give a factory's parameters their types from `deps`, so annotate them. `provide()` types them for you, and the rest of this README uses it.

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

A configurable module declares an options token and takes its options through `forRoot()` or `forRootAsync()`. Call either once and import the result: each call makes a new module instance. A `schema`, any Standard Schema validator, checks the options when the container builds them.

<!-- #region configurable-module -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface ICommsOptions {
  readonly frequency: number;
}
interface ISubspaceLink {
  readonly frequency: number;
}
const COMMS_OPTIONS = new Token<ICommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  readonly frequency: number;
  constructor(options: ICommsOptions) {
    this.frequency = options.frequency;
  }
}

const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Tactical',
    imports: [Comms.forRoot({ frequency: 1420 })],
  }),
);
ship.get(SUBSPACE_LINK).frequency; // -> 1420
```

<!-- #endregion configurable-module -->

`forRootAsync({ useFactory, deps })` computes the options at startup. The factory may return a promise, and its `deps` resolve where the module's own providers resolve, here through a global module.

<!-- #region configurable-module-async -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface ICommsOptions {
  readonly frequency: number;
}
interface ISubspaceLink {
  readonly frequency: number;
}
interface IVault {
  read(key: string): Promise<number>;
}
const COMMS_OPTIONS = new Token<ICommsOptions>('CommsOptions');
const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const VAULT = new Token<IVault>('Vault');
class SubspaceRelay implements ISubspaceLink {
  static deps = [COMMS_OPTIONS] as const;
  readonly frequency: number;
  constructor(options: ICommsOptions) {
    this.frequency = options.frequency;
  }
}
class MemoryVault implements IVault {
  async read(key: string) {
    return key === 'comms/frequency' ? 1701 : 0;
  }
}

const Secrets = defineModule({
  name: 'Secrets',
  global: true,
  providers: [provide(VAULT, { useClass: MemoryVault })],
  exports: [VAULT],
});
const Comms = defineModule({
  name: 'Comms',
  options: COMMS_OPTIONS,
  providers: [provide(SUBSPACE_LINK, { useClass: SubspaceRelay })],
  exports: [SUBSPACE_LINK],
});

await using ship = await Nexus.create(
  defineModule({
    name: 'Science',
    imports: [
      Secrets,
      Comms.forRootAsync({
        useFactory: async (vault) => ({
          frequency: await vault.read('comms/frequency'),
        }),
        deps: [VAULT],
      }),
    ],
  }),
);
ship.get(SUBSPACE_LINK).frequency; // -> 1701
```

<!-- #endregion configurable-module-async -->

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

A scope sees the graph as it was when the scope was created. After `ship.load(Science)`, `await scope.extend()` moves the scope to the loaded graph and builds the scoped factories the loaded modules add. The instances the scope already built stay as they are.

<!-- #region scope-extend -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface ISensorSweep {
  readonly target: string;
}
const SWEEP = new Token<ISensorSweep>('SensorSweep');
const Science = defineModule({
  name: 'Science',
  providers: [
    provide(SWEEP, {
      useFactory: () => ({ target: 'probe' }),
      lifetime: 'scoped',
    }),
  ],
  exports: [SWEEP],
});

await using ship = await Nexus.create(defineModule({ name: 'Meridian' }));
await using shuttle = await ship.createScope();
await ship.load(Science);
await shuttle.extend();
shuttle.get(SWEEP).target; // -> 'probe'
```

<!-- #endregion scope-extend -->

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

## Startup cost

`create` builds every singleton. A singleton with `eager: false` builds on its first `get()`, unless an eager provider depends on it. Use it for a client that opens a connection a short-lived command may never need.

<!-- #region startup-cost -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IDatabase {
  query(sql: string): string;
}
const DATABASE = new Token<IDatabase>('Database');

const log: string[] = [];
class PostgresClient implements IDatabase {
  constructor() {
    log.push('connect');
  }
  query(sql: string) {
    return `ran ${sql}`;
  }
}

await using app = await Nexus.create(
  defineModule({
    name: 'Api',
    providers: [provide(DATABASE, { useClass: PostgresClient, eager: false })],
  }),
);
log; // -> []
app.get(DATABASE).query('select 1'); // -> 'ran select 1'
log; // -> ['connect']
```

<!-- #endregion startup-cost -->

The first `get()` builds the provider synchronously, so a class or factory with `eager: false` must not need an async step. A factory that returns a promise there throws `NEXUS_LAZY_ASYNC`.

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

Core's one-line message names the code and the error's fields, then links to the code's page. Its fields are own enumerable properties, so `{ ...error, code: error.code }` holds exactly the fields and the code. Write `code` after the spread, since TypeScript rejects a `code` key written before `...error` (TS2783). To log an error, hand it to your logger's error serializer and add the code as a key of its own.

<!-- #region error-message -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, isNexusError } from '@nexusdi/core';
import { provide } from '@nexusdi/core';

interface INavCharts {
  plot(to: string): string;
}
interface IShipComputer {
  readonly charts: INavCharts;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
class ShipComputer implements IShipComputer {
  static deps = [NAV_CHARTS] as const;
  constructor(readonly charts: INavCharts) {}
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(COMPUTER, { useClass: ShipComputer })],
});

const logged: { code: string; message: string }[] = [];
const logger = {
  error(entry: { err: unknown; code: string }, message: string) {
    logged.push({ code: entry.code, message });
  },
};

let message = '';
let fields = {};
try {
  await Nexus.create(Engineering);
} catch (error) {
  if (!isNexusError(error, 'NEXUS_BLUEPRINT_INVALID')) throw error;
  logger.error({ err: error, code: error.code }, 'startup failed');
  const missing = error.errors[0];
  if (!isNexusError(missing, 'NEXUS_MISSING_PROVIDER')) throw error;
  message = missing.message;
  fields = { ...missing, code: missing.code };
}
message; // -> '[NEXUS_MISSING_PROVIDER] token=NavCharts requester=ShipComputer module=Engineering. https://nexus.js.org/errors/NEXUS_MISSING_PROVIDER'
fields; // -> { token: 'NavCharts', requester: 'ShipComputer', module: 'Engineering', entry: null, nearMisses: [], code: 'NEXUS_MISSING_PROVIDER' }
logged; // -> [{ code: 'NEXUS_BLUEPRINT_INVALID', message: 'startup failed' }]
```

<!-- #endregion error-message -->

The logger here stands in for pino, whose `logger.error({ err: error, code: error.code }, 'startup failed')` prints the message, the stack, the cause and the fields. Register `errors()` from `@nexusdi/errors`, or `devtools()`, for the full message with its fix.

## Plugins

A plugin extends one container. It is a plain object with a `name`, unique among the container's plugins, and the `apiVersion` it was written against, which is `NEXUS_PLUGIN_API`. Pass plugins to `Nexus.create(root, { plugins })`. Every hook is optional, and core reads the hooks once, when the container registers the plugin.

| Hook               | What it does                                                             |
| ------------------ | ------------------------------------------------------------------------ |
| `modules`          | Adds modules to the root's imports, compiled like any import             |
| `onInit`           | `false` skips `onInit` at `create` and `load`                            |
| `tokenKey`         | Maps a token to the key every lookup uses; one key finds one provider    |
| `compile.module`   | Replaces a module definition before the compiler validates it            |
| `compile.provider` | Replaces or removes a provider before the compiler validates it          |
| `compile.check`    | Reads the compiled graph and reports errors of its own                   |
| `construct`        | Receives each instance as it is built, and may return a wrapper to store |
| `observe`          | Receives every trace event as it happens                                 |
| `formatError`      | Writes the message of an error core raised                               |
| `setup`            | Runs once when `create` has built the container, and receives it         |
| `dispose`          | Runs at container disposal, after every root-owned instance              |

A plugin reads the graph and cannot change it once the compiler has validated it. `@nexusdi/errors`, `@nexusdi/devtools`, `@nexusdi/testing` and `@nexusdi/federation` are plugins built on this API alone.

<!-- #region plugins -->

```ts @import.meta.vitest
import { NEXUS_PLUGIN_API, Nexus, Token } from '@nexusdi/core';
import { defineModule, provide, type NexusPlugin } from '@nexusdi/core';

interface IDatabase {
  query(sql: string): string;
}
interface IUserRepository {
  count(): string;
}
const DATABASE = new Token<IDatabase>('Database');
const USERS = new Token<IUserRepository>('UserRepository');
class PostgresClient implements IDatabase {
  query(sql: string) {
    return `ran ${sql}`;
  }
}
class UserRepository implements IUserRepository {
  static deps = [DATABASE] as const;
  constructor(readonly database: IDatabase) {}
  count() {
    return this.database.query('select count(*) from users');
  }
}

let constructed = 0;
const counter: NexusPlugin = {
  name: 'construct-counter',
  apiVersion: NEXUS_PLUGIN_API,
  observe(event) {
    if (event.type === 'construct') constructed++;
  },
};

await using app = await Nexus.create(
  defineModule({
    name: 'Api',
    providers: [
      provide(DATABASE, { useClass: PostgresClient }),
      provide(USERS, { useClass: UserRepository }),
    ],
  }),
  { plugins: [counter] },
);
constructed; // -> 2
```

<!-- #endregion plugins -->

With a `tokenKey` plugin, several tokens find one provider, and `ProviderView.token` holds the first of them the container met. A plugin compares a token it holds through `canonical()`, which the compile context and every `BlueprintView` carry:

<!-- #region plugin-canonical -->

```ts @import.meta.vitest
import { NEXUS_PLUGIN_API, Nexus, Token } from '@nexusdi/core';
import { defineModule, provide, type NexusPlugin } from '@nexusdi/core';

interface IAuth {
  user(): string;
}
// Two copies of a contracts package each make their own token.
const shellAuth = new Token<IAuth>('bank/Auth');
const remoteAuth = new Token<IAuth>('bank/Auth');
class CrewAuth implements IAuth {
  user() {
    return 'crew';
  }
}

const byName: NexusPlugin = {
  name: 'by-name',
  apiVersion: NEXUS_PLUGIN_API,
  tokenKey: (token) => (token instanceof Token ? token.description : undefined),
};
let provided = false;
const probe: NexusPlugin = {
  name: 'auth-probe',
  apiVersion: NEXUS_PLUGIN_API,
  compile: {
    check(view) {
      const auth = view.canonical(remoteAuth);
      provided = view.providers.some((p) => p.token === auth);
    },
  },
};

await using app = await Nexus.create(
  defineModule({
    name: 'Shell',
    providers: [provide(shellAuth, { useClass: CrewAuth })],
  }),
  { plugins: [byName, probe] },
);
provided; // -> true
```

<!-- #endregion plugin-canonical -->

## Packages

Core holds the container. Each of these is optional, built on the plugin API,
and pinned to core's version:

| Package               | What it adds                                                    |
| --------------------- | --------------------------------------------------------------- |
| `@nexusdi/errors`     | Full error messages with fix lines and near-miss suggestions    |
| `@nexusdi/devtools`   | `graph()`, `inspect()`, `trace()`, and the messages of `errors` |
| `@nexusdi/testing`    | `createTestingContainer()` with provider and module overrides   |
| `@nexusdi/node`       | `nodeScopes()`, the ambient scope over `AsyncLocalStorage`      |
| `@nexusdi/decorators` | `@Injectable`, `@Inject` and `@Module`                          |
| `@nexusdi/federation` | Contract tokens: `defineContract()` and `federation()`          |

In development, register `devtools()`:

```ts
import { devtools } from '@nexusdi/devtools';

const app = await Nexus.create(Root, { plugins: [devtools()] });
```

## Good to know

- A class with constructor parameters declares them in `static deps`, in `@Injectable`, or in `provide(C, { deps })`. The compiler reads `C.length`, which does not count parameters with defaults or rest parameters, so a class whose parameters all have defaults builds with them.
- A disposable transient resolved from the root has no owner, and nothing disposes it. Resolve disposable transients inside a scope; an observing plugin receives an `untracked` event for each one.
- A factory result that is a thenable is awaited. A `useValue` is stored as it is.
- The package's type declarations reference TypeScript's `esnext.disposable` library, which adds `Symbol.asyncDispose` and `AsyncDisposable` to your program, so `await using` compiles with `lib: ["es2022"]`.

## When you do not need a container

A single script or a small app whose objects you can build by hand in one file does not need a container: a few `new` calls in `main` are clearer. NexusDI helps when one graph serves several entry points, such as an API, a worker and a CLI, or when several teams own sections of one app.

## License

MIT
