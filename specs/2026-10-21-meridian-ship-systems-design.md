# Meridian ship systems

Status: proposed, 2026-10-21. The owner answered Q1 on 2026-10-21 (section 14). The
tech lead settles the rest. The G1 rulings and the decisions of the G1 run amend sections 3 to 10, and section 15 lists the rulings.

Packages: no published package is added or changed. New private project:
`examples/meridian-systems` (`@nexusdi/meridian-systems`), a library the growth track
creates. The 0.4 minimum adds no project.

Depends on:

- `specs/2026-10-21-demo-apps-design.md` and `specs/plans/2026-10-21-demo-apps.md` on this
  branch. Section 11 lists the amendments this spec makes to both.
- `specs/2026-09-23-docs-site-design.md` on `origin/spec/docs-site`, section 7.1 (the
  Meridian vocabulary), section 7.3 (interface-first), section 7.4 (no humour) and
  section 7.7 (the deny list). Section 10 of this spec proposes rows for 7.1.
- The code on `origin/release/0.4` at `38313a4b`. Every claim about a package below was
  checked against `libs/*/src` or `apps/docs/content` there.
- `specs/2026-09-30-extension-principle-design.md` on `origin/spec/package-owned-errors`
  (P1 to P5), which section 6.4 applies to the simulation's own error codes.

## 1. Problem

The demo apps prove that the packages work in real setups. The owner wants the Starship
Meridian to read as a real ship stack, modelled on the game Stationeers, where the player
controls every system: the air in each compartment, the reactor and its coolant, the
doors and the alarms. A reader who opens the demos then sees DI wire a system of the size
they build at work, and each NexusDI feature appears where a ship engineer would reach
for it.

Two constraints pull against that:

1. The demos must stay readable as DI examples. A reader who opens a module file sees
   tokens, providers and imports first, and the physics sits behind a function call.
2. 0.4.0 final must not wait for the ship. The demo plan already covers every package,
   and the rich systems grow beside it.

## 2. Decisions

### 2.1 The owner's decisions (2026-10-21)

1. The ship is modelled on Stationeers. The spec covers life support, power and the
   reactor, comms, propulsion, manoeuvring, weapons, the FTL drive and the safety
   systems.
2. The ship runs as a live simulation. The backend runs a deterministic, seeded,
   fixed-step tick loop over the ship's systems. The console streams telemetry and sends
   commands, and the seed keeps e2e stable.
3. The spec designs the full domain now. A 0.4 minimum gates 0.4.0 final: every package
   covered, e2e green, close to the current demo plan, with this domain's names, tokens
   and module boundaries. The rich systems form a growth track of independent
   increments. Each one adds a module to the running simulation with its own tests,
   joins the demo apps whenever it is ready (during the RCs, after 0.4.0 or later),
   and never blocks a release.

### 2.2 Decisions the architect proposes

| #   | Decision                                                                                                                                                  | Section |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| S1  | One NexusDI module per ship system, in a private library `examples/meridian-systems`. `bridge-api` imports it and runs it; no frontend bundles it.        | 3       |
| S2  | The physics is a set of pure functions in `src/physics/` that import nothing from `@nexusdi/*`. A system module wraps them in providers.                  | 3.3, 5  |
| S3  | A system contributes a `IShipSystem` to the multi token `SHIP_SYSTEMS`. The tick loop runs the contributions sorted by their `phase`.                     | 4.2     |
| S4  | The simulation reads no wall clock. `bridge-api` owns the one timer, in `WallClockDriver`, and e2e drives ticks by hand over HTTP.                        | 4.4, 8  |
| S5  | Each system draws random numbers from its own fork of the seeded source, so a new system never shifts the numbers an older system draws.                  | 4.3     |
| S6  | A new system starts idle in the seeded scenario: no power demand and no effect until a command enables it. Older e2e expectations then hold.              | 8.3     |
| S7  | The simulation raises its own error codes (`MERIDIAN_*`) through core's public `errorBase`, and contributes the text pack `shipText`.                     | 6.4     |
| S8  | The shell's `Engineering` module leaves the 0.4 federation app. `Engineering` belongs to the simulation, and one module of that name exists in the demos. | 11      |

## 3. The ship as modules

### 3.1 Where the code lives

`examples/meridian-systems` is a private workspace library, scaffolded by
`@nx/js:library` (generator rule), with the unscoped name the folder-name check wants.

```text
examples/meridian-systems/
  src/physics/          pure functions: gas.ts, thermal.ts, power.ts, motion.ts, rng.ts
  src/meridian-systems.module.ts   the aggregate MeridianSystems, which binds TICK_LOOP and COMMAND_DESK
  src/simulation/       the Simulation module: clock, random source, state, the loop class,
                        the command contracts and the command desk class
  src/systems/<name>/   one folder per system: <name>.module.ts, its classes, its tests
  src/errors.ts         the MERIDIAN_* error classes
  src/text.ts           shipText, at the ./text subpath
  src/telemetry/        the Telemetry module: the feed's contracts and SnapshotFeed
  src/notes.ts          shipNotes, a devtools graph annotator
  deck/meridian.deck.json   the deck plan: compartments, volumes, doors, initial gas
```

The library's entry exports one aggregate, `meridianSystems({ seed, dt })`, which returns
the module `MeridianSystems`. G5 widens its options with `relayUrl` when `Comms` and
`Tactical` move into the library. It imports `Simulation.forRoot`, `Telemetry` and each
system module, binds `TICK_LOOP` and `COMMAND_DESK` (section 3.2), and exports both with
each system module, so `bridge-api`'s `Meridian` imports one module and a growth
increment adds its system inside the library. From G1 the aggregate exports `TICK_LOOP`,
`COMMAND_DESK` and `Engineering`, whose re-export hands the root `REACTOR`, `POWER_ROUTER`
and `SHIELD_GRID`. `Simulation` is global, so its tokens reach
the root without the aggregate exporting them. `FtlDrive`
stays out of the aggregate, since it joins with `load()`.

`.fallowrc.jsonc` gains entries for the library, so `fallow dead-code` keeps the files
nothing imports. G0 adds `e2e/**/*.ts` and `vitest.e2e-growth.config.ts` (the
`e2e-growth` target runs them by path) and `e2e/golden/*.json` (the snapshot matcher reads
it). G1 adds `src/text.ts` (the `./text` subpath). `bridge-api`'s command route imports
it, so it needs no entry.
`Simulation` imports `deck/meridian.deck.json` with `with { type: 'json' }`, so the deck
needs no entry.

`bridge-api` imports the aggregate and runs the simulation. The bridge console and
the federation stations import types only (`import type`), so no simulation code reaches
a browser bundle.

### 3.2 Modules

Each row is one module. Every token is interface-first: an interface, a typed token named
for the role, and one class bound with `useClass` (docs §7.3). Names in the existing
§7.1 vocabulary keep their meaning.

| Module            | System                             | Tokens it exports                                                                                          | Configured by                                    | State on 0.4                                        |
| ----------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| `Simulation`      | the kernel                         | `SIM_OPTIONS`, `SIM_CLOCK`, `RNG`, `SHIP_STATE`, `DECK_PLAN`, `COMPARTMENT`                                | `Simulation.forRoot({ seed, dt })`, `global`     | growth G0; `COMPARTMENT` in G2                      |
| `MeridianSystems` | the tick loop and the command desk | `TICK_LOOP`, `TELEMETRY`, `COMMAND_DESK`, and each system module it imports                                | `meridianSystems({ seed, dt })`, `global`        | growth G0; `TELEMETRY` in G0b; `COMMAND_DESK` in G1 |
| `Engineering`     | reactor and power                  | `REACTOR`, `POWER_ROUTER`, `SHIELD_GRID`, `SHIP_SYSTEMS`, `COMMAND_HANDLERS`; `COOLANT_LOOP` stays private | none                                             | in §7.1; the simulation's form is G1                |
| `LifeSupport`     | atmosphere                         | `ATMOSPHERE_SENSOR`, `ATMOSPHERE_CONTROL`                                                                  | `LifeSupport.forRootAsync({ deps, useFactory })` | growth G2                                           |
| `Safety`          | doors, fire, alarms                | `BLAST_DOORS`, `FIRE_SUPPRESSION`, `MASTER_ALARM`, `ALARM_SINKS`                                           | none                                             | growth G3                                           |
| `Comms`           | comms                              | `SUBSPACE_LINK`, `COMMS_ARRAY`                                                                             | `Comms.forRoot({ frequency, transport, ... })`   | in `bridge-api`; moves in G5                        |
| `Propulsion`      | the main drive                     | `MAIN_DRIVE`                                                                                               | none                                             | growth G6                                           |
| `Helm`            | manoeuvring                        | `HELM`, `THRUSTERS`                                                                                        | none                                             | growth G6                                           |
| `FtlDrive`        | the FTL drive                      | `FTL_DRIVE`                                                                                                | none; added with `ship.load()`                   | growth G7                                           |
| `Weapons`         | weapons                            | `WEAPON_MOUNT`                                                                                             | none                                             | growth G8                                           |
| `Telemetry`       | the telemetry feed                 | `TELEMETRY`                                                                                                | none                                             | growth G0b                                          |
| `Tactical`        | navigation                         | `NAV_CHARTS`                                                                                               | none                                             | in §7.1 and `bridge-api`; moves in G5               |
| `BridgeApi`       | the request side                   | `MISSION`, `FLIGHT_LOG`                                                                                    | none                                             | in §7.1 and `bridge-api`; unchanged                 |
| `AuditTrail`      | the audit store                    | `AUDIT_LOG`                                                                                                | none                                             | in §7.1; `bridge-api` renames it in 0.4             |

`TICK_LOOP` is bound in the aggregate `MeridianSystems`, which is global. A module's
`all()` reads the module's own providers plus the exports of its imports and of the global modules
(`libs/core/src/blueprint/visibility.ts`), so a loop bound in `Simulation` never sees a
system that a sibling module imports. Each system module exports `SHIP_SYSTEMS`, and the
aggregate imports every system module, so its loop sees each one. `COMMAND_DESK` reads
`all(COMMAND_HANDLERS)`, so it sits in the aggregate beside the loop for the same reason.
`COMPUTER` stays in the docs regions of §7.1. No simulated system reads it, so
`Engineering` binds none. `Simulation` stays global and binds `SIM_OPTIONS`, `SIM_CLOCK`, `RNG`,
`SHIP_STATE` and `DECK_PLAN`.

`Meridian`, the root in `bridge-api`, imports `meridianSystems(...)`, `BridgeApi` and
`AuditTrail`, which together hold every module above except `FtlDrive`. It also imports
`bridge-api`'s own `SimDriver.forRoot({ mode })` (section 4.4). `Tactical` moves
into the library with `Comms` in G5, because `Helm` and `FtlDrive` read `NAV_CHARTS` and
the library cannot import `bridge-api`. The
FTL drive joins the running ship through `ship.load(FtlDrive)` on its first spool command
(section 6.3).

`Tactical` keeps `NAV_CHARTS`, as §7.1 has it. The weapons module is `Weapons`, so
"tactical" keeps its docs meaning (navigation and the survey drone) and the two never
share a module.

### 3.3 Tokens and classes

The interfaces and their classes, by module. Every class takes interfaces in its
constructor and declares tokens in `static deps`.

| Interface            | Token                                                                     | Class                                  | Lifetime  | Deps                                                   |
| -------------------- | ------------------------------------------------------------------------- | -------------------------------------- | --------- | ------------------------------------------------------ |
| `ISimClock`          | `SIM_CLOCK = new Token<ISimClock>('SimClock')`                            | `FixedStepClock`                       | singleton | `[SIM_OPTIONS]`                                        |
| `IRandomSource`      | `RNG = new Token<IRandomSource>('RandomSource')`                          | `SeededRandom`                         | singleton | `[SIM_OPTIONS]`                                        |
| `IShipState`         | `SHIP_STATE = new Token<IShipState>('ShipState')`                         | `ShipStateStore`                       | singleton | `[DECK_PLAN]`                                          |
| `IShipSystem`        | `SHIP_SYSTEMS = new MultiToken<IShipSystem>('ShipSystems')`               | one class per system                   | singleton | each system's own                                      |
| `ITickLoop`          | `TICK_LOOP = new Token<ITickLoop>('TickLoop')`                            | `FixedStepLoop`                        | singleton | `[SIM_CLOCK, SHIP_STATE, RNG, all(SHIP_SYSTEMS)]`      |
| `DeckPlan`           | `DECK_PLAN = new Token<DeckPlan>('DeckPlan')`                             | the deck file, a value                 | value     | none                                                   |
| `CompartmentId`      | `COMPARTMENT = new Token<CompartmentId>('Compartment')`                   | a factory over `REQUEST`               | scoped    | `[REQUEST]`                                            |
| `IReactorCore`       | `REACTOR` (§7.1)                                                          | `FusionReactor`                        | singleton | `[SHIP_STATE]`                                         |
| `ICoolantLoop`       | `COOLANT_LOOP = new Token<ICoolantLoop>('CoolantLoop')`                   | `RadiatorLoop`                         | singleton | none                                                   |
| `IPowerRouter`       | `POWER_ROUTER` (§7.1)                                                     | `PlasmaRouter`                         | singleton | `[SHIP_STATE, lazy(SHIELD_GRID)]`                      |
| `IShieldGrid`        | `SHIELD_GRID` (§7.1)                                                      | `DeflectorGrid`                        | singleton | `[SHIP_STATE, POWER_ROUTER]`                           |
| `IShipSystem`        | `SHIP_SYSTEMS`, Engineering's contribution                                | `EngineeringPhysics`                   | singleton | `[REACTOR, COOLANT_LOOP, POWER_ROUTER]`                |
| `ICommandHandler`    | `COMMAND_HANDLERS = new MultiToken<ICommandHandler>('CommandHandlers')`   | `EngineeringCommands`                  | singleton | `[REACTOR, SHIELD_GRID]`                               |
| `ICommandDesk`       | `COMMAND_DESK = new Token<ICommandDesk>('CommandDesk')`                   | `CommandDesk`                          | singleton | `[all(COMMAND_HANDLERS)]`                              |
| `IAtmosphereSensor`  | `ATMOSPHERE_SENSOR = new Token<IAtmosphereSensor>('AtmosphereSensor')`    | `GasAnalyzer`                          | transient | `[COMPARTMENT, SHIP_STATE, RNG, LIFE_SUPPORT_OPTIONS]` |
| `IAtmosphereControl` | `ATMOSPHERE_CONTROL = new Token<IAtmosphereControl>('AtmosphereControl')` | `EnvironmentalController`              | singleton | `[SHIP_STATE]`                                         |
| `IBlastDoors`        | `BLAST_DOORS = new Token<IBlastDoors>('BlastDoors')`                      | `BlastDoorControl`                     | singleton | `[SHIP_STATE]`                                         |
| `IFireSuppression`   | `FIRE_SUPPRESSION = new Token<IFireSuppression>('FireSuppression')`       | `InertGasSuppression`                  | singleton | `[SHIP_STATE]`                                         |
| `IAlarmSink`         | `ALARM_SINKS = new MultiToken<IAlarmSink>('AlarmSinks')`                  | `TelemetryAlarmSink`, `AuditAlarmSink` | singleton | `[TELEMETRY]`, `[AUDIT_LOG]`                           |
| `IMasterAlarm`       | `MASTER_ALARM = new Token<IMasterAlarm>('MasterAlarm')`                   | `MasterAlarm`                          | singleton | `[TICK_LOOP, all(ALARM_SINKS)]`                        |
| `ICommsArray`        | `COMMS_ARRAY = new Token<ICommsArray>('CommsArray')`                      | `PhasedArray`                          | singleton | `[SHIP_STATE, optional(SUBSPACE_LINK)]`                |
| `IMainDrive`         | `MAIN_DRIVE = new Token<IMainDrive>('MainDrive')`                         | `PlasmaDrive`                          | singleton | `[SHIP_STATE]`                                         |
| `IThrusters`         | `THRUSTERS = new Token<IThrusters>('Thrusters')`                          | `RcsThrusters`                         | singleton | `[SHIP_STATE]`                                         |
| `IHelm`              | `HELM = new Token<IHelm>('Helm')`                                         | `HelmControl`                          | singleton | `[THRUSTERS, MAIN_DRIVE, NAV_CHARTS]`                  |
| `IFtlDrive`          | `FTL_DRIVE = new Token<IFtlDrive>('FtlDrive')`                            | `JumpDrive`                            | singleton | `[TICK_LOOP, SHIP_STATE, NAV_CHARTS, POWER_ROUTER]`    |
| `IWeaponMount`       | `WEAPON_MOUNT = new Token<IWeaponMount>('WeaponMount')`                   | `RailgunMount`                         | singleton | `[SHIP_STATE, RNG]`                                    |
| `ITelemetryFeed`     | `TELEMETRY = new Token<ITelemetryFeed>('TelemetryFeed')`                  | `SnapshotFeed`                         | singleton | `[TICK_LOOP, SHIP_STATE, DECK_PLAN]`                   |
| `ITelemetryClient`   | `TELEMETRY_CLIENT = new Token<ITelemetryClient>('TelemetryClient')`       | `EventSourceTelemetry`                 | singleton | none; the console's `TelemetryClient` module           |

`MeridianSystems` binds `TICK_LOOP` and `COMMAND_DESK`, and `Simulation` binds the clock,
the random source, the state and the deck plan (section 3.2). `Engineering` binds the
reactor, the coolant loop, the router and the grid, and contributes `EngineeringPhysics`
and `EngineeringCommands`. The interfaces and tokens of Engineering live in
`src/systems/engineering/contracts.ts`, and each class in its own file beside it.
`Telemetry` binds `TELEMETRY`, and `SnapshotFeed` takes `SHIP_STATE` and `DECK_PLAN`
beside the loop, so a new sink reads the current snapshot at once and every frame carries
each compartment's pressure. `TELEMETRY_CLIENT` belongs to the bridge console, whose
server and client graphs both import `TelemetryClient` (section 7.2).

`ITickLoop` has two members: `advance(ticks)` and `listen(listener: TickListener)`, with
`type TickListener = (ship: ShipSnapshot) => void`. `listen` returns a function that
unsubscribes the listener and runs twice safely. `FixedStepLoop` keeps one entry per call,
so one function listened twice hears each tick twice. `readShip(ship, deck)` returns a
`ShipReading`: `ShipSnapshot` with each compartment a `CompartmentReading`, the
`CompartmentState` plus its `pressure` in pascals from `pressure()` in `physics/gas.ts`
over the moles of every gas, the temperature and the deck volume. It rounds the result
through the same `roundJson` that `roundSnapshot` uses, so the rounding sits in one place.
`ShipSnapshot` keeps no pressure, and the golden stays on the rounded snapshot.

A command reaches its system through the contribution point `COMMAND_HANDLERS`. Each
`ICommandHandler` names the `system` it serves, and `handle(command)` returns the
`QueuedCommand` or throws a `NexusError` to refuse it; any other throw is a bug.
`CommandDesk.submit(body)` checks the envelope (an object with a string `system` and a
string `action`) and hands the command to the handler of its system. A bad envelope or an
unknown system throws `BadCommandError`. Two handlers that serve one
system make the desk's constructor throw. `bridge-api` names no system.

An interface a class implements carries the `I` prefix (`IShipSystem`, `IAlarmSink`). A
plain data shape keeps its name with no prefix, as §7.1's `Mission`, `Diagnostic` and
`CommsOptions` do: `DeckPlan`, `CompartmentId`, `ShipSnapshot`, `ShipReading`,
`CompartmentReading`, `TickListener`, `SimOptions` and `LifeSupportOptions`.

Options tokens, each the value of a configurable module: `SIM_OPTIONS` (`SimOptions`:
`seed`, `dt`) and `LIFE_SUPPORT_OPTIONS` (`LifeSupportOptions`: the sensor calibration and
the scrubber, heater and pump ratings).

A controller class (`EnvironmentalController`, `BlastDoorControl` and the rest) holds no
physics. Its methods check the command against the current snapshot and queue a setpoint
on `SHIP_STATE`. The physics reads the setpoints in the next tick. So the interceptors of
section 6.1 wrap a method that does one visible thing, and the reader sees the interlock
apart from the physics.

Engineering's physics class, `EngineeringPhysics`, takes `REACTOR`, `COOLANT_LOOP` and
`POWER_ROUTER` (`static deps = [REACTOR, COOLANT_LOOP, POWER_ROUTER] as const`). It reads the ratings
and the loads through them, and its `REACTOR` edge orders the scram. The tick loop takes
`all(SHIP_SYSTEMS)`, so the container builds the reactor before the loop, and the loop
before the feed, the master alarm and the driver that take it. Disposal runs in reverse
creation order, so that edge is what puts the reactor scram after every consumer on
shutdown.

`FusionReactor` keeps the §7.1 role and its `output` member, now the electric output in
GW. The docs regions bind it with no deps, and the simulation binds it with
`[SHIP_STATE]`. Each is one program, so each binds the class once (docs §7.3, rule 2).
The rated electric output is 1.21 GW, the figure the interceptors page prints.
`FusionReactor[Symbol.dispose]()` is the scram: it commits the current snapshot at the
same tick with the reactor's level and output at 0 and the throttle setpoint at 0, and
leaves the power record as the last tick allocated it.

### 3.4 A system module, as a reader sees it

```ts
// examples/meridian-systems/src/systems/life-support/life-support.module.ts
export const LifeSupport = defineModule({
  name: 'LifeSupport',
  options: LIFE_SUPPORT_OPTIONS,
  providers: [
    provide(ATMOSPHERE_SENSOR, {
      useClass: GasAnalyzer,
      lifetime: 'transient',
    }),
    provide(ATMOSPHERE_CONTROL, { useClass: EnvironmentalController }),
    provide(SHIP_SYSTEMS, { useClass: LifeSupportPhysics }),
  ],
  exports: [ATMOSPHERE_SENSOR, ATMOSPHERE_CONTROL, SHIP_SYSTEMS],
});

class LifeSupportPhysics implements IShipSystem {
  static deps = [LIFE_SUPPORT_OPTIONS] as const;
  readonly name = 'LifeSupport';
  readonly phase = 4;
  constructor(private readonly options: LifeSupportOptions) {}
  step(ship: ShipSnapshot, tick: TickContext): ShipSnapshot {
    return stepAtmosphere(ship, this.options, tick); // src/physics/gas.ts
  }
}
```

The file holds tokens, providers and one delegation. `stepAtmosphere` lives in
`src/physics/` with its own unit tests (section 8.1).

## 4. The simulation kernel

### 4.1 The snapshot

`ShipSnapshot` is a plain frozen object: the tick number, one record per compartment
(moles per gas, temperature, fire intensity), the door states, the reactor, coolant,
power, drive, helm, weapons and FTL records, the active alarms, and the setpoints. A step
returns a new snapshot and shares the records it left alone. `SHIP_STATE.snapshot()`
returns the current one. The telemetry feed and `bridge-api`'s `/sim` routes send
`readShip(snapshot, deck)`, the snapshot with each compartment's pressure and every
number rounded to four significant digits.

### 4.2 The tick

`FixedStepLoop.advance(ticks)` runs this for each tick, with `dt` from `SIM_OPTIONS`
(0.5 s of ship time):

1. Apply the queued commands to the setpoints, in the order they were queued, and log
   each with its tick number. `SHIP_STATE.queue(change)` stores a `SetpointChange` and
   answers `{ tick }`, the tick that applies it. The loop calls
   `SHIP_STATE.applyQueued(tick)`, which merges the changes, logs each as
   `{ tick, change }`, commits the result and returns the snapshot the systems step on.
   `log()` keeps the newest 1,000 entries. A refused command throws before the queue, so
   the log never holds it.
2. Run every `IShipSystem` in ascending `phase`, each on the snapshot the previous one
   returned. The phases:

   | Phase | System                | What it computes                                                       |
   | ----- | --------------------- | ---------------------------------------------------------------------- |
   | 1     | `Engineering`         | reactor ramp, electric output, the power allocation, coolant heat      |
   | 2     | `Propulsion`, `Helm`  | thrust, velocity, attitude                                             |
   | 3     | `Weapons`, `FtlDrive` | capacitor charge, spool, shots and jumps                               |
   | 4     | `LifeSupport`         | metabolism, scrubbers, oxygen, heaters, hull loss, vents, pumps, doors |
   | 5     | `Safety`              | fire, suppression, door auto-close, alarm evaluation                   |
   | 6     | `Comms`               | queued messages, hails                                                 |

   Systems that share a phase run in the order of their `name`. The loop sorts once, at
   construction and on `attach()`, so the order never depends on `all()`'s
   registration order.

3. Advance the clock, commit the result to `SHIP_STATE`, then call every tick listener
   with the committed snapshot, in subscription order. The loop walks a copy of its
   listeners: it skips one removed during the tick, and one added during the tick first
   hears the next. `callAll` (`src/simulation/call-all.ts`) calls every listener even
   when one throws, then throws the one error, or an `AggregateError` with every error in
   call order. The tick stays committed, and `advance()` stops after it. A listener must
   not call `advance()`, since the loop is still inside the tick; the `listen` docblock
   says so, and nothing guards against it. `SnapshotFeed` and `MasterAlarm` are
   listeners; each subscribes through `TICK_LOOP.listen` in `onInit` and unsubscribes in
   `Symbol.dispose`.

A module that `load()` adds after startup cannot join `all(SHIP_SYSTEMS)`, because the
loop resolved that list when it was built. `JumpDrive.onInit()` calls
`TICK_LOOP.attach(this.physics)`, and its disposer detaches it. Section 6.3 shows why this
is the honest DI lesson: a singleton's `all()` is the list at its construction.

Power allocation in phase 1 reads the demands the setpoints held at the start of the
tick, so a consumer switched on in tick k draws power from tick k + 1.

### 4.3 Randomness

`SeededRandom` is splitmix32 over 32-bit integer arithmetic (`Math.imul`, `>>>`), which
gives the same sequence on every JavaScript engine. `next()` returns the next `uint32`
divided by 2³². `fork(label)` returns a new source seeded with FNV-1a of
`${seed}:${label}`. The loop hands each system `rng.fork(system.name)` once, so the
numbers the fire model draws stay the same when a weapons system joins the ship (S5).

No file under `examples/meridian-systems/src` reads the wall clock or an unseeded
random source. The library's ESLint config enforces this on the syntax tree, so
`nx lint` fails on an alias or a destructure as well as a direct call. A file under `src`
imports relative paths and `@nexusdi/core` alone, which refuses `node:crypto` and
`node:perf_hooks`. It names none of `Date`, `performance`, `Temporal`, `process`,
`crypto`, `scheduler`, `Intl`, `eval`, `Function`, the timers, the GC hooks, `Atomics` or
the global object. It reads `Math` only as `Math.name`, and never `Math.random`, so
`const M = Math` and `Reflect.get(Math, 'random')` fail too. A repo-check test pins those
rules and lints one case per bypass (section 8.1).

### 4.4 Driving the loop

`bridge-api`'s `SimDriver` module provides `SIM_DRIVER` (`ISimDriver`, `WallClockDriver`,
deps `[TICK_LOOP, SIM_OPTIONS, DRIVER_OPTIONS]`). In `SIM_MODE=live`, the default for
`npm run dev`, it calls `advance(1)` every `dt` seconds of wall time with `setInterval`,
the one timer in the demo. In `SIM_MODE=manual`, which every test and e2e run sets, it
starts no timer, and `POST /sim/advance` with `{ "ticks": n }` advances the loop. The
driver clears its interval in `Symbol.dispose`.

The mode belongs to `bridge-api`: `SimDriver.forRoot({ mode })` sets `DRIVER_OPTIONS`, and
`SimOptions` stays `{ seed, dt }`. The static `Meridian` and `OfflineMeridian` run manual,
and `setupFromEnv`, which reads `SIM_MODE` and `SIM_SEED` for the Node servers, defaults
to live.

## 5. Physics

The models aim at believable numbers and stable integration at `dt = 0.5 s`. Every
quantity is SI: moles, kelvin, pascals, cubic metres, watts, joules.

### 5.1 Constants

| Symbol   | Value                                                          | Meaning                                |
| -------- | -------------------------------------------------------------- | -------------------------------------- |
| `R`      | 8.314 J/(mol·K)                                                | gas constant                           |
| `c_v`    | O₂ 21.0, N₂ 20.8, CO₂ 28.9, H₂O 25.3, volatiles 30.0 J/(mol·K) | molar heat capacity at constant volume |
| `σ`      | 5.67 × 10⁻⁸ W/(m²·K⁴)                                          | Stefan-Boltzmann constant              |
| `dt`     | 0.5 s                                                          | the fixed step                         |
| `T_hull` | 260 K                                                          | the hull's inner skin                  |
| `κ`      | 0.02 s/m                                                       | the door exchange constant             |

The deck plan holds four compartments and four doors:

| Compartment   | Volume | Hull conductance `G` | Structure heat capacity | Occupants |
| ------------- | ------ | -------------------- | ----------------------- | --------- |
| `bridge`      | 60 m³  | 90 W/K               | 2.0 MJ/K                | 2         |
| `habitat`     | 120 m³ | 150 W/K              | 4.0 MJ/K                | 4         |
| `reactor-bay` | 80 m³  | 110 W/K              | 6.0 MJ/K                | 0         |
| `airlock`     | 12 m³  | 30 W/K               | 0.5 MJ/K                | 0         |

Doors: `bridge-habitat` (1.5 m²), `habitat-reactor-bay` (1.5 m²), `habitat-airlock`
(1.2 m²) and `airlock-outer` (1.2 m², to space). Each compartment starts at 293 K and
101.3 kPa: 21 % O₂, 78 % N₂, 0.04 % CO₂, 0.9 % H₂O, the rest volatiles.

### 5.2 Pressure and temperature per compartment

A compartment holds `n_g` moles of each gas `g`, at temperature `T`, in volume `V`. The
ideal-gas approximation gives

```text
P   = (Σ_g n_g) · R · T / V
p_g = n_g · R · T / V                      partial pressure of gas g
C   = C_struct + Σ_g n_g · c_v,g           heat capacity, J/K
```

The air in a compartment holds about 5 % of the compartment's heat capacity, so the
structure damps the temperature and a heater changes it over minutes.

Each tick, the heat balance is explicit Euler:

```text
T' = T + dt · (Q_heater + Q_occupants + Q_fire + Q_bay − G · (T − T_hull)) / C
```

`Q_occupants` is 100 W per occupant. `Q_bay` is the coolant loop's leak into the reactor
bay, and zero elsewhere. The law this section first gave,
`0.002 · A_rad · ε · σ · (T_c⁴ − T_bay⁴)`, puts 4.82 MW into the bay at full output, about
2,700 times the 1.8 kW the proposed law gives. G1 applies no heat to a compartment, and G2
sets the law, with the proposal `Q_bay = 2 W/K · (T_c − T_bay)`.

The bridge and the habitat each have a thermostat, a proportional controller on a 10 kW
heater:

```text
Q_heater = clamp(K_t · (T_set − T), 0, Q_max)      T_set = 293 K, K_t = 10 kW/K, Q_max = 10 kW
```

A command sets `T_set` or turns the heater off. In the habitat the loss near 293 K is
150 × 32.5 ≈ 4,880 W, and the four occupants give 400 W, so the heater settles at about
4,480 W and the room at 292.55 K, 0.45 K under the setpoint (the offset of a proportional
controller). The loop gain per tick, `K_t · dt / C = 1.25 × 10⁻³`, keeps the explicit step
far from oscillation.

### 5.3 Metabolism, scrubbers, oxygen

Per occupant per second: −3.04 × 10⁻⁴ mol O₂, +2.63 × 10⁻⁴ mol CO₂ and +1.6 × 10⁻³ mol
H₂O (0.84 kg O₂, 1.0 kg CO₂ and 2.5 kg water a day). Each compartment off-gasses
1 × 10⁻⁶ mol/s of volatiles.

A scrubber with flow `S_s` (0.05 m³/s at 1.2 kW) removes a fixed fraction of the CO₂,
water and volatiles each tick, which stays stable at any step:

```text
n_g' = n_g · exp(−dt · S_s / V)            for g in CO₂, H₂O, volatiles
```

The water term runs only above the humidity setpoint (40 % relative humidity at `T`).
The oxygen generator (electrolysis, 6 kW at full rate) adds

```text
ṅ_O₂ = clamp(k_o · (p_set − p_O₂), 0, ṅ_max)      k_o = 2 × 10⁻⁵ mol/(s·Pa), ṅ_max = 0.05 mol/s, p_set = 21 kPa
```

### 5.4 Vents and pumps

A vent of area `A_v` open to space removes the same fraction of every gas:

```text
n_g' = n_g · exp(−dt · A_v / (κ · V))
```

A pump moves gas from `a` to `b` at volume rate `S_p` (0.2 m³/s). It moves the fraction
`m = min(1, S_p · dt / V_a)` of each gas in `a`, and the moved gas carries its energy
`Σ m · n_a,g · c_v,g · T_a` into `b`. Its electric draw is

```text
P_pump = 400 W + S_p · max(0, P_b − P_a) / 0.6
```

so a pump that empties the airlock into the habitat (the Stationeers airlock cycle) works
harder as the airlock empties.

### 5.5 Gas mixing through an open door

An open door between `a` and `b` relaxes both sides toward the mixed state with time
constant `τ = κ · (V_a + V_b) / A` (2.4 s for the bridge and the habitat):

```text
f       = 1 − exp(−dt / τ)
n*_a,g  = (n_a,g + n_b,g) · V_a / (V_a + V_b)
Δn_g    = f · (n*_a,g − n_a,g)                 moves from b to a when positive
n_a,g' = n_a,g + Δn_g,   n_b,g' = n_b,g − Δn_g
ΔU_a    = Σ_g Δn_g · c_v,g · T_src(g)         T_src is T_b when Δn_g > 0, else T_a
```

Moles are conserved exactly, since each `Δn_g` leaves one side and enters the other, and
`f < 1` keeps the step stable at any `dt`. The model equalises molar density, which
equalises pressure when the temperatures match, and the energy term pulls the
temperatures together. The airlock's outer door uses the vent formula of section 5.4.
Doors are processed in the deck plan's order within the tick.

### 5.6 Reactor and coolant

The reactor's thermal output follows its setpoint `u_set` at a ramp rate `r` of 2 % per
second:

```text
u'   = u + clamp(u_set − u, −r · dt, r · dt)
P_th = u · 3.63 GW
P_e  = η · P_th                                η = 1/3, so 1.21 GW at full output
```

The coolant loop is 200 t of liquid lithium (`c_p` 4,170 J/(kg·K), so
`C_c = 8.34 × 10⁸ J/K`) behind 24,000 m² of radiator with emissivity `ε = 0.9`. Lithium
melts at 453.7 K, so the loop starts at 500 K, and louvres close the radiators below that
temperature:

```text
λ    = clamp((T_c − 500 K) / 50 K, 0, 1)
T_c' = T_c + dt · (P_th − P_e + Σ_i h_i · P_i + Q_pulse − λ · ε · σ · A_rad · (T_c⁴ − T_bg⁴)) / C_c
```

At idle λ is 0, and the loop holds 500 K exactly. `h_i` is the share of consumer `i`'s
allocated power that ends in the loop: 0.25 for the shield grid in G1. Later increments
add 0.4 for the main drive, 0.25 for a railgun shot, 0.1 for the FTL spool and 0 for life
support, whose heat stays in the compartments. `Q_pulse` is a one-tick heat pulse from a
shot or a jump. `T_bg` is 4 K. At full output and no load, λ is 1 and the loop settles at

```text
T_c = ((P_th − P_e) / (ε · σ · A_rad)) ^ (1/4) ≈ 1,186 K
```

The explicit step is stable because its time constant,
`C_c / (4 · ε · σ · A_rad · T_c³)`, is far above `dt`: 102 s at 1,186 K and 56 s at the
1,450 K trip. Inside the louvre band, near 550 K, it is about 273 s. At full throttle the
loop heats from 500 K to 1,100 K in 340 s.

The coolant alarm sounds at 1,350 K. At 1,450 K the loop trips the reactor. The trip is a
record field, `reactor.tripped`, which `EngineeringPhysics` sets when the loop reads
1,450 K or more at the start of the tick or after the tick's step. Once set it holds. A
tripped reactor steps toward 0, and `EngineeringPhysics` writes
`setpoints.reactor.throttle` to 0.
`Safety` raises `REACTOR_TRIP` from the field in G3. Lithium boils at 1,615 K, which the
trip keeps out of reach.

In G1 neither the alarm nor the trip is reachable. The hottest equilibrium is 1,192 K, at
full output with the shields raised. Loads that drew the whole 1.21 GW at the top heat
share of 0.4 would hold the loop at 1,241 K. The trip test feeds a 1,450 K
loop to the pure function.

### 5.7 The power budget

`PlasmaRouter` allocates `P_e` to the consumers in priority order. A consumer whose whole
demand fits gets it. A consumer whose demand does not fit gets nothing and is shed, and
the router moves on to the next.

| Priority | Consumer                 | Demand at full |
| -------- | ------------------------ | -------------- |
| 1        | life support (all rooms) | up to 40 kW    |
| 2        | `SHIELD_GRID`            | 200 MW         |
| 3        | comms                    | 5 MW           |
| 4        | helm thrusters           | 20 MW          |
| 5        | main drive               | 600 MW         |
| 6        | weapons capacitor        | 300 MW         |
| 7        | FTL spool                | 900 MW         |

The sum at full is above 1.21 GW. Priorities 1 to 4 take about 225 MW. With the main drive
burning, 385 MW remain: the weapons capacitor fits and the FTL spool never does, so the
router sheds the spool. With the drive cut, 985 MW remain, and the spool fits only while
the weapons capacitor draws nothing. So a pilot who wants to jump cuts the drive and lets
the railgun go cold, which is the trade-off a player makes in Stationeers. A spool command
that the router cannot fit answers `MERIDIAN_POWER_BUDGET`, and a shed consumer raises
`LOAD_SHED` from G3.

The router serves loads of one priority in the order of their id, and checks a load at two
moments:

- When a command asks for the load. `DeflectorGrid.raise()` calls
  `PlasmaRouter.divert(load)`, which runs the tick's own pure `allocatePower` at the
  reactor's current electric output, with `load` in place of the current load of its id.
  When the result sheds `load`, it throws `PowerBudgetError` with the load's `consumer`
  id and, in W, its `demand` and the `available` power, where `available` is the output less what the loads served before
  `load` got. The grid then queues nothing.
- On each tick. `PlasmaRouter.loads(ship)` lists the loads from the setpoints, through
  `lazy(SHIELD_GRID)` for the grid, and `allocatePower` shares the tick's electric output.
  A shed load keeps its setpoint, and `power.shed` lists it on every tick the router sheds
  it.

The shield grid draws 200 MW at priority 2, so it fits once the reactor level reaches
0.1653. A throttle of 1 queued at tick 0 gives level 0.16 and 193.6 MW after 16 ticks,
where a raise answers `MERIDIAN_POWER_BUDGET`, and 205.7 MW after 17, where a raise
queues for tick 18. G1 binds the grid as the router's one load, and later increments add
theirs.

### 5.8 Propulsion and manoeuvring

The main drive is a plasma drive with efficiency `η_d = 0.6` and exhaust velocity
`v_e = 50 km/s`. The ship masses `M = 4.0 × 10⁶ kg`. The motion runs along the course to
the target, and semi-implicit Euler keeps it stable:

```text
F  = 2 · η_d · P_d / v_e                       14.4 kN at 600 MW
ṁ  = F / v_e                                   propellant use
a  = F · cos(θ − θ_course) / M
v' = v + a · dt
s' = s + v' · dt
```

`θ_course` is `NAV_CHARTS.plot(target).heading`, so the course the docs plot is the
heading the helm flies. The helm is a PD controller on the yaw angle, critically damped
(`ζ = 1`, `ω_n = 0.05 rad/s`), with moment of inertia `I = 3.3 × 10⁹ kg·m²` and thruster
torque limit `τ_max = 5 MN·m`:

```text
e  = wrap(θ_set − θ)                           to (−π, π]
τ  = clamp(I · (ω_n² · e − 2 · ζ · ω_n · ω), −τ_max, τ_max)
ω' = ω + τ / I · dt
θ' = wrap(θ + ω' · dt)
P_rcs = 20 MW · |τ| / τ_max
```

`ω_n · dt = 0.025`, well inside the step's stable range. The fastest possible 180° turn
(full torque to the midpoint, full reverse torque after) takes
`2 · √(π · I / τ_max)` ≈ 91 s. The PD controller saturates at `τ_max` early and brakes
before the midpoint, so it takes longer, and the test allows 180 s.

### 5.9 Weapons and the FTL drive

The railgun's capacitor charges from its allocation and fires on command:

```text
E' = min(E_max, E + P_w · dt)                  E_max = 400 MJ
fire when E ≥ E_shot (300 MJ): E −= E_shot, Q_pulse += 0.25 · E_shot / dt
hit when rng.next() < 0.8 · exp(−range / 50 km)
```

The FTL drive spools while armed, with the reactor at 90 % or more and the coolant below
1,300 K:

```text
S' = min(1, S + P_f · dt / E_spool)            E_spool = 90 GJ, so 100 s at 900 MW
jump when S = 1 and commanded: S = 0, the ship's sector becomes the target,
Q_pulse += 0.1 · E_spool / dt                  a 10.8 K rise in the coolant
```

### 5.10 Fire and suppression

A fire can start in a compartment above 330 K with `p_O₂` above 16 kPa. Each tick it
ignites with probability `1 − exp(−λ · dt)`, `λ = 1 × 10⁻³ /s`, drawn from the
`Safety` fork of the random source. A fire of intensity `φ ∈ [0, 1]`:

```text
φ' = clamp(φ + 0.05 · dt, 0, 1)                while p_O₂ > 16 kPa, else φ · exp(−0.2 · dt)
ṅ_O₂ = −0.5 · φ mol/s,  ṅ_CO₂ = +0.4 · φ,  ṅ_H₂O = +0.2 · φ
Q_fire = 400 kJ per mol of O₂ burned
```

The fire goes out below `φ = 0.01`. `InertGasSuppression.flood(compartment)` adds
2,000 mol of N₂ over 10 s, which takes the habitat's oxygen fraction below 15 %. Venting
the compartment through the airlock also puts a fire out, the Stationeers way.

### 5.11 Alarms

`Safety` evaluates these on the sensor reads each tick and keeps the set in the snapshot.
`MasterAlarm` compares each tick's set with the last one and calls `raise` or `clear` on
every alarm sink.

| Alarm           | Raised when                                                |
| --------------- | ---------------------------------------------------------- |
| `HYPOXIA`       | `p_O₂` < 16 kPa in an occupied compartment                 |
| `CO2_HIGH`      | `p_CO₂` > 1 kPa                                            |
| `PRESSURE_LOW`  | `P` < 70 kPa                                               |
| `TEMPERATURE`   | `T` outside 283 K to 303 K in an occupied room             |
| `FIRE`          | `φ` > 0.01                                                 |
| `COOLANT_HIGH`  | `T_c` > 1,350 K                                            |
| `REACTOR_TRIP`  | the trip of section 5.6                                    |
| `LOAD_SHED`     | the router shed a consumer                                 |
| `DECOMPRESSION` | `dP/dt` < −2 kPa/s; `Safety` closes every door of the room |
| `SENSOR_FAULT`  | a sensor read threw                                        |

## 6. Feature map

This is the core of the spec. Each row pairs a NexusDI capability with the ship system
that shows it, and says why a ship engineer would reach for it there. Every published
package has a row. "When" is the increment that brings the row, and 0.4 means the
0.4 minimum.

| Capability                                 | Package                                                 | Ship system and how it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Why it fits                                                                                                       | App                   | When             |
| ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------- |
| Interface-first tokens and `useClass`      | `@nexusdi/core`                                         | every system: `provide(ATMOSPHERE_SENSOR, { useClass: GasAnalyzer })`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | a ship swaps hardware behind a fixed interface; a test swaps a fake behind the same token                         | `bridge-api`          | G0               |
| Modules, imports and exports               | `@nexusdi/core`                                         | one module per system; `Engineering` exports `POWER_ROUTER` and keeps `COOLANT_LOOP` to itself                                                                                                                                                                                                                                                                                                                                                                                                                                             | a system is a bulkhead: other systems see its panel and never its pipes                                           | `bridge-api`          | G1               |
| Global module and `forRoot`                | `@nexusdi/core`                                         | `Simulation.forRoot({ seed: 7, dt: 0.5 })` is global, so every system and a loaded module see the clock and the state                                                                                                                                                                                                                                                                                                                                                                                                                      | every system needs the ship's clock; an import in each module would be noise                                      | `bridge-api`          | G0               |
| `forRootAsync` calibration                 | `@nexusdi/core`                                         | `LifeSupport.forRootAsync({ deps: [DECK_PLAN], useFactory: async (deck) => readCalibration(deck) })` reads the sensor calibration before the first tick                                                                                                                                                                                                                                                                                                                                                                                    | sensors read nothing true until they are calibrated, and the calibration comes from a file                        | `bridge-api`          | G2               |
| Compartment-scoped atmosphere              | `@nexusdi/core`                                         | `GET /compartments/:id/atmosphere` opens a request scope whose `REQUEST` names the compartment; `COMPARTMENT` is scoped over `REQUEST`                                                                                                                                                                                                                                                                                                                                                                                                     | a reading belongs to one room; the scope carries the room so no method takes it as an argument                    | `bridge-api`          | G2               |
| Transient sensor reads                     | `@nexusdi/core`                                         | `ATMOSPHERE_SENSOR` is transient: each `get()` builds a `GasAnalyzer` that draws its noise from ``rng.fork(`AtmosphereSensor:${compartment}:${tick}`)``                                                                                                                                                                                                                                                                                                                                                                                    | a sensor read is a sample of one tick; reads in two ticks differ, and a cached sensor would hide a leak           | `bridge-api`          | G2               |
| Multi providers and `all()`                | `@nexusdi/core`                                         | `SHIP_SYSTEMS` collects each system's physics; `MASTER_ALARM` reads `all(ALARM_SINKS)`                                                                                                                                                                                                                                                                                                                                                                                                                                                     | a ship adds a system or an alarm panel without editing the loop or the alarm                                      | `bridge-api`          | G0, G3           |
| `optional()`                               | `@nexusdi/core`                                         | `PhasedArray` takes `optional(SUBSPACE_LINK)`; the offline graph has no link, and comms reports `no subspace link` and keeps its queue                                                                                                                                                                                                                                                                                                                                                                                                     | a ship flies out of relay range; comms degrades and the ship runs                                                 | `bridge-api`          | G5               |
| `lazy()` edges                             | `@nexusdi/core`                                         | `PlasmaRouter` takes `lazy(SHIELD_GRID)` and `DeflectorGrid` takes `POWER_ROUTER`, the §7.1 cycle: `PlasmaRouter.loads()` reads the grid's draw through the thunk on every tick, and `DeflectorGrid.raise()` asks `POWER_ROUTER.divert()` to fit its load                                                                                                                                                                                                                                                                                  | the grid draws from the router and the router sheds the grid; the cycle is physical                               | `bridge-api`          | G1               |
| `load()` of a section                      | `@nexusdi/core`                                         | `ship.load(FtlDrive)` on the first `POST /ftl/spool`; `JumpDrive.onInit()` attaches its physics to the loop                                                                                                                                                                                                                                                                                                                                                                                                                                | the FTL drive is the biggest module and most voyages never jump                                                   | `bridge-api`          | G7               |
| `scope.extend()` after `load()`            | `@nexusdi/core`                                         | the telemetry stream's scope, open while the FTL drive loads, calls `extend()` to read `FTL_DRIVE` (`NEXUS_LOADED_AFTER_SCOPE` otherwise)                                                                                                                                                                                                                                                                                                                                                                                                  | a long-lived stream outlives the graph it opened on                                                               | `bridge-api`          | G7               |
| `onInit` order                             | `@nexusdi/core`                                         | `SnapshotFeed` and `MasterAlarm` subscribe to the loop in `onInit`, after the loop is built                                                                                                                                                                                                                                                                                                                                                                                                                                                | a listener must never see a loop that is not ready                                                                | `bridge-api`          | G0b              |
| Dispose order on shutdown                  | `@nexusdi/core`                                         | `ship[Symbol.asyncDispose]()`: the driver stops its timer, the feed closes its streams with `ship offline`, the alarm unsubscribes, and the reactor scram runs last; G1's test asserts `SimDriver` before `ReactorCore`, and G0b and G3 add their tokens. From G0b, `stopOnSigterm(server, shutdown, { close?, drain?, signals? })` closes the server, then aborts `shutdown`, which ends the telemetry streams; the entry disposes the ship once the server has closed, so a request in flight at `SIGTERM` answers with the ship running | a ship stops its consumers before the reactor; the reverse creation order gives that with no code                 | `bridge-api`          | G0b, G1          |
| `Nexus.check`                              | `@nexusdi/core`                                         | `test/check.test.ts` checks `Meridian` with every system, and the console checks its own graphs                                                                                                                                                                                                                                                                                                                                                                                                                                            | a broken wiring fails CI before a tick runs                                                                       | `bridge-api`, console | 0.4              |
| Request scopes on Node                     | `@nexusdi/node`                                         | `nodeScopes()` keeps the current scope across the awaits of a command handler, so `FLIGHT_LOG` records `survey-7: opened habitat-airlock` without an argument                                                                                                                                                                                                                                                                                                                                                                              | a command handler awaits the interlock and the log in turn                                                        | `bridge-api`          | 0.4, G3          |
| Server adapters                            | `@nexusdi/hono`, `@nexusdi/express`, `@nexusdi/fastify` | the three entries serve `/sim/*` from G0, `/telemetry` (SSE) from G0b and `/commands` from G1 over one graph, and the e2e cases run against each. The three Node entries stop through `stopOnSigterm`, which after `SIGTERM` closes each keep-alive connection as its response finishes                                                                                                                                                                                                                                                    | a ship's bridge picks its server; the systems never notice                                                        | `bridge-api`          | 0.4, G0, G0b, G1 |
| Interceptors as safety interlocks          | `@nexusdi/interceptors`                                 | `PressureInterlock` wraps `BLAST_DOORS.open` and throws `MERIDIAN_INTERLOCK` when the two sides differ by more than 5 kPa; `NavAudit` stays on `NAV_CHARTS`                                                                                                                                                                                                                                                                                                                                                                                | an interlock is a rule around an action, owned apart from the door; the door class stays plain                    | `bridge-api`          | 0.4, G3          |
| `errors()` text in console messages        | `@nexusdi/errors`                                       | a refused command answers 400 or 409 with `explain(error, { text: [shipText] })`; the console shows the message and its `Fix:` line                                                                                                                                                                                                                                                                                                                                                                                                        | a crew member who is refused needs the reason and the fix, in words                                               | `bridge-api`, console | G1               |
| A text pack from outside the core packages | `@nexusdi/errors`                                       | `@nexusdi/meridian-systems/text` exports `shipText` for the `MERIDIAN_*` codes, registered as `errors({ text: [shipText, interceptorsText] })`                                                                                                                                                                                                                                                                                                                                                                                             | the simulation owns its codes and their words (P1, P2) through the public points any package outside NexusDI uses | `bridge-api`          | G3               |
| Devtools graph                             | `@nexusdi/devtools`                                     | `devtools({ annotate: [shipNotes] })` labels each provider with its system, and the phase label waits for G1; the console's diagnostics page draws `graph(ship)`                                                                                                                                                                                                                                                                                                                                                                           | an engineer reads the ship's wiring by system                                                                     | `bridge-api`, console | G0b              |
| Trace                                      | `@nexusdi/devtools`                                     | `trace()` records the dispose events the shutdown test asserts                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | the dispose order is a fact a test can read                                                                       | `bridge-api`          | G1               |
| Profiler on the startup graph              | `@nexusdi/devtools`, `@nexusdi/cli`                     | `nexusdi profile src/ship/meridian.ts#Meridian` shows the two async startup steps, the `NAV_CHARTS` download and the `LifeSupport` calibration, on the critical path                                                                                                                                                                                                                                                                                                                                                                       | a ship that takes long to start needs to know which system it waits on                                            | `bridge-api`          | G2               |
| Graph CLI                                  | `@nexusdi/cli`                                          | the `graph` target draws `graph.json` with every system and `--load src/systems/ftl#FtlDrive`, and fails on a diff                                                                                                                                                                                                                                                                                                                                                                                                                         | a system added without its wiring reviewed fails CI                                                               | `bridge-api`          | 0.4, G7          |
| Testing container and overrides            | `@nexusdi/testing`                                      | `override(ATMOSPHERE_SENSOR, { useClass: FailingSensor })` raises `SENSOR_FAULT`; `overrideModule(FtlDrive, SimulatedFtlDrive, { lazy: true })` stubs the loaded drive                                                                                                                                                                                                                                                                                                                                                                     | a test breaks one sensor and watches the alarm; a test of the helm does not spool a real drive                    | `bridge-api`          | 0.4, G2          |
| Vitest fixtures                            | `@nexusdi/vitest`                                       | `nexusTest(base, Meridian, { setup })` gives each test a ship at seed 7; `test.override` changes the seed or the sensors per suite                                                                                                                                                                                                                                                                                                                                                                                                         | each test gets a fresh ship and the fixture disposes it, so a timer or listener never leaks into the next test    | `bridge-api`, console | 0.4, G0          |
| React provider, `useService` and sections  | `@nexusdi/react`                                        | the console's system pages are `lazySection`s inside `SectionBoundary`; `useService(TELEMETRY_CLIENT)` reads the stream                                                                                                                                                                                                                                                                                                                                                                                                                    | a bridge shows the panel for the system in front of it, loaded when opened                                        | console               | 0.4, G0b         |
| React Router request scopes                | `@nexusdi/react-router`                                 | the console's loaders read `BRIDGE_LINK` with `di.inject`; the command form's action posts through it; `/course/:to` streams a deferred loader                                                                                                                                                                                                                                                                                                                                                                                             | each console request carries its mission to the backend                                                           | console               | 0.4, G1          |
| Federation contracts                       | `@nexusdi/federation`                                   | each station is a remote; the contract `meridian` gains `TELEMETRY_FEED` and `COMMAND_LINK`, and a remote built at a newer minor fails with `NEXUS_CONTRACT_VERSION`                                                                                                                                                                                                                                                                                                                                                                       | each station is built by its own team against the bridge's contract                                               | federation            | 0.4, G9          |
| Decorators in a remote                     | `@nexusdi/decorators`                                   | the `command` station writes its classes with `@Injectable` and `@Inject`: `Bridge` reads `NAV_CHARTS`, and in G9 `HelmOrders` sends helm commands over `COMMAND_LINK`                                                                                                                                                                                                                                                                                                                                                                     | a team that prefers decorators writes its station that way, and the shell's core reads it                         | federation            | 0.4, G9          |

`@nexusdi/next` is out of the set until 0.5 (integrations section 10.1), and
`examples/next-bridge` keeps its gate canary.

### 6.1 The interlock in code

```ts
// examples/meridian-systems/src/systems/safety/pressure-interlock.ts
export class PressureInterlock implements Interceptor {
  static deps = [SHIP_STATE] as const;
  constructor(private readonly ship: IShipState) {}
  intercept(call: CallContext, next: Next) {
    const [door] = call.args as [DoorId];
    const { a, b } = pressuresAcross(this.ship.snapshot(), door);
    if (Math.abs(a - b) > 5_000)
      throw new InterlockError({
        door,
        difference: Math.round(Math.abs(a - b)),
      });
    return next();
  }
}
```

`bridgePlugins()` registers it beside `NavAudit`:
`interceptors({ imports: [AuditTrail], register: [NavAudit, PressureInterlock], bindings: [...] })`.
`PressureInterlock` reads `SHIP_STATE` through the global `Simulation`, so the plugin
imports only `AuditTrail`, for `NavAudit`'s `AUDIT_LOG`.
`BLAST_DOORS` is bound with `useClass`, since an interceptor never wraps a `useValue`
(`/interceptors/`). An interceptor is a singleton, and `PressureInterlock` reads only
singletons, so `NEXUS_INTERCEPTOR_LIFETIME` never applies.

### 6.2 The compartment scope in code

```ts
// bridge-api, the Hono entry
const di = nexus(ship, {
  request: (c) => ({
    mission: {
      id: c.req.header('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
    compartment: compartmentOf(new URL(c.req.url).pathname), // '/compartments/habitat/...' -> 'habitat'
  }),
});
app.get(
  '/compartments/:id/atmosphere',
  di.inject({ sensor: ATMOSPHERE_SENSOR }, ({ sensor }, c) =>
    c.json(sensor.read()),
  ),
);
```

The request mapper runs in `nexus()`'s middleware, which `.use()` installs before the
router matches `/compartments/:id`, so `c.req.param('id')` is not set yet. The mapper
reads the compartment from the path itself. `request.d.ts` adds
`compartment?: CompartmentId` to `NexusRequest` beside `mission`. A
request outside `/compartments/` that asks for `COMPARTMENT` gets
`MERIDIAN_UNKNOWN_COMPARTMENT` from the factory.

### 6.3 The FTL drive as a loaded section

`POST /ftl/spool` runs `await ship.load(FtlDrive)` once (a second call is a no-op the
handler skips), then `FTL_DRIVE.spool()` in a new scope. `FtlDrive` imports
`Engineering` and `Tactical` and reads `TICK_LOOP` through the global `MeridianSystems`
and `SHIP_STATE` through the global `Simulation`. `JumpDrive.onInit()` attaches its physics to the loop.

The section teaches two facts a reader meets in a real app. A singleton's `all()` holds
the contributions present when it was built, so a loaded system attaches itself. And a
scope opened before the load, such as a telemetry stream, calls `scope.extend()` before
it reads `FTL_DRIVE`.

### 6.4 The simulation's own errors

```ts
// examples/meridian-systems/src/errors.ts
const DOCS =
  'https://github.com/NexusDI/core/tree/main/examples/meridian-systems#';
export class InterlockError extends errorBase<
  'MERIDIAN_INTERLOCK',
  InterlockFields
>('MERIDIAN_INTERLOCK', 'InterlockError', DOCS) {}
declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    MERIDIAN_INTERLOCK: InterlockError;
  }
}
```

`shipText` formats numbers with its own `formatNumber`, which rounds and groups thousands
with a comma by a regular expression, so the text is the same on every runtime and locale
(`toLocaleString` is not). Five codes: `MERIDIAN_INTERLOCK` (a door across a pressure difference),
`MERIDIAN_POWER_BUDGET` (a command whose demand the router cannot meet, such as a shields
raise above the reactor's output or a spool with the reactor under 90 %),
`MERIDIAN_BAD_COMMAND` (a command the desk or its system cannot read),
`MERIDIAN_FTL_NOT_SPOOLED` (a jump before the spool is full) and
`MERIDIAN_UNKNOWN_COMPARTMENT`. `shipText` holds their text:

```text
[MERIDIAN_INTERLOCK] The habitat-airlock door holds 98,410 Pa of difference, above the 5,000 Pa interlock.
  Fix: pump the airlock up to the habitat's pressure, or vent the habitat side, then open the door.
```

G1 adds the two codes it raises. `PowerBudgetError` carries the load's `consumer` id and,
in W, its `demand` and the `available` power. Its text reads "The shields load needs 200 MW, and the router has
193.6 MW free beside the loads above it." `BadCommandError` carries a `reason` (`envelope`,
`system`, `action` or `argument`) with the command's `system` and `action` and the
`expected` shape in words, and `shipText` words each reason. `bridge-api` tells them apart
with `instanceof BadCommandError`. Each error links to an
explicit anchor in the library's README, such as `#MERIDIAN_POWER_BUDGET`. G3 registers
`shipText` in `errors({ text })`.

Against P1 to P5: the simulation owns its codes, their classes and their text (P1). It
extends core's open `NexusErrorByCode` by augmentation (P2). It reaches core through
`errorBase`, `ErrorTextPack` and `errors({ text })`, each public, and no package names it
(P3). It copies no package's logic (P4). It has no optional dependency (P5). The demo
shows how a package outside the first-party set adds its own codes, through the same
public points. The library's README states it in those words: it is an example in the
NexusDI repository that uses only the contribution points any outside package has.

## 7. Apps

### 7.1 `bridge-api`: the simulation's home

`bridge-api` runs one ship per server process. The three entries share one graph, as
they do today.

| Route                                                   | What it does                                                                                                                                                                                                                                               | When |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `GET /course/:to`, `/mission`, `/log/stream`, `/health` | as on `release/0.4`                                                                                                                                                                                                                                        | 0.4  |
| `GET /sim`, `POST /sim/advance`                         | the ship reading; advance `n` ticks in manual mode                                                                                                                                                                                                         | G0   |
| `GET /telemetry`                                        | SSE: one ship reading at once, then one per tick                                                                                                                                                                                                           | G0b  |
| `POST /commands`                                        | `{ system, action, ...args }` through `COMMAND_DESK`; 202 with `{ tick }`, 400 for a `BadCommandError`, 409 for any other `NexusError`, each refusal with `{ code, message, fix? }` from `explain(error, { text: [shipText] })`; an empty 413 above 100 kB | G1   |
| `GET /commands`                                         | the command log: the newest 1,000 applied changes as `{ tick, change }`, oldest first                                                                                                                                                                      | G1   |
| `GET /compartments/:id/atmosphere`                      | one transient sensor read in a compartment scope                                                                                                                                                                                                           | G2   |
| `POST /ftl/spool`, `POST /ftl/jump`                     | loads `FtlDrive` on the first call                                                                                                                                                                                                                         | G7   |
| `GET /graph`                                            | `graph(ship)` with the ship notes, in development; 404 otherwise                                                                                                                                                                                           | G0b  |

`/sim/advance` answers 404 in live mode. The entries read every JSON body through one
reader, so a body not sent as `application/json` answers 400 on all three frameworks, and
Fastify's 415 is gone. A throw from a command handler that is not a `NexusError` answers
an empty 500. From G0b, `GET /sim`, `POST /sim/advance` and the telemetry frames carry a
`ShipReading` (section 3.3): the rounded snapshot with each compartment's pressure.
`GET /sim` injects `{ state: SHIP_STATE, deck: DECK_PLAN }`, and `/sim/advance` injects
`{ driver: SIM_DRIVER, deck: DECK_PLAN }`, on all three frameworks.

`GET /telemetry` sends server-sent events, framed by `telemetryStream(feed)` in
`src/bridge/telemetry-stream.ts` with `SSE_HEADERS` (`content-type: text/event-stream`,
`cache-control: no-cache, no-transform`). A frame is `event: snapshot` with the reading as
JSON, and the last is `event: offline` with the feed's reason, `ship offline`, before the
body ends. `contracts.ts` exports `type TelemetryEvent = 'snapshot' | 'offline'`. The
stream holds only the latest frame the client has not read and enqueues it on `pull`,
with a high-water mark of 0, so a `POST /sim/advance` of 600 ticks queues one frame per
client. A cancel unsubscribes from the feed, and the stream sends no heartbeat. Hono sends
the web stream with `c.body`. Express and Fastify send `telemetryReadable(feed)`, a
Node-only `Readable.fromWeb` of the stream with a high-water mark of 0.

`GET /graph` sits outside the DI middleware, as `/health` does, so it opens no request
scope. It answers the `graph` option's JSON, or 404 when the option is absent. The Node
entries pass the option when `isDev(process.env)` holds, that is unless `NODE_ENV` is
`production`, and the Worker entry passes none.

`bridge-api`'s `e2e-growth` target runs the runtime smoke after its Vitest suite, with
`parallel: false`: the cases of `test/runtime/growth-cases.ts` on workerd
(`vitest.workers-growth.config.ts`), and on Deno and Bun through
`scripts/runtime-leg.mjs --entry=test/runtime/growth.ts`. The cases read `GET /sim` at
tick 0, advance 600 ticks to tick 600, 300 s, 293 K and 101.3 kPa, and read a first
telemetry frame at tick 0 before the client cancels. The edge runtime has no growth leg,
and the gating legs keep their current routes.

### 7.2 The bridge console

The console's server calls `bridge-api` over HTTP, and the browser calls the console only
(demo spec 6.3).

| Route                                             | What it shows                                                                                   | When      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------- |
| `/`, `/sectors/:sector`, `/course/:to`, `/charts` | the demo plan's routes                                                                          | 0.4       |
| `/telemetry`                                      | a resource route that relays `bridge-api`'s SSE with `no-transform`; 503 when the backend fails | G0b       |
| `/systems/engineering`                            | a static route with the throttle and shields forms, and the answer to the last command          | G1        |
| `/systems/engineering` action                     | posts the command through `BRIDGE_LINK`; a 400 or a 409 renders the text and the fix            | G1        |
| `/systems/:system`                                | one `lazySection` per system in `SectionBoundary`: gauges and a command form                    | after G0b |
| `/diagnostics`                                    | `graph(ship)` from `GET /graph`, each module with its providers and their notes                 | G0b       |

`BRIDGE_LINK` gains three methods in G0b: `snapshot(): Promise<ShipReading>` (`GET /sim`),
`telemetry(): Promise<ReadableStream<Uint8Array>>` (the body of `GET /telemetry`, with the
request's signal as `course()` sends it, so it takes no parameter) and
`graph(): Promise<NexusGraph | null>` (`GET /graph`, null on 404). It gains `command(cmd)`
in G1 with `POST /commands`. `command(cmd)` resolves to `{ accepted: true, tick }` or
`{ accepted: false, status, code, message, fix? }`, and rejects any other status. The
engineering page has no gauges and no `lazySection` in G1, since the gauges read G0b's
`snapshot()`. Its growth case runs in the console's `e2e-growth` target under
`playwright.e2e-growth.config.mts`, and the gating config ignores `e2e/growth/`. The
console takes the types by `import type` only. Its double `fakeBridgeLink` gains the same
methods, so the route tests stay on `nexusTest`.

The ship layout, `app/routes/ship-layout.tsx`, wraps `/diagnostics` and, from G1,
`/systems/*`. Its loader returns `snapshot()`, or null when the backend fails, and
`shouldRevalidate` returns false. The root layout stays unchanged, so a page outside the
ship layout opens no `EventSource`. The layout's `StatusStrip` renders the tick, the ship
time and the habitat's temperature and pressure in kPa from the reading, or `Telemetry
offline` for null. After hydration it subscribes through `useService(TELEMETRY_CLIENT)`,
whose `EventSourceTelemetry` opens `/telemetry` in `subscribe` only and closes it on an
`offline` event or an error, with no reconnect.

The `/telemetry` route answers 503 when the backend's stream fails. `/diagnostics` groups
the graph's providers under the module that owns them and prints each one's notes
verbatim. A null graph gives `Diagnostics are off on this bridge`, and a backend failure
renders `The bridge is unreachable` inside the ship layout, under the strip.

### 7.3 The federation app: stations as remotes

Each station is a remote with a section package, loaded by the shell's routes.

| Station      | Remote                    | Section              | Shows                                                            | When |
| ------------ | ------------------------- | -------------------- | ---------------------------------------------------------------- | ---- |
| cartography  | `federation-cartography`  | `Cartography`        | `NAV_CHARTS` through the contract; the drift and unshared builds | 0.4  |
| command      | `federation-command`      | `Command`            | decorated classes; in G9, helm orders over `COMMAND_LINK`        | 0.4  |
| engineering  | `federation-engineering`  | `EngineeringStation` | reactor, coolant and power gauges over `TELEMETRY_FEED`          | G9   |
| life support | `federation-life-support` | `LifeSupportStation` | compartment gauges and atmosphere commands                       | G9   |

G9 adds `TELEMETRY_FEED` and `COMMAND_LINK` to the `meridian` contract, which moves its
version to the next minor. The shell's `Tactical` provides them over HTTP to
`bridge-api`, which adds `hono/cors` for the shell's origin in development and e2e.

### 7.4 The 0.4 minimum and the growth track

The 0.4 minimum is the demo plan as amended in section 11. It gates 0.4.0 final: every
package covered, every e2e target green. It adds no simulation, no project and no route.

The growth track holds the rich systems. Each increment:

- adds one module (or one station) to the running simulation, with its physics, its unit
  tests, one e2e case per app it touches, and its `graph.json` change;
- starts idle in the seeded scenario (S6), so no earlier e2e case changes;
- merges to `release/0.4` during the RCs or to `main` after 0.4.0, and only when green;
- from its merge on, runs its unit tests and `bridge-api`'s graph check in `main` and in
  the release verify step, so a package change that breaks one blocks the RC until it is
  fixed;
- runs its e2e cases in the non-required `demo-growth` job, which never blocks, until a
  green RC cycle moves them into the gating `demo-apps` job (section 14).

The suggested order, each step depending only on G0 and the steps it names:

| Step | Increment                                                                                                                                                                                                                                                                            | Needs  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| G0   | the kernel: `examples/meridian-systems`, `Simulation`, `MeridianSystems`, the deck plan, the driver, `GET /sim` and `POST /sim/advance`                                                                                                                                              | none   |
| G0b  | telemetry and diagnostics: `Telemetry`, tick listeners, `GET /telemetry`, `GET /graph` with `shipNotes`, `BRIDGE_LINK.snapshot()`, `telemetry()` and `graph()`, the console's status strip and `/diagnostics`, the section 9 bundle check, and the workerd, Deno and Bun smoke cases | G0     |
| G1   | `Engineering`: reactor, coolant loop, power budget, `/commands`, `BRIDGE_LINK.command(cmd)`, the engineering page                                                                                                                                                                    | G0     |
| G2   | `LifeSupport`: per-compartment atmosphere, scrubbers, heaters, vents, pumps, sensors, calibration                                                                                                                                                                                    | G0     |
| G3   | `Safety`: blast doors, the interlock, door mixing, fire, suppression, alarms                                                                                                                                                                                                         | G2     |
| G4   | the airlock cycle: the pump and vent drill across `habitat`, `airlock` and space                                                                                                                                                                                                     | G3     |
| G5   | `Comms` and `Tactical` move into the library, with `COMMS_ARRAY` and the optional link                                                                                                                                                                                               | G0     |
| G6   | `Propulsion` and `Helm`                                                                                                                                                                                                                                                              | G1, G5 |
| G7   | `FtlDrive`, loaded with `load()`                                                                                                                                                                                                                                                     | G1, G6 |
| G8   | `Weapons`                                                                                                                                                                                                                                                                            | G1     |
| G9   | the engineering and life-support stations, the contract tokens, helm orders from `command`                                                                                                                                                                                           | G1, G2 |

G1 to G3 come first because they carry the owner's Stationeers picture (air, power,
doors) and the most features of section 6. G5, G6 and G8 can run in parallel with them.

## 8. Determinism and tests

### 8.1 Unit tests of the physics

The physics tests import `src/physics/*` and no NexusDI code:

- `gas.test.ts`: `P = nRT/V` for the habitat's initial state is 101.3 kPa ± 0.1 %; an open
  door conserves every gas's moles to 1 × 10⁻⁹ relative; two rooms at 100 kPa and 50 kPa
  converge within 1 % after 10 τ; a vent removes `1 − exp(−dt·A/(κV))` per tick.
- `thermal.test.ts`: with its thermostat at 293 K, the habitat settles between 292.4 K and
  292.7 K within an hour of ticks and stays there; the coolant loop at full output settles at 1,186 K ± 5 K; the trip fires at
  1,450 K.
- `power.test.ts`: the router fills by priority and sheds a consumer whose demand does
  not fit, with a property test over random demands that the allocation never exceeds
  `P_e`.
- `motion.test.ts`: the helm turns 180° and settles within 1° in 180 s with no overshoot
  above 2°, and no turn completes in under 91 s, the bound at full torque; the drive's `F` at 600 MW is 14.4 kN.
- `rng.test.ts`: seed 7 gives the same first 1,000 numbers on every run (a committed
  fixture); `fork('Safety')` gives the same stream whether or not `fork('Weapons')` was
  called first.
- `tools/repo-checks/src/meridian-purity.test.ts`: the library's ESLint config holds the
  replay rules of section 4.3, and ESLint refuses each known bypass of them. No file
  under `src/physics` imports `@nexusdi/*`, and no `*.module.ts` file passes 120 lines.

### 8.2 Module tests on the vitest fixtures

```ts
// examples/meridian-systems/test/fixtures.ts
export const test = nexusTest(base, ShipUnderTest, {
  setup: (builder) =>
    builder.override(SIM_OPTIONS, { useValue: { seed: 7, dt: 0.5 } }),
});

// a suite that breaks the habitat's sensor
test.override('nexusSetup', [
  (builder) =>
    builder.override(ATMOSPHERE_SENSOR, {
      useClass: FailingSensor,
      lifetime: 'transient',
    }),
]);
```

`ShipUnderTest` is a root that imports `Simulation.forRoot` and the systems under test.
It is global, and binds `TICK_LOOP` as `MeridianSystems` does.
The suite above asserts that ten ticks raise `SENSOR_FAULT` in every sink of
`all(ALARM_SINKS)`, with `MemoryAlarmSink` added to the multi token by the test.
`nexusSetup` is the fixture `nexusTest` exposes for the builder steps on `release/0.4`.
Other suites: `overrideModule(FtlDrive, SimulatedFtlDrive, { lazy: true })`
for the helm, and a shutdown test that reads `trace()`'s dispose events and asserts the
driver, the feed, the alarm and the reactor in that order. G1 writes it in `bridge-api`'s
`test/shutdown.test.ts`. It filters the `dispose:instance` events to `SimDriver` and
`ReactorCore` and asserts that sequence. The reactor then reads level 0. G0b
and G3 add their tokens to the sequence. The library's `test/engineering.test.ts` builds
`meridianSystems()` with `Nexus.create` and checks the scram and that the root cannot get
`COOLANT_LOOP`.

### 8.3 E2E on a seeded simulation

Every e2e server starts with `SIM_MODE=manual SIM_SEED=7`. A case drives ticks with
`POST /sim/advance` and asserts on three things that do not depend on the wall clock:

1. Events at a tick: "after `open habitat-airlock` is refused and the pump runs, the door
   opens at tick 61", read from the command log.
2. Rounded values: four significant digits, as the telemetry rounds them.
3. A golden file per scenario, `e2e/golden/<scenario>.seed-7.json`, with the snapshot at
   chosen ticks. A test rewrites it with `-u`, and its diff is reviewed like
   `graph.json`'s. The goldens run in the library's `e2e-growth` target, and
   `npx nx run @nexusdi/meridian-systems:e2e-growth -- -u` rewrites them.

The goldens run on Node only, and on the version `.nvmrc` names: the golden suite reads
`.nvmrc` and fails, naming both versions, when `process.versions.node` differs. A golden
is then written and read on one Node. A case in the library's `test` target asserts
rounded idle values that hold on any Node. `Math.exp` and `Math.cos` are not required to round
identically across engines, and a threshold such as a fire's ignition draw can flip on the
last bit. The workerd, Deno and Bun legs of `bridge-api`'s `e2e-growth` target run three
smoke cases: the shape of `/sim` at tick 0, 600 ticks to rounded values far from any
threshold, and a first telemetry frame (section 7.1).

S6 keeps old cases stable. In the seeded scenario, a new system starts at zero demand and
zero effect, and only its own cases command it. The RNG forks of S5 keep the numbers
older systems draw unchanged.

Console e2e reads the telemetry strip after `/sim/advance` and, from G1, submits a
command form. Federation e2e reads a station's gauges from a `bridge-api` started in
manual mode.

The console's growth cases run in its `e2e-growth` target, `nx:run-commands` with
`dependsOn: ["build", "^build"]`, which runs `playwright test --config
playwright.e2e-growth.config.mts` with `testDir: './e2e/growth'` on ports 4220 and 4221.
`playwright.servers.mts` exports `webServers(ports)` for both configs. The gating config
keeps 4210 and 4211 and sets `testIgnore: ['**/growth/**']`, since Playwright prefixes a
glob with that segment itself and Nx's `e2e-ci` inference does not. The first case
starts from the current tick, since the backend keeps its ship across retries. It reads
the ship's tick from `GET /sim`, finds it in the strip on `/diagnostics`, posts 600 ticks
to the backend and reads a tick 600 higher, its ship time, 293 K and 101.3 kPa from the
stream. The second case finds `Simulation`, `MeridianSystems` and `Telemetry` on
`/diagnostics`, with `system: Telemetry` on the feed.

## 9. Risks

| Risk                                                                                                              | What the spec does                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ship logic hides NexusDI. A reader opens a module and meets thermodynamics.                                       | Physics lives in `src/physics/` with no NexusDI import (S2). A module file holds tokens, providers and one delegation per system (section 3.4), and the reviewer refuses a module file over 120 lines. Each system's README section names the NexusDI feature it shows first, then the physics.                                                                                                                                                                                                 |
| The demo teaches odd DI. Compartments as request scopes, or a loaded system that attaches itself, read as tricks. | Section 6 gives the reason for each pairing. The scope carries one request's compartment, and nothing in the simulation holds a scope beyond a request. The attach in G7 is the documented `all()` rule, stated where it happens.                                                                                                                                                                                                                                                               |
| Bundle size. A console or station bundles the simulation.                                                         | Frontends take `import type` only. A G0b test greps the console's client build and each station's build for the descriptions of `TICK_LOOP`, `SHIP_STATE`, `SIM_CLOCK`, `RNG`, `DECK_PLAN` and `TELEMETRY`, and fails on a hit. A minifier keeps a token's description as a string and renames function names, so `stepAtmosphere` serves as no sentinel. The console's case sits in the gating `e2e/fresh-server.spec.ts` and the stations' in `examples/federation-shell/e2e/bundle.spec.ts`. |
| CI time grows with every increment.                                                                               | Each increment adds at most one e2e case per app, and the physics tests run in milliseconds. Manual mode advances 600 ticks in well under a second. The demo spec's 8-minute budget for `demo-apps` stands, since growth e2e cases run in `demo-growth` (section 14) until a green RC cycle promotes them.                                                                                                                                                                                      |
| Floating-point drift across engines breaks a golden.                                                              | Goldens run on Node only; other runtimes run a smoke case (section 8.3).                                                                                                                                                                                                                                                                                                                                                                                                                        |
| A new system changes older e2e expectations.                                                                      | S5 and S6: per-system RNG forks, and idle at start.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Vocabulary drift. The simulation adds about forty names, and a docs page or post picks one up before §7.1 has it. | Section 10 proposes every row. The demo plan's PR G carries them to `spec/docs-site`. Until a row is there, no docs page uses the name, and the domain guard's interface list gains the new interfaces, none ending in `Service`.                                                                                                                                                                                                                                                               |
| "Tactical" reads as weapons to a naval reader.                                                                    | `Tactical` keeps navigation, as §7.1 has it, and the weapons module is `Weapons`. Section 10.2 records the rule.                                                                                                                                                                                                                                                                                                                                                                                |
| Humour creeps in through ship colour (alarm text, hail messages).                                                 | §7.4 binds the demo text too: alarm and hail text states facts (`fleet traffic control: sector clear`), and the reviewer checks it.                                                                                                                                                                                                                                                                                                                                                             |

## 10. Vocabulary

### 10.1 Proposed §7.1 rows, service table

These rows go to `spec/docs-site` with the demo plan's PR G, after the demo apps' own
rows. Until they reach that branch, no docs page uses them.

| Interface            | Token                                                                             | Class                                                     | Lifetime  | Bound in, with deps                                                    |
| -------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| `ISimClock`          | `SIM_CLOCK`, described `'SimClock'`                                               | `FixedStepClock`                                          | singleton | `Simulation`, `[SIM_OPTIONS]`                                          |
| `IRandomSource`      | `RNG`, described `'RandomSource'`                                                 | `SeededRandom`                                            | singleton | `Simulation`, `[SIM_OPTIONS]`                                          |
| `IShipState`         | `SHIP_STATE`, described `'ShipState'`                                             | `ShipStateStore`                                          | singleton | `Simulation`, `[DECK_PLAN]`                                            |
| `ITickLoop`          | `TICK_LOOP`, described `'TickLoop'`                                               | `FixedStepLoop`                                           | singleton | `MeridianSystems`, `[SIM_CLOCK, SHIP_STATE, RNG, all(SHIP_SYSTEMS)]`   |
| `IShipSystem`        | `SHIP_SYSTEMS`, a `MultiToken<IShipSystem>`                                       | one physics class per system                              | singleton | each system module                                                     |
| `DeckPlan`           | `DECK_PLAN`                                                                       | the deck file                                             | value     | `Simulation`                                                           |
| `CompartmentId`      | `COMPARTMENT`                                                                     | a factory over `REQUEST`                                  | scoped    | `Simulation`, `[REQUEST]`                                              |
| `ICoolantLoop`       | `COOLANT_LOOP`, described `'CoolantLoop'`                                         | `RadiatorLoop`                                            | singleton | `Engineering`, no deps; not exported                                   |
| `ICommandHandler`    | `COMMAND_HANDLERS`, a `MultiToken<ICommandHandler>` described `'CommandHandlers'` | one handler class per system; `EngineeringCommands` in G1 | singleton | each system module; `Engineering`, `[REACTOR, SHIELD_GRID]`            |
| `ICommandDesk`       | `COMMAND_DESK`, described `'CommandDesk'`                                         | `CommandDesk`                                             | singleton | `MeridianSystems`, `[all(COMMAND_HANDLERS)]`                           |
| `IAtmosphereSensor`  | `ATMOSPHERE_SENSOR`                                                               | `GasAnalyzer`                                             | transient | `LifeSupport`, `[COMPARTMENT, SHIP_STATE, RNG, LIFE_SUPPORT_OPTIONS]`  |
| `IAtmosphereControl` | `ATMOSPHERE_CONTROL`                                                              | `EnvironmentalController`                                 | singleton | `LifeSupport`, `[SHIP_STATE]`                                          |
| `IBlastDoors`        | `BLAST_DOORS`                                                                     | `BlastDoorControl`                                        | singleton | `Safety`, `[SHIP_STATE]`; wrapped by `PressureInterlock`               |
| `IFireSuppression`   | `FIRE_SUPPRESSION`                                                                | `InertGasSuppression`                                     | singleton | `Safety`, `[SHIP_STATE]`                                               |
| `IAlarmSink`         | `ALARM_SINKS`, a `MultiToken<IAlarmSink>`                                         | `TelemetryAlarmSink`, `AuditAlarmSink`                    | singleton | `Safety`                                                               |
| `IMasterAlarm`       | `MASTER_ALARM`                                                                    | `MasterAlarm`                                             | singleton | `Safety`, `[TICK_LOOP, all(ALARM_SINKS)]`                              |
| `ICommsArray`        | `COMMS_ARRAY`                                                                     | `PhasedArray`                                             | singleton | `Comms`, `[SHIP_STATE, optional(SUBSPACE_LINK)]`                       |
| `IMainDrive`         | `MAIN_DRIVE`                                                                      | `PlasmaDrive`                                             | singleton | `Propulsion`, `[SHIP_STATE]`                                           |
| `IThrusters`         | `THRUSTERS`                                                                       | `RcsThrusters`                                            | singleton | `Helm`, `[SHIP_STATE]`                                                 |
| `IHelm`              | `HELM`                                                                            | `HelmControl`                                             | singleton | `Helm`, `[THRUSTERS, MAIN_DRIVE, NAV_CHARTS]`                          |
| `IFtlDrive`          | `FTL_DRIVE`                                                                       | `JumpDrive`                                               | singleton | `FtlDrive`, `[TICK_LOOP, SHIP_STATE, NAV_CHARTS, POWER_ROUTER]`        |
| `IWeaponMount`       | `WEAPON_MOUNT`                                                                    | `RailgunMount`                                            | singleton | `Weapons`, `[SHIP_STATE, RNG]`                                         |
| `ITelemetryFeed`     | `TELEMETRY`, described `'TelemetryFeed'`                                          | `SnapshotFeed`                                            | singleton | `Telemetry`, `[TICK_LOOP, SHIP_STATE, DECK_PLAN]`                      |
| `ITelemetryClient`   | `TELEMETRY_CLIENT`, described `'TelemetryClient'`                                 | `EventSourceTelemetry`                                    | singleton | the console's `TelemetryClient`, no deps                               |
| `ISimDriver`         | `SIM_DRIVER`                                                                      | `WallClockDriver`                                         | singleton | `bridge-api`'s `SimDriver`, `[TICK_LOOP, SIM_OPTIONS, DRIVER_OPTIONS]` |
| `SimOptions`         | `SIM_OPTIONS`                                                                     | the `forRoot()` value                                     | none      | `Simulation`                                                           |
| `DriverOptions`      | `DRIVER_OPTIONS`                                                                  | the `forRoot()` value                                     | none      | `bridge-api`'s `SimDriver`                                             |
| `LifeSupportOptions` | `LIFE_SUPPORT_OPTIONS`                                                            | the `forRootAsync()` value                                | none      | `LifeSupport`                                                          |

`ITickLoop` gains `listen(listener: TickListener)`, which returns an idempotent
unsubscribe, with `type TickListener = (ship: ShipSnapshot) => void`. Beside the table,
the library exports `readShip(ship, deck)`, which returns a `ShipReading` with a
`CompartmentReading` per compartment, the `CompartmentState` plus its `pressure`.

Changed rows: `IReactorCore` gains "in the simulation, `[SHIP_STATE]`; `output` is the
electric output in GW, 1.21 GW at full; `throttle(level)` queues the setpoint; its
disposer is the scram". `IPowerRouter` gains `SHIP_STATE` beside `lazy(SHIELD_GRID)` in
the simulation, with `loads(ship)` and `divert(load)`. `IShieldGrid` gains
`[SHIP_STATE, POWER_ROUTER]` in the simulation, with `draw(ship)` and the
`raise()` and `lower()` commands. `IShipSystem` gains `EngineeringPhysics`, Engineering's contribution, with
`[REACTOR, COOLANT_LOOP, POWER_ROUTER]`. `COMPUTER` keeps its §7.1 row for the docs
regions, and the simulation binds none.

### 10.2 Proposed §7.1 rows, other things

| Thing                  | The name                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The simulation         | `examples/meridian-systems`: the system modules and the physics. `bridge-api` runs it. A tick is `0.5 s` of ship time; the seed of every test is 7.                                                                                                                                                                                                         |
| A ship system          | A module that contributes one `IShipSystem` to `SHIP_SYSTEMS`: `Engineering`, `LifeSupport`, `Safety`, `Comms`, `Propulsion`, `Helm`, `FtlDrive`, `Weapons`.                                                                                                                                                                                                |
| A compartment          | `bridge`, `habitat`, `reactor-bay`, `airlock`.                                                                                                                                                                                                                                                                                                              |
| A door                 | `bridge-habitat`, `habitat-reactor-bay`, `habitat-airlock`, `airlock-outer`.                                                                                                                                                                                                                                                                                |
| A snapshot             | `ShipSnapshot`, the frozen state of one tick; `SHIP_STATE.snapshot()`.                                                                                                                                                                                                                                                                                      |
| A ship reading         | `ShipReading`, a rounded snapshot with each compartment's pressure; `readShip(ship, deck)`. The routes and the telemetry frames send it.                                                                                                                                                                                                                    |
| A tick listener        | `TickListener`, a function `TICK_LOOP.listen()` calls with each committed snapshot.                                                                                                                                                                                                                                                                         |
| A command              | `ShipCommand`, `{ system, action, ...args }`: `{ system: 'engineering', action: 'throttle', level: 1 }`. `COMMAND_DESK` hands it to its system's handler, which queues a `SetpointChange` on `SHIP_STATE` for the next tick. The desk answers a `QueuedCommand`, `{ tick }`, and the log holds each applied change as a `LoggedChange`, `{ tick, change }`. |
| An interlock           | `PressureInterlock`, an interceptor on `BLAST_DOORS.open`.                                                                                                                                                                                                                                                                                                  |
| An alarm               | `HYPOXIA`, `CO2_HIGH`, `PRESSURE_LOW`, `TEMPERATURE`, `FIRE`, `COOLANT_HIGH`, `REACTOR_TRIP`, `LOAD_SHED`, `DECOMPRESSION`, `SENSOR_FAULT`.                                                                                                                                                                                                                 |
| The ship's error codes | `MERIDIAN_INTERLOCK`, `MERIDIAN_POWER_BUDGET`, `MERIDIAN_BAD_COMMAND`, `MERIDIAN_FTL_NOT_SPOOLED`, `MERIDIAN_UNKNOWN_COMPARTMENT`, with `InterlockError`, `PowerBudgetError`, `BadCommandError` and the text pack `shipText`.                                                                                                                               |
| A rating               | The fixed figures of a part, beside its pure functions in `src/physics/`: `ReactorRating` (`FUSION_REACTOR`) and `CoolantRating` (`LITHIUM_LOOP`).                                                                                                                                                                                                          |
| A record               | One part's state in the snapshot: `ReactorRecord`, `CoolantRecord`, `PowerRecord` with its `LoadRecord`s, and `Setpoints`.                                                                                                                                                                                                                                  |
| A load                 | `PowerLoad`, `{ id, priority, demand, heatShare }`, a consumer that asks the router for power on a tick.                                                                                                                                                                                                                                                    |
| A system's classes     | `<System>Physics` for its `IShipSystem` and `<System>Commands` for its `ICommandHandler`: `EngineeringPhysics`, `EngineeringCommands`.                                                                                                                                                                                                                      |
| A station              | A remote of the federation app that shows one system: `cartography`, `command`, `engineering`, `life-support`. Its section is `<Name>Station` from G9 on.                                                                                                                                                                                                   |
| Simulation doubles     | `FailingSensor implements IAtmosphereSensor`, `MemoryAlarmSink implements IAlarmSink`, `SimulatedFtlDrive` (a module), `ShipUnderTest` (a test root).                                                                                                                                                                                                       |
| Ship notes             | `shipNotes`, a `GraphAnnotator` that labels each provider of the module that binds `TICK_LOOP`, and of every module it imports transitively, `system: <module name>`; the `phase: <n>` label joins in G1.                                                                                                                                                   |

The weapons module is `Weapons`. `Tactical` keeps navigation and the survey drone. None of
the new interfaces ends in `Service`, so the §7.7 pattern passes them. The guard's
interface list gains each.

## 11. Amendments to the demo apps

The 0.4 apps adopt this domain's names, tokens and module boundaries in four places. Each
is a change to `specs/2026-10-21-demo-apps-design.md` (spec) and
`specs/plans/2026-10-21-demo-apps.md` (plan).

1. The shell drops `Engineering` (S8). Spec §7.4 and plan D4 had the shell's root import
   `Engineering` and `Tactical`. No e2e case reads `Engineering`, and the simulation owns
   the module of that name from G1. The shell's root imports `Tactical` only, and plan D4
   creates no `src/ship/engineering.ts`.
2. The drift build sits one minor above the shell's contract. Spec §7.6 and plan D7
   hard-coded `2.4.0`. G9 moves the contract to the next minor, so `drift/version.ts`
   computes the next minor from `MERIDIAN_CONTRACT_VERSION`, and D7's test asserts that
   relation. Today it still yields `2.4.0`, and every text the spec quotes stays.
3. `bridge-api`'s audit module file follows the `<name>.module.ts` form the other modules
   use. Plan B1 renames `src/ship/audit.ts` to `src/ship/audit-trail.module.ts` with the
   module.
4. The vocabulary rows of spec §9.2 call each remote a station, and plan G1 carries this
   spec's section 10 rows to `spec/docs-site` beside them.

Nothing else in the 0.4 plan changes. The routes, the e2e cases, the coverage table and
the CI budget stay as they are.

## 12. Out of scope

- A crew. No crew member is named, and occupants are counts.
- Orbital mechanics. The ship moves along its course in one dimension, and a jump changes
  its sector.
- Multiplayer state. One `bridge-api` process runs one ship, and a second console sees the
  same ship.
- Saving and loading a game. The seed and the command log replay a run, and the demo
  stores neither.

## 13. Delivery

The 0.4 minimum is the demo plan with section 11's amendments. Each growth increment gets
its own short plan in `specs/plans/` when it starts, cut from the step of section 7.4,
with one PR per increment and the demo plan's review gates.

## 14. Owner question

Q1. Where do the growth track's e2e cases run in CI?

- What it does: the demo spec makes `demo-apps` a required check on `main`, `release/**`
  and `[0-9]*.x` after three green runs (its Q5). A growth increment adds e2e cases to
  `bridge-api`, the console and the shell, whose `e2e` targets that job runs.
- The case: G3 is merged during the RCs, and a later change makes its door case flaky. In
  the gating job the flake holds the next RC, which breaks the rule that a growth
  increment never blocks a release.
- Consequence: with the growth cases in the gating job, every merged system guards the
  packages it exercises, and a regression in a package that only the simulation reaches
  blocks a release. With the growth cases in a separate job, `demo-growth`, the
  simulation never holds a release, a package regression that only it catches shows red
  on that job without blocking, and CI runs a second job of about four minutes in
  parallel. Nothing published changes either way, and the ruleset stays as Q5 set it.
- Recommendation: a separate, non-required `demo-growth` job that runs an `e2e-growth`
  target in each app, with the growth cases tagged so. A growth case that has run green
  for an RC cycle can move into `e2e` by a tech-lead decision.
- Answer (owner, 2026-10-21): growth-track increments merge only when green. After a merge, their deterministic unit tests and graph check run in `main` and in the release verify step, so a package change that breaks one blocks the RC until it is fixed. Their e2e cases run in a separate, non-required `demo-growth` job and never block. A case moves into the gating job after a green RC cycle.

The rule in CI terms: `examples/meridian-systems`'s `test` target, `bridge-api`'s
`check.test.ts`, and `tools/repo-checks/src/meridian-purity.test.ts` carry no
`demo-frontend` tag, so `main`'s `run-many` and the release verify step run them. Each
app's `e2e-growth` target holds the growth cases, and only `demo-growth` runs it.
`check.test.ts` compares the graph `inspect()` draws with `graph.json`, so the `test`
target runs the graph check, and the `graph` target stays the writer of `graph.json`. The
library's `e2e-growth` target holds the goldens, and `demo-growth` runs it too.

## 15. Owner decision log

| Date       | Decision                                                                                                                                                                                                                                                                                                                                                                                                             | Source                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 2026-10-21 | The ship is modelled on Stationeers, with the eight systems of decision 1                                                                                                                                                                                                                                                                                                                                            | owner, decision 1       |
| 2026-10-21 | A deterministic, seeded, fixed-step simulation on the backend; the console streams telemetry and commands                                                                                                                                                                                                                                                                                                            | owner, decision 2       |
| 2026-10-21 | The full domain designed now; a 0.4 minimum gates 0.4.0, and the rich systems form a growth track                                                                                                                                                                                                                                                                                                                    | owner, decision 3       |
| 2026-10-21 | Q1: growth increments merge green; their unit tests and graph check gate in `main` and the release verify step; their e2e runs in the non-required `demo-growth` job until a green RC cycle promotes it                                                                                                                                                                                                              | owner                   |
| 2026-10-21 | `TICK_LOOP` is bound in the global aggregate `MeridianSystems`, since `all()` reads only what its module can see; `Simulation` stays global with the other kernel tokens                                                                                                                                                                                                                                             | tech lead, G0 ruling 1  |
| 2026-10-21 | G0 is the kernel with `GET /sim` and `POST /sim/advance`; G0b takes telemetry, `/graph`, `shipNotes`, the console's strip and `/diagnostics`, the bundle check and the runtime smoke case; `BRIDGE_LINK.command` moves to G1                                                                                                                                                                                         | tech lead, G0 ruling 2  |
| 2026-10-21 | `meridianSystems(options: SimOptions)` takes `{ seed, dt }`; G5 widens it with `relayUrl`                                                                                                                                                                                                                                                                                                                            | tech lead, G0 ruling 3  |
| 2026-10-21 | The command queue and `attach()`/`detach()` wait for G1 and G7, and `COMPARTMENT` for G2; `DECK_PLAN`, the deck file and the initial air are in G0                                                                                                                                                                                                                                                                   | tech lead, G0 ruling 4  |
| 2026-10-21 | The driver's mode belongs to `bridge-api`: `SimDriver.forRoot({ mode })`; the static graphs run manual, and `setupFromEnv` defaults to live                                                                                                                                                                                                                                                                          | tech lead, G0 ruling 5  |
| 2026-10-21 | `bridge-api`'s graph check is a case in `test/check.test.ts`; the `graph` target stays the writer of `graph.json`                                                                                                                                                                                                                                                                                                    | tech lead, G0 ruling 6  |
| 2026-10-21 | The golden runs in the library's `e2e-growth` target, pinned to `.nvmrc`'s Node; a `test` case asserts rounded idle values that hold on any Node                                                                                                                                                                                                                                                                     | tech lead, G0 ruling 7  |
| 2026-10-21 | Tick listeners: `ITickLoop.listen` returns an idempotent unsubscribe; listeners run after the commit in subscription order through `callAll`, which throws one error or an `AggregateError`; a listener must not call `advance()`                                                                                                                                                                                    | tech lead, G0b ruling 1 |
| 2026-10-21 | Telemetry: `TELEMETRY` binds `SnapshotFeed` in `Telemetry`, which listens in `onInit`, sends the current reading at subscribe, closes every sink with `ship offline` on dispose, and joins the aggregate's imports and exports                                                                                                                                                                                       | tech lead, G0b ruling 2 |
| 2026-10-21 | `GET /telemetry` frames `snapshot` and `offline` events, keeps only the latest unsent frame, and sends no heartbeat; `stopOnSigterm` closes each Node entry's server and ends the streams through a shutdown signal, and the ship disposes after the server closes                                                                                                                                                   | tech lead, G0b ruling 3 |
| 2026-10-21 | `GET /graph` answers the annotated graph in development and 404 otherwise; `shipNotes` labels each ship provider with its system, and the phase label waits for G1                                                                                                                                                                                                                                                   | tech lead, G0b ruling 4 |
| 2026-10-21 | The console reads `snapshot()`, `telemetry()` and `graph()` through `BRIDGE_LINK`, follows the stream through `TELEMETRY_CLIENT` in the ship layout's status strip, and draws `/diagnostics`                                                                                                                                                                                                                         | tech lead, G0b ruling 5 |
| 2026-10-21 | The console's growth e2e runs in its own `e2e-growth` target on ports 4220 and 4221, and the gating config ignores `**/growth/**`                                                                                                                                                                                                                                                                                    | tech lead, G0b ruling 6 |
| 2026-10-21 | `bridge-api`'s `e2e-growth` runs the growth cases on workerd, Deno and Bun after its Vitest suite; `demo-growth` installs the pinned Deno and Bun; no edge leg                                                                                                                                                                                                                                                       | tech lead, G0b ruling 7 |
| 2026-10-21 | The bundle check greps the console's and the stations' builds for the descriptions of six simulation tokens, and it gates                                                                                                                                                                                                                                                                                            | tech lead, G0b ruling 8 |
| 2026-10-22 | `readShip(ship, deck)` returns a `ShipReading` with each compartment's pressure; `SnapshotFeed` takes `DECK_PLAN`, and `/sim` and the telemetry frames carry the reading; `ShipSnapshot` and the golden stay unchanged                                                                                                                                                                                               | tech lead, G0b ruling 9 |
| 2026-10-21 | `Engineering` binds `REACTOR` (`FusionReactor`, `[SHIP_STATE]`), the private `COOLANT_LOOP` (`RadiatorLoop`, no deps), `POWER_ROUTER` (`PlasmaRouter`, `[SHIP_STATE, lazy(SHIELD_GRID)]`) and `SHIELD_GRID` (`DeflectorGrid`, `[SHIP_STATE, POWER_ROUTER]`) and contributes `EngineeringPhysics` and `EngineeringCommands`; it exports every token but `COOLANT_LOOP`, and `COMPUTER` stays in the docs regions only | tech lead, G1 ruling 1  |
| 2026-10-21 | Commands reach their system through the multi token `COMMAND_HANDLERS`; `CommandDesk` (`[all(COMMAND_HANDLERS)]`) is bound to `COMMAND_DESK` in `MeridianSystems` beside `TICK_LOOP`, so `bridge-api` names no system                                                                                                                                                                                                | tech lead, G1 ruling 2  |
| 2026-10-21 | `SHIP_STATE` queues setpoint changes and applies them in queue order at step 1 of the next tick; `GET /commands` answers the log of the newest 1,000, which never holds a refused command                                                                                                                                                                                                                            | tech lead, G1 ruling 3  |
| 2026-10-21 | `PlasmaRouter.loads(ship)` reads the grid through `lazy(SHIELD_GRID)` on every tick; `DeflectorGrid.raise()` calls `PlasmaRouter.divert(load)`, which runs the tick's `allocatePower` at the current electric output and throws `PowerBudgetError` when the result sheds the load                                                                                                                                    | tech lead, G1 ruling 4  |
| 2026-10-21 | G1 adds no alarm set, and `Safety` raises the alarms in G3 from the engineering records (`reactor.tripped`, `coolant.temperature`, `power.shed`); `EngineeringPhysics` writes the throttle setpoint to 0 on a trip                                                                                                                                                                                                   | tech lead, G1 ruling 5  |
| 2026-10-21 | The coolant loop starts at 500 K, above lithium's melting point, behind radiator louvres with `λ = clamp((T_c − 500 K) / 50 K, 0, 1)`; the idle loop holds 500 K exactly                                                                                                                                                                                                                                             | tech lead, G1 ruling 6  |
| 2026-10-21 | The shield grid's heat share is 0.25; G1 applies no heat to a compartment, and G2 sets the corrected `Q_bay` law of section 5.2                                                                                                                                                                                                                                                                                      | tech lead, G1 ruling 7  |
| 2026-10-21 | G1 raises `MERIDIAN_POWER_BUDGET` and `MERIDIAN_BAD_COMMAND` and exports `shipText` at `./text`; `POST /commands` answers a `BadCommandError` with 400 and any other `NexusError` with 409, each with `explain(error, { text: [shipText] })`, and `errors({ text })` registration stays in G3                                                                                                                        | tech lead, G1 ruling 8  |
| 2026-10-21 | The console gains `BRIDGE_LINK.command(cmd)` and the static route `/systems/engineering` with its forms and the last answer, no gauges and no `lazySection`; its growth case runs under `playwright.growth.config.mts`                                                                                                                                                                                               | tech lead, G1 ruling 9  |
| 2026-10-21 | `FusionReactor[Symbol.dispose]()` is the scram; the shutdown test asserts `SimDriver` before `ReactorCore` in `trace()`'s `dispose:instance` events, and G0b and G3 add their tokens                                                                                                                                                                                                                                 | tech lead, G1 ruling 10 |
| 2026-10-21 | `C_c` is 8.34 × 10⁸ J/K and the time constant 102 s at 1,186 K (56 s at the trip); a full-throttle heat-up from 500 K to 1,100 K takes 340 s, and the trip test feeds 1,450 K to the pure function, since the alarm and the trip are out of reach in G1                                                                                                                                                              | tech lead, G1 ruling 11 |
| 2026-10-21 | Records and ratings live beside their pure functions in `src/physics/`; `src/systems/engineering/contracts.ts` holds Engineering's interfaces and tokens, and `src/simulation/commands.ts` holds the setpoint types and the command contracts                                                                                                                                                                        | tech lead, G1 ruling 12 |

The owner made the rows whose source is "owner". The architect proposed the "tech lead"
rows and the tech lead decided them, as `specs/plans/2026-10-21-meridian-g0-kernel.md`,
`specs/plans/2026-10-21-meridian-g0b-telemetry.md` and
`specs/plans/2026-10-21-meridian-g1-engineering.md` record under their rulings.
