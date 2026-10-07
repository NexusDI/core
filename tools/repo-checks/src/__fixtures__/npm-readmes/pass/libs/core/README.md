<div align="center">
  <img src="https://raw.githubusercontent.com/NexusDI/core/main/logo.svg" alt="NexusDI" width="120" height="120" />
  <h1>@nexusdi/core</h1>
  <p>The static-validation DI container for TypeScript.</p>

[![npm](https://img.shields.io/npm/v/@nexusdi/core/next)](https://www.npmjs.com/package/@nexusdi/core)
[![CI](https://img.shields.io/github/actions/workflow/status/NexusDI/core/ci.yml)](https://github.com/NexusDI/core/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://www.npmjs.com/package/@nexusdi/core#provenance)
[![license](https://img.shields.io/npm/l/@nexusdi/core)](https://github.com/NexusDI/core/blob/main/LICENSE)

</div>

A container that resolves dependencies on first use reports a wiring mistake when the code runs. NexusDI validates the whole module graph at startup.

## Core Value Propositions

### No Runtime Wiring Errors

**Startup check:** `Nexus.create` reports every missing provider in one error.

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

## Modules and Interfaces

```ts @import.meta.vitest
import { Token, provide } from '@nexusdi/core';

interface IReactor {
  output: number;
}
const REACTOR = new Token<IReactor>('Reactor');
class Fusion implements IReactor {
  output = 42;
}
provide(REACTOR, { useClass: Fusion }).token === REACTOR; // -> true
```

## Ecosystem

- **`@nexusdi/decorators`**: NestJS-style `@Injectable`.
- **`@nexusdi/devtools`**: Graph introspection.

## Documentation

- [Full Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/core/docs)
- [GitHub Repository](https://github.com/NexusDI/core)

## License

MIT
