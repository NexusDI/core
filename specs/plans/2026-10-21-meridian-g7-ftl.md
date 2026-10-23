# Meridian G7, the FTL Drive Loaded into a Running Ship: Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Ledger: `.superpowers/sdd/meridian-g7/progress.md` in the main checkout.

Goal: the Starship Meridian gets its FTL drive, and the drive joins the ship after startup. `FtlDrive` is a module that `@nexusdi/meridian-systems` exports and `aggregate` leaves out. `bridge-api` loads it with `ship.load(FtlDrive)` through each adapter's `di.load(FtlDrive)` section on the first `POST /ftl/spool` or `POST /ftl/jump`. `JumpDrive.onInit()` attaches the drive's physics to the tick loop and its load to the power router, since both read their lists once, at construction. The snapshot gains `ftl` (status, charge in J, sector, tick of the last jump) and the setpoints gain `ftl` (armed, jump). The spool draws `ftl-spool` at priority 7 and charges 450,000,000 J a tick to 90,000,000,000 J. A jump on a full charge moves the sector, disarms the drive and heats the coolant loop by 10.7914 K. The telemetry stream extends its request scope and sends the loaded drive's rating. G7 adds the pure physics in `src/physics/ftl.ts`, a library module test and a golden, route cases on three frameworks, a stub suite over `SimulatedFtlDrive`, a seventh runtime case, the console's `/systems/ftl` page with its growth case, and the spec and README text for all of it.

Architecture: one pull request, `feat/meridian-g7-ftl`, cut from `release/0.4` at `ffea277d` (G0 to G6 merged) and now at `3c72c9bf`. The library gains `src/physics/ftl.ts` and `src/systems/ftl/`. `bridge-api` gains the two FTL routes, `src/bridge/ftl.ts`, `src/bridge/refusal.ts`, a stream argument and test files. The console gains the FTL page and a seventh growth project. G7 changes nothing under `libs/`, the federation shell or the docs.

Tech stack: Node from `.nvmrc` (24.20.0), TypeScript 6.0.3, Vitest 5.0.5, Nx 23.3.0, Hono 4.13.13, Express 5.3.0, Fastify 5.12.7, React Router 8.4.0, Playwright 1.64, Deno 2.9.6, Bun 1.4.2.

Spec: `specs/2026-10-21-meridian-ship-systems-design.md` (§ below). Earlier plans: `specs/plans/2026-10-21-meridian-g0-kernel.md`, `-g0b-telemetry.md`, `-g1-engineering.md`, `-g2-lifesupport.md`, `-g3-safety.md`, `-g4-airlock.md`, `-g5-comms.md`, `-g6-propulsion.md`. Also the `nexusdi-ways-of-working` skill.

G6 is complete and merged: this plan reads `Propulsion`, `Helm`, `NAV_CHARTS`, `POWER_ROUTER`, the helm golden and the console's `./charts` import as they stand at `3c72c9bf`. Three G6 leftovers are already committed on this branch and get no task: `f2aa3da5` (the `bridge-api` README's shed sentence in two sentences), `d544e45a` (`the course route on %s` pins `/course/constructor` and `/course/__proto__` at heading 0) and `3c72c9bf` (spec §15's owner list gains the console's dependency and `./charts`). Task 8 fixes one wording nit of `3c72c9bf`, and Task 10 reads all three against the writing rules.

## Owner rulings

1. Earlier e2e test bodies and earlier goldens stay unchanged, and a golden may only gain lines. Three earlier unit-test edits are allowed under G5 ruling 14 and G6 ruling 12, each named in ruling 13 of the rulings below: the `inspect()` call of `check.test.ts`'s "matches graph.json" case, and the two `Object.keys(...).slice(-4)` assertions of `ship-state-store.test.ts`.
2. Console gauges show SI units: K as whole numbers, kPa, Pa, mol and W, plus the propulsion units of G6. The joule and the watt are SI units, and giga and mega are SI prefixes, so `Spool charge` in GJ to 0.1 and `Spool power` in MW to 0.1 meet the rule. Words and ticks (status, arm, sector, last jump) carry no unit.
3. Deterministic checks gate the growth track: the unit tests, `check.test.ts`'s graph check and the purity checks run in `main`, and `e2e-growth` never gates.
4. The rule of three applies everywhere except lists of figures or ids. No absolute local path and no vault path appears in a committed file.
5. The duplication limit is `.fallowrc.jsonc`'s 2.25 %. The branch aims at 2.15 % or less and never raises the limit.
6. The branch stays at 100 commits or fewer, the limit of GitHub's rebase merge.
7. No hook is bypassed in any way: no `HUSKY=0`, no `--no-verify`, no `git commit-tree`, no `git update-ref` on a commit, no `-c core.hooksPath`, in the main worktree or in a scratch worktree. An `amend!` fixup carries the full message, the subject line included.
8. The owner listed these features as G7's: `ship.load(FtlDrive)`, `JumpDrive.onInit()` attaching its physics to the loop, the telemetry stream's `scope.extend()`, the Graph CLI `--load`, and `overrideModule(FtlDrive, SimulatedFtlDrive, { lazy: true })`. Ruling 6 and ruling 5 settle how the first and third work.

## Rulings this plan carries

The architect proposed and the tech lead decided these on 2026-10-23. The tech lead's text overrides the architect's, and the numbering below is the tech lead's. The full text and the node scripts behind each figure sit in the session scratchpad's `meridian-g7/` folder (`architect.md`, `rulings.md`, the `arch-*` and `tl-*` scripts and their logs). Task 8 writes them into the spec, each as "tech lead, G7 ruling N".

1. Core APIs. `ship.load(module)` returns `Promise<void>`. It compiles the module as a new root import, builds the new singletons and runs their `onInit` after construction, dependencies first, and it rebuilds neither the loop nor the router. A second `load()` of the same module builds nothing, and two concurrent calls build one drive. A failed compile leaves the container as it was (`NEXUS_BLUEPRINT_INVALID`, `has()` false) and a later load works. A scope opened before the load throws `NEXUS_LOADED_AFTER_SCOPE` (`{ token: 'FtlDrive', module: 'FtlDrive', entry: null }`) for `FTL_DRIVE` until `await scope.extend()`, and a second `extend()` is a no-op. `Nexus.check(root, { load: [FtlDrive] })` passes. `overrideModule(module, stub, { lazy: true })` keeps `create()` from reporting the override unused (without `lazy` it fails `NEXUS_BLUEPRINT_INVALID` with `NEXUS_OVERRIDE_UNUSED`), and the stub replaces the module at `load()`. A stub that lacks an export of the original fails the load with `NEXUS_OVERRIDE_EXPORTS`. Each adapter's `di.load(module)` returns a section: one load per module and container, then `extend()` of the request's scope when it has started. Core agrees with the spec on each point. `arch-core.log` and `arch-adapter.log` show them, and `tl-rerun-core.log` equals `arch-core.log` byte for byte. G7 changes nothing under `libs/`. A module that `load()` adds cannot join `all(SHIP_SYSTEMS)`, since the loop resolved that list at its construction (spec line 632), so `FtlDrive` contributes no `SHIP_SYSTEMS` entry and the root's `get(SHIP_SYSTEMS)` lists none after the load (`arch-figures.log` B).

2. The record, the setpoints and the status `offline`. `FtlStatus` has five values and the store starts the record at `offline`:

   ```ts
   /**
    * `offline`: no drive is loaded; the store starts the record here, and the
    * drive's first step writes another status. `idle`: unarmed and below a full
    * charge. `held`: armed, and the reactor, the coolant or the router keeps the
    * spool from charging. `spooling`: armed and charging. `charged`: the charge
    * is full.
    */
   export type FtlStatus = 'offline' | 'idle' | 'held' | 'spooling' | 'charged';
   export interface FtlRecord {
     readonly status: FtlStatus;
     /** The spool's charge, in J. */
     readonly charge: number;
     /** The charted star the ship sits at, or HOME_SECTOR before the first jump. */
     readonly sector: string;
     /** The tick of the last jump, or null before the first. */
     readonly jumped: number | null;
   }
   export interface FtlSetpoints {
     /** True while the spool may charge. */
     readonly armed: boolean;
     /** The star of a jump the crew commanded, or null. */
     readonly jump: string | null;
   }
   ```

   `ShipSnapshot` gains `ftl` after `helm` and `Setpoints` gains `ftl` after `helm`, the order §4.1 gives ("helm, weapons, FTL and safety"). `ShipStateStore` starts them at `{ status: 'offline', charge: 0, sector: 'Sol', jumped: null }` and `{ armed: false, jump: null }`, frozen at every level. `HOME_SECTOR = 'Sol'` sits in `ftl.ts`. `stepFtl` derives the status on every step, so the first step after the load writes `idle` (or `held` or `spooling` on an armed tick) as a new object, and no step ever writes `offline`. Nothing else in the record moves: the sector is `Sol` from tick 0 and the charge 0. The setpoints start from tick 0, since `queue()` merges a change over them. Every earlier golden gains the record at `offline` and keeps the architect's line counts (the numbers section). `ftl.seed-7.json` pins ticks 101, 300 and 301, all after the load. The architect's `idle` start claimed a drive on a ship whose graph holds none, so the record now says what the graph holds, and the stream of ruling 5 reads the change.

3. The spool and the jump, in J. `FTL_SPOOL = { energy: 90e9, power: 900e6, pulseShare: 0.1, reactorLevel: 0.9, coolantLimit: 1_300 }` and `FTL_SPOOL_LOAD = { id: 'ftl-spool', priority: 7, heatShare: 0.1 }`.

   ```text
   ready     = reactor.level >= 0.9 and coolant.temperature < 1,300 K      at the start of the tick
   demand    = 900 MW while armed and ready below a full charge, else 0 W
   charge'   = min(E_spool, charge + P_f * dt)                              P_f = the ftl-spool allocation this tick
   jump      = setpoints.jump != null and charge = E_spool                  at the start of phase 3
   on a jump: charge' = 0, sector' = setpoints.jump, jumped' = tick, armed' = false, jump' = null,
              T_c' = T_c + 0.1 * E_spool / C_c                              10.7914 K
   ```

   `stepFtl(ftl, setpoints, { tick, dt, allocated }, rating)` returns `{ ftl, setpoints, pulse }` and the objects it got when nothing changes. `FtlPhysics` (phase 3, `name: 'FtlDrive'`) reads the allocation from `ship.power.loads`, writes the record, the setpoints after a jump, and the loop through `pulseCoolant(coolant, energy, LITHIUM_LOOP)`, and returns the ship it got on an idle tick. `ftlDemand(ftl, setpoints, reactor, coolant, rating)` reads the snapshot at the start of the tick, as every load does. The charge is held in J (open question 6): `P_f * dt` is 450,000,000 J, an integer, so 200 ticks reach 90,000,000,000 J exactly, while the fraction `S` of §5.9 drifts to 1.0000000000000007 before its clamp (`arch-physics.log`). `S` is `charge / energy`. The 90 % rule and the 1,300 K limit hold the spool in the tick (question 4): the router fits the spool from level 0.7438, so a refusal under 90 % would refuse a load the router can serve. The record's `held` tells the crew why, and `spool()` keeps one refusal, the router's. The jump pulse enters the loop in phase 3 from `LITHIUM_LOOP` (question 5), because §5.6 puts `Q_pulse` in the phase-1 equation while the jump runs in phase 3. The drive adds `dt * Q_pulse / C_c = 0.1 * E_spool / C_c` in its own step, with `C_c` from `LITHIUM_LOOP` since `COOLANT_LOOP` stays private to Engineering. The next tick radiates from the raised temperature. The jump tick reads 844.443 K against 833.652 K with no jump: 10.7914 K, §5.9's "10.8 K". A shared pulse field for G8's railgun is G8's call, and G7 adds no field Engineering reads. A jump keeps the drive's velocity and distance and the helm's record (G6 ruling 6).

4. Power and the two attaches. The router's `all(POWER_CONSUMERS)` is the list at its construction, as the loop's `all(SHIP_SYSTEMS)` is. A drive that took power outside the router would raise no `LOAD_SHED`, add no heat and break §5.7's priority 7. `IPowerRouter` therefore gains `attach(consumer): () => void`, which lists the consumer after the `POWER_CONSUMERS` entries in `loads(ship)`, and `ITickLoop` gains `attach(system): () => void`. Spec §4.2 and §6.3 name the loop's attach only (spec error 2). `ITickLoop.attach` re-sorts by phase and name, forks the RNG by the system's name (S5), throws "Two ship systems are named 'FtlDrive'." for a name the loop runs, and joins from the next tick when called during a tick, since `advance()` walks the array it started with. Both attaches return their detach, which runs twice safely, as `listen` returns its unsubscribe (open question 9). G0 ruling 4's "`attach()`/`detach()`" was a tech lead ruling, so G7 amends it in its own §15 row. The load id is `ftl-spool` (question 10), named for what draws, as `main-drive` is. After the load the power record lists `ftl-spool` at 0 W after `main-drive`. Before it the record keeps its five loads, so no earlier golden gains a load. Root disposal runs newest first, so `JumpDrive` detaches before the driver and the loop stop.

5. The telemetry stream extends its scope and reads `FTL_DRIVE`. The owner's line stands, and the architect's option (a), a stream that reads no FTL token, is rejected (open question 1, spec error 4). The docs teach `scope.extend()` for "a long-lived scope (like a user session)" that needs a module loaded after it opened, and a telemetry stream is that scope. It needs a reason to read the drive: the snapshot holds the drive's state, and the drive bound to `FTL_DRIVE` holds its rating. A test that overrides the module gets another rating, so only the token answers it.

   - `IFtlDrive.rating: FtlRating` stays on the contract, as G6 put `rating` on `IMainDrive` and `IThrusters`. The index exports the type `FtlRating`.
   - `src/bridge/ftl.ts` gains `ftlRating(scope)`. It returns a function of the reading that answers `undefined` while `reading.ftl.status` is `offline`, and on the first other status runs `await scope.extend()` and then `scope.get(FTL_DRIVE).rating`, once, keeping the promise. Its docblock says why: the stream's scope opened before the first spool loaded the drive, and without the extend the read throws `NEXUS_LOADED_AFTER_SCOPE`.
   - `telemetryStream(feed, shutdown?, rating?)` gains the optional third argument. Its `pull` awaits the rating for the frame it is about to send, and each `snapshot` frame from then on carries `ftlRating` after the reading's keys. A rejection errors the stream. Every existing call and test passes two arguments or fewer, so no earlier body changes.
   - Each `/telemetry` route passes `ftlRating(await di.scope(c))` (Hono) or `ftlRating(await di.scope(req))` (Express, Fastify). The request scope stays open until the body ends on all three, so it is open while the drive loads.
   - P1: `status !== 'offline'` compares against `FtlStatus`, a union the library exports and the compiler checks, which is the allowance P1 names. The union is closed and only its owner adds to it.
   - Earlier frames never carry `ftlRating`, since no earlier case loads the drive. `TelemetryEvent` keeps `snapshot` and `offline`, so the console's and the federation shell's readers see no new event. The console reads `/sim` and does not use `ftlRating` in G7.

   `t0-stream.log` (a clean rerun of `tl-stream.mts`) shows it on Hono with and without `nodeScopes()`, on Express and on Fastify: the frame at tick 0 reads `offline` with no rating, the section answers the first and second spool, and the next frame carries `{"energy":90000000000,"power":900000000}`. With the extend removed (`tl-stream.noextend.log`) the same frame raises `NEXUS_LOADED_AFTER_SCOPE` on all four.

6. The section and the second spool. The spool and jump routes run through each adapter's section: `const ftl = di.load(FtlDrive)` in `createBridge`, registered in front of the handler, the form `apps/docs/content/load.mdx` teaches, and each handler is written with the section's own `inject`. Hono and Express: `bridge.post('/ftl/spool', ftl, ftl.inject({ drive: FTL_DRIVE }, ...))`. Fastify: `{ onRequest: ftl }` in the route's options, as bridge-api's fastify file already passes `onRequest` per route inside its encapsulated context. The second enter, the one inside `inject`, is a cached load and a no-op extend. The registration in front is a controller ruling on this ruling. The bridge code never calls `ship.load` itself. The adapter's `enterSection` does, then extends a request scope that started. A plain handler that awaits `ship.load()` and reads the request's scope answers `NEXUS_LOADED_AFTER_SCOPE` on the first spool on the Node entries (`arch-adapter.log`: "hono plain handler, nodeScopes"), so §6.3's handler cannot work as written (spec error 3). The form diverges from the owner's wording "loaded with `ship.load(FtlDrive)`" alone, since the adapter runs `ship.load(FtlDrive)`. "A second spool call is a no-op that the handler skips" holds on two levels:

   - The load. The adapter's `loader` keeps one promise per module and container, so every later FTL request awaits the settled promise and never calls `ship.load` again, and core's `load()` would do nothing for a loaded module. The section is the handler's first step, so the handler skips the load with no branch of its own. The first `POST /ftl/jump` also loads the drive, so a jump before any spool answers `MERIDIAN_FTL_NOT_SPOOLED` from a loaded drive.
   - The command. `JumpDrive.spool()` on a snapshot whose `setpoints.ftl.armed` is true asks no `divert`, queues nothing and returns `{ tick: t + 1 }`, the tick from which the drive is still armed. The route answers 202 with that tick and `GET /commands` gains no entry. A re-check would refuse an armed spool on a tick the router sheds it, which a no-op must not do. Two spools in one tick before the first applies go through `queue()`, which merges them into one log entry. After a jump disarms the drive, a spool arms it again (`arch-figures.log` D, tick 302).

7. Commands and routes.
   - `IFtlDrive` has `spool()` and `jump(to)`, each returning `QueuedCommand`. `spool()` runs `POWER_ROUTER.divert({ ...FTL_SPOOL_LOAD, demand: 900e6 })` and queues `{ ftl: { armed: true } }`, and refuses with `PowerBudgetError` when the router cannot fit the load: at tick 0 "The ftl-spool load needs 900 MW, and the router has 0 MW free beside the loads above it.", at tick 74 of a throttle-1 ramp 895.4 MW free, at throttle 0.01 with life support online 12.1 MW free.
   - `jump(to)` checks `charts.has(to)` first and throws `BadCommandError({ reason: 'argument', system: 'ftl', action: 'jump', expected: FTL_ACTIONS })` ("ftl jump got an argument it cannot use. It takes spool with no arguments and jump with a charted star to jump to." with the fix "send the arguments in the ranges above."). Then it throws `FtlNotSpooledError({ charge, energy })` below a full charge ("The FTL drive holds 22.5 GJ of the 90 GJ a jump needs." with the fix "spool the drive and wait until it holds the full charge, then jump."), then queues `{ ftl: { jump: to } }`. `constructor` and `__proto__` answer the argument refusal through `has`.
   - `Sol` is the home sector, and a jump to the sector the ship holds is allowed (question 7). The spec names no such refusal, and G7 adds no refusal the spec does not name. The phase-3 write of `armed: false` and `jump: null` stays out of the log, as Safety's door writes do.
   - No stand-down command (question 13). The spec names spool and jump. G7 adds no crew command past them, and `ftl` stays out of the desk's list, which keeps "comms, engineering, helm, life-support and safety" (the desk's `all(COMMAND_HANDLERS)` is also the list at its construction, `arch-figures.log` B).
   - `refusedReply(error)` in `src/bridge/refusal.ts` maps a refusal to 400 or 409 for `answerCommand`, `answerSpool` and `answerJump`. Task 3 commits it before the routes, so the feature diff holds the routes alone. `src/bridge/ftl.ts` holds `answerSpool(drive)` and `answerJump(drive, body)`. A body with no string `to` jumps to `''`, a star no chart holds, so the library words the refusal.

   | Route              | Body                              | Answers                                                                                                            |
   | ------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
   | `POST /ftl/spool`  | none                              | 202 `{ tick }`; 409 `MERIDIAN_POWER_BUDGET`                                                                        |
   | `POST /ftl/jump`   | `{ to }`, read through `readJson` | 202 `{ tick }`; 400 `MERIDIAN_BAD_COMMAND` for no string `to` or an uncharted star; 409 `MERIDIAN_FTL_NOT_SPOOLED` |
   | `GET /telemetry`   | none                              | the existing frames; from the frame after the FTL drive loads, each `snapshot` frame also carries `ftlRating`      |
   | the Worker entries | as above                          | the same routes through Hono                                                                                       |

8. Modules and exports.

   ```text
   src/physics/ftl.ts                    FtlRating, FTL_SPOOL, FTL_SPOOL_LOAD, HOME_SECTOR, FtlStatus, FtlRecord,
                                         FtlSetpoints, FtlStep, ftlDemand, stepFtl, pulseCoolant
   src/systems/ftl/contracts.ts          IFtlDrive, FTL_DRIVE, FTL_ACTIONS
   src/systems/ftl/jump-drive.ts         JumpDrive (FTL_DRIVE)
   src/systems/ftl/ftl-physics.ts        FtlPhysics, phase 3, built by JumpDrive
   src/systems/ftl/ftl-power.ts          FtlPower, built by JumpDrive
   src/systems/ftl/ftl-drive.module.ts   FtlDrive
   src/errors.ts, src/text.ts            FtlNotSpooledError (MERIDIAN_FTL_NOT_SPOOLED) and its text
   src/simulation/contracts.ts           ShipSnapshot.ftl; ITickLoop.attach
   src/simulation/commands.ts            Setpoints.ftl
   src/simulation/fixed-step-loop.ts     attach()
   src/simulation/ship-state-store.ts    the initial record and setpoints
   src/systems/engineering/contracts.ts  IPowerRouter.attach
   src/systems/engineering/plasma-router.ts  attach()
   src/notes.ts                          labels FtlDrive's providers
   src/index.ts                          the exports listed below
   ```

   ```ts
   export class JumpDrive implements IFtlDrive, Disposable {
     static deps = [TICK_LOOP, SHIP_STATE, NAV_CHARTS, POWER_ROUTER] as const;
     readonly rating = FTL_SPOOL;
     onInit(): void {
       // The loop's all(SHIP_SYSTEMS) and the router's all(POWER_CONSUMERS) are the
       // lists at their construction, so a loaded drive attaches itself.
       // The drive keeps each detach as its attach returns. When the router
       // attach throws, load() disposes the drive it built, and the dispose
       // removes the loop entry, so a later load can attach the drive again.
       const detachLoop = this.loop.attach(new FtlPhysics(this.rating));
       this.detach = [detachLoop];
       this.detach = [
         detachLoop,
         this.router.attach(new FtlPower(this.rating)),
       ];
     }
     [Symbol.dispose](): void {
       for (const detach of this.detach) detach();
     }
   }

   export const FtlDrive = defineModule({
     name: 'FtlDrive',
     providers: [provide(FTL_DRIVE, { useClass: JumpDrive })],
     exports: [FTL_DRIVE],
   });
   ```

   `FtlPhysics` and `FtlPower` are parts of the drive, built with its rating, and no provider: a `SHIP_SYSTEMS` or `POWER_CONSUMERS` entry in a loaded module would reach no singleton built before it, and a reader would take it for a working contribution. `FtlDrive` reads every token through the global aggregate and `Simulation` (question 3, spec error 6), as G6 ruling 9 rules for every cross-system read. §6.3's import of `Engineering` changes nothing at run time (one router, `arch-core.log`) and would mix one import with three aggregate reads. `FtlDrive` stays out of the aggregate (§3.1), and the aggregate's file does not change. `FtlDrive` alone fails `Nexus.check` with four `NEXUS_MISSING_PROVIDER` (`TickLoop`, `ShipState`, `NavCharts`, `PowerRouter`), and `Nexus.check(meridianSystems(...), { load: [FtlDrive] })` passes (`arch-figures.log` A). The index exports `FtlDrive` (question 8): bridge-api must hold the module object to load it, and the module only works inside a ship `meridianSystems()` built, so a `./ftl` subpath would give a reader an entry point that fails alone. The subpaths `./text`, `./interlock` and `./charts` exist for code that needs no simulation. `FtlDrive`'s docblock says it is the one module object beside the aggregate and fails `Nexus.check` alone.

   New public exports of `@nexusdi/meridian-systems`, flagged for the owner: `FtlDrive`, `FTL_DRIVE`, `FtlNotSpooledError` and the types `IFtlDrive`, `FtlRating`, `FtlRecord`, `FtlSetpoints` and `FtlStatus`; the contract members `ITickLoop.attach`, `IPowerRouter.attach` and `IFtlDrive.rating`; the error code `MERIDIAN_FTL_NOT_SPOOLED` (§6.4 already lists it). No new subpath and no new runtime dependency between packages (P5): bridge-api already depends on core, the adapters, the library and `@nexusdi/testing` (for its tests). `npx fallow dead-code --fail-on-issues` settles any export nothing imports.

   Extension principle: P1, the library owns `FTL_DRIVE`, `MERIDIAN_FTL_NOT_SPOOLED`, its class and its text, and bridge-api matches it through `isNexusError` and `BadCommandError`, the library's public names, plus ruling 5's status compare. P2, the drive extends the ship through the contribution points the kernel offers: the loop's and the router's `attach`, the snapshot record, and `NexusErrorByCode` by augmentation. P3, bridge-api reaches core through public `load()`, the adapters' `di.load` and `overrideModule`, and nothing reaches into another package. P4, the console prints the drive's `status` and copies no rule, `answerSpool`, `answerJump` and `answerCommand` share one refusal mapping, and the stub holds no copy of the drive's refusals. P5, G7 adds no dependency. `attach` is a public method of two library contracts, so a later loaded system (G8 weapons, if loaded) joins the same way and no file of Engineering or the loop names the drive.

9. The ship notes and the graph. `shipNotes` walks from the module that binds `TICK_LOOP`, so a module the root imports beside the ship stays unlabelled, and `FtlDrive` is such a module once loaded. The walk also starts from `FtlDrive`'s module when the graph holds it, matched by its definition (a `ModuleView` whose `definition` or `replaced` is `FtlDrive`, so a stub that stands in for it is labelled too), and the docblock's sentence on modules outside the walk names the exception. The dev graph then reads `FtlDrive in FtlDrive` with `['system: FtlDrive']` and no phase note, since `JumpDrive` is no `SHIP_SYSTEMS` provider (`arch-bridge.log` 2).

   The `graph` target becomes `nexusdi graph src/ship/meridian.ts#Meridian --load src/ship/meridian.ts#FtlDrive --plugins src/ship/plugins.ts#graphPlugins -f json -o graph.json && git diff --exit-code graph.json`, with `src/ship/meridian.ts` re-exporting `FtlDrive` from the library. `libs/cli/src/entry.ts` splits `path#export` only after a loadable extension, so the spec's `src/systems/ftl#FtlDrive` exits 2 ("src/systems/ftl#FtlDrive is not a file nexusdi can load."), and the path names the library's folder from bridge-api's directory. This is spec error 1 and a finding for the owner (`arch-adapter.log`: the same line with `src/ship/ftl.ts#FtlDrive` parses). `graph.json` gains one module (`FtlDrive`, a root import after `interceptors`), one provider (`FtlDrive`, implementation `JumpDrive`, singleton class) and four edges (to `TickLoop`, `ShipState`, `NavCharts`, `PowerRouter`): 16 to 17 modules, 55 to 56 providers, 86 to 90 edges (`arch-bridge.log` 2, `arch-graph.g7.json`). Without the load the drawn graph equals the committed one. `check.test.ts` imports `FtlDrive` from `../src/ship/meridian`, so `fallow dead-code` sees the re-export used.

10. `SimulatedFtlDrive` and the §8.2 suite. The architect's prototype stub (`arch-bridge.mts` part 4) kept both refusals, which contradicts the architect's own text and copies the drive's rules into a double (P4). The committed stub keeps none.
    - `SimulatedFtlDrive` in bridge-api's `test/doubles.ts` binds `FTL_DRIVE` to `SimulatedJumpDrive` (`[TICK_LOOP, SHIP_STATE]`, `useClass`) and declares `exports: [FTL_DRIVE]`, since a stub that lacks an export of the original fails the load with `NEXUS_OVERRIDE_EXPORTS`. `spool()` queues `{ ftl: { armed: true } }` with no router check. `jump(to)` queues `{ ftl: { jump: to } }` with no check. Its `onInit` attaches one phase-3 system named `FtlDrive` that fills the charge to the rating's energy on an armed tick with status `charged`, and on a commanded jump writes `{ status: 'idle', charge: 0, sector: to, jumped: tick }` and the disarmed setpoints, with no pulse. Its disposer detaches it.
    - Its rating: `{ energy: 90e9, power: 0, pulseShare: 0, reactorLevel: 0, coolantLimit: Number.MAX_VALUE }`. Every field is finite, so a frame serialises it (`Infinity` would serialise as `null`).
    - The suite lives in bridge-api's `test/ftl.test.ts`. §8.2 gives it to the module tests, and the stub exists so a bridge test of a jump never spools a real drive; bridge-api holds the doubles (§10.2) and the routes the stub serves. It builds `createTestingContainer(OfflineMeridian).overrideModule(FtlDrive, SimulatedFtlDrive, { lazy: true })` per framework (the numbers section lists the reads).

11. Library tests and the golden. The unit tests, the module test and the golden are in the numbers section. Beyond the architect's list: `src/physics/ftl.test.ts` adds `stepFtl` on the store's `offline` record with no allocation returning a new `idle` record; `jump-drive.test.ts` adds `spool()` on an armed snapshot calling no `divert`, queueing nothing and returning `{ tick: t + 1 }`; `ship-state-store.test.ts` gains a case reading the record `offline` and the setpoints idle after `helm`, frozen; `test/ftl.test.ts`'s load case reads the `offline` record at tick 1, a new `idle` object at tick 2 and the same object at tick 3; its golden scenario sends a second spool at tick 200 and gets `{ tick: 201 }` with the log keeping ticks `[1, 101]`.

12. `bridge-api` route block and runtime case. `the ftl commands on %s` and the seventh runtime case `spoolAndJump` each send a second `POST /ftl/spool` after the 200 charging ticks (ruling 6): it answers 202 `{ tick: 301 }` and the log keeps ticks `[1, 101, 301]`. No `/sim` read changes, so the architect's hashes stand as evidence and Task 5 records the committed code's hashes on Node, the Node bundle, workerd, Deno 2.9.6 and Bun 1.4.2. `check.test.ts` gains two new cases (the numbers section).

13. Earlier assertions and the owner's rule. The owner's rule covers earlier e2e test bodies and goldens. `check.test.ts` and `ship-state-store.test.ts` are unit tests (`nx test`), and G5 ruling 14 and G6 ruling 12 let an enumerating unit assertion grow with the ship. Each item, with the call:
    1. `check.test.ts`, "matches graph.json, the graph the CLI draws": edit allowed. Its `inspect()` call gains `load: [FtlDrive]`; the title, the comment ("nexusdi graph makes the same inspect() call") and the assertion stay. A case beside it cannot work: once the `graph` target draws the drive, an `inspect()` with no load no longer equals `graph.json`, and the owner's scope says `graph.json` gains the drive.
    2. `ship-state-store.test.ts:614-625`, the two `slice(-4)` reads: edit allowed. They become `['helm', 'ftl', 'safety', 'setpoints']` and `['drive', 'helm', 'ftl', 'safety']`. No key order keeps both stale reads: a snapshot `ftl` before `drive` and a setpoint `ftl` before `comms` would keep both, and the two orders would then differ from each other and from §4.1. A key order chosen to keep a stale assertion would teach the reader a false order, so §4.1 wins. `ftl` after `setpoints` would change the closing brace of every golden snapshot. The new store case of ruling 11 sits beside them.
    3. The six earlier goldens gain lines alone (ruling 2).
    4. The console's `playwright.e2e-growth.config.mts`: `ftl` joins after `helm`, `comms` moves to `dependencies: ['ftl']`, and `chromium`'s `testIgnore` gains `ftl`. A config line is no test body, the comms spec stays byte-identical, and G6 moved `comms` behind `helm` the same way. The comment above `comms` ("runs after every other case") stays true.
    5. `answerCommand` maps through `refusedReply`, and `growth-cases.ts`'s `send` calls the new `post`. These are helpers, and no case body changes. Condition: `post` takes the label, so every failure message of an earlier case stays byte-identical (`throttle status`, `throttle answer`).

    Enumerating unit assertions and helpers not listed here stay as they are. No earlier e2e body changes and no golden line is removed.

14. The console. The path is `/systems/ftl`, a static route in the ship-layout group of `app/routes.ts` with the nav link "FTL" beside "Helm" in `app/routes/layout.tsx`. Loader `snapshotLoader`, action `ftlAction`.
    - "FTL drive" section, gauges `FTL gauges`: `Status` (`ftl.status`), `Armed` (`Yes` or `No`), `Spool charge` (GJ to 0.1, `fixed(charge / 1e9, 1)`), `Spool power` (the `ftl-spool` allocation through `megawatts()`, `0.0 MW` before the load), `Sector`, `Last jump` (`tick N` or `none`).
    - "Spool" section: one button "Spool drive" (`command=spool`). "Jump" section: a select `to` of `Object.keys(BUNDLED_CHARTS)` and the button "Jump" (`command=jump`). `SnapshotOffline` when the backend fails.
    - `BRIDGE_LINK` gains `spool()` and `jump(to)`, which post to `POST /ftl/spool` and `POST /ftl/jump` and resolve to a `CommandAnswer`. `command(cmd)` and both read the answer through one private `#post(path, body)`, a refactor of `command` in its own commit, so the 202/400/409 read exists once. `ftlAction` joins `system-action.server.ts` beside `systemAction`: it reads `command` and `to` from the form and calls `link.spool()` or `link.jump(to)`.
    - `shipAtStart` in `tests/doubles.ts` gains the record at `offline` (Task 1), and `fakeBridgeLink` gains `spool` and `jump` (Task 4).
    - `0.45` reads `0.5 GJ` and `8.55` reads `8.6 GJ`: the binary doubles sit above the half. Issue #191 (double rounding) stays out of scope.

15. Duplication. `npx fallow dupes` reads 2.1359 % at `3c72c9bf` (1,456 of 68,169 lines, 95 clone groups; `arch-dupes.json`). The branch may add `9.63 + 0.0215 * N` duplicated lines for `N` new counted lines (`t0-figures.mjs`). The architect counted about 770 new lines (library `src` about 350, `e2e/ftl.e2e.ts` 30, bridge-api routes 60, `src/bridge/ftl.ts` 35, the stub 30, `growth-cases.ts` 60, `e2e/growth/ftl.e2e.ts` 17, the console about 120). Rulings 5, 6 and 10 add about 60 (the rating helper, the stream argument, the three route changes, the telemetry and stub cases), so N reaches about 830 and the allowance at 2.15 % about 27 lines. The telemetry cases run as one `describe.each` over the three frameworks. Where a clone is avoided:

    | Place                                                      | Answer                                                                       |
    | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
    | the FTL refusal mapping beside `answerCommand`'s           | `refusedReply` in `refusal.ts`                                               |
    | the link's FTL posts beside `command()`                    | `#post` (ruling 14)                                                          |
    | the stub beside `JumpDrive`                                | the stub has no refusal code                                                 |
    | `spoolAndJump` beside the other cases                      | `post`, `advanceTo` and `expectEqual`                                        |
    | `e2e/growth/ftl.e2e.ts` beside `helm.e2e.ts:1-17` and more | a further instance of the 5-line group, unavoidable since earlier files stay |
    | `e2e/ftl.e2e.ts` beside `helm.e2e.ts:10-13`                | the opening `Nexus.create`, `desk` and `loop`, about 4 lines                 |
    | `ftl.tsx` beside `comms.tsx`                               | loader and action lines under 30 tokens                                      |
    | the three frameworks' FTL routes                           | each in its framework's syntax, as the earlier routes                        |

    The architect expected +9 to +15 duplicated lines, 2.139 % to 2.146 %. Each task that adds a counted file runs `npx fallow dupes` and records the figure; a figure over 2.15 % removes its own clone in a fixup first. `.fallowrc.jsonc` keeps 2.25 %.

16. Spec errors and amendments. The spec errors, numbered as the architect found them (error 4 is rejected by ruling 5, so the stream does read `FTL_DRIVE`):
    - Error 1: §6 (Graph CLI row) and the G7 text: `--load src/systems/ftl#FtlDrive` is no ref the CLI loads. The ref is `src/ship/meridian.ts#FtlDrive`.
    - Error 2: §4.2 (line 632) and §6.3 name the loop's attach alone. The router's `all(POWER_CONSUMERS)` is the list at its construction too, so the spool's load (§5.7, priority 7) needs `IPowerRouter.attach`.
    - Error 3: §6.3: "runs `await ship.load(FtlDrive)` once (a second call is a no-op the handler skips), then `FTL_DRIVE.spool()` in a new scope". On the Node entries `nodeScopes()` opens the request's scope before the handler, and a handler that reads it after the load answers `NEXUS_LOADED_AFTER_SCOPE`. Each adapter's `di.load(FtlDrive)` loads once and extends the request's scope.
    - Error 5: §6.4: "a spool with the reactor under 90 %" as an example of `MERIDIAN_POWER_BUDGET`. From level 0.7438 the router fits the spool, so a spool at 0.75 to 0.9 passes the router and holds in the tick. The example becomes "a spool the router cannot fit, such as one on a cold reactor".
    - Error 6: §6.3: "`FtlDrive` imports `Engineering`". The global aggregate already hands it `POWER_ROUTER` (G6 ruling 9).
    - Error 7: §5.9: `S' = min(1, S + P_f * dt / E_spool)`. The fraction drifts to 1.0000000000000007 before the clamp, and the record holds the charge in J, exact at 450,000,000 J a tick.
    - Error 8: §5.9 and §5.6: `Q_pulse` sits in the phase-1 equation while the jump runs in phase 3. The drive adds `0.1 * E_spool / C_c` = 10.7914 K in its own step, and §5.9's "10.8 K" holds.
    - Error 9: §10.2 ("A ship system"): `FtlDrive` contributes no `IShipSystem` to `SHIP_SYSTEMS`; it attaches its physics to the loop.
    - Error 10: §8.2 and the §6 testing row: "the helm suite over `SimulatedFtlDrive`" is a jump suite, and "a test of a jump does not spool a real drive" reads true of it.
    - Error 11: §12 says "a jump changes its sector" and §4.1 gives no sector before the first jump: `Sol`.
    - Error 12: G0 ruling 4 says "`attach()`/`detach()`"; `attach` returns the detach, as `listen` returns its unsubscribe.
    - Error 13: §6's `load()` row and §7.1 say the drive loads "on the first `POST /ftl/spool`". The section loads it on the first FTL request, a jump included (ruling 6).
    - Error 14: §15's G6 owner list (lines 2829-2830): "Its copy `app/bridge/charts.json` and `tests/charts.test.ts` go" reads as if the test were a copy. It becomes "Its copy of the table, `app/bridge/charts.json`, goes, and so does `tests/charts.test.ts` (G6 ruling 24)." Task 8 commits it as `git commit --fixup=3c72c9bf`.

    The spec amendments Task 8 applies:
    - §3.1, the tree: `src/physics/` gains `ftl.ts (G7)` and `src/systems/ftl/   FtlDrive: the jump drive, loaded with load() (G7)`. The aggregate paragraph keeps "`FtlDrive` stays out of the aggregate" and gains: "The index exports `FtlDrive`, the one module object beside `meridianSystems`. It fails `Nexus.check` alone (`NEXUS_MISSING_PROVIDER` for `TickLoop`, `ShipState`, `NavCharts` and `PowerRouter`) and passes as a load of a ship `meridianSystems()` built." The export sentence gains `FtlDrive`, `FTL_DRIVE`, `FtlNotSpooledError` and the types `IFtlDrive`, `FtlRating`, `FtlRecord`, `FtlSetpoints` and `FtlStatus`.
    - §3.2: the `FtlDrive` row keeps `FTL_DRIVE` and adds "attaches its physics to `TICK_LOOP` and its load to `POWER_ROUTER`". The router paragraph: "A module that `load()` adds attaches its consumer with `POWER_ROUTER.attach()`, since the router's `all()` is the list at its construction."
    - §3.3: `IFtlDrive` has `spool()`, `jump(to)` and `rating`; the refusals of ruling 7; `FTL_ACTIONS` reads "spool with no arguments and jump with a charted star to jump to". `ITickLoop` gains `attach(system)` and `IPowerRouter` `attach(consumer)`, each returning a detach that runs twice safely. The data-shape sentence gains `FtlRecord`, `FtlSetpoints` and `FtlRating`.
    - §4.1: "From G7 the FTL record, `ftl: FtlRecord`, holds the `status` (`offline` until the drive's first step, then `idle`, `held`, `spooling` or `charged`), the `charge` in J, the `sector` (`Sol` at tick 0) and the tick of the last jump in `jumped` (null before the first). `setpoints.ftl` holds `armed` and `jump`, the star of a commanded jump or null. Both sit after `helm`, and the store freezes both."
    - §4.2: line 632's paragraph names both attaches and the router; the phase-3 row reads "the spool and the jump" for `FtlDrive` in G7.
    - §5.7: "From G7 the spool draws `ftl-spool` at priority 7 with heat share 0.1: 900 MW while armed below a full charge, with the reactor at 0.9 or more and the coolant under 1,300 K at the start of the tick, and 0 W otherwise. The drive attaches the load when it loads, so the power record lists it from the tick after the load. `spool()` asks `divert`; a spool fits from level 0.7438, beside the raised shields from 0.9091. A spool the router fits under 90 % holds at 0 W until the reactor reaches 0.9, and a spool the router sheds raises `LOAD_SHED ftl-spool`."
    - §5.9: the FTL text of ruling 3, with the charge in J and the pulse of 10.7914 K applied in phase 3. §5.6: "The jump's pulse enters the loop in phase 3; the spool's heat share is 0.1, and the hottest equilibrium with the spool is 1,202.4 K, beside the raised shields."
    - New §5.14 The FTL drive in the ship: the figures of the module test.
    - §6 table, `load()` row: "`di.load(FtlDrive)` runs `ship.load(FtlDrive)` on the first FTL request; `JumpDrive.onInit()` attaches its physics to the loop and its load to the router". `scope.extend()` row: "the telemetry stream's request scope opens before the first spool loads the FTL drive; on the first frame whose `ftl.status` is no longer `offline` the stream calls `extend()` and reads `FTL_DRIVE.rating` into the frame's `ftlRating` (`NEXUS_LOADED_AFTER_SCOPE` otherwise)". The graph row reads `--load src/ship/meridian.ts#FtlDrive`. The testing row: "a test of a jump does not spool a real drive".
    - §6.3: the first paragraph names the section, its one load, and the second spool that queues nothing; the second paragraph keeps "a scope opened before the load, such as a telemetry stream, calls `scope.extend()` before it reads `FTL_DRIVE`". §6.3 is rewritten around rulings 1, 3, 4, 6 and 8.
    - §6.4: the five codes stand; the `MERIDIAN_POWER_BUDGET` example of error 5; "G7 adds `FtlNotSpooledError`, which carries the `charge` and the `energy` in J, with the text of ruling 7".
    - §7.1: the FTL row's answers (ruling 7); the `/telemetry` row gains "from the frame after the FTL drive loads, `ftlRating`, the bound drive's rating"; a G7 paragraph with the route block, `check.test.ts`, `graph.json`, the stub suite, the seventh case and its Node file.
    - §7.2: `/systems/ftl` | "a static route with the drive's status, the arm, the spool's charge in GJ and its power, the sector and the last jump, a spool button and a jump select, and the answer to the last command" | G7; a paragraph on `BRIDGE_LINK.spool()` and `jump(to)`.
    - §7.4: the G7 row "`FtlDrive`, loaded with `load()`: the spool, the jump, the FTL routes and the console's FTL page"; "G7 adds one module, loaded after startup; every earlier golden gains the FTL record and setpoints alone."
    - §8.1: the `ftl.test.ts` item of the unit-test list, the loop and router `attach` items. §8.2: `test/ftl.test.ts` of the numbers section, and bridge-api's suite over `SimulatedFtlDrive`.
    - §8.3: "G7 adds the FTL record and setpoints to the six goldens, which gain 30, 30, 30, 50, 30 and 40 lines and change none. G7 adds `e2e/golden/ftl.seed-7.json` (`e2e/ftl.e2e.ts`): throttle 1 at tick 0, a spool after tick 100 and a jump to Kepler-442b after tick 300, pinned at ticks 101, 300 and 301 in 620 lines." The runtime sentence: seven cases, the seventh a spool and a jump, integers and strings alone. The console paragraph gains the `ftl` project between `helm` and `comms`.
    - §10.1: the `IFtlDrive` row's deps stand; the changed rows `ITickLoop` (`attach`) and `IPowerRouter` (`attach`). §10.2: "A ship system" notes that `FtlDrive` attaches its physics; "A record" gains `FtlRecord` and `FtlSetpoints`; "A rating" gains `FtlRating` (`FTL_SPOOL`), read through `IFtlDrive.rating`; "A load" gains `ftl-spool`; a row "A jump | `POST /ftl/spool` arms the spool, `POST /ftl/jump` with a charted star moves the ship's sector there on a full charge"; "Simulation doubles" gives ruling 10's stub.
    - §13: "G7 leaves out a stand-down command, a jump range or travel time, a propellant cost, and a seventh bundle sentinel."
    - §15: the fifteen rows below, and the closing paragraph lists `specs/plans/2026-10-21-meridian-g7-ftl.md`.

17. Tasks and parallel work. The task table and the order are in the Tasks section. 18 commits and one fixup before review fixups, 19 in all (this corrects the rulings' "19 commits and one fixup"), so the branch holds 22 commits before the fold and 21 after, far under 100. Each task gets an opus reviewer before the next task in its line starts. Docs safety: nothing under `apps/docs`, `examples/meridian/src` or any `libs/*/README.md` names `FTL_DRIVE`, `FtlDrive` or `JumpDrive` (`grep`), and `apps/docs/content/load.mdx` teaches `load()`, `extend()` and `di.load` with its own `Survey` and `Navigation` modules. G7 changes no docs file.

The §15 rows G7 adds, each dated 2026-10-23 and ending "tech lead, G7 ruling N":

1. The snapshot gains `ftl` (`status`, `charge` in J, `sector`, `jumped`) and the setpoints `ftl` (`armed`, `jump`) after `helm`; the record starts `offline` with the sector `Sol`, and the drive's first step writes its status (ruling 2).
2. The spool charges 450,000,000 J a tick while armed, with the reactor at 0.9 and the coolant under 1,300 K at the start of the tick; a jump on a full charge moves the sector, disarms and adds 10.7914 K to the loop in phase 3 (ruling 3).
3. `ITickLoop.attach` and `IPowerRouter.attach` let a loaded system join the loop and the router, and `JumpDrive.onInit()` attaches `FtlPhysics` and `FtlPower`; `attach` returns its detach, amending G0 ruling 4 (ruling 4).
4. The spool draws `ftl-spool` at priority 7 with heat share 0.1 and draws 0 W while held; `spool()` asks `divert` and refuses with `MERIDIAN_POWER_BUDGET` (rulings 3 and 4).
5. The telemetry stream extends its request scope on the first frame after the drive loads and sends the bound drive's rating as `ftlRating` (ruling 5).
6. bridge-api serves `POST /ftl/spool` and `POST /ftl/jump` through `di.load(FtlDrive)` on three frameworks, and the section loads once and extends a request scope that started; a spool on an armed drive queues nothing and answers the next tick (ruling 6).
7. `jump(to)` refuses an uncharted star with `MERIDIAN_BAD_COMMAND` and a partial charge with `MERIDIAN_FTL_NOT_SPOOLED`; the FTL commands take their own routes outside the desk, and G7 adds no stand-down command (ruling 7).
8. `FtlDrive` binds `FTL_DRIVE` alone, reads its tokens through the global aggregate, and the index exports it with `FtlRating` (ruling 8).
9. The `graph` target draws the loaded drive with `--load src/ship/meridian.ts#FtlDrive`, and `shipNotes` labels it (ruling 9).
10. `SimulatedFtlDrive` arms and jumps with no checks and no pulse, and bridge-api's `test/ftl.test.ts` runs it through `overrideModule(FtlDrive, SimulatedFtlDrive, { lazy: true })` (ruling 10).
11. The library gains `test/ftl.test.ts` and the golden `ftl.seed-7.json` at ticks 101, 300 and 301; every earlier golden only gains lines (30, 30, 30, 50, 30 and 40) (rulings 2 and 11).
12. bridge-api gains `the ftl commands on %s`, `the telemetry stream on %s` and the seventh runtime case `spoolAndJump` (rulings 5 and 12).
13. The console gains `/systems/ftl` with the charge in GJ, `BRIDGE_LINK.spool()` and `jump(to)`, and a growth project `ftl` between `helm` and `comms` (ruling 14).
14. Two enumerating unit assertions grow with the ship, and `check.test.ts` draws the graph with the load (ruling 13).
15. G7 changes no docs page or docs region, and `npx fallow dupes` stays at 2.15 % or under from 2.1359 % (ruling 15).

## Numbers the tests assert

Every figure comes from the architect's scripts (`arch-core.log`, `arch-adapter.log`, `arch-physics.log`, `arch-figures.log`, `arch-golden-lines.log`, `arch-golden-ftl.log`, `arch-bridge.log`, `arch-runtime.*.log`, `arch-gauges.log`, `arch-dupes.json`) and the tech lead's (`tl-rerun-core.log`, `tl-rerun-physics.log` and `tl-rerun-figures.log` equal the architect's logs byte for byte; `tl-golden-offline.log`, `tl-stream.log`, `tl-stream.noextend.log`). Where the tech lead's figure differs from the architect's, the tech lead's holds. Two figures come from Task 0's own scripts, `t0-figures.mjs` (golden line totals, the duplication allowance, the commit count) and `t0-stream.log` (a clean rerun of `tl-stream.mts`, because the scratch file `tl-stream.log` holds a crashed Express run followed by stale text from an earlier run). Each task's reviewer recomputes the figures its task asserts.

Physics (`ftl.ts`), from `arch-physics.log`:

- `E_spool / P_f` is 100 s, 200 ticks at dt 0.5. `P_f * dt` is 450,000,000 J, an integer, and the charge reaches 90,000,000,000 J exactly after 200 ticks; the fraction `S` is 1.0000000000000007 after 200 ticks before its clamp.
- The jump pulse `0.1 * E_spool` is 9,000,000,000 J, `Q_pulse` over one tick is 18,000,000,000 W, and `ΔT_c` is 10.79136690647482 K (§5.9: 10.8 K); `pulseCoolant(500 K)` is 510.7913669064748 K. `C_c` is 8.34 × 10⁸ J/K.
- Reactor at full 1,210,000,000 W. Priorities 1 to 4 at full take 225.06857 MW and leave 984.93143 MW (§5.7: 985 MW). With the main drive burning, 384.93143 MW remain and the spool never fits. With the drive cut and the G8 capacitor drawing, 684.93143 MW remain.
- The spool alone fits from reactor level 0.743801652892562, beside the raised shields from 0.9090909090909091, beside priorities 1 to 4 at full from 0.9298087355371901. At level 0.9 (1,089 MW) beside the raised shields 889 MW remain and the router sheds the spool.
- Throttle 1 queued at tick 0: tick 74 level 0.7400000000000004 and electric 895,400,000.0000005 W; tick 75 907,500,000.0000005 W; tick 90 level 0.9000000000000006; tick 91 level 0.9100000000000006. From level 0.6 it takes 30 ticks to reach 0.9 at throttle 1.
- Coolant equilibria: 1,185.6 K at full output with no load, 1,196.5 K with the spool, 1,202.4 K with the spool and the raised shields. The hottest G6 equilibrium stays 1,219.6 K (the spool never runs beside the drive at full), and the 1,300 K limit is out of reach, so the pure test feeds it: `ftlDemand` at 1,299.9 K is 900,000,000 W, at 1,300 K 0 W, and at level 0.8999999999999999 0 W.

Library unit tests, each beside its file (gating):

- `src/physics/ftl.test.ts`: 200 spool ticks reach 90,000,000,000 J exactly and the 201st keeps it; `ftlDemand` asks 900,000,000 W armed below full and ready, 0 W unarmed, at full, at level 0.8999999999999999 and at 1,300 K, and asks at 1,299.9 K; `stepFtl` returns the objects it got when idle, `spooling` with an allocation, `held` armed with none, `charged` at full, and on a jump `{ status: 'idle', charge: 0, sector, jumped: tick }`, `{ armed: false, jump: null }` and a pulse of 9,000,000,000 J; a jump below full changes nothing; `stepFtl` on the store's `offline` record with no allocation returns a new `idle` record; `pulseCoolant` raises 500 K to 510.7913669064748 K; every built record is frozen.
- `src/simulation/fixed-step-loop.test.ts`: `attach` runs a system from the next tick in phase and name order, forks its RNG by name, refuses a name the loop runs, and its detach removes it and runs twice safely; an attach inside a listener first steps on the next tick.
- `src/systems/engineering/plasma-router.test.ts`: `attach` lists the consumer after the `POWER_CONSUMERS` entries, and its detach removes it and runs twice safely.
- `src/systems/ftl/jump-drive.test.ts` (fakes): `onInit` attaches one system and one consumer and the disposer calls both detaches; `spool()` diverts `{ id: 'ftl-spool', priority: 7, demand: 900e6, heatShare: 0.1 }` and queues `{ ftl: { armed: true } }`, and queues nothing when `divert` throws; `spool()` on an armed snapshot calls no `divert`, queues nothing and returns `{ tick: t + 1 }`; `jump('Vega')` and `jump('constructor')` refuse with reason `argument` and `expected: FTL_ACTIONS`; `jump` below full throws `FtlNotSpooledError` with the charge; at full `jump` queues `{ ftl: { jump } }`.
- `ftl-physics.test.ts`: phase 3 and the name `FtlDrive`; an idle ship comes back as it went in; a jump writes the record, the setpoints and the loop 10.7914 K higher; the snapshot is frozen. `ftl-power.test.ts`: the load from `ftlDemand`.
- `src/errors.test.ts` and `src/text.test.ts`: the new class links to `#MERIDIAN_FTL_NOT_SPOOLED` and words "The FTL drive holds 22.5 GJ of the 90 GJ a jump needs."
- `ship-state-store.test.ts`: the two `slice(-4)` reads become `['helm', 'ftl', 'safety', 'setpoints']` and `['drive', 'helm', 'ftl', 'safety']`, and a new case reads the record `offline` and the setpoints idle after `helm`, frozen.
- `test/notes.test.ts` gains one case: `inspect()` with `load: [FtlDrive]` labels the drive's provider `system: FtlDrive` with no phase note. This case is an addition of this plan beyond the rulings, so the `notes.ts` change in Task 2 has a test of its own; the bridge-api case of Task 3 repeats it on the dev graph.

Library module test `test/ftl.test.ts` (gating), `meridianSystems({ seed: 7, dt: 0.5 })` offline, with `FtlDrive` loaded by `ship.load` where a row says so (about 700 ticks a case; the library configs carry `testTimeout: 30_000`):

| Case            | Assertion (`arch-figures.log`, `arch-core.log`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| check           | `Nexus.check(root, { load: [FtlDrive] })` passes; `Nexus.check(FtlDrive)` fails with `NEXUS_MISSING_PROVIDER` for `TickLoop`, `ShipState`, `NavCharts` and `PowerRouter`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| load            | before the load the root has no `FTL_DRIVE`, tick 1 lists five loads and reads the record `{ status: 'offline', charge: 0, sector: 'Sol', jumped: null }`; two loads build one drive; tick 2 reads `{ status: 'idle', charge: 0, sector: 'Sol', jumped: null }` as a new object and lists `ftl-spool` at 0 W after `main-drive`; tick 3 keeps the record by identity; `get(SHIP_SYSTEMS)` lists no FtlDrive entry; the desk refuses `ftl` with `expected: 'comms, engineering, helm, life-support and safety'`; a second `FtlDrive`-named system refused by `loop.attach`                                                                                                                                                                                                                                         |
| ramp            | spool at tick 0 refuses with `available` 0; throttle 1; at tick 74 `available` 895,400,000.0000005; at tick 75 it queues for tick 76; ticks 76 to 90 `held` at 0 W with no alarm; tick 91 `spooling`, 450,000,000 J, 900,000,000 W allocated; log ticks `[1, 76]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| golden scenario | throttle 1 at tick 0, spool after tick 100 (`{ tick: 101 }`); jump at tick 100 refuses with charge 0; tick 101 `spooling` 450,000,000 J; jump at tick 150 refuses with charge 22,500,000,000; a second spool at tick 200 answers `{ tick: 201 }` and the log keeps ticks `[1, 101]`; tick 300 `charged` 90,000,000,000 J; jumps to `Vega` and `constructor` refuse with reason `argument`; jump to Kepler-442b `{ tick: 301 }`; tick 301 `{ status: 'idle', charge: 0, sector: 'Kepler-442b', jumped: 301 }`, `{ armed: false, jump: null }`, the load at 0 W, the coolant 10.7914 K (to 1 × 10⁻⁹) above the same run with no jump (844.442961811425 against 833.6515949049501); log ticks `[1, 101, 301]`; a spool at tick 302 answers `{ tick: 303 }` and a jump after tick 502 reaches TRAPPIST-1e at tick 503 |
| shed            | spool armed at full, then the shields raised and throttle 0.9: tick 120 `held`, `power.shed` `['ftl-spool']`, the alarm `LOAD_SHED ftl-spool`, charge 8,550,000,000 J                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| cold ship       | throttle 0.01 and life support online: spool at tick 600 refuses with 12.1 MW free (`available` 12093132.552581994)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| scope           | a scope opened before the load throws `NEXUS_LOADED_AFTER_SCOPE` for `FTL_DRIVE`; after `await scope.extend()` it reads the root's drive                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

The golden row's second spool at tick 200 and its `{ tick: 201 }` follow from ruling 6 and appear in no log (the logs predate the no-op). Task 2's implementer reports what the test run reads, and the reviewer checks it against ruling 6.

Golden scenario values by tick (`arch-figures.log` D, `arch-physics.log`): coolant 571.9 K at tick 101, 832.6 K at tick 300 and 844.4 K at tick 301; charge 450,000,000 J at tick 101, 89,550,000,000 J at tick 299 and 90,000,000,000 J at tick 300.

Library golden `e2e/golden/ftl.seed-7.json` (`e2e-growth`, Node from `.nvmrc`): `e2e/ftl.e2e.ts` loads `FtlDrive` into the offline ship, queues throttle 1 at tick 0, spools after tick 100 and jumps to Kepler-442b after tick 300. It pins `roundSnapshot` at ticks 101, 300 and 301, 620 lines (`arch-golden/ftl.seed-7.json`; `arch-golden-ftl.log`). Tick 101 holds the first spool tick at 900,000,000 W, tick 300 the full charge, tick 301 the jump, the coolant at 844.4 K and the load at 0 W.

Golden line counts (`git diff --numstat`; Myers, histogram and patience agree, and `diff` reports 0 changed lines; `tl-golden-offline.log`, `arch-golden-lines.log`, and `t0-figures.mjs` for the totals). Each snapshot gains 10 lines of record and setpoints. With the `ftl` fields stripped, each replay equals the committed golden byte for byte.

| Golden                     | G7 gain | Lines before | Lines after |
| -------------------------- | ------- | ------------ | ----------- |
| `idle.seed-7.json`         | +30 −0  | 572          | 602         |
| `life-support.seed-7.json` | +30 −0  | 572          | 602         |
| `safety.seed-7.json`       | +30 −0  | 572          | 602         |
| `airlock.seed-7.json`      | +50 −0  | 952          | 1,002       |
| `comms.seed-7.json`        | +30 −0  | 584          | 614         |
| `helm.seed-7.json`         | +40 −0  | 774          | 814         |
| `ftl.seed-7.json` (new)    | n/a     | n/a          | 620         |

`bridge-api` route block `the ftl commands on %s` (gating; Hono, Express, Fastify), after every existing block, on the `scopedShip` fixture, so `nodeScopes()` opens each request's scope before the load (`arch-bridge.log` 3):

| Request                                                      | Answer                                                                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /ftl/spool` at tick 0                                  | 409 `{ code: 'MERIDIAN_POWER_BUDGET', message: 'The ftl-spool load needs 900 MW, and the router has 0 MW free beside the loads above it.', fix }`; the root now has `FTL_DRIVE` |
| throttle 1, 100 ticks, `POST /ftl/spool`                     | 202 `{ tick: 101 }`                                                                                                                                                             |
| `POST /ftl/jump` `{ to: 'Kepler-442b' }`                     | 409 `MERIDIAN_FTL_NOT_SPOOLED`, "The FTL drive holds 0 GJ of the 90 GJ a jump needs."                                                                                           |
| `POST /ftl/jump` `{}`, and a `text/plain` body               | 400 `MERIDIAN_BAD_COMMAND`, "ftl jump got an argument it cannot use. It takes spool with no arguments and jump with a charted star to jump to."                                 |
| 200 ticks, `GET /sim`                                        | `ftl` `{ status: 'charged', charge: 90000000000, sector: 'Sol', jumped: null }`, the load 900,000,000 W allocated                                                               |
| second `POST /ftl/spool`                                     | 202 `{ tick: 301 }` (ruling 6; in no log)                                                                                                                                       |
| `POST /ftl/jump` `{ to: 'Kepler-442b' }`, 1 tick, `GET /sim` | 202 `{ tick: 301 }`; `{ status: 'idle', charge: 0, sector: 'Kepler-442b', jumped: 301 }`, `{ armed: false, jump: null }`, no alarm                                              |
| `GET /commands`                                              | ticks 1, 101 and 301                                                                                                                                                            |

A further row on a fresh scoped ship: `POST /ftl/jump` `{ to: 'Kepler-442b' }` as the first FTL request loads the drive and answers 409 `MERIDIAN_FTL_NOT_SPOOLED` with the 0 GJ text (ruling 6; in no log, so the implementer reports the observed answer).

`check.test.ts` (Task 3 second commit): a new case "compiles the FTL drive as a load of both roots" (`Nexus.check(Meridian, { plugins, load: [FtlDrive] })` and the offline root passes, `arch-bridge.log` 1); "matches graph.json" passes `load: [FtlDrive]` to its `inspect()` call (ruling 13); a new notes case loads the drive and reads `['system: FtlDrive']` on `FtlDrive in FtlDrive`. The existing notes case stays as it is.

`test/telemetry-stream.test.ts` (Task 3 third commit), beside the existing cases, with a fake scope: a frame at `offline` calls no `extend`; the first frame at `idle` calls `extend` once before `get`; later frames reuse the rating; a rejected extend errors the stream.

`test/ftl.test.ts`, `the telemetry stream on %s` (Hono, Express, Fastify, each on a ship built with `nodeScopes()`, as the Node entries; Task 3 third commit): `GET /telemetry` opens first; a frame at tick 0 reads `ftl.status` `offline` with no `ftlRating`; `POST /ftl/spool` answers 409 and loads the drive; one tick; reading frames until tick 1 gives `ftl.status` `idle` and `ftlRating` `{ energy: 90000000000, power: 900000000, pulseShare: 0.1, reactorLevel: 0.9, coolantLimit: 1300 }` (`t0-stream.log` shows energy and power; `arch-figures.log` B shows all five fields). Hono's body may hold one frame ahead (the architect's read got tick 100 after an advance to 101), so the case reads until the tick it names. The `t0-stream.log` frames read tick 1 `idle` and tick 2 `spooling`.

`test/ftl.test.ts`, the simulated drive (Task 3 fourth commit), `createTestingContainer(OfflineMeridian).overrideModule(FtlDrive, SimulatedFtlDrive, { lazy: true })` per framework (`arch-bridge.log` 4 ran the architect's stub, which refused a jump at tick 0; the committed stub has no refusal, so the answers below are the ruled stub's, and the implementer reports what the committed stub reads):

- the spool on a cold reactor: 202 `{ tick: 1 }`; after one tick the jump to Proxima-b: 202 `{ tick: 2 }`; after one more tick the record reads `{ status: 'idle', charge: 0, sector: 'Proxima-b', jumped: 2 }` with `{ armed: false, jump: null }`, five loads and the coolant at 500 K;
- the root's drive is a `SimulatedJumpDrive`;
- the telemetry frame at tick 1 carries `ftlRating.power` 0 (the stream reads the bound drive), and earlier frames stay `offline` with no rating;
- a case without `lazy` fails `create()` with `NEXUS_BLUEPRINT_INVALID`, which carries `NEXUS_OVERRIDE_UNUSED` inside it.

The seventh runtime case `spoolAndJump` (Hono, Express, Fastify, workerd, Deno, Bun), named "a spool and a jump on the offline ship charge the drive and move the ship to the charted star". From tick 0: throttle 1 (202 `{ tick: 1 }`); `POST /ftl/spool` 409 with the 0 MW text; `advanceTo(fetch, 100, 100)` reads `ftl` idle and the load at 0 W; spool 202 `{ tick: 101 }`; the jump 409 with the 0 GJ text; `advanceTo(fetch, 200, 300)` reads `charged`, 90,000,000,000 J and 900,000,000 W allocated; a second `POST /ftl/spool` 202 `{ tick: 301 }`; jump to Vega 400; jump to Kepler-442b 202 `{ tick: 301 }`; `advanceTo(fetch, 1, 301)` reads `{ status: 'idle', charge: 0, sector: 'Kepler-442b', jumped: 301 }`; `GET /commands` ticks `[1, 101, 301]`. Every value is an integer or a string, so the case compares exact values. A new helper `post` sends to the FTL routes, and `send` calls it, so no request code repeats. `e2e/growth/ftl.e2e.ts` runs the case on the three Node servers through `withShip`. The architect's evidence (`arch-runtime.*.log`, which ran without the second spool): Node, the Node bundle, Deno 2.9.6 and Bun 1.4.2 print byte-identical logs (md5 `a21deb587bef86f648bad7040871e2f4` on all four); `/sim` at tick 300 is 2,138 bytes, FNV-1a `d6e57e57`, and the final `/sim` 2,119 bytes, `61ebb8cf`, in the prototype's key order. The second spool changes no `/sim` read. Task 5 records the committed code's hashes. Determinism: the drive uses `+ − * /`, `Math.min` and compares, which ECMA-262 fixes bit for bit. Its gates compare the reactor level (ramp arithmetic) and the coolant, whose `t ** 4` ECMA-262 does not fix; the coolant sits near 830 K, 470 K from the gate, so every engine takes the same branch.

Console route spec `tests/routes/ftl.spec.tsx` (gating), each double spreading `shipAtStart` and feeding the reading `/sim` sends (`arch-gauges.log`, with the `offline` tick 0 of ruling 14):

| Reading         | Gauges (Status, Armed, Spool charge, Spool power, Sector, Last jump) |
| --------------- | -------------------------------------------------------------------- |
| tick 0          | `offline`, `No`, `0.0 GJ`, `0.0 MW`, `Sol`, `none`                   |
| golden tick 101 | `spooling`, `Yes`, `0.5 GJ`, `900.0 MW`, `Sol`, `none`               |
| shed (tick 120) | `held`, `Yes`, `8.6 GJ`, `0.0 MW`                                    |
| golden tick 300 | `charged`, `Yes`, `90.0 GJ`, `900.0 MW`                              |
| golden tick 301 | `idle`, `No`, `0.0 GJ`, `0.0 MW`, `Kepler-442b`, `tick 301`          |

The spool button posts to the fake link's `spool()` and shows `Queued for tick 1`; a refused spool shows the 0 MW text and its `Fix:` line; the select lists the charted stars, and "Jump" for Proxima-b calls `jump('Proxima-b')`; a refused jump shows the 0 GJ text; the offline page shows `Ship snapshot offline`. `tests/bridge-link.test.ts` gains the two posts.

Console growth case (`ftl` project, `e2e/growth/ftl.spec.ts`), from the shared ship's tick `t` (throttle 0.6, life support online, the helm settled at 42°, the drive burning at level 1): `/systems/engineering` sets the throttle to 1 and `/systems/helm` the burn to 0, each `Queued for tick t + 1`; 40 backend ticks; `/systems/ftl` reads `offline`, `0.0 GJ`, `Sol` (no earlier project loads the drive); "Spool drive" shows `Queued for tick t + 41`; 200 ticks and a reload read `charged`, `90.0 GJ`; "Jump" to Proxima-b shows `Queued for tick t + 241`; 1 tick and a reload read `idle`, `0.0 GJ`, `Proxima-b`, `tick t + 241`; `/systems/safety` reads `No alarms`; no console error. The level climbs from 0.6 to 0.9 in 30 ticks (`arch-physics.log`), so the spool draws from `t + 41` on any start tick, a spool queued for tick `q` is full at tick `q + 199` (`t0-figures.mjs`: 101 gives 300, 41 gives 240), and each read is exact. The backend is a Node server with `nodeScopes()`, so the case runs the section's extend. The comms case then reads the array at 0 W, which the spool does not touch.

Duplication: base 2.1359 % (1,456 of 68,169 lines); end at 2.15 % or under.

## Global Constraints

- Worktree `.claude/worktrees/feat/meridian-g7-ftl`. Prefix every nx command and every `git commit` and `git push` with `NX_NO_CLOUD=true NX_DAEMON=false`. Every nx command takes `--parallel=2`. Never touch the main checkout or switch a branch.
- The branch holds 100 commits or fewer. A task with code or text is one to four commits, 18 in all plus one fixup (19), and 22 with the three G6 leftovers. Review fixups go in `git commit --fixup=<sha>` commits of the commit each fix belongs to and fold before the PR. A fixup that amends a message uses `git commit --fixup=amend:<sha>` and carries the full message, the subject line included.
- Never change files under `libs/`. If a core API behaves differently from this plan or the spec, stop and report it.
- Every commit passes `npx nx test @nexusdi/meridian-systems --parallel=2` and `npx nx test @nexusdi/bridge-api --parallel=2 -- test/check.test.ts` on its own (`scratchpad/meridian-g7/each.sh` runs both), and the final `rebase -x` checks it. A commit that changes the graph carries the regenerated `graph.json` (`npx nx run @nexusdi/bridge-api:graph --parallel=2`) and the `check.test.ts` notes. `graph.json` changes in Task 3's second commit alone. Goldens change in Task 1's third commit and Task 2's second.
- Per-commit obligations beyond that pair:

  | Commit                           | Adds                                                                                                                                                                                                                                                                     |
  | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | Task 1 third                     | `npx nx run-many -t typecheck -p @nexusdi/meridian-systems @nexusdi/bridge-api @nexusdi/bridge-console --parallel=2`, the console's `test`, the library's `e2e-growth` once without `-u` (the diff shows the `ftl` fields alone), then with `-u`, then once more without |
  | Task 2, both                     | the library's `lint` and `e2e-growth`; `npx fallow dead-code --fail-on-issues`                                                                                                                                                                                           |
  | Task 3 second                    | the full bridge-api `test`, `typecheck`, `lint` and `graph`; mutation in a scratch worktree: a plain `di.inject` FTL route fails at `createBridge`, and a plain handler after `ship.load()` fails the first spool on the scoped ship                                     |
  | Task 3 third                     | the full bridge-api `test`; mutation in a scratch worktree: without `await scope.extend()` the telemetry case fails with `NEXUS_LOADED_AFTER_SCOPE` on each framework                                                                                                    |
  | Task 4                           | the console's `test`, `typecheck`, `lint` and `build`                                                                                                                                                                                                                    |
  | Task 5                           | bridge-api `e2e-growth` with workerd, Deno 2.9.6 and Bun 1.4.2                                                                                                                                                                                                           |
  | Task 6                           | the console's `e2e` (the bundle sentinels) and `e2e-growth`                                                                                                                                                                                                              |
  | every task adding a counted file | `npx fallow dupes`, figure in the ledger                                                                                                                                                                                                                                 |

- Goldens: each golden-changing commit runs the library's `e2e-growth` (heavy) once without `-u`, so the diff shows the G7 fields alone, then with `-u`, then once more without. A new golden needs `CI=true` for the first run, since a local run without `-u` writes a missing file snapshot and passes.
- Mutation checks run in a scratch worktree under `scratchpad/meridian-g7/` (`git worktree add`, hooks on), never in the shared worktree while peers run. A symlinked `node_modules` resolves the relative workspace links (`@nexusdi/meridian-systems -> ../../examples/meridian-systems`) back into the shared worktree, so the mutated file is never imported. Make a real `node_modules/@nexusdi` directory in the scratch tree with the example packages linked to the scratch copies and the built libs linked absolutely, and run vitest directly there.
- Parallel work in one worktree: stage your own files by path (`git add <paths>`), never `git add -A` or `git commit -a`, check `git diff --cached --name-only` before each commit, and commit with `git commit -- <paths>` so a peer's staged files stay out. If `index.lock` exists, wait 10 s and retry. If the pre-commit hook fails on a peer's uncommitted edit, report it and leave the peer's files alone.
- Never `--no-verify`, never `HUSKY=0`, never `git commit-tree`, `git update-ref` or `-c core.hooksPath`, in any worktree, never a bare `git stash`, never a merge commit, never a push before the final task. Every commit runs the hooks. A G5 implementer used `commit-tree` and a G6 reviewer used `-c core.hooksPath=/dev/null` in a scratch worktree; both are defects. To fix a message, use `git commit --fixup=amend:<sha>`.
- Commit subjects follow conventional commits with a scope from `commitlint.config.js` (`meridian-systems`, `bridge-api`, `bridge-console`, `specs`), lowercase, no `@` anywhere in the message, body lines wrapped at 100 characters. Each message ends with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, whichever model writes it.
- Test first: write the failing test, run it, see it fail, then implement. Earlier e2e test bodies and earlier golden lines never change.
- Prose in READMEs, comments, specs and commits follows the writing rules of `nexusdi-ways-of-working`: no em dashes, no antithesis ("not X but Y", "instead of", "rather than"), no rule of three outside lists of figures or ids, no bold lead-ins, no metaphor verbs (bites, lands, buys, costs, earns, pays, survives, ships), no filler openers. Every example is interface-first (`Token<IFoo>` with `useClass`).
- Run `npx prettier --write` on every file a task changes.
- Duplication: `npx fallow dupes` ends at 2.15 % or under on the measured figure (start 2.1359 %), and `.fallowrc.jsonc` keeps its 2.25 % limit untouched. Each task that adds a counted file records the figure in its hand-back.
- Helpers and probe scripts live in the session scratchpad's `meridian-g7/` folder only, prefixed by task (`t5-...`), and a committed file refers to them as `scratchpad/meridian-g7/<file>`. A committed file never holds an absolute local path or a vault path.
- The docs regions (`examples/meridian/src/pages`) and the docs site (`apps/docs`) never import a private demo package and keep building. G7 changes nothing there.
- Console gauges round to a fixed precision in SI units. Test fixtures feed the reading `/sim` sends: `readShip` rounds every number to four significant digits, so the doubles carry seed 7's figures as the golden holds them.

### Heavy work

A heavy job is `npm ci`, a build of more than one project, any `e2e` or `e2e-growth` target, `nx run-many`, or the final `rebase -x`. Run one at a time at all hours, and never run more than two subagents at once on a weekday from 09:00 to 17:00 (check `date`); after 17:00 and on weekends at most four. On weekdays from 09:00 to 17:00 wrap every nx, vitest and playwright run in the lock, and release it promptly. Never hold it while thinking or editing:

```sh
(until mkdir /tmp/nexusdi-heavy.lock 2>/dev/null; do sleep 20; done; trap 'rmdir /tmp/nexusdi-heavy.lock' EXIT; NX_NO_CLOUD=true NX_DAEMON=false npx nx ... --parallel=2)
```

Outside those hours skip the lock but still run one heavy job at a time. Tasks 5 and 6 each run a heavy target, so both take the lock for every `e2e` and `e2e-growth` run at any hour. `--parallel=2` goes on every nx command at all hours.

### Cleanup

Every task ends with this step before its review gate:

```sh
setopt null_glob 2>/dev/null; rm -rf libs/*/test-output examples/*/dist examples/*/build \
  examples/*/test-output examples/*/out-tsc examples/bridge-console/.react-router tmp
```

### Review gate

Each task ends with a review by a fresh opus reviewer that did not write the task, and the next task in its line starts after the gate passes. The reviewer reads the task's diff against this plan and the spec, runs the task's test commands, checks that each commit passes the two per-commit suites (`scratchpad/meridian-g7/each.sh` does it), recomputes the figures the task names, checks the writing rules on every added comment and message, and reports findings. The implementer fixes them in fixup commits. The gate passes when the reviewer reports no finding. The branch ends with the final review of Task 10.

## Tasks

Order and parallelism (at most two agents at once in daytime):

1. Task 0 alone.
2. Task 1, then Task 2, each alone. Both change the library, and Task 1's third commit touches the console's `tests/doubles.ts`.
3. Task 3 beside Task 4. bridge-api and the console share no file; Task 4 needs only Task 1's types and `./charts`.
4. Task 5 beside Task 6, after Tasks 3 and 4. Task 6's backend serves Task 3's routes. Both take `/tmp/nexusdi-heavy.lock` for every `e2e` and `e2e-growth` run at any hour.
5. Task 7 beside Task 8, after Tasks 5 and 6. The READMEs and the spec share no file; Task 8's two commits run in order inside it.
6. Task 9, then Task 10, each alone.

| Task | Model  | Files                                                                                                                                                                                                                                                                                                                                                                                                 | Commits                                                                                                                                                                                                                                                                                           |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | sonnet | `specs/plans/2026-10-21-meridian-g7-ftl.md`                                                                                                                                                                                                                                                                                                                                                           | `docs(specs): plan the g7 ftl drive`                                                                                                                                                                                                                                                              |
| 1    | opus   | library `src/physics/ftl.ts` (+test); `src/simulation/contracts.ts`, `fixed-step-loop.ts` (+test), `systems/engineering/contracts.ts`, `plasma-router.ts` (+test); `simulation/commands.ts`, `ship-state-store.ts` (+test), the six goldens, console `tests/doubles.ts` (`shipAtStart`)                                                                                                               | `feat(meridian-systems): model the ftl spool and the jump`; `feat(meridian-systems): let a loaded system attach to the tick loop and the router`; `feat(meridian-systems): add the ftl record and setpoints`                                                                                      |
| 2    | opus   | library `src/systems/ftl/*` (+tests), `errors.ts`, `text.ts` (+tests), `index.ts`, `notes.ts`, `test/notes.test.ts`, `test/ftl.test.ts`; `e2e/ftl.e2e.ts`, `e2e/golden/ftl.seed-7.json`                                                                                                                                                                                                               | `feat(meridian-systems): load the ftl drive into a running ship`; `test(meridian-systems): pin a spool and a jump to a golden`                                                                                                                                                                    |
| 3    | opus   | bridge-api `src/bridge/refusal.ts`, `commands.ts`; `hono.ts`, `express.ts`, `fastify.ts`, `src/bridge/ftl.ts`, `src/ship/meridian.ts`, `project.json`, `graph.json`, `test/check.test.ts`, `test/routes.test.ts`, `test/route-helpers.ts`; `src/bridge/telemetry-stream.ts`, `telemetry-readable.ts`, `src/ship/contracts.ts`, `test/telemetry-stream.test.ts`, `test/ftl.test.ts`; `test/doubles.ts` | `refactor(bridge-api): share the refusal reply of the command answers`; `feat(bridge-api): spool and jump the ftl drive on each framework`; `feat(bridge-api): send the loaded drive's rating on the telemetry stream`; `test(bridge-api): jump a simulated drive through a lazy module override` |
| 4    | sonnet | console `app/bridge/bridge-link.ts` and its contract, `tests/bridge-link.test.ts`; `app/routes/systems/ftl.tsx`, `app/routes.ts`, `app/routes/layout.tsx`, `system-action.server.ts`, `tests/routes/ftl.spec.tsx`, `tests/doubles.ts` (`fakeBridgeLink`)                                                                                                                                              | `refactor(bridge-console): share the post of the bridge link`; `feat(bridge-console): add the ftl page`                                                                                                                                                                                           |
| 5    | sonnet | bridge-api `test/runtime/growth-cases.ts`, `e2e/growth/ftl.e2e.ts`                                                                                                                                                                                                                                                                                                                                    | `test(bridge-api): spool and jump on every runtime`                                                                                                                                                                                                                                               |
| 6    | sonnet | console `e2e/growth/ftl.spec.ts`, `playwright.e2e-growth.config.mts`                                                                                                                                                                                                                                                                                                                                  | `test(bridge-console): spool and jump from the ftl page in a growth case`                                                                                                                                                                                                                         |
| 7    | sonnet | `examples/meridian-systems/README.md`, `examples/bridge-api/README.md`, `examples/bridge-console/README.md`                                                                                                                                                                                                                                                                                           | `docs(meridian-systems): describe the ftl drive`; `docs(bridge-api): describe the ftl routes and the telemetry rating`; `docs(bridge-console): document the ftl page`                                                                                                                             |
| 8    | opus   | `specs/2026-10-21-meridian-ship-systems-design.md`                                                                                                                                                                                                                                                                                                                                                    | `fixup! docs(specs): list the console's chart import among the owner items of the propulsion plan` (`git commit --fixup=3c72c9bf`, ruling 16 error 14), then `docs(specs): record the g7 rulings in the ship systems spec`                                                                        |
| 9    | sonnet | none (the gate and the cleanup)                                                                                                                                                                                                                                                                                                                                                                       | none                                                                                                                                                                                                                                                                                              |
| 10   | opus   | review fixups only                                                                                                                                                                                                                                                                                                                                                                                    | none of its own; the PR                                                                                                                                                                                                                                                                           |

---

### Task 0: this plan

Model: sonnet.

- [ ] Commit `docs(specs): plan the g7 ftl drive`.

### Task 1: the physics and the record

Model: opus (the pure step, the attach order and the frozen records are the hard parts).

Files:

- Create: `examples/meridian-systems/src/physics/ftl.ts` and `ftl.test.ts`
- Modify (commit 2): `examples/meridian-systems/src/simulation/contracts.ts` (`ITickLoop.attach`), `src/simulation/fixed-step-loop.ts` and its test, `src/systems/engineering/contracts.ts` (`IPowerRouter.attach`), `src/systems/engineering/plasma-router.ts` and its test
- Modify (commit 3): `examples/meridian-systems/src/simulation/contracts.ts` (`ShipSnapshot.ftl`), `src/simulation/commands.ts` (`Setpoints.ftl`), `src/simulation/ship-state-store.ts` and `ship-state-store.test.ts`, the six goldens `idle`, `life-support`, `safety`, `airlock`, `comms` and `helm` `.seed-7.json` under `examples/meridian-systems/e2e/golden/`, `examples/bridge-console/tests/doubles.ts` (`shipAtStart`)

- [ ] Step 1: write the failing `src/physics/ftl.test.ts` with the assertions of the unit-test list. Test names:
  - `charges 450,000,000 J a tick and holds 90,000,000,000 J exactly after 200 ticks`
  - `keeps the full charge on the 201st tick`
  - `asks 900,000,000 W while armed and ready below a full charge`
  - `asks 0 W unarmed, at full, under level 0.9 and at 1,300 K`
  - `asks at 1,299.9 K`
  - `returns the objects it got when idle`
  - `spools with an allocation and holds armed with none`
  - `reads charged at a full charge`
  - `jumps on a full charge and returns the pulse of 9,000,000,000 J`
  - `changes nothing on a jump below a full charge`
  - `writes a new idle record on the offline record with no allocation`
  - `raises 500 K to 510.7913669064748 K with pulseCoolant`
  - `freezes every record a step builds`

  Run `npx nx test @nexusdi/meridian-systems --parallel=2 -- src/physics/ftl.test.ts` and see it fail on the missing file. Write `ftl.ts` as ruling 8 lists it, with the `FtlStatus` docblock of ruling 2 and nothing imported from `@nexusdi/*`. Run it until it passes, then the per-commit pair and `npx fallow dupes` (record the figure). Commit `feat(meridian-systems): model the ftl spool and the jump`.

- [ ] Step 2: write the failing `attach` cases in `fixed-step-loop.test.ts` and `plasma-router.test.ts` (ruling 4 and the unit-test list), then add `attach` to `ITickLoop` and `IPowerRouter` and to `FixedStepLoop` and `PlasmaRouter`. If a widened contract forces another fake or fixture to change, change that spread only and report it. Run the library `test` target and the per-commit pair, then `npx fallow dupes`. Commit `feat(meridian-systems): let a loaded system attach to the tick loop and the router`.

- [ ] Step 3: write the failing store case (the record `offline` and the setpoints idle after `helm`, frozen) and edit the two `slice(-4)` reads of `ship-state-store.test.ts:614-625` to `['helm', 'ftl', 'safety', 'setpoints']` and `['drive', 'helm', 'ftl', 'safety']` (ruling 13, item 2). Widen `ShipSnapshot` and `Setpoints` with `ftl` after `helm`, start the store at the `offline` record and the idle setpoints, frozen at every level, and give the console's `shipAtStart` the record at `offline`. Run the library `e2e-growth` (heavy) once without `-u`: it must fail on the six goldens and show the `ftl` record and setpoints as the only diff. Run it with `-u`, then once more without. `git diff --numstat` on the goldens reads idle +30 −0, life-support +30 −0, safety +30 −0, airlock +50 −0, comms +30 −0 and helm +40 −0, and the stripped replays equal the committed goldens. Run the per-commit pair, `npx nx run-many -t typecheck -p @nexusdi/meridian-systems @nexusdi/bridge-api @nexusdi/bridge-console --parallel=2`, the console's `test` and lint, `npx fallow dupes` and `npx nx run @nexusdi/bridge-api:graph --parallel=2` (no diff, since no module binds the drive). Commit `feat(meridian-systems): add the ftl record and setpoints`.

- [ ] Step 4: cleanup, then the review gate.

Reviewer recomputes the physics figures with `arch-physics.mts`, checks the frozen levels, checks that the two `slice(-4)` edits are the only change to an earlier assertion, and that `git diff --numstat` on the six goldens reads 30, 30, 30, 50, 30 and 40 with zero removed.

### Task 2: the drive and the golden

Model: opus.

Files, first commit:

- Create: `examples/meridian-systems/src/systems/ftl/contracts.ts`, `jump-drive.ts`, `ftl-physics.ts`, `ftl-power.ts`, `ftl-drive.module.ts` and a `.test.ts` beside each class, `examples/meridian-systems/test/ftl.test.ts`
- Modify: `examples/meridian-systems/src/errors.ts` and `errors.test.ts`, `src/text.ts` and `text.test.ts`, `src/index.ts`, `src/notes.ts`, `test/notes.test.ts` (one new case; the existing case stays)

Files, second commit: `examples/meridian-systems/e2e/ftl.e2e.ts` and `examples/meridian-systems/e2e/golden/ftl.seed-7.json`.

- [ ] Step 1: write the failing class tests and `test/ftl.test.ts` (the seven rows of the module-test table, one `it` each, titled `checks as a load and fails alone`, `loads once, attaches a load at 0 W and keeps the desk list`, `refuses a spool on a cold reactor and holds it until the reactor reaches 0.9`, `flies the golden scenario: spools from tick 101, charges to tick 300, jumps at tick 301`, `sheds the spool beside the raised shields at tick 120`, `refuses a spool on a cold ship with 12.1 MW free`, and `extends a scope opened before the load`), the `notes.test.ts` case, and the `errors` and `text` cases. Run `npx nx test @nexusdi/meridian-systems --parallel=2 -- test/ftl.test.ts` and see it fail.
- [ ] Step 2: write the contracts, `JumpDrive`, `FtlPhysics`, `FtlPower` and the module as ruling 8 gives them, `FtlNotSpooledError` with its text and the `NexusErrorByCode` augmentation, the `notes.ts` walk of ruling 9 (matching a `ModuleView` whose `definition` or `replaced` is `FtlDrive`), and the index exports of ruling 8 with an export comment of one sentence each. The aggregate's file does not change. Run the module test until it passes. Run the library `lint` and `test`, `npx fallow dead-code --fail-on-issues`, `npx fallow dupes` and the per-commit pair. Check the docs regions and `apps/docs` for imports of the three packages: none. Commit `feat(meridian-systems): load the ftl drive into a running ship`, with a body that names the files and the line counts.
- [ ] Step 3: the golden. Write `e2e/ftl.e2e.ts` on the offline graph (`seed: 7`, `dt: 0.5`) with `FtlDrive` loaded: throttle 1 at tick 0, the spool after tick 100, the jump to Kepler-442b after tick 300, `roundSnapshot` at ticks 101, 300 and 301. Title the golden `pins a spool and a jump on the offline ship, seed 7, to the golden`. Run `e2e-growth` (heavy) once with `CI=true` and see it fail on the missing golden, then with `-u`, then without. Check the file has 620 lines and the values of the golden paragraph of the numbers section. Run `npx fallow dupes` and record the figure, the library `lint` and the per-commit pair. Commit `test(meridian-systems): pin a spool and a jump to a golden`.
- [ ] Step 4: cleanup, then the review gate.

Reviewer checks the observed second-spool ticks (`{ tick: 201 }` in the module test) against ruling 6, and recomputes `arch-figures.log` A to F against the module test and the golden, `arch-bridge.log` 2 against the notes, and `tl-golden-offline.log` against the line counts. The reviewer checks that the aggregate's file is untouched, that the six earlier goldens are unchanged by this task, that `test/fixtures.ts`, `test/profile.test.ts` and `test/shutdown.test.ts` are byte-identical, and that `fallow dead-code` reports no unused export.

### Task 3: bridge-api

Model: opus.

Files:

- Commit 1: `examples/bridge-api/src/bridge/refusal.ts` (create or extend: `refusedReply`), `src/bridge/commands.ts` (`answerCommand` maps through it)
- Commit 2: `src/hono.ts`, `src/express.ts`, `src/fastify.ts`, `src/bridge/ftl.ts` (create: `answerSpool`, `answerJump`), `src/ship/meridian.ts` (re-export `FtlDrive`), `project.json` (the `graph` target), `graph.json`, `test/check.test.ts`, `test/routes.test.ts`
- Commit 3: `src/bridge/ftl.ts` (`ftlRating`), `src/bridge/telemetry-stream.ts`, `src/bridge/telemetry-readable.ts`, `src/ship/contracts.ts` (the frame's `ftlRating`), the three framework files (the `/telemetry` routes), `test/telemetry-stream.test.ts`, `test/ftl.test.ts` (create: `the telemetry stream on %s`)
- Commit 4: `test/doubles.ts` (`SimulatedFtlDrive`), `test/ftl.test.ts` (the stub suite)

- [ ] Step 1: write nothing new. Move `json`, `calls` and `scopedShip` from `test/routes.test.ts` into a shared test module (`test/route-helpers.ts`) that `routes.test.ts` and the new `test/ftl.test.ts` import; earlier test bodies stay byte-identical, and only the imports and the moved definitions change. The stream case later uses `servers` from `e2e/servers.ts` and `events` from `test/sse.ts`. Move the 400/409 mapping of `answerCommand` into `refusedReply(error)` in `src/bridge/refusal.ts`, and run the full bridge-api `test` (every existing case passes unchanged, so the move is a refactor). Run the per-commit pair, `npx fallow dupes` and `graph` (no diff). Commit `refactor(bridge-api): share the refusal reply of the command answers`.
- [ ] Step 2: write the failing `the ftl commands on %s` block after every existing block of `routes.test.ts`, on Hono, Express and Fastify, with the rows of the route table, and the two `check.test.ts` cases of the numbers section. Edit the "matches graph.json" `inspect()` call to pass `load: [FtlDrive]`. Run `npx nx test @nexusdi/bridge-api --parallel=2 -- test/routes.test.ts test/check.test.ts` and see them fail. Write `answerSpool` and `answerJump`, `const ftl = di.load(FtlDrive)` and the two FTL routes in each framework file, with the section registered in front of each handler (`bridge.post('/ftl/spool', ftl, ftl.inject({ drive: FTL_DRIVE }, ...))` on Hono and Express, `{ onRequest: ftl }` in the route options on Fastify; `readJson` reads the jump body), re-export `FtlDrive` from `src/ship/meridian.ts`, and change the `graph` target to the command of ruling 9. Run `npx nx run @nexusdi/bridge-api:graph --parallel=2` to redraw `graph.json` and read the diff: one module, one provider and four edges (16 to 17, 55 to 56, 86 to 90). The target exits 1 while `graph.json` differs from the index. Stage the file and rerun it for a zero exit. Run the full bridge-api `test`, `typecheck` and `lint`, then `npx fallow dupes`. Mutation checks in a scratch worktree: a plain `di.inject` FTL route fails at `createBridge`, and a plain handler after `ship.load()` fails the first spool on the scoped ship. Commit `feat(bridge-api): spool and jump the ftl drive on each framework`.
- [ ] Step 3: write the failing `telemetry-stream.test.ts` cases and `the telemetry stream on %s` (one `describe.each` over the three frameworks, on a ship built with `nodeScopes()`). Add `ftlRating(scope)` to `src/bridge/ftl.ts` with its docblock, the optional third argument of `telemetryStream`, the frame field in `src/ship/contracts.ts` and `telemetry-readable.ts`, and `ftlRating(await di.scope(...))` in each `/telemetry` route. Every existing call and test keeps passing two arguments or fewer. Run the full bridge-api `test`. Mutation check in a scratch worktree: without `await scope.extend()` the telemetry case fails with `NEXUS_LOADED_AFTER_SCOPE` on each framework. Run `npx fallow dupes`. Commit `feat(bridge-api): send the loaded drive's rating on the telemetry stream`.
- [ ] Step 4: write the failing stub suite in `test/ftl.test.ts` (the four reads of the numbers section), then `SimulatedFtlDrive` and `SimulatedJumpDrive` in `test/doubles.ts` as ruling 10 gives them. Run the full bridge-api `test` and `npx fallow dupes`. Commit `test(bridge-api): jump a simulated drive through a lazy module override`.
- [ ] Step 5: cleanup, then the review gate.

Reviewer checks the observed second-spool tick (`{ tick: 301 }`) in the route block, and recomputes the route answers against `arch-bridge.log` 3 and the section 3 rows, the stream frames against `t0-stream.log` and `tl-stream.noextend.log`, and the graph diff against `arch-graph.g7.json`. The reviewer checks that no earlier block's text changed, that `test/fixtures.ts` is untouched, that the committed stub holds no refusal code, and that both mutations fail as the per-commit table says.

### Task 4: the console's FTL page

Model: sonnet. Runs beside Task 3.

Files:

- Modify: `examples/bridge-console/app/bridge/bridge-link.ts` and its contract, `app/routes.ts` (the route in the ship-layout group), `app/routes/layout.tsx` (the nav link "FTL" beside "Helm", about line 44), `app/routes/systems/system-action.server.ts`, `tests/bridge-link.test.ts`, `tests/doubles.ts` (`fakeBridgeLink`)
- Create: `examples/bridge-console/app/routes/systems/ftl.tsx`, `tests/routes/ftl.spec.tsx`

- [ ] Step 1: refactor `command` onto a private `#post(path, body)` that reads the 202/400/409 answer, with the existing `bridge-link.test.ts` cases passing unchanged and no new case. Run the console `test`, typecheck and lint. Commit `refactor(bridge-console): share the post of the bridge link`.
- [ ] Step 2: write the failing `bridge-link.test.ts` cases for `spool()` and `jump(to)` and the failing `tests/routes/ftl.spec.tsx` on the five readings of the gauge table, the spool and jump buttons with the select, the two refusals and the offline page. Each double spreads `shipAtStart`. Add `spool()` and `jump(to)` to the link and its contract, `ftlAction` to `system-action.server.ts`, the page on `SystemPage`, `ControlSection`, `Gauges`, `SnapshotOffline` and `snapshotLoader`, the static route `/systems/ftl` in the ship-layout group of `app/routes.ts` and the "FTL" link beside "Helm" in `app/routes/layout.tsx`, and `spool` and `jump` on `fakeBridgeLink`. `ftl.tsx` imports the library's main entry with `import type` only and the charts from `./charts`, so the bundle check of `e2e/fresh-server.spec.ts` stays green. Run the console `test`, `typecheck`, `lint` and `build`, then `npx fallow dupes` and record the figure. Commit `feat(bridge-console): add the ftl page`.
- [ ] Step 3: cleanup, then the review gate.

Reviewer recomputes the gauge strings against the gauge table and `arch-gauges.log` (computed from the golden's rounded values, which is what `/sim` sends), and checks by diff that the refactor moved the `command` read without edits and that `tests/routes/*.spec.tsx` of earlier pages are untouched.

### Task 5: `spoolAndJump` on six runtimes

Model: sonnet. Runs beside Task 6, after Tasks 3 and 4.

Files:

- Modify: `examples/bridge-api/test/runtime/growth-cases.ts`
- Create: `examples/bridge-api/e2e/growth/ftl.e2e.ts`

- [ ] Step 1: add the `post` helper `post(fetch, what, path, body, status, expected)` and make `send` call `post(fetch, command.action, '/commands', command, status, expected)`; the FTL steps pass `'spool'` and `'jump'` as `what`. The labels stay `${what} status` and `${what} answer`, so every failure message of an earlier case stays byte-identical (`throttle status`, `throttle answer`). Read `send` first. Write `spoolAndJump` as the seventh entry of `growthCases`, after `courseAndBurn`, with the name and the steps of the runtime-case paragraph of the numbers section and the file's `post`, `advanceTo` and `expectEqual` helpers. Write `e2e/growth/ftl.e2e.ts` as `describe.each(['hono', 'express', 'fastify'])` with `withShip`, as `helm.e2e.ts` does. Run it, see it fail on the missing case, then pass. Run `npx fallow dupes`; the group against `helm.e2e.ts:1-17` and two more is a budgeted clone. Record the figure.
- [ ] Step 2: run the six legs (heavy, one run) with the scratchpad's pinned Deno 2.9.6 and Bun 1.4.2 first on `PATH` and workerd for the worker leg: `npx nx run @nexusdi/bridge-api:e2e-growth --parallel=2`. The earlier six cases keep their text and pass. Node, the Node bundle, Deno and Bun print the same `/sim` bodies byte for byte: record the committed code's tick-300 and final hashes (the prototype's were 2,138 bytes `d6e57e57` and 2,119 bytes `61ebb8cf`). Run `npx nx run @nexusdi/bridge-api:graph --parallel=2`: no diff. Commit `test(bridge-api): spool and jump on every runtime`.
- [ ] Step 3: cleanup, then the review gate.

Reviewer checks the observed second-spool tick (`{ tick: 301 }`) in `spoolAndJump`, and recomputes the checkpoints against `arch-runtime.*.log` and confirms the legs ran on the pinned versions with workerd. No earlier case's text changes.

### Task 6: the console's FTL growth case

Model: sonnet. Runs beside Task 5.

Files:

- Create: `examples/bridge-console/e2e/growth/ftl.spec.ts`
- Modify: `examples/bridge-console/playwright.e2e-growth.config.mts`

- [ ] Step 1: add the seventh project `ftl` with `dependencies: ['helm']`, move `comms` to `dependencies: ['ftl']`, change the `chromium` project's `testIgnore` to include `ftl` (`/(life-support|safety|airlock|helm|ftl|comms)\.spec\.ts/`, after reading the current pattern), and write `ftl.spec.ts` with the steps of the console growth case (the backend advanced through `request.post('/sim/advance')`, and a console-error assertion). Add a one-sentence comment above `ftl` saying it raises the throttle to 1 and cuts the burn so the spool fits beside the other loads. `comms.spec.ts` stays byte-identical and the config's comment over `comms` stays true. Run `npx nx run @nexusdi/bridge-console:e2e-growth --parallel=2` and `npx nx run @nexusdi/bridge-console:e2e --parallel=2` (heavy, one at a time). The config has `retries: 0`, so the first read of `offline` holds. Commit `test(bridge-console): spool and jump from the ftl page in a growth case`.
- [ ] Step 2: cleanup, then the review gate.

Reviewer recomputes the page's words against the gauge table and the growth-case paragraph, and checks that the six earlier growth specs are untouched.

### Task 7: READMEs

Model: sonnet. Runs beside Task 8, after Tasks 5 and 6.

Files: modify `examples/meridian-systems/README.md`, `examples/bridge-api/README.md`, `examples/bridge-console/README.md`.

- [ ] Step 1: the library README gains the FTL drive module: its loading with the two attaches; the record with its `offline` start; the spool's 90 % hold with the jump and its pulse; the `MERIDIAN_FTL_NOT_SPOOLED` anchor with the golden and the module test. Commit `docs(meridian-systems): describe the ftl drive`.
- [ ] Step 2: the `bridge-api` README gains the FTL routes through `di.load` with the second-spool answer; the `graph` target's `--load`; the telemetry stream's `ftlRating`; the route block and the stub suite; the seventh runtime case. Commit `docs(bridge-api): describe the ftl routes and the telemetry rating`.
- [ ] Step 3: the console README gains `/systems/ftl` with its GJ and MW gauges, and the seventh growth project. Run `npx prettier --check` on the three files, and the README doctests if a README gains a `ts` block. Commit `docs(bridge-console): document the ftl page`.
- [ ] Step 4: cleanup, then the review gate.

Reviewer recomputes each tick and figure a README states against the numbers section.

### Task 8: the spec

Model: opus. Runs beside Task 7, after Tasks 5 and 6.

Files: modify `specs/2026-10-21-meridian-ship-systems-design.md`.

- [ ] Step 1: the nit of `3c72c9bf`. Edit the §15 owner-list line (about lines 2829-2830) to "Its copy of the table, `app/bridge/charts.json`, goes, and so does `tests/charts.test.ts` (G6 ruling 24)." and commit it as `NX_NO_CLOUD=true NX_DAEMON=false git commit --fixup=3c72c9bf -- specs/2026-10-21-meridian-ship-systems-design.md`. The fixup folds into `3c72c9bf` at Task 10's autosquash.
- [ ] Step 2: apply the amendments of ruling 16 section by section, add the fifteen §15 rows and add this plan to the closing paragraph's list. Check each figure against the logs the numbers section names. Run `npx prettier --check` on the file. Commit `docs(specs): record the g7 rulings in the ship systems spec`.
- [ ] Step 3: cleanup, then the review gate.

Reviewer recomputes the golden scenario in the new §5.14, the golden's 620 lines, the 30, 30, 30, 50, 30 and 40 line counts, and checks that the fixup changes only the quoted sentence.

### Task 9: the gate

Model: sonnet.

- [ ] Step 1: run `scratchpad/meridian-g7/gate.sh` (heavy, holds the lock itself): `npx nx run-many -t lint test build typecheck --parallel=2`, the bridge-api and console `e2e` targets, `npx nx run-many -t e2e-growth --projects=tag:demo --parallel=2` with the pinned Deno 2.9.6 and Bun 1.4.2 first on `PATH` and workerd for the worker leg, the `graph` target with no diff, `npx fallow dead-code --fail-on-issues`, `npx fallow dupes` and `npx prettier --check .`. Record the dupes figure, which must read 2.15 % or under, and confirm `git diff origin/release/0.4 -- .fallowrc.jsonc` is empty. Fix any finding in a fixup commit.
- [ ] Step 2: cleanup.

### Task 10: the final review and the PR

Model: opus.

- [ ] Step 1: the final branch review by an independent opus reviewer, who recomputes every figure in "Numbers the tests assert", checks the diff of the earlier goldens and e2e files (the six goldens only gain lines, no earlier e2e body changes), and reads the three G6 leftovers (`f2aa3da5`, `d544e45a`, `3c72c9bf`) against the writing rules. Fix rounds go in fixup commits until it approves.
- [ ] Step 2: fold the fixups with `GIT_SEQUENCE_EDITOR=: NX_NO_CLOUD=true NX_DAEMON=false git rebase -i --autosquash origin/release/0.4`. Then check every commit on its own (heavy): `NX_NO_CLOUD=true NX_DAEMON=false git rebase origin/release/0.4 -x 'NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/meridian-systems --parallel=2 --skip-nx-cache && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/bridge-api --parallel=2 --skip-nx-cache -- test/check.test.ts'`. A commit that fails gets its fix folded into it, and the step reruns. Check `git rev-list --count origin/release/0.4..HEAD` is 100 or fewer.
- [ ] Step 3: if `origin/release/0.4` moved, rebase onto it and rerun the graph and the gate, then Step 2. Push with `NX_NO_CLOUD=true NX_DAEMON=false git push -u origin feat/meridian-g7-ftl`, and open the PR against `release/0.4`. The body lists the rulings and the additions beyond the spec's G7 text (the list "For the owner" below) and ends with the Claude Code line. Wait for CI and fix any CodeQL alert, then report the PR number and the result.

## For the owner

Additions and divergences beyond the spec's G7 text. None changes a public docs page.

1. Spec error and finding: the CLI needs `path-with-extension#export`, so the spec's `--load src/systems/ftl#FtlDrive` exits 2. The `graph` target uses `src/ship/meridian.ts#FtlDrive`, and that file re-exports `FtlDrive` from the library (ruling 9).
2. Divergence in form: the bridge never calls `ship.load(FtlDrive)` itself. Each adapter's `di.load(FtlDrive)` section calls it and extends the request's scope, where the spec has a handler calling `ship.load`. A plain handler fails the first spool on the Node entries with `NEXUS_LOADED_AFTER_SCOPE` (ruling 6).
3. The telemetry stream extends its scope as you listed. To give it a reason, it sends the bound drive's rating as a new frame field `ftlRating` from the frame after the load, through a third argument of `telemetryStream` and a helper `ftlRating(scope)`. The architect proposed a stream that reads no FTL token, and the tech lead kept your line (ruling 5).
4. The record's status `offline` before the drive loads, a fifth value of `FtlStatus`, and the sector `Sol` at tick 0 (ruling 2).
5. A second spool on an armed drive answers 202 with the next tick and queues no command, and the first FTL request of either route loads the drive, so a jump before any spool answers `MERIDIAN_FTL_NOT_SPOOLED` from a loaded drive (ruling 6).
6. `IPowerRouter.attach` beside the loop's attach, both returning a detach. The spec names the loop's attach only (spec error 2). This amends G0 ruling 4's "`attach()`/`detach()`", a tech lead ruling, in G7's own §15 row (ruling 4).
7. New public exports of the library: `FtlDrive`, `FTL_DRIVE`, `FtlNotSpooledError`, the types `IFtlDrive`, `FtlRating`, `FtlRecord`, `FtlSetpoints`, `FtlStatus`, and the members `ITickLoop.attach`, `IPowerRouter.attach`, `IFtlDrive.rating`. No subpath and no new dependency (ruling 8).
8. Ship behaviour the spec leaves open: the load id `ftl-spool`, a spool held at 0 W under 90 % reactor level, the jump pulse applied in phase 3 from `LITHIUM_LOOP`, the charge held in J, the home sector `Sol` and a jump allowed to it, no stand-down command (rulings 3, 4 and 7).
9. Three earlier unit-test edits, none an e2e body or a golden line: the `inspect()` call of `check.test.ts`'s "matches graph.json" case gains `load: [FtlDrive]`, and the two `slice(-4)` reads of `ship-state-store.test.ts` take the new key order. The console's growth config moves `comms` behind the new `ftl` project, and two helpers (`answerCommand`, `send`) call shared code (ruling 13).
10. The console page `/systems/ftl` in GJ and MW, `BRIDGE_LINK.spool()` and `jump(to)`, and a growth project `ftl` before `comms` (ruling 14).
11. Tests beyond the spec: a gating route block and the telemetry cases per framework, the stub suite, a seventh runtime case with a module test and the FTL golden, and one library notes case for the loaded drive (rulings 5, 10, 11 and 12).
12. Spec text fixed in G7 beside the G7 rulings: the `3c72c9bf` wording of the console's chart copy, as a fixup (ruling 16, error 14).
