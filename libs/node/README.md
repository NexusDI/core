# @nexusdi/node

[![npm](https://img.shields.io/npm/v/@nexusdi/node/next)](https://www.npmjs.com/package/@nexusdi/node)
[![license](https://img.shields.io/npm/l/@nexusdi/node)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Bind NexusDI scopes to the async context of Node.js requests.**

In a server environment, you often need "request-scoped" dependencies—objects that are created when a request arrives and destroyed when the response is sent.

`@nexusdi/node` provides the infrastructure to handle this without having to manually pass a scope object through every function in your call chain. It leverages Node's `AsyncLocalStorage` to make the current scope available anywhere in the asynchronous execution path.

## Core Features

- **Automatic Context Tracking:** Use `scopes.run()` to bind a scope to the current async context.
- **Transparent Access:** Retrieve the active scope anywhere using `scopes.current()`.
- **Lean Core:** This package contains all Node-specific logic, keeping `@nexusdi/core` platform-agnostic.

## Installation

```bash
npm install @nexusdi/node@next @nexusdi/core@next
```

## Quick Example

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';

interface IShipLog {
  readonly lines: string[];
}
class ShipLog implements IShipLog {
  readonly lines: string[] = [];
}
const SHIP_LOG = new Token<IShipLog>('ShipLog');
const scopes = nodeScopes();

// This function is called deep in the app logic, with no scope parameter.
async function record(line: string) {
  await Promise.resolve(); // Simulate async work
  scopes.current()?.get(SHIP_LOG).lines.push(line);
}

await using ship = await Nexus.create([
  provide(SHIP_LOG, { useClass: ShipLog, lifetime: 'scoped' }),
]);

await using shuttle = await ship.createScope();
await scopes.run(shuttle, () => record('survey-7 launched'));

console.log(shuttle.get(SHIP_LOG).lines); // -> ['survey-7 launched']
```

## Documentation

- [Scopes and REQUEST Guide](https://nexus.js.org/next/scopes/)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
