<div align="center">
  <img src="https://raw.githubusercontent.com/NexusDI/core/main/logo.svg" alt="NexusDI" width="120" height="120" />
  <h1>NexusDI</h1>
  <p>Eliminate runtime crashes with static graph validation for TypeScript dependency injection.</p>

[![npm](https://img.shields.io/npm/v/@nexusdi/core/next)](https://www.npmjs.com/package/@nexusdi/core)
[![CI](https://img.shields.io/github/actions/workflow/status/NexusDI/core/ci.yml)](https://github.com/NexusDI/core/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://www.npmjs.com/package/@nexusdi/core#provenance)
[![license](https://img.shields.io/npm/l/@nexusdi/core)](https://github.com/NexusDI/core/blob/main/LICENSE)
</div>

Dependency injection is a cornerstone of scalable architecture, but it often introduces a dangerous blind spot: you do not know if your application is wired correctly until the code actually runs. Missing providers or circular references often stay hidden until they trigger a production failure.

NexusDI solves this by assembling your application from modules and validating the entire dependency graph before a single class is instantiated. If the graph is invalid, NexusDI reports every error in a single detailed message at startup.

## Key Features

NexusDI provides architectural safety and performance through these technical specifications:

- **Static Validation:** Catch wiring mistakes at boot, before they reach production.
- **Async-First Resolution:** Async factories resolve at startup so `get()` calls remain synchronous and predictable.
- **Zero Compiler Flags:** Works with `tsc`, esbuild, SWC, Vite, Bun, and Deno without `emitDecoratorMetadata`.
- **Bounded Contexts:** Modules use private providers and explicit exports to enforce architectural boundaries.
- **Resource Safety:** Automatically disposes of instances in reverse-order using `AsyncDisposable`.
- **Technical Spec:** ESM-only package requiring Node 22.12+ and TypeScript 5.4+.

## Quick Start

NexusDI uses a simple, type-safe pattern for dependencies. A class declares its needs in `static deps`, and the container handles the rest.

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

## The Ecosystem

NexusDI is a modular system. Start with `@nexusdi/core` and add capabilities as you need them:

| Package                                                | Purpose                                                |
| :----------------------------------------------------- | :----------------------------------------------------- |
| [`@nexusdi/decorators`](libs/decorators/README.md)     | NestJS-style `@Injectable` and `@Module` decorators.   |
| [`@nexusdi/errors`](libs/errors/README.md)             | Full error messages with fix lines.                    |
| [`@nexusdi/devtools`](libs/devtools/README.md)         | Graph visualization and lifecycle tracing.             |
| [`@nexusdi/interceptors`](libs/interceptors/README.md) | Cross-cutting concerns (logging, caching, validation). |
| [`@nexusdi/node`](libs/node/README.md)                 | Request scopes for Node.js servers.                    |
| [`@nexusdi/testing`](libs/testing/README.md)           | Type-safe provider overrides for integration tests.    |
| [`@nexusdi/federation`](libs/federation/README.md)     | Versioned contracts for micro-frontend architectures.  |
| [`@nexusdi/cli`](libs/cli/README.md)                   | Export your dependency graph as SVG, PNG, or Mermaid.  |

## Installation

> 0.4 is currently in Release Candidate. Install using the `next` tag to get the latest features. Install every @nexusdi package from the `next` tag so their versions match. `npm install @nexusdi/core` without `@next` installs the 0.3 line.

```bash
npm install @nexusdi/core@next
```

## Examples and Contributing

Every package keeps its examples in `libs/<package>/docs`, and [examples/react-ssr](examples/react-ssr/) shows a React Router integration. Read the [Contributing Guide](CONTRIBUTING.md) before you open a pull request.

## Documentation & Community

Explore the full guide for advanced patterns, such as interface-first binding and custom providers.

- [Full Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.0/libs/core/docs)
- [GitHub Discussions](https://github.com/NexusDI/core/discussions)

## License

MIT
