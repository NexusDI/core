# Meridian G0b, telemetry and diagnostics: Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Ledger: `.superpowers/sdd/meridian-g0b/progress.md` in the main checkout.

Goal: the running ship streams telemetry and shows its wiring. The library gains tick listeners and a `Telemetry` module. `bridge-api` serves `GET /telemetry` (SSE) and `GET /graph` with `shipNotes` on Hono, Express and Fastify, and shuts down cleanly with a stream open. The bridge console gains `BRIDGE_LINK.snapshot()`, `telemetry()` and `graph()`, a status strip in a ship layout, and `/diagnostics`. Gating bundle greps keep the simulation out of every frontend build, and a `/sim` and `/telemetry` smoke case runs on workerd, Deno and Bun in the non-required `demo-growth` job.

Architecture: one pull request, `feat/meridian-g0b-telemetry`, cut from `origin/release/0.4` at `3a9e8074` (G0, #174, merged). The library stays pure: `SnapshotFeed` has no timer and no I/O. Streaming, SSE framing and shutdown live in `bridge-api`.

Tech stack: Node from `.nvmrc` (24.20.0), TypeScript 6.0.3, Vitest 5.0.5, Nx 23.3.0, Hono 4.13.13, Express 5.3.0, Fastify 5.12.7, React Router 8.4.0, Playwright 1.64, Deno 2.9.6, Bun 1.4.2.

Spec: `specs/2026-10-21-meridian-ship-systems-design.md` (§ below). G0 plan: `specs/plans/2026-10-21-meridian-g0-kernel.md`. Also the `nexusdi-ways-of-working` skill.

## Owner rulings

1. The growth track never blocks a release. Its e2e runs in `e2e-growth` targets, which only the non-required `demo-growth` job runs.
2. Its deterministic unit tests, `bridge-api`'s graph check and the purity checks run in `main` and the release verify step.
3. Growth systems finished before 0.4.0 ship with it.
4. The demo stays readable as a DI example.

## Rulings this plan carries

The architect proposed and the tech lead decided these on 2026-10-21. Task 12 writes them into the spec.

1. Tick listeners. `contracts.ts` gains `type TickListener = (ship: ShipSnapshot) => void`, and `ITickLoop` gains `listen(listener: TickListener): () => void`, whose returned function unsubscribes and is idempotent. `FixedStepLoop` keeps a `Set` of entry objects, so one function listened twice counts twice. Per tick: the systems step, the clock advances, the snapshot commits, then the listeners run. Dispatch walks a copy, skips an entry removed mid-dispatch, and an entry added mid-dispatch hears the next tick. `src/simulation/call-all.ts` exports `callAll(fns, arg)`: it calls every function, then throws the one error, or an `AggregateError` when two or more threw. The tick stays committed and `advance()` stops after it. The `listen` docblock says a listener must not call `advance()`; no guard.
2. Telemetry. `src/telemetry/contracts.ts` holds `TelemetrySink { next(frame: ShipSnapshot): void; close(reason: string): void }`, `ITelemetryFeed { subscribe(sink: TelemetrySink): () => void }` and `TELEMETRY = new Token<ITelemetryFeed>('TelemetryFeed')`. `subscribe` sends the current rounded snapshot at once, then one per tick; its unsubscribe is idempotent and never calls `close`. `src/telemetry/telemetry.module.ts` defines `Telemetry` with `provide(TELEMETRY, { useClass: SnapshotFeed })` and exports `TELEMETRY`. `SnapshotFeed.deps = [TICK_LOOP, SHIP_STATE]` (spec amendment). `onInit` calls `loop.listen`; each tick it rounds the snapshot once, only while a sink is open, and passes that frame to every sink through `callAll`. `[Symbol.dispose]` unsubscribes from the loop and calls `close('ship offline')` on each open sink. A subscribe after dispose gets `close('ship offline')` at once and a no-op unsubscribe. The docblock says that under `onInit: false` the feed never listens. `meridianSystems()` imports `[Simulation.forRoot(options), Telemetry]` and exports `[TICK_LOOP, TELEMETRY]`. `test/ship-under-test.ts` imports `Telemetry`.
3. `GET /telemetry`. `examples/bridge-api/src/bridge/telemetry-stream.ts` exports `SSE_HEADERS = { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform' }` and `telemetryStream(feed: ITelemetryFeed): ReadableStream<Uint8Array>`. Frames: `event: snapshot\ndata: <json>\n\n`, and `event: offline\ndata: <reason>\n\n` followed by the end of the stream. The stream holds only the latest unsent frame and enqueues it on `pull`, so `POST /sim/advance` of 600 ticks never queues 600 frames per client. `cancel()` unsubscribes, and the stream never enqueues after cancel or close. `contracts.ts` exports `type TelemetryEvent = 'snapshot' | 'offline'`. Routes take `di.inject({ feed: TELEMETRY }, ...)`: Hono `c.body(stream, 200, SSE_HEADERS)`; Express `res.writeHead(200, SSE_HEADERS)` and `pipeline(Readable.fromWeb(stream), res, () => {})`; Fastify `reply.headers(SSE_HEADERS).send(Readable.fromWeb(stream))`. No heartbeat. `src/ship-from-env.ts` exports `stopOnSigterm(close: () => unknown, ship: AsyncDisposable): void`: on SIGTERM it calls `close()`, then awaits `ship[Symbol.asyncDispose]()`, whose feed closes every stream so the server can close. All three Node entries use it.
4. `GET /graph` and `shipNotes`. `examples/meridian-systems/src/notes.ts` exports `shipNotes(view: BlueprintView): readonly { provider: string; label: string }[]` with no import from `@nexusdi/devtools`. It finds the module that binds `TICK_LOOP` as the root sees it (`view.visible(view.root, view.canonical(TICK_LOOP))`), walks that module's imports transitively, and labels each provider there `system: <module name>`. The `phase: <n>` label, a static `phase` on physics classes and `ShipSystemClass` wait for G1. `bridgePlugins({ dev })` uses `devtools({ annotate: [shipNotes] })`. `BridgeOptions` gains `graph?: () => NexusGraph`; `GET /graph` answers its JSON, or 404 when the option is absent, on all three frameworks. `ship-from-env.ts` exports `isDev(env)`, which `shipFromEnv` uses too; the Node entries pass `graph: isDev(process.env) ? () => graph(ship) : undefined`, and the Worker entries pass nothing. `graph.json` keeps `notes: []` and gains `Telemetry` and `SnapshotFeed`.
5. The console. `IBridgeLink` gains `snapshot(): Promise<ShipSnapshot>` (`GET /sim`), `telemetry(): Promise<ReadableStream<Uint8Array>>` (the `GET /telemetry` body, with the request's `signal`, as `course()` does) and `graph(): Promise<NexusGraph | null>` (`GET /graph`, null on 404). Types come by `import type` only; `@nexusdi/meridian-systems` and `@nexusdi/devtools` join the console's devDependencies. `fakeBridgeLink` gains the three methods. `app/routes/telemetry.ts` is a top-level resource route that returns `new Response(await link.telemetry(), { headers })` with the SSE headers (`no-transform`, since react-router-serve's `compression()` buffers the stream otherwise), or 503 when the backend fails. `app/routes/ship-layout.tsx` is a nested layout around `/diagnostics` (and `/systems/*` from G1); its loader returns `snapshot()` or null on failure, with `shouldRevalidate: () => false`. The root layout stays unchanged, so the gating console e2e opens no EventSource. `StatusStrip` renders the loader's snapshot (tick, ship time, habitat temperature and pressure) or `Telemetry offline`, and in `useEffect` subscribes through `useService(TELEMETRY_CLIENT)` and unsubscribes on unmount. `app/bridge/telemetry-client.ts` holds `ITelemetryClient { subscribe(next: (ship: ShipSnapshot) => void, offline: (reason: string) => void): () => void }`, `TELEMETRY_CLIENT = new Token<ITelemetryClient>('TelemetryClient')`, the class `EventSourceTelemetry`, which opens `new EventSource('/telemetry')` in `subscribe` only and closes it on `offline` or `error` (no reconnect), and the module `TelemetryClient`, which both `BridgeClient` and `BridgeConsole` import, since SSR resolves `useService` from the server graph. `/diagnostics` groups the providers by owning module, prints each one's notes verbatim, and shows `Diagnostics are off on this bridge` for null.
6. The console's growth e2e. `playwright.servers.mts` exports `webServers(ports: { console: number; api: number })`, used by both configs. The gating `playwright.config.mts` keeps 4210/4211 and adds `testIgnore: ['growth/**']`. `playwright.e2e-growth.config.mts` has `testDir: './e2e/growth'` and ports 4220/4221. The `e2e-growth` target is `nx:run-commands`, `dependsOn: ["build", "^build"]`, `cwd: examples/bridge-console`, command `playwright test --config playwright.e2e-growth.config.mts`.
7. The runtime smoke. `bridge-api`'s `e2e-growth` target runs, with `parallel: false` and `dependsOn: ["^build"]`: `vitest run --config vitest.e2e-growth.config.ts`, `vitest run --config vitest.workers-growth.config.ts` (includes `test/worker/growth/**`, which the gating workers config excludes), `node scripts/runtime-leg.mjs --leg=deno --entry=test/runtime/growth.ts` and the same with `--leg=bun`. `runtime-leg.mjs` gains `--entry`, defaulting to `test/runtime/smoke.ts`. No edge leg. One case set in `test/runtime/growth-cases.ts` serves workerd, Deno and Bun: `GET /sim` at tick 0 with four compartments of moles and temperature; `POST /sim/advance` of 600 ticks gives tick 600, time 300 and habitat temperature 293; `GET /telemetry` gives a first `snapshot` frame at tick 0, then the client cancels. `ci.yml`'s `demo-growth` adds `denoland/setup-deno` and `oven-sh/setup-bun` with the SHA pins and versions `adapter-runtimes` uses, and its timeout goes to 20 minutes. The repo-checks hold demo-growth's pins to `toolchains.json`. The required `adapter-runtimes` job does not change.
8. The bundle check. The sentinels are `[TICK_LOOP, SHIP_STATE, SIM_CLOCK, RNG, DECK_PLAN, TELEMETRY].map(String)`, imported from `@nexusdi/meridian-systems` in the test. A minifier renames function names, so `stepAtmosphere` never serves as a sentinel. The console's case sits in the gating `e2e/fresh-server.spec.ts` over `build/client/assets/*.js`. The stations' case is a new gating `examples/federation-shell/e2e/bundle.spec.ts` over the dists the shell's e2e target already builds. A file grep of a built bundle is a deterministic purity check under owner ruling 2, so it gates.

## Global Constraints

- Worktree `.claude/worktrees/meridian-g0b`. Prefix every nx command and every `git commit` and `git push` with `NX_NO_CLOUD=true NX_DAEMON=false`.
- The branch stays under 100 commits. A task is one to four commits.
- Never `--no-verify`, never a bare `git stash`, never a merge commit.
- Commit messages follow conventional commits with a scope from `commitlint.config.js` (`meridian-systems`, `bridge-api`, `bridge-console`, `federation-shell`, `repo`, `specs`), a lowercase subject with no `@`, and the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Prose in READMEs, comments and commits follows the writing rules of `nexusdi-ways-of-working`.
- Every token is interface-first: an interface, a `Token<IFoo>` named for the role, and a class bound with `useClass`. Consumers declare tokens in `static deps = [...] as const`.
- No file under `examples/meridian-systems/src` reads the wall clock, a timer or an unseeded random source, and it imports relative paths and `@nexusdi/core` alone. `npx nx lint @nexusdi/meridian-systems` enforces it.
- A `*.module.ts` file holds tokens, providers and at most one small delegation, and stays under 120 lines.
- The gating suites (`test`, `e2e`, `test-workers`, `runtime-leg`, `test-edge`) keep passing unchanged except where a task names the change.
- Helpers and scratch files go under the session scratchpad's `meridian-g0b/` only. The pinned Deno 2.9.6 and Bun 1.4.2 sit in `<scratchpad>/meridian-g0b/bin`; put it first on `PATH` to run the Deno and Bun legs.

### Heavy work

A heavy job is `npm ci`, a build of more than one project, any `e2e` or `e2e-growth` target, `nx run-many`, or `npm run size`. On weekdays from 09:00 to 17:00 one heavy job runs at a time on the machine: take the lock with `until mkdir /tmp/nexusdi-heavy.lock 2>/dev/null; do sleep 20; done`, set `trap 'rmdir /tmp/nexusdi-heavy.lock' EXIT`, and release it after the job. Outside those hours, skip the lock. Every nx command takes `--parallel=2`.

### Cleanup

Every task ends with this step before its review gate:

```sh
setopt null_glob 2>/dev/null; rm -rf libs/*/dist libs/*/test-output examples/*/dist examples/*/build \
  examples/*/test-output examples/*/out-tsc examples/bridge-api/tmp tmp
```

### Review gate

Each task ends with a review by a fresh opus reviewer that did not write the task. The reviewer reads the task's diff against this plan and the spec, runs the task's test command, checks the readability rule (a reader who opens a module file sees tokens, providers and imports first), and reports findings. The implementer fixes them in new commits. The gate passes when the reviewer reports no finding. The branch ends with a final review by an independent opus reviewer.

## Tasks

| Task | What                                                               | Commits |
| ---- | ------------------------------------------------------------------ | ------- |
| 0    | this plan                                                          | 1       |
| 1    | tick listeners and `callAll`                                       | 1       |
| 2    | the `Telemetry` module and `SnapshotFeed`                          | 1 to 2  |
| 3    | `shipNotes`                                                        | 1       |
| 4    | `telemetryStream` and `GET /telemetry` on three frameworks         | 2       |
| 5    | `isDev`, `stopOnSigterm`, `GET /graph`, the annotated devtools     | 2 to 3  |
| 6    | `bridge-api`'s telemetry growth cases                              | 1       |
| 7    | the workerd, Deno and Bun growth smoke and the demo-growth job     | 2 to 3  |
| 8    | `BRIDGE_LINK`'s new methods and the `TelemetryClient` module       | 2       |
| 9    | the ship layout, the status strip, `/telemetry` and `/diagnostics` | 2 to 3  |
| 10   | the console's `e2e-growth` target                                  | 1 to 2  |
| 11   | the bundle checks                                                  | 2       |
| 12   | READMEs, fallow entries and the spec amendments                    | 2 to 3  |
| 13   | the full gate, the final review and the PR                         | 0       |

---

### Task 0: the plan

- [ ] Commit this file: `docs(specs): plan the meridian g0b telemetry increment`.

### Task 1: tick listeners

Files:

- Modify: `examples/meridian-systems/src/simulation/contracts.ts`, `src/simulation/fixed-step-loop.ts`
- Create: `src/simulation/call-all.ts`
- Test: `src/simulation/call-all.test.ts`, `src/simulation/fixed-step-loop.test.ts`

- [ ] Step 1: write the failing tests.
  - `call-all.test.ts`: `callAll` calls every function with the argument in order; no error returns; one throw rethrows that error object after the rest ran; two throws give an `AggregateError` whose `errors` hold both in call order.
  - `fixed-step-loop.test.ts` gains: a listener hears each committed snapshot after the systems ran (its `tick` matches the store's); two listeners hear in subscription order; one function listened twice hears twice; the unsubscribe is idempotent and stops delivery; a listener that removes a later one mid-dispatch keeps it from hearing that tick; a listener added mid-dispatch first hears the next tick; a throwing listener lets the others run, the tick stays committed (`state.snapshot().tick` is the tick) and `advance(3)` throws after tick 1; two throwing listeners give an `AggregateError`.
  - Run `npx nx test @nexusdi/meridian-systems` and see them fail.
- [ ] Step 2: add `TickListener` and `listen` to `contracts.ts` with docblocks (the listener must not call `advance()`), write `call-all.ts`, and wire `listen` into `FixedStepLoop.advance` after the commit. Run `npx nx test @nexusdi/meridian-systems`, `npx nx lint @nexusdi/meridian-systems` and `npx nx typecheck @nexusdi/meridian-systems`.
- [ ] Step 3: commit `feat(meridian-systems): call tick listeners after each committed tick`.
- [ ] Step 4: cleanup, then the review gate.

### Task 2: the `Telemetry` module

Files:

- Create: `examples/meridian-systems/src/telemetry/contracts.ts`, `src/telemetry/snapshot-feed.ts`, `src/telemetry/telemetry.module.ts`
- Modify: `src/meridian-systems.module.ts`, `src/index.ts`, `test/ship-under-test.ts`
- Test: `src/telemetry/snapshot-feed.test.ts`, `test/telemetry.test.ts`, `test/simulation.test.ts`

- [ ] Step 1: write the failing tests.
  - `snapshot-feed.test.ts`, on a fake loop (records the listener, returns an unsubscribe spy) and a fake state: `onInit` listens once; `subscribe` sends `roundSnapshot` of the current snapshot at once; a tick sends one frame to each open sink, the same object to both; no sink open means no rounding (spy on a counter through a fake state whose snapshot getter counts, or assert the listener returns without work); the unsubscribe is idempotent and calls no `close`; dispose unsubscribes from the loop and calls `close('ship offline')` once per open sink and none on an unsubscribed one; a subscribe after dispose gets `close('ship offline')` at once; a throwing sink lets the other sinks hear the frame.
  - `test/telemetry.test.ts` on the fixture: a sink subscribed before `advance(2)` reads frames at ticks 0, 1 and 2, rounded; `nexus.get(TELEMETRY)` is one singleton; disposing the container closes the sink with `ship offline` (build a second container with `Nexus.create(meridianSystems(...))` for the dispose case).
  - `test/simulation.test.ts`: `Nexus.check(meridianSystems(...))` still passes, and the aggregate exports `TELEMETRY` (a root that imports `meridianSystems(...)` resolves it).
  - See them fail.
- [ ] Step 2: write the contracts, `SnapshotFeed` (one class, `implements ITelemetryFeed, Disposable`, `static deps = [TICK_LOOP, SHIP_STATE] as const`) and the module. The module file holds the `defineModule` call alone. Add `Telemetry` to the aggregate's imports and `TELEMETRY` to its exports, and to `ShipUnderTest`'s imports. `src/index.ts` adds `export * from './telemetry/contracts'` and no class.
- [ ] Step 3: run the library's `test`, `lint` and `typecheck`. Commit `feat(meridian-systems): stream rounded snapshots through a telemetry feed`.
- [ ] Step 4: cleanup, then the review gate.

### Task 3: `shipNotes`

Files:

- Create: `examples/meridian-systems/src/notes.ts`
- Modify: `src/index.ts`, `package.json` (devDependency `@nexusdi/devtools: "*"`), `tsconfig.spec.json` (reference `libs/devtools/tsconfig.lib.json`)
- Test: `test/notes.test.ts`

- [ ] Step 1: write the failing test. `inspect(root, { annotate: [shipNotes] })` from `@nexusdi/devtools` over a root that imports `meridianSystems({ seed: 7, dt: 0.5 })` beside a module of its own (`Bridge`, one provider): every provider of `MeridianSystems`, `Simulation` and `Telemetry` carries exactly one note, `system: <its module's name>`; the root's own module carries none. A second case on `ShipUnderTest`: the probe providers of `ProbeSystems` carry `system: ProbeSystems`, since the walk starts at the module that binds `TICK_LOOP`. A third: a root with no `TICK_LOOP` gives no note. See it fail.
- [ ] Step 2: write `notes.ts` against `BlueprintView` from `@nexusdi/core`, with a docblock that names the walk and says the shape matches devtools' `GraphAnnotator`. Export `shipNotes` from `src/index.ts`. Run `npm install` if the lockfile needs the new devDependency entry (heavy), then the library's `test`, `lint` and `typecheck`.
- [ ] Step 3: commit `feat(meridian-systems): label each simulation provider with its system`.
- [ ] Step 4: cleanup, then the review gate.

### Task 4: `GET /telemetry`

Files:

- Create: `examples/bridge-api/src/bridge/telemetry-stream.ts`
- Modify: `src/ship/contracts.ts` (`TelemetryEvent`), `src/hono.ts`, `src/express.ts`, `src/fastify.ts`
- Test: `test/telemetry-stream.test.ts`, `test/routes.test.ts`

- [ ] Step 1: write the failing tests.
  - `telemetry-stream.test.ts` on a fake feed that records sinks: the first read yields `event: snapshot\ndata: <json of the frame>\n\n`; frames sent while nobody reads conflate to the latest one; `close('ship offline')` yields `event: offline\ndata: ship offline\n\n` and then `done`; `cancel()` calls the unsubscribe once; a frame after cancel or close neither throws nor enqueues. `SSE_HEADERS` holds the two headers. The event names in the frames are typed against `TelemetryEvent`.
  - `routes.test.ts` gains one Hono in-process case: `honoBridge(nexus).request('/telemetry')` answers 200 with `text/event-stream` and `no-transform`; the first frame reads tick 0; after `nexus.get(SIM_DRIVER).advance(1)` the next reads tick 1; cancelling the body leaves the feed with no sink (subscribe a counting double through the fixture's `test.override` or a separate `Nexus.create` with `override(TELEMETRY, { useValue })` from `@nexusdi/testing`).
  - See them fail.
- [ ] Step 2: write `telemetry-stream.ts` (a docblock of two sentences on why the stream keeps one frame) and the three routes as ruling 3 gives them. Run `npx nx test @nexusdi/bridge-api` and `npx nx typecheck @nexusdi/bridge-api`.
- [ ] Step 3: commits `feat(bridge-api): frame the telemetry feed as server-sent events` and `feat(bridge-api): serve the telemetry stream on the three frameworks`.
- [ ] Step 4: cleanup, then the review gate.

### Task 5: `isDev`, `stopOnSigterm`, `GET /graph`

Files:

- Modify: `examples/bridge-api/src/ship-from-env.ts`, `src/ship/plugins.ts`, `src/hono.ts` (`BridgeOptions.graph`), `src/express.ts`, `src/fastify.ts`, `src/server.hono.ts`, `src/server.express.ts`, `src/server.fastify.ts`, `graph.json`
- Test: `test/ship-from-env.test.ts`, `test/check.test.ts`, `test/routes.test.ts`

- [ ] Step 1: write the failing tests.
  - `ship-from-env.test.ts`: `isDev({})` and `isDev({ NODE_ENV: 'development' })` are true, `isDev({ NODE_ENV: 'production' })` is false. `stopOnSigterm(close, ship)` on a fake `process`-like emitter is hard to test without the real signal, so test the exported helper through an injected emitter parameter (`stopOnSigterm(close, ship, signals = process)`): after the emitter fires `SIGTERM`, `close` ran before the dispose, and the dispose ran once.
  - `check.test.ts` gains: a container from `offlineMeridian()` with `bridgePlugins({ dev: true })` gives `graph(ship)` where the providers of `TICK_LOOP`, `SHIP_STATE` and `TELEMETRY` carry `system: MeridianSystems`, `system: Simulation` and `system: Telemetry`, and no provider of `BridgeApi`, `AuditTrail`, `Tactical` or `SimDriver` carries a note. The `graph.json` case fails until Step 3 regenerates it.
  - `routes.test.ts` gains, per framework: with `graph: () => graph(ship)` and the dev plugins, `GET /graph` answers 200 with the same JSON; without the option it answers 404.
  - See them fail.
- [ ] Step 2: add `isDev` and `stopOnSigterm`, use `isDev` in `shipFromEnv`, give `bridgePlugins({ dev })` `devtools({ annotate: [shipNotes] })`, add `BridgeOptions.graph` and the three routes, and move the three Node entries to `stopOnSigterm` with `graph: isDev(process.env) ? () => graph(ship) : undefined`.
- [ ] Step 3: run `npx nx run @nexusdi/bridge-api:graph`, read the diff (the `Telemetry` module and its provider, the aggregate's new import and export only), and commit `graph.json`. Run `npx nx test @nexusdi/bridge-api`, `typecheck`, `lint`, and `npx nx run @nexusdi/bridge-api:e2e --parallel=2` (heavy): every gating case passes unchanged.
- [ ] Step 4: commits `feat(bridge-api): close the server and dispose the ship on sigterm`, `feat(bridge-api): serve the annotated graph in development`, `test(bridge-api): redraw graph.json with the telemetry module`.
- [ ] Step 5: cleanup, then the review gate.

### Task 6: `bridge-api`'s telemetry growth cases

Files:

- Create: `examples/bridge-api/e2e/growth/telemetry.e2e.ts`

- [ ] Step 1: write the cases through `e2e/servers.ts` on Hono, Express and Fastify, over `offlineMeridian(...)` in manual mode with `bridgePlugins()`: the first frame reads tick 0; after `POST /sim/advance` of 3 ticks the client reads a frame at tick 3 (conflation may skip 1 and 2, so assert the latest frame read reaches tick 3); aborting the client leaves the feed with no sink (a recording feed through `override(TELEMETRY, { useValue })` with `createTestingContainer` from `@nexusdi/testing`); disposing the ship sends `event: offline` with `ship offline` and ends the body. One more case starts `src/server.hono.ts` with `start()` from `e2e/entry-process.ts` (`SIM_MODE=manual`), opens `/telemetry`, sends SIGTERM, reads `event: offline`, and expects exit code 0 with no signal.
- [ ] Step 2: run `npx nx run @nexusdi/bridge-api:e2e-growth --parallel=2` (heavy; until Task 7 the target is the vitest suite alone). Commit `test(bridge-api): stream telemetry on the three frameworks in the growth suite`.
- [ ] Step 3: cleanup, then the review gate.

### Task 7: the runtime growth smoke and the demo-growth job

Files:

- Create: `examples/bridge-api/test/runtime/growth-cases.ts`, `test/runtime/growth.ts`, `test/worker/growth/sim.test.ts`, `vitest.workers-growth.config.ts`
- Modify: `examples/bridge-api/vitest.workers.config.ts` (exclude `test/worker/growth/**`), `scripts/runtime-leg.mjs` (`--entry`), `project.json` (`e2e-growth`), `.github/workflows/ci.yml` (demo-growth), `tools/repo-checks/src/adapter-runtimes-workflow.test.ts`, `tools/repo-checks/src/release-verify-gate.test.ts`, `.fallowrc.jsonc`

- [ ] Step 1: write the failing repo-checks. `adapter-runtimes-workflow.test.ts` gains a demo-growth block: the job installs Deno and Bun with the same action SHAs and the versions `toolchains.json` pins, before the `e2e-growth` step. `release-verify-gate.test.ts`: the demo-growth timeout is 20, and the action-pin case accepts the two runtime setup actions with the pins adapter-runtimes uses. See them fail with `npx nx test @nexusdi/repo-checks`.
- [ ] Step 2: write `growth-cases.ts`: three cases over a `fetch`-like function (`(path, init?) => Promise<Response>`), each a plain async function that throws an `Error` naming the mismatch: the `/sim` shape at tick 0, 600 ticks, and the first telemetry frame then a cancel. `growth.ts` is the Deno and Bun entry: it serves `createBridge(ship)` over `OfflineMeridian` with the serve helper `smoke.ts` uses (move that helper into `test/runtime/serve.ts` and import it from both), runs the cases, prints `PASS bridge-api growth checks (3 cases)` or the failures, and throws on any. `test/worker/growth/sim.test.ts` runs the same cases through `app.request` on workerd. `runtime-leg.mjs` takes `--entry`, default `test/runtime/smoke.ts`, and its pin error says that `e2e-growth` needs the pinned Deno and Bun on `PATH`.
- [ ] Step 3: change `e2e-growth` to the four commands of ruling 7 with `parallel: false`, update `ci.yml`, and add the new files to `.fallowrc.jsonc`. Run `npx nx test @nexusdi/repo-checks`, `npx nx run @nexusdi/bridge-api:test-workers --parallel=2` (the gating suite runs no growth case) and, with the pinned runtimes first on `PATH`, `npx nx run @nexusdi/bridge-api:e2e-growth --parallel=2` and `npx nx run @nexusdi/bridge-api:runtime-leg --leg=deno` (heavy).
- [ ] Step 4: commits `test(bridge-api): smoke the simulation on workerd, deno and bun in the growth target` and `ci(repo): install the pinned deno and bun in the demo-growth job`.
- [ ] Step 5: cleanup, then the review gate.

### Task 8: `BRIDGE_LINK` and the `TelemetryClient` module

Files:

- Create: `examples/bridge-console/app/bridge/telemetry-client.ts`
- Modify: `app/bridge/bridge-link.ts`, `app/bridge/bridge-console.ts`, `app/bridge/bridge.client.ts`, `package.json` (devDependencies `@nexusdi/meridian-systems`, `@nexusdi/devtools`), `tsconfig.app.json` and `tsconfig.spec.json` (references, if the project uses them), `tests/doubles.ts`
- Test: `tests/bridge-link.test.ts`, `tests/telemetry-client.test.ts`, `tests/graphs.test.ts`

- [ ] Step 1: write the failing tests.
  - `bridge-link.test.ts` gains, against the real Hono backend it already serves: `snapshot()` returns tick 0; `telemetry()` returns a body whose first frame is an `event: snapshot` at tick 0, and an aborted request signal ends it; `graph()` returns null when the backend has no graph option, and the graph when the test serves `createBridge(backend, { graph: () => graph(backend) })` with the dev plugins.
  - `telemetry-client.test.ts` with a fake `EventSource` class on `globalThis`: no source opens at construction; `subscribe` opens one at `/telemetry`; a `snapshot` message calls `next` with the parsed snapshot; an `offline` message calls `offline` with its data and closes the source; an `error` event calls `offline('telemetry lost')` and closes it; the unsubscribe closes it.
  - `graphs.test.ts`: both graphs resolve `TELEMETRY_CLIENT` (resolve it in a container built from each; construction opens nothing).
  - See them fail.
- [ ] Step 2: write the three link methods (types by `import type`), the `fakeBridgeLink` methods (a snapshot at tick 0 built from a small literal, a one-frame stream, a null graph by default), and `telemetry-client.ts` (interface, token, class, module). Import `TelemetryClient` into both graphs. Run `npx nx test @nexusdi/bridge-console` and `npx nx typecheck @nexusdi/bridge-console`.
- [ ] Step 3: commits `feat(bridge-console): read the ship, its telemetry and its graph through the bridge link` and `feat(bridge-console): subscribe to telemetry through an event source client`.
- [ ] Step 4: cleanup, then the review gate.

### Task 9: the ship layout and its routes

Files:

- Create: `examples/bridge-console/app/routes/telemetry.ts`, `app/routes/ship-layout.tsx`, `app/routes/diagnostics.tsx`, `app/components/StatusStrip.tsx`
- Modify: `app/routes.ts`, `app/routes/layout.tsx` (a `Diagnostics` link only, if the nav lists routes; the strip stays out of it)
- Test: `tests/routes/telemetry.spec.ts`, `tests/routes/diagnostics.spec.tsx`, `tests/status-strip.spec.tsx`

- [ ] Step 1: write the failing tests with the route test pattern of `tests/routes/home.spec.tsx` (mocked `nexus.server`, `fakeBridgeLink`):
  - the telemetry loader answers 200 with the SSE headers and the link's body; a link whose `telemetry()` rejects gives 503.
  - the ship-layout loader returns the fake snapshot, and null when `snapshot()` rejects.
  - `StatusStrip` with a snapshot renders tick, ship time, habitat temperature and habitat pressure (four significant digits, kPa); with null renders `Telemetry offline`; under a `NexusProvider` whose `TELEMETRY_CLIENT` is a test double it subscribes on mount, re-renders on `next`, shows `Telemetry offline` on `offline`, and unsubscribes on unmount.
  - `/diagnostics` with a fake graph groups providers under their module names and prints each note; with null renders `Diagnostics are off on this bridge`.
  - See them fail.
- [ ] Step 2: write the routes and the component. `routes.ts` adds `route('telemetry', 'routes/telemetry.ts')` at the top level and `layout('routes/ship-layout.tsx', [route('diagnostics', 'routes/diagnostics.tsx')])` inside the root layout. Run `npx nx test @nexusdi/bridge-console`, `typecheck`, `lint`, and `npx nx run @nexusdi/bridge-console:e2e --parallel=2` (heavy): the gating suite passes unchanged.
- [ ] Step 3: commits `feat(bridge-console): relay the telemetry stream from a resource route` and `feat(bridge-console): show the ship status strip and the diagnostics page`.
- [ ] Step 4: cleanup, then the review gate.

### Task 10: the console's `e2e-growth` target

Files:

- Create: `examples/bridge-console/playwright.servers.mts`, `playwright.e2e-growth.config.mts`, `e2e/growth/telemetry.spec.ts`
- Modify: `playwright.config.mts`, `package.json` (the target), `tsconfig.e2e.json` (if its include misses the new files), `.fallowrc.jsonc`

- [ ] Step 1: move the two web servers into `webServers(ports)`, have the gating config call it with 4210/4211 and `testIgnore: ['growth/**']`, and write the growth config on 4220/4221.
- [ ] Step 2: write the cases of ruling 6. The strip on `/diagnostics` reads tick 0; the test posts `{ "ticks": 600 }` to `http://127.0.0.1:4221/sim/advance` and the strip reads tick 600, 300 s, habitat 293 K and 101.3 kPa through the live stream; `/diagnostics` lists `Simulation`, `MeridianSystems` and `Telemetry` with `system: Telemetry`; `problems(page)` is empty on both.
- [ ] Step 3: run `npx nx run @nexusdi/bridge-console:e2e-growth --parallel=2` and `npx nx run @nexusdi/bridge-console:e2e --parallel=2` (heavy). The first passes, the second runs no growth case. Commit `test(bridge-console): read the live status strip in an e2e-growth target`.
- [ ] Step 4: cleanup, then the review gate.

### Task 11: the bundle checks

Files:

- Modify: `examples/bridge-console/e2e/fresh-server.spec.ts`, `examples/federation-shell/package.json` (devDependency `@nexusdi/meridian-systems` if the spec imports it)
- Create: `examples/federation-shell/e2e/bundle.spec.ts`

- [ ] Step 1: add a case to `fresh-server.spec.ts`, `keeps the simulation out of the client build`: for every `build/client/assets/*.js`, no sentinel of ruling 8 appears. Check first that a sentinel does appear in a build that bundles the library: bundle `@nexusdi/meridian-systems` with esbuild `--minify` in the scratchpad and grep the output, so the check is known to catch a leak. Record the result in the ledger.
- [ ] Step 2: write `bundle.spec.ts` in the federation shell over the dists its e2e target builds (read the target's `dependsOn` and `build-e2e` to list them; the shell's own e2e build too), with the same sentinels and a case that each listed dist holds at least one `.js` file.
- [ ] Step 3: run `npx nx run @nexusdi/bridge-console:e2e --parallel=2` and `npx nx run @nexusdi/federation-shell:e2e --parallel=2` (heavy). Commits `test(bridge-console): keep the simulation out of the client build` and `test(federation-shell): keep the simulation out of every station build`.
- [ ] Step 4: cleanup, then the review gate.

### Task 12: READMEs, fallow and the spec

Files:

- Modify: `examples/meridian-systems/README.md`, `examples/bridge-api/README.md`, `examples/bridge-console/README.md`, `.fallowrc.jsonc`, `specs/2026-10-21-meridian-ship-systems-design.md`

- [ ] Step 1: the library README gains the `Telemetry` module (the token row `TELEMETRY | ITelemetryFeed | SnapshotFeed | Telemetry`), tick listeners and the `onInit` order they show, and `shipNotes`. `bridge-api`'s README gains `GET /telemetry` and `GET /graph` in its route table, `stopOnSigterm` under Running a Server, and the four commands of `e2e-growth` with the pinned runtimes under Testing. The console README gains the ship layout, `/telemetry`, `/diagnostics` and the `e2e-growth` target.
- [ ] Step 2: run `npx fallow dead-code` and add only the entries it asks for, each with a comment.
- [ ] Step 3: amend the spec as ruling list items 1 to 8 give it: §3.3 and §10.1 (`SnapshotFeed` deps, `ITickLoop.listen` and `TickListener`, the `TELEMETRY_CLIENT` row); §4.2 step 3 (listeners after the commit, every listener called, one error or `AggregateError`, no `advance()` from a listener); §6 rows "Server adapters" and "Dispose order on shutdown" (`stopOnSigterm`); §7.1 (the SSE frames, `TelemetryEvent`, conflation, `/graph` 404 outside development, the runtime smoke in `bridge-api`'s `e2e-growth`); §7.2 (`telemetry()` with no parameter, `graph()`, the ship layout's strip, `/telemetry` 503, the diagnostics grouping); §8.3 (the runtime smoke and the console growth e2e); §9 (the token-description sentinels); §10.2 (the ship notes rule, phase from G1); §15 (one row per ruling, source "tech lead, G0b ruling n").
- [ ] Step 4: run `npx prettier --check` on the changed files. Commits `docs(meridian-systems): describe telemetry and the ship notes`, `docs(bridge-api): document the telemetry and graph routes`, `docs(bridge-console): document the ship layout and diagnostics`, `docs(specs): record the g0b rulings in the ship systems spec`.
- [ ] Step 5: cleanup, then the review gate.

### Task 13: the gate and the PR

- [ ] Step 1: run the full gate (heavy): `npx nx run-many -t lint test build typecheck --parallel=2 --exclude=tag:demo-frontend`, `npx nx run-many -t lint test build typecheck --parallel=2 --projects=tag:demo-frontend`, `npx nx run-many -t e2e --projects=tag:demo --parallel=2`, the three `e2e-growth` targets with the pinned runtimes on `PATH`, `npx nx run @nexusdi/bridge-api:test-workers`, `npx nx run @nexusdi/bridge-api:graph`, `npx fallow dead-code` and `npx prettier --check .`. Then cleanup.
- [ ] Step 2: the final branch review by an independent opus reviewer; fix rounds until it approves.
- [ ] Step 3: rebase onto `origin/release/0.4`, push, and open the PR against `release/0.4`. The body lists the rulings and the three owner one-liners, and ends with the Claude Code line. Wait for CI, fix any CodeQL alert, and report the PR number and the result. Do not merge.
