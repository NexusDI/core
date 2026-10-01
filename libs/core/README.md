<div align="center">
  <img src="https://raw.githubusercontent.com/NexusDI/core/main/logo.svg" alt="NexusDI" width="120" height="120" />
  <h1>NexusDI</h1>
  <p>NestJS-style modules and async startup for any TypeScript app, checked before it runs, with no compiler flags.</p>

[![npm](https://img.shields.io/npm/v/@nexusdi/core/next)](https://www.npmjs.com/package/@nexusdi/core)
[![CI](https://img.shields.io/github/actions/workflow/status/NexusDI/core/ci.yml)](https://github.com/NexusDI/core/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://www.npmjs.com/package/@nexusdi/core#provenance)
[![license](https://img.shields.io/npm/l/@nexusdi/core)](https://github.com/NexusDI/core/blob/main/LICENSE)

</div>

NexusDI assembles a TypeScript app from modules that teams own and tests can replace. It validates the whole module graph before it builds anything, so a missing provider or a cycle fails at startup in one error. No runtime dependencies.

## Quick start

A class lists the classes its constructor takes in `static deps`, and `Nexus.create` takes the classes.

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

## Features

- Modules with private providers, exports, `forRoot()` and `forRootAsync()`.
- Class, value, factory and alias providers on typed `Token<T>` interfaces.
- Async factories finish at startup, and `get()` stays synchronous.
- One startup error lists every missing provider and cycle.
- Request scopes, and disposal in reverse creation order.
- Runs under tsc, TypeScript 7, esbuild, SWC, Babel, Vite, Bun, Deno and Node's type stripping.

## Install

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. `npm install @nexusdi/core` without `@next` installs the 0.3 line.

```bash
npm install @nexusdi/core@next
```

The package is ESM, and needs Node 22.12 or later and TypeScript 5.4 or later.

## Checked at startup

`Nexus.create` rejects with one error that lists every provider the graph lacks, before any constructor runs.

<!-- #region checked-at-startup -->

```ts @import.meta.vitest
import { MissingProviderError, Nexus, Token } from '@nexusdi/core';
import type { BlueprintError } from '@nexusdi/core';

const CALLSIGN = new Token<string>('Callsign');
const FREQUENCY = new Token<number>('Frequency');
class Comms {
  static deps = [CALLSIGN, FREQUENCY] as const;
  constructor(callsign: string, frequency: number) {}
}

const listed = (error: BlueprintError) => error.errors;
const errors = await Nexus.create([Comms]).then(() => [], listed);
errors.map((e) => e instanceof MissingProviderError && e.token); // -> ['Callsign', 'Frequency']
```

<!-- #endregion checked-at-startup -->

## Modules and interfaces

A module binds interface tokens to classes and factories, and exports what other modules may use.

<!-- #region modules-and-interfaces -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface INavCharts {
  plot(to: string): string;
}
interface IHelm {
  engage(to: string): string;
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const HELM = new Token<IHelm>('Helm');
class Helm implements IHelm {
  static deps = [NAV_CHARTS] as const;
  constructor(private readonly charts: INavCharts) {}
  engage(to: string) {
    return this.charts.plot(to);
  }
}
const charts = async (): Promise<INavCharts> => ({ plot: (to) => `to ${to}` });
const Bridge = defineModule({
  name: 'Bridge',
  providers: [
    provide(NAV_CHARTS, { useFactory: charts }),
    provide(HELM, { useClass: Helm }),
  ],
  exports: [HELM],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Bridge] });
await using ship = await Nexus.create(Meridian);
ship.get(HELM).engage('Vega'); // -> 'to Vega'
ship.has(NAV_CHARTS); // -> false
```

<!-- #endregion modules-and-interfaces -->

## Configurable modules

A module declares an options token and takes its options through `forRoot()` or `forRootAsync()`.

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

## Packages

| Package                                                                      | What it does                                                                                               |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [@nexusdi/decorators](https://www.npmjs.com/package/@nexusdi/decorators)     | NestJS-style @Injectable, @Inject and @Module for NexusDI, with standard decorators and no compiler flags. |
| [@nexusdi/devtools](https://www.npmjs.com/package/@nexusdi/devtools)         | Draw your NexusDI module graph and follow every instance the container builds.                             |
| [@nexusdi/errors](https://www.npmjs.com/package/@nexusdi/errors)             | Every NexusDI error explained, with the fix and the provider you probably meant.                           |
| [@nexusdi/federation](https://www.npmjs.com/package/@nexusdi/federation)     | Share NexusDI tokens between a micro-frontend shell and its remotes through versioned contracts.           |
| [@nexusdi/interceptors](https://www.npmjs.com/package/@nexusdi/interceptors) | Wrap NexusDI service methods with logging, metrics, validation or caching.                                 |
| [@nexusdi/node](https://www.npmjs.com/package/@nexusdi/node)                 | Find the current request's NexusDI scope anywhere in a Node call chain, through AsyncLocalStorage.         |
| [@nexusdi/testing](https://www.npmjs.com/package/@nexusdi/testing)           | Build your real NexusDI module graph in tests, with the providers you name replaced.                       |
| [@nexusdi/cli](https://www.npmjs.com/package/@nexusdi/cli)                   | Draw a NexusDI app's dependency graph from the terminal as Mermaid, DOT, JSON, SVG or PNG.                 |

## Documentation

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.0/libs/core/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)
- [Discussions](https://github.com/NexusDI/core/discussions)

## When you do not need a container

A single script or a small app whose objects you can build by hand in one file does not need a container: a few `new` calls in `main` are clearer. NexusDI helps when one graph serves several entry points, such as an API and a worker, or when several teams own sections of one app.

## License

MIT
