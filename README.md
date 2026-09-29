# NexusDI

<div align="center">
  <img src="https://nexus.js.org/img/logo.svg" alt="NexusDI Logo" width="120" height="120" />
  <br />
  <p><strong>NestJS-style modules and async startup for any TypeScript app, checked before it runs, with no compiler flags.</strong></p>
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

NexusDI is a dependency injection container for TypeScript. It compiles your module graph before it builds anything, so a missing provider or a dependency cycle fails at startup, in one error. Modules keep their providers private unless they export them, as NestJS modules do, and async factories finish during startup.

# 🚨 Call for Feedback 🚨

We want your input.  
We have a number of open RFCs and discussions, and your feedback can help guide the direction of the project.  
Jump in and let us know what you think!

👉 [Share your ideas and feedback in the Ideas Discussions](https://github.com/NexusDI/core/discussions/categories/ideas)

We look forward to hearing from you!

---

## Features

- Modules with encapsulation: a module sees its own providers and what its imports export
- Whole-graph validation: `Nexus.create` reports every missing provider, cycle, lifetime mistake and invalid provider at startup, in one error
- Async startup: async factories finish during `create`, and `get()` stays synchronous
- Configurable modules through `forRoot()` and `forRootAsync()`
- Plugins for everything optional
- Scopes for per-request work, and disposal in reverse creation order
- No compiler flags: a class lists its dependencies in `static deps`, and decorators are an optional package
- TypeScript 5.4 to 7
- No runtime dependencies
- Node 22.12 or later, ESM only

## Comparison / Alternatives

NexusDI is an alternative to:

- InversifyJS
- tsyringe
- TypeDI
- the NestJS DI system

## Size

The size report on every pull request measures core's ESM gzip size; `npm run size` prints it.

## Quick Start

```bash
npm install @nexusdi/core
```

A class lists the classes its constructor takes in `static deps`, and `Nexus.create` takes the classes.

```ts
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

`Nexus.create` checks the whole graph first: a class missing from the list, a cycle or a lifetime mistake is one error, before any constructor runs. TypeScript checks each `static deps` list against the constructor that receives it.

## Dynamic Module Configuration

A configurable module declares an options token and takes its options through `forRoot()` or `forRootAsync()`. Call either once and import the result: each call makes a new module instance.

```ts
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IDatabaseConfig {
  readonly host: string;
  readonly port: number;
}
interface IDatabase {
  query(sql: string): Promise<unknown[]>;
}
const DATABASE_CONFIG = new Token<IDatabaseConfig>('DatabaseConfig');
const DATABASE = new Token<IDatabase>('Database');

class PostgresClient implements IDatabase {
  static deps = [DATABASE_CONFIG] as const;
  constructor(readonly config: IDatabaseConfig) {}
  async query(sql: string) {
    return [{ host: this.config.host, sql }];
  }
}

const DatabaseModule = defineModule({
  name: 'Database',
  options: DATABASE_CONFIG,
  providers: [provide(DATABASE, { useClass: PostgresClient })],
  exports: [DATABASE],
});

// Options as a value
const Api = defineModule({
  name: 'Api',
  imports: [DatabaseModule.forRoot({ host: 'localhost', port: 5432 })],
});

// Options computed at startup
const Worker = defineModule({
  name: 'Worker',
  imports: [
    DatabaseModule.forRootAsync({
      useFactory: async () => ({
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
      }),
    }),
  ],
});

await using api = await Nexus.create(Api);
```

## Packages

[`@nexusdi/core`](libs/core/README.md) holds the container. Each of these is optional, built on the plugin API, and pinned to core's version:

- [`@nexusdi/errors`](libs/errors/README.md): full error messages with fix lines and near-miss suggestions
- [`@nexusdi/devtools`](libs/devtools/README.md): `graph()`, `inspect()`, `trace()`, `toMermaid()`, `toDot()`, and the messages of `errors`
- [`@nexusdi/cli`](libs/cli/README.md): the `nexusdi graph` command
- [`@nexusdi/testing`](libs/testing/README.md): `createTestingContainer()` with provider and module overrides
- [`@nexusdi/node`](libs/node/README.md): `nodeScopes()`, the ambient scope over `AsyncLocalStorage`
- [`@nexusdi/decorators`](libs/decorators/README.md): `@Injectable`, `@Inject` and `@Module`
- [`@nexusdi/federation`](libs/federation/README.md): `defineContract()` and `federation()`, keyed and versioned contract tokens for a shell and its remotes

## Documentation

- [Getting Started](https://nexus.js.org/docs/getting-started)
- [Concepts](https://nexus.js.org/docs/concepts)
- [Modules](https://nexus.js.org/docs/modules)
- [Advanced Usage](https://nexus.js.org/docs/advanced)
- [Terminology](https://nexus.js.org/docs/terminology)

## Examples

- [React Router Integration](examples/react-ssr/)

## Contributing

NexusDI grows with its community's input. Contributions are welcome; see the [Contributing Guide](CONTRIBUTING.md) for details.

## When you do not need a container

A single script or a small app whose objects you can build by hand in one file does not need a container: a few `new` calls in `main` are clearer. NexusDI helps when one graph serves several entry points, such as an API, a worker and a CLI, or when several teams own sections of one app.

## License

MIT License - see [LICENSE](LICENSE) for details.
