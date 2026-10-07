<div align="center">
  <img src="https://raw.githubusercontent.com/NexusDI/core/main/logo.svg" alt="NexusDI" width="120" height="120" />
  <h1>@nexusdi/core</h1>
  <p>The static-validation DI container for TypeScript.</p>

[![npm](https://img.shields.io/npm/v/@nexusdi/core/next)](https://www.npmjs.com/package/@nexusdi/core)
[![CI](https://img.shields.io/github/actions/workflow/status/NexusDI/core/ci.yml)](https://github.com/NexusDI/core/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://www.npmjs.com/package/@nexusdi/core#provenance)
[![license](https://img.shields.io/npm/l/@nexusdi/core)](https://github.com/NexusDI/core/blob/main/LICENSE)

</div>

NexusDI is a dependency injection container that prioritizes **predictability** and **toolchain flexibility**. Where many containers find a missing dependency only when code first asks for it, NexusDI treats your application as a directed graph and validates it entirely during the startup phase.

## Core Value Propositions

### 1. No Runtime Wiring Errors

Missing providers and circular dependencies are reported as a single `BlueprintError` during `Nexus.create`. Your application either starts fully wired or doesn't start at all.

### 2. Zero Compiler Flags

By using `static deps` for dependency declaration, NexusDI eliminates the need for `emitDecoratorMetadata`. It works natively with any modern TypeScript toolchain (Vite, Bun, Deno, esbuild) without custom plugins. It also runs under tsc, TypeScript 7, SWC, Babel and Node's type stripping.

### 3. Async-First Startup

Async factories are awaited during the initialization phase. This means that once the container is created, all `get()` calls are synchronous, eliminating "async-leak" throughout your business logic.

### 4. Bounded Contexts

Using `defineModule`, you can group providers into modules with private internal state and explicit public exports, enforcing strict architectural boundaries.

## Quick Start

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

## Installation

> 0.4 is currently in Release Candidate.

```bash
npm install @nexusdi/core@next
```

Install every @nexusdi package from `next` so their versions match. The package is ESM, and needs Node 22.12 or later and TypeScript 5.4 or later.

## Checked at Startup

`Nexus.create` rejects with one error that lists every provider the graph lacks, before any constructor runs.

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

## Modules and Interfaces

A module binds interface tokens to classes and factories, and exports what other modules may use.

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

## Configurable Modules

A module declares an options token and takes its options through `forRoot()` or `forRootAsync()`.

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

## Ecosystem

@nexusdi/core is the engine. You can extend it with official packages:

- **`@nexusdi/decorators`**: For NestJS-style `@Injectable` syntax.
- **`@nexusdi/errors`**: For full error messages with fix lines.
- **`@nexusdi/interceptors`**: For cross-cutting concerns.
- **`@nexusdi/devtools`**: For graph visualization.
- **`@nexusdi/testing`**: For type-safe provider overrides.
- **`@nexusdi/node`**: For request scopes in Node.js servers.
- **`@nexusdi/federation`**: For versioned contracts across bundles.
- **`@nexusdi/cli`**: For drawing the graph from the terminal.

## When You Do Not Need a Container

A single script or a small app whose objects you can build by hand in one file does not need a container: a few `new` calls in `main` are clearer. NexusDI helps when one graph serves several entry points, such as an API and a worker, or when several teams own sections of one app.

## Documentation

- [Full Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.0/libs/core/docs)
- [GitHub Repository](https://github.com/NexusDI/core)
- [Discussions](https://github.com/NexusDI/core/discussions)

## License

MIT
