# @nexusdi/react-router

[![npm](https://img.shields.io/npm/v/@nexusdi/react-router/next)](https://www.npmjs.com/package/@nexusdi/react-router)
[![license](https://img.shields.io/npm/l/@nexusdi/react-router)](https://github.com/NexusDI/core/blob/main/LICENSE)

**Scope every React Router request with NexusDI, from middleware to loaders.**

A request-scoped service needs a scope per request, disposed when the response is done. React Router finishes the middleware chain before the server writes the body, and deferred data keeps streaming after it, so a scope disposed when the middleware returns is gone while a deferred value still reads it.

## How the scope follows the request

`di.middleware` in the root route's `middleware` export puts a scope handle on the router context. The first `di.inject` loader creates the scope, and loaders that run in parallel share it. The scope is disposed once, when the streamed body ends, errors or is cancelled, or when the request's signal aborts.

## Installation

> 0.4 is a release candidate on the npm `next` tag. Install every @nexusdi package from `next` so their versions match. Without `@next`, npm installs core 0.3 and stops with a peer conflict.

```bash
npm install @nexusdi/react-router@next @nexusdi/core@next react-router
```

It works with `react-router` 8, and with 7.9 or later when the `v8_middleware` future flag is on. It runs on Node 22.12 or later (22.22 for React Router 8) with TypeScript 5.4 or later.

## Quick Example

A loader resolves its typed deps from the request's scope, which the root middleware gives each request.

```ts @import.meta.vitest
import { Nexus, Token, provide } from '@nexusdi/core';
import { nexus } from '@nexusdi/react-router';
import { RouterContextProvider } from 'react-router';

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

// app/nexus.server.ts
const ship = await Nexus.create([
  provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
]);
const di = nexus(ship);
const middleware = [di.middleware]; // app/root.tsx exports this as middleware

// app/routes/course.tsx
interface LoaderArgs {
  params: { to: string };
  context: RouterContextProvider;
}
const loader = di.inject(
  { log: FLIGHT_LOG },
  ({ log }, { params }: LoaderArgs) => {
    log.record(`plotting ${params.to}`);
    return log.entries();
  },
);

// What React Router does for GET /course/Kepler-442b
const params = { to: 'Kepler-442b' };
const context = new RouterContextProvider();
const request = new Request('http://bridge/course/Kepler-442b');
const args = { request, url: new URL(request.url), pattern: '/course/:to' };
const res = await di.middleware({ ...args, params, context }, async () =>
  Response.json(await loader({ params, context })),
);
const entries = await res.json(); // -> ['plotting Kepler-442b']
await ship[Symbol.asyncDispose]();
```

## Documentation

- [React Router server rendering](https://nexus.js.org/next/react-router-ssr/)
- [Scopes and REQUEST](https://nexus.js.org/next/scopes/)
- [Documentation](https://nexus.js.org/next/)
- [Examples](https://github.com/NexusDI/core/tree/@nexusdi/core@0.4.0-rc.1/libs/react-router/docs)
- [NexusDI on GitHub](https://github.com/NexusDI/core)

## License

MIT
