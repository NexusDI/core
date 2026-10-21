# bridge-api

A server team that adopts NexusDI wants to see one module graph serve real HTTP routes, with a scope per request, before it picks a framework. This app is that demo: the Starship Meridian's bridge API, one graph behind Hono, Express, Fastify and Cloudflare Workers, tested the same way on each.

## What the Demo Shows

The graph lives in `src/ship/`, and each framework entry wires it to routes with that framework's adapter.

- `src/ship/meridian.ts` composes `Meridian` from `Tactical`, which downloads the star charts over a relay with an async factory, `BridgeApi`, which reads the request's mission into a scoped flight log, and `AuditTrail`. `OfflineMeridian` swaps in charts bundled from `charts.json`, with no I/O. Both also import the ship's simulation, `meridianSystems(setup.sim)` from `@nexusdi/meridian-systems`, and `SimDriver.forRoot({ mode: setup.mode })`.
- `src/ship/sim-driver.module.ts` binds `SIM_DRIVER` to `WallClockDriver`. In live mode the driver advances the loop one tick every `dt` seconds with `setInterval`, the one timer in the demo, and the container clears it when it disposes the ship. In manual mode it starts no timer, and `POST /sim/advance` moves the ship. `Meridian` and `OfflineMeridian` run manual, so a test or a Worker that builds them starts no timer.
- `src/ship/plugins.ts` registers an audit interceptor on `NAV_CHARTS` that records each call in `AUDIT_LOG`, plus `errors()` and `devtools({ annotate: [shipNotes] })` in development. `shipNotes` from `@nexusdi/meridian-systems` labels each simulation provider in the graph with its system, such as `system: Telemetry`.
- `src/hono.ts`, `src/express.ts` and `src/fastify.ts` each export `createBridge(ship, options)`, which serves the same eight routes through `@nexusdi/hono`, `@nexusdi/express` or `@nexusdi/fastify`:

| Route               | What it shows                                                                                                                                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`       | a route before the middleware, which creates no scope                                                                                                                                                                                                                                               |
| `GET /course/:to`   | `inject` resolving the charts and the request's flight log                                                                                                                                                                                                                                          |
| `GET /mission`      | a service reading the request scope through `scopes.current()`                                                                                                                                                                                                                                      |
| `GET /log/stream`   | a scope that stays open while the body streams, and closes when it ends                                                                                                                                                                                                                             |
| `GET /sim`          | `inject` resolving `SHIP_STATE` and `DECK_PLAN`: the `readShip` reading, the snapshot with each compartment's pressure, rounded to four significant digits                                                                                                                                          |
| `POST /sim/advance` | `{ "ticks": n }` advances a manual ship `n` ticks, 1 to 10000; a body without a whole `ticks` from 1 to 10000 answers 400 or, on Fastify, 415 for a content type it cannot parse; a body over 100 kB answers 413; a live ship answers 404; a 200 answers the `readShip` reading after the last tick |
| `GET /telemetry`    | `inject` resolving `TELEMETRY`: server-sent events, an `event: snapshot` with the reading at once and after each tick, then one `event: offline` with `ship offline` when the ship is disposed, and the end of the body                                                                             |
| `GET /graph`        | a route outside the middleware, as `/health` is: the annotated `graph(ship)` as JSON when the entry passes the `graph` option, and 404 without it                                                                                                                                                   |
| any, after disposal | a 503 with an empty body once the container is disposed                                                                                                                                                                                                                                             |

- `src/worker.ts` builds the container on the first request of each isolate (the function form of `nexus()`), because Workers refuse I/O at module scope. It passes no `graph` option, so `GET /graph` answers 404 on a Worker.

The telemetry stream holds only the latest frame the client has not read, and sends it when the client reads. So a `POST /sim/advance` of 600 ticks queues one frame per open stream, and a slow client skips the frames between its reads. The stream sends no heartbeat. A client that disconnects cancels the stream, and the cancel unsubscribes it from the feed. Express and Fastify send the stream through `telemetryReadable` (`src/bridge/telemetry-readable.ts`), a Node `Readable` with a high-water mark of 0, so the `Readable` reads no frame ahead of the client.

The bridge console in `examples/bridge-console`, the Meridian's React Router app, calls the Hono entry. The Express and Fastify entries run every case of `e2e/cases.ts` except one Hono-only check of the execution context, so each framework serves the same graph with the same results.

## Running a Server

Each Node entry builds the container from the environment and listens on `PORT`, or 3000. Set `RELAY_URL` to download the charts from a relay; without it the server uses `OfflineMeridian`.

Two more variables set up the simulation, and a tick is always 0.5 ship seconds. `SIM_MODE` is `live`, the default, or `manual`. `SIM_SEED` is a whole number from 0 to 4294967295, and defaults to 7. An empty variable counts as unset, and any other value stops the server with an error that names the variable and the values it takes.

```sh
npx nx dev @nexusdi/bridge-api
npx nx run @nexusdi/bridge-api:build-deps
npx tsx examples/bridge-api/src/server.express.ts
npx tsx examples/bridge-api/src/server.fastify.ts
```

`nx dev` builds the workspace packages and runs `tsx watch src/server.hono.ts`, the app's `dev` script. The Express and Fastify entries read the same built packages, so `build-deps` builds them first. Each entry prints `Server is running on http://localhost:3000` once it listens.

A manual ship moves only when a client asks it to:

```sh
SIM_MODE=manual npx nx dev @nexusdi/bridge-api
curl -X POST http://localhost:3000/sim/advance -H 'content-type: application/json' -d '{ "ticks": 600 }'
curl http://localhost:3000/sim
curl -N http://localhost:3000/telemetry
```

Each Node entry passes `graph: () => graph(ship)` unless `NODE_ENV` is `production` (`isDev` in `src/ship-from-env.ts`), so `GET /graph` answers 404 in production.

The sources use parameter properties and extensionless imports, which plain `node` refuses, so `tsx` runs them.

Each Node entry stops on `SIGTERM` through `stopOnSigterm(server, shutdown, { close?, drain?, signals? })` from `src/ship-from-env.ts`. On the signal, it closes the server (`server.close()` by default, `bridge.close()` on Fastify), then aborts `shutdown`, the `AbortController` whose signal the entry passes to `createBridge` as `shutdown`. The abort ends every open telemetry stream with `event: offline` and `ship offline`. The server answers the requests in flight before it closes, and the ship disposes after that: Express and Hono through `await using` once the server emits `close`, Fastify in its `onClose` hook. After the signal, each response that finishes calls `server.closeIdleConnections()`, so a keep-alive connection closes once its response ends, and the process exits without waiting for a keep-alive timeout. After `drain` milliseconds (10 000 by default), `server.closeAllConnections()` ends the connections still open. A throw or a rejection from `close` goes to the console and sets exit code 1. Fastify listens on `::`, or on `HOST` when it is set, since on `localhost` it opens one server for 127.0.0.1 and one for ::1.

## Testing and Measuring

The app's checks run as Nx targets, each with the workspace packages built first.

- `npx nx test @nexusdi/bridge-api` runs the route tests over `@nexusdi/vitest` fixtures with fake charts, and a startup check that compiles both graphs. `test/check.test.ts` also compares the graph `inspect()` draws with the committed `graph.json`, so `main`'s test run and the release verify step catch a stale file. The driver, `setupFromEnv`, `parseTicks` and the two simulation routes on each framework have their own cases.
- `npx nx run @nexusdi/bridge-api:e2e` starts each Node server against a local relay (`e2e/relay.ts`) and runs the cases of `e2e/cases.ts` on all three: 50 concurrent scopes, a stream, a client abort, a missing provider and a disposed container. `e2e/entries.e2e.ts` starts each entry file on a free port with `SIM_MODE=manual` and `SIM_SEED=7`, reads the URL it prints, requests `/health` and expects exit code 0 after `SIGTERM`.
- `npx nx run @nexusdi/bridge-api:e2e-growth` runs the growth cases, one command after the other:

  ```sh
  vitest run --config vitest.e2e-growth.config.ts
  vitest run --config vitest.workers-growth.config.ts
  node scripts/runtime-leg.mjs --leg=deno --entry=test/runtime/growth.ts
  node scripts/runtime-leg.mjs --leg=bun --entry=test/runtime/growth.ts
  ```

  The first runs `e2e/growth/` on all three servers. A manual ship advanced 600 ticks reads 300 ship seconds and a habitat at 293 K, and a tick count of 0, 1.5 or 10001 answers 400. A live ship answers 404 on `/sim/advance` and leaves no timer after disposal. `GET /telemetry` sends tick 0 at once and reaches tick 3 after an advance of 3, a client abort unsubscribes from the feed, and a disposed ship sends `ship offline` and ends the body. One case starts `src/server.hono.ts` with `SIM_MODE=manual` and `SIM_SEED=7` and advances it over HTTP, and one per entry opens `/telemetry`, sends `SIGTERM`, reads `event: offline` and expects exit code 0 within 1.5 seconds.

  The other three run the cases of `test/runtime/growth-cases.ts` on workerd (`test/worker/growth/`), Deno and Bun: `GET /sim` at tick 0, an advance of 600 ticks to 293 K and 101.3 kPa, and a first telemetry frame at tick 0 before the client cancels. The Deno and Bun legs need Deno 2.9.6 and Bun 1.4.2, the versions `examples/toolchain-matrix/toolchains.json` pins, first on `PATH`. The edge runtime has no growth leg.

  The `e2e` target excludes `e2e/growth/`, the `test-workers` target excludes `test/worker/growth/`, and only the non-required `demo-growth` CI job runs `e2e-growth` (ship systems spec, section 14). That job installs the pinned Deno and Bun. A case joins `e2e` with a `git mv` out of `e2e/growth/`.

- `npx nx run @nexusdi/bridge-api:test-workers` checks that `worker-configuration.d.ts` matches `wrangler types`, then runs `test/worker/` inside workerd twice, with `wrangler.jsonc` (`enable_request_signal` on) and with `wrangler.no-signal.jsonc`.
- `npx nx run @nexusdi/bridge-api:runtime-leg --leg=deno` and `--leg=bun` bundle `test/runtime/smoke.ts` and run the e2e cases (`e2e/cases.ts`) on the Deno or Bun on PATH, which must be the version `examples/toolchain-matrix/toolchains.json` pins.
- `npx nx run @nexusdi/bridge-api:test-edge` bundles `test/edge/entry.ts` and runs it in `@edge-runtime/vm`, the VM of Vercel's Edge Runtime.
- `npx nx run @nexusdi/bridge-api:graph` draws the graph with `nexusdi graph` and fails when it differs from the committed `graph.json`.
- `npx nx run @nexusdi/bridge-api:bench` prints the warm figures of `bench/bridge.bench.ts` and the cold first `Nexus.create` of `bench/cold.mjs`. Nothing asserts them.

## Where the Docs Use It

Five docs pages link this folder as the full app behind their examples, and two more report or reprint its code. The Hono, Express and Fastify pages cite regions of `examples/meridian/src/pages/`, which repeat these routes in a form one block can run.

- [Scoping Hono Requests](https://nexus.js.org/next/hono/), [Scoping Express Requests](https://nexus.js.org/next/express/) and [Scoping Fastify Requests](https://nexus.js.org/next/fastify/) point to `src/server.hono.ts`, `src/server.express.ts` and `src/server.fastify.ts`: one graph behind three frameworks.
- [How do I get a container in every Vitest test?](https://nexus.js.org/next/vitest/) points to `test/fixtures.ts` and `test/routes.test.ts`, which run the route tests on `nexusTest` fixtures.
- [Visualizing Your Dependency Graph](https://nexus.js.org/next/graph-cli/) points to the `graph` target, which fails when the drawn graph differs from `graph.json`.
- [Where NexusDI Runs](https://nexus.js.org/next/runtimes/) reports the workerd, Deno, Bun and Edge Runtime legs that run this app's Worker entry and e2e cases.
- [Running on Edge Runtimes](https://nexus.js.org/next/edge/) shows this app's `wrangler.jsonc` and the function form `src/worker.ts` uses for a container whose factories do I/O.

Next, read [Scoping Hono Requests](https://nexus.js.org/next/hono/) for the adapter this app leads with.
