# @nexusdi/hono

[![npm](https://img.shields.io/npm/v/@nexusdi/hono/next)](https://www.npmjs.com/package/@nexusdi/hono)
[![license](https://img.shields.io/npm/l/@nexusdi/hono)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Scope every Hono request with NexusDI, on Node, Workers, Deno and Bun.**

A request-scoped service needs a scope per request, disposed when the response is done. A Hono handler that streams keeps writing after `next()` returns, so a scope disposed there is gone while the stream still reads it, and a scope disposed when the stream ends leaks when the client aborts.

## How the scope follows the request

`di.middleware` gives each request a scope handle. The first `di.inject` handler creates the scope and resolves its typed deps from it. The scope is disposed once, when the response body ends, errors or is cancelled, or when the request's signal aborts. On Workers the disposal goes to `executionCtx.waitUntil`, so the isolate stays up until it finishes.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/hono@next @nexusdi/core@next hono
```

It needs `hono` 4.3.3 or later and Node 22.12 or later.

## Quick Example

Each request gets its own flight log, so two requests never see each other's entries.

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { Hono } from 'hono';

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

const bridge = new Hono().use(di.middleware).get(
  '/course/:to',
  di.inject({ log: FLIGHT_LOG }, ({ log }, c) => {
    log.record(`plotting ${c.req.param('to') ?? ''}`);
    return c.json(log.entries());
  }),
);

await bridge.request('/course/Kepler-442b');
const res = await bridge.request('/course/Gliese-667');
const entries = await res.json(); // -> ['plotting Gliese-667']
await ship[Symbol.asyncDispose]();
```

## Documentation

- [Scopes and REQUEST](https://nexus.js.org/next/scopes/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/hono/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
