# Meridian G5, Comms and Tactical in the Library: Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Ledger: `.superpowers/sdd/meridian-g5/progress.md` in the main checkout.

Goal: the Starship Meridian gets its phased array. `Comms` and `Tactical` move from `bridge-api` into `@nexusdi/meridian-systems`. The array holds a record in the snapshot (`comms`), a setpoint (`setpoints.comms`) and a load (`comms`, 5 MW at priority 3 on each tick a hail waits on a linked array with no reply outstanding). The crew queues a hail with the new command `comms hail`. Phase 6 sends it when the array has the link and the power and no reply outstanding, and the relay answers `fleet traffic control: sector clear` 2 s later. On the offline graph, which binds no `SUBSPACE_LINK`, the array reports `no subspace link` and keeps the hail queued. No tick calls the link: it downloads the charts once at startup. G5 adds no route. It adds the library module test and a golden, a gating route case on each of the three frameworks, a fifth runtime case, a profile case for the charts download, the console's `/systems/comms` page with its growth case, the G4 review leftovers, and the spec and README text for all of it.

Architecture: one pull request, `feat/meridian-g5-comms`, cut from `origin/release/0.4` at `738146f0` (G0, G0b, G1, G2, G3 and G4 merged). Ledger `.superpowers/sdd/meridian-g5/progress.md` in the main checkout. The library gains `src/physics/comms.ts`, `src/systems/comms/` and `src/systems/tactical/`, and `meridianSystems({ seed, dt, relayUrl? })` imports the pair that matches the options. `bridge-api` loses its comms and tactical files, re-exports the moved names from `contracts.ts` and builds both roots through a private `bridgeShip()`. The console gains the comms page on the shared system-page parts and a fifth growth project. The federation shell and the docs do not change.

Tech stack: Node from `.nvmrc` (24.20.0), TypeScript 6.0.3, Vitest 5.0.5, Nx 23.3.0, Hono 4.13.13, Express 5.3.0, Fastify 5.12.7, React Router 8.4.0, Playwright 1.64, Deno 2.9.6, Bun 1.4.2.

Spec: `specs/2026-10-21-meridian-ship-systems-design.md` (§ below). Earlier plans: `specs/plans/2026-10-21-meridian-g0-kernel.md`, `-g0b-telemetry.md`, `-g1-engineering.md`, `-g2-lifesupport.md`, `-g3-safety.md`, `-g4-airlock.md`. Also the `nexusdi-ways-of-working` skill.

## Owner rulings

1. Earlier e2e cases and goldens stay unchanged, and a golden may only gain lines. Five enumerating unit assertions grow with the ship under the condition of ruling 14.
2. Console gauges use SI units: K as whole numbers, kPa, Pa, mol and W.
3. Deterministic checks gate the growth track: the unit tests, `check.test.ts`'s graph check and the purity checks run in `main`, and `e2e-growth` never gates.
4. The rule of three applies everywhere except lists of figures or ids. No absolute local path and no vault path appears in a committed file.
5. The duplication limit is `.fallowrc.jsonc`'s 2.25 %. The branch targets 2.15 % or less and does not raise the limit.

## Rulings this plan carries

The architect proposed and the tech lead decided these on 2026-10-22. The tech lead's text overrides the architect's. The full text and the node scripts behind each figure sit in the session scratchpad's `meridian-g5/` folder (`architect.md`, `rulings.md`, the `arch-*` and `tl-*` scripts and their logs). Task 9 writes them into the spec, each as "tech lead, G5 ruling N".

1. Scope. G5 adds one crew command, `comms hail`, with no argument. Phase 6 gives the queue its meaning (queued messages and hails), S6 starts every system idle, and without a command no run ever queues a hail. The desk's `POST /commands` already reaches every system through `COMMAND_HANDLERS`, so the command adds no route. `comms send` with free text, a station argument, the `LaserLink` transport and a link that drops or returns during a run stay out (§13).
2. The record and the setpoint. `ShipSnapshot` gains `comms: CommsRecord` and `Setpoints` gains `comms: CommsSetpoints`, each after `lifeSupport` in the type and in `ShipStateStore`'s initial snapshot: `{ status: 'standby', sent: null, messages: [] }` and `{ hail: false }`. The store freezes the record, its `messages` array, each message and `setpoints.comms`. `stepComms` returns frozen records and `CommsPhysics` returns a frozen snapshot with frozen setpoints.
3. Phase 6. `CommsPhysics` (phase 6, `name: 'Comms'`, deps `[COMMS_ARRAY]`) delegates to the pure `stepComms(record, setpoints, { tick, dt, linked, shed })`. Each tick, in this order: (1) a reply falls due when the record reads `awaiting reply` and `(tick − sent) · dt ≥ RELAY_ROUND_TRIP` (2 s): the array appends `{ tick, from: 'fleet traffic control', text: 'sector clear' }`, keeps the newest `MESSAGES_KEPT` (10) messages and returns to `standby`. (2) A queued hail, judged on the record the tick started with: while the array awaits a reply the hail waits: the flag stays true, and the record changes by step 1 alone; with no link the status reads `no subspace link` and the flag stays true; with the link and `power.shed` holding `comms` the status reads `no power` and the flag stays true; with the link and power the array sends (`awaiting reply`, `sent: tick`, flag false). (3) With no hail and no reply due, `stepComms` returns the objects it got and `CommsPhysics` returns the ship it got. A hail waits while the array cannot send it, for any reason, so a hail queued behind an outstanding reply goes out on the tick after the reply. At dt 0.5 the reply comes 4 ticks after the send, at dt 1 two ticks after.
4. Power. `CommsPower` draws `COMMS_LOAD = { id: 'comms', priority: 3, demand: 5e6, heatShare: 0 }` with the demand of the pure `commsDemand(record, setpoints, linked)`: 5,000,000 W when `linked && setpoints.hail && record.status !== 'awaiting reply'`, read from the snapshot at the start of the tick, and 0 W otherwise. `ShipStateStore`'s tick-0 power record lists the 0 W `comms` load after `shields`. A 0 W load fits any remainder, so an idle or offline ship never sheds it and raises no alarm. On a linked ship with a cold reactor the router sheds the queued hail's 5 MW, and Safety raises `LOAD_SHED comms` until the reactor gives power. `divert` serves the shields at priority 2 before comms at 3, so `PowerBudgetError` stays as it is. The 5 MW on each tick a hail waits on a linked array with no reply outstanding extends §5.7, which gives the figure and leaves the timing open.
5. Determinism. No tick calls `ISubspaceLink.receive`. The link does I/O once per container build, in `Tactical`'s async `NAV_CHARTS` factory, which `Nexus.create` awaits. The tick reads `PhasedArray.linked`, a fact the graph fixes at construction. The library's ESLint config refuses `fetch` in every file under `src` except `src/systems/comms/subspace-relay.ts`: the main `src/**/*.ts` block lists `fetch` beside `HOST_GLOBALS` with the message "A tick does no I/O, so src/systems/comms/subspace-relay.ts alone calls fetch.", and a block for the relay file sets `no-restricted-globals` to `HOST_GLOBALS` alone. `tools/repo-checks/src/meridian-purity.test.ts` pins the set with `fetch` for `src/simulation/x.ts` and `src/physics/gas.test.ts`, the set without it for the relay file, and one lint case that calls `fetch` in another file and fails.
6. `ICommsArray` and `PhasedArray`. `ICommsArray` has `readonly linked: boolean` ("True when the ship's graph binds SUBSPACE_LINK.") and `hail(): QueuedCommand` ("Queues a hail of fleet traffic control. The array sends it on the first tick it has the link and the power and no reply outstanding."). `PhasedArray` (`COMMS_ARRAY`, singleton, `static deps = [SHIP_STATE, optional(SUBSPACE_LINK)] as const`) sets `linked` from `link !== undefined` in its constructor, and `hail()` returns `state.queue({ comms: { hail: true } })`. Its docblock says the simulation models the array's traffic and reads the link's presence alone.
7. The modules. `Comms` (options `COMMS_OPTIONS`, binds `SUBSPACE_LINK` with `SubspaceRelay` beside the four array providers) and `OfflineComms` (the four array providers, no link) share one `ARRAY_PROVIDERS` list and one `ARRAY_EXPORTS` list. `Tactical` binds `NAV_CHARTS` with the async download factory over `SUBSPACE_LINK` and imports nothing. `OfflineTactical` binds `new StarCharts(BUNDLED_CHARTS)` as a value. `meridianSystems({ relayUrl, ...sim })` picks `[OfflineComms, OfflineTactical]` without a relay and `[Comms.forRoot({ frequency: 1420, transport: 'relay', relayUrl }), Tactical]` with one and imports and re-exports both. It hands `Simulation.forRoot` `{ seed, dt }` alone. A module's providers are static, so a configured `Comms` cannot leave its link out, and the offline graph needs a module with no link binding for `optional()` to resolve undefined. The rejected forms (one `Comms` with an optional `relayUrl`, a separate relay module, a `tactical(relayUrl)` function, one `Tactical` over `optional(SUBSPACE_LINK)`) are in the scratchpad's `rulings.md`. `Tactical` reads the link through the global aggregate's re-export of the `Comms` instance. `Tactical` alone fails `Nexus.check` with `NEXUS_BLUEPRINT_INVALID`, so the index exports no module object beside `meridianSystems`. The aggregate stays under the 120-line limit.
8. Library files and exports. The move commit uses `git mv` for `examples/bridge-api/src/ship/star-charts.ts` to `examples/meridian-systems/src/systems/tactical/star-charts.ts`, `examples/bridge-api/src/ship/charts.json` to `examples/meridian-systems/deck/charts.json`, `examples/bridge-api/src/ship/comms.module.ts` to `examples/meridian-systems/src/systems/comms/subspace-relay.ts` and `examples/bridge-api/src/ship/tactical.module.ts` to `examples/meridian-systems/src/systems/tactical/tactical.module.ts`, then edits them, so the relay and the charts keep their history. Task 1 therefore adds no copy of `SubspaceRelay`, `StarCharts` or the chart table. `src/systems/comms/subspace-relay.test.ts` sits beside the class and stubs `fetch` with `vi.stubGlobal('fetch', …)` and `vi.unstubAllGlobals()`, since the `src` lint refuses `globalThis`. It asserts the URL for a `relayUrl` with and without a trailing slash (`/charts?frequency=1420`) and the `relay answered 503 for charts` error. `test/comms.test.ts` stubs `fetch` the same way. The index exports `MeridianSystemsOptions`, the tokens `NAV_CHARTS`, `SUBSPACE_LINK`, `COMMS_OPTIONS` and `COMMS_ARRAY`, the value `BUNDLED_CHARTS`, and the types `Course`, `INavCharts`, `ISubspaceLink`, `CommsOptions`, `ICommsArray`, `CommsRecord`, `CommsSetpoints`, `CommsStatus` and `CommsMessage`. Token descriptions stay `'NavCharts'`, `'SubspaceLink'`, `'CommsOptions'`, and `COMMS_ARRAY` is `'CommsArray'`. The library imports nothing from `bridge-api`, Comms joins through `SHIP_SYSTEMS`, `POWER_CONSUMERS` and `COMMAND_HANDLERS`, no logic exists twice, and G5 adds no optional dependency (P1 to P5).
9. `bridge-api` after the move. `src/ship/contracts.ts` re-exports `NAV_CHARTS`, `SUBSPACE_LINK`, `COMMS_OPTIONS` and the types `Course`, `INavCharts`, `ISubspaceLink`, `CommsOptions` from the library. `meridian.ts` builds both roots through the private `bridgeShip(name, systems, mode)`; `meridian(relayUrl, setup)` passes `{ ...setup.sim, relayUrl }` and `offlineMeridian(setup)` passes `setup.sim`. `e2e/relay.ts` serves `BUNDLED_CHARTS`. `plugins.ts`, the entries, `ship-from-env.ts` and `bench/` stay. G5 adds no route. `@nexusdi/bridge-api/ship` loses `Comms`, `tactical` and `OfflineTactical`, and `package.json` loses the `./offline` export. `git grep` finds no importer of any of them outside `specs/`, and `bridge-api` is `"private": true`, so the removal needs no owner decision. The `bridge-api` README names `Tactical` in `meridian.ts`; Task 8 rewrites that line.
10. `bridge-api` tests. `test/fixtures.ts` stays byte-identical: `override(NAV_CHARTS, { useClass: FakeCharts })` replaces the library's `Tactical` factory, so the build fetches nothing, and the fixture's ship is linked. `test/check.test.ts`'s notes case drops `'OfflineTactical'` from `bridgeModules` and gains the Comms and Tactical notes (numbers section). `graph.json` redraws in the move commit. `test/profile.test.ts` keeps its case byte-identical and gains `profiles the charts download of Meridian beside the LifeSupportOptions factory`, over `createTestingContainer(Meridian).override(SUBSPACE_LINK, { useClass: LoopbackLink })`. `LoopbackLink implements ISubspaceLink` joins `test/doubles.ts` and answers `BUNDLED_CHARTS`. `test/routes.test.ts` gains `the comms commands on %s` on Hono, Express and Fastify, after every existing block. `offlineHail` joins `growthCases` as the fifth case, named "a hail on the offline ship reports no subspace link and keeps its queue", and `e2e/growth/comms.e2e.ts` runs it on the three Node servers through `withShip`. The harnesses stay as G4 left them.
11. The federation shell. G5 changes no federation file. The shell imports nothing from `bridge-api`, its `Tactical` provides the contract's `meridian/NavCharts` over its own table, and `e2e/bundle.spec.ts` keeps its six sentinel tokens. A seventh sentinel `'CommsArray'` stays out, since it would edit the sentinel lists of two earlier e2e cases.
12. Library tests and the golden. `src/physics/comms.test.ts` asserts the wait rule of ruling 3 and the frozen records of ruling 2. `test/comms.test.ts` runs B1 to B4 of the numbers section, and both linked builds use `relayUrl: 'https://relay.test'` with `fetch` stubbed by `vi.stubGlobal` to answer `Response.json(BUNDLED_CHARTS)`. `e2e/comms.e2e.ts` uses the same URL and stub. Its golden `e2e/golden/comms.seed-7.json` holds `roundSnapshot` at ticks 1, 5 and 600, 494 lines. With the G5 fields stripped, its ticks 1 and 600 equal the life-support golden's ticks 1 and 600 byte for byte. `test/simulation.test.ts:59` expects `'comms, engineering, life-support and safety'`, and `src/simulation/ship-state-store.test.ts:324` lists the 0 W `comms` load third: `{ id: 'comms', priority: 3, demand: 0, allocated: 0 }`. Each keeps its test name.
13. The console. `/systems/comms` is a static route in `ship-layout.tsx`, with a nav link "Comms" after "Safety". Gauges `Status`, `Hail queued` (`Yes` or `No`), `Last hail sent` (`tick N` or `none`) and `Array power` (MW to one decimal through `fixed()`); a "Messages" list (`fleet traffic control: sector clear (tick 5)`, or `No messages`); one button "Hail fleet traffic control" posting `command=hail` through `systemAction('comms', {})`; `SnapshotOffline` when the backend fails. `ItemList({ label, none, items })` joins `system-page.tsx`, and safety's alarms move onto it with the same markup, so `tests/routes/safety.spec.tsx` passes unchanged. `shipAtStart` gains the comms fields in Task 1's second commit and the 0 W load in the move commit, and every other `ShipReading` double spreads it. `tests/routes/comms.spec.tsx` also covers a waiting reading. The growth case `e2e/growth/comms.spec.ts` runs in a fifth Playwright project `comms` with `dependencies: ['airlock']`, and `chromium`'s `testIgnore` becomes `/(life-support|safety|airlock|comms)\.spec\.ts/`.
14. Earlier assertions and goldens. Five enumerating unit assertions state what the ship holds, so they grow with it: (1) `examples/meridian-systems/test/simulation.test.ts:59`, the desk's list gains `comms`; (2) `examples/meridian-systems/src/simulation/ship-state-store.test.ts:324`, the tick-0 loads gain the 0 W `comms` entry; (3) `examples/bridge-api/test/check.test.ts`, `bridgeModules` loses `'OfflineTactical'` and the notes case gains the Comms and Tactical notes; (4) `tools/repo-checks/src/meridian-purity.test.ts`, the pinned globals set gains `fetch`; (5) `examples/bridge-console/tests/charts.test.ts`, the path becomes `../../meridian-systems/deck/charts.json` and the test name becomes `holds the same headings as the simulation's charts`, since the old name names bridge-api's charts, which the move deletes. The condition: only the enumerated value changes and the test name stays true. No earlier unit test changes a figure it checks, with the rename in (5) as the stated exception. With the G5 fields stripped, the four replays equal the committed goldens byte for byte. The G5 files gain exactly the comms record, `setpoints.comms` and the 0 W load at every pinned tick: idle +42 −0, life-support +42 −0, safety +42 −0, airlock +70 −0, split by ruling 20 into +24, +24, +24 and +40 in Task 1's second commit and +18, +18, +18 and +30 in the move. Earlier e2e test bodies need no edit.
15. The G4 leftovers and a rule conflict. The texts: the two `airlock.spec.tsx` comments (each also loses a list of three), the README's "The drill adds no command and no module.", the reflow of `e2e/growth/airlock.spec.ts:12-15`, and `} as const satisfies Readonly<Record<string, string>>;` in `app/routes/airlock.tsx`. The owner asked for the reflow, which edits lines inside G4's `test(...)` body, and another owner rule keeps earlier e2e test bodies byte-identical. Ruling: apply the reflow. The byte rule keeps a later increment from changing what an earlier case does or checks, and the reflow moves line breaks inside one comment (same words in the same order, line 12 unchanged, widths 79, 79, 79 and 54). The reviewer checks it with `git diff --word-diff`, which must show no word change. The reflow goes in its own commit so one revert undoes it if the owner rules the other way.
16. Docs safety. G5 changes no file under `apps/docs` or `examples/meridian`, and nothing there imports `@nexusdi/bridge-api`, `@nexusdi/meridian-systems` or `@nexusdi/bridge-console`. Every docs region defines its own `Comms`, `Tactical`, `NAV_CHARTS` and `SUBSPACE_LINK`. The bridge-api sentences in `vitest.mdx:88`, `hono.mdx:110`, `express.mdx:115`, `fastify.mdx:117` and `graph-cli.mdx:114` stay true.
17. Duplication. `npx fallow dupes` reads 2.1055 % at `738146f0` (1,402 of 66,587 lines, 91 clone groups). At 2.15 % the branch may add 29 duplicated lines plus 2.15 % of its new counted lines, about 43 lines for 650 counted lines. Fallow counts `*.e2e.ts` and plain `.ts` and `.tsx` files and leaves out `*.spec.*` and `*.test.*`. `e2e/growth/comms.e2e.ts` beside `airlock.e2e.ts` may form a group of about 9 lines a side; `airlock.e2e.ts` stays byte-identical and the budget holds the group. Each task that adds a counted file runs `npx fallow dupes` and records the figure.
18. Spec errors and amendments. The architect's seven spec errors stand: (1) §3.2's `Comms` row exports `SUBSPACE_LINK` and `COMMS_ARRAY` alone and lacks `SHIP_SYSTEMS`, `COMMAND_HANDLERS` and `POWER_CONSUMERS`; (2) §3.2 says "G6 and G8 contribute their loads the same way" while §5.7 gives comms a load; (3) §6.3 has `FtlDrive` import `Tactical`, which would add the relay factory to the offline graph; (4) §3.2 gives `Comms.forRoot` and an offline graph with no link, but a configured module's providers are static; (5) §3.3 has no rows for `ISubspaceLink` or `INavCharts`; (6) §6's profiler row reads as if `nexusdi profile` shows the download, but `DEFAULT_RELAY_URL` is an `.invalid` host; (7) §15's G0 ruling 3 types the aggregate as `meridianSystems(options: SimOptions)`. The tech lead adds an eighth: §4.1's list of the snapshot's records lacks comms. Task 9 applies the architect's section 10 with these changes. §4.3: "From G5 `src/systems/comms/subspace-relay.ts` alone calls `fetch`, and the library's ESLint config refuses `fetch` in every other file under `src`. The relay runs in `NAV_CHARTS`'s factory at startup, and no tick reads the link." New §5.12 Comms: the rules of ruling 3 (the wait rule included), the 2 s round trip (4 ticks at dt 0.5), the newest 10 messages, and the figures of B1, B2, B3 and C. §3.3: `ICommsArray.hail()`'s sentence reads "queues `{ comms: { hail: true } }`; the array sends it on the first tick it has the link and the power and no reply outstanding". §8.1 and §8.2: the items of ruling 12. §8.3: the runtime sentence names the fifth case and the agreement of Node, Deno and Bun on it. §7.2's paragraph on `ItemList` names `tests/routes/safety.spec.tsx` as unchanged. §13: "G5 leaves out a crew message (`comms send` with text), a station argument, the `LaserLink` transport, a link that drops or returns during a run, a schema for `CommsOptions` and a seventh bundle sentinel." §15: the rows below, and the closing paragraph lists `specs/plans/2026-10-21-meridian-g5-comms.md`. The remaining sections (§3.1, §3.2, §4.1, §4.2, §5.7, §6, §6.3, §7.1, §7.2, §7.4, §10.1, §10.2) take the text of the architect's section 10 as it stands.
19. Commits and parallel work. The move is one commit, because the per-commit gate forces it: the aggregate's import of `Comms` and `Tactical` changes the graph, so `graph.json` and `check.test.ts` go with it; the store's tick-0 comms load changes `ship-state-store.test.ts:324`; the 0 W load forces the load entry in `shipAtStart`; and `bridge-api`'s deletions go in the same commit as the aggregate, or the relay graph would bind two charts providers. A split would redraw `graph.json` twice and leave an intermediate graph with two tokens described `'SubspaceLink'`. Two tasks run together only when they touch different Nx projects, since the pre-commit hook lints each affected project's working tree and a per-commit gate run reads a peer's uncommitted edits. Parallel implementers commit with `git commit -- <paths>`. Task order is in the Tasks section.

20. Where the snapshot widening goes. This amends ruling 19: the snapshot widening goes in Task 1's second commit, and the 0 W load stays in the move commit. Casts in tests would test a snapshot type the library does not have, so they are out. A move commit that also held the four classes would be too large to review. If the store listed the 0 W load at tick 0 before the router had `CommsPower`, tick 0 would list a `comms` load that ticks 1 and later drop, so the load and its consumer go in together. Task 1's second commit, `feat(meridian-systems): add the comms record and the phased array's classes`, carries: (1) `ShipSnapshot.comms` and `Setpoints.comms`, each after `lifeSupport`, and `ShipStateStore`'s initial `{ status: 'standby', sent: null, messages: [] }` and `{ hail: false }`, frozen at every level, with the store's loads as they are; (2) `examples/meridian-systems/src/systems/comms/contracts.ts` with `SUBSPACE_LINK`, `COMMS_OPTIONS`, `COMMS_ARRAY`, `ISubspaceLink`, `CommsOptions`, `ICommsArray` and `COMMS_ACTIONS`, and `PhasedArray`, `CommsPhysics`, `CommsPower` and `CommsCommands`, each with its test, in no module (`bridge-api` keeps its own tokens until the move, and the two `'SubspaceLink'` tokens share no graph for that commit, since the library's classes sit in no module); (3) the console's `tests/doubles.ts`, whose `shipAtStart` gains `comms` and `setpoints.comms`; (4) the four goldens rewritten with `-u` after one run without it, each gaining the two records alone: idle +24 −0, life-support +24 −0, safety +24 −0, airlock +40 −0 (`arch-golden-*.g5.json` against the committed files). The move commit then carries the wiring, the 0 W `comms` load in the store's tick-0 allocation, `ship-state-store.test.ts:324`, the load entry in `shipAtStart` and the second `-u` rewrite, which adds the load alone: +18 −0, +18 −0, +18 −0 and +30 −0 (`arch-golden-*.g5.json` against `*.with-load.json`). After both commits each golden equals `tl-golden-*.g5.json` (+42, +42, +42, +70 against `738146f0`), and each commit's golden diff only gains lines. Each of the two commits runs the ruling 19 gate plus `npx nx run-many -t typecheck -p @nexusdi/meridian-systems @nexusdi/bridge-api @nexusdi/bridge-console --parallel=2`, the console's `test` target and the library's `e2e-growth` once. Task 1 defines the link tokens and types in the library's `comms/contracts.ts`, and the move commit turns `bridge-api`'s definitions into re-exports. The order stays 3 beside 5, then 4 beside 6.

The §15 rows G5 adds, each dated 2026-10-22 and ending "tech lead, G5 ruling N":

1. G5 adds the crew command `comms hail`, with no argument, and no other.
2. The snapshot gains `comms` and `setpoints.comms` after `lifeSupport`; the store and phase 6 freeze them.
3. Phase 6 answers a due reply, `fleet traffic control: sector clear`, 2 s after the send, and sends a queued hail when the array has the link and the power and no reply outstanding; otherwise the hail waits under `no subspace link`, `no power` or `awaiting reply`.
4. `CommsPower` draws 5 MW at priority 3 on each tick a hail waits on a linked array with no reply outstanding and 0 W otherwise, with heat share 0.
5. No tick calls the link, which downloads the charts once at startup; the library's lint refuses `fetch` outside `subspace-relay.ts`.
6. `PhasedArray` (`[SHIP_STATE, optional(SUBSPACE_LINK)]`) reads `linked` at construction and queues the hail.
7. `meridianSystems({ seed, dt, relayUrl? })` imports `Comms.forRoot` and `Tactical` with a relay and `OfflineComms` and `OfflineTactical` without one, and re-exports both.
8. `SubspaceRelay`, `StarCharts` and the chart table move into the library with `git mv`, and the library exports no module object beside `meridianSystems`.
9. `bridge-api` re-exports the moved names from `contracts.ts` and drops `Comms`, `tactical`, `OfflineTactical` and `./offline`, which nothing imports; no route changes.
10. `bridge-api` gains `the comms commands on %s`, the fifth runtime case `offlineHail` and the profile of the relay graph's download with `LoopbackLink`.
11. The federation shell does not change.
12. The library gains `test/comms.test.ts` and the golden `comms.seed-7.json` at ticks 1, 5 and 600.
13. The console gains `/systems/comms` on the shared system-page parts with `ItemList`, and a fifth growth project `comms`.
14. Five enumerating unit assertions grow with the ship; every earlier golden only gains lines (42, 42, 42 and 70); the four goldens gain the comms records in one commit and the 0 W load in the move.
15. The four G4 review leftovers take the architect's text; the airlock growth comment's reflow goes in its own commit.
16. G5 changes no docs page or docs region.
17. `npx fallow dupes` stays at 2.15 % or under from 2.1055 %.

## Numbers the tests assert

Every figure comes from the tech lead's scripts (`tl-figures.log`, `tl-runtime.log`, `tl-notes.log`, `tl-golden-comms.log`). Where the architect's figure differs, the tech lead's holds (B3 alone). Each task's reviewer recomputes the ones its task asserts.

Library unit test `src/physics/comms.test.ts`:

- idle step: `stepComms` returns the record and the setpoints objects it got;
- offline hail: `no subspace link`, flag true; linked and shed: `no power`, flag true; linked with power: `awaiting reply`, `sent` = tick, flag false;
- reply at dt 0.5 with `sent: 10`: tick 13 still `awaiting reply`, tick 14 `standby`; at dt 1 the reply comes at `sent + 2`;
- the reply is `{ tick, from: 'fleet traffic control', text: 'sector clear' }`; eleven replies keep the newest 10;
- a hail while awaiting: flag stays true, record unchanged unless the reply is due;
- `commsDemand`: 5,000,000 W when it sends; 0 offline, 0 while awaiting, 0 idle;
- every level of a stepped record is frozen.

Library module test `test/comms.test.ts` (gating), `meridianSystems({ seed: 7, dt: 0.5 })` offline and with `relayUrl: 'https://relay.test'`:

| Ship         | Assertion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| offline      | `Nexus.check` passes; `COMMS_ARRAY.linked` false; `NAV_CHARTS.plot('Kepler-442b')` heading 42; `comms hail` `{ tick: 1 }`; at ticks 1 and 20 `{ status: 'no subspace link', sent: null, messages: [] }`, `hail: true`, comms load `{ id: 'comms', priority: 3, demand: 0, allocated: 0 }`, `shed: []`, no alarm; a second hail `{ tick: 21 }`; tick 600 the same; log ticks `[1, 21]`; `comms send` refused, `reason: 'action'`, `expected: 'hail with no arguments'`; the desk's list `'comms, engineering, life-support and safety'` |
| linked build | one fetch, `https://relay.test/charts?frequency=1420`; `linked` true; none during 10 ticks with a hail                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| B1           | throttle 0.01 and hail at tick 0, each `{ tick: 1 }`; tick 1 `awaiting reply`, `sent: 1`, load demand and allocation 5,000,000 of output 12,100,000; ticks 2 to 4 load 0 W; tick 5 `standby` with `[{ tick: 5, from: 'fleet traffic control', text: 'sector clear' }]`; log `[{ tick: 1, change: { reactor: { throttle: 0.01 }, comms: { hail: true } } }]`                                                                                                                                                                            |
| B2           | hail at tick 0, reactor cold: ticks 1 to 3 `no power`, `hail: true`, demand 5,000,000, allocated 0, `shed: ['comms']`, alarms `[{ code: 'LOAD_SHED', subject: 'comms' }]`; throttle after tick 3 `{ tick: 4 }`; tick 4 sends (`sent: 4`, allocated 5,000,000, `shed: []`, no alarm); reply at tick 8                                                                                                                                                                                                                                   |
| B3           | throttle and hail at tick 0; a second hail after tick 2 `{ tick: 3 }`; ticks 3 and 4 `awaiting reply`, `sent: 1`, `hail: true`, 0 W; tick 5 `standby`, reply at 5, `hail: true`, 0 W; tick 6 `awaiting reply`, `sent: 6`, `hail: false`, 5,000,000 W; tick 10 `standby`, messages at ticks 5 and 10; log ticks `[1, 3]`                                                                                                                                                                                                                |
| B4           | throttle at tick 0, then eleven times a hail and 5 ticks: tick 55, 10 messages, oldest at tick 10, newest at tick 55, `sent: 51`                                                                                                                                                                                                                                                                                                                                                                                                       |

Library golden `e2e/golden/comms.seed-7.json` (`e2e-growth`, Node from `.nvmrc`): relay graph, `fetch` stubbed, throttle 0.01, `online` and `hail` at tick 0; ticks 1, 5 and 600; 494 lines; stripped ticks 1 and 600 equal `life-support.seed-7.json`'s ticks 1 and 600. Earlier goldens: idle +42 −0, life-support +42 −0, safety +42 −0, airlock +70 −0.

`bridge-api` route case `the comms commands on %s` (gating; Hono, Express, Fastify):

| Ship                               | Requests                                  | Answer                                                                                                                                                                                                                    |
| ---------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nexus` fixture (linked, no fetch) | `engineering throttle 0.01`, `comms hail` | each 202 `{ tick: 1 }`                                                                                                                                                                                                    |
| same, `POST /sim/advance` 1        | `GET /sim`                                | `comms` `{ status: 'awaiting reply', sent: 1, messages: [] }`, `setpoints.comms` `{ hail: false }`, load `{ id: 'comms', priority: 3, demand: 5000000, allocated: 5000000 }`                                              |
| same, 4 more ticks                 | `GET /sim`, `GET /commands`               | `comms` `{ status: 'standby', sent: 1, messages: [{ tick: 5, from: 'fleet traffic control', text: 'sector clear' }] }`, no alarm; one entry `{ tick: 1, change: { reactor: { throttle: 0.01 }, comms: { hail: true } } }` |
| `OfflineMeridian`                  | `comms hail`, 20 ticks, `GET /sim`        | 202 `{ tick: 1 }`; `comms.status` `no subspace link`, `setpoints.comms.hail` true, no alarm                                                                                                                               |
| either                             | `comms send`                              | 400 `{ code: 'MERIDIAN_BAD_COMMAND', message: "comms has no action 'send'. It takes hail with no arguments.", fix: 'send one of the actions above with its arguments.' }`                                                 |

`bridge-api` profile case: awaited builds `LifeSupportOptions` (`LifeSupport`, singleton, level 0, `failed: false`) then `NavCharts` (`Tactical`, singleton, level 1, `failed: false`); the graph lists both as `factory`; the existing case's offline awaited list stays `['LifeSupportOptions']`.

`bridge-api` `offlineHail` (`e2e-growth` on Hono, Express, Fastify, workerd, Deno, Bun), `OfflineMeridian` from tick 0: `comms hail` 202 `{ tick: 1 }`; `advanceTo(fetch, 20, 20)`: `comms` `{ status: 'no subspace link', sent: null, messages: [] }`, `setpoints.comms.hail` true, load `{ id: 'comms', priority: 3, demand: 0, allocated: 0 }`, no alarm; `comms hail` 202 `{ tick: 21 }`; `advanceTo(fetch, 580, 600)`: the same; `GET /commands` ticks `[1, 21]`. Node, Deno and Bun agree byte for byte (final `/sim` FNV-1a `cab1e7fa` over 1,656 bytes).

`check.test.ts` notes: `CommsArray`, `PowerConsumers`, `CommandHandlers in OfflineComms` `['system: OfflineComms']`; `ShipSystems in OfflineComms` `['system: OfflineComms', 'phase: 6']`; `NavCharts in OfflineTactical` `['system: OfflineTactical']`; `bridgeModules` `BridgeApi`, `AuditTrail`, `AlarmPanel`, `SimDriver`, with every provider unlabelled.

Console route spec `tests/routes/comms.spec.tsx` (gating): tick 0 `standby`, `No`, `none`, `0.0 MW`, `No messages`; send tick `awaiting reply`, `No`, `tick 1`, `5.0 MW`; waiting `awaiting reply`, `Yes`, `tick 1`, `0.0 MW`; reply `standby`, `No`, `tick 1`, `0.0 MW`, `fleet traffic control: sector clear (tick 5)`; offline ship `no subspace link`, `Yes`, `none`, `0.0 MW`; the button posts `{ system: 'comms', action: 'hail' }` and shows `Queued for tick 1`; the offline page.

Console growth case (`comms` project, from the ship's tick `t`): `standby`, `No`; the button shows `Queued for tick t + 1`; after 10 backend ticks and a reload `no subspace link`, `Yes`, `none`, `0.0 MW`, `No messages`; no console error.

Duplication: base 2.1055 % (1,402 of 66,587 lines); end at 2.15 % or under.

## Global Constraints

- Worktree `.claude/worktrees/feat/meridian-g5-comms`. Prefix every nx command and every `git commit` and `git push` with `NX_NO_CLOUD=true NX_DAEMON=false`. Every nx command takes `--parallel=2`. Never touch the main checkout or switch a branch.
- The branch holds 100 commits or fewer (GitHub's rebase merge refuses more). A task with code or text is one to four commits, 20 in all before fix-ups. Fix-ups go in `git commit --fixup=<sha>` commits of the commit each fix belongs to and fold before the PR.
- Every commit passes `npx nx test @nexusdi/meridian-systems --parallel=2` and `npx nx test @nexusdi/bridge-api --parallel=2 -- test/check.test.ts` on its own, and the final `rebase -x` checks it. G5's move commit changes the graph, so it carries the regenerated `graph.json` (`npx nx run @nexusdi/bridge-api:graph --parallel=2`) and the `check.test.ts` notes. Every other commit leaves the graph alone: the Task 1 classes sit in no module, and the later tasks add tests and console files. Tasks 3 and 4 run the `graph` target (it ends in `git diff --exit-code graph.json`) to confirm that.
- Task 2 also runs the full `bridge-api` and console `test` targets and `npx nx test @nexusdi/repo-checks --parallel=2 -- meridian-purity`.
- Parallel work in one worktree: stage your own files by path (`git add <paths>`), never `git add -A` or `git commit -a`, check `git diff --cached --name-only` before each commit, and commit with `git commit -- <paths>` so a peer's staged files stay out. If `index.lock` exists, wait 10 s and retry. If the pre-commit hook fails on a peer's uncommitted edit, report it and leave the peer's files alone.
- Never `--no-verify`, never `HUSKY=0` or any other way to skip a hook, never a bare `git stash`, never a merge commit, never a push before the final task.
- Commit subjects follow conventional commits with a scope from `commitlint.config.js` (`meridian-systems`, `bridge-api`, `bridge-console`, `specs`), lowercase, no `@` anywhere in the message, body lines wrapped at 100 characters. Each message ends with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, whichever model writes it.
- Test first: write the failing test, run it, see it fail, then implement.
- Prose in READMEs, comments, specs and commits follows the writing rules of `nexusdi-ways-of-working`. Every example is interface-first (`Token<IFoo>` with `useClass`).
- Run `npx prettier --write` on every file a task changes.
- Duplication: `npx fallow dupes` ends at 2.15 % or under on the measured figure (start 2.1055 %), and `.fallowrc.jsonc` keeps its 2.25 % limit untouched. Each task that adds a counted file records the figure in its hand-back.
- Helpers and probe scripts live in the session scratchpad's `meridian-g5/` folder only, prefixed by task (`t5-...`). A committed file never holds an absolute local path or a vault path.
- The docs regions (`examples/meridian/src/pages`) and the docs site (`apps/docs`) never import a private demo package and keep building.
- Console gauges round to a fixed precision in SI units. Test fixtures feed real unrounded values, such as seed 7's floats.

### Heavy work

A heavy job is `npm ci`, a build of more than one project, any `e2e` or `e2e-growth` target, `nx run-many`, or the final `rebase -x`. Run one at a time at all hours. On weekdays from 09:00 to 17:00 (check `date`) wrap every nx, vitest and playwright run in the lock, and release it promptly. Never hold it while thinking or editing:

```sh
(until mkdir /tmp/nexusdi-heavy.lock 2>/dev/null; do sleep 20; done; trap 'rmdir /tmp/nexusdi-heavy.lock' EXIT; NX_NO_CLOUD=true NX_DAEMON=false npx nx ... --parallel=2)
```

Outside those hours skip the lock.

### Cleanup

Every task ends with this step before its review gate:

```sh
setopt null_glob 2>/dev/null; rm -rf libs/*/test-output examples/*/dist examples/*/build \
  examples/*/test-output examples/*/out-tsc examples/bridge-console/.react-router tmp
```

### Review gate

Each task ends with a review by a fresh opus reviewer that did not write the task, and the next task in its line starts after the gate passes. The reviewer reads the task's diff against this plan and the spec, runs the task's test commands, checks that each commit passes the two per-commit suites (the scratchpad's `meridian-g5/each.sh` does it), recomputes the figures the task names, checks the writing rules on every added comment and message, and reports findings. The implementer fixes them in fixup commits. The gate passes when the reviewer reports no finding. The branch ends with the final review of Task 11.

## Tasks

Order and parallelism: Task 7 runs beside Task 0 (console files and the library README, beside `specs/`) and finishes before Task 1 starts, since its README commit lints the library. Tasks 1 and 2 run alone, in order. Task 3 (`bridge-api`) runs beside Task 5 (console). Task 4 (`bridge-api` `test/runtime` and `e2e/growth`) runs after Task 3, beside Task 6 (console `e2e/growth` and its config). Neither touches the other's project, and Task 6's servers run `bridge-api`'s `src`, which Task 4 leaves alone. Tasks 8 and 9 run together after Tasks 3 to 6. Task 10 follows them, then Task 11.

| Task | Model  | What                                                                                                                               | Commits |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 0    | sonnet | this plan                                                                                                                          | 1       |
| 7    | sonnet | the G4 leftovers: the airlock record check, the route test's ship comments, the growth case's opening comment, the README sentence | 4       |
| 1    | opus   | `src/physics/comms.ts`, then the comms record in the snapshot and the array's contracts and classes in no module yet               | 2       |
| 2    | opus   | the move across the three apps with the 0 W load, then the lint rule for `fetch` and the comms golden                              | 3       |
| 3    | sonnet | `bridge-api`'s gating comms case and the profile case with `LoopbackLink`                                                          | 2       |
| 5    | sonnet | `ItemList` and the console's comms page                                                                                            | 2       |
| 4    | sonnet | `offlineHail` on six runtimes and `e2e/growth/comms.e2e.ts`                                                                        | 1       |
| 6    | sonnet | the console's comms growth case and the fifth project                                                                              | 1       |
| 8    | sonnet | READMEs                                                                                                                            | 3       |
| 9    | opus   | the spec amendments                                                                                                                | 1       |
| 10   | sonnet | the full gate and the cleanup                                                                                                      | 0       |
| 11   | opus   | the final review with its fix-up rounds, and the PR                                                                                | 0       |

---

### Task 0: this plan

Model: sonnet.

- [ ] Commit `docs(specs): plan the g5 comms move`.

### Task 7: the G4 leftovers

Model: sonnet. Runs beside Task 0 and finishes before Task 1.

Files:

- Modify: `examples/bridge-console/app/routes/airlock.tsx` (lines 25-30)
- Modify: `examples/bridge-console/tests/routes/airlock.spec.tsx` (lines 57-58 and 102-103)
- Modify: `examples/bridge-console/e2e/growth/airlock.spec.ts` (lines 12-15)
- Modify: `examples/meridian-systems/README.md` (line 298)

- [ ] Step 1: close the record in `app/routes/airlock.tsx` with `} as const satisfies Readonly<Record<string, string>>;`. `systemAction` takes `SystemOf`, so the readonly literal type passes. Run `npx nx test @nexusdi/bridge-console --parallel=2`, typecheck and lint. Commit `refactor(bridge-console): check the airlock's system record against its type`.
- [ ] Step 2: reword the two comments in `tests/routes/airlock.spec.tsx`. The comment of `venting` reads "The ship at tick 318 of the airlock drill under the interlock, from seed 7's unrounded floats. The pump is off. The vent and the outer door stand open." The comment of `filling` reads "The ship at tick 446 of the same drill, with the pump filling. The vent and both airlock doors are shut." Each loses its list of three. Run the console `test` target. Commit `test(bridge-console): reword the airlock route test's ship comments`.
- [ ] Step 3: reflow `e2e/growth/airlock.spec.ts:12-15` to 80 columns, line 12 keeping its text:

  ```ts
  // The growth cases share one manual ship, which keeps its tick and its state
  // across the cases. Life support is online by now, and the airlock holds the
  // habitat's air with both doors shut. Each command queues for the tick after
  // the one the ship holds when the command goes out.
  ```

  Check `git diff --word-diff` shows no word change. This sits inside G4's `test(...)` body, and ruling 15 settles the conflict with the byte rule. Commit `test(bridge-console): reflow the airlock growth case's opening comment`, alone, so one revert undoes it.

- [ ] Step 4: in `examples/meridian-systems/README.md:298` change "G4 adds no command and no module." to "The drill adds no command and no module." The rest of the line stays. Run `npx prettier --check` on the file. Commit `docs(meridian-systems): name the drill in the airlock sentence`.
- [ ] Step 5: cleanup, then the review gate.

Reviewer checks: the `git diff --word-diff` of Step 3 shows no change, and no `test(...)` body gains or loses a code token. The diff of Step 2 removes the lists of three and nothing else.

### Task 1: the phased array's physics and classes

Model: opus (the wait rule and the frozen records are the hard parts).

Files:

- Create: `examples/meridian-systems/src/physics/comms.ts` and `examples/meridian-systems/src/physics/comms.test.ts`
- Create: `examples/meridian-systems/src/systems/comms/contracts.ts`
- Create: `examples/meridian-systems/src/systems/comms/phased-array.ts` and `phased-array.test.ts`
- Create: `examples/meridian-systems/src/systems/comms/comms-physics.ts` and `comms-physics.test.ts`
- Create: `examples/meridian-systems/src/systems/comms/comms-power.ts` and `comms-power.test.ts`
- Create: `examples/meridian-systems/src/systems/comms/comms-commands.ts` and `comms-commands.test.ts`
- Modify (second commit): the snapshot and setpoint types in `examples/meridian-systems/src/simulation/contracts.ts` (where `ShipSnapshot` and `Setpoints` live), `examples/meridian-systems/src/simulation/ship-state-store.ts`, the console's `examples/bridge-console/tests/doubles.ts` and the golden files `examples/meridian-systems/e2e/golden/idle`, `life-support`, `safety` and `airlock` `.seed-7.json`

`contracts.ts` holds `ISubspaceLink`, `SUBSPACE_LINK`, `CommsOptions`, `COMMS_OPTIONS`, `ICommsArray`, `COMMS_ARRAY` and `COMMS_ACTIONS` (`'hail with no arguments'`). `SUBSPACE_LINK`, `COMMS_OPTIONS` and the two types they use are a move of the definitions in `bridge-api`'s `contracts.ts` (same descriptions, `'SubspaceLink'` and `'CommsOptions'`), and `bridge-api` still defines its own until Task 2. The new library tokens sit in no graph yet, so no graph holds two tokens described `'SubspaceLink'`. The tactical contracts (`Course`, `INavCharts`, `NAV_CHARTS`) move in Task 2 with `star-charts.ts`.

- [ ] Step 1: write the failing `src/physics/comms.test.ts` of the unit-test list in the numbers section: the idle step, the three hail outcomes, the reply at dt 0.5 and dt 1, the reply message, the newest 10, the wait rule, `commsDemand`, and `Object.isFrozen` at every level of a stepped record (the record, its `messages` array, each message). Run `npx nx test @nexusdi/meridian-systems --parallel=2 -- src/physics/comms.test.ts` and see it fail on the missing file. Write `comms.ts` (`CommsStatus`, `CommsMessage`, `CommsRecord`, `CommsSetpoints`, `COMMS_LOAD`, `RELAY_ROUND_TRIP`, `FLEET_TRAFFIC_CONTROL`, `SECTOR_CLEAR`, `MESSAGES_KEPT`, `commsDemand`, `stepComms`), importing `./power` for the `PowerLoad` type and nothing from `@nexusdi/*`. Run it until it passes. Run `npx nx test @nexusdi/meridian-systems --parallel=2` and `npx nx test @nexusdi/bridge-api --parallel=2 -- test/check.test.ts` before the commit. Commit `feat(meridian-systems): model the phased array's hail and its reply`.
- [ ] Step 2: write the four failing class tests, each beside its class. `PhasedArray` reads `linked` true with a link and false with `undefined`, and `hail()` queues `{ comms: { hail: true } }`. `CommsCommands` serves `hail`, ignores other fields, and refuses `send` with reason `action` and `expected: COMMS_ACTIONS`. `CommsPower` draws `COMMS_LOAD` with the demand of `commsDemand`. `CommsPhysics` returns the ship it got when idle, reads `power.shed`, and returns a frozen snapshot with frozen setpoints. The classes need `ShipSnapshot` and `Setpoints` to carry `comms`, so this step widens the types in `src/simulation` (the field after `lifeSupport`) and the store's initial snapshot to `{ status: 'standby', sent: null, messages: [] }` and `{ hail: false }`, and freezes the new levels. The store's loads stay as they are, so the 0 W `comms` load, `ship-state-store.test.ts:324` and the load entry in `shipAtStart` wait for the move commit of Task 2. The console's `tests/doubles.ts` `shipAtStart` gains `comms` and `setpoints.comms`. If the widened type forces another fixture to change here, change its spread only and report it. Run `npx nx run @nexusdi/meridian-systems:e2e-growth --parallel=2` (heavy) once without `-u`: it must fail on the four goldens and show the comms record and `setpoints.comms` as the only diff. Then run it with `-u` and once more without. `git diff --numstat` on the goldens reads idle +24 −0, life-support +24 −0, safety +24 −0, airlock +40 −0. Run `npx nx test @nexusdi/meridian-systems --parallel=2`, `npx nx run-many -t typecheck -p @nexusdi/meridian-systems @nexusdi/bridge-api @nexusdi/bridge-console --parallel=2`, the console's `test` target and lint, then `npx fallow dupes` and record the figure. Run `npx nx test @nexusdi/bridge-api --parallel=2 -- test/check.test.ts` and `npx nx run @nexusdi/bridge-api:graph --parallel=2`: no diff, since no module binds the classes. Commit `feat(meridian-systems): add the comms record and the phased array's classes`.
- [ ] Step 3: cleanup, then the review gate.

Reviewer recomputes the figures of the unit-test list with `tl-proto.mts` and `tl-figures.mts`, the reply at ticks 13 and 14 for `sent: 10` and dt 0.5 among them, and checks the frozen levels. The reviewer checks that no copy of `SubspaceRelay`, `StarCharts` or the chart table exists, and that `git diff --numstat` on the four goldens in the second commit reads 24, 24, 24 and 40 with zero removed.

### Task 2: the move

Model: opus.

Files, first commit (the move):

- Move with `git mv` (history kept): `examples/bridge-api/src/ship/star-charts.ts` to `examples/meridian-systems/src/systems/tactical/star-charts.ts`; `examples/bridge-api/src/ship/charts.json` to `examples/meridian-systems/deck/charts.json`; `examples/bridge-api/src/ship/comms.module.ts` to `examples/meridian-systems/src/systems/comms/subspace-relay.ts`; `examples/bridge-api/src/ship/tactical.module.ts` to `examples/meridian-systems/src/systems/tactical/tactical.module.ts`. Then edit them.
- Create: `examples/meridian-systems/src/systems/comms/comms.module.ts` (`Comms`, `OfflineComms`), `examples/meridian-systems/src/systems/tactical/contracts.ts` (`Course`, `INavCharts`, `NAV_CHARTS`), `examples/meridian-systems/test/comms.test.ts`
- Modify (library): the aggregate (`meridianSystems`), `examples/meridian-systems/src/simulation/ship-state-store.ts` (the tick-0 0 W `comms` load after `shields`) and its test at line 324, `examples/meridian-systems/src/index.ts`, `examples/meridian-systems/test/simulation.test.ts:59`, `examples/meridian-systems/e2e/golden/idle`, `life-support`, `safety` and `airlock` `.seed-7.json`
- Modify (`bridge-api`): `examples/bridge-api/src/ship/contracts.ts`, `examples/bridge-api/src/ship/index.ts`, `examples/bridge-api/src/ship/meridian.ts`, `examples/bridge-api/package.json` (drop `./offline`), `examples/bridge-api/e2e/relay.ts`, `examples/bridge-api/test/check.test.ts`, `examples/bridge-api/graph.json`
- Modify (console): `examples/bridge-console/tests/charts.test.ts` (the path `../../meridian-systems/deck/charts.json`, and the test name reads `holds the same headings as the simulation's charts`, since the old name names bridge-api's charts, which the move deletes), `examples/bridge-console/app/bridge/tactical.ts` (the comment reads "a copy of the simulation's"), `examples/bridge-console/tests/doubles.ts` (`shipAtStart` gains the 0 W `comms` load entry; Task 1 added the record and the setpoint)

Files, second commit: `examples/meridian-systems/eslint.config.mjs` (the `fetch` rule) and `tools/repo-checks/src/meridian-purity.test.ts`, plus `examples/meridian-systems/src/systems/comms/subspace-relay.test.ts`. Files, third commit: `examples/meridian-systems/e2e/comms.e2e.ts` and `examples/meridian-systems/e2e/golden/comms.seed-7.json`.

- [ ] Step 1: write the failing `test/comms.test.ts`: the offline row, the linked-build row and B1 to B4 of the numbers section, with `fetch` stubbed by `vi.stubGlobal` to answer `Response.json(BUNDLED_CHARTS)` and `vi.unstubAllGlobals()` after. Run it and see it fail.
- [ ] Step 2: do the `git mv`s, then write the modules and the aggregate as rulings 7 and 8 say. `meridianSystems({ relayUrl, ...sim })` hands `Simulation.forRoot` `{ seed, dt }` alone. The index exports the names of ruling 8 and no module object. Update `ship-state-store.ts`, its test (line 324 lists `{ id: 'comms', priority: 3, demand: 0, allocated: 0 }` third) and `test/simulation.test.ts:59`. Keep the file under the 120-line limit.
- [ ] Step 3: run `npx nx run @nexusdi/meridian-systems:e2e-growth --parallel=2` (heavy) once without `-u`. It must fail on the four goldens and show the 0 W load as the only diff. Then run it with `-u` and run it once more without. `git diff --numstat` on the goldens reads idle +18 −0, life-support +18 −0, safety +18 −0, airlock +30 −0 against Task 1's second commit, and +42, +42, +42 and +70 against `738146f0`. A word-level diff shows a comma added after the shields entry, which the line rule allows.
- [ ] Step 4: `bridge-api`. Replace `contracts.ts`'s definitions with the re-export of `NAV_CHARTS`, `SUBSPACE_LINK`, `COMMS_OPTIONS` and the types `Course`, `INavCharts`, `ISubspaceLink`, `CommsOptions`. Drop `Comms`, `tactical` and `OfflineTactical` from `src/ship/index.ts` and `./offline` from `package.json`. Rewrite `meridian.ts` over the private `bridgeShip(name, systems, mode)`, which imports `BridgeApi`, `AuditTrail`, `AlarmPanel`, `meridianSystems(systems)` and `SimDriver.forRoot({ mode })` in that order. Point `e2e/relay.ts` at `BUNDLED_CHARTS`. Run `git grep` for `bridge-api/offline`, `OfflineTactical` and `tactical(` outside `specs/`: no importer. Update `check.test.ts` (the notes of the numbers section; `bridgeModules` without `'OfflineTactical'`), run `npx nx run @nexusdi/bridge-api:graph --parallel=2` to redraw `graph.json`, and read the diff: `Comms` and `Tactical` leave `Meridian`'s imports and join `MeridianSystems`'s, and Comms gains its four array providers. The target exits 1 while graph.json differs from the index. Read the diff, stage the file and rerun it for a zero exit.
- [ ] Step 5: the console edits, then run in turn: `npx nx test @nexusdi/meridian-systems --parallel=2`; `npx nx test @nexusdi/bridge-api --parallel=2` (full); `npx nx test @nexusdi/bridge-console --parallel=2` (full); `npx nx run-many -t typecheck -p @nexusdi/meridian-systems @nexusdi/bridge-api @nexusdi/bridge-console --parallel=2` and lint of the three projects; `npx fallow dupes` (record the figure). Check the docs regions and `apps/docs` for imports of the three packages: none. Commit `feat(meridian-systems): move comms and tactical into the ship's systems`, with the body naming the files that move.
- [ ] Step 6: the lint rule. Write `examples/meridian-systems/src/systems/comms/subspace-relay.test.ts` (the URL with and without a trailing slash, and `relay answered 503 for charts`). Write the failing cases in `meridian-purity.test.ts` first: the pinned set with `fetch` for `src/simulation/x.ts` and `src/physics/gas.test.ts`, the set without it for `src/systems/comms/subspace-relay.ts`, and one lint case that calls `fetch` in another file and fails. Run `npx nx test @nexusdi/repo-checks --parallel=2 -- meridian-purity` and see them fail. Edit the library's ESLint config as ruling 5 says (the message "A tick does no I/O, so src/systems/comms/subspace-relay.ts alone calls fetch.", and a block for the relay file with `HOST_GLOBALS` alone). Run the purity test and the library's lint, then the two per-commit suites. Commit `build(meridian-systems): refuse fetch outside the subspace relay`.
- [ ] Step 7: the golden. Write `e2e/comms.e2e.ts` on the relay graph (`relayUrl: 'https://relay.test'`, `fetch` stubbed): throttle 0.01, `online` and `hail` at tick 0, `roundSnapshot` at ticks 1, 5 and 600. Run `npx nx run @nexusdi/meridian-systems:e2e-growth --parallel=2` (heavy) with `-u`, then without. Check the file has 494 lines and that its ticks 1 and 600, with the comms fields stripped, equal `life-support.seed-7.json`'s ticks 1 and 600 byte for byte. Run `npx fallow dupes` and record the figure. Commit `test(meridian-systems): pin a hail and its reply to a golden`.
- [ ] Step 8: cleanup, then the review gate.

Reviewer recomputes: `tl-figures.mts` A to D, `tl-notes.mts` and `tl-golden-comms.mts` against the module test, the golden and the notes. The reviewer checks `git log --follow` on the four moved files, `git diff --numstat` on the four earlier goldens (42, 42, 42, 70; zero removed), that `test/fixtures.ts` is byte-identical, that the two renamed-in-place assertions keep their test names, that each commit passes the two per-commit suites, that the aggregate stays under 120 lines, and that `npx fallow dead-code --fail-on-issues` reports no export the move left unused.

### Task 3: `bridge-api`'s comms cases

Model: sonnet. Runs beside Task 5.

Files:

- Modify: `examples/bridge-api/test/routes.test.ts`, `examples/bridge-api/test/profile.test.ts`, `examples/bridge-api/test/doubles.ts`

- [ ] Step 1: write the failing `the comms commands on %s` case after every existing block, on Hono, Express and Fastify, with the five rows of the route table (the `OfflineMeridian` rows build the ship as the file's other blocks do). Run `npx nx test @nexusdi/bridge-api --parallel=2 -- test/routes.test.ts`, see it fail, and fix the case until it passes (no source change is expected, so a wrong figure is the failure to chase). Run `npx nx run @nexusdi/bridge-api:graph --parallel=2`: no diff. Run the full `bridge-api` test target, typecheck and lint. Commit `test(bridge-api): hail with the link and without it on each framework`.
- [ ] Step 2: write the failing `profiles the charts download of Meridian beside the LifeSupportOptions factory` case, over `createTestingContainer(Meridian).override(SUBSPACE_LINK, { useClass: LoopbackLink })` with `bridgePlugins()` and the profiler. Add `LoopbackLink implements ISubspaceLink` to `test/doubles.ts`, answering `BUNDLED_CHARTS`. The existing case stays byte-identical. Assert the awaited builds and the two `factory` rows of the profile case. Run the file, the full test target, typecheck and lint. Commit `test(bridge-api): profile the charts download of the relay graph`.
- [ ] Step 3: cleanup, then the review gate.

Reviewer recomputes: the five answers against `tl-figures.log` D1, and the profile rows against the same log's D2. The reviewer checks that `test/fixtures.ts` is untouched and that no earlier block's text changed.

### Task 5: the console's comms page

Model: sonnet. Runs beside Task 3.

Files:

- Modify: `examples/bridge-console/app/routes/systems/system-page.tsx`, `examples/bridge-console/app/routes/systems/safety.tsx`, `examples/bridge-console/app/routes.ts`, `examples/bridge-console/app/routes/layout.tsx`
- Create: `examples/bridge-console/app/routes/systems/comms.tsx`
- Test: `examples/bridge-console/tests/routes/comms.spec.tsx`, `examples/bridge-console/tests/routes/system-page.spec.tsx`

- [ ] Step 1: write the failing `ItemList({ label, none, items })` case in `system-page.spec.tsx`, then add `ItemList` to `system-page.tsx` and move safety's alarms onto it with the same markup. Run `npx nx test @nexusdi/bridge-console --parallel=2`: `tests/routes/safety.spec.tsx` passes unchanged. Typecheck and lint. Commit `refactor(bridge-console): share the labelled list of the system pages`.
- [ ] Step 2: write the failing `tests/routes/comms.spec.tsx` on the readings of the console route spec (tick 0, send tick, waiting, reply, offline ship; the button posts `{ system: 'comms', action: 'hail' }` and shows `Queued for tick 1`; the offline page). Each double spreads `shipAtStart`. Write the page on `SystemPage`, `ControlSection`, `Gauges`, `SnapshotOffline`, `snapshotLoader` and `systemAction('comms', {})`, add the static route to the `ship-layout.tsx` group in `app/routes.ts` and the "Comms" link after "Safety" in `layout.tsx`. Run the console `test` target, typecheck and lint, then `npx fallow dupes` and record the figure. Commit `feat(bridge-console): add the comms page`.
- [ ] Step 3: cleanup, then the review gate.

Reviewer recomputes: the gauge words and the MW rounding (5,000,000 W reads `5.0 MW`, 0 W reads `0.0 MW`) against the numbers section. The reviewer checks by diff that the refactor moved safety's markup without edits and that `safety.spec.tsx` is untouched.

### Task 4: `offlineHail` on six runtimes

Model: sonnet. Runs after Task 3, beside Task 6.

Files:

- Modify: `examples/bridge-api/test/runtime/growth-cases.ts`
- Create: `examples/bridge-api/e2e/growth/comms.e2e.ts`

- [ ] Step 1: write `offlineHail` as the fifth entry of `growthCases`, after `airlockDrill`, with the name "a hail on the offline ship reports no subspace link and keeps its queue", the steps of the `offlineHail` paragraph in the numbers section, and the file's `send`, `advanceTo` and `command` helpers. Every read is an integer or a string. Write `e2e/growth/comms.e2e.ts` as `describe.each(['hono', 'express', 'fastify'])` with `withShip`, as `airlock.e2e.ts` does. Run it, see it fail on the missing case, then pass. Run `npx fallow dupes`; the group against `airlock.e2e.ts` may reach about 9 lines a side, and the budget holds it. Record the figure.
- [ ] Step 2: run the six legs (heavy, one run) with the scratchpad's pinned Deno 2.9.6 and Bun 1.4.2 first on `PATH`: `npx nx run @nexusdi/bridge-api:e2e-growth --parallel=2`. The earlier four cases keep their text and pass. Node, Deno and Bun print the same final `/sim` FNV-1a, `cab1e7fa`. Run `npx nx run @nexusdi/bridge-api:graph --parallel=2`: no diff. Commit `test(bridge-api): hail the offline ship on every runtime`.
- [ ] Step 3: cleanup, then the review gate.

Reviewer recomputes: the checkpoints against `tl-runtime.log` and the Deno and Bun logs (`cab1e7fa` over 1,656 bytes), and confirms the legs ran on the pinned versions and that no earlier case's text changed.

### Task 6: the console's comms growth case

Model: sonnet. Runs beside Task 4.

Files:

- Create: `examples/bridge-console/e2e/growth/comms.spec.ts`
- Modify: `examples/bridge-console/playwright.e2e-growth.config.mts`

- [ ] Step 1: add the fifth project `comms` with `dependencies: ['airlock']`, change the `chromium` project's `testIgnore` to `/(life-support|safety|airlock|comms)\.spec\.ts/`, and write `comms.spec.ts` with the steps of the console growth case (the backend advanced through `request.post('/sim/advance')`, and a console-error assertion). The hail stays queued on the shared ship for good, so the case runs last. Run `npx nx run @nexusdi/bridge-console:e2e-growth --parallel=2` and `npx nx run @nexusdi/bridge-console:e2e --parallel=2` (heavy, one at a time). The config has `retries: 0`, so the first read of `standby` and `No` holds. Commit `test(bridge-console): hail from the comms page in a growth case`.
- [ ] Step 2: cleanup, then the review gate.

Reviewer recomputes: the page's words against `tl-figures.log` C and the numbers section. The reviewer checks that the four earlier growth specs are untouched.

### Task 8: READMEs

Model: sonnet. Runs with Task 9, after Tasks 3 to 6.

Files:

- Modify: `examples/meridian-systems/README.md`, `examples/bridge-api/README.md`, `examples/bridge-console/README.md`

- [ ] Step 1: the library README gains the comms and tactical modules, `meridianSystems`'s `relayUrl`, the command `comms hail`, the golden and the module test. Commit `docs(meridian-systems): describe comms and tactical`.
- [ ] Step 2: the `bridge-api` README gains the move (what `./ship` no longer exports), the comms route case, the profile case, the fifth runtime case, and the rewrite of the line that names `Tactical` in `meridian.ts`. Commit `docs(bridge-api): describe the move and the comms cases`.
- [ ] Step 3: the console README gains `/systems/comms` and the fifth growth project. Run `npx prettier --check` on the three files, and the README doctests if a README gains a `ts` block. Commit `docs(bridge-console): document the comms page`.
- [ ] Step 4: cleanup, then the review gate.

Reviewer recomputes: each tick and figure a README states, against the numbers section.

### Task 9: the spec amendments

Model: opus.

Files:

- Modify: `specs/2026-10-21-meridian-ship-systems-design.md`

- [ ] Step 1: apply ruling 18 section by section (§3.1, §3.2, §3.3, §4.1, §4.2, §4.3, new §5.12, §5.7, §6, §6.3, §7.1, §7.2, §7.4, §8.1, §8.2, §8.3, §10.1, §10.2, §13), add the seventeen §15 rows, and add this plan to the closing paragraph's list. Check each figure against `tl-figures.log`, `tl-runtime.log` and `tl-golden-comms.log`. Run `npx prettier --check` on the file. Commit `docs(specs): record the g5 rulings in the ship systems spec`.
- [ ] Step 2: cleanup, then the review gate.

Reviewer recomputes: B1 to B3 and C in §5.12, the golden's 494 lines, the 42, 42, 42 and 70 line counts, and the 2 s round trip as 4 ticks at dt 0.5.

### Task 10: the gate

Model: sonnet.

- [ ] Step 1: run the scratchpad's `meridian-g5/gate.sh` (heavy, holds the lock itself): `npx nx run-many -t lint test build typecheck --parallel=2`, the `bridge-api` and console `e2e` targets, `npx nx run-many -t e2e-growth --projects=tag:demo --parallel=2` with the pinned Deno 2.9.6 and Bun 1.4.2 first on `PATH` and workerd for the worker leg, the `graph` target with no diff, `npx fallow dead-code --fail-on-issues`, `npx fallow dupes` and `npx prettier --check .`. Record the dupes figure, which must read 2.15 % or under, and confirm `git diff origin/release/0.4 -- .fallowrc.jsonc` is empty. Fix any finding in a fixup commit.
- [ ] Step 2: cleanup.

### Task 11: the final review and the PR

Model: opus.

- [ ] Step 1: the final branch review by an independent opus reviewer, who recomputes every figure in "Numbers the tests assert" and checks the diff of the earlier goldens and e2e files, fix rounds in fixup commits until it approves.
- [ ] Step 2: fold the fixups with `GIT_SEQUENCE_EDITOR=: NX_NO_CLOUD=true NX_DAEMON=false git rebase -i --autosquash origin/release/0.4`. Then check every commit on its own (heavy): `NX_NO_CLOUD=true NX_DAEMON=false git rebase origin/release/0.4 -x 'NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/meridian-systems --parallel=2 --skip-nx-cache && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/bridge-api --parallel=2 --skip-nx-cache -- test/check.test.ts'`. A commit that fails gets its fix folded into it, and the step reruns. Check `git rev-list --count origin/release/0.4..HEAD` is 100 or fewer.
- [ ] Step 3: if `origin/release/0.4` moved, rebase onto it and rerun the graph, the gate and Step 2. Push with `NX_NO_CLOUD=true NX_DAEMON=false git push -u origin feat/meridian-g5-comms`, and open the PR against `release/0.4`. The body lists the rulings and the additions beyond the spec's G5 text (the list "For the owner" below) and ends with the Claude Code line. Wait for CI and fix any CodeQL alert, then report the PR number and the result.

## For the owner

Additions beyond the spec's G5 text. None changes a public docs page.

1. A crew command, `comms hail`, with no argument (ruling 1).
2. Ship behaviour the spec leaves open: the relay's reply 2 s after a send, the newest 10 messages, the four statuses, the hail that waits behind an outstanding reply, and the 5 MW comms load on each tick a hail waits on a linked array with no reply outstanding, which on a cold reactor sheds and raises `LOAD_SHED comms` (rulings 3 and 4).
3. `OfflineComms` beside `Comms`, `OfflineTactical` moved beside `Tactical`, `BUNDLED_CHARTS` as a library export, and the private `bridgeShip()` in `bridge-api`'s `meridian.ts` (rulings 7 to 9).
4. The library's lint refuses `fetch` outside the subspace relay (ruling 5).
5. A gating route case per framework, a fifth runtime case, a library module test and the comms golden (rulings 10 and 12).
6. The console page `/systems/comms`, its nav link, `ItemList`, and a fifth growth project (ruling 13).
7. Five enumerating unit assertions change (ruling 14), the fifth being the rename of the console's charts test, whose old name names bridge-api's charts, which the move deletes.
8. The rule conflict of ruling 15: the reflow of the G4 growth comment goes ahead in its own commit, and one revert undoes it.
9. Removed from the private `bridge-api`: `Comms`, `tactical` and `OfflineTactical` from `./ship`, and the `./offline` export. Nothing imports them.
