<div align="center">
  <img src="https://raw.githubusercontent.com/NexusDI/core/main/logo.svg" alt="NexusDI" width="120" height="120" />
  <h1>@nexusdi/core</h1>
  <p>Eliminate runtime wiring errors with a static-validation DI container for TypeScript.</p>

[![npm](https://img.shields.io/npm/v/@nexusdi/core/next)](https://www.npmjs.com/package/@nexusdi/core)
[![CI](https://img.shields.io/github/actions/workflow/status/NexusDI/core/ci.yml)](https://github.com/NexusDI/core/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://www.npmjs.com/package/@nexusdi/core#provenance)
[![license](https://img.shields.io/npm/l/@nexusdi/core)](https://github.com/NexusDI/core/blob/main/LICENSE)

</div>

Many dependency injection containers only discover missing providers or circular dependencies when the code first attempts to resolve them. This transforms architectural mistakes into unpredictable runtime crashes in production.

NexusDI solves this by treating your application as a directed graph, validating the entire wiring during the startup phase. If a dependency is missing, your application fails to start immediately with a comprehensive report.

## Key Features

NexusDI prioritizes toolchain flexibility and predictable startup behavior.

- **Zero Compiler Flags**: Dependency declaration uses `static deps` and needs no `emitDecoratorMetadata`, so it works with Vite, Bun, Deno, esbuild, SWC, and Node's type stripping.
- **Async-First Startup**: Async factories are awaited during initialization so that all `get()` calls remain synchronous.
- **Bounded Contexts**: `defineModule` groups providers into modules with private state and explicit public exports.
- **Technical Specs**: ESM-only; requires Node 22.12+ and TypeScript 5.4+.

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

## Validation at Startup

NexusDI validates the entire dependency graph before any constructor runs.

`Nexus.create` rejects with a single error listing every missing provider.

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

## Modules and Interfaces

Interface-first binding decouples implementation from consumption.

A module binds interface tokens to classes or factories and exports specific tokens for other modules to use.

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

## Configurable Modules

Modules can be parameterized to support different environments or settings.

A module defines an options token and accepts configuration via `forRoot()` or `forRootAsync()`.

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

## Installation

> 0.4 is currently in Release Candidate.

```bash
npm install @nexusdi/core@next
```

Install every @nexusdi package from `next` so their versions match.

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
