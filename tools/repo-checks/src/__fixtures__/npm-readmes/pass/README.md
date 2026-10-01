<div align="center">
  <img src="https://raw.githubusercontent.com/NexusDI/core/main/logo.svg" alt="NexusDI" width="120" height="120" />
  <h1>NexusDI</h1>
  <p>NestJS-style modules and async startup for any TypeScript app, checked before it runs, with no compiler flags.</p>

[![npm](https://img.shields.io/npm/v/@nexusdi/core/next)](https://www.npmjs.com/package/@nexusdi/core)
[![CI](https://img.shields.io/github/actions/workflow/status/NexusDI/core/ci.yml)](https://github.com/NexusDI/core/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://www.npmjs.com/package/@nexusdi/core#provenance)
[![license](https://img.shields.io/npm/l/@nexusdi/core)](https://github.com/NexusDI/core/blob/main/LICENSE)

</div>

NexusDI validates the whole module graph before it builds anything, so a missing provider or a cycle fails at startup in one error. No runtime dependencies.

## Quick start

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

- Modules with `forRoot` and `forRootAsync`, as in NestJS.
- Class, value and factory providers on `Token<T>`.
- Async startup, then a synchronous `get()`.
- One startup error lists every missing provider and cycle.
- Runs under tsc, TypeScript 7, esbuild, SWC, Babel, Vite, Bun, Deno and Node's type stripping.

## Install

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match.

`npm install @nexusdi/core` without `@next` installs the 0.3 line.

```bash
npm install @nexusdi/core@next
```

Node 22.12 or later, TypeScript 5.4 or later, ESM.

## Packages

| Package | What it does |
| --- | --- |
| [@nexusdi/decorators](https://www.npmjs.com/package/@nexusdi/decorators) | NestJS-style @Injectable, @Inject and @Module for NexusDI, with standard decorators and no compiler flags. |
| [@nexusdi/devtools](https://www.npmjs.com/package/@nexusdi/devtools) | Draw your NexusDI module graph and follow every instance the container builds. |
| [@nexusdi/errors](https://www.npmjs.com/package/@nexusdi/errors) | Every NexusDI error explained, with the fix and the provider you probably meant. |
| [@nexusdi/federation](https://www.npmjs.com/package/@nexusdi/federation) | Share NexusDI tokens between a micro-frontend shell and its remotes through versioned contracts. |
| [@nexusdi/interceptors](https://www.npmjs.com/package/@nexusdi/interceptors) | Wrap NexusDI service methods with logging, metrics, validation or caching. |
| [@nexusdi/node](https://www.npmjs.com/package/@nexusdi/node) | Find the current request's NexusDI scope anywhere in a Node call chain, through AsyncLocalStorage. |
| [@nexusdi/testing](https://www.npmjs.com/package/@nexusdi/testing) | Build your real NexusDI module graph in tests, with the providers you name replaced. |
| [@nexusdi/cli](https://www.npmjs.com/package/@nexusdi/cli) | Draw a NexusDI app's dependency graph from the terminal as Mermaid, DOT, JSON, SVG or PNG. |

## Examples

The examples folder holds a React SSR app.

## Contributing

Questions go to [GitHub Discussions](https://github.com/NexusDI/core/discussions).

## License

MIT
