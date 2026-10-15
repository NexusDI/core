# @nexusdi/express

[![npm](https://img.shields.io/npm/v/@nexusdi/express/next)](https://www.npmjs.com/package/@nexusdi/express)
[![license](https://img.shields.io/npm/l/@nexusdi/express)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Give every Express request its own NexusDI scope, disposed when the response is done.**

A request-scoped service needs a scope per request, created when a handler first needs it and disposed when the response is finished or the client is gone. Express runs no middleware after the response, and a client that aborts emits `close` and never `finish`, so a scope disposed on `finish` leaks on every aborted request.

## How the scope follows the request

`di.middleware` attaches a scope handle to the request. The first `di.inject` handler creates the scope and resolves its typed deps from it. The response's `close` event disposes it, once, whether the body finished or the client left. A request that resolves nothing creates no scope.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/express@next @nexusdi/core@next express
```

It works with `express` 5.0 or later, on Node 22.12 or later with TypeScript 5.4 or later.

## Quick Example

Each request gets its own flight log, so two requests never see each other's entries.

```ts @import.meta.vitest
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { Nexus, Token, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/express';
import express from 'express';

interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
class ShuttleFlightLog implements IFlightLog {
  readonly #entries: string[] = [];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');

const ship = await Nexus.create([
  provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
]);
const di = nexus(ship);

const bridge = express()
  .use(di.middleware)
  .get(
    '/course/:to',
    di.inject({ log: FLIGHT_LOG }, ({ log }, req, res) => {
      log.record(`plotting ${req.params.to}`);
      res.json(log.entries());
    }),
  );

const server = bridge.listen(0);
await once(server, 'listening');
const { port } = server.address() as AddressInfo;
await fetch(`http://127.0.0.1:${port}/course/Kepler-442b`);
const res = await fetch(`http://127.0.0.1:${port}/course/Gliese-667`);
const entries = await res.json(); // -> ['plotting Gliese-667']
server.close();
await ship[Symbol.asyncDispose]();
```

## Documentation

- [Scopes and REQUEST](https://nexus.js.org/next/scopes/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/express/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
