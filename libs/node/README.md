# @nexusdi/node

[![npm](https://img.shields.io/npm/v/@nexusdi/node/next)](https://www.npmjs.com/package/@nexusdi/node)
[![license](https://img.shields.io/npm/l/@nexusdi/node)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Eliminate manual scope passing by binding NexusDI scopes to the Node.js async context.**

Server environments require request-scoped dependencies: objects created when a request arrives and disposed when it settles. Manually passing these scope objects through every function in a call chain creates brittle, cluttered code.

`@nexusdi/node` solves this by leveraging `AsyncLocalStorage`. It tracks the active scope across asynchronous execution paths, allowing your application logic to retrieve the current scope without explicit parameters.

## Key Features

The library provides specialized infrastructure for Node.js environments:

- **Automatic Context Tracking:** `scopes.run()` binds a scope to the current async context.
- **Transparent Access:** `scopes.current()` retrieves the active scope anywhere in the execution path.
- **Single Process Instance:** One `nodeScopes()` instance serves every container in the process.
- **Platform Isolation:** This package contains all Node-specific logic to keep `@nexusdi/core` platform-agnostic.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/node@next @nexusdi/core@next
```

## Quick Example

The following example demonstrates how a deep function can access a scoped dependency without receiving the scope as an argument.

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

shuttle.get(SHIP_LOG).lines; // -> ['survey-7 launched']
scopes.current(); // -> undefined
```

In a server, return `await scopes.run(...)` from the handler, so `await using` keeps the scope open until the handler finishes. Declare the container with `const ship`: `await using` at the top level of a module disposes it as soon as the module finishes loading.

## Documentation

- [Scopes and REQUEST Guide](https://nexus.js.org/next/scopes/)
- [Scoping Node.js HTTP Requests](https://nexus.js.org/next/node-request-scopes/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/node/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
