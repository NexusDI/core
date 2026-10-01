<div align="center">
  <img src="https://raw.githubusercontent.com/NexusDI/core/main/logo.svg" alt="NexusDI" width="120" height="120" />
  <h1>NexusDI</h1>
  <p>NestJS-style modules and async startup for any TypeScript app, checked before it runs, with no compiler flags.</p>

[![npm](https://img.shields.io/npm/v/@nexusdi/core/next)](https://www.npmjs.com/package/@nexusdi/core) [![CI](https://img.shields.io/github/actions/workflow/status/NexusDI/core/ci.yml)](https://github.com/NexusDI/core/actions/workflows/ci.yml) [![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://www.npmjs.com/package/@nexusdi/core#provenance) [![license](https://img.shields.io/npm/l/@nexusdi/core)](https://github.com/NexusDI/core/blob/main/LICENSE)

</div>

NexusDI assembles a TypeScript app from modules that teams own and tests can replace. It validates the whole module graph before it builds anything, so a missing provider or a cycle fails at startup in one error. No runtime dependencies.

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

## Packages

| Package                                              | What it does                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [@nexusdi/decorators](libs/decorators/README.md)     | NestJS-style @Injectable, @Inject and @Module for NexusDI, with standard decorators and no compiler flags. |
| [@nexusdi/devtools](libs/devtools/README.md)         | Draw your NexusDI module graph and follow every instance the container builds.                             |
| [@nexusdi/errors](libs/errors/README.md)             | Every NexusDI error explained, with the fix and the provider you probably meant.                           |
| [@nexusdi/federation](libs/federation/README.md)     | Share NexusDI tokens between a micro-frontend shell and its remotes through versioned contracts.           |
| [@nexusdi/interceptors](libs/interceptors/README.md) | Wrap NexusDI service methods with logging, metrics, validation or caching.                                 |
| [@nexusdi/node](libs/node/README.md)                 | Find the current request's NexusDI scope anywhere in a Node call chain, through AsyncLocalStorage.         |
| [@nexusdi/testing](libs/testing/README.md)           | Build your real NexusDI module graph in tests, with the providers you name replaced.                       |
| [@nexusdi/cli](libs/cli/README.md)                   | Draw a NexusDI app's dependency graph from the terminal as Mermaid, DOT, JSON, SVG or PNG.                 |

## Examples

- [Core examples](libs/core/docs); every package keeps its examples in `libs/<package>/docs`
- [React Router integration](examples/react-ssr/)

## Contributing

Read the [Contributing Guide](CONTRIBUTING.md) before you open a pull request. Questions and 0.4 RC feedback go to [GitHub Discussions](https://github.com/NexusDI/core/discussions).

## License

MIT
