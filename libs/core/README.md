<div align="center">
  <img src="https://raw.githubusercontent.com/NexusDI/core/main/logo.svg" alt="NexusDI" width="120" height="120" />
  <h1>@nexusdi/core</h1>
  <p>The static-validation DI container for TypeScript.</p>

[![npm](https://img.shields.io/npm/v/@nexusdi/core/next)](https://www.npmjs.com/package/@nexusdi/core)
[![CI](https://img.shields.io/github/actions/workflow/status/NexusDI/core/ci.yml)](https://github.com/NexusDI/core/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://www.npmjs.com/package/@nexusdi/core#provenance)
[![license](https://img.shields.io/npm/l/@nexusdi/core)](https://github.com/NexusDI/core/blob/main/LICENSE)

</div>

NexusDI is a dependency injection container that prioritizes **predictability** and **toolchain flexibility**. Unlike traditional containers that resolve dependencies lazily, NexusDI treats your application as a directed graph and validates it entirely during the startup phase.

## Core Value Propositions

### 1. No Runtime Wiring Errors
Missing providers and circular dependencies are reported as a single `BlueprintError` during `Nexus.create`. Your application either starts fully wired or doesn't start at all.

### 2. Zero Compiler Flags
By using `static deps` for dependency declaration, NexusDI eliminates the need for `emitDecoratorMetadata`. It works natively with any modern TypeScript toolchain (Vite, Bun, Deno, esbuild) without custom plugins.

### 3. Async-First Startup
Async factories are awaited during the initialization phase. This means that once the container is created, all `get()` calls are synchronous, eliminating "async-leak" throughout your business logic.

### 4. Bounded Contexts
Using `defineModule`, you can group providers into modules with private internal state and explicit public exports, enforcing strict architectural boundaries.

## Quick Start

```ts @import.meta.vitest
import { Nexus } from '@nexusdi/core';

class Logger {
  log(line: string) { return `[app] ${line}`; }
}

class UserService {
  static deps = [Logger] as const;
  constructor(readonly logger: Logger) {}
  greet(name: string) { return this.logger.log(`hello ${name}`); }
}

const app = await Nexus.create([Logger, UserService]);
app.get(UserService).greet('Ada'); // -> '[app] hello Ada'
```

## Installation

> 0.4 is currently in Release Candidate.

```bash
npm install @nexusdi/core@next
```

## Ecosystem

@nexusdi/core is the engine. You can extend it with official plugins:
- **`@nexusdi/decorators`**: For NestJS-style `@Injectable` syntax.
- **`@nexusdi/interceptors`**: For cross-cutting concerns.
- **`@nexusdi/devtools`**: For graph visualization.
- **`@nexusdi/testing`**: For type-safe provider overrides.

## Documentation
- [Full Documentation](https://nexus.js.org/next/)
- [GitHub Repository](https://github.com/NexusDI/core)

## License
MIT
