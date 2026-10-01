# @nexusdi/node

[![npm](https://img.shields.io/npm/v/@nexusdi/node/next)](https://www.npmjs.com/package/@nexusdi/node)
[![license](https://img.shields.io/npm/l/@nexusdi/node)](https://github.com/NexusDI/core/blob/main/LICENSE)

Find the current request's NexusDI scope anywhere in a Node call chain, through AsyncLocalStorage.

`nodeScopes()` binds a [NexusDI](https://www.npmjs.com/package/@nexusdi/core) scope to the async context of a request. A logger or a repository deep in the call chain finds the request's scope with no extra parameter.

- `run(scope, fn)` makes `scope` current for everything `fn` awaits.
- `current()` returns that scope, or `undefined` outside a run.
- One `nodeScopes()` serves every container in the process.
- Core imports no `node:` module; this package holds the Node-only part.

## Install

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/node@next @nexusdi/core@next
```

## Usage

<!-- #region current-scope -->

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

// Deep in the call chain, with no scope parameter.
async function record(line: string) {
  await Promise.resolve();
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

<!-- #endregion current-scope -->

## Documentation

- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/release/0.4/libs/node/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
