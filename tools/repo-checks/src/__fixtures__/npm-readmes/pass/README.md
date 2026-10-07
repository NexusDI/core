<div align="center">
  <img src="https://raw.githubusercontent.com/NexusDI/core/main/logo.svg" alt="NexusDI" width="120" height="120" />
  <h1>NexusDI</h1>
  <p>Static graph validation for TypeScript dependency injection.</p>

[![npm](https://img.shields.io/npm/v/@nexusdi/core/next)](https://www.npmjs.com/package/@nexusdi/core)
[![CI](https://img.shields.io/github/actions/workflow/status/NexusDI/core/ci.yml)](https://github.com/NexusDI/core/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://www.npmjs.com/package/@nexusdi/core#provenance)
[![license](https://img.shields.io/npm/l/@nexusdi/core)](https://github.com/NexusDI/core/blob/main/LICENSE)

</div>

A container that resolves dependencies on first use reports a wiring mistake when the code runs.

**NexusDI checks the graph first.** It validates the whole module graph at startup.

## Why NexusDI?

- **Static Validation:** Wiring mistakes fail at startup.
- **Async-First:** Async factories finish at startup.

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

## The Ecosystem

| Package                                            | Purpose                      |
| :------------------------------------------------- | :--------------------------- |
| [`@nexusdi/decorators`](libs/decorators/README.md) | NestJS-style decorators.     |
| [`@nexusdi/devtools`](libs/devtools/README.md)     | Graph introspection.         |
| [`@nexusdi/errors`](libs/errors/README.md)         | Full error text.             |
| [`@nexusdi/cli`](libs/cli/README.md)               | Draw the graph from a shell. |

## Installation

> 0.4 is currently in Release Candidate. Install using the `next` tag.

```bash
npm install @nexusdi/core@next
```

## Documentation & Community

- [Full Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/core/docs)
- [GitHub Discussions](https://github.com/NexusDI/core/discussions)

## License

MIT
