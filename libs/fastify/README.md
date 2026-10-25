# @nexusdi/fastify

[![npm](https://img.shields.io/npm/v/@nexusdi/fastify/next)](https://www.npmjs.com/package/@nexusdi/fastify)
[![license](https://img.shields.io/npm/l/@nexusdi/fastify)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Give every Fastify request its own NexusDI scope, disposed when the response is done.**

A request-scoped service needs a scope per request, disposed when the reply is finished or the client is gone. Fastify's `onResponse` hook fires on `finish` only, so a scope disposed there leaks when the client disconnects mid-reply.

## How the scope follows the request

`di.plugin` registers an `onRequest` hook that attaches a scope handle to the request. The first `di.inject` handler creates the scope and resolves its typed deps from it. The raw response's `close` event disposes it, once, for a finished reply and for an aborted one. Register `di.encapsulatedPlugin` instead to scope only one encapsulated context.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/fastify@next @nexusdi/core@next fastify
```

It works with `fastify` 5.0 or later, on Node 22.12 or later with TypeScript 5.4 or later.

## Quick Example

Each request gets its own flight log, so two requests never see each other's entries.

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/fastify';
import Fastify from 'fastify';

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

const bridge = Fastify();
await bridge.register(di.plugin);
bridge.get<{ Params: { to: string } }>(
  '/course/:to',
  di.inject({ log: FLIGHT_LOG }, ({ log }, req) => {
    log.record(`plotting ${req.params.to}`);
    return log.entries();
  }),
);

await bridge.inject({ url: '/course/Kepler-442b' });
const res = await bridge.inject({ url: '/course/Gliese-667' });
const entries = res.json(); // -> ['plotting Gliese-667']
await bridge.close();
await ship[Symbol.asyncDispose]();
```

## Documentation

- [Scope a Fastify request](https://nexus.js.org/next/fastify/)
- [Scopes and REQUEST](https://nexus.js.org/next/scopes/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.2/libs/fastify/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
