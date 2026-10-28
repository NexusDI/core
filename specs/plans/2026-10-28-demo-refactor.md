# Demo app refactor

The demo apps teach NexusDI by example, so every pattern in them must be one a user can copy.
This plan turns the three reviews of 2026-10-24 and the owner's decisions of 2026-10-24 and
2026-10-25 into a refactor of `examples/`. The target code reads as one design: one system
template, one naming scheme, one testing idiom, explicit module imports and no test
scaffolding in the demo routes. It also fills the coverage gaps the audit found and fixes
the UX bugs that are code bugs.

The plan builds on `specs/2026-10-21-meridian-ship-systems-design.md`, sections 1 to 16, and
on `specs/2026-10-28-extension-points-design.md`, whose core changes K1 to K4
(`specs/plans/2026-10-28-extension-points.md`) the module graph of section 3.1 needs. The
MeridianOS UI gets its own design spec later. This refactor leaves it a seam (section 3.9)
and builds none of it.

## 1. Inputs

The reviews read `origin/release/0.4` at 946a3457. The plan reads it at f824f4a7
(`chore(release): publish 0.4.0-rc.2`). PRs #200 and #203 were already in at 946a3457: the
merge commit of #203 is 946a3457. No commit since touches `examples/`. Two read-only
subagents re-checked every blocking and major finding and every UX bug against f824f4a7.
Every finding still holds, with these corrections:

U4 and U7 name the review's UX majors 4 and 7.

- U4: the bridge-api README names `RELAY_URL`, for the chart download only. Neither README
  says the comms page needs it, and no target starts a relay.
- Finding 6: `examples/size` resolves `UserService` with `app.get(UserService)` in 13
  files, and `useService(UserService)` appears once, in `size/src/react.ts`.
- Finding 31: 75 fenced blocks split their `@nexusdi/core` value imports, 35 in
  `examples/meridian/src/pages/*.md` and 40 in `examples/meridian/src/errors/*.md`.
- U7: the console's FTL page posts only spool and jump, so the console never shows the desk
  refusal for `ftl`. A raw `POST /commands` does.
- Finding 29: `SectionBoundary` hands its fallback the raw load error
  (`libs/react/src/section.tsx:246-256`), and only React's log sees the `SectionError`. So
  the shell's "Error" label comes from the fallback's input. The demo fixes its own
  fallback; whether `libs/react` should hand the fallback the `SectionError` was question
  T-Q14, which the owner approved as T34 (section 10).

## 2. What core does with module imports

Owner decision 2 asks each system to import the modules it uses, with only `Simulation`
global, and asks whether core dedupes a configured module imported along several paths.
This section answers from `libs/core/src`.

### 2.1 Dedupe

Core dedupes a module by the identity of its definition object.

- `blueprint/walk.ts` keeps `byDefinition`, a map from definition to module id. A second
  visit of the same object returns the first id, and an entry listed twice in one
  `providers` list counts once.
- `definitions/define-module.ts:178-193`: each `forRoot()` and `forRootAsync()` call returns
  a new definition through `instance()`.

So two calls of `LifeSupport.forRootAsync(...)` make two modules, with two
`ATMOSPHERE_PROBE` providers (ambiguous to a module that sees both) and two
`POWER_CONSUMERS` entries. One call, held in a constant and imported along every path,
makes one module. Core needs no change for dedupe. The demo builds each configured module
once and passes that object to every importer.

A bare import of a configurable module, such as `LifeSupport` with no `forRoot`, raises
`NEXUS_MODULE_OPTIONS_MISSING` (`walk.ts`, `visit`). Core has no way to bind a bare import to
the one configured instance in the graph.

### 2.2 Multi tokens and cycles

The buses broke decision 2 under rc.2. `blueprint/visibility.ts` gave a module its own
providers, the exports of its imports and the exports of every global, so `all(TOKEN)` read
contributions only along a chain of exports into the collector's module. An upstream bus
never saw a downstream system without a global aggregate. `walk.ts` rejects an import cycle
with `NEXUS_MODULE_IMPORT_CYCLE`.

The demo exposed a core gap, and `specs/2026-10-28-extension-points-design.md` closes it in
0.4 (rc.3):

- K1: every multi token collects across the container. A module publishes its own
  contributions by naming the token in `exports`, and every `all(TOKEN)` sees every published
  contribution plus its own module's private ones. `load()` rejects a published contribution
  with `NEXUS_LOAD_CONTRIBUTION`.
- K3: `lazy(all(TOKEN))` lets a collector break a provider cycle once for all contributors.
- K2: compile rejects a private contribution that no provider can read, with
  `NEXUS_UNREAD_CONTRIBUTION`, so a forgotten export fails at startup.
- K4: `load(module, { imports: [Host] })` grants a loaded module the exports of host modules.

The Meridian has four buses, each a collector over a multi token. `MasterAlarm` collects a
fifth multi token, whose one contributor lives in bridge-api:

| Bus            | Collects                | Called back by a contributor                          |
| -------------- | ----------------------- | ----------------------------------------------------- |
| `TICK_LOOP`    | `all(SHIP_SYSTEMS)`     | no; `JumpDrive` registers, and it contributes nothing |
| `COMMAND_DESK` | `all(COMMAND_HANDLERS)` | no; `JumpDrive` registers, and it contributes nothing |
| `POWER_ROUTER` | `all(POWER_CONSUMERS)`  | yes: `RailgunMount.fire` diverts                      |
| `SHIP_STATE`   | `all(SHIP_RECORDS)`     | yes: every system reads and queues on it              |
| `MASTER_ALARM` | `all(ALARM_SINKS)`      | no; bridge-api's `AlarmPanel` contributes a sink      |

Under K1 the two buses that a contributor calls form provider cycles, and no module cycle.
`PlasmaRouter` takes `lazy(all(POWER_CONSUMERS))`, so `RailgunMount` and the shield consumer
take `POWER_ROUTER` directly. `ShipStateStore` takes `lazy(all(SHIP_RECORDS))` when a record
contribution depends on `SHIP_STATE`, and plain `all(SHIP_RECORDS)` when every record is a
value. Pass 4 of the compile reports a cycle left in place as `NEXUS_CIRCULAR_DEPENDENCY`.

### 2.3 The subspace link

The online and offline ship differ in one provider: `SUBSPACE_LINK`. Today the choice
doubles two modules (`Comms` and `OfflineComms`, `Tactical` and `OfflineTactical`), and every
module that reads `NAV_CHARTS` would have to import the chosen one. An import by identity
needs the object, so `Helm` and `FtlDrive` would turn into functions of the chosen module.

The plan moves the choice into one configured module, `SubspaceLink.forRoot({ relayUrl,
relayTimeout })`, global, which the online ship imports and the offline ship omits.
`PhasedArray` keeps `optional(SUBSPACE_LINK)`, and the one `Tactical` module downloads its
charts when the link exists and reads the bundled table when it does not. `Comms` and
`Tactical` become one constant each. A configured module that the app chooses at startup
and several systems read is global, as `Simulation` is. This extends decision 2, and the owner approved it with O1.
`Simulation` and `SubspaceLink` are the only globals in the demos.

## 3. Target shape

### 3.1 The module graph

The target, which the tech lead ruled (section 9.1):

- `Simulation` (global, `forRoot`): `SIM_OPTIONS`, `SIM_CLOCK`, `RNG`, `SHIP_STATE`,
  `DECK_PLAN`, `SHIP_FILES` (T18), the scoped `COMPARTMENT`, and the two buses `TICK_LOOP`
  and `COMMAND_DESK`, whose classes already live in `simulation/`.
- `SubspaceLink` (global, `forRoot`, optional): `SUBSPACE_LINK`.
- `MeridianSystems` (a constant): it imports every system present at startup, so
  an app pulls the ship in with one import. It provides nothing and exports nothing. Its
  docblock says so in one sentence.
- Each system module exports the multi tokens it contributes to (`SHIP_SYSTEMS`,
  `COMMAND_HANDLERS`, `POWER_CONSUMERS`, `SHIP_RECORDS`), which publishes its contributions
  to every bus (K1). K2 rejects a forgotten export at startup.
- Each system module is a constant that imports the modules whose plain tokens it reads:

  | Module      | Imports                   | Reads through the import      |
  | ----------- | ------------------------- | ----------------------------- |
  | `Helm`      | `Propulsion`, `Tactical`  | `MAIN_DRIVE`, `NAV_CHARTS`    |
  | `Safety`    | `ShipLifeSupport`         | `ATMOSPHERE_PROBE`            |
  | `Weapons`   | `Engineering`             | `POWER_ROUTER`                |
  | `FtlDrive`  | `Engineering`, `Tactical` | `POWER_ROUTER`, `NAV_CHARTS`  |
  | `Telemetry` | none                      | `TICK_LOOP` from `Simulation` |
  | the others  | none                      | `Simulation` alone            |

- `LifeSupport` stays the configurable module. `life-support.module.ts` also exports
  `ShipLifeSupport`, the library's one configured instance:
  `LifeSupport.forRootAsync({ deps: [DECK_PLAN], useFactory: readCalibration })`, switched
  to `SHIP_FILES` in T18. Its docblock says the library configures it once so that `Safety`
  and the aggregate import one object (section 2.1).
- The app root imports `Simulation.forRoot({ seed, dt })`, `SubspaceLink.forRoot(...)` on the
  online ship, `MeridianSystems`, and the system modules whose tokens it reads: bridge-api
  imports `Tactical` for `/course`, `ShipLifeSupport` for the compartment route and `Telemetry`
  for the stream. T26 adds `Safety` for `ALARM_BOARD`.
- No app module is global. bridge-api's `AlarmPanel` exports `ALARM_SINKS`, so `MasterAlarm`
  in `Safety` collects its sink (K1), and the bridge-api root imports it. The shell's
  `Tactical` exports the federation contracts, the shell's root imports it, and each station
  loads with `{ imports: [Tactical] }` (K4).
- `meridianSystems()` goes. Nothing left in its options chooses an import, so finding 17
  closes with a constant.

Every plain token now reaches its reader through an explicit import or from `Simulation`.

A module test imports the system under test next to `Simulation`, and the buses collect its
published contributions. No test global remains.

The goldens do not move with the graph. `allocatePower` sorts the loads by priority and id
(`physics/power.ts:45,67`), `FixedStepLoop` sorts the systems by phase and name, and the RNG
fork labels keep their `name` strings. T17 proves it with a growth run.

### 3.2 One system template

Every system folder under `meridian-systems/src/systems/<system>/` holds the same files:

- `contracts.ts`: the tokens, the interfaces, the record and setpoint types, the
  `<SYSTEM>_ACTIONS` tuple and the `ShipRecords` and `ShipSetpoints` augmentations (T19). It
  imports runtime code from `@nexusdi/core` alone, for `new Token`.
- `<system>-model.ts`: the pure laws of the system and their constants (T4).
- `<system>-physics.ts`: the `IShipSystem` step, with `static readonly phase`.
- `<system>-power.ts`: the `IPowerConsumer`, where the system draws power.
- `<system>-commands.ts`: the `ICommandHandler` and the one `refuse<System>` built with
  `commandRefusal`. Every refusal of the system, in the handler or in a service, calls it.
- `<system>-record.ts`: the `SHIP_RECORDS` contribution with the initial record (T19).
- `<system>.module.ts`: the module. Its providers follow one order: services, then physics,
  power, commands and record.
- One `*.test.ts` beside each source file.

Class members follow one order: statics, fields, constructor, public methods, private
methods. Imports follow three groups (packages, then `../..` paths, then `./` paths), which
the `import/order` rule of `eslint-plugin-import` enforces in the meridian-systems eslint
config. Arguments go through the helpers of `simulation/command-arguments.ts`:
`numberArgument`, `optionalNumberArgument`, `optionalFlagArgument`, `choiceArgument` and the
`ownKey` guard.

### 3.3 Naming

The same rules hold in every app:

- A token is `UPPER_SNAKE` and names the role (`POWER_ROUTER`). Its description is the
  interface name without the `I` (`'PowerRouter'`). A service interface starts with `I`.
- A class names the device (`PlasmaRouter`). No class shares its token's name.
- A module is PascalCase and names the system or station (`Engineering`,
  `EngineeringStation`). Its file is `<kebab-name>.module.ts`.
- Each app keeps its tokens and interfaces in `contracts.ts` files.
- Test doubles take a prefix by role, four in all: `Fake` (a working in-memory stand-in),
  `Recording` (captures calls for asserts), `Failing` (throws on purpose) and `Fixed`
  (answers a constant). `Memory`, `Loopback` and `Simulated` go.
- A ship-domain word means one thing. "Bridge" is the bridge-api app and the bridge room,
  so federation's course formatter becomes `CoursePlotter`. "Section" is a module added with
  `load()`, and "hull section" is a region of the deck.

### 3.4 Folder layout per app

- `meridian-systems/src/`: `simulation/` (the kernel), `systems/<system>/` (section 3.2),
  `telemetry/`, `physics/` (laws shared across systems: `gas.ts`, `doors.ts`,
  `constants.ts`, `rng.ts`), `meridian-systems.module.ts`, `errors.ts`, `text.ts`,
  `notes.ts` and `index.ts`. `index.ts` exports one group per system, each under one
  comment, with named lists only.
- `bridge-api/src/`: `entries/` (`hono.ts`, `express.ts`, `fastify.ts`, `worker.ts`,
  `worker.offline.ts` and the `server.*.ts` starters), `bridge/` (pure reply helpers,
  `mission.ts`, `options.ts`, `json-body.ts`), `ship/` (`contracts.ts` and `*.module.ts`)
  and `env/` (`env.ts`, `cors.ts`, `ship.ts`, `drain.ts`, split from `ship-from-env.ts`).
- `bridge-console/app/`: `di/` (the modules, each `*.module.ts`, plus `contracts.ts`, the
  server graph `bridge.server.ts` and the client graph `bridge.client.ts`), `hooks/` (the
  DI-driven data hooks of section 3.9), `components/` (presentational, no DI import),
  `routes/` and `routes/systems/`.
- federation: each remote `examples/federation-<station>/src/` holds
  `<station>-station.module.ts`, `<station>-panel.tsx`, `<station>-station.test.ts` and
  `index.ts`. The shell holds `stations.ts`, `station-route.tsx` and `ship/`.

### 3.5 The testing idiom

Tests show the testing packages the way a user should write them:

- A module test builds its container from a `nexusTest` fixture with `setup` overrides, as
  `meridian-systems/test/fixtures.ts` does today. Direct `Nexus.create` stays in the e2e
  goldens and in tests about startup itself.
- Each app has one `test/support.ts` (bridge-console: `tests/support/`) with its constants,
  its doubles and a `caught(fn)` helper that returns the thrown error, read with
  `isNexusError`. No test casts an error to reach a field.
- bridge-api exports `FRAMEWORKS = ['hono', 'express', 'fastify'] as const` from
  `test/support.ts`, and every test and e2e file imports it.
- bridge-console keeps one test container per route spec: a `renderRoute(route, { overrides
})` helper over one `nexusTest` fixture, which also backs the mocked `nexus.server`.
- The goldens use one `recordGolden(name, script)` helper in `e2e/golden.ts`.
- federation stations share `@nexusdi/federation-contracts/testing`: a fake `Tactical`, a
  `RecordingCommandLink` reset per test through the fixture, and a fake telemetry feed.

### 3.6 Federation: the station table and the rspack factory

`federation-shell/src/stations.ts` holds one row per station: id, label, path, remote name,
port and lazy section. `mf.ts`, the sections, the nav and the routes derive from it, and one
`StationRoute` component replaces the four route files. The nav renders the table with a
list, so no hand-spaced `{' '}` remains.

`federation-contracts/rspack` exports `meridianRemote({ name, port, decorators })` and
`meridianShell(...)`. Each remote's `rspack.config.ts` becomes a few lines. The drift and
unshared builds of cartography pass their overrides to the same factory.

### 3.7 E2e scaffolding leaves the routes

The `x-mission-id: missing-provider` branch, the `/mission` and `/log/stream` routes and
`src/bridge/uncharted.ts` move into `bridge-api/e2e/fixtures/mission-routes.ts`. That file
exports one mount function per framework. `e2e/servers.ts`, `test/runtime/smoke.ts`,
`test/worker/*` and `test/edge/routes.edge.test.ts` mount it. The fixture reads `MISSION`
and `FLIGHT_LOG` through `di.inject`, with no `scopes.current()` read inside an empty
inject. The demo routes keep only ship routes.

### 3.8 Comments

A comment states a reason a reader can check in the code. It cites no spec section, docs
section, G-number, task number, ruling or earlier version. T1 removes every reference the
re-check listed, and a repo-check refuses new ones under `examples/`.

### 3.9 The seam for MeridianOS

MeridianOS replaces the console's UI. Two layers stay for it:

- `bridge-console/app/components/`: presentational React components (cards, buttons, gauges,
  forms, the status strip's view). A `no-restricted-imports` rule in the console's eslint
  config bans `@nexusdi/*` there, so a component takes data through props.
- `bridge-console/app/hooks/`: data hooks over DI. `useShipReading()` reads
  `TELEMETRY_CLIENT` through `useService` and falls back to the loader's snapshot.
  `useShipCommand(system)` posts through the action and reports the queued tick, then the
  tick that served it.

MeridianOS then writes new components over the same hooks. The deck view, the network
overlay and the conduit drawings wait for it.

## 4. Review findings and decisions

Every blocking and major finding gets a decision and a task.

| #   | Finding                                            | Decision                                                                                                   | Task       |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | systems read siblings through the global aggregate | explicit imports, section 3.1, as O1 rules                                                                 | T17        |
| 2   | FTL bypasses the desk, the multi tokens and DI     | owner decision 1: providers, registries, `/commands`; the `/ftl/*` routes go                               | T15, T16   |
| 3   | the console declares a second `NAV_CHARTS`         | import the library's token                                                                                 | T11        |
| 4   | e2e scaffolding in the demo routes                 | move to an e2e fixture, section 3.7                                                                        | T9         |
| 5   | `StarSelect` reads the chart table directly        | `INavCharts.stars()`, read through `useService(NAV_CHARTS)`                                                | T11        |
| 6   | fixtures bind class to class without a label       | a README per fixture that says what it measures and that it is no pattern                                  | T14        |
| 7   | adding a system touches six central files          | owner decision 3: `SHIP_RECORDS` and augmentable record types                                              | T19        |
| 8   | two trees per system                               | per-system `<system>-model.ts`; `physics/` keeps shared laws                                               | T4         |
| 9   | refusals built five ways                           | one `refuse<System>` per system in `<system>-commands.ts`                                                  | T3         |
| 10  | `*_ACTIONS` in two places                          | every tuple in `contracts.ts`                                                                              | T3         |
| 11  | comments cite specs, G-numbers, tasks              | section 3.8, with a repo-check                                                                             | T1         |
| 12  | one stale and one duplicated comment               | rewrite with T5's power rule                                                                               | T5         |
| 13  | the router and grid cycle broken two ways          | a `ShieldPower` consumer over `SHIELD_GRID`; the grid takes `lazy(POWER_ROUTER)`, as the railgun pair does | T5         |
| 14  | ad-hoc subscriber lists written three ways         | `Subscribers<T>` and `byCodeUnit` in `simulation/`                                                         | T2         |
| 15  | argument parsing escapes the helpers               | the helpers of section 3.2                                                                                 | T2, T3     |
| 16  | loose Comms schema, no LifeSupport schema          | zod schemas for both; `transport` and the hardcoded frequency go                                           | T6         |
| 17  | the aggregate is a plain function                  | it becomes the constant `MeridianSystems`, since no option chooses an import any more                      | T17        |
| 18  | test helpers copied across meridian-systems tests  | `test/support.ts` and the `nexusTest` fixture                                                              | T7         |
| 19  | the README testing section inventories cases       | a short how-to with one example                                                                            | T33        |
| 20  | the mission factory copied four times              | `bridge/mission.ts` and `bridge/options.ts`, also read by the console                                      | T8         |
| 21  | `ship-from-env.ts` mixes four jobs                 | split into `env/`                                                                                          | T8         |
| 22  | `routes.test.ts` is 1382 lines                     | one file per system, `FRAMEWORKS`                                                                          | T10        |
| 23  | console test support repeats itself                | one fixture, `renderRoute`                                                                                 | T11        |
| 24  | console pages drift                                | `SnapshotOffline`, `allocated()`, `.server.ts` loaders, `NumberForm` and `CommandSelect`                   | T11        |
| 25  | test doubles have no naming rule                   | section 3.3; the FTL double goes with T16                                                                  | T10, T16   |
| 26  | four stations, four conventions                    | section 3.3 and 3.4                                                                                        | T12b       |
| 27  | four copied shell route files                      | section 3.6                                                                                                | T12a       |
| 28  | four copied rspack configs and test fakes          | `meridianRemote()` and `federation-contracts/testing`                                                      | T12a, T12b |
| 29  | federation error handling skips `isNexusError`     | `isNexusError` in `SectionFailed` and the tests; `checkAgainst` turns sync                                 | T12b       |
| 30  | `TELEMETRY_FEED` disagrees with itself             | rename to `STATION_TELEMETRY`; the bundle check reads the token's description                              | T12b       |
| 31  | split core imports in 35 doc blocks                | merge them; a duplicate-import check in `examples.typecheck.test.ts`                                       | T13        |

Minor findings 32 to 43 go into the task that touches the file: 32 to 36 in T3, 37 in T5,
38 in T7, 39 in T8, 40 in T10 and T11, 41 in T12b, 42 in T13, 43 in T11. Polish findings 44
to 46 also go into a task: 44 in T8, 45 in T12b, 46 in T13. The hands-on review's smaller
items go into T3 (the bad-argument text, life support's `offline` action), T8 (the
encoded `%20`), T11 (the Course page's two logs, "Course" with two meanings) and T14
(toolchain-matrix's silent `matrix` target). Audit gap 10 goes into T11 (`nexusFixtures`).

The plan defers these items from the hands-on review: mixed units in the API, errors below
the fold, the master alarm outside the safety page, forms that reset after a reload, the
analyzer's vacuum reading, an `inspect()` call outside tests (audit gap 10, for the
diagnostics view), the console's look and the shell's look. Each one is MeridianOS
design work or a physics question for its own spec. The dev-server restarts that reset the
ship (`libs/*/dist` restore under tsx watch) get a GitHub issue in T31, since the cause is
medium-confidence.

## 5. Coverage gaps

Each gap gets a home in the ship story. "Waits" marks the part that needs MeridianOS.

| Gap                          | Where it lives                                                                                                                                                                                                      | Task | Waits                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------- |
| type-level wiring errors     | `meridian-systems/test/wiring.test-d.ts`: `PlasmaRouter` deps out of order, `ATMOSPHERE_SENSOR` bound to `FusionReactor`, `Simulation.forRoot({ seed: '7', dt: 0.5 })`, each under `@ts-expect-error`               | T21  | none                                      |
| an authored plugin           | bridge-api `ship/black-box.plugin.ts`, the ship's black box: `observe` keeps the trace, `construct` stamps each system, `compile.check` refuses a `SHIP_SYSTEMS` class without `phase` with `MERIDIAN_SYSTEM_PHASE` | T22  | the console's black-box panel             |
| the profiler                 | bridge-api `profile` target runs `nexusdi profile src/ship/meridian.ts#Meridian --json profile.json`; a dev-only `GET /profile` answers `profileTable` and `criticalPath`                                           | T23  | the startup chart on the diagnostics view |
| async `onInit` and dispose   | `SubspaceRelay`: an async `onInit` handshake with the relay, and `[Symbol.asyncDispose]` that sends a sign-off before the reactor scrams                                                                            | T24  | none                                      |
| the `react()` plugin         | the console registers `react()` in development on both graphs; a contract case shows `TransientInRenderError` with its fix                                                                                          | T27  | the FTL panel as a `lazySection`          |
| interceptor extras           | `tap()` on `COMMS_ARRAY.hail` writes the comms log; an async retry interceptor on `SUBSPACE_LINK` calls; `@UseInterceptors` on federation's decorated `HelmOrders`; `GET /audit`                                    | T25  | the audit panel                           |
| `forRootAsync` with real I/O | `LifeSupport.forRootAsync` reads `sensors.calibration.json` through `SHIP_FILES`, a `Simulation` option: Node reads the file, the Worker reads the bundled copy                                                     | T18  | none                                      |
| `useExisting`                | `ALARM_BOARD`, a read-only `IAlarmBoard` that `MASTER_ALARM` implements, bound with `useExisting`; bridge-api's `AlarmPanel` reads only the narrow token                                                            | T26  | none                                      |

The graph picture (`graph.svg`, `toMermaid` with edges and lifetimes) waits for the network
overlay of section 16.5 of the ship systems spec.

## 6. UX bugs that are code bugs

| Bug                                    | Cause                                                                                                                                                  | Fix                                                                                                                                             | Task |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| gauges never update after a command    | the action's revalidation reads `GET /sim` before the tick that applies the queued change (`ship-state-store.ts:69-71`); no page reads the live stream | pages render from `useShipReading()` over `TELEMETRY_CLIENT`; the command result shows its tick and turns to "applied" when a frame reaches it  | T29  |
| "Oops! fetch failed" replaces the app  | `BridgeApiLink.#post` (`bridge-link.ts:137`) lets a network error escape, and no system route has an `ErrorBoundary`                                   | the link answers a `BridgeOffline` reply; the action shows it beside the form; each system route gets an `ErrorBoundary` over `SnapshotOffline` | T29  |
| `/course/:to` answers 200 for any star | `StarCharts.plot` returns heading 0 for an uncharted star (`star-charts.ts:45-47`)                                                                     | `plot` throws `UnchartedStarError` (`MERIDIAN_UNCHARTED`) whose fix lists the charted stars; the route answers 404 with the refusal body        | T30  |
| the hail needs an undocumented relay   | `shipFromEnv` builds the offline ship without `RELAY_URL`; no target starts a relay                                                                    | a `dev-relay` script beside the server, a `dev` target that starts both, and a comms refusal with a fix line naming `RELAY_URL`                 | T31  |
| federation cannot raise the throttle   | no station sends `engineering throttle`                                                                                                                | the command deck gains a reactor order and shows the burn's served allocation from telemetry                                                    | T32  |
| the FTL fix line points at a dead end  | `MERIDIAN_POWER_BUDGET` gives one fix whatever the throttle (`text.ts:76-79`)                                                                          | `PowerBudgetError` carries the throttle and the loads ahead of it; at full throttle the fix names those loads                                   | T32  |
| `/sim/advance` errors as `{ error }`   | `TICKS_REFUSED` in `sim-ticks.ts:10-12`                                                                                                                | the `{ code, message, fix }` refusal of every other route                                                                                       | T31  |
| two backend URLs for one backend       | bridge-api listens on 3000, the console defaults `BRIDGE_API_URL` to `http://127.0.0.1:4211/` (`bridge-console.ts:19`)                                 | the console and the shell default `BRIDGE_API_URL` to bridge-api's 3000; each frontend keeps its own dev port, and the e2e ports stay           | T31  |
| READMEs read as test specs             | inventories of ticks, bytes and hashes                                                                                                                 | each README runs Context, then Concept, then Detail, after `docs/documentation-style-guide.md`; the root README lists every demo                | T33  |

## 7. The feature-contract suite

Owner decision 5 adds a required suite. Each case asserts NexusDI behaviour a user would see
through a demo, with one case per feature the demos use. The cases live in
`*.contract.test.ts` files, and `examples/feature-contracts.json` lists each feature with its
file and test name. A repo-check (`demo-contracts.test.ts`) fails when a listed case is
missing or a file holds an unlisted case.

The bridge-api, meridian-systems and console cases run in the `main` job through each
project's `test` target, since `main` leaves out only the `demo-frontend` projects. The
federation cases run in `demo-apps`. Both checks are required: the "Demo apps" ruleset
requires `demo-apps` (A1, section 10).

The cases:

- Scoped isolation: two concurrent requests with different `x-mission-id` record into
  separate flight logs, on each framework.
- `load()` once: 20 concurrent `POST /sections/ftl` build `FtlDrive` once (one `construct`
  trace event for `FTL_DRIVE`), and each answers 200.
- `extend()`: a telemetry stream opened before the load reads the drive's rating after the
  load, and the same read without `extend()` throws `NEXUS_LOADED_AFTER_SCOPE`.
- Interceptor order and refusal text: `FlightRecorder` and `PressureInterlock` run in their
  bound order on `BLAST_DOORS.open`, and the refusal answers
  `MERIDIAN_INTERLOCK` with its fix line.
- `optional()` degradation: the ship without `SubspaceLink` starts, queues a hail, reads
  "no subspace link" and serves the bundled charts.
- Dispose order: on SIGTERM the stream sends `event: offline`, the relay sign-off goes
  before the reactor scram, and a later request answers 503 with `NEXUS_DISPOSED`.
- Each user-reachable `NEXUS_*` error with its fix line, asserted through `isNexusError`
  and `explain()`: `MISSING_PROVIDER`, `NOT_VISIBLE`, `AMBIGUOUS_PROVIDER`,
  `INVALID_MODULE_OPTIONS`, `MODULE_OPTIONS_MISSING`, `CIRCULAR_DEPENDENCY`,
  `SCOPE_REQUIRED`, `LOADED_AFTER_SCOPE`, `PROVIDER_FAILED`, `DISPOSED`,
  `INTERCEPTOR_LIFETIME`, `OVERRIDE_UNUSED`, `CONTRACT_VERSION`, `CORE_NOT_SHARED`,
  `REACT_SECTION_FAILED` and the `react()` plugin's `TransientInRender`.

A case pins the fix line by reading the owning package's text export, so a text change in a
library fails the case in the same PR.

T20 adds the manifest, the repo-check and every case whose feature exists after PR 2. Each
later task that brings a feature adds its own case and manifest row in the same commit: T22
the black-box trace, T24 the sign-off in the dispose order, T25 the retry count on
`SUBSPACE_LINK`, T27 `TransientInRender`.

## 8. Tasks

Each task runs test first: the implementer writes the listed tests, sees them fail, then
writes the code. Sizes: S up to about 300 changed lines, M up to about 1,000, L above. Every
commit passes `lint`, `test`, `build` and `typecheck` of the projects it touches. A task that
changes snapshot output re-records the goldens in the same commit and lists why each file
moved. Only T19 changes the meridian-systems goldens. T15, T16, T19, T29, T30, T31 and T32
change answers a user sees, and each lists the e2e bodies it changes.

Each task ends with a Verify line. The implementer runs it before the commit, with
`NX_NO_CLOUD=true NX_DAEMON=false` in front of each `nx` call. A Verify line with an `e2e`
or `e2e-growth` target runs under the heavy-job lock (`until mkdir /tmp/nexusdi-heavy.lock;
do sleep 30; done`, then `rmdir /tmp/nexusdi-heavy.lock`) with `--parallel=2`. The lines use
these project sets:

- `sys`: `@nexusdi/meridian-systems`
- `api`: `@nexusdi/bridge-api`
- `console`: `@nexusdi/bridge-console`
- `fed`: `@nexusdi/federation-shell`, `@nexusdi/federation-contracts` and the four
  `@nexusdi/federation-<station>` projects
- `repo`: `@nexusdi/repo-checks`

Two shorthands name the commands:

- `checks(sys, api)` stands for `npx nx run-many -t lint test build typecheck -p <projects>`
  over the projects of `sys` and `api`.
- `run(e2e e2e-growth; sys, api)` stands for the same `run-many` call with
  `-t e2e e2e-growth`. A project without one of the targets skips it.

The plan goes out as five PRs into `release/0.4`, each under 100 commits. Two lanes run in
parallel on weekdays: meridian-systems (lane M) and the apps (lane A).

### PR 1: groundwork, goldens unchanged

T1. Comment sweep (S, no deps)

- Scope: section 3.8 across `examples/`, plus `ci.yml:144,166,208`. The `ci.yml:144-149`
  comment then states that the "Demo apps" ruleset requires `demo-apps` (A1).
- Files: each line the re-check listed, `.github/workflows/ci.yml`,
  `tools/repo-checks/src/examples-comments.test.ts`.
- Tests first: the repo-check, failing on today's tree.
- Goldens and e2e: none.
- Verify: `checks(repo, sys, api, console, fed)`.

T2. Simulation helpers (S, no deps, lane M)

- Scope: `Subscribers<T>` (add, snapshot-and-skip-removed iteration), `byCodeUnit`,
  `optionalNumberArgument`, `optionalFlagArgument`, `choiceArgument`, `ownKey`. Adopt them in
  `FixedStepLoop`, `SnapshotFeed`, `PlasmaRouter` and `CommandDesk`.
- Files: `simulation/subscribers.ts`, `simulation/by-code-unit.ts`,
  `simulation/command-arguments.ts` and the four adopters.
- Tests first: unit tests for each helper; the adopters' tests stay green unchanged.
- Verify: `checks(sys)`.

T3. One system template (M, after T2, lane M)

- Scope: section 3.2 for the nine system folders. Findings 9, 10 and 15, and 32 to 36.
- Files: every `systems/*/*-commands.ts`, `contracts.ts` and module file, `helm-control.ts`,
  `environmental-controller.ts`, `blast-door-control.ts`, `inert-gas-suppression.ts`,
  `star-charts.ts`, `subspace-relay.ts`, `tactical.module.ts`, `notes.ts`, `index.ts`,
  `eslint.config.mjs`.
- Tests first: a refusal test per system that asserts `refuse<System>` text for a bad
  action, and an `import/order` lint run that fails before the change. A bad argument's
  refusal names the argument (review item: the bad-command text never says which argument
  is wrong). Life support gains the `offline` action that pairs with `online`, with a
  command test (review item).
- E2e bodies that change: the refusal texts in bridge-api's route tests and its growth
  `commands` cases.
- Verify: `checks(sys, api, console)`, since the refusal texts reach the route tests.

T4. System-owned models (M, after T3, lane M)

- Scope: move per-system laws and record types out of `physics/` (`motion.ts`,
  `thermal.ts`, `atmosphere.ts`, `comms.ts`, `fire.ts`, `ftl.ts`, `power.ts`, `safety.ts`,
  `weapons.ts`) into `systems/<system>/<system>-model.ts` and `contracts.ts`. `physics/`
  keeps `gas.ts`, `doors.ts`, `constants.ts` and `rng.ts`.
- Files: the nine `physics/*.ts` files above and their tests, each
  `systems/<system>/<system>-model.ts` and its test, the `contracts.ts` files that take the
  record types, `index.ts`, `tools/repo-checks/src/meridian-purity.ts` and its test.
- Tests first: the moved unit tests move beside their models and pass unchanged; a
  repo-check that no `physics/` file imports from `systems/`, and an extension of
  `meridian-purity.ts` so that no `*-model.ts` imports `@nexusdi/`.
- Verify: `checks(repo, sys)`.

T5. One power rule (S, after T4, lane M)

- Scope: `ShieldPower` in `engineering-power.ts` reads `SHIELD_GRID` and joins
  `POWER_CONSUMERS`, and `DeflectorGrid` takes `lazy(POWER_ROUTER)`. This copies the
  `WeaponsPower` and `RailgunMount` pair. `PlasmaRouter` drops `lazy(SHIELD_GRID)` and the
  shield special case. `IReactorCore.output` in W. Amend every section of the ship systems
  spec that names `lazy(SHIELD_GRID)` or an output in GW: 3.3, 5.7, 8, 10 and 16.3 to 16.5.
- Files: `systems/engineering/{engineering-power.ts,engineering-power.test.ts}` (new),
  `deflector-grid.ts`, `plasma-router.ts`, `fusion-reactor.ts`, `contracts.ts`,
  `engineering.module.ts` and their tests, `test/engineering.test.ts`,
  `specs/2026-10-21-meridian-ship-systems-design.md`.
- Tests first: a router test that lists the shield load from `all(POWER_CONSUMERS)`, and a
  module test that a direct router dependency in the grid fails with
  `NEXUS_CIRCULAR_DEPENDENCY`.
- Goldens: none, since `allocatePower` sorts the loads.
- Verify: `checks(sys)`, then `npx nx run @nexusdi/meridian-systems:e2e-growth` to show the
  goldens hold. A `grep` of the spec for `lazy(SHIELD_GRID)` and ` GW` lists only lines of
  the decision log in section 15.

T6. Options schemas (S, after T3, lane M)

- Scope: zod schemas for `Comms` and `LifeSupport` options with every field checked;
  `formatNumber(MAX_RELAY_TIMEOUT, 0)` in the text; `transport` goes; the frequency default
  moves into the schema. The meridian-systems lint config admits only relative imports and
  `@nexusdi/core` under `src/`, so T6 adds `zod` to that list and to the entries
  `meridian-purity.test.ts` pins.
- Files: `systems/comms/comms-options-schema.ts`,
  `systems/life-support/life-support-options-schema.ts` (new), `options-schema.ts`, the
  two module files, `text.ts`, `meridian-systems/package.json` (zod 4, the newest release,
  pinned exact), `package-lock.json`, `eslint.config.mjs`,
  `tools/repo-checks/src/meridian-purity.test.ts`.
- Tests first: `INVALID_MODULE_OPTIONS` cases per field.
- Verify: `checks(repo, sys, api)` and `npx nx run @nexusdi/bridge-api:test-workers`. The
  commit message reports the Worker bundle delta (T-Q4).

T7. meridian-systems test idiom (M, after T4, lane M)

- Scope: section 3.5. `test/support.ts`, the system tests on the `nexusTest` fixture with
  overrides, `e2e/golden.ts` with `recordGolden`. The fixture takes the system under test as
  an argument and imports it next to `Simulation`. After K1 (T17) the buses collect its
  contributions with no test global.
- Files: `test/support.ts` (new), `test/fixtures.ts`, `test/ship-under-test.ts`, every
  `test/*.test.ts`, `e2e/golden.ts` (new) and every `e2e/*.e2e.ts`.
- Tests first: a `recordGolden` unit test that records one existing golden and compares it
  byte for byte, failing until `e2e/golden.ts` exists. The rewritten tests then keep their
  cases.
- Verify: `checks(sys)`, then `npx nx run @nexusdi/meridian-systems:e2e-growth`; the goldens
  re-record byte-identical.

T8. bridge-api structure (M, no deps, lane A)

- Scope: findings 20, 21, 39 and 44, and the adapter `log` option. Shared mission and
  options, the `env/` split, one JSON body reader, the entries in one route order and one
  style (`di.inject` everywhere), the casts removed, the Node entries pass a logger.
- Files: `src/*.ts`, `src/bridge/`, `src/env/` (new, from `src/ship-from-env.ts`),
  `test/ship-from-env.test.ts` (becomes `test/env.test.ts`), `test/json-body.test.ts`,
  `test/routes.test.ts`, `bridge-console/app/nexus.server.ts`.
- Tests first: `env.test.ts` per split file, new `json-body.test.ts` cases for the one
  body reader the three entries share, and a route test that a 500 logs its `NEXUS_` cause
  on the server and keeps the body empty. The unknown-compartment refusal decodes the
  room name, so `%20` no longer shows (review item).
- Verify: `checks(api, console)` and `npx nx run @nexusdi/bridge-api:e2e`.

T9. The e2e fixture (M, after T8, lane A)

- Scope: section 3.7.
- Files: `e2e/fixtures/mission-routes.ts`, `e2e/servers.ts`, `e2e/cases.ts`,
  `test/runtime/smoke.ts`, `test/worker/*`, `test/edge/routes.edge.test.ts`, the three
  entries, `src/bridge/uncharted.ts` (deleted).
- Tests: the gating `e2e/cases.ts` bodies for `/mission`, `/log/stream` and missing-provider
  keep their asserts and mount the fixture. A new route test asserts the demo entries answer
  404 on `/mission`, and it fails before the move.
- Verify: `checks(api)`, then `run(e2e test-workers test-edge; api)`.

T10. bridge-api naming and tests (M, after T9, lane A)

- Scope: findings 22, 25 and 40. `contracts.ts` and `*.module.ts`, `AUDIT_LOG` into
  contracts, `MissionScope` and `MissionFlightLog`, `FRAMEWORKS`, `routes.test.ts` split per
  system, the doubles renamed by section 3.3.
- Files: `src/ship/*`, `test/routes.test.ts` (split into `test/routes/<system>.test.ts`),
  `test/support.ts` (new), `test/doubles.ts`, every test and e2e file that names a
  framework list, `graph.json`.
- Tests first: a `FRAMEWORKS` test in `test/support.ts` that fails before the export. The
  split tests then hold the same cases, and `nexusdi graph` output and `graph.json` move
  with the module rename.
- Verify: `checks(api)`, `npx nx run @nexusdi/bridge-api:graph` with no diff against
  `graph.json`, then `npx nx run @nexusdi/bridge-api:e2e`.

T11. bridge-console DI and pages (M, after T3, lane A)

- Scope: findings 3, 5, 23, 24, 40 and 43. `INavCharts.stars()` in meridian-systems, the
  library token in the console, one test fixture with `renderRoute`, the page parts shared,
  `di/` with `.module.ts` files, the template leftovers gone. The console's test fixture
  builds on `nexusFixtures` from `@nexusdi/vitest` (audit gap 10). The Course page labels
  its flight log as the log of one request, and Home's mission line reads the helm's
  course after a jump (review items: two logs on the Course page, "Course" with two
  meanings).
- Files: `meridian-systems/src/systems/tactical/{contracts.ts,star-charts.ts}` and its
  test, `bridge-console/app/bridge/*` (moved to `app/di/`), `app/routes/**`,
  `app/components/*`, `tests/support/*`, `tests/doubles.ts`, `tests/routes/*`.
- Tests first: a `StarSelect` spec over a fake `NAV_CHARTS` with two stars; a `stars()` unit
  test.
- Verify: `checks(sys, console)`, then `npx nx run @nexusdi/bridge-console:e2e`.

T12a. Federation shell table and rspack factory (M, no deps, lane A)

- Scope: section 3.6.
- Files: `federation-shell/src/{stations.ts,station-route.tsx,mf.ts,sections.ts,App.tsx}`,
  the four route files (deleted), `federation-contracts/src/rspack.ts`,
  `federation-contracts/package.json` (the `./rspack` export), every `rspack.config*.ts`.
- Tests first: a shell unit test that the nav, routes and remotes derive from the table. The
  gating `federation.spec.ts` passes unchanged.
- Verify: `checks(fed)`, then `npx nx run @nexusdi/federation-shell:e2e`.

T12b. Federation stations (M, after T12a, lane A)

- Scope: findings 26, 28 (harness), 29, 30, 41 and 45.
- Files: each remote's `src/`, `federation-contracts/src/{index.ts,testing.ts}`,
  `federation-contracts/package.json` (the `./testing` export),
  `federation-shell/src/section-failed.tsx`, `federation-shell/e2e/bundle.spec.ts`.
- E2e bodies that change: `federation.spec.ts:54-59` and `:96` (`CartographyStation`,
  `CommandStation`). The growth specs of engineering and life support already assert
  `EngineeringStation` and `LifeSupportStation`, which section 3.4 keeps.
- Tests first: the station tests on the shared harness; a `SectionFailed` test that shows
  the code of a `NexusError` and the class name of a plain error. T34 later replaces the
  plain-error case.
- Verify: `checks(fed)`, then `run(e2e e2e-growth; fed)`.

T13. meridian docs imports (M, no deps, lane A)

- Scope: findings 31, 42 and 46.
- Files: `examples/meridian/src/examples.typecheck.test.ts`, the 35 blocks in
  `examples/meridian/src/pages/*.md` and the 40 in `examples/meridian/src/errors/*.md`.
- Tests first: the duplicate-import check in `examples.typecheck.test.ts`, failing on the 75
  blocks.
- Verify: `checks(repo)` and `npx nx run-many -t lint test typecheck -p @nexusdi/meridian`.

T14. Fixture labels (S, no deps, lane A)

- Scope: READMEs for `size`, `toolchain-matrix` and `next-bridge` that say what each measures
  or gates and that its class tokens are no pattern; next-bridge's module name and its
  "Task 20" comment; `agentRules: false` in `next.config.mjs`. The README of
  toolchain-matrix says what its `matrix` target prints (review item: the target runs
  silent).
- Files: `examples/size/README.md`, `examples/toolchain-matrix/README.md`,
  `examples/next-bridge/README.md` (each new or rewritten), next-bridge's module file and
  `next.config.mjs`.
- Tests first: the README doctests, each with a `// ->` claim, failing until the README
  holds its block.
- Verify: `checks(repo)`, and `checks` over `@nexusdi/size`, `@nexusdi/toolchain-matrix` and
  `@nexusdi/next-bridge`.

### PR 2: the ship model

T15. Registries on the buses (S, after T5, lane M)

- Scope: `ITickLoop.register(system)`, `IPowerRouter.register(consumer)` and
  `ICommandDesk.register(handler)`, each returning an unregister function that runs twice
  safely. `attach` goes. The desk's refusal lists the systems it serves now. `IShipState`
  gains `register(record)` in T19, in the same pattern.
- Files: `simulation/{fixed-step-loop.ts,command-desk.ts}` and their tests,
  `systems/engineering/plasma-router.ts` and its test, the bus interfaces in the
  `contracts.ts` files, `systems/ftl/jump-drive.ts`.
- Tests first: register, unregister and duplicate-name cases per bus.
- Verify: `checks(sys, api)`.

T16. FTL through DI (M, after T15, T10 and T11)

- Scope: owner decision 1. `FtlDrive` provides `FTL_DRIVE`, `FTL_PHYSICS`, `FTL_POWER` and
  `FTL_COMMANDS`, the last three kept inside the module. `FtlCommands` takes
  `lazy(FTL_DRIVE)`, since `JumpDrive` reads `FTL_COMMANDS` to register it, as `RailgunMount`
  takes `lazy(POWER_ROUTER)`. `JumpDrive.onInit` registers the three with the buses, and its
  dispose unregisters them. A test shows the direct dependency fails with
  `NEXUS_CIRCULAR_DEPENDENCY`. bridge-api drops `/ftl/spool` and
  `/ftl/jump`, adds `POST /sections/ftl` behind the section middleware, and sends FTL
  commands through `/commands`. The console's FTL page loads the drive with one button, then
  posts to `/commands`. The README states the rule of decision 1. Amend every section of
  the ship systems spec that names `attach`: 3.2, 3.3, 4.2, 5.7, 5.14, 6.3, 8, 10 and 16.3
  to 16.5. There `register` replaces `attach`, and `FtlDrive` joins the network overlay
  after `POST /sections/ftl`.
- Files: `systems/ftl/*`, `bridge-api/src/bridge/ftl.ts` and the entries,
  `bridge-api/test/{doubles.ts,ftl.test.ts,commands.test.ts}`,
  `bridge-console/app/routes/systems/ftl.tsx`, `meridian-systems/test/{ftl.test.ts,helm.test.ts}`,
  `specs/2026-10-21-meridian-ship-systems-design.md`.
- Tests first: a section added with `load()` adds no multi-token contribution. The test
  reads `all(SHIP_SYSTEMS)`, `all(COMMAND_HANDLERS)` and `all(POWER_CONSUMERS)` before and
  after `load(FtlDrive)` and gets the same entries, while the buses list the drive after
  `JumpDrive.onInit` and drop it on dispose. T19 adds `all(SHIP_RECORDS)` to the test. An
  `FtlDrive` variant that exports `SHIP_SYSTEMS` fails `load()` with
  `NEXUS_LOAD_CONTRIBUTION` (K1). The desk refuses `ftl` before the load, and the desk's system list in `test/helm.test.ts`
  names `ftl` after it.
- E2e bodies that change: `bridge-api/e2e/growth/ftl.e2e.ts`,
  `bridge-console/e2e/growth/ftl.spec.ts`, and the desk refusal text in bridge-api's command
  route tests and its growth `commands` cases.
- Goldens: `ftl.seed-7.json` stays, since the drive steps in the same phase under the same
  name.
- Verify: `checks(sys, api, console)`, then `run(e2e e2e-growth; sys, api, console)`.
  A `grep` of the spec for `attach` lists only lines of the decision log in section 15.

T17. The module graph (L, after T16, T6, T7, and core PRs K1, K3 and K2)

- Scope: decision 2 by section 3.1, with `SubspaceLink` and the single `Comms` and
  `Tactical`, `TICK_LOOP` and `COMMAND_DESK` moved into `Simulation`, `ShipLifeSupport`,
  `MeridianSystems` as a plain constant, `PlasmaRouter` on `lazy(all(POWER_CONSUMERS))`, the
  system modules exporting their contribution tokens, and `AlarmPanel` without `global`.
  The test globals at `test/ship-under-test.ts:31`, `test/safety.test.ts:77` and
  bridge-api's `test/alarms.test.ts:25` go. Amend section 3.2 and the hull section table of the ship
  systems spec.
- Files: every `*.module.ts` in meridian-systems, `meridian-systems.module.ts`,
  `src/index.ts`, every user of `meridianSystems()` (the eight `e2e/*.e2e.ts` files and the
  thirteen `test/*.ts` files, `test/ship-under-test.ts` among them),
  `bridge-api/src/ship/meridian.ts`, `bridge-api/graph.json`, `bridge-api/test/check.test.ts`,
  `bridge-console/app/di/*`, the federation shell's `ship/`,
  `specs/2026-10-21-meridian-ship-systems-design.md`.
- Tests first: a graph of `Simulation`, `MeridianSystems` and `Helm` checks, and `Helm`'s
  node lists `Propulsion` and `Tactical` among its imports; `Weapons`' consumer reaches
  `PlasmaRouter` with no global; `PlasmaRouter` on plain `all(POWER_CONSUMERS)` fails with
  `NEXUS_CIRCULAR_DEPENDENCY` naming the router and the railgun consumer; a system module
  without `exports: [SHIP_SYSTEMS]` fails with `NEXUS_UNREAD_CONTRIBUTION`; `MasterAlarm`
  collects `AlarmPanel`'s sink with no global; a `Helm` without `Tactical` fails
  with `NEXUS_MISSING_PROVIDER`; a graph that imports `ShipLifeSupport` along two paths holds
  one `ATMOSPHERE_PROBE`, and a test module that imports two `forRootAsync` results and
  reads `ATMOSPHERE_PROBE` reports `NEXUS_AMBIGUOUS_PROVIDER`.
- Goldens: none.
- Verify: `checks(sys, api, console, fed)`, then
  `run(e2e e2e-growth; sys, api, console, fed)`. The goldens stay byte-identical.

T17b. The shell grants `Tactical` (S, after T17, T12b and core PR K4, lane A)

- Scope: the federation shell's `Tactical` loses `global: true`, the shell's root imports
  it, and each row of `stations.ts` passes `{ imports: [Tactical] }` to its `lazySection`.
  The station tests replace their test globals with a fake `Tactical` that the test root
  imports and the test's `load()` grants. Its docblock says the shell grants it to each
  station.
- Files: `federation-shell/src/ship/tactical.ts`, `federation-shell/src/stations.ts`,
  `federation-shell/src/ship/meridian.ts`, `federation-cartography/src/cartography.test.ts`,
  `federation-command/src/command.test.ts`, `federation-engineering/src/engineering.test.ts`,
  `federation-life-support/src/life-support.test.ts`, `federation-contracts/src/index.test.ts`,
  the `@nexusdi/federation-contracts/testing` fake.
- Tests first: a contract case: a station loaded without the grant fails with
  `NEXUS_MISSING_PROVIDER` for `meridian/NavCharts`, and with it renders its panel.
- E2e bodies that change: none; the stations show the same data.
- Verify: `checks(fed)`, then `run(e2e; fed)`.

T18. Calibration through real I/O (S, after T17, lane M)

- Scope: `SHIP_FILES` (`IShipFiles.read(name)`) as a `Simulation` option, a Node reader and
  a bundled reader; `ShipLifeSupport` switches its `deps` from `DECK_PLAN` to `SHIP_FILES`
  and reads the calibration through it. The meridian-systems lint config bans `process`
  and every non-relative import under `src/`, so the Node reader lives in bridge-api, and
  `Simulation.forRoot` takes the reader as an option.
- Files: `simulation/{contracts.ts,simulation.module.ts,sim-options-schema.ts}`,
  `simulation/bundled-ship-files.ts` (new, over a relative JSON import) and its test,
  `systems/life-support/life-support.module.ts`, `bridge-api/src/env/ship-files.ts` (new,
  `node:fs/promises`) and its test, the Node entries, `worker.ts` and `worker.offline.ts`.
- Tests first: a fake `SHIP_FILES` that fails the read gives `NEXUS_PROVIDER_FAILED` with the
  file name.
- Verify: `checks(sys, api)`, then `run(e2e test-workers; api)`.

T19. The golden rewrite (L, after T18)

- Scope: owner decisions 3 and 4, in one rewrite.
  - Prep commits, output-neutral: `deck-plan-check.ts` split from the store; the
    `SHIP_RECORDS` token; `ShipRecords` and `ShipSetpoints` as augmentable interfaces; each
    system's `<system>-record.ts`; `IShipState.register(record)` for a record that arrives
    with `load()`, which `JumpDrive.onInit` calls for the FTL record, typed `ftl?:
FtlRecord`; the `pressurised` deck flag with the empty-room unit tests of section 16.7
    of the ship systems spec, among them a `ShipStateStore` test that a plain `Error`
    refuses an unpressurised room that lists equipment or a flood charge.
  - The flip commit: the store builds the snapshot from the contributions, with record keys
    in code-unit order and the power record starting with no loads; the deck grows to the
    14 compartments and 16 doors of section 16.2; the calibration gains the new rooms;
    `habitat-reactor-bay` becomes `engineering-reactor-bay`.
- Goldens: every file under `meridian-systems/e2e/golden/` rewrites in the flip commit. The
  commit message lists the causes: key order, the empty initial power record, the `ftl` key
  that appears once the drive loads, the new rooms and doors, the habitat's two occupants
  and the 3.0 m² hatches. A console spec renders the power page at tick 0 with no loads.
- Tests and e2e bodies that change, from section 16.7: `doors.test.ts`, `gas.test.ts`,
  `safety.test.ts`, `ship-state-store.test.ts`, `blast-door-control.test.ts`,
  `safety-commands.test.ts`, `test/safety.test.ts`, bridge-api's per-system route tests,
  the bridge-api growth frames, the console's doors page with `airlock.spec.tsx`,
  `safety.spec.tsx` and `tests/doubles.ts`. The safety action text in
  `systems/safety/contracts.ts` lists the 16 doors and the 14 compartments, which changes a
  refusal a user sees.
- Docs that change, from section 16.7: `meridian-systems/README.md` names the new door,
  and the ship systems spec updates the figures of sections 5.2 to 5.11 and the vocabulary
  rows of 10.2.
- Verify: `checks(sys, api, console, fed)`, then
  `run(e2e e2e-growth; sys, api, console, fed)`. Only the flip commit changes files under `e2e/golden/`.

### PR 3: coverage and UX

T20. Feature-contract suite (M, after T16 and T17)

- Scope: section 7, with the cases whose feature exists after PR 2. T22, T24, T25 and T27
  add theirs.
- Files: `bridge-api/test/contracts/*.contract.test.ts`,
  `meridian-systems/test/contracts/*.contract.test.ts`,
  `bridge-console/tests/contracts/*.contract.test.tsx`,
  `federation-contracts/src/contracts.contract.test.ts`, `examples/feature-contracts.json`,
  `tools/repo-checks/src/demo-contracts.test.ts`.
- Tests first: the repo-check, failing on a manifest row with no case and on a case with no
  row. The suite is the deliverable, and each case passes against the code of PR 2.
- Verify: `checks(repo, sys, api, console, fed)`, then `run(e2e; api, console, fed)`.

T21. Wiring errors in the types (S, after T17, lane M)

- Scope: section 5, the type-level wiring errors.
- Files: `meridian-systems/test/wiring.test-d.ts` (new). `tsconfig.spec.json` already
  includes `test/**/*.ts`, so the `typecheck` target reads it.
- Tests first: each case sits under `@ts-expect-error`, and each fails `typecheck` as an
  unused directive until its wiring is wrong.
- Verify: `checks(sys)`.

T22. The black-box plugin (M, after T10 and T20, lane A)

- Scope: section 5, the authored plugin, with its contract case and manifest row (section
  7).
- Files: `bridge-api/src/ship/black-box.plugin.ts` (new) and
  `test/black-box.plugin.test.ts`, `src/ship/plugins.ts`, a `bridge-api/test/contracts/`
  case, `examples/feature-contracts.json`.
- Tests first: a plugin test per hook and a `MERIDIAN_SYSTEM_PHASE` refusal with its fix
  line.
- Verify: `checks(repo, api)`.

T23. The profiler (S, after T17, lane A)

- Scope: the `profile` target of section 5 and the dev-only `GET /profile`.
- Files: `bridge-api/project.json`, `src/bridge/profile.ts` (new), the three entries,
  `test/profile.test.ts`.
- Tests first: the route answers 404 outside development and a table with
  `LifeSupportOptions` and `NavCharts` in development.
- Verify: `checks(api)` and `npx nx run @nexusdi/bridge-api:profile`.

T24. Async lifecycle (S, after T17 and T20, lane M)

- Scope: section 5, async `onInit` and dispose on `SubspaceRelay`, with the sign-off in the
  dispose-order contract case.
- Files: `systems/comms/subspace-relay.ts` and its test, `bridge-api/test/shutdown.test.ts`,
  the dispose-order case in `bridge-api/test/contracts/`, `examples/feature-contracts.json`.
- Tests first: the shutdown test asserts the sign-off before the scram.
- Verify: `checks(repo, sys, api)`, then `npx nx run @nexusdi/bridge-api:e2e`.

T25. Interceptor extras (M, after T24, T12b and T20)

- Scope: section 5, the interceptor extras, with the retry case on `SUBSPACE_LINK` and its
  manifest row.
- Files: `systems/comms/comms-commands.ts`, `bridge-api/src/ship/plugins.ts`,
  `src/ship/audit-trail.module.ts`, `src/bridge/audit.ts` (new), the three entries,
  `federation-command/src/helm-orders.ts`, their tests, a `bridge-api/test/contracts/`
  case, `examples/feature-contracts.json`.
- Tests first: the comms log entry per hail, the retry count against a `Failing` link, the
  federation `HelmOrders` binding, `GET /audit`.
- Verify: `checks(repo, sys, api, fed)`, then `run(e2e; api, fed)`.

T26. `useExisting` (S, after T17, lane M)

- Scope: `ALARM_BOARD`, bound with `useExisting` to `MASTER_ALARM`. bridge-api's root
  imports `Safety` for `ALARM_BOARD`, and its alarm route reads only the narrow token.
- Files: `systems/safety/{contracts.ts,safety.module.ts,master-alarm.ts}` and their tests,
  `bridge-api/src/ship/meridian.ts`, `bridge-api/test/alarms.test.ts`, `graph.json`.
- Tests first: `ALARM_BOARD` and `MASTER_ALARM` resolve to one instance.
- Verify: `checks(sys, api)`.

T27. The `react()` plugin (S, after T11 and T20, lane A)

- Scope: registration in development on both console graphs, and the `TransientInRender`
  contract case with its manifest row.
- Files: `bridge-console/app/di/{bridge.server.ts,bridge.client.ts}`,
  `tests/contracts/react.contract.test.tsx` (new), `examples/feature-contracts.json`.
- Tests first: the contract case, which fails until the plugin registers.
- Verify: `checks(repo, console)`, then `npx nx run @nexusdi/bridge-console:e2e`.

T28. The MeridianOS seam (S, after T11, lane A)

- Scope: section 3.9. The hooks first, then the `no-restricted-imports` rule over
  `components/`.
- Files: `bridge-console/app/hooks/{use-ship-reading.ts,use-ship-command.ts}` (new) and
  their specs, `bridge-console/eslint.config.mjs`, every component that imports
  `@nexusdi/*` today.
- Tests first: the hooks' specs over a fake `TELEMETRY_CLIENT`, and a lint run that fails
  on a component importing `@nexusdi/react`.
- Verify: `checks(console)`.

T29. Live gauges and offline actions (M, after T28)

- Scope: section 6, the first two rows.
- Files: `bridge-console/app/bridge/bridge-link.ts` (in `app/di/` after T11) and its test,
  `app/routes/systems/*`, `app/routes/systems/system-action.server.ts`, the console growth
  specs under `e2e/growth/`.
- Tests first: a route spec whose fake stream sends a frame after a command and whose page
  shows the new value; a spec with a failing link that keeps the nav and shows the offline
  reply.
- E2e bodies that change: the console growth specs that wait on a reload wait on the frame.
- Verify: `checks(console)`, then `run(e2e e2e-growth; console)`.

T30. Uncharted stars (S, after T11, lane M)

- Scope: section 6, the third row.
- Files: `systems/tactical/star-charts.ts` and its test, `errors.ts`, `text.ts`, the
  bridge-api entries, `bridge-api/test/routes/tactical.test.ts`, the bridge-api growth
  course cases, the console's `/sectors/Vega` spec.
- Tests first: `plot('Vega')` throws `UnchartedStarError`; `/course/Vega` answers 404 on
  each framework.
- E2e bodies that change: the growth course cases in bridge-api and the console's
  `/sectors/Vega` spec.
- Verify: `checks(sys, api, console)`, then `run(e2e e2e-growth; api, console)`.

T31. Relay, ports and refusal shape (S, after T17, lane A)

- Scope: section 6, the rows on the relay, `/sim/advance` and the two backend URLs. T31
  opens the GitHub issue for the dev-server restarts.
- Files: `bridge-api/scripts/dev-relay.mjs` (new), `bridge-api/project.json` (the `dev`
  target), `src/bridge/sim-ticks.ts`, `test/sim-ticks.test.ts`,
  `meridian-systems/src/text.ts`, `bridge-console/app/bridge/bridge-console.ts`,
  `federation-shell/src/ship/bridge-endpoint.ts` and their tests.
- Tests first: the comms refusal's fix names `RELAY_URL`; `/sim/advance` with a bad body
  answers `{ code, message, fix }`.
- E2e bodies that change: the `/sim/advance` refusal in bridge-api's route tests.
- Verify: `checks(sys, api, console, fed)`, then `run(e2e; api, console)`.

T32. Federation throttle and the FTL fix line (S, after T12b and T16)

- Scope: section 6, the throttle row and the FTL fix-line row.
- Files: `federation-command/src/command-deck.tsx` and `command.test.ts`,
  `meridian-systems/src/errors.ts`, `text.ts`, `systems/ftl/ftl-power.ts` and their tests.
- Tests first: the command deck sends `engineering throttle`; at throttle 1 the spool's fix
  names the loads ahead of it.
- E2e bodies that change: the FTL refusal text in bridge-api's growth `ftl` case and the
  console's growth `ftl.spec.ts`.
- Verify: `checks(sys, api, console, fed)`, then `run(e2e-growth; api, console)`.

### PR 4: docs

T33. READMEs (L, after PR 3)

- Scope: section 6, the README row, and finding 19.
- Files: `examples/{meridian-systems,bridge-api,bridge-console,federation-shell}/README.md`,
  one short `README.md` per station under `examples/federation-<station>/`, the root
  `README.md`'s demo list.
- Method: the prose goes through the `gemma-docs` workflow, and Claude checks each claim
  against the code. Each README runs Context, then Concept, then Detail, opens with what
  the reader can try, and keeps measurement detail out.
- Tests first: every `ts` block is a doctest with a `// ->` claim, and each README's
  doctest fails before its block exists.
- Verify: `checks(repo, sys, api, console, fed)`.

The docs-reviewer agent then reads each README against the style guide.

### PR 5: libs/react

T34. The section fallback reads the `SectionError` (S, after T12b)

- Scope: `SectionBoundary` hands `errorFallback` and `onError` the same `SectionError`, with
  the load error as its `cause`, and the react docs say so. The API is new in 0.4, so no 0.3
  user sees the change. The federation e2e asserts `NEXUS_CONTRACT_VERSION` and
  `NEXUS_CORE_NOT_SHARED` inside the fallback (`federation.spec.ts:69-75,93-99`), so T34
  changes `SectionFailed` in the same commit: it shows the `SectionError`'s code, then the
  cause's code and message. The `SectionFailed` test drops T12b's plain-error case, since
  every error the fallback receives is now a `SectionError`.
- Files: `libs/react/src/section.tsx`, `section.test.tsx`, `section.production.test.tsx`,
  `section.reload.test.tsx`, `libs/react/docs/{guide.md,errors.md}`,
  `apps/docs/content/react.mdx`, `apps/docs/content/api-errors.mdx`,
  `apps/docs/content/errors/NEXUS_REACT_SECTION_FAILED.mdx`,
  `specs/2026-09-24-react-design.md`, `examples/federation-shell/src/section-failed.tsx` and
  its test, `examples/bridge-console/app/routes/charts.tsx`,
  `examples/federation-shell/e2e/federation.spec.ts`.
- Tests first: a section spec whose fallback reads `NEXUS_REACT_SECTION_FAILED` and the load
  error as `cause`, and an `onError` spec that receives the same object.
- Verify: `checks(console, fed)`, `checks` and `run(e2e)` over `@nexusdi/react`, then
  `run(e2e; console, fed)`. The docs pages pass the checks of the `docs-page` skill.

The repo has no changeset files. `nx release changelog` writes each package's notes from
the conventional commits by scope, so the release note is the commit itself:
`fix(react)!: hand the section fallback the section error`, with a `BREAKING CHANGE:` footer
that says a fallback now receives the `SectionError` and reads the load error as its
`cause`. nx lists it under "Breaking Changes" in the notes of the next rc, 0.4.0-rc.3, in
`libs/react/CHANGELOG.md`. The release workflow sets the rc version itself, so the `!`
does not move the version to 0.5.

### Order and size

| PR  | Tasks      | Sizes         | Commits, estimated |
| --- | ---------- | ------------- | ------------------ |
| 1   | T1 to T14  | 5 S, 10 M     | 48                 |
| 2   | T15 to T19 | 3 S, 1 M, 2 L | 28                 |
| 3   | T20 to T32 | 9 S, 4 M      | 40                 |
| 4   | T33        | 1 L           | 6                  |
| 5   | T34        | 1 S           | 3                  |

PR 1 holds 15 tasks, since T12 splits into T12a and T12b. PR 2 holds six with T17b. T17
waits for the core PRs K1, K3 and K2 of `specs/plans/2026-10-28-extension-points.md`, and
T17b for K4. T15 and T16 run while the core PRs are open. The commit counts include a
fix-up per review round. Fix-ups fold into their task commit
before the PR merges, so no PR passes the 100-commit rebase limit.

## 9. Questions the tech lead ruled

Each question has the architect's recommendation. The tech lead's rulings follow in section
9.1, and the owner's in section 10.

- T-Q1. How does FTL load? Recommendation: an explicit `POST /sections/ftl` behind the
  section middleware, so "offline" reads as "not loaded" and a button loads it. A route that
  loads on the first `ftl` command would read the body before the desk.
- T-Q2. In which order does the snapshot list its records? Recommendation: by key in
  code-unit order, so no import order reaches the goldens.
- T-Q3. Where does the initial power record come from? Recommendation: `Engineering`'s record
  contribution starts with no loads, and tick 1 fills them. A record that lists every load
  at tick 0 would make `Engineering` name every consumer.
- T-Q4. Which schema library shows bring-your-own-schema? Recommendation: zod 4 as a
  dependency of meridian-systems. No library under `libs/` gains a dependency.
- T-Q5. Is the doubles rule of section 3.3 right? Recommendation: yes, four prefixes by role.
- T-Q6. Where do a system's laws live? Recommendation: `<system>-model.ts` in the system
  folder, with `physics/` kept for laws two systems share.
- T-Q7. Do stations keep standalone pages? Recommendation: no. The shell hosts every station,
  and each station test mounts its panel. Two `bootstrap.tsx` files go.
- T-Q8. Which dev port does the backend use? Recommendation: 3000 for bridge-api and both
  frontends in dev; the e2e port maps stay.
- T-Q9. How does federation raise the throttle? Recommendation: the command deck gains a
  reactor order. The engineering station stays read-only.
- T-Q10. Is `ALARM_BOARD` the right `useExisting` case? Recommendation: yes. It shows a
  narrower contract over one provider, which a reader meets in real apps.
- T-Q11. Does `meridian-ui` come now? Recommendation: yes, with the components moved
  unchanged, so MeridianOS starts from a clean seam.
- T-Q12. Do `size` and `toolchain-matrix` move out of `examples/`? Recommendation: no. A
  README labels each one, and a move would churn the CI paths and the size scripts.
- T-Q13. Do the console and federation contract cases wait for `demo-apps` to become
  required? Recommendation: T20 adds them, and they gate once `demo-apps` is a required
  check.
- T-Q14. Should `SectionBoundary` hand its fallback the `SectionError` with the load error
  as its cause? Recommendation: yes, as a small `libs/react` fix in its own PR, since a
  fallback that reads `code` then sees `NEXUS_REACT_SECTION_FAILED`.

### 9.1 Tech lead rulings

An opus tech lead checked section 2 against `libs/core` and challenged the plan against the
pillars and the users. The rulings stand, and the sections above already follow them.

- T-Q1: accepted. `di.load(FtlDrive)` already returns the section middleware the route
  needs, and `loadNow` skips the compile for a module the root already imports, so the
  route answers 200 on a loaded drive and the "load once" case holds.
- T-Q2: accepted.
- T-Q3: accepted, with a console spec of the power page at tick 0 (T19).
- T-Q4: accepted, zod 4 pinned exact. The docs page `configurable-modules.md` uses valibot,
  so the pair shows that any Standard Schema library works. T6 reports the Worker bundle
  delta.
- T-Q5 and T-Q6: accepted.
- T-Q7: accepted. Cartography and command also lose `index.html`, the HtmlRspackPlugin entry
  and the bootstrap indirection, and `meridianRemote()` emits the remote entry alone. T12b
  first checks that no e2e serves a remote's own page.
- T-Q8: replaced. Three dev servers cannot share a port. bridge-api listens on 3000, and the
  console and the shell default `BRIDGE_API_URL` to it (section 6).
- T-Q9: accepted.
- T-Q10: accepted. `IMasterAlarm` extends `IAlarmBoard`, so the binding type-checks.
- T-Q11: replaced. Decision 6 builds none of MeridianOS, and a new library would move the
  components twice. The seam is the `hooks/` layer and a lint rule that keeps DI out of
  `components/` (section 3.9, T28).
- T-Q12: accepted.
- T-Q13: accepted. The ruleset change is a GitHub setting, so it went to the owner as A1,
  and the owner made it (section 10).
- T-Q14: accepted as T34. `SectionBoundary` first appeared in 0.4.0-rc, and `onError` gets the
  same `SectionError`.
- O1: the tech lead confirmed section 2's claims in `walk.ts`, `visibility.ts`,
  `define-module.ts` and `load.ts`, and corrected the cycle claim. Only `POWER_CONSUMERS` and
  `SHIP_RECORDS` have a contributor that calls the collector. The two other buses join
  `Simulation`. The first ruling kept core unchanged and used a global `MeridianSystems`. The
  owner reversed it on 2026-10-28 (section 10, O1): the global hid a core gap, and
  `specs/2026-10-28-extension-points-design.md` closes it. The tech lead reviewed that design
  twice and ruled its spec-internal points.
- Other defects the tech lead found, all fixed above: the FTL record needs a registry on
  `SHIP_STATE` (T19); `FtlCommands` needs `lazy(FTL_DRIVE)` (T16); each contract case arrives
  with the task that brings each feature (section 7); T19 runs after T18; `ShipLifeSupport`
  keeps section 3.3's naming; the shield consumer copies the railgun pair (T5); bridge-api
  imports `Safety` for `ALARM_BOARD`; the tasks that change answers a user sees list their
  e2e bodies (section 8).

## 10. Owner rulings, 2026-10-28

The owner ruled on every open item on 2026-10-28. The sections above follow the rulings.

O1. Two global modules, and the core changes K1 to K4: approved.

- The owner first approved three globals (`Simulation`, `SubspaceLink`, `MeridianSystems`),
  plus the global app modules `AlarmPanel` and the shell's `Tactical`. On 2026-10-28 the owner
  said that adding things to global "seems like a copout": the demo is a test case for the container, and a
  workaround that hides a container gap is the wrong answer.
- The case: the power router collects every system's load through a multi token, and the
  railgun calls the router. Under rc.2 a module saw only the contributions of its imports and
  of the globals, and core refuses an import cycle. A library cannot own a collector for the
  same reason, so the gap is core's.
- The rulings: K1 (every multi token collects across the container, `exports` publishes,
  `NEXUS_LOAD_CONTRIBUTION` in `compile()`) goes into 0.4 (rc.3) as the default for every
  multi token, with no import-scoped mode. K2, K3 and K4 are in 0.4 too. rc users are not a
  constraint: "they are aware that new RCs can break things".
- Globals: `Simulation` (the kernel) and `SubspaceLink` (optional, chosen at startup).
  `MeridianSystems` is a plain constant, `AlarmPanel` publishes its sink, and the shell
  grants `Tactical` to each station.
- For users: the demo teaches the 0.4 rule, with every read between systems through an
  explicit import and every contribution published by `exports`. The modules
  `OfflineComms` and `OfflineTactical` and the function `meridianSystems()` go, and no
  package outside `examples/` imports them.

O2. Dedupe of a configured module: resolved, no core change.

- Core keys a module by its definition object, so one `forRoot` result imported along
  several paths is one module, and two `forRoot` calls make two modules (section 2.1).
- A bare import of a configurable module raises `NEXUS_MODULE_OPTIONS_MISSING`, so the
  library configures life support once and exports `ShipLifeSupport`.

A1. `demo-apps` as a required check: done.

The owner added `demo-apps` to the "Demo apps" ruleset, so the console and federation cases
of the feature-contract suite gate a merge from T20 on. T1 rewrites the `ci.yml:144-149`
comment, which still reads "the owner adds this one to the rulesets after three green
runs".

T34. The section fallback reads the `SectionError`: approved.

`SectionBoundary` in `libs/react` hands its fallback the `SectionError`. This changes the
behaviour of a public package, so T34 carries a release note (section 8, PR 5).
