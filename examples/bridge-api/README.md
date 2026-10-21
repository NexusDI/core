# bridge-api

A server team that adopts NexusDI wants to see one module graph serve real HTTP routes, with a scope per request, before it picks a framework. This app is that demo: the Starship Meridian's bridge API, one graph behind Hono, Express, Fastify and Cloudflare Workers, tested the same way on each.

## What the Demo Shows

The graph lives in `src/ship/`, and each framework entry wires it to routes with that framework's adapter.

- `src/ship/meridian.ts` composes `Meridian` from `Tactical`, which downloads the star charts over a relay with an async factory, `BridgeApi`, which reads the request's mission into a scoped flight log, and `AuditTrail`. `OfflineMeridian` swaps in charts bundled from `charts.json`, with no I/O.
- `src/ship/plugins.ts` registers an audit interceptor on `NAV_CHARTS` that records each call in `AUDIT_LOG`, plus `errors()` and `devtools()` in development.
- `src/hono.ts`, `src/express.ts` and `src/fastify.ts` each export `createBridge(ship, options)`, which serves the same five routes through `@nexusdi/hono`, `@nexusdi/express` or `@nexusdi/fastify`:

| Route               | What it shows                                                           |
| ------------------- | ----------------------------------------------------------------------- |
| `GET /health`       | a route before the middleware, which creates no scope                   |
| `GET /course/:to`   | `inject` resolving the charts and the request's flight log              |
| `GET /mission`      | a service reading the request scope through `scopes.current()`          |
| `GET /log/stream`   | a scope that stays open while the body streams, and closes when it ends |
| any, after disposal | a 503 with an empty body once the container is disposed                 |

- `src/worker.ts` builds the container on the first request of each isolate (the function form of `nexus()`), because Workers refuse I/O at module scope.

## Running a Server

Each Node entry builds the container from the environment and listens on `PORT`, or 3000. Set `RELAY_URL` to download the charts from a relay; without it the server uses `OfflineMeridian`.

```sh
node --import tsx examples/bridge-api/src/server.hono.ts
node --import tsx examples/bridge-api/src/server.express.ts
node --import tsx examples/bridge-api/src/server.fastify.ts
```

The entries are TypeScript with parameter properties, so a loader such as `tsx` runs them. `SIGTERM` closes the server, and the container is disposed after it.

## Testing and Measuring

The app's checks run as Nx targets, each with the workspace packages built first.

- `npx nx test @nexusdi/bridge-api` runs the route tests over `@nexusdi/vitest` fixtures with fake charts, and a startup check that compiles both graphs.
- `npx nx run @nexusdi/bridge-api:e2e` starts each Node server against a local relay (`e2e/relay.ts`) and runs the cases of `e2e/cases.ts` on all three: 50 concurrent scopes, a stream, a client abort, a missing provider and a disposed container.
- `npx nx run @nexusdi/bridge-api:test-workers` checks that `worker-configuration.d.ts` matches `wrangler types`, then runs `test/worker/` inside workerd twice, with `wrangler.jsonc` (`enable_request_signal` on) and with `wrangler.no-signal.jsonc`.
- `npx nx run @nexusdi/bridge-api:runtime-leg --leg=deno` and `--leg=bun` bundle `test/runtime/smoke.ts` and run the e2e cases (`e2e/cases.ts`) on the Deno or Bun on PATH, which must be the version `examples/toolchain-matrix/toolchains.json` pins.
- `npx nx run @nexusdi/bridge-api:test-edge` bundles `test/edge/entry.ts` and runs it in `@edge-runtime/vm`, the VM of Vercel's Edge Runtime.
- `npx nx run @nexusdi/bridge-api:graph` draws the graph with `nexusdi graph` and fails when it differs from the committed `graph.json`.
- `npx nx run @nexusdi/bridge-api:bench` prints the warm figures of `bench/bridge.bench.ts` and the cold first `Nexus.create` of `bench/cold.mjs`. Nothing asserts them.

## Where the Docs Use It

No docs page cites a file of this app today. The adapter guides of the integrations plan (Task 25) cite regions of `examples/meridian/src/pages/`, which repeat these routes in a form one block can run. The plan gives this app two jobs for the docs (Task 26):

- `/runtimes/` reports the runtimes the adapter-runtimes legs run `src/worker.ts` and `src/hono.ts` on, and the figures `bench/` prints, with the machine and the date.
- `/edge/` describes the function form that `src/worker.ts` uses for a container whose factories do I/O.

Next, read [Scoping Hono Requests](https://nexus.js.org/next/hono/) for the adapter this app leads with.
