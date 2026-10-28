# Meridian ship systems

Status: proposed, 2026-10-21. The owner answered Q1 on 2026-10-21 (section 14). The tech
lead settles the rest. The rulings of G1 to G9 and the decisions of their runs amend
sections 3 to 13, and section 15 lists the rulings. Section 16 plans the ship's layout
from the owner's decisions of 2026-10-24.

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
  src/physics/          pure functions: gas.ts, atmosphere.ts, thermal.ts, power.ts, motion.ts, rng.ts,
                        doors.ts, fire.ts, safety.ts (G3), comms.ts (G5), ftl.ts (G7), weapons.ts (G8)
  src/meridian-systems.module.ts   the aggregate MeridianSystems, which binds TICK_LOOP and COMMAND_DESK
  src/simulation/       the Simulation module: clock, random source, state, the loop class,
                        the command contracts and the command desk class
  src/systems/<name>/   one folder per system: <name>.module.ts, its classes, its tests
  src/errors.ts         the MERIDIAN_* error classes
  src/text.ts           shipText, at the ./text subpath
  src/systems/safety/pressure-interlock.ts   PressureInterlock, at the ./interlock subpath (G3)
  src/systems/comms/    Comms and OfflineComms: the phased array and the relay (G5)
  src/systems/tactical/ Tactical and OfflineTactical: the star charts (G5)
  src/systems/propulsion/   Propulsion: the main drive (G6)
  src/systems/helm/     Helm: the thrusters and the helm (G6)
  src/systems/ftl/      FtlDrive: the jump drive, loaded with load() (G7)
  src/systems/weapons/   Weapons: the railgun (G8)
  src/telemetry/        the Telemetry module: the feed's contracts and SnapshotFeed
  src/notes.ts          shipNotes, a devtools graph annotator
  deck/meridian.deck.json   the deck plan: compartments, volumes, doors, equipment, initial gas
  deck/sensors.calibration.json   the gas analyzers' noise and resolution (G2)
  deck/charts.json   the star charts' headings, which OfflineTactical bundles (G5)
```

The library's entry exports one aggregate, `meridianSystems({ seed, dt })`, which returns
the module `MeridianSystems`. From G5 it takes `meridianSystems({ seed, dt, relayUrl? })`,
typed `MeridianSystemsOptions`, which extends `SimOptions` with the optional `relayUrl`, and
hands `Simulation.forRoot` `{ seed, dt }` alone.
It imports `Simulation.forRoot`, `Telemetry` and each
system module, binds `TICK_LOOP` and `COMMAND_DESK` (section 3.2), and exports both with
each system module, so `bridge-api`'s `Meridian` imports one module and a growth
increment adds its system inside the library. From G1 the aggregate exports `TICK_LOOP`,
`COMMAND_DESK` and `Engineering`, whose re-export hands the root `REACTOR`, `POWER_ROUTER`
and `SHIELD_GRID`. From G2 it imports one instance,
`LifeSupport.forRootAsync({ deps: [DECK_PLAN], useFactory: readCalibration })`, held in a
`const`, and re-exports that instance. The re-export hands the root `ATMOSPHERE_SENSOR`
and `ATMOSPHERE_CONTROL` and puts LifeSupport's `POWER_CONSUMERS` entry where
Engineering's router reads it. From G3 it imports `Safety` after that instance and
re-exports it. The re-export hands the root Safety's two panels and its master alarm, and
puts Safety's `SHIP_SYSTEMS` and `COMMAND_HANDLERS` entries where the
loop and the desk read them. `Simulation` is global, so its tokens reach
the root without the aggregate exporting them. `FtlDrive`
stays out of the aggregate, since it joins with `load()`.

From G5 the aggregate picks its comms pair from `relayUrl`. With it, it imports
`Comms.forRoot({ frequency: 1420, transport: 'relay', relayUrl })` and `Tactical`, whose
`NAV_CHARTS` factory downloads the charts over `SUBSPACE_LINK`. Without it, it imports
`OfflineComms`, which binds no link, and `OfflineTactical`, which binds the bundled table.
It re-exports both modules, so `Tactical` reads the link and the root reads `COMMS_ARRAY`
and `NAV_CHARTS` through the global aggregate. A configured module's providers are static,
so a configured `Comms` cannot leave its link out, and the offline graph needs a module
with no link binding for `optional()` to resolve undefined. `Tactical` alone fails
`Nexus.check` with `NEXUS_BLUEPRINT_INVALID`, so `src/index.ts` exports no module object
beside `meridianSystems`. It exports the tokens `NAV_CHARTS`, `SUBSPACE_LINK`,
`COMMS_OPTIONS` and `COMMS_ARRAY` beside the value `BUNDLED_CHARTS`, and the types `Course`,
`INavCharts`, `ISubspaceLink`, `CommsOptions`, `ICommsArray`, `CommsRecord`,
`CommsSetpoints`, `CommsStatus`, `CommsMessage` and `MeridianSystemsOptions`.
`SubspaceRelay`, `StarCharts` and the chart table moved from `bridge-api` with `git mv`, so
they keep their history. The move rewrote `src/systems/tactical/tactical.module.ts` past
git's rename threshold, so git records it as a new file.

From G6 the aggregate imports and re-exports `Propulsion` and `Helm` after the tactical
module. `HelmControl` reads `MAIN_DRIVE` and `NAV_CHARTS` through the global aggregate, as
every cross-system read in the library does. `Helm` alone, or beside `Propulsion` in a
root that is not global, fails `Nexus.check` with `NEXUS_BLUEPRINT_INVALID`
(`NEXUS_MISSING_PROVIDER` for `MainDrive` and `NavCharts`), so `src/index.ts` exports
neither module. It exports the tokens `MAIN_DRIVE`, `THRUSTERS` and `HELM` and the types
`IMainDrive`, `IThrusters`, `IHelm`, `DriveRecord`, `DriveSetpoints`, `HelmRecord` and
`HelmSetpoints`. The aggregate's file holds 101 lines, under the 120-line limit.

From G7 the index exports `FtlDrive`, the one module object beside `meridianSystems`. It
fails `Nexus.check` alone (`NEXUS_MISSING_PROVIDER` for `TickLoop`, `ShipState`,
`NavCharts` and `PowerRouter`) and passes as a load of a ship `meridianSystems()` built.
`bridge-api` holds the module object to load it, and a `./ftl` subpath would give a reader
an entry point that fails alone. The index also exports the token `FTL_DRIVE`, the error
`FtlNotSpooledError` and the types `IFtlDrive`, `FtlRating`, `FtlRecord`, `FtlSetpoints`
and `FtlStatus`. `FtlDrive` stays out of the aggregate, and the aggregate's file does not
change.

From G8 the aggregate imports and re-exports `Weapons` after `Helm`, and its file holds 106
lines. The index exports the token `WEAPON_MOUNT` and the types `IWeaponMount`,
`RailgunRating`, `RailgunShot`, `WeaponsRecord`, `WeaponsSetpoints` and `WeaponsStatus`. It
exports no module object for `Weapons`, as it exports none for `Propulsion` and `Helm`.
`pulseCoolant` moves from `src/physics/ftl.ts` to `src/physics/thermal.ts` beside the
coolant step, since `FtlPhysics` and `WeaponsPhysics` both call it. The index never
exported it.

`.fallowrc.jsonc` gains entries for the library, so `fallow dead-code` keeps the files
nothing imports. G0 adds `e2e/**/*.ts` and `vitest.e2e-growth.config.ts` (the `e2e-growth`
target runs them by path) and `e2e/golden/*.json` (the snapshot matcher reads it). G1 adds
`src/text.ts` (the `./text` subpath). `bridge-api`'s command route imports it, so it needs
no entry. `Simulation` imports `deck/meridian.deck.json` with `with { type: 'json' }`, so
the deck needs no entry, and `readCalibration` imports `deck/sensors.calibration.json` the
same way. From G5 `src/systems/tactical/star-charts.ts` imports `deck/charts.json` the same
way.

`bridge-api` imports the aggregate and runs the simulation. The bridge console and
the federation stations import types only (`import type`), and the console imports the
star charts from `@nexusdi/meridian-systems/charts`, so no simulation code reaches a
browser bundle. The `./charts` subpath points at `src/systems/tactical/star-charts.ts`,
which exports `StarCharts` and `BUNDLED_CHARTS` and holds no simulation code.

### 3.2 Modules

Each row is one module. Every token is interface-first: an interface, a typed token named
for the role, and one class bound with `useClass` (docs §7.3). Names in the existing
§7.1 vocabulary keep their meaning.

| Module            | System                             | Tokens it exports                                                                                                    | Configured by                                                                       | State on 0.4                                                          |
| ----------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `Simulation`      | the kernel                         | `SIM_OPTIONS`, `SIM_CLOCK`, `RNG`, `SHIP_STATE`, `DECK_PLAN`, `COMPARTMENT`                                          | `Simulation.forRoot({ seed, dt })`, `global`                                        | growth G0; `COMPARTMENT` in G2                                        |
| `MeridianSystems` | the tick loop and the command desk | `TICK_LOOP`, `TELEMETRY`, `COMMAND_DESK`, and each system module it imports                                          | `meridianSystems({ seed, dt, relayUrl? })`, `global`                                | growth G0; `TELEMETRY` in G0b; `COMMAND_DESK` in G1; `relayUrl` in G5 |
| `Engineering`     | reactor and power                  | `REACTOR`, `POWER_ROUTER`, `SHIELD_GRID`, `SHIP_SYSTEMS`, `COMMAND_HANDLERS`; `COOLANT_LOOP` stays private           | none                                                                                | in §7.1; the simulation's form is G1                                  |
| `LifeSupport`     | atmosphere                         | `ATMOSPHERE_PROBE`, `ATMOSPHERE_SENSOR`, `ATMOSPHERE_CONTROL`, `SHIP_SYSTEMS`, `POWER_CONSUMERS`, `COMMAND_HANDLERS` | `LifeSupport.forRootAsync({ deps, useFactory })`                                    | growth G2; `ATMOSPHERE_PROBE` in G3                                   |
| `Safety`          | doors, fire, alarms                | `BLAST_DOORS`, `FIRE_SUPPRESSION`, `MASTER_ALARM`, `SHIP_SYSTEMS`, `COMMAND_HANDLERS`                                | none                                                                                | growth G3                                                             |
| `Comms`           | comms                              | `SUBSPACE_LINK` (the relay form only), `COMMS_ARRAY`, `SHIP_SYSTEMS`, `POWER_CONSUMERS`, `COMMAND_HANDLERS`          | `Comms.forRoot({ frequency, transport, relayUrl })`, or `OfflineComms` with no link | growth G5                                                             |
| `Propulsion`      | the main drive                     | `MAIN_DRIVE`, `SHIP_SYSTEMS`, `POWER_CONSUMERS`                                                                      | none                                                                                | growth G6                                                             |
| `Helm`            | manoeuvring                        | `THRUSTERS`, `HELM`, `SHIP_SYSTEMS`, `POWER_CONSUMERS`, `COMMAND_HANDLERS`                                           | none                                                                                | growth G6                                                             |
| `FtlDrive`        | the FTL drive                      | `FTL_DRIVE`; attaches its physics to `TICK_LOOP` and its load to `POWER_ROUTER`                                      | none; added with `ship.load()`                                                      | growth G7                                                             |
| `Weapons`         | weapons                            | `WEAPON_MOUNT`, `SHIP_SYSTEMS`, `POWER_CONSUMERS`, `COMMAND_HANDLERS`                                                | none                                                                                | growth G8                                                             |
| `Telemetry`       | the telemetry feed                 | `TELEMETRY`                                                                                                          | none                                                                                | growth G0b                                                            |
| `Tactical`        | navigation                         | `NAV_CHARTS`                                                                                                         | none; `Tactical` downloads the charts, `OfflineTactical` bundles them               | in §7.1; the library's from G5                                        |
| `BridgeApi`       | the request side                   | `MISSION`, `FLIGHT_LOG`                                                                                              | none                                                                                | in §7.1 and `bridge-api`; unchanged                                   |
| `AuditTrail`      | the audit store                    | `AUDIT_LOG`                                                                                                          | none                                                                                | in §7.1; `bridge-api` renames it in 0.4                               |
| `AlarmPanel`      | the audit alarm sink               | `ALARM_SINKS`, with `AuditAlarmSink`                                                                                 | none; `global`                                                                      | in `bridge-api`; G3                                                   |

`TICK_LOOP` is bound in the aggregate `MeridianSystems`, which is global. A module's
`all()` reads the module's own providers plus the exports of its imports and of the global
modules (`libs/core/src/blueprint/visibility.ts`), so a loop bound in `Simulation` never
sees a system that a sibling module imports. Each system module exports `SHIP_SYSTEMS`,
and the aggregate imports every system module, so its loop sees each one. `COMMAND_DESK`
reads `all(COMMAND_HANDLERS)`, so it sits in the aggregate beside the loop for the same
reason. `COMPUTER` stays in the docs regions of §7.1. No simulated system reads it, so
`Engineering` binds none. `Simulation` stays global and binds `SIM_OPTIONS`, `SIM_CLOCK`,
`RNG`, `SHIP_STATE`, `DECK_PLAN` and, from G2, `COMPARTMENT`.

A system adds its power load through the contribution point `POWER_CONSUMERS` (G2), a
`MultiToken<IPowerConsumer>` in `src/systems/engineering/contracts.ts`.
`IPowerConsumer` has one member, `draw(ship: ShipSnapshot): PowerLoad`. `PlasmaRouter`
takes `all(POWER_CONSUMERS)` inside `Engineering`, and that `all()` reads LifeSupport's
contribution through the global `MeridianSystems`, which re-exports LifeSupport. From G5
it reads Comms' `CommsPower` through the aggregate's re-export of the comms module. From
G6 it reads `PropulsionPower` and `HelmPower` the same way, and from G8 `WeaponsPower`, the
capacitor's load.
A module that `load()` adds attaches its consumer with `POWER_ROUTER.attach()`, since the
router's `all()` is the list at its construction. From G7 `JumpDrive` attaches `FtlPower`
that way, and `loads(ship)` lists it after the `POWER_CONSUMERS` entries.

An app adds an alarm sink through the contribution point `ALARM_SINKS` (G3), a
`MultiToken<IAlarmSink>` in `src/systems/safety/contracts.ts` that `src/index.ts` exports.
`Safety` binds no sink and leaves the token out of its exports. `MasterAlarm` takes
`all(ALARM_SINKS)` inside `Safety`, and that `all()` reads Safety's own providers plus the
exports of its imports and of the global modules, so a sink reaches it from a
global module. `bridge-api`'s `AlarmPanel` (`src/ship/alarm-panel.module.ts`) is that
module: it is global and imports `AuditTrail`. It contributes `AuditAlarmSink`
(`[AUDIT_LOG]`), which records `raised DECOMPRESSION habitat at tick 2` and
`cleared DECOMPRESSION habitat at tick 3`. Every telemetry frame carries `safety.alarms`,
so the library binds no telemetry sink.

`Meridian`, the root in `bridge-api`, imports `meridianSystems(...)`, `BridgeApi` and
`AuditTrail`, which together hold every module above except `FtlDrive`. It also imports
`bridge-api`'s own `SimDriver.forRoot({ mode })` (section 4.4), and from G3 `AlarmPanel`,
which `offlineMeridian()` imports too. `Tactical` moves
into the library with `Comms` in G5, because `Helm` and `FtlDrive` read `NAV_CHARTS` and
the library cannot import `bridge-api`. From G5 `meridian(relayUrl, setup)` and
`offlineMeridian(setup)` build both roots through the private
`bridgeShip(name, systems, mode)`, which imports `BridgeApi`, `AuditTrail`, `AlarmPanel`,
`meridianSystems(systems)` and `SimDriver.forRoot({ mode })` in that order. `meridian`
passes `{ ...setup.sim, relayUrl }` and `offlineMeridian` passes `setup.sim`, so `Comms`
and `Tactical` sit inside the aggregate. The
FTL drive joins the running ship on the first FTL request, a spool or a jump: each
adapter's `di.load(FtlDrive)` section runs `ship.load(FtlDrive)` (section 6.3).

`Tactical` keeps `NAV_CHARTS`, as §7.1 has it. The weapons module is `Weapons`, so
"tactical" keeps its docs meaning (navigation and the survey drone) and the two never
share a module.

### 3.3 Tokens and classes

The interfaces and their classes, by module. Every class takes interfaces in its
constructor and declares tokens in `static deps`.

| Interface            | Token                                                                     | Class                                                                                                                          | Lifetime  | Deps                                                |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- | --------------------------------------------------- |
| `ISimClock`          | `SIM_CLOCK = new Token<ISimClock>('SimClock')`                            | `FixedStepClock`                                                                                                               | singleton | `[SIM_OPTIONS]`                                     |
| `IRandomSource`      | `RNG = new Token<IRandomSource>('RandomSource')`                          | `SeededRandom`                                                                                                                 | singleton | `[SIM_OPTIONS]`                                     |
| `IShipState`         | `SHIP_STATE = new Token<IShipState>('ShipState')`                         | `ShipStateStore`                                                                                                               | singleton | `[DECK_PLAN]`                                       |
| `IShipSystem`        | `SHIP_SYSTEMS = new MultiToken<IShipSystem>('ShipSystems')`               | one class per system                                                                                                           | singleton | each system's own                                   |
| `ITickLoop`          | `TICK_LOOP = new Token<ITickLoop>('TickLoop')`                            | `FixedStepLoop`                                                                                                                | singleton | `[SIM_CLOCK, SHIP_STATE, RNG, all(SHIP_SYSTEMS)]`   |
| `DeckPlan`           | `DECK_PLAN = new Token<DeckPlan>('DeckPlan')`                             | the deck file, a value                                                                                                         | value     | none                                                |
| `CompartmentId`      | `COMPARTMENT = new Token<CompartmentId>('Compartment')`                   | `compartmentOfRequest`, a factory                                                                                              | scoped    | `[REQUEST]`, `eager: false`                         |
| `IReactorCore`       | `REACTOR` (§7.1)                                                          | `FusionReactor`                                                                                                                | singleton | `[SHIP_STATE]`                                      |
| `ICoolantLoop`       | `COOLANT_LOOP = new Token<ICoolantLoop>('CoolantLoop')`                   | `RadiatorLoop`                                                                                                                 | singleton | none                                                |
| `IPowerRouter`       | `POWER_ROUTER` (§7.1)                                                     | `PlasmaRouter`                                                                                                                 | singleton | `[SHIP_STATE, all(POWER_CONSUMERS)]`                |
| `IPowerConsumer`     | `POWER_CONSUMERS = new MultiToken<IPowerConsumer>('PowerConsumers')`      | one class per system                                                                                                           | singleton | each system's own                                   |
| `IShieldGrid`        | `SHIELD_GRID` (§7.1)                                                      | `DeflectorGrid`                                                                                                                | singleton | `[SHIP_STATE, lazy(POWER_ROUTER)]`                  |
| `IShipSystem`        | `SHIP_SYSTEMS`, Engineering's contribution                                | `EngineeringPhysics`                                                                                                           | singleton | `[REACTOR, COOLANT_LOOP, POWER_ROUTER]`             |
| `ICommandHandler`    | `COMMAND_HANDLERS = new MultiToken<ICommandHandler>('CommandHandlers')`   | `EngineeringCommands`                                                                                                          | singleton | `[REACTOR, SHIELD_GRID]`                            |
| `ICommandDesk`       | `COMMAND_DESK = new Token<ICommandDesk>('CommandDesk')`                   | `CommandDesk`                                                                                                                  | singleton | `[all(COMMAND_HANDLERS)]`                           |
| `IAtmosphereProbe`   | `ATMOSPHERE_PROBE = new Token<IAtmosphereProbe>('AtmosphereProbe')`       | `CalibratedProbe`                                                                                                              | singleton | `[RNG, LIFE_SUPPORT_OPTIONS, DECK_PLAN]`            |
| `IAtmosphereSensor`  | `ATMOSPHERE_SENSOR = new Token<IAtmosphereSensor>('AtmosphereSensor')`    | `GasAnalyzer`                                                                                                                  | transient | `[COMPARTMENT, SHIP_STATE, ATMOSPHERE_PROBE]`       |
| `IAtmosphereControl` | `ATMOSPHERE_CONTROL = new Token<IAtmosphereControl>('AtmosphereControl')` | `EnvironmentalController`                                                                                                      | singleton | `[SHIP_STATE]`                                      |
| `IShipSystem`        | `SHIP_SYSTEMS`, LifeSupport's contribution                                | `LifeSupportPhysics`                                                                                                           | singleton | `[LIFE_SUPPORT_OPTIONS, DECK_PLAN]`                 |
| `IPowerConsumer`     | `POWER_CONSUMERS`, LifeSupport's contribution                             | `LifeSupportPower`                                                                                                             | singleton | `[LIFE_SUPPORT_OPTIONS, DECK_PLAN]`                 |
| `ICommandHandler`    | `COMMAND_HANDLERS`, LifeSupport's contribution                            | `LifeSupportCommands`                                                                                                          | singleton | `[ATMOSPHERE_CONTROL]`                              |
| `IBlastDoors`        | `BLAST_DOORS = new Token<IBlastDoors>('BlastDoors')`                      | `BlastDoorControl`                                                                                                             | singleton | `[SHIP_STATE]`                                      |
| `IFireSuppression`   | `FIRE_SUPPRESSION = new Token<IFireSuppression>('FireSuppression')`       | `InertGasSuppression`                                                                                                          | singleton | `[SHIP_STATE]`                                      |
| `IShipSystem`        | `SHIP_SYSTEMS`, Safety's contribution                                     | `SafetyPhysics`                                                                                                                | singleton | `[DECK_PLAN, ATMOSPHERE_PROBE]`                     |
| `ICommandHandler`    | `COMMAND_HANDLERS`, Safety's contribution                                 | `SafetyCommands`                                                                                                               | singleton | `[BLAST_DOORS, FIRE_SUPPRESSION]`                   |
| `Interceptor`        | none; `bridgePlugins()` registers it                                      | `PressureInterlock`, at `@nexusdi/meridian-systems/interlock`                                                                  | singleton | `[SHIP_STATE, DECK_PLAN]`                           |
| `IAlarmSink`         | `ALARM_SINKS = new MultiToken<IAlarmSink>('AlarmSinks')`                  | `AuditAlarmSink`, in `bridge-api`'s `AlarmPanel`                                                                               | singleton | `[AUDIT_LOG]`                                       |
| `IMasterAlarm`       | `MASTER_ALARM = new Token<IMasterAlarm>('MasterAlarm')`                   | `MasterAlarm`                                                                                                                  | singleton | `[TICK_LOOP, all(ALARM_SINKS)]`                     |
| `ICommsArray`        | `COMMS_ARRAY = new Token<ICommsArray>('CommsArray')`                      | `PhasedArray`                                                                                                                  | singleton | `[SHIP_STATE, optional(SUBSPACE_LINK)]`             |
| `ISubspaceLink`      | `SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink')`                | `SubspaceRelay`, in `Comms` alone                                                                                              | singleton | `[COMMS_OPTIONS]`                                   |
| `INavCharts`         | `NAV_CHARTS = new Token<INavCharts>('NavCharts')`                         | `StarCharts.download(link)`, an async factory in `Tactical`, or `new StarCharts(BUNDLED_CHARTS)`, a value in `OfflineTactical` | singleton | `[SUBSPACE_LINK]` or none                           |
| `IShipSystem`        | `SHIP_SYSTEMS`, Comms' contribution                                       | `CommsPhysics`                                                                                                                 | singleton | `[COMMS_ARRAY]`                                     |
| `IPowerConsumer`     | `POWER_CONSUMERS`, Comms' contribution                                    | `CommsPower`                                                                                                                   | singleton | `[COMMS_ARRAY]`                                     |
| `ICommandHandler`    | `COMMAND_HANDLERS`, Comms' contribution                                   | `CommsCommands`                                                                                                                | singleton | `[COMMS_ARRAY]`                                     |
| `IMainDrive`         | `MAIN_DRIVE = new Token<IMainDrive>('MainDrive')`                         | `PlasmaDrive`                                                                                                                  | singleton | `[SHIP_STATE]`                                      |
| `IShipSystem`        | `SHIP_SYSTEMS`, Propulsion's contribution                                 | `PropulsionPhysics`                                                                                                            | singleton | `[MAIN_DRIVE]`                                      |
| `IPowerConsumer`     | `POWER_CONSUMERS`, Propulsion's contribution                              | `PropulsionPower`                                                                                                              | singleton | `[MAIN_DRIVE]`                                      |
| `IThrusters`         | `THRUSTERS = new Token<IThrusters>('Thrusters')`                          | `RcsThrusters`                                                                                                                 | singleton | `[SHIP_STATE]`                                      |
| `IHelm`              | `HELM = new Token<IHelm>('Helm')`                                         | `HelmControl`                                                                                                                  | singleton | `[THRUSTERS, MAIN_DRIVE, NAV_CHARTS]`               |
| `IShipSystem`        | `SHIP_SYSTEMS`, Helm's contribution                                       | `HelmPhysics`                                                                                                                  | singleton | `[THRUSTERS]`                                       |
| `IPowerConsumer`     | `POWER_CONSUMERS`, Helm's contribution                                    | `HelmPower`                                                                                                                    | singleton | `[THRUSTERS]`                                       |
| `ICommandHandler`    | `COMMAND_HANDLERS`, Helm's contribution                                   | `HelmCommands`                                                                                                                 | singleton | `[HELM]`                                            |
| `IFtlDrive`          | `FTL_DRIVE = new Token<IFtlDrive>('FtlDrive')`                            | `JumpDrive`                                                                                                                    | singleton | `[TICK_LOOP, SHIP_STATE, NAV_CHARTS, POWER_ROUTER]` |
| `IWeaponMount`       | `WEAPON_MOUNT = new Token<IWeaponMount>('WeaponMount')`                   | `RailgunMount`                                                                                                                 | singleton | `[SHIP_STATE, SIM_OPTIONS, lazy(POWER_ROUTER)]`     |
| `IShipSystem`        | `SHIP_SYSTEMS`, Weapons' contribution                                     | `WeaponsPhysics`                                                                                                               | singleton | `[WEAPON_MOUNT]`                                    |
| `IPowerConsumer`     | `POWER_CONSUMERS`, Weapons' contribution                                  | `WeaponsPower`                                                                                                                 | singleton | `[WEAPON_MOUNT, SIM_OPTIONS]`                       |
| `ICommandHandler`    | `COMMAND_HANDLERS`, Weapons' contribution                                 | `WeaponsCommands`                                                                                                              | singleton | `[WEAPON_MOUNT]`                                    |
| `ITelemetryFeed`     | `TELEMETRY = new Token<ITelemetryFeed>('TelemetryFeed')`                  | `SnapshotFeed`                                                                                                                 | singleton | `[TICK_LOOP, SHIP_STATE, DECK_PLAN]`                |
| `ITelemetryClient`   | `TELEMETRY_CLIENT = new Token<ITelemetryClient>('TelemetryClient')`       | `EventSourceTelemetry`                                                                                                         | singleton | none; the console's `TelemetryClient` module        |

`MeridianSystems` binds `TICK_LOOP` and `COMMAND_DESK`, and `Simulation` binds the clock,
the random source, the state and the deck plan (section 3.2). `Engineering` binds the
reactor, the coolant loop, the router and the grid, and contributes `EngineeringPhysics`
and `EngineeringCommands`. The interfaces and tokens of Engineering live in
`src/systems/engineering/contracts.ts`, and each class in its own file beside it.
`LifeSupport` binds the analyzer and the panel, and contributes `LifeSupportPhysics`,
`LifeSupportPower` and `LifeSupportCommands`. Its interfaces and tokens live in
`src/systems/life-support/contracts.ts` beside `LIFE_SUPPORT_ACTIONS`. From G3 it also
binds and exports `ATMOSPHERE_PROBE`, and `SafetyPhysics` reads the probe through the
global aggregate's re-export. `Safety` binds its two panels and the master alarm, and
contributes `SafetyPhysics` and `SafetyCommands`. Its interfaces and
tokens live in `src/systems/safety/contracts.ts` beside `SAFETY_ACTIONS`.
`Telemetry` binds `TELEMETRY`, and `SnapshotFeed` takes `SHIP_STATE` and `DECK_PLAN`
beside the loop, so a new sink reads the current snapshot at once and every frame carries
each compartment's pressure. `TELEMETRY_CLIENT` belongs to the bridge console, whose
server and client graphs both import `TelemetryClient` (section 7.2).
From G5 `Comms` binds `SUBSPACE_LINK` with `SubspaceRelay` beside the array's four
providers, `COMMS_ARRAY` and the contributions `CommsPhysics`, `CommsPower` and
`CommsCommands`, and `OfflineComms` binds the four alone. The two share one
`ARRAY_PROVIDERS` list and one `ARRAY_EXPORTS` list in
`src/systems/comms/comms.module.ts`. Comms' interfaces and tokens live in
`src/systems/comms/contracts.ts` beside `COMMS_ACTIONS`, and Tactical's in
`src/systems/tactical/contracts.ts`. `Tactical` imports nothing and reads the link through
the global aggregate's re-export of the `Comms` instance.
From G6 `Propulsion` binds `MAIN_DRIVE` and contributes `PropulsionPhysics` and
`PropulsionPower`, and `Helm` binds `THRUSTERS` and `HELM` and contributes `HelmPhysics`,
`HelmPower` and `HelmCommands`. Their interfaces and tokens live in
`src/systems/propulsion/contracts.ts` and in `src/systems/helm/contracts.ts` beside
`HELM_ACTIONS`. The ratings, the loads, the records and the pure steps live in
`src/physics/motion.ts`.
From G7 `FtlDrive` binds `FTL_DRIVE` alone. `JumpDrive` builds `FtlPhysics` and `FtlPower`
with its rating, and neither is a provider: a `SHIP_SYSTEMS` or `POWER_CONSUMERS` entry in
a loaded module would reach no singleton built before it, and a reader would take it for a
working contribution. The interface and the token live in `src/systems/ftl/contracts.ts`
beside `FTL_ACTIONS`. The rating, the load, the record and the pure step live in
`src/physics/ftl.ts`.
From G8 `Weapons` binds `WEAPON_MOUNT` with `RailgunMount` and contributes `WeaponsPhysics`,
`WeaponsPower` and `WeaponsCommands`. The interface and the token live in
`src/systems/weapons/contracts.ts` beside `WEAPONS_ACTIONS`. The rating, the load, the
records and the pure step live in `src/physics/weapons.ts`. `RailgunMount` reads the router
through `lazy(POWER_ROUTER)`, since the router reads the mount's load through
`POWER_CONSUMERS`. A direct `POWER_ROUTER` dep fails the build with
`NEXUS_BLUEPRINT_INVALID` and `NEXUS_CIRCULAR_DEPENDENCY` on
`["PowerRouter","PowerConsumers","WeaponMount","PowerRouter"]`. The mount's constructor
never calls the thunk. The mount and `WeaponsPower` read `SIM_OPTIONS` through the global
`Simulation`. The hit draw runs in the phase-3 step on `TickContext.rng`, so the mount takes
no `RNG`. `WeaponsPhysics` and `WeaponsPower` read the rating through `WEAPON_MOUNT`, so a
test that binds a mount with another rating changes the step and the load together.

`ITickLoop` has two members: `advance(ticks)` and `listen(listener: TickListener)`, with
`type TickListener = (ship: ShipSnapshot) => void`. `listen` returns a function that
unsubscribes the listener and runs twice safely. `FixedStepLoop` keeps one entry per call,
so one function listened twice hears each tick twice. `readShip(ship, deck)` returns a
`ShipReading`: `ShipSnapshot` with each compartment a `CompartmentReading`, the
`CompartmentState` plus its `pressure` in pascals from `pressure()` in `physics/gas.ts`
over the moles of every gas, the temperature and the deck volume. It rounds the result
through the same `roundJson` that `roundSnapshot` uses, so the rounding sits in one place.
`ShipSnapshot` keeps no pressure, and the golden stays on the rounded snapshot.

From G7 `ITickLoop` gains `attach(system)` and `IPowerRouter` gains `attach(consumer)`.
Each returns a function that removes the entry and runs twice safely, as `listen` returns
its unsubscribe. The loop's attach sorts by phase and name and forks the random source by
the system's name (S5). It throws "Two ship systems are named 'FtlDrive'." for a name the
loop runs. A system attached during a tick first steps on the next one, since `advance()`
walks the entries the tick started with. The router's attach lists the consumer after the
`POWER_CONSUMERS` entries in `loads(ship)`.

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
`CompartmentReading`, `TickListener`, `SimOptions` and `LifeSupportOptions`, from G5
`MeridianSystemsOptions`, `CommsRecord`, `CommsSetpoints`, `CommsMessage` and `Course`, and
from G6 `DriveRecord`, `DriveSetpoints`, `HelmRecord` and `HelmSetpoints`, from G7
`FtlRecord`, `FtlSetpoints` and `FtlRating`, and from G8 `WeaponsRecord`,
`WeaponsSetpoints`, `RailgunShot` and `RailgunRating`.

Options tokens, each the value of a configurable module: `SIM_OPTIONS` (`SimOptions`:
`seed`, `dt`) and `LIFE_SUPPORT_OPTIONS` (`LifeSupportOptions`: `calibration`, the
analyzers' `SensorCalibration`, and `ratings`, the `LifeSupportRatings` of the heaters,
scrubbers, electrolysers, pump and vent). `readCalibration(deck)`
(`src/systems/life-support/read-calibration.ts`) is the factory of `forRootAsync`. It is
`async` with nothing to await, since the calibration file is a static import, and its
docblock says that a ship that reads a device awaits it there. It throws a plain `Error`
when a deck compartment has no calibration entry, and returns
`{ calibration, ratings: LIFE_SUPPORT_RATINGS }`. From G5 `COMMS_OPTIONS` (`CommsOptions`:
`frequency`, `transport` `'relay'`, `relayUrl` and the optional `relayTimeout` in ms) is the
value of `Comms.forRoot`, and the aggregate passes frequency 1420 and the `relayTimeout` of
`meridianSystems`. `Comms` carries a schema (`COMMS_OPTIONS_SCHEMA`), as `Simulation` does,
that accepts an unset `relayTimeout` or a whole number of ms from 1 to 2,147,483,647 (the
longest delay a Node timer holds), and refuses NaN, a negative, zero, a fraction, Infinity
and a larger value with `NEXUS_INVALID_MODULE_OPTIONS`.

`GasAnalyzer` samples its compartment in its constructor, and `read()` answers that
sample, so the transient lifetime matters: two `get()` calls around an `advance(1)` read
two ticks, and a second `read()` of one analyzer repeats. Its arithmetic is the pure
`readAtmosphere(air, plan, compartment, tick, calibration, draw)` in
`src/physics/atmosphere.ts`, with `draw` the `next` of
``rng.fork(`AtmosphereSensor:${compartment}:${tick}`)``. It draws the temperature, the
pressure and then each gas in `GASES` order, and each value is
`max(0, true + (2u − 1) · noise)`, rounded to its resolution through `toFixed`. The floor
keeps a vented airlock's reading at 0 or above. An `AtmosphereReading` is
`{ compartment, tick, temperature, pressure, partial }` in K and Pa. The calibration file
is
`{ resolution: { temperature: 0.01, pressure: 1 }, compartments: { <id>: { noise: { temperature: 0.05, pressure: 20, partial: 5 } } } }`.

From G3 the analyzer reads through the singleton `ATMOSPHERE_PROBE`, which the tick reads
too (section 5.11). `IAtmosphereProbe` has one member,
`read(compartment, air, tick): AtmosphereReading<CompartmentId>`, and `CalibratedProbe`
(`src/systems/life-support/calibrated-probe.ts`) runs `readAtmosphere` with the fork
above. `GasAnalyzer` samples
`probe.read(compartment, ship.compartments[compartment], ship.tick)`, so its readings stay
bit-identical to G2's.

A controller class (`EnvironmentalController`, `BlastDoorControl` and the rest) holds no
physics. Its methods check the command against the current snapshot and queue a setpoint
on `SHIP_STATE`. `IAtmosphereControl` has `online()`,
`heater(compartment, { on?, target? })`, `scrubber(compartment, on)`,
`oxygen(compartment, on)`, `vent(compartment, open)` and `pump(compartment, mode)`, each
returning `QueuedCommand`. Each device method checks `Object.hasOwn` on that device's
setpoint record and throws `BadCommandError` (`reason: 'argument'`,
`system: 'life-support'`, `expected: LIFE_SUPPORT_ACTIONS`) when the compartment has no
such device.

`LifeSupportCommands` serves `life-support`. `online` takes no argument; `heater` takes a
string `compartment` and at least one of a boolean `on` and a finite `target` from 283 K
to 303 K; `scrubber` and `oxygen` take a `compartment` and a boolean `on`; `vent` takes a
`compartment` and a boolean `open`; `pump` takes a `compartment` and a `mode` of `off`,
`evacuate` or `fill`. `LIFE_SUPPORT_ACTIONS` reads "online with no arguments, heater with
a compartment and on true or false or a target from 283 to 303 K, scrubber and oxygen with
a compartment and on true or false, vent with a compartment and open true or false, and
pump with a compartment and mode off, evacuate or fill". The physics reads the setpoints
in the next tick. So the interceptors of section 6.1 wrap a method that does one visible
thing, and the reader sees the interlock apart from the physics.

From G3 `IBlastDoors` has `open(door)` and `close(door)`, and `IFireSuppression` has
`flood(compartment)` and `drill(compartment)`, each taking a string and returning
`QueuedCommand`. Each checks `Object.hasOwn` on the setpoint record it writes and throws `BadCommandError` (`reason: 'argument'`, `system: 'safety'`,
`expected: SAFETY_ACTIONS`) for a door the deck lacks or a compartment with no flood
charge. `open` and `close` queue `{ safety: { doors: { [door]: true } } }` or `false`.
`flood` and `drill` queue `true` under `floods` or `drills`:
`{ safety: { floods: { [compartment]: true } } }`. A command for the state a door already
holds queues and changes nothing, and `open` of an open door still passes the interlock.

`SafetyCommands` serves `safety`: `open` and `close` take a string `door`, and `flood` and
`drill` a string `compartment`. A missing or non-string argument answers reason `argument`
before the panel runs, so the interlock reads a string, and any other action answers
reason `action`. `SAFETY_ACTIONS` reads "open and close with a door of bridge-habitat,
habitat-reactor-bay, habitat-airlock or airlock-outer, and flood and drill with a
compartment of bridge, habitat or reactor-bay". The desk's list of the systems it serves
reads "engineering, life-support and safety", from G5 "comms, engineering, life-support and
safety", from G6 "comms, engineering, helm, life-support and safety", and from G8 "comms,
engineering, helm, life-support, safety and weapons".

From G5 `ICommsArray` has `readonly linked: boolean`, true when the ship's graph binds
`SUBSPACE_LINK`, and `hail(): QueuedCommand`. `PhasedArray` reads `linked` from its
optional link at construction, and `hail()` queues `{ comms: { hail: true } }`; the array
sends it on the first tick it has the link and the power and no reply outstanding. Its
docblock says the simulation models the array's traffic and reads the link's presence
alone. `CommsCommands` serves `comms` with `hail`, which takes no argument, so the handler
ignores every other field, and any other action answers reason `action`. `COMMS_ACTIONS`
reads "hail with no arguments", and `comms send` answers "comms has no action 'send'. It
takes hail with no arguments." `ISubspaceLink` has one member, `receive<T>(channel)`.
`SubspaceRelay` resolves the channel against `relayUrl`, with or without its trailing
slash, and asks for it on `frequency` through one `fetch`, so `charts` reads
`https://relay.test/charts?frequency=1420` for `relayUrl: 'https://relay.test'`. A reply
outside 200 to 299 throws `relay answered <status> for <channel>`, such as
`relay answered 503 for charts`. The request carries `AbortSignal.timeout(relayTimeout)`,
5000 ms when `CommsOptions.relayTimeout` is unset, and a relay that stays silent past it
makes the link throw `RelayError` with reason `timeout`. `StarCharts.download(link)` asks
the link for `charts`, checks the answer, and plots over the table it gets. The check
throws `RelayError` with reason `malformed` for anything but a plain JSON object whose
every value is a finite number and whose names `Object.prototype` does not hold. Both
errors stop `Nexus.create`, which reports them as the `cause` of `NEXUS_PROVIDER_FAILED`.

From G6 `IMainDrive` has `readonly rating: DriveRating` and `throttle(level)`, which
queues `{ drive: { throttle: level } }`. `IThrusters` has
`readonly rating: ThrusterRating` and `steer(heading)`, which queues
`{ helm: { heading: wrap(heading) } }` and throws `RangeError` "steer() takes a finite
heading in rad, and got NaN." for a heading that is not finite, as `advance()` guards its
ticks. `HelmPhysics` and `HelmPower` read the thrusters' rating through `THRUSTERS`, and
`PropulsionPhysics` and `PropulsionPower` the drive's through `MAIN_DRIVE`, as
`EngineeringPhysics` reads the reactor's, so a test swaps a rating behind the token.
`INavCharts` gains `has(to)`, true when the charts hold a heading for `to`. One predicate,
`Object.hasOwn(headings, to) && Number.isFinite(headings[to])`, serves `has` and `plot`,
so a key of `Object.prototype` is no star, and an entry of the downloaded table that is
not a finite number reads as uncharted. `plot(to)` keeps heading 0 for a star the charts
do not hold. `IHelm` has `course(to)`, which plots the star on `NAV_CHARTS` at the command
and steers `toRadians(heading)`, and `burn(level)`, which throttles the main drive. A plot
in the tick would call `NavAudit` on every tick and fill `AUDIT_LOG`. `HelmCommands`
serves `helm`: `course` takes a string `to`, and `burn` a finite `level` from 0 to 1,
which the handler reads through `levelArgument` in `src/simulation/command-arguments.ts`,
as `EngineeringCommands` reads its throttle. `HELM_ACTIONS` reads "course with a charted
star to steer for and burn with a level from 0 to 1". `helm warp` answers "helm has no
action 'warp'. It takes course with a charted star to steer for and burn with a level from
0 to 1." with the fix "send one of the actions above with its arguments.", and a `burn`
with no `level` from 0 to 1 or a `course` with no string `to` answers "helm burn got an
argument it cannot use. It takes …" or "helm course got …" with the fix "send the
arguments in the ranges above." `HelmControl.course(to)` checks `has(to)` before it plots,
and a star the charts do not hold answers "helm course got an argument it cannot use. It
takes course with a charted star to steer for and burn with a level from 0 to 1." with the
same fix, as `EnvironmentalController` refuses a device a compartment lacks. `Propulsion`
binds no command handler, so the crew steers and burns through `helm`.

From G7 `IFtlDrive` has `readonly rating: FtlRating`, `spool()` and `jump(to)`, and both
commands return `QueuedCommand`. `spool()` asks `POWER_ROUTER.divert()` for
`{ id: 'ftl-spool', priority: 7, demand: 900e6, heatShare: 0.1 }` and queues
`{ ftl: { armed: true } }`. A spool the router cannot fit throws `PowerBudgetError` and
queues nothing: at tick 0 it answers "The ftl-spool load needs 900 MW, and the router has
0 MW free beside the loads above it." On an armed drive `spool()` asks no `divert` and
queues nothing. It answers `{ tick: t + 1 }`, the tick from which the drive is still armed.
`jump(to)` checks `NAV_CHARTS.has(to)` before it reads the charge, and refuses a star the
charts do not hold through `commandRefusal('ftl', FTL_ACTIONS)`, a `BadCommandError` with
reason `argument`: "ftl jump got an argument it cannot use. It takes spool with no
arguments and jump with a charted star to jump to." with the fix "send the arguments in the
ranges above." `constructor` and `__proto__` answer the same refusal through `has`. Below a
full charge `jump(to)` throws `FtlNotSpooledError` with the `charge` and the `energy`
("The FTL drive holds 22.5 GJ of the 90 GJ a jump needs."), and on a full charge it queues
`{ ftl: { jump: to } }`. `FTL_ACTIONS` reads "spool with no arguments and jump with a
charted star to jump to". `Sol` is the home sector, and a jump to the sector the ship holds
is allowed. The FTL commands take their own routes (section 7.1), so `FtlDrive` binds no
command handler, and the desk's list stays "comms, engineering, helm, life-support and
safety". The desk's `all(COMMAND_HANDLERS)` is also the list at its construction. G7 adds
no stand-down command.

From G8 `IWeaponMount` has `readonly rating: RailgunRating` and `fire(range)`, which
returns `QueuedCommand`. `fire(range)` throws `RangeError` "fire() takes a range from 0 to
100000 m, and got -1." for a range outside 0 to 100,000 m or NaN, so a caller that skips
the desk queues nothing. On an unarmed mount it asks `POWER_ROUTER.divert()` for
`{ id: 'railgun', priority: 6, demand, heatShare: 0 }`. The `demand` is the load the next
tick asks once the mount is armed,
`railgunDemand(ship.weapons, { ...ship.setpoints.weapons, armed: true }, rating, dt)`:
300 MW at dt 0.5 and 200 MW at dt 2. A fire the router cannot fit throws
`PowerBudgetError` and queues nothing: at tick 0 it answers "The railgun load needs
300 MW, and the router has 0 MW free beside the loads above it." The first fire queues
`{ weapons: { armed: true, range } }`, and the mount stays armed from then on. On an armed
mount `fire(range)` asks no `divert` and queues `{ weapons: { range } }`, since a second
router check would refuse a shot on a tick the router sheds the capacitor. A fire on an
uncharged capacitor answers `{ tick: t + 1 }`, and the shot leaves on the first tick the
capacitor holds 300 MJ. A later fire before the shot replaces the waiting range.

`WeaponsCommands` serves `weapons` with `fire`. It reads `range` through
`numberArgument(command, 'range', 0, rating.range, refuse)` in
`src/simulation/command-arguments.ts`, which takes the bounds with both ends allowed, and
`levelArgument` calls `numberArgument` with 0 and 1. A range that is no number from 0 to
100,000, such as `'10000'`, `NaN`, `null` or a missing one, answers reason `argument`, and
any other action answers reason `action`, each with `expected: WEAPONS_ACTIONS`.
`WEAPONS_ACTIONS` reads "fire with a range from 0 to 100,000 m", so `weapons reload`
answers "weapons has no action 'reload'. It takes fire with a range from 0 to 100,000 m."
and a bad range "weapons fire got an argument it cannot use. It takes fire with a range
from 0 to 100,000 m." G8 adds no stand-down command, as G7 adds none.

Engineering's physics class, `EngineeringPhysics`, takes `REACTOR`, `COOLANT_LOOP` and
`POWER_ROUTER` (`static deps = [REACTOR, COOLANT_LOOP, POWER_ROUTER] as const`). It reads the ratings
and the loads through them, and its `REACTOR` edge orders the scram. The tick loop takes
`all(SHIP_SYSTEMS)`, so the container builds the reactor before the loop, and the loop
before the feed, the master alarm and the driver that take it. Disposal runs in reverse
creation order, so that edge is what puts the reactor scram after every consumer on
shutdown.

`FusionReactor` keeps the §7.1 role and its `output` member. In the simulation `output` is
the electric output in W. The docs regions bind their own class with no deps, and its
`output` stays in GW. The simulation binds its class with `[SHIP_STATE]`. Each is one program, so each binds the class once (docs §7.3, rule 2).
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
    provide(ATMOSPHERE_PROBE, { useClass: CalibratedProbe }),
    // Transient: each get() samples the scope's compartment at the current tick.
    provide(ATMOSPHERE_SENSOR, {
      useClass: GasAnalyzer,
      lifetime: 'transient',
    }),
    provide(ATMOSPHERE_CONTROL, { useClass: EnvironmentalController }),
    provide(SHIP_SYSTEMS, { useClass: LifeSupportPhysics }),
    provide(POWER_CONSUMERS, { useClass: LifeSupportPower }),
    provide(COMMAND_HANDLERS, { useClass: LifeSupportCommands }),
  ],
  exports: [
    ATMOSPHERE_PROBE,
    ATMOSPHERE_SENSOR,
    ATMOSPHERE_CONTROL,
    SHIP_SYSTEMS,
    POWER_CONSUMERS,
    COMMAND_HANDLERS,
  ],
});

// examples/meridian-systems/src/systems/life-support/life-support-physics.ts
export class LifeSupportPhysics implements IShipSystem {
  static deps = [LIFE_SUPPORT_OPTIONS, DECK_PLAN] as const;
  static readonly phase: Phase = 4;
  readonly name = 'LifeSupport';
  readonly phase = LifeSupportPhysics.phase;
  constructor(
    private readonly options: LifeSupportOptions,
    private readonly deck: DeckPlan,
  ) {}
  step(ship: ShipSnapshot, { dt }: TickContext): ShipSnapshot {
    const setpoints = ship.setpoints.lifeSupport;
    if (!setpoints.online) return ship;
    const result = stepAtmosphere({
      compartments: ship.compartments,
      rooms: this.deck.compartments,
      setpoints,
      coolantTemperature: ship.coolant.temperature,
      shed: ship.power.shed.includes(LIFE_SUPPORT_LOAD.id),
      dt,
      ratings: this.options.ratings,
    }); // src/physics/atmosphere.ts
    return Object.freeze({
      ...ship,
      compartments: result.compartments,
      lifeSupport: result.lifeSupport,
    });
  }
}
```

The module file holds tokens, providers and imports, and the physics class one
delegation. `stepAtmosphere` lives in `src/physics/` with its own unit tests (section
8.1). The class's comment states that no phase 2 or 3 system changes the compartments in
G2, so the devices draw what the router allocated in phase 1.

## 4. The simulation kernel

### 4.1 The snapshot

`ShipSnapshot` is a plain frozen object: the tick number, one record per compartment
(moles per gas and temperature), the reactor, coolant, power, life-support, comms, weapons,
drive, helm, FTL and safety records, and the setpoints. A step
returns a new snapshot and shares the records it left alone. `SHIP_STATE.snapshot()`
returns the current one. The telemetry feed and `bridge-api`'s `/sim` routes send
`readShip(snapshot, deck)`, the snapshot with each compartment's pressure and every
number rounded to eight significant digits (issue 191). The golden rounds to four with
`roundSnapshot`. A console gauge rounds the eight-digit reading once to its own decimals,
so 2.0652 m/s reads `2.07 m/s`. Four digits send 2.065, and a two-decimal gauge prints
2.06.

From G3 the safety record, `safety: SafetyRecord<CompartmentId>`, holds each
compartment's fire intensity in `fires` (0 for no fire) and the moles of N₂ each running
flood has released in `flooded`. Its `alarms` list the active alarms. An `Alarm` is `{ code, subject }`, with
the compartment, or for an engineering alarm the shed load's id or `reactor`, as its
subject. `setpoints.safety`
(`SafetySetpoints<CompartmentId, DoorId>`) holds `doors`, true while a door stands open.
For each room with a flood charge it holds `floods`, true while the valve releases, and
`drills`. `ShipStateStore` starts every door shut, every valve and drill false, every fire
and flood count at 0, and no alarm. `src/simulation/contracts.ts` holds `DOOR_IDS`, the
four doors of section 5.1, and `DoorId`. `CompartmentState` keeps its shape.

From G5 the comms record, `comms: CommsRecord`, holds the array's `status` (`standby`,
`no subspace link`, `no power` or `awaiting reply`) and the tick of its last hail in
`sent` (null before the first). Its `messages` hold the newest 10, oldest first. A
`CommsMessage` is `{ tick, from, text }`. `setpoints.comms` (`CommsSetpoints`) holds
`hail`, true while a hail waits. Both sit after `lifeSupport` in the type and in
`ShipStateStore`'s initial snapshot, which starts them at
`{ status: 'standby', sent: null, messages: [] }` and `{ hail: false }`. The store freezes
both at every level.

From G6 the drive record, `drive: DriveRecord`, holds the `thrust` in N and the `massFlow`
in kg/s, and along the ship's track the `acceleration` in m/s², the `velocity` in m/s and
the `distance` since tick 0 in m. The helm record, `helm: HelmRecord`, holds the
`attitude` in rad in (−π, π], the `rate` in rad/s and the `torque` the thrusters applied in
the tick in N·m. `setpoints.drive` (`DriveSetpoints`) holds `throttle`, 0 to 1, and
`setpoints.helm` (`HelmSetpoints`) holds `heading`, the course in rad in (−π, π]. The two
records sit after `comms` in the type and in `ShipStateStore`'s initial snapshot, and the
two setpoints after `setpoints.comms`. The store starts every field at 0 and freezes the
four at every level.

From G7 the FTL record, `ftl: FtlRecord`, holds the `status` (`offline` until the drive's
first step, then `idle`, `held`, `spooling` or `charged`), the `charge` in J, the `sector`
(`Sol` at tick 0) and the tick of the last jump in `jumped` (null before the first).
`setpoints.ftl` holds `armed` and `jump`, the star of a commanded jump or null. Both sit
after `helm`, and the store freezes both. `ShipStateStore` starts them at
`{ status: 'offline', charge: 0, sector: 'Sol', jumped: null }` and
`{ armed: false, jump: null }`. `offline` says no drive is loaded. The drive's step derives
the status on every tick, so the first step after the load writes `idle` (or `held` or
`spooling` on an armed tick) as a new object, and no step writes `offline`. `idle` is
unarmed below a full charge, `held` armed with no power on the tick, `spooling` armed and
charging, and `charged` a full charge. The setpoints start at tick 0, since `queue()`
merges a change over them.

From G8 the weapons record, `weapons: WeaponsRecord`, holds the `status` (`idle`, `held`,
`charging` or `charged`), the capacitor's `charge` in J, the `shots` fired since tick 0,
the `hits` among them and the newest shot in `lastShot`, a `RailgunShot`
`{ tick, range, hit }` with the range in m, or null before the first. `setpoints.weapons`
holds `armed`, true from the first fire, and `range`, the range in m of the shot that
waits for the charge, or null. Both sit directly after `comms`, and the store freezes both
at every level. `ShipStateStore` starts them at
`{ status: 'idle', charge: 0, shots: 0, hits: 0, lastShot: null }` and
`{ armed: false, range: null }`. `Weapons` is a static module, so the record has no
`offline` status. `idle` is unarmed below a full bank, `held` armed below a full bank on a
tick the router shed the capacitor, `charging` armed below a full bank, and `charged` a
full bank. At dt 0.5 the charge moves in steps of 50,000,000 J, and the record keeps no hit
chance, since `Math.exp` is not fixed bit for bit across engines (section 8.3).

The snapshot's keys then read `tick`, `time`, `compartments`, `reactor`, `coolant`,
`power`, `lifeSupport`, `comms`, `weapons`, `drive`, `helm`, `ftl`, `safety` and
`setpoints`, and the setpoints' read `reactor`, `shields`, `lifeSupport`, `comms`,
`weapons`, `drive`, `helm`, `ftl` and `safety`. That order keeps every earlier assertion on
a key position as committed, and `/sim`, the frames and the goldens read keys by name.

### 4.2 The tick

`FixedStepLoop.advance(ticks)` runs this for each tick, with `dt` from `SIM_OPTIONS`
(0.5 s of ship time):

1. Apply the queued commands to the setpoints. Changes queued between two ticks apply
   together at the next tick, and the log keeps one entry per tick.
   `SHIP_STATE.queue(change)` merges a `SetpointChange` over the one pending change,
   the later value winning, and answers `{ tick }`, the tick that applies it. From G2,
   `SetpointChange` is `DeepPartial<Setpoints>`, and one recursive `mergeFrozen(base,
change)` merges plain objects key by key at every level: it skips undefined, replaces
   primitives and arrays, and freezes every level of the result. A throttle change and a
   shields change queued in one tick both apply, and of two throttle changes the later
   applies. A habitat heater target of 295 K and a habitat heater `on: false` queued in
   one tick apply as `{ on: false, target: 295 }`, and the bridge heater stays as it was. The loop calls
   `SHIP_STATE.applyQueued(tick)`, which merges the pending change over the setpoints,
   logs it as one `{ tick, change }`, commits the result and returns the snapshot the
   systems step on. `log()` keeps the newest 1,000 entries, one per tick that applied a
   change. A refused command throws before the queue, so the log never holds it.
2. Run every `IShipSystem` in ascending `phase`, each on the snapshot the previous one
   returned. The phases:

   | Phase | System                | What it computes                                                                    |
   | ----- | --------------------- | ----------------------------------------------------------------------------------- |
   | 1     | `Engineering`         | reactor ramp, electric output, the power allocation, coolant heat                   |
   | 2     | `Propulsion`, `Helm`  | the helm's attitude and rate, and the drive's thrust and the motion along the track |
   | 3     | `Weapons`, `FtlDrive` | capacitor charge and shots (G8); the spool and the jump (G7)                        |
   | 4     | `LifeSupport`         | metabolism, scrubbers, oxygen, heaters, hull loss, vents, pumps                     |
   | 5     | `Safety`              | doors, fire, suppression, door auto-close, alarm evaluation                         |
   | 6     | `Comms`               | the queued hail and the relay's reply                                               |

   Systems that share a phase run in the order of their `name` and read each other's
   records from `start`, so the order changes no figure. From G6 `Propulsion` reads the
   helm's attitude at the start of the tick. The loop sorts once, at
   construction and on `attach()`, so the order never depends on `all()`'s
   registration order. From G8 `FtlDrive` and `Weapons` both add a pulse to the coolant
   in phase 3. On a tick with a jump and a shot `FtlDrive` sorts first, so the two pulses
   add in one fixed order.

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

From G3 each step's `TickContext` carries `start`, the snapshot `applyQueued` returned for
the tick before any system stepped, and `FixedStepLoop` passes it. `Safety` reads the
start-of-tick air and the alarms of the tick before from it (section 5.11).

A module that `load()` adds after startup cannot join `all(SHIP_SYSTEMS)`, because the
loop resolved that list when it was built, and the router resolved `all(POWER_CONSUMERS)`
the same way. From G7 `JumpDrive.onInit()` calls `TICK_LOOP.attach(new FtlPhysics(rating))`
and `POWER_ROUTER.attach(new FtlPower(rating))`, and its disposer calls both detaches. Root
disposal runs newest first, so the drive detaches before the driver and the loop stop.
`FtlDrive` contributes no `SHIP_SYSTEMS` entry, and the root's `get(SHIP_SYSTEMS)` lists
none after the load. Section 6.3 shows why this is the honest DI lesson: a singleton's
`all()` is the list at its construction.

Power allocation in phase 1 reads the demands the setpoints held at the start of the
tick, so a consumer switched on in tick k draws power from tick k + 1. From G6 the
thrusters' demand also reads the helm record at the start of the tick. Phase 1 leaves the
helm alone, so the router prices the torque phase 2 applies.

### 4.3 Randomness

`SeededRandom` is splitmix32 over 32-bit integer arithmetic (`Math.imul`, `>>>`), which
gives the same sequence on every JavaScript engine. `next()` returns the next `uint32`
divided by 2³². `fork(label)` returns a new source seeded with FNV-1a of
`${seed}:${label}`. The loop hands each system `rng.fork(system.name)` once, so the
numbers the fire model draws stay the same when a weapons system joins the ship (S5).
From G8 `WeaponsPhysics` draws each hit from `TickContext.rng`, the loop's
`fork('Weapons')`, and draws only on a shot tick, so shot n reads the nth number of that
stream. Seed 7 gives 0.5776788084767759, 0.8633130805101246 and 0.5764941128436476 there,
and `fork('Safety')` reads the same stream with and without `fork('Weapons')` drawn first.

No file under `examples/meridian-systems/src` reads the wall clock or an unseeded
random source. The library's ESLint config enforces this on the syntax tree, so
`nx lint` fails on an alias or a destructure as well as a direct call. A file under `src`
imports relative paths and `@nexusdi/core` alone, which refuses `node:crypto` and
`node:perf_hooks`. From G3 `src/systems/safety/pressure-interlock.ts` alone also imports
`@nexusdi/interceptors`, types only (section 6.1). A file under `src` names none of
`Date`, `performance`, `Temporal`, `process`, `crypto`, `scheduler`, `Intl`, `eval`,
`Function`, the timers, the GC hooks, `Atomics`, `Bun`, `Deno` or
the global object. It reads `Math` only as `Math.name`, and never `Math.random`, so
`const M = Math` and `Reflect.get(Math, 'random')` fail too. From G5
`src/systems/comms/subspace-relay.ts` alone calls `fetch`, and the library's ESLint config
refuses `fetch` in every other file under `src`. The relay runs in `NAV_CHARTS`'s factory
at startup, and no tick reads the link. The refusal reads "A tick does no I/O, so
src/systems/comms/subspace-relay.ts alone calls fetch.", and the relay file's own block
keeps every other host global refused. From G6 both blocks also refuse `WebSocket`,
`XMLHttpRequest`, `EventSource`, `navigator`, `WebTransport`, `importScripts`, `Worker` and
`WebSocketStream`, each with "A tick does no I/O, so src/systems/comms/subspace-relay.ts
alone reaches the network, through fetch.", so the relay reaches the network through
`fetch` alone. The rule refuses the whole `navigator` global, since a rule on
`navigator.sendBeacon` misses `const n = navigator` and `const { sendBeacon } = navigator`.
`Bun` and `Deno` join the host globals in G6, since `bridge-api`'s runtime legs run the
library on both. `Bun.nanoseconds()` reads the clock and `Deno.connect()` the network. A
repo-check test pins those rules and lints one case per bypass (section 8.1).

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
| `κ`      | 0.02 s/m                                                       | the door and vent exchange constant    |

The deck plan holds four compartments and four doors (section 16.2 plans the full deck of
fourteen compartments and sixteen doors):

| Compartment   | Volume | Hull conductance `G` | Structure heat capacity | Occupants |
| ------------- | ------ | -------------------- | ----------------------- | --------- |
| `bridge`      | 60 m³  | 90 W/K               | 2.0 MJ/K                | 2         |
| `habitat`     | 120 m³ | 150 W/K              | 4.0 MJ/K                | 4         |
| `reactor-bay` | 80 m³  | 110 W/K              | 6.0 MJ/K                | 0         |
| `airlock`     | 12 m³  | 30 W/K               | 0.5 MJ/K                | 0         |

Doors: `bridge-habitat` (1.5 m²), `habitat-reactor-bay` (1.5 m²), `habitat-airlock`
(1.2 m²) and `airlock-outer` (1.2 m², to space). Each compartment starts at 293 K and
101.3 kPa: 21 % O₂, 78 % N₂, 0.04 % CO₂, 0.9 % H₂O, the rest volatiles. From G3
`ShipStateStore` throws a plain `Error` for a deck door that is unknown, a door listed twice, a
`DOOR_IDS` entry the deck lacks, and a `between` that does not hold two distinct sides,
each a compartment id or `space`.

From G2 a compartment's plan has three optional fields: `equipment`, entries of
`LIFE_SUPPORT_DEVICES = ['heater', 'scrubber', 'oxygen', 'vent', 'pump']`;
`pumpReservoir`, the compartment its pump fills from and empties into; and
`coolantConductance` in W/K (section 5.2). The `bridge` and the `habitat` list
`["heater", "scrubber", "oxygen"]`, the `reactor-bay` has `"coolantConductance": 2`, and
the `airlock` lists `["vent", "pump"]` with `"pumpReservoir": "habitat"`. `ShipStateStore`
throws a plain `Error`, as it does for ids, for an unknown or repeated device, a pump with
no reservoir or a reservoir with no pump, and a reservoir that is unknown or the pump's
own compartment.

`Setpoints` gains `lifeSupport` in G2, with one key for each compartment whose plan lists
the device:

```ts
export type PumpMode = 'off' | 'evacuate' | 'fill';
readonly lifeSupport: {
  readonly online: boolean;
  readonly heaters: Readonly<Partial<Record<CompartmentId, { readonly on: boolean; readonly target: number }>>>;
  readonly scrubbers: Readonly<Partial<Record<CompartmentId, boolean>>>;
  readonly oxygen: Readonly<Partial<Record<CompartmentId, boolean>>>;
  /** True while the vent to space is open. */
  readonly vents: Readonly<Partial<Record<CompartmentId, boolean>>>;
  readonly pumps: Readonly<Partial<Record<CompartmentId, PumpMode>>>;
};
```

At tick 0 life support is offline, the heaters are on at 293 K, the scrubbers and the
generators are on, `vents.airlock` is false and `pumps.airlock` is `'off'`. `evacuate`
moves the compartment's gas into its reservoir, and `fill` moves reservoir gas into the
compartment. `ShipSnapshot` gains the record `lifeSupport: { heaters }`, the power each
heater put into its room on the tick in W, 0 at start. `CompartmentState` keeps its
shape, and the pressures and `power.loads` show the pump and the vent.

The ratings sit in `src/physics/atmosphere.ts`, gathered in `LIFE_SUPPORT_RATINGS`:

| Constant          | Fields                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `ELECTRIC_HEATER` | `gain` 10,000 W/K, `max` 10,000 W                                                          |
| `CO2_SCRUBBER`    | `flow` 0.05 m³/s, `power` 1,200 W, `humidity` 0.4                                          |
| `ELECTROLYSER`    | `gain` 2 × 10⁻⁵ mol/(s·Pa), `max` 0.01 mol/s, `energy` 600,000 J/mol, `setpoint` 21,000 Pa |
| `TRANSFER_PUMP`   | `rate` 0.2 m³/s, `base` 400 W, `efficiency` 0.6, `maxRise` 101,300 Pa                      |
| `SPACE_VENT`      | `area` 0.01 m²                                                                             |

`src/physics/constants.ts` holds `KAPPA` and `CV` beside `R`.

### 5.2 Pressure and temperature per compartment

A compartment holds `n_g` moles of each gas `g`, at temperature `T`, in volume `V`. The
ideal-gas approximation gives

```text
P   = (Σ_g n_g) · R · T / V
p_g = n_g · R · T / V                      partial pressure of gas g
C   = C_struct + Σ_g n_g · c_v,g           heat capacity, J/K
```

The air holds 2.5 % of the heat capacity in the bridge and the habitat, 1.1 % in the
reactor bay and 2.0 % in the airlock, so the structure damps the temperature and a heater
changes it over minutes. The habitat's `C` at the initial air is 4,104,250 J/K.

Life support starts offline. While `setpoints.lifeSupport.online` is false,
`LifeSupportPhysics.step` returns the ship unchanged, so no gas, heat, vent or pump term
runs and the deck holds its initial air. The action `online` takes no argument and
queues `{ lifeSupport: { online: true } }`. G2 has no action that sets it back, since no
ship can stop metabolism and hull loss. Device commands queue while offline, and their
setpoints act from the first online tick.

Each tick, the heat balance is explicit Euler:

```text
T' = T + dt · (Q_heater + Q_occupants + Q_fire + Q_bay − G · (T − T_hull)) / C
```

`Q_occupants` is 100 W per occupant. `C` comes from the start-of-tick moles. LifeSupport's
balance stays as G2 wrote it, with `Q_fire` at 0: from G3 the fire's heat enters in phase
5, in Safety's step after the doors (section 5.10). `Q_bay` is
the coolant loop's leak into each compartment whose plan has `coolantConductance`, the
reactor bay alone in the deck, and zero elsewhere:

```text
Q_bay = UA · (T_c − T)                         UA = coolantConductance = 2 W/K
```

The loop's pipe runs 40 m through the bay at 0.3 m across, which gives 37.7 m² of
surface. A vacuum jacket with U ≈ 0.05 W/(m²·K) gives 1.9 W/K, rounded to 2. The law
reads `ship.coolant.temperature` and applies while life support is online. The figure
lives in the deck, since `LITHIUM_LOOP` sits behind Engineering's private `COOLANT_LOOP`.
The radiators sit outside the hull and radiate to space, so the law this section first
gave, `0.002 · A_rad · ε · σ · (T_c⁴ − T_bay⁴)` (4.82 MW at full output), reaches no
compartment. The loop's own balance leaves the leak out: it is 7.4 × 10⁻⁷ of the loop's
heat at full output, and at idle a 414 W drain would pull the loop under the 500 K
standby that G1 ruling 6 pins. With hull loss alone the bay settles at 264.3 K beside a
500 K loop and at 276.5 K beside a 1,185.6 K loop, with a time constant of 15.05 h.

The bridge and the habitat each have a thermostat, a proportional controller on a 10 kW
heater:

```text
Q_heater = clamp(K_t · (T_set − T), 0, Q_max)      T_set = 293 K, K_t = 10 kW/K, Q_max = 10 kW
```

A command sets `T_set` or turns the heater off. In the habitat the loss near 293 K is
150 × 32.5 ≈ 4,880 W, and the four occupants give 400 W, so the heater settles at
4,482 W and the room at 292.552 K, 0.45 K under the setpoint (the offset of a
proportional controller). The bridge settles at 292.725 K and 2,745 W. The loop gain per
tick, `K_t · dt / C`, is 1.22 × 10⁻³ in the habitat and 2.44 × 10⁻³ in the bridge, which
keeps the explicit step far from oscillation. Only heater power heats a room: the model
drops the heat of the scrubbers, the generators and the pump, and the pump's compression
work.

### 5.3 Metabolism, scrubbers, oxygen

Per occupant per second: −3.038 × 10⁻⁴ mol O₂, +2.630 × 10⁻⁴ mol CO₂ and
+1.606 × 10⁻³ mol H₂O (0.84 kg O₂, 1.0 kg CO₂ and 2.5 kg water a day). Each compartment
off-gasses 1 × 10⁻⁶ mol/s of volatiles.

A scrubber with flow `S_s` (0.05 m³/s at 1.2 kW) removes a fixed fraction of the CO₂ and
the volatiles each tick, which stays stable at any step:

```text
n_g' = n_g · exp(−dt · S_s / V)            for g in CO₂, volatiles
```

Water falls by the same fraction while it stands above the humidity setpoint, and stops
there:

```text
n_set   = 0.4 · p_sat(T) · V / (R · T)
p_sat   = 610.94 · exp(17.625 · (T − 273.15) / (T − 30.11))      Magnus, 2,312 Pa at 293 K
n_H₂O' = max(n_set, n_H₂O · exp(−dt · S_s / V))      while n_H₂O > n_set
```

In the habitat the CO₂ climbs from 40.5 Pa toward its equilibrium of 2.5245 mol
(51.25 Pa) and reads 48.8 Pa after an hour online, and the relative humidity holds at
40.00 %. The model has no condensation. A room with no scrubber gains humidity as it
cools: the airlock reads 57.55 % after an hour online, and over days it passes 100 %. No
G2 or G3 alarm reads humidity.

The oxygen generator (electrolysis, 6 kW at full rate) adds

```text
ṅ_O₂ = clamp(k_o · (p_set − p_O₂), 0, ṅ_max)      k_o = 2 × 10⁻⁵ mol/(s·Pa), ṅ_max = 0.01 mol/s, p_set = 21 kPa
```

at 600 kJ per mol O₂, about 95 % efficient against the 571.6 kJ higher heating value of
the two moles of water that give one mole of O₂. The full rate draws 6,000 W. The
generator takes its water from the ship's tank and none from the room. The habitat's
generator settles 60.8 Pa under 21 kPa and draws 729.1 W there, and the bridge's
364.6 W. The initial 21,273 Pa sits above the setpoint, so the habitat's generator first
runs about 2.7 h after online.

### 5.4 Vents and pumps

A vent of area `A_v` open to space removes the same fraction of every gas:

```text
n_g' = n_g · exp(−dt · A_v / (κ · V))          ventFraction(area, volume, dt)
```

The vent keeps the temperature: the model drops the cooling of the gas that stays. A vent
is a valve, so it draws no power and runs on a shed tick. The airlock's 0.01 m² vent
removes 2.0618 % a tick (`1 − exp(−1/48)`, τ = 24 s), and a full airlock falls under
100 Pa at tick 333 (166.1 s).

A pump moves gas from `a` to `b` at volume rate `S_p` (0.2 m³/s). It moves the fraction
`m = min(1, S_p · dt / V_a)` of each gas in `a` (0.008333 of the airlock, 8.333 × 10⁻⁴ of
the habitat), through `transfer(source, target, targetStructure, fraction)` in
`src/physics/gas.ts`. The moved gas carries its energy into `b`, whose temperature becomes

```text
T_b' = (C_b · T_b + Σ_g Δn_g · c_v,g · T_a) / (C_b + Σ_g Δn_g · c_v,g)      C_b = C_struct + Σ_g n_b,g · c_v,g
```

and `a` keeps its temperature, so each gas's moles and the total `Σ C · T` stay the same.
Its electric draw is

```text
rise   = P_b − P_a                             from the start-of-tick snapshot
P_pump = 400 W + S_p · clamp(rise, 0, 101,300 Pa) / 0.6
```

from 400 W at no rise to 34,166.67 W at 101,300 Pa or more, while its mode is not `off`.
The pump moves gas only while `rise < maxRise` (101,300 Pa). A stalled pump keeps drawing
34,166.67 W until the crew turns it off, and it moves no gas, so the airlock keeps every
gas but the volatiles, which grow by off-gassing. A pump that empties the airlock into the
habitat (the Stationeers airlock cycle) works harder as the airlock empties.

Inside `stepAtmosphere`, each compartment first takes its own step from the
start-of-tick state (metabolism and off-gassing, the generator, the scrubber, the heat
balance). Every open vent runs next, then every running pump that has not stalled, in
`COMPARTMENT_IDS` order.

A tick whose `power.shed` holds `life-support` runs no heater, scrubber, generator or
pump. Metabolism, hull loss, the bay leak and an open vent still run.

These figures come from node. The pump alone, with no metabolism or hull loss, empties the
airlock from the initial air until it stalls at tick 288, with the airlock at 9,174 Pa and
the habitat at 110,513 Pa. A vent then takes the airlock under 100 Pa in 217 ticks. The
pump alone fills the airlock from 100 Pa to within 5 kPa of the habitat in 109 ticks at
400 W. In the full model at throttle 0.01, with `online` and `pump airlock evacuate` at
tick 0, the airlock reads 37,096 Pa and the habitat 107,681 Pa at tick 120. The first
stalled tick is 289, with the airlock at 9,089 Pa, the habitat at 110,427 Pa and life
support asking 39,304 W. With the pump off and the vent open from tick 290, the airlock
reads under 100 Pa at tick 506. The pump empties the airlock at −1.69 kPa/s at the start,
under the 2 kPa/s `DECOMPRESSION` threshold, and a vent on a full airlock starts at −4.18
kPa/s, above it. In G4's drill, with the interlock registered, the vent from tick 289 takes
the stalled airlock from 9,089 Pa under 5 kPa at tick 317, and the outer door from tick 318
takes it under 100 Pa at tick 319. The fill from tick 338 then brings it within 5 kPa of the
habitat at tick 446.

### 5.5 Gas mixing through an open door

An open door between `a` and `b` trades a share of each side's gas with the other, with
time constant `τ = κ · (V_a + V_b) / A` (2.4 s for the bridge and the habitat).
`doorFractions(area, volumeA, volumeB, dt)` in `src/physics/doors.ts` gives the shares:

```text
f      = 1 − exp(−dt / τ)
fromA  = f · V_b / (V_a + V_b)                 the share of each gas a sends to b
fromB  = f · V_a / (V_a + V_b)                 the share of each gas b sends to a
T'     = (C_t · T_t + Σ_g n_p,g · c_v,g · T_p) / (C_t + Σ_g n_p,g · c_v,g)
```

`exchange(a, b, structureA, structureB, fromA, fromB)` in `src/physics/gas.ts` takes both
parcels from the start state with `parcel(air, fraction)`, which splits `fraction` of each
gas off at the side's temperature. It mixes each parcel into the other side's kept air
with `mix(target, structure, parcel)`, whose result is `T'` above: `C_t` and `T_t` belong
to the kept air with its structure, and `T_p` and `n_p,g` to the parcel. `transfer` of
section 5.4 runs `parcel`, then `mix`, with the same arithmetic in the same order, so the
G2 goldens stay byte-identical.

Moles are conserved exactly, since each parcel leaves one side and enters the other, and
so is `Σ C · T`. `f < 1` keeps the step stable at any `dt`, and each step multiplies the
gap in molar density between the rooms by `1 − f`. The parcels carry each side's
temperature, so a hot room and a cold room at equal molar density still trade heat, where
the net-flow law this section first gave held that gap. Per tick, `bridge-habitat` has
`f` 0.188064 with `fromA` 0.125376 and `fromB` 0.062688. The other two inner doors have
`f` 0.170971 (`habitat-reactor-bay`) and 0.203297 (`habitat-airlock`). The airlock's outer door uses the vent formula of section
5.4: `ventFraction(1.2, 12, dt)` keeps 0.08208 of each gas a tick, −186.0 kPa/s from
101.3 kPa. Doors are processed in the deck plan's order within the tick. `Safety` runs
them in phase 5, each from the air the previous door left, and LifeSupport's files stay as
G2 left them.

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
T_c' = T_c + dt · (P_th − P_e + Σ_i h_i · P_i − λ · ε · σ · A_rad · (T_c⁴ − T_bg⁴)) / C_c
```

At idle λ is 0, and the loop holds 500 K exactly. `h_i` is the share of consumer `i`'s
allocated power that ends in the loop: 0.25 for the shield grid in G1. G2 adds 0 for life
support: a heater's power heats its room, and the model drops the heat of the other
devices. G5 adds 0 for comms, and G6 adds 0.4 for the main drive and 0 for the thrusters.
G7 adds 0.1 for the FTL spool. G8 adds 0 for the railgun's capacitor, which stores its
power; a shot puts 0.25 of `E_shot` into the loop as a pulse (section 5.9). A jump and a
shot add their pulses to the loop in phase 3 (section 5.9). This equation first carried a
term `Q_pulse` for both pulses, which is always 0 once both enter in phase 3, so G8 drops
it. `T_bg` is 4 K. At full output and no load, λ is
1 and the loop settles at

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

From G6 the main drive puts 0.4 of its allocation into the loop, 240 MW at full throttle.
The hottest reachable equilibrium becomes 1,219.6 K, at full output with the shields
raised and the drive at full, still under the 1,350 K alarm. The drive alone at full
output holds the loop at 1,214.0 K, and at reactor level 0.6 at 1,084.2 K. The golden
scenario of section 5.13 reaches 1,064.4 K at tick 1,200.

From G7 the spool's heat share is 0.1, 90 MW while it charges. The jump's pulse enters the
loop in phase 3, in the drive's own step (section 5.9). At full output the loop
settles at 1,196.5 K with the spool, and the hottest equilibrium with the spool is
1,202.4 K, beside the raised shields. The spool never runs beside the drive at full, so the
hottest reachable equilibrium stays 1,219.6 K, and the spool's 1,300 K limit is out of
reach.

From G8 the shot's pulse enters the loop the same way. `WeaponsPhysics` calls
`pulseCoolant(coolant, pulse, LITHIUM_LOOP)` in phase 3, the call the jump makes, and the
rise is `0.25 · E_shot / C_c`, 0.08992805755395683 K. On the golden's shot tick, tick 32,
the loop reads 507.6756283905922 K, 0.08992805755394784 K above the same run with no shot.
A `Q_pulse` field that Engineering read in phase 1 of the next tick would add a snapshot
field and a one-tick delay, and the jump and the shot would reach the loop by two
mechanisms. A shot that always waits fires every 2 ticks, so the railgun draws 300 MW and
puts 75 MW into the loop on average.

### 5.7 The power budget

`PlasmaRouter` allocates `P_e` to the consumers in priority order. A consumer whose whole
demand fits gets it. A consumer whose demand does not fit gets nothing and is shed, and
the router moves on to the next.

| Priority | Consumer                 | Demand at full |
| -------- | ------------------------ | -------------- |
| 1        | life support (all rooms) | up to 69 kW    |
| 2        | `SHIELD_GRID`            | 200 MW         |
| 3        | comms                    | 5 MW           |
| 4        | helm thrusters           | 20 MW          |
| 5        | main drive               | 600 MW         |
| 6        | weapons capacitor        | 300 MW         |
| 7        | FTL spool                | 900 MW         |

Life support's demand at full is 68.57 kW: two heaters at 20 kW, two scrubbers at 2.4 kW,
two generators at 12 kW and the pump at 34.17 kW. Life support asks 39.3 kW at the first
stalled tick of a pump-down from tick 0, 34.17 kW of it for the pump. A stalled pump keeps
its 34.17 kW while it runs, and the rest of life support climbs, to 41.0 kW in all at
tick 600. The model gives 39,303.6 W at tick 289, 39,382.1 W at tick 300 and 41,027.4 W at
tick 600. The sum at full is above 1.21 GW. Priorities 1 to 4 take 225.07 MW,
and 84.93 MW remain beside the main drive and the weapons capacitor. With the main drive
burning, 385 MW remain: the weapons capacitor fits and the FTL spool never does, so the
router sheds the spool. With the drive cut, 985 MW remain, and the spool fits only while
the weapons capacitor draws nothing. So a pilot who wants to jump cuts the drive and lets
the railgun go cold, which is the trade-off a player makes in Stationeers. From G8 a full
bank draws 0 W, so the railgun goes cold once the crew stops firing. A spool command
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
  `all(POWER_CONSUMERS)`, which holds the grid's `ShieldPower` beside every other system's
  consumer, and `allocatePower` shares the tick's electric output.
  A shed load keeps its setpoint, and `power.shed` lists it on every tick the router sheds
  it.

The shield grid draws 200 MW at priority 2, so it fits once the reactor level reaches
0.1653. A throttle of 1 queued at tick 0 gives level 0.16 and 193.6 MW after 16 ticks,
where a raise answers `MERIDIAN_POWER_BUDGET`, and 205.7 MW after 17, where a raise
queues for tick 18. The grid joins the router through `POWER_CONSUMERS` with `ShieldPower`,
like every other load, and `loads(ship)` returns each consumer's draw in registration
order. `DeflectorGrid` takes `lazy(POWER_ROUTER)`, since the router reads the grid's load
through `POWER_CONSUMERS`.

`LifeSupportPower` draws `{ id: 'life-support', priority: 1, demand, heatShare: 0 }`.
`demand` comes from the pure `lifeSupportDemand` in `src/physics/atmosphere.ts`: 0 W
offline; otherwise each heater that is on at `clamp(K_t · (T_set − T), 0, Q_max)`, each
scrubber that is on at 1,200 W, each generator that is on at its rate times 600 kJ/mol,
and each pump whose mode is not `off` at `P_pump`. `LifeSupportPhysics` runs the devices
from the same function, so the router and phase 4 see one figure. No life-support command
diverts. The tick-0 power record lists the 0 W `life-support` load, which sorts first.

From G5 `CommsPower` draws `comms` at priority 3 from the pure `commsDemand` in
`src/physics/comms.ts`, read from the snapshot at the start of the tick: 5,000,000 W on each tick a
hail waits on a linked array with no reply outstanding, and 0 W otherwise, so 0 W on a ship with no
link. Its heat share is 0. The tick-0 record lists the 0 W `comms` load
after `shields`. A 0 W load fits any remainder, so an idle or offline ship never sheds it
and raises no alarm. On a linked ship with a cold reactor the router sheds the queued
hail's 5 MW, and Safety raises `LOAD_SHED comms` until the reactor gives power. No comms
command diverts, and `divert` serves the shields at priority 2 before comms at 3, so
`PowerBudgetError` stays as it is.

From G6 `HelmPower` draws `thrusters` at priority 4 with heat share 0 from the pure
`thrustersDemand` in `src/physics/motion.ts`: `20 MW · |τ| / τ_max` for the torque the PD
law of section 5.8 asks of the helm at the start of the tick, and 0 W once the helm has
settled. `PropulsionPower` draws `main-drive` at priority 5 with heat share 0.4 from the
pure `driveDemand`, `throttle · 600 MW`. A shed tick applies no torque and no thrust. The
tick-0 record lists both loads at 0 W after `comms`, and a 0 W load fits any remainder, so
an idle ship never sheds them. Priorities 1 to 5 at full take 825.07 MW and leave
384.93 MW. The drive alone needs the reactor at 0.4959, and 0.5166 beside the loads of
priorities 1, 3 and 4 at full. A turn at full torque needs the reactor at
0.01653 (20 MW of 1.21 GW), and at 0.02072 beside life support at full and comms. Below
saturation the thrusters ask 33 MW per radian of error from rest, so at throttle 0.01
(12.1 MW) a course change over about 21° waits on the reactor with `LOAD_SHED thrusters`:
the router sheds the thrusters on every tick, and the helm holds still. No helm command
diverts. A burn on a cold reactor queues, the router sheds `main-drive`, and Safety raises
`LOAD_SHED main-drive` until the reactor gives 600 MW: a burn at tick 0 beside a throttle
of 0.6 queued for tick 4 sheds through tick 52, and the drive gets power at tick 53.
`divert` serves the shields at priority 2 before the loads at 4 and 5, so
`PowerBudgetError` keeps its text and its `available`.

From G7 `FtlPower` draws `ftl-spool` at priority 7 with heat share 0.1 from the pure
`ftlDemand` in `src/physics/ftl.ts`, read from the snapshot at the start of the tick:
900 MW while armed below a full charge, with the reactor at 0.9 or more and the coolant
under 1,300 K, and 0 W otherwise. The drive attaches the load when it loads, so the power
record lists `ftl-spool` at 0 W after `main-drive` from the tick after the load. A ship
that never loads the drive keeps its five loads (six from G8, with `railgun`). `spool()`
asks `divert`. A spool alone fits from reactor level 0.7438, beside the raised shields
from 0.9091, and beside priorities 1 to 4 at full from 0.9298. Priorities 1 to 4 at full
leave 984.93 MW. A throttle of 1 queued at tick 0 gives 895.4 MW at tick 74, where a
spool answers `MERIDIAN_POWER_BUDGET`, and 907.5 MW at tick 75, where a spool queues for
tick 76. A spool
the router fits under 90 % holds at 0 W with the status `held` and no alarm until the
reactor reaches 0.9, which that ramp gives at the start of tick 91. A refusal under 90 %
would refuse a load the router can serve, so the record's `held` tells the crew why the
spool waits. A spool the router sheds raises `LOAD_SHED ftl-spool`: at level 0.9 beside the
raised shields 889 MW remain. At throttle 0.01 with life support online a spool answers
with 12.1 MW free.

From G8 `WeaponsPower` draws `railgun` at priority 6 with heat share 0 from the pure
`railgunDemand` in `src/physics/weapons.ts`, read from the snapshot at the start of the
tick: `min(P_max, (E_max − E) / dt)` while armed below a full bank, and 0 W otherwise. The
capacitor stores what it draws, so none of its power heats the loop, and a shot puts its
quarter into the loop as the pulse of section 5.6. A heat share of 0.25 on the charge would
heat the loop twice for one shot. `WeaponsPower` reads `dt` from `SIM_OPTIONS`, and the
tick-0 power record lists the 0 W `railgun` load after `main-drive`, and a loaded drive's
`ftl-spool` follows it. At dt 0.5 an empty bank charges to 150, 300 and 400 MJ at 300,
300 and 200 MW, and after a
shot from a full bank to 250 and 400 MJ at 300 MW each. The tick that fills the bank asks
only what fits, so no tick loses energy, where the clamp alone would draw 300 MW on the
third tick and lose 50,000,000 J. An unarmed fire asks `divert`, and an armed fire asks
none (section 3.3).

The railgun alone fits from reactor level 0.2479, beside the raised shields from 0.4132,
beside priorities 1 to 4 at full from 0.4339, beside the main drive from 0.7438 and beside
priorities 1 to 4 and the drive from 0.9298. A throttle of 1 queued at tick 0 gives
290.4 MW at tick 24, where a fire answers `MERIDIAN_POWER_BUDGET` with `available`
290,400,000.00000006, and 302.5 MW at tick 25. At full output the railgun fits beside the
spool with 10 MW left, and beside the raised shields and the spool the router serves the
railgun and sheds `ftl-spool`. A shed capacitor holds its charge with the status `held`,
and Safety raises `LOAD_SHED railgun`: at throttle 0.6 a burn at level 1 sheds it at
tick 62, with 726 MW of output for the drive's 600 MW and the railgun's 300 MW.

Life support runs on the reactor, and G2 has no battery. At throttle 0 the reactor gives
no power, so the router sheds `life-support` from the first online tick. Every powered
scenario queues `engineering throttle 0.01` beside `online` at tick 0. Level 0.01 gives
12.1 MW from tick 1, 176 times the 68.6 kW maximum, and the coolant settles at 514.1 K.

### 5.8 Propulsion and manoeuvring

The main drive is a plasma drive with efficiency `η_d = 0.6`, exhaust velocity
`v_e = 50 km/s` and 600 MW at full throttle (`PLASMA_DRIVE`). The ship masses
`M = 4.0 × 10⁶ kg` (`HULL`). The model has one dimension (section 12), so the velocity `v`
and the distance `s` run along the ship's track since tick 0, and a new course keeps both.
A reset would remove momentum no force removed, and a projection would remove a
cross-track part the model cannot hold.

```text
F  = 2 · η_d · P_d / v_e                       14.4 kN at 600 MW
ṁ  = F / v_e                                   0.288 kg/s at 600 MW
a  = F · cos(θ_start − θ_course) / M           0.0036 m/s² on the course
v' = v + a · dt
s' = s + v' · dt
```

`P_d` is the main-drive load's allocation in the tick, 0 W when the router sheds it, and
`θ_start` is the helm's attitude at the start of the tick. The jet power `½ · ṁ · v_e²` is
360 MW, which equals `η_d · P_d`. `M` stays fixed: a 600 MW burn spends 86.4 kg in 300 s,
0.0022 % of `M`. With `F = 0` the step computes no cosine. A record at rest comes back as
the record it got, and a moving ship coasts with `a = 0` while `s` grows. The translation
has no feedback (its step's eigenvalues are 1 and 1), so no step size makes it unstable.
The semi-implicit step overstates `s` by `a · dt · t / 2`: an aligned burn from rest for
300 s gives `v` 1.08 m/s and `s` 162.27 m, where the exact `s` is 162 m.

The charts hold degrees (`deck/charts.json`: Kepler-442b 42, Proxima-b 117, TRAPPIST-1e
203), and the helm runs in radians. `HelmControl` converts once, at the command:
`θ_course = toRadians(heading) = wrap(heading · π / 180)`, so the helm steers
0.7330382858376184, 2.0420352248333655 and −2.7401669256310974 rad for the three stars,
and a heading of 180° gives exactly `Math.PI`. `wrap(x) = x − 2π · ceil((x − π) / 2π)`
maps to (−π, π], with a compare that moves the double just above −π back into the range:
`wrap(π)`, `wrap(−π)` and `wrap(±3π)` are π, and `wrap(2π)` is 0. One setpoint,
`setpoints.helm.heading` in rad, holds both `θ_set` and `θ_course`, so the course the docs
plot is the heading the helm flies. Before a course it is 0, and a burn with no course
flies along the ship's initial axis. A star the charts do not hold, such as Vega, and a key
of `Object.prototype`, such as `constructor`, answer `MERIDIAN_BAD_COMMAND` at the command
and queue no heading. `RcsThrusters.steer` throws `RangeError` for a heading that is not
finite, so a NaN never reaches the tick.

The helm is a PD controller on the yaw angle, critically damped (`HELM_TUNING`: `ζ = 1`,
`ω_n = 0.05 rad/s`), with moment of inertia `I = 3.3 × 10⁹ kg·m²` (`HULL`) and the
thrusters' torque limit `τ_max = 5 MN·m` at 20 MW (`RCS_THRUSTERS`). `RCS_THRUSTERS` is
hardware a test swaps behind `THRUSTERS`, and `HELM_TUNING` and `HELM_SETTLE` are the
helm's control law beside `stepHelm` in `motion.ts`:

```text
settled  = |wrap(θ_set − θ)| < 10⁻⁶ rad and |ω| < 10⁻⁶ rad/s, at the start of the tick
settled: θ' = θ_set, ω' = 0, τ = 0
else:    e  = wrap(θ_set − θ)
         τ  = clamp(I · (ω_n² · e − 2 · ζ · ω_n · ω), −τ_max, τ_max), and 0 on a shed tick
         ω' = ω + τ / I · dt
         θ' = wrap(θ + ω' · dt)
P_rcs = 20 MW · |τ| / τ_max                    from the helm at the start of the tick, 0 W when settled
```

The settle (`HELM_SETTLE`) gives the loop a rest state. Without it the floating-point loop
never rests: after a 42° turn the error sticks at 2.0 × 10⁻¹⁵ rad and the record last
changes at tick 2,272, with a torque of 2.0 × 10⁻²³ N·m. From then on the thrusters ask
8.1 × 10⁻²³ W on every tick. The snap moves the ship 9.94 × 10⁻⁷ rad at tick 687 of a 42°
turn from rest, under the four significant digits the golden shows, and it makes
`θ − θ_course` exactly 0. `stepHelm` returns the record it got whenever the step changes
no field, a shed tick at rest included.

Each tick steps the helm, and the drive along the start-of-tick attitude. The router
prices `P_rcs` in phase 1 from the helm at the start of the tick, and phase 1 leaves the
helm alone, so the torque the router prices is the torque phase 2 applies. In phase 2
`HelmPhysics` steps the helm from its own record, which no other system writes, and
`PropulsionPhysics` pushes along `start.helm.attitude` (section 4.2). The thrust direction
lags the attitude by one tick, 0.5 s, during a turn.

`ω_n · dt = 0.025`, and the PD loop's discrete eigenvalues at dt 0.5 are 0.97865 and
0.97072, real and under 1, so the step neither oscillates nor diverges. At dt 1 they are
0.96 and 0.9375. The unclamped torque at `e = π` from rest is 25.9 MN·m, 5.18 times
`τ_max`, so a large turn starts saturated.

The fastest possible 180° turn (full torque to the midpoint, full reverse torque after)
takes `2 · √(π · I / τ_max)` ≈ 91.1 s to the exact heading, and passes within 1° at
86.3 s. At dt 0.5 the PD controller saturates through 30.5 s, brakes from 38.5 s, before
the midpoint at 48 s, and peaks at 0.05133 rad/s at 38 s. It comes within 1° at 164.5 s
with no overshoot and settles at tick 786 (393 s). At dt 1 it comes within 1° at 167 s and
settles at 408 s. `motion.test.ts` asserts the 164.5 s and the 393 s. A 42° turn from rest
comes within 1° at 114 s and settles at tick 687 (343.5 s), and a turn from 42° to 203°
(−157°) comes within 1° at 159.5 s and settles at 388 s.

### 5.9 Weapons and the FTL drive

The railgun's capacitor charges from its allocation and fires on command:

```text
demand = min(P_max, (E_max − E) / dt) while armed below E_max, else 0 W
E'     = min(E_max, E + P_w · dt)                  E_max = 400 MJ, the charge first
fire when E' ≥ E_shot (300 MJ) and a range waits: E' −= E_shot, T_c' = T_c + 0.25 · E_shot / C_c
hit when rng.next() < 0.8 · exp(−range / 50 km)
```

`E` is the charge in J at the start of the tick, `P_max` the rating's 300 MW and `P_w` the
router's `railgun` allocation on the tick, 0 W when the router sheds it. From G8
`stepWeapons(weapons, setpoints, { tick, dt, allocated, shed, draw }, rating)` in
`src/physics/weapons.ts` runs it and returns `{ weapons, setpoints, pulse }`, or the
objects it got when nothing changes. The step charges first and then fires, so an empty
bank fires on its second charging tick: two ticks reach `E_shot` from empty, and three
reach `E_max`. A shot spends the charge, calls `draw` once, counts the shot and the hit,
writes `lastShot`, clears the waiting range and gives a pulse of 75,000,000 J. `draw` runs
on a shot tick alone. The step derives the status on every tick: `charged` at a full bank,
else `idle` unarmed, else `held` when the router shed the capacitor, else `charging`. On
the tick a full bank fires the status reads `charging` with the tick's load at 0 W, since
the bank holds 100 MJ from that tick on. A fifth status `fired` would hold for one tick and
tell the crew nothing `lastShot.tick` does not. This section first gave the order "charge,
then fire when `E ≥ E_shot`" with no tick rule, and the pulse as
`Q_pulse += 0.25 · E_shot / dt` in the phase-1 equation of section 5.6.

The demand line tapers the tick that fills the bank (section 5.7). The clamp stays, with
`P_w` the allocation, and guards rounding at a `dt` where `(x / dt) · dt` differs from `x`
by an ulp. `RAILGUN` holds
`{ capacity: 400e6, shot: 300e6, power: 300e6, pulseShare: 0.25, accuracy: 0.8, falloff: 50_000, range: 100_000 }`
in J, W and m, and `RAILGUN_LOAD` holds `{ id: 'railgun', priority: 6, heatShare: 0 }`.
`hitChance(range, rating)` gives 0.8, 0.6549846024623855, 0.2943035529371539 and
0.10826822658929017 at 0, 10,000, 50,000 and 100,000 m. Seed 7's first draw of
`fork('Weapons')` hits up to 16,279.68540639589 m, so a shot at 16,279 m hits and one at
16,280 m misses. Its second draw, 0.8633130805101246, sits above the 0.8 ceiling and misses
at any range.

The FTL drive spools while armed, with the reactor at 90 % or more and the coolant below
1,300 K at the start of the tick:

```text
ready  = reactor.level ≥ 0.9 and T_c < 1,300 K           at the start of the tick
demand = 900 MW while armed and ready below a full charge, else 0 W
E'     = min(E_spool, E + P_f · dt)                      E_spool = 90 GJ, so 100 s at 900 MW
jump   = setpoints.jump ≠ null and E = E_spool           at the start of phase 3
on a jump: E' = 0, sector' = setpoints.jump, jumped' = tick, armed' = false, jump' = null,
           T_c' = T_c + 0.1 · E_spool / C_c               10.7914 K
```

`E` is the charge in J and `P_f` the router's `ftl-spool` allocation on the tick, 0 W when
the router sheds it. From G7 `stepFtl(ftl, setpoints, { tick, dt, allocated }, rating)` in
`src/physics/ftl.ts` runs it and returns `{ ftl, setpoints, pulse }`, or the objects it got
when nothing changes. The record holds the charge in J. `P_f · dt` is 450,000,000 J, an
integer, so 200 ticks reach 90,000,000,000 J exactly. This section first gave the fraction
`S' = min(1, S + P_f · dt / E_spool)`, which drifts to 1.0000000000000007 before its clamp.
`S` is `charge / energy`.

The jump's pulse enters the loop in phase 3. This section first wrote it as
`Q_pulse += 0.1 · E_spool / dt` in the phase-1 equation of section 5.6, which runs before
the jump. `FtlPhysics` adds `0.1 · E_spool / C_c` in its own step through
`pulseCoolant(coolant, energy, LITHIUM_LOOP)`, with `C_c` from `LITHIUM_LOOP`, since
`COOLANT_LOOP` stays private to Engineering. The next tick radiates from the raised
temperature. The rise is 10.79136690647482 K, the 10.8 K this section first gave. A jump
keeps the drive's velocity and distance and the helm's record (G6 ruling 6).

### 5.10 Fire and suppression

A room burns while `burns(air, volume)` in `src/physics/fire.ts` holds: an O₂ mole
fraction above 16 % and `p_O₂` above 16 kPa. The fraction catches dilution by inert gas,
and the partial pressure catches a room vented to space. A fire can start in a compartment
above 330 K where the air burns. Each tick it ignites with probability
`1 − exp(−λ · dt)`, `λ = 1 × 10⁻³ /s` (4.9988 × 10⁻⁴ a tick), drawn from the `Safety` fork
of the random source. The step draws once per eligible room per tick, in `COMPARTMENT_IDS`
order, and any other room draws nothing. Ignition sets `φ = 0.05`. A fire of intensity `φ ∈ [0, 1]`:

```text
φ'     = min(1, φ + 0.05 · dt)                 while burns holds, else φ · exp(−0.2 · dt)
burned = min(n_O₂, 0.5 · φ' · dt)              mol of O₂; CO₂ +0.8 and H₂O +0.4 per mol burned
T'     = T + Q_fire · burned / C               Q_fire = 400 kJ per mol of O₂ burned
```

`C` is the room's heat capacity before the burn. The heat enters in Safety's step after
the doors. The fire goes out below `φ = 0.01`. A fire grows from 0.05 to 1 in 38 ticks and
decays from 1 to under 0.01 in 47. No room of the seeded ship reaches 330 K in any scenario
of this spec, so a fire lights by chance only in the unit tests, which start the habitat
at 340 K.

`InertGasSuppression.drill(compartment)` lights a fire at `φ = 0.05` on the next tick in
a room whose air burns, with no temperature condition and no draw. Every drill flag
returns to false in that tick, lit or not. A drill on a burning room changes nothing, and
a drill lights nothing in a room whose air no longer burns, such as the habitat after its
flood.

`InertGasSuppression.flood(compartment)` opens the room's flood valve. The deck gives
`bridge` a `floodCharge` of 1,000 mol of N₂, `habitat` 2,000 and `reactor-bay` 1,330
(`FloodPlan` in `fire.ts`, so `CompartmentPlan` is `RoomPlan & FloodPlan`), and
`ShipStateStore` throws a plain `Error` for a charge that is not a positive finite number.
An open valve releases `charge / 20` a tick for 10 s at the room's temperature and counts
it in `safety.flooded`. The tick that releases the last of the charge writes the valve
false and the count 0, and a flood queued while one runs changes nothing. The habitat's
2,000 mol take it to 14.99 % O₂ at 141.9 kPa (`p_O₂` 21.27 kPa), where the air no longer
burns. Fire and floods run while life support is offline. The step runs the doors, then
the fires, then the floods, then the alarms.

### 5.11 Alarms

`Safety` evaluates these on the sensor reads each tick and keeps the set in the snapshot.
`MasterAlarm` compares each tick's set with the last one and calls `raise` or `clear` on
every alarm sink.

`stepSafety` evaluates each compartment in `COMPARTMENT_IDS` order. `FIRE` comes first and
needs no read. Safety then reads the room twice through `ATMOSPHERE_PROBE`: the
start-of-tick air of `TickContext.start` at `tick − 1` and the stepped air at `tick`, the
readings a route gives for those two committed ticks. When either read throws, Safety
raises `SENSOR_FAULT` for the room and skips its atmosphere alarms, and the fault clears on
the first tick both reads succeed. An occupied room (`occupants > 0`) then raises the five
atmosphere alarms on the reads, with `dP/dt = (P_now − P_start) / dt`. The engineering
alarms follow the rooms: `COOLANT_HIGH` and `REACTOR_TRIP` on the reactor, then one
`LOAD_SHED` per entry of `power.shed`, in its order. `AlarmCode` in `src/physics/safety.ts`
is the union of the ten codes.

Each atmosphere alarm raises at its first limit and, once active in `start.safety.alarms`,
clears only past its second. `ALARM_LIMITS`, a module constant of `src/physics/safety.ts`,
holds the limits, and each gap is at least ten times the sensor noise. The other alarms
follow their records with no deadband.

| Alarm           | Subject          | Raised when                                                   | Cleared when                |
| --------------- | ---------------- | ------------------------------------------------------------- | --------------------------- |
| `FIRE`          | the room         | `φ` > 0                                                       | `φ` = 0                     |
| `SENSOR_FAULT`  | the room         | a sensor read threw                                           | both reads succeed          |
| `HYPOXIA`       | an occupied room | `p_O₂` < 16,000 Pa                                            | `p_O₂` ≥ 16,500 Pa          |
| `CO2_HIGH`      | an occupied room | `p_CO₂` > 1,000 Pa                                            | `p_CO₂` ≤ 950 Pa            |
| `PRESSURE_LOW`  | an occupied room | `P` < 70,000 Pa                                               | `P` ≥ 72,000 Pa             |
| `TEMPERATURE`   | an occupied room | `T` < 283 K or `T` > 303 K                                    | 283.5 K ≤ `T` ≤ 302.5 K     |
| `DECOMPRESSION` | an occupied room | `dP/dt` < −2,000 Pa/s; `Safety` closes every door of the room | `dP/dt` ≥ −1,000 Pa/s       |
| `COOLANT_HIGH`  | `reactor`        | `T_c` > 1,350 K                                               | `T_c` ≤ 1,350 K             |
| `REACTOR_TRIP`  | `reactor`        | the trip of section 5.6                                       | never, since the trip holds |
| `LOAD_SHED`     | the load's id    | the router shed the load                                      | the router serves the load  |

While `DECOMPRESSION` is active, Safety writes `setpoints.safety.doors` false on every tick
for each door whose `between` names the room, and the command log holds no entry from it.
The airlock cycles by design (a vent at −4.18 kPa/s, the outer door opened at the 5 kPa
limit at −9.18 kPa/s) and has no occupant, so it raises no atmosphere alarm, and G4's drill
can vent it through the outer door. The drill opens the outer door at 4,967 Pa with the
vent open, and the airlock falls at −9,135.3 Pa/s on the door's first tick. The drill
raises no alarm in any room: the habitat falls at −184.6 Pa/s at worst, on the first fill
tick, against the −2,000 Pa/s limit. The idle ship over 600 ticks, the life-support golden
scenario over 7,200 ticks, G2's `bridge-api` scenario to tick 720 and G1's engineering
scenario raise no alarm. G2's unit case of `online` at throttle 0 raises
`LOAD_SHED life-support`, which it does not assert against.

`Safety` has no online gate. With every door shut, no fire, no room above 330 K, no drill
and no valve open, the step changes no gas and draws nothing from the Safety fork. It
returns the incoming `compartments` object, so the goldens' compartments stay
byte-identical.

### 5.12 Comms

From G5 `CommsPhysics` (phase 6, `name: 'Comms'`, deps `[COMMS_ARRAY]`) delegates to the
pure `stepComms(record, setpoints, { tick, dt, linked, shed })` in `src/physics/comms.ts`.
`linked` is `PhasedArray.linked`, a fact the graph fixes at construction, and `shed` holds
when `power.shed` lists `comms`. Each tick runs two rules in this order:

1. A reply falls due. When the record reads `awaiting reply` and
   `(tick − sent) · dt ≥ RELAY_ROUND_TRIP` (2 s), the array appends
   `{ tick, from: 'fleet traffic control', text: 'sector clear' }`, keeps the newest
   `MESSAGES_KEPT` (10) messages and returns to `standby`.
2. A queued hail, judged on the record the tick started with. While the array awaits a
   reply the hail waits: the flag stays true, and the record changes by rule 1 alone.
   With no link the status reads `no subspace link` and the flag stays true. With the
   link and `power.shed` holding `comms` the status reads `no power` and the flag stays
   true. With the link and power the array sends: the record reads `awaiting reply` with
   `sent` at the tick, and the flag turns false.

With no hail and no reply due, `stepComms` returns the objects it got, and `CommsPhysics`
returns the ship it got. A hail waits while the array cannot send it, for any reason, so a
hail queued behind an outstanding reply goes out on the tick after the reply. The 2 s
round trip is 4 ticks at dt 0.5 and 2 ticks at dt 1: a hail sent at tick 10 at dt 0.5
still awaits its reply at tick 13 and gets it at tick 14. `stepComms` returns frozen
records at every level, and `CommsPhysics` returns a frozen snapshot with frozen
setpoints. The station and the reply text are module constants of `src/physics/comms.ts`,
and the index exports neither.

The figures below come from `meridianSystems({ seed: 7, dt: 0.5 })` with
`relayUrl: 'https://relay.test'` over a stubbed `fetch`, and the offline one without it.
`test/comms.test.ts` asserts each one (section 8.2).

- Throttle 0.01 and a hail at tick 0, each queued for tick 1: at tick 1 the array reads
  `awaiting reply` with `sent: 1`, and the `comms` load asks and gets 5,000,000 W of the
  12,100,000 W output. Ticks 2 to 4 draw 0 W, and at tick 5 the array reads `standby`
  with `[{ tick: 5, from: 'fleet traffic control', text: 'sector clear' }]`. The log
  holds `[{ tick: 1, change: { reactor: { throttle: 0.01 }, comms: { hail: true } } }]`.
- A hail at tick 0 on a cold reactor: ticks 1 to 3 read `no power` with the hail queued,
  the load asking 5,000,000 W and allocated 0, `power.shed` `['comms']` and the alarm
  `LOAD_SHED comms`. A throttle of 0.01 queued after tick 3 applies at tick 4, which
  sends (`sent: 4`, 5,000,000 W allocated, nothing shed, no alarm), and the reply comes
  at tick 8.
- Throttle and a hail at tick 0, and a second hail after tick 2, queued for tick 3: ticks
  3 and 4 read `awaiting reply`, `sent: 1`, the hail queued and 0 W. Tick 5 takes the
  reply and reads `standby` with the hail still queued and 0 W, and tick 6 sends it
  (`sent: 6`, the flag false, 5,000,000 W). Tick 10 reads `standby` with messages at
  ticks 5 and 10, and the log holds ticks 1 and 3.
- Eleven rounds of a hail and 5 ticks after a throttle at tick 0 end at tick 55 with
  `sent: 51` and 10 messages, the oldest at tick 10 and the newest at tick 55.
- The offline ship passes `Nexus.check`, and its array reads `linked` false. Its charts
  plot `Kepler-442b` at heading 42 from the bundled table. A hail at tick 0 queues for
  tick 1, and at ticks 1, 20 and 600 the array reads
  `{ status: 'no subspace link', sent: null, messages: [] }` with the hail queued, the
  load `{ id: 'comms', priority: 3, demand: 0, allocated: 0 }`, nothing shed and no alarm.
  A second hail after tick 20 queues for tick 21, and the log holds ticks 1 and 21.
  `comms send` answers `MERIDIAN_BAD_COMMAND` with reason `action` and
  `expected: 'hail with no arguments'`.

### 5.13 Propulsion and the helm in the ship

From G6 `HelmPhysics` (phase 2, `name: 'Helm'`, deps `[THRUSTERS]`) delegates to the pure
`stepHelm(helm, setpoints, { dt, shed }, thrusters, hull)`, and `PropulsionPhysics`
(phase 2, `name: 'Propulsion'`, deps `[MAIN_DRIVE]`) to the pure
`stepDrive(drive, { power, attitude, course, dt }, rating, hull)`, both in
`src/physics/motion.ts`. `shed` holds when `power.shed` lists `thrusters`. `power` is the
main-drive load's allocation, `attitude` is `start.helm.attitude` and `course` is
`setpoints.helm.heading`. Each class reads its rating through its token's `rating` and the
hull from `HULL`, and returns the ship it got when its step returns the record it got.

The figures below come from `meridianSystems({ seed: 7, dt: 0.5 })` on the offline graph.
`test/helm.test.ts` asserts each one (section 8.2), except the reactor's 12.1 MW at
tick 1 and the coolant's 1,064.4 K at tick 1,200, which the golden holds.

- The golden scenario: throttle 0.6, a course to Kepler-442b and a burn at level 1 at
  tick 0, each queued for tick 1. At tick 1 the reactor gives 12.1 MW. The thrusters ask
  20,000,000 W and `main-drive` 600,000,000 W, both get 0, `power.shed` reads
  `['thrusters', 'main-drive']` with `LOAD_SHED` for each, the helm reads
  `{ attitude: 0, rate: 0, torque: 0 }` and `setpoints.helm.heading` reads
  0.7330382858376184. At tick 2 the thrusters get 20,000,000 W, and the helm reads the
  torque 5,000,000 N·m, the rate 0.0007575757575757576 rad/s and the attitude
  0.0003787878787878788 rad. Ticks 2 to 49 shed `main-drive` alone. At tick 50 the reactor
  gives 605 MW and the drive gets 600,000,000 W. The thrust of 14,400 N pushes off the
  course while the helm turns and accelerates the ship at 0.003188247 m/s², with no alarm.
  The helm comes within 1° of the course at tick 229 and settles at tick 688, and the
  thrusters ask 0 W from then on. At tick 1,200 the ship moves at 2.0652 m/s, 592.98 m
  along the track, and the coolant, under the 1,350 K alarm on every tick after the first
  burn, reads 1,064.4 K (the golden's `1064`). The log holds one entry, at tick 1.
- The aligned burn: throttle 0.6 at tick 0, and a course after tick 10, queued for
  tick 11. The helm settles at tick 697 and reads
  `{ attitude: 0.7330382858376184, rate: 0, torque: 0 }` at tick 800, with both loads at
  0 W. A burn queued for tick 801 gives at tick 1,200 the thrust 14,400 N, the mass flow
  0.288 kg/s, the acceleration 0.0036 m/s², the velocity 0.72 m/s and the distance
  72.18 m, each to 1 × 10⁻¹², with `main-drive` allocated 600,000,000 W and no alarm. The
  log holds ticks 1, 11 and 801.
- At throttle 1 with a burn and a course queued at tick 0, a raise of the shields at
  tick 16 answers `MERIDIAN_POWER_BUDGET` with `consumer` `shields`, `demand` 200,000,000
  and `available` 193,600,000, and a raise at tick 17 queues for tick 18.
- `helm warp` answers `MERIDIAN_BAD_COMMAND` with reason `action`, and a burn at level 2
  and a course to 42 with reason `argument`, each with `expected: HELM_ACTIONS`. A course
  to Vega, `constructor` or `__proto__` answers reason `argument` too. The log stays
  empty.
- A course to TRAPPIST-1e sets −2.7401669256310974. On the relay graph with `fetch`
  stubbed to a table that holds Kepler-442b at 90°, a course to Kepler-442b sets
  `toRadians(90)` from the downloaded table, and the graph fetches once, at build.

### 5.14 The FTL drive in the ship

From G7 `FtlPhysics` (phase 3, `name: 'FtlDrive'`) delegates to the pure `stepFtl` of
section 5.9. It reads the allocation from `ship.power.loads` and writes the record. On a
jump it also writes the disarmed setpoints and the loop's pulse. On a tick that changes
nothing it returns the ship it got. `FtlPower` draws the load from `ftlDemand`.
`JumpDrive` builds both with its rating, and each reads the rating it was built with, so a
stub module swaps the rating behind `FTL_DRIVE`.

The figures below come from `meridianSystems({ seed: 7, dt: 0.5 })` on the offline graph,
with `FtlDrive` loaded by `ship.load` where an item says so. `test/ftl.test.ts` asserts
each one (section 8.2), except the coolant's 571.9 K at tick 101 and 832.6 K at tick 300,
which the golden holds.

- `Nexus.check(meridianSystems(options), { load: [FtlDrive] })` passes, and
  `Nexus.check(FtlDrive)` fails with `NEXUS_MISSING_PROVIDER` for `TickLoop`, `ShipState`,
  `NavCharts` and `PowerRouter`.
- The load: before it the root has no `FTL_DRIVE`, and tick 1 lists five loads (six from
  G8, with `railgun`) and reads
  `{ status: 'offline', charge: 0, sector: 'Sol', jumped: null }`. Two concurrent loads
  build one drive. Tick 2 reads `{ status: 'idle', charge: 0, sector: 'Sol', jumped: null }`
  as a new object and lists `ftl-spool` at 0 W after `main-drive`, and tick 3 keeps the
  record by identity. `get(SHIP_SYSTEMS)` lists no `FtlDrive` entry. The desk refuses `ftl`
  with `expected: 'comms, engineering, helm, life-support and safety'`, and `loop.attach`
  refuses a second system named `FtlDrive`.
- The ramp: a spool at tick 0 refuses with `available` 0. After throttle 1, a spool at
  tick 74 refuses with `available` 895,400,000.0000005, and at tick 75 it queues for
  tick 76. Ticks 76 to 90 read `held` at 0 W with no alarm, and tick 91 reads `spooling`
  with 450,000,000 J and 900,000,000 W allocated. The log holds ticks 1 and 76.
- The golden scenario: throttle 1 at tick 0 and a spool after tick 100, which answers
  `{ tick: 101 }`. A jump at tick 100 refuses with charge 0, and tick 101 reads `spooling`
  with 450,000,000 J. A jump at tick 150 refuses with charge 22,500,000,000. A second
  spool at tick 200 answers `{ tick: 201 }`, and the log keeps ticks 1 and 101. The charge
  reads 89,550,000,000 J at tick 299, and tick 300 reads `charged` with
  90,000,000,000 J. Jumps to `Vega` and `constructor` refuse with reason `argument`, and a
  jump to Kepler-442b answers `{ tick: 301 }`. Tick 301 reads
  `{ status: 'idle', charge: 0, sector: 'Kepler-442b', jumped: 301 }` with
  `{ armed: false, jump: null }` and the load at 0 W. The coolant reads 844.442961811425 K
  against 833.6515949049501 K in the same run with no jump, 10.7914 K higher to
  1 × 10⁻⁹. The log holds ticks 1, 101 and 301. A spool at tick 302 answers
  `{ tick: 303 }`, and a jump after tick 502 reaches TRAPPIST-1e at tick 503.
- The shed: throttle 1 at tick 0, a spool after tick 100, and the shields raised and
  throttle 0.9 after tick 110. Tick 120 reads `held` with 8,550,000,000 J, `power.shed`
  `['ftl-spool']` and the alarm `LOAD_SHED ftl-spool`.
- The cold ship: at throttle 0.01 with life support online, a spool at tick 600 refuses
  with 12.1 MW free (`available` 12,093,132.552581994).
- The scope: a scope opened before the load with `createScope({ request: {} })` throws
  `NEXUS_LOADED_AFTER_SCOPE` for `FTL_DRIVE` (`{ token: 'FtlDrive', module: 'FtlDrive' }`),
  and after `await scope.extend()` it reads the root's drive. The scope needs a request,
  since `COMPARTMENT` is request-scoped.

### 5.15 The weapons in the ship

From G8 `WeaponsPhysics` (phase 3, `name: 'Weapons'`, deps `[WEAPON_MOUNT]`) delegates to
the pure `stepWeapons` of section 5.9. It reads the `railgun` allocation from
`ship.power.loads` and the shed from `power.shed`, and hands the step a `draw` that calls
`TickContext.rng.next()`. It writes the record. On a shot it also writes the setpoints and
the loop's pulse. On a tick that changes nothing it returns the ship it got.
`WeaponsPower` draws the load from `railgunDemand`. Both read the rating through
`WEAPON_MOUNT`.

The figures below come from `meridianSystems({ seed: 7, dt: 0.5 })` on the offline graph,
with `FtlDrive` loaded by `ship.load` where an item says so. `test/weapons.test.ts` asserts
each one (section 8.2), except the coolant's 507.1, 509.1 and 512.5 K at ticks 31, 35 and
41, which the golden holds.

- `Nexus.check` passes with and without `load: [FtlDrive]`. The root reads `WEAPON_MOUNT`
  with `RAILGUN`, `SHIP_SYSTEMS` holds `Weapons` at phase 3, the desk refuses an unknown
  system with `expected: 'comms, engineering, helm, life-support, safety and weapons'`, and
  the snapshot's keys follow the order of section 4.1.
- The start: tick 0 reads `{ status: 'idle', charge: 0, shots: 0, hits: 0, lastShot: null }`
  and `{ armed: false, range: null }`, both frozen, and the loads `life-support`, `shields`,
  `comms`, `thrusters`, `main-drive` and `railgun`, the last at
  `{ id: 'railgun', priority: 6, demand: 0, allocated: 0 }`. Tick 1 keeps the record by
  identity.
- The refusals: a fire at tick 0 refuses with `available` 0, and at tick 24 of a throttle-1
  ramp with `available` 290,400,000.00000006. The ranges −1, 100,001, `NaN`, `'10000'`,
  `undefined`, `null` and `Infinity` refuse with reason `argument`, and `weapons reload`
  with reason `action`. The log stays empty.
- The golden scenario: throttle 1 at tick 0 and a fire at 10,000 m after tick 30, which
  answers `{ tick: 31 }`. Tick 31 reads `charging` with 150,000,000 J and the load at
  300,000,000 W. Tick 32 reads the hit `{ tick: 32, range: 10000, hit: true }` with
  `charge` 0 and the loop 0.08992805755394784 K above the same run with no shot, to
  1 × 10⁻⁹. Tick 35 reads `charged` with 400,000,000 J and the load at 200,000,000 W, and
  tick 36 the load at 0 W. A fire at 50,000 m after tick 40 answers `{ tick: 41 }`, and
  tick 41 reads the miss with `charge` 100,000,000 and the demand at 0 W. Tick 42 reads
  250,000,000 J at 300,000,000 W, and tick 43 `charged`. The log holds ticks 1, 31 and 41.
- Two fires at tick 30 answer `{ tick: 31 }` and log one entry with the later range,
  20,000 m. A fire while the shot waits answers `{ tick: 32 }`, asks no `divert` and
  replaces the range with 30,000 m, and the one shot leaves at tick 32.
- The shed: throttle 0.6, a fire at 0 m after tick 60 (`{ tick: 61 }`) and a burn at
  level 1 after tick 61 (`{ tick: 62 }`). Tick 62 reads `held` with 150,000,000 J,
  `power.shed` `['railgun']`, the alarm `LOAD_SHED railgun` and the electric output
  726,000,000 W.
- Beside the spool: `FtlDrive` loaded, throttle 1, life support online, a spool after
  tick 100 and a fire at 10,000 m after tick 101. Ticks 102 to 105 shed nothing and
  serve the spool at 900,000,000 W beside the railgun at 300,000,000 W, and the shot of
  tick 103 hits on the first draw. The raised shields shed `ftl-spool` at tick 106, with
  the railgun at 200,000,000 W and `charged`. A fire after tick 106 leaves the full bank
  at tick 107 and misses on the second draw, and the spool draws 900,000,000 W beside the
  railgun's 0 W. Tick 108 sheds the spool again and raises `LOAD_SHED ftl-spool`, with
  the railgun at 300,000,000 W.
- The stream: a first shot at 16,279 m hits and one at 16,280 m misses.

## 6. Feature map

This is the core of the spec. Each row pairs a NexusDI capability with the ship system
that shows it, and says why a ship engineer would reach for it there. Every published
package has a row. "When" is the increment that brings the row, and 0.4 means the
0.4 minimum.

| Capability                                 | Package                                                 | Ship system and how it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Why it fits                                                                                                       | App                   | When                   |
| ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------- |
| Interface-first tokens and `useClass`      | `@nexusdi/core`                                         | every system: `provide(ATMOSPHERE_SENSOR, { useClass: GasAnalyzer })`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | a ship swaps hardware behind a fixed interface; a test swaps a fake behind the same token                         | `bridge-api`          | G0                     |
| Modules, imports and exports               | `@nexusdi/core`                                         | one module per system; `Engineering` exports `POWER_ROUTER` and keeps `COOLANT_LOOP` to itself                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | a system is a bulkhead: other systems see its panel and never its pipes                                           | `bridge-api`          | G1                     |
| Global module and `forRoot`                | `@nexusdi/core`                                         | `Simulation.forRoot({ seed: 7, dt: 0.5 })` is global, so every system and a loaded module see the clock and the state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | every system needs the ship's clock; an import in each module would be noise                                      | `bridge-api`          | G0                     |
| `forRootAsync` calibration                 | `@nexusdi/core`                                         | `LifeSupport.forRootAsync({ deps: [DECK_PLAN], useFactory: readCalibration })` reads the analyzers' noise and resolution from `deck/sensors.calibration.json` before the first tick; the aggregate imports and re-exports that one instance                                                                                                                                                                                                                                                                                                                                                                                          | sensors read nothing true until they are calibrated, and the calibration comes from a file                        | `bridge-api`          | G2                     |
| Compartment-scoped atmosphere              | `@nexusdi/core`                                         | `GET /compartments/:id/atmosphere` opens a request scope whose `REQUEST` names the compartment; the library augments `NexusRequest` with `compartment?: string`, and `COMPARTMENT` is scoped over `REQUEST` with `eager: false`; an unknown id answers 404 with `MERIDIAN_UNKNOWN_COMPARTMENT`                                                                                                                                                                                                                                                                                                                                       | a reading belongs to one room; the scope carries the room so no method takes it as an argument                    | `bridge-api`          | G2                     |
| Transient sensor reads                     | `@nexusdi/core`                                         | `ATMOSPHERE_SENSOR` is transient: each `get()` builds a `GasAnalyzer` that samples its compartment at construction and draws its noise from ``rng.fork(`AtmosphereSensor:${compartment}:${tick}`)``                                                                                                                                                                                                                                                                                                                                                                                                                                  | a sensor read is a sample of one tick; reads in two ticks differ, and a cached sensor would hide a leak           | `bridge-api`          | G2                     |
| Multi providers and `all()`                | `@nexusdi/core`                                         | `SHIP_SYSTEMS` collects each system's physics; `PlasmaRouter` reads `all(POWER_CONSUMERS)` for each system's load, with `CommsPower`, Comms' load, from G5, `HelmPower` and `PropulsionPower` from G6 and `WeaponsPower` from G8; `MASTER_ALARM` reads `all(ALARM_SINKS)`, which reaches `bridge-api`'s global `AlarmPanel`                                                                                                                                                                                                                                                                                                          | a ship adds a system, a power load or an alarm panel without editing the loop, the router or the alarm            | `bridge-api`          | G0, G2, G3, G5, G6, G8 |
| `optional()`                               | `@nexusdi/core`                                         | `PhasedArray` takes `optional(SUBSPACE_LINK)`; the offline graph imports `OfflineComms`, which binds no link, so after `comms hail` the array reports `no subspace link` and keeps the hail queued at 0 W                                                                                                                                                                                                                                                                                                                                                                                                                            | a ship flies out of relay range; comms degrades and the ship runs                                                 | `bridge-api`          | G5                     |
| `lazy()` edges                             | `@nexusdi/core`                                         | `DeflectorGrid` and, from G8, `RailgunMount` take `lazy(POWER_ROUTER)`, since the router reads each one's load through `POWER_CONSUMERS` (`ShieldPower`, `WeaponsPower`): `DeflectorGrid.raise()` asks `POWER_ROUTER.divert()` to fit its load, and a direct dep fails the build with `NEXUS_CIRCULAR_DEPENDENCY`                                                                                                                                                                                                                                                                                                                    | the grid draws from the router and the router sheds the grid; the cycle is physical                               | `bridge-api`          | G1, G8                 |
| `load()` of a section                      | `@nexusdi/core`                                         | `di.load(FtlDrive)` runs `ship.load(FtlDrive)` on the first FTL request, a spool or a jump; `JumpDrive.onInit()` attaches its physics to the loop and its load to the router                                                                                                                                                                                                                                                                                                                                                                                                                                                         | the FTL drive is the biggest module and most voyages never jump                                                   | `bridge-api`          | G7                     |
| `scope.extend()` after `load()`            | `@nexusdi/core`                                         | the telemetry stream's request scope opens before the first spool loads the FTL drive; on the first frame whose `ftl.status` is no longer `offline` the stream calls `extend()` and reads `FTL_DRIVE.rating` into the frame's `ftlRating` (`NEXUS_LOADED_AFTER_SCOPE` otherwise)                                                                                                                                                                                                                                                                                                                                                     | a long-lived stream outlives the graph it opened on                                                               | `bridge-api`          | G7                     |
| `onInit` order                             | `@nexusdi/core`                                         | `SnapshotFeed` and `MasterAlarm` subscribe to the loop in `onInit`, after the loop is built                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | a listener must never see a loop that is not ready                                                                | `bridge-api`          | G0b                    |
| Dispose order on shutdown                  | `@nexusdi/core`                                         | `ship[Symbol.asyncDispose]()`: the driver stops its timer, the alarm unsubscribes, the feed closes its streams with `ship offline`, and the reactor scram runs last; G1's test asserts `SimDriver`, then `TelemetryFeed`, before `ReactorCore`, and from G3 it asserts `SimDriver`, `MasterAlarm`, `TelemetryFeed` and `ReactorCore` in that order. From G0b, `stopOnSigterm(server, shutdown, { close?, drain?, signals? })` closes the server, then aborts `shutdown`, which ends the telemetry streams; the entry disposes the ship once the server has closed, so a request in flight at `SIGTERM` answers with the ship running | a ship stops its consumers before the reactor; the reverse creation order gives that with no code                 | `bridge-api`          | G0b, G1, G3            |
| `Nexus.check`                              | `@nexusdi/core`                                         | `test/check.test.ts` checks `Meridian` with every system, and the console checks its own graphs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | a broken wiring fails CI before a tick runs                                                                       | `bridge-api`, console | 0.4                    |
| Request scopes on Node                     | `@nexusdi/node`                                         | `nodeScopes()` makes the request's scope current for the whole handler, so `FlightRecorder`, a singleton interceptor on `BLAST_DOORS`, records `survey-7: opened habitat-airlock` into the request's scoped `FLIGHT_LOG` with no argument, and `POST /commands` answers the entry beside the tick                                                                                                                                                                                                                                                                                                                                    | a singleton interceptor serves every request, so it finds the request's log through the current scope             | `bridge-api`          | 0.4, G3                |
| Server adapters                            | `@nexusdi/hono`, `@nexusdi/express`, `@nexusdi/fastify` | the three entries serve `/sim/*` from G0, `/telemetry` (SSE) from G0b and `/commands` from G1 over one graph, and the e2e cases run against each. The three Node entries stop through `stopOnSigterm`, which after `SIGTERM` closes each keep-alive connection as its response finishes                                                                                                                                                                                                                                                                                                                                              | a ship's bridge picks its server; the systems never notice                                                        | `bridge-api`          | 0.4, G0, G0b, G1       |
| Interceptors as safety interlocks          | `@nexusdi/interceptors`                                 | `PressureInterlock` wraps `BLAST_DOORS.open` and throws `MERIDIAN_INTERLOCK` when the two sides differ by more than 5 kPa; `FlightRecorder` wraps `open` and `close` and records after `next()` returns, so a refused open records nothing; `NavAudit` stays on `NAV_CHARTS`, and from G6 records the helm's plot of a course, which `HelmControl` makes once, at the command                                                                                                                                                                                                                                                        | an interlock is a rule around an action, owned apart from the door; the door class stays plain                    | `bridge-api`          | 0.4, G3, G6            |
| `errors()` text in console messages        | `@nexusdi/errors`                                       | a refused command answers 400 or 409 with `explain(error, { text: [shipText] })`, and from G3 with `explain(error, { text: SHIP_TEXT })`, where `SHIP_TEXT` is `[shipText, interceptorsText]`; the console shows the message and its `Fix:` line                                                                                                                                                                                                                                                                                                                                                                                     | a crew member who is refused needs the reason and the fix, in words                                               | `bridge-api`, console | G1, G3                 |
| A text pack from outside the core packages | `@nexusdi/errors`                                       | `@nexusdi/meridian-systems/text` exports `shipText` for the `MERIDIAN_*` codes, registered in development as `errors({ text: SHIP_TEXT })` beside `devtools()`; core's `formatError` words only the errors core raises and the errors a plugin passes to `context.format`, so no refusal body depends on the plugin                                                                                                                                                                                                                                                                                                                  | the simulation owns its codes and their words (P1, P2) through the public points any package outside NexusDI uses | `bridge-api`          | G3                     |
| Devtools graph                             | `@nexusdi/devtools`                                     | `devtools({ annotate: [shipNotes] })` labels each provider with its system, and each `SHIP_SYSTEMS` class with its static phase; the console's diagnostics page draws `graph(ship)`                                                                                                                                                                                                                                                                                                                                                                                                                                                  | an engineer reads the ship's wiring by system                                                                     | `bridge-api`, console | G0b                    |
| Trace                                      | `@nexusdi/devtools`                                     | `trace()` records the dispose events the shutdown test asserts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | the dispose order is a fact a test can read                                                                       | `bridge-api`          | G1                     |
| Profiler on the startup graph              | `@nexusdi/devtools`, `@nexusdi/cli`                     | `nexusdi profile src/ship/meridian.ts#OfflineMeridian` shows the `LifeSupport` calibration, the `LifeSupportOptions` factory, as the async startup step; `test/profile.test.ts` finds it through `profile()`; from G5 a second case overrides `SUBSPACE_LINK` on `Meridian` with `LoopbackLink` and finds the `NavCharts` factory in `Tactical`, awaited at level 1 after the `LifeSupportOptions` factory at level 0. The CLI cannot show that download, since `DEFAULT_RELAY_URL` is an `.invalid` host                                                                                                                            | a ship that takes long to start needs to know which system it waits on                                            | `bridge-api`          | G2, G5                 |
| Graph CLI                                  | `@nexusdi/cli`                                          | the `graph` target draws `graph.json` with every system and `--load src/ship/meridian.ts#FtlDrive`, which re-exports the library's `FtlDrive`, and fails on a diff                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | a system added without its wiring reviewed fails CI                                                               | `bridge-api`          | 0.4, G7                |
| Testing container and overrides            | `@nexusdi/testing`                                      | `override(ATMOSPHERE_SENSOR, { useClass: FailingSensor })` answers an empty 500 on the atmosphere route from G2, and `override(ATMOSPHERE_PROBE, { useClass: FailingProbe })` raises `SENSOR_FAULT` from G3; `override(SUBSPACE_LINK, { useClass: LoopbackLink })` profiles the charts download from G5; from G7 `overrideModule(FtlDrive, SimulatedFtlDrive, { lazy: true })` stubs the loaded drive                                                                                                                                                                                                                                | a test breaks one sensor and watches the alarm; from G7 a test of a jump does not spool a real drive              | `bridge-api`          | 0.4, G2, G3, G5, G7    |
| Vitest fixtures                            | `@nexusdi/vitest`                                       | `nexusTest(base, Meridian, { setup })` gives each test a ship at seed 7; `test.override` changes the seed or the sensors per suite                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | each test gets a fresh ship and the fixture disposes it, so a timer or listener never leaks into the next test    | `bridge-api`, console | 0.4, G0                |
| React provider, `useService` and sections  | `@nexusdi/react`                                        | the console's system pages are `lazySection`s inside `SectionBoundary`; `useService(TELEMETRY_CLIENT)` reads the stream                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | a bridge shows the panel for the system in front of it, loaded when opened                                        | console               | 0.4, G0b               |
| React Router request scopes                | `@nexusdi/react-router`                                 | the console's loaders read `BRIDGE_LINK` with `di.inject`; the command form's action posts through it; `/course/:to` streams a deferred loader                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | each console request carries its mission to the backend                                                           | console               | 0.4, G1                |
| Federation contracts                       | `@nexusdi/federation`                                   | each station is a remote; the contract `meridian` gains `TELEMETRY_FEED` and `COMMAND_LINK`, and a remote built at a newer minor fails with `NEXUS_CONTRACT_VERSION`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | each station is built by its own team against the bridge's contract                                               | federation            | 0.4, G9                |
| Decorators in a remote                     | `@nexusdi/decorators`                                   | the `command` station writes its classes with `@Injectable` and `@Inject`: `Bridge` reads `NAV_CHARTS`, and in G9 `HelmOrders` sends helm commands over `COMMAND_LINK`                                                                                                                                                                                                                                                                                                                                                                                                                                                               | a team that prefers decorators writes its station that way, and the shell's core reads it                         | federation            | 0.4, G9                |

`@nexusdi/next` is out of the set until 0.5 (integrations section 10.1), and
`examples/next-bridge` keeps its gate canary.

### 6.1 The interlock in code

```ts
// examples/meridian-systems/src/systems/safety/pressure-interlock.ts
export class PressureInterlock implements Interceptor {
  static deps = [SHIP_STATE, DECK_PLAN] as const;
  constructor(
    private readonly state: IShipState,
    private readonly deck: DeckPlan,
  ) {}
  intercept(call: CallContext, next: Next): unknown {
    const [door] = call.args;
    const plan = this.deck.doors.find((entry) => entry.id === door);
    // BlastDoorControl refuses a door the deck lacks.
    if (plan === undefined) return next();
    const [a, b] = doorPressures(
      this.state.snapshot().compartments,
      this.deck.compartments,
      plan,
    );
    const difference = Math.round(Math.abs(a - b));
    if (difference > PRESSURE_INTERLOCK.limit)
      throw new InterlockError({
        door: plan.id,
        difference,
        limit: PRESSURE_INTERLOCK.limit,
      });
    return next();
  }
}
```

The file imports its interceptor types with
`import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors'`. The library
serves the class at the subpath `@nexusdi/meridian-systems/interlock`, and `src/index.ts`
leaves it out. The main entry keeps `InterlockError`, and `PRESSURE_INTERLOCK` with
`doorPressures`. `package.json` declares `@nexusdi/interceptors` as an optional peer dependency and
a dev dependency. The library's ESLint config passes a type import of it and refuses a
value import (section 8.1).

`bridgePlugins()` registers it beside `NavAudit` and `FlightRecorder`, and `bridge-api`
imports the class from `@nexusdi/meridian-systems/interlock`:

```ts
interceptors({
  imports: [AuditTrail],
  providers: [
    provide(REQUEST_SCOPES, { useValue: options.scopes ?? NO_SCOPES }),
  ],
  register: [NavAudit, FlightRecorder, PressureInterlock],
  bindings: [
    { token: NAV_CHARTS, class: [NavAudit] },
    {
      token: BLAST_DOORS,
      methods: {
        open: [FlightRecorder, PressureInterlock],
        close: [FlightRecorder],
      },
    },
  ],
});
```

The chain runs outermost first (`libs/interceptors/src/chain.ts`). `FlightRecorder` calls
`next()` and records after it returns, so a refused open records nothing.
`PressureInterlock` reads `SHIP_STATE` and `DECK_PLAN` through the global `Simulation`, so
the plugin imports only `AuditTrail`, for `NavAudit`'s `AUDIT_LOG`, and provides
`REQUEST_SCOPES` for `FlightRecorder` (section 7.1). The binding wraps the instance
`SafetyCommands` holds, so the throw reaches `CommandDesk.submit`'s caller as the same
`InterlockError`, and the sync path stays sync.
`BLAST_DOORS` is bound with `useClass`, since an interceptor never wraps a `useValue`
(`/interceptors/`). An interceptor is a singleton, and `PressureInterlock` reads only
singletons, so `NEXUS_INTERCEPTOR_LIFETIME` never applies.

The interlock reads the true pressures of the committed snapshot through
`doorPressures(compartments, rooms, door)` in `src/physics/doors.ts`, with `space` at 0 Pa,
so a command's answer never depends on the RNG. The limit is `PRESSURE_INTERLOCK.limit`,
5,000 Pa. The console's door gauges show the same pressures, rounded. `close` is never
interlocked. At tick 0 the outer door holds 101,300 Pa, so `open airlock-outer` is refused
until the airlock is under 5 kPa.

### 6.2 The compartment scope in code

```ts
// bridge-api, the Hono entry
const di = nexus(ship, {
  request: (c) => {
    // c.req.path decodes percent escapes, so Hono reads the raw pathname.
    const compartment = compartmentOf(new URL(c.req.url).pathname); // '/compartments/habitat/...' -> 'habitat'
    return {
      mission: {
        id: c.req.header('x-mission-id') ?? 'survey-7',
        target: 'Kepler-442b',
      },
      ...(compartment === undefined ? {} : { compartment }),
    };
  },
});
app.get('/compartments/:id/atmosphere', async (c) => {
  const { status, body } = answerAtmosphere(await di.scope(c));
  return c.json(body, status);
});

// bridge-api, src/bridge/atmosphere.ts
export function answerAtmosphere(scope: SensorScope): AtmosphereReply {
  try {
    return { status: 200, body: scope.get(ATMOSPHERE_SENSOR).read() };
  } catch (error) {
    if (!(error instanceof UnknownCompartmentError)) throw error;
    return { status: 404, body: refusalOf(error) };
  }
}
```

The request mapper runs in `nexus()`'s middleware, which `.use()` installs before the
router matches `/compartments/:id`, so `c.req.param('id')` is not set yet. The mapper
reads the compartment from the path itself. `compartmentOf(path)`
(`src/bridge/compartment-of.ts`) matches `^/compartments/([^/?#]+)` and leaves the id
encoded. Express passes `req.path` and Fastify `req.url`, and both read the path as sent.
The library owns the request field: `src/simulation/contracts.ts` augments
`NexusRequest` with `compartment?: string` beside `COMPARTMENT`, and the factory
`compartmentOfRequest` narrows it to a `CompartmentId`. It throws
`UnknownCompartmentError` (fields `compartment?: string`, left out for a request that
names none, and `expected: string`) for a missing or unknown id. The binding has
`eager: false`, so a scope whose request names no compartment opens, and only a `get` of
`COMPARTMENT` or of the sensor throws.

Core rethrows a `NexusError` from a synchronous construct unwrapped, so
`scope.get(ATMOSPHERE_SENSOR)` throws `UnknownCompartmentError` itself, and
`answerAtmosphere` matches it by `instanceof` on the class the library exports (P1). Any
other throw is a bug, and the framework answers it with an empty 500. `refusalOf` lives in
`src/bridge/refusal.ts`, which the command and atmosphere routes share. The airlock
answers 200 at any pressure.

### 6.3 The FTL drive as a loaded section

```ts
// bridge-api, the Hono entry
const ftl = di.load(FtlDrive);
bridge.post(
  '/ftl/spool',
  ftl,
  ftl.inject({ drive: FTL_DRIVE }, ({ drive }, c) => {
    const { status, body } = answerSpool(drive);
    return c.json(body, status);
  }),
);

// examples/meridian-systems/src/systems/ftl/jump-drive.ts
export class JumpDrive implements IFtlDrive, Disposable {
  static deps = [TICK_LOOP, SHIP_STATE, NAV_CHARTS, POWER_ROUTER] as const;
  readonly rating: FtlRating = FTL_SPOOL;
  onInit(): void {
    // The loop's all(SHIP_SYSTEMS) and the router's all(POWER_CONSUMERS) are
    // the lists at their construction, so a loaded drive attaches itself.
    // The drive keeps each detach as its attach returns. When the router
    // attach throws, load() disposes the drive it built, and the dispose
    // removes the loop entry, so a later load can attach the drive again.
    const detachLoop = this.loop.attach(new FtlPhysics(this.rating));
    this.detach = [detachLoop];
    this.detach = [detachLoop, this.router.attach(new FtlPower(this.rating))];
  }
  [Symbol.dispose](): void {
    for (const detach of this.detach) detach();
  }
}
```

`bridge-api` loads the drive through each adapter's section, the form
`apps/docs/content/load.mdx` teaches. `createBridge` holds `const ftl = di.load(FtlDrive)`
and registers it in front of both FTL handlers: Hono and Express as a handler before the
route's own, and Fastify as `{ onRequest: ftl }` in the route's options. The section runs
`ship.load(FtlDrive)` on the first FTL request, a spool or a jump, and keeps one promise
per module and container, so every later request awaits the settled promise and never
calls `ship.load` again. It then extends the request's scope when that scope has started.
The handler reads the drive through the section's own `inject`, whose enter is a cached
load and a no-op extend. The bridge code never calls `ship.load` itself. On the Node
entries `nodeScopes()` opens each request's scope before the handler, so a handler that
awaited `ship.load(FtlDrive)` and then read that scope would answer
`NEXUS_LOADED_AFTER_SCOPE` on the first spool, as this section first had it.

`ship.load(FtlDrive)` compiles the module as a new root import and builds `JumpDrive`,
whose `onInit` runs after construction. It rebuilds neither the loop nor the router, so
`onInit` attaches the drive's physics and its load (section 4.2). Two concurrent loads
build one drive, and a later load builds nothing. A failed compile leaves the container as
it was (`NEXUS_BLUEPRINT_INVALID`, `has()` false), and a later load works. A second spool
is a no-op on two levels. The section skips the load, and `spool()` on an armed drive asks
no `divert` and queues nothing, so the route answers 202 with the next tick and
`GET /commands` gains no entry. A second router check would refuse an armed spool on a
tick the router sheds it. A jump before any spool loads the drive too and answers
`MERIDIAN_FTL_NOT_SPOOLED`.

`FtlDrive` reads `TICK_LOOP`, `NAV_CHARTS` and `POWER_ROUTER` through the global
`MeridianSystems` and `SHIP_STATE` through the global `Simulation`, as G6 ruling 9 rules
for every cross-system read. `MeridianSystems` re-exports `Engineering` and `Tactical` or
`OfflineTactical`. An import of `Engineering` would build no second router and would mix
one import with three global reads. An import of `Tactical` would add the relay factory to
the offline graph, which binds no link, and the check would fail.

The section teaches two facts a reader meets in a real app. A singleton's `all()` holds
the contributions present when it was built, so a loaded system attaches itself. And a
scope opened before the load, such as a telemetry stream, calls `scope.extend()` before
it reads `FTL_DRIVE`.

`GET /telemetry` is that stream. Its request scope opens before the first spool loads the
drive and stays open until the body ends. `ftlRating(scope)` in `src/bridge/ftl.ts`
answers undefined while the reading's `ftl.status` is `offline`. On the first other status
it runs `await scope.extend()` and then reads `scope.get(FTL_DRIVE).rating`, once, and keeps
the promise. From the frame after the load, each `snapshot` frame carries the rating as
`ftlRating` (section 7.1). Without the extend the read throws `NEXUS_LOADED_AFTER_SCOPE`
(`{ token: 'FtlDrive', module: 'FtlDrive', entry: null }`), and a second `extend()` is a
no-op. A test that overrides the module gets another rating, so only the token answers it.

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
(`toLocaleString` is not). Five codes: `MERIDIAN_INTERLOCK` (a door across a pressure
difference), `MERIDIAN_POWER_BUDGET` (a command whose demand the router cannot meet, such
as a shields raise above the reactor's output, a spool the router cannot fit, such as
one on a cold reactor, or from G8 the first fire of the railgun),
`MERIDIAN_BAD_COMMAND` (a command the desk or its system cannot read),
`MERIDIAN_FTL_NOT_SPOOLED` (a jump before the spool is full) and
`MERIDIAN_UNKNOWN_COMPARTMENT` (a request that names no compartment or one the deck lacks,
G2). `shipText` holds their text:

```text
[MERIDIAN_INTERLOCK] The habitat-airlock door holds 70,585 Pa of difference, above the 5,000 Pa interlock.
  Fix: bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.
```

G1 adds the two codes it raises. `PowerBudgetError` carries the load's `consumer` id and,
in W, its `demand` and the `available` power. Its text reads "The shields load needs 200
MW, and the router has 193.6 MW free beside the loads above it." `BadCommandError` carries
a `reason` (`envelope`, `system`, `action` or `argument`) with the command's `system` and
`action` and the `expected` shape in words, and `shipText` words each reason. `bridge-api`
tells them apart with `instanceof BadCommandError`. G2 adds `UnknownCompartmentError`,
whose text reads "No compartment is named 'galley'. The deck has bridge, habitat,
reactor-bay and airlock." or "The request names no compartment. The deck has bridge,
habitat, reactor-bay and airlock.", with the fix "read /compartments/<id>/atmosphere with
one of the compartments above." Each error links to an explicit anchor in the library's
README, such as `#MERIDIAN_POWER_BUDGET`. G3 adds `InterlockError`, which carries the
`door` and, in Pa, the rounded `difference` and the `limit`. Its text is the one above,
each number through `formatNumber`. `bridge-api`'s `src/bridge/refusal.ts` exports
`SHIP_TEXT = [shipText, interceptorsText] as const`: `refusalOf` calls
`explain(error, { text: SHIP_TEXT })`, and `bridgePlugins({ dev: true })` registers
`errors({ text: SHIP_TEXT })` beside `devtools()`. Registration stays in development, since
core's `formatError` words only the errors core raises and the errors a plugin passes to
`context.format`, and no refusal body depends on the plugin.

G7 adds `FtlNotSpooledError`, which carries the `charge` and the `energy` in J. Its text
reads "The FTL drive holds 22.5 GJ of the 90 GJ a jump needs." with the fix "spool the
drive and wait until it holds the full charge, then jump.", each figure in GJ to 0.1
through `formatNumber`, and it links to `#MERIDIAN_FTL_NOT_SPOOLED`. A spool on a cold
reactor answers `PowerBudgetError` with "The ftl-spool load needs 900 MW, and the router
has 0 MW free beside the loads above it." The router fits a spool from reactor level
0.7438, so a spool at 0.75 to 0.9 passes the router and holds in the tick (section 5.7).
`bridge-api` matches the refusals through `isNexusError` and `BadCommandError`, the
library's public names.

The relay fix (issue 188) adds `RelayError`, code `MERIDIAN_RELAY`, with the `channel`, a
`reason` of `timeout` or `malformed`, and `expected` in words. Its text reads "The subspace
relay did not answer the charts channel within 5,000 ms." with the fix "check that the
relay is up and reachable at relayUrl, or raise relayTimeout." for `timeout`, and "The
subspace relay answered the charts channel with a table the ship cannot read. The table
must be a JSON object that maps each star name to a finite heading." with the fix "check
what the relay serves on that channel." for `malformed`. It links to `#MERIDIAN_RELAY`.

G8 adds no code. The first fire on a cold reactor answers `PowerBudgetError` with "The
railgun load needs 300 MW, and the router has 0 MW free beside the loads above it." and the
fix "raise the reactor throttle and wait for the output to climb, or lower a load of higher
priority." A range outside 0 to 100,000 m answers `BadCommandError` with reason
`argument`, as section 3.3 words it.

Against P1 to P5: the simulation owns its codes, their classes and their text (P1). It
extends core's open `NexusErrorByCode` by augmentation (P2). It reaches core through
`errorBase`, `ErrorTextPack` and `errors({ text })`, each public, and no package names it
(P3). It copies no package's logic (P4). Its one optional dependency, `@nexusdi/interceptors`, is a type import behind the `./interlock` subpath (P5). The demo
shows how a package outside the first-party set adds its own codes, through the same
public points. The library's README states it in those words: it is an example in the
NexusDI repository that uses only the contribution points any outside package has.

## 7. Apps

### 7.1 `bridge-api`: the simulation's home

`bridge-api` runs one ship per server process. The three entries share one graph, as
they do today.

| Route                                                   | What it does                                                                                                                                                                                                                                                                                                                                                                                                                    | When    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `GET /course/:to`, `/mission`, `/log/stream`, `/health` | as on `release/0.4`                                                                                                                                                                                                                                                                                                                                                                                                             | 0.4     |
| `GET /sim`, `POST /sim/advance`                         | the ship reading; advance `n` ticks in manual mode                                                                                                                                                                                                                                                                                                                                                                              | G0      |
| `GET /telemetry`                                        | SSE: one ship reading at once, then one per tick; from the frame after the FTL drive loads, `ftlRating`, the bound drive's rating                                                                                                                                                                                                                                                                                               | G0b, G7 |
| `POST /commands`                                        | `{ system, action, ...args }` through `COMMAND_DESK`; 202 with `{ tick }`, and `flightLog` when the request's flight log holds entries, 400 for a `BadCommandError`, 409 for any other `NexusError`, each refusal with `{ code, message, fix? }` from `explain(error, { text: [shipText] })` (`SHIP_TEXT` from G3); an empty 413 above 100 kB                                                                                   | G1, G3  |
| `GET /commands`                                         | the command log, oldest first: one `{ tick, change }` per tick for the newest 1,000 ticks that applied a change                                                                                                                                                                                                                                                                                                                 | G1      |
| `GET /compartments/:id/atmosphere`                      | one transient sensor read in a compartment scope: 200 with the `AtmosphereReading`, 404 with the refusal for `MERIDIAN_UNKNOWN_COMPARTMENT`, an empty 500 for any other throw                                                                                                                                                                                                                                                   | G2      |
| `POST /ftl/spool`, `POST /ftl/jump`                     | through `di.load(FtlDrive)`, which loads the drive on the first FTL request; the spool takes no body and answers 202 with `{ tick }` or 409 `MERIDIAN_POWER_BUDGET`; the jump reads `{ to }` and answers 202 with `{ tick }`, 400 `MERIDIAN_BAD_COMMAND` for no string `to` or an uncharted star, or 409 `MERIDIAN_FTL_NOT_SPOOLED`; each refusal carries `{ code, message, fix? }`; the Worker entries serve both through Hono | G7      |
| `GET /graph`                                            | `graph(ship)` with the ship notes, in development; 404 otherwise                                                                                                                                                                                                                                                                                                                                                                | G0b     |

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
telemetry frame at tick 0 before the client cancels. From G4 a fourth case,
`airlockDrill`, runs the airlock drill on each leg, and from G5 a fifth, `offlineHail`,
hails the offline ship. The edge runtime has no growth leg,
and the gating legs keep their current routes.

G2's growth case, `e2e/growth/life-support.e2e.ts`, runs on the three Node servers over a
manual ship on seed 7. It posts `engineering throttle 0.01` and `life-support online`
(202, tick 1) and reads the habitat at tick 0. After 600 ticks the habitat reads within
0.1 K of 292.765 K, and `GET /sim` gives its heater 2,346 W. It then posts
`pump airlock evacuate` (202, tick 601) and advances 120 ticks. At tick 720 the airlock's
reading holds that tick and a pressure from 36,950 to 37,100 Pa (model 37,023 Pa; seed 7's
reading 37,033 Pa), and `GET /sim` gives the habitat from 107,000 to 108,000 Pa (model
107,590.6 Pa). `/compartments/galley/atmosphere` answers 404 with the text. The routes
test reads 200 for `habitat` and `airlock` on each framework, 404 with
`MERIDIAN_UNKNOWN_COMPARTMENT` for `galley` and for the encoded `%68abitat`, and an empty
500 from a ship whose `ATMOSPHERE_SENSOR` is `FailingSensor`. `test/profile.test.ts`
profiles `OfflineMeridian` and finds the `LifeSupportOptions` factory as its one async
build step. `check.test.ts` keys the graph's notes by token and module, since
`ShipSystems` and `CommandHandlers` have a provider in `Engineering` and one in
`LifeSupport` (`PowerConsumers` has one, in `LifeSupport`), and reads
`['system: LifeSupport', 'phase: 4']` on LifeSupport's physics.

G3 adds no route: safety commands go through `POST /commands`, and `GET /sim` carries `safety`
and `setpoints.safety`. `src/ship/contracts.ts` gains
`IScopeSource { current(): Scope | undefined }` and
`REQUEST_SCOPES = new Token<IScopeSource>('RequestScopes')`. `FlightRecorder`, a private
class in `src/ship/plugins.ts` beside `NavAudit` with `[REQUEST_SCOPES]`, calls `next()`,
then records `opened <door>` or `closed <door>` into the current scope's `FLIGHT_LOG`,
which prefixes the mission id. `bridgePlugins({ dev?, trace?, scopes? })` binds
`NO_SCOPES`, whose `current()` answers undefined, when it gets no `scopes`. Each Node
server entry creates `nodeScopes()` once and passes it to `shipFromEnv(scopes)` and
`createBridge(ship, { scopes })`, and `worker.offline.ts` passes its own to
`bridgePlugins({ scopes })` and `createBridge`. `worker.ts` and the edge entry
pass none and answer `{ tick }`. `POST /commands` injects
`{ desk: COMMAND_DESK, log: FLIGHT_LOG }` on the three frameworks, and
`answerCommand(desk, body, log)` answers 202 with `{ tick, flightLog: [...log.entries()] }`
when the log holds entries and `{ tick }` when it holds none. `CommandReply`'s 202 body is
`QueuedCommand & { readonly flightLog?: readonly string[] }`. Engineering and life-support
commands record nothing, so every G1 and G2 answer stays `{ tick }`. `answerCommand`
answers `MERIDIAN_INTERLOCK` with 409.

`check.test.ts` adds `['system: Safety', 'phase: 5']` for `ShipSystems in Safety`,
`['system: Safety']` for `CommandHandlers`, `BlastDoors`, `FireSuppression` and
`MasterAlarm in Safety`, `['system: LifeSupport']` for `AtmosphereProbe in LifeSupport`, and
`AlarmPanel` among the bridge's modules. `graph.json` gains `Safety`, `AlarmPanel`, the
probe, `FlightRecorder`, `PressureInterlock` and `RequestScopes`. `test/profile.test.ts`
stays unchanged. `test/alarms.test.ts` breaks the probe (section 8.2).

G3's growth file, `e2e/growth/safety.e2e.ts`, runs two cases on the three Node servers,
each on a fresh manual ship on seed 7. The door case starts the reactor and life support
as G2's case does, posts `pump airlock evacuate` and advances 120 ticks. `open
habitat-airlock` answers 409 with 70,585 Pa, and after `pump airlock fill` and 68 ticks it
answers 409 with 5,323 Pa. One tick later it answers 202
`{ tick: 190, flightLog: ['survey-7: opened habitat-airlock'] }`, and at tick 209, 19
ticks after `pump airlock off` applies, `GET /sim` holds the door open and no alarm, with the two sides within
200 Pa. The drill case starts the reactor and life support, posts `safety drill habitat`,
reads
`FIRE` in `habitat` at tick 1 with `fires.habitat` 0.05, floods the habitat at tick 61 and
reads at tick 130 no fire, no alarm, the valve shut and the habitat from 142,000 to
143,500 Pa.

G4 adds no route and no command. The airlock drill uses four routes: `POST /commands`,
`GET /sim`, `POST /sim/advance` and `GET /commands`. `test/routes.test.ts` gains
`the airlock commands on %s` on `scopedShip` for the three frameworks. Its first case posts
`close airlock-outer`, which answers 202
`{ tick: 1, flightLog: ['survey-7: closed airlock-outer'] }`, then `vent airlock open false`
and `pump airlock fill`, which answer `{ tick: 1 }`. After one tick `GET /commands` holds the
one merged entry
`{ tick: 1, change: { safety: { doors: { 'airlock-outer': false } }, lifeSupport: { vents: { airlock: false }, pumps: { airlock: 'fill' } } } }`.
Its second case posts `vent habitat open true`, which answers 400 `MERIDIAN_BAD_COMMAND`
since the habitat has no vent, and the log stays empty. No earlier gating test of the bridge
sent a vent or a pump.

`airlockDrill` joins `growthCases` in `test/runtime/growth-cases.ts` as the fourth case, and
`e2e/growth/airlock.e2e.ts` runs it on the three Node servers, so one case runs on six
runtimes. From tick 0 it starts the reactor and life support as G2's case does and pumps
the airlock down for 300 ticks. At tick 300 the airlock reads from 8,500 to 9,500 Pa (model
9,089 Pa), and `open airlock-outer` answers 409 `MERIDIAN_INTERLOCK`. Once `pump off` and
`vent open true` have run 40 ticks, the airlock reads from 3,500 to 4,500 Pa (model
3,949 Pa), and the open answers 202
`{ tick: 341, flightLog: ['survey-7: opened airlock-outer'] }`. At tick 360 the airlock
reads under 100 Pa with the outer door open. The case then shuts the outer door
and the vent and starts the fill for tick 361, and `open habitat-airlock` answers 409.
After 114 fill ticks the two rooms read within 2,500 Pa of each other (model 410 Pa), and
`pump off` and `open habitat-airlock` queue for tick 475, the open with its flight-log line.
At tick 494 the inner door stands open with the two rooms within 500 Pa (model 100 Pa), and
`GET /commands` lists entries at ticks 1, 301, 341, 361 and 475. Every read of `GET /sim`
finds no alarm.

`test/runtime/growth.ts` and `test/worker/growth/sim.test.ts` build each ship as
`worker.offline.ts` does: one `nodeScopes()` per case, passed to `bridgePlugins({ scopes })`
and to `createBridge(ship, { scopes })`, so the interlock and the flight recorder run on
workerd, Deno and Bun. The three earlier cases keep their code and assertions, and no route
they call reaches an interceptor. The graph does not change, so `check.test.ts` and
`graph.json` stay as they are.

G5 adds no route. `comms hail` goes through `POST /commands`, and `GET /sim`,
`/sim/advance` and the telemetry frames carry `comms` and `setpoints.comms`. `Tactical`,
`Comms`, `StarCharts` and the chart table move into the library, and
`src/ship/contracts.ts` re-exports `NAV_CHARTS`, `SUBSPACE_LINK`, `COMMS_OPTIONS` and the
types `Course`, `INavCharts`, `ISubspaceLink` and `CommsOptions` from it. `meridian.ts`
builds both roots through `bridgeShip()` (section 3.2), and `e2e/relay.ts` serves
`BUNDLED_CHARTS`. `@nexusdi/bridge-api/ship` loses `Comms`, `tactical` and
`OfflineTactical`, and `package.json` loses the `./offline` export. Nothing imports them,
and `bridge-api` is private. `test/fixtures.ts` stays byte-identical: its
`override(NAV_CHARTS, { useClass: FakeCharts })` replaces the library's `Tactical` factory,
so the fixture's linked ship fetches nothing.

`test/routes.test.ts` gains `the comms commands on %s` on Hono, Express and Fastify. On the
fixture's linked ship, `engineering throttle 0.01` and `comms hail` each answer 202
`{ tick: 1 }`. After one tick `GET /sim` holds
`comms` `{ status: 'awaiting reply', sent: 1, messages: [] }`, `setpoints.comms`
`{ hail: false }` and the load
`{ id: 'comms', priority: 3, demand: 5000000, allocated: 5000000 }`. Four ticks later it
holds `{ status: 'standby', sent: 1, messages: [{ tick: 5, from: 'fleet traffic control', text: 'sector clear' }] }`
and no alarm. No request reached the relay, and `GET /commands` holds the one entry
`{ tick: 1, change: { reactor: { throttle: 0.01 }, comms: { hail: true } } }`. On
`OfflineMeridian` a hail answers 202 `{ tick: 1 }`, and after 20 ticks `comms.status` reads
`no subspace link` with `setpoints.comms.hail` true and no alarm. On either ship
`comms send` answers 400
`{ code: 'MERIDIAN_BAD_COMMAND', message: "comms has no action 'send'. It takes hail with no arguments.", fix: 'send one of the actions above with its arguments.' }`.

`test/profile.test.ts` keeps its case byte-identical and gains
`profiles the charts download of Meridian beside the LifeSupportOptions factory`, over
`createTestingContainer(Meridian).override(SUBSPACE_LINK, { useClass: LoopbackLink })`.
`LoopbackLink implements ISubspaceLink` joins `test/doubles.ts` and answers
`BUNDLED_CHARTS`. The case finds two awaited builds, `LifeSupportOptions` (`LifeSupport`,
singleton, level 0) and `NavCharts` (`Tactical`, singleton, level 1), neither failed, and
the graph lists both as `factory`.

`offlineHail` joins `growthCases` as the fifth case, named "a hail on the offline ship
reports no subspace link and keeps its queue", and `e2e/growth/comms.e2e.ts` runs it on the
three Node servers through `withShip`, so it runs on six runtimes. From tick 0 it posts
`comms hail` (202 `{ tick: 1 }`) and advances to tick 20, where `comms` reads
`{ status: 'no subspace link', sent: null, messages: [] }` with `setpoints.comms.hail` true
and the load `{ id: 'comms', priority: 3, demand: 0, allocated: 0 }`. A second hail
answers 202 `{ tick: 21 }`, tick 600 reads the same, and `GET /commands` lists entries at
ticks 1 and 21. Every number it reads is an integer. The harnesses stay as G4 left them.

`check.test.ts`'s notes case reads `['system: OfflineComms']` for `CommsArray`,
`PowerConsumers` and `CommandHandlers in OfflineComms`,
`['system: OfflineComms', 'phase: 6']` for `ShipSystems in OfflineComms` and
`['system: OfflineTactical']` for `NavCharts in OfflineTactical`. The bridge's modules are
`BridgeApi`, `AuditTrail`, `AlarmPanel` and `SimDriver`, with every provider unlabelled,
since `OfflineTactical` moved into the ship. `graph.json` redraws: `Comms` and `Tactical`
leave `Meridian`'s imports and join `MeridianSystems`'s, and Comms gains the array's four
providers.

G6 adds no route. `helm course` and `helm burn` go through `POST /commands`, and `GET /sim`,
`/sim/advance` and the telemetry frames carry `drive`, `helm`, `setpoints.drive`,
`setpoints.helm` and the two loads. `test/routes.test.ts` gains `the helm commands on %s`
on Hono, Express and Fastify, after every existing block. On the fixture's linked ship,
whose `FakeCharts` plots heading 42 for every star, `engineering throttle 0.6`,
`helm course to Kepler-442b` and `helm burn level 1` each answer 202 `{ tick: 1 }`, and
`AUDIT_LOG` holds `has Kepler-442b` and `plot Kepler-442b` after the course. After one
tick `GET /sim` holds `setpoints.helm` `{ heading: 0.733 }`, `setpoints.drive`
`{ throttle: 1 }`, the loads
`{ id: 'thrusters', priority: 4, demand: 20000000, allocated: 0 }` and
`{ id: 'main-drive', priority: 5, demand: 600000000, allocated: 0 }`, both shed, and
`LOAD_SHED` for each. One tick later the helm reads
`{ attitude: 0.0003788, rate: 0.0007576, torque: 5000000 }`, the thrusters get
20,000,000 W, `power.shed` holds `main-drive` alone with `LOAD_SHED` for it, `AUDIT_LOG`
still holds those two entries, and `GET /commands` holds the one entry
`{ tick: 1, change: { reactor: { throttle: 0.6 }, helm: { heading: (42 * Math.PI) / 180 }, drive: { throttle: 1 } } }`.
On `OfflineMeridian` a course to TRAPPIST-1e answers 202 `{ tick: 1 }` and sets the
heading −2.74 after one tick, and `AUDIT_LOG` stays empty, since an interceptor never
wraps the bundled charts' value. On either ship `helm burn level 1.5`, `helm course` with
no `to` and `helm flip` answer 400 `MERIDIAN_BAD_COMMAND` with the texts of section 3.3,
and the log stays empty. On `OfflineMeridian` a course to Vega, `constructor` or
`__proto__` answers 400 `MERIDIAN_BAD_COMMAND` with the text of section 3.3, and after
one tick `setpoints.helm` stays `{ heading: 0 }` with no `LOAD_SHED`.

`courseAndBurn` joins `growthCases` as the sixth case, named "a course and a burn on the
offline ship settle the helm on the charted heading and drive the ship along it", and
`e2e/growth/helm.e2e.ts` runs it on the three Node servers through `withShip`, so it runs
on six runtimes. From tick 0 it posts `engineering throttle 0.6` (202 `{ tick: 1 }`),
advances to tick 10 and posts `helm course to Kepler-442b` (202 `{ tick: 11 }`). At
tick 800 the helm reads `{ attitude: 0.733, rate: 0, torque: 0 }`, `setpoints.helm.heading`
reads 0.733 and both loads ask 0 W. `helm burn level 1` answers 202 `{ tick: 801 }`, and at
tick 1,200 the drive reads
`{ thrust: 14400, massFlow: 0.288, acceleration: 0.0036, velocity: 0.72, distance: 72.18 }`
with `main-drive` allocated 600,000,000 W. `GET /commands` lists ticks 1, 11 and 801. Every
read finds no alarm, and the case compares exact values.

`check.test.ts`'s notes case gains `['system: Propulsion', 'phase: 2']` for
`ShipSystems in Propulsion` and `['system: Propulsion']` for `MainDrive` and
`PowerConsumers in Propulsion`, and `['system: Helm', 'phase: 2']` for `ShipSystems in Helm`
and `['system: Helm']` for `Thrusters`, `Helm`, `PowerConsumers` and
`CommandHandlers in Helm`. `graph.json` redraws: `MeridianSystems` imports `Propulsion` and
`Helm` after the tactical module, and the two modules bring eight providers. The profiles
stay as they are: the offline root awaits `LifeSupportOptions` alone, and the relay root
with `LoopbackLink` awaits `LifeSupportOptions` at level 0 and `NavCharts` at level 1.
`test/profile.test.ts` and `test/shutdown.test.ts` stay byte-identical.

G7 adds `POST /ftl/spool` and `POST /ftl/jump` on Hono, Express and Fastify, through the
section of section 6.3. `src/bridge/ftl.ts` holds `answerSpool(drive)` and
`answerJump(drive, body)`, and `refusedReply(error)` in `src/bridge/refusal.ts` maps a
refusal to 400 for a `BadCommandError` and 409 for any other `NexusError` for them and for
`answerCommand`. The jump reads its body through `readJson`, and a body with no string
`to` jumps to `''`, a star no chart holds, so the library words the refusal.
`src/ship/meridian.ts` re-exports `FtlDrive` from the library for the `graph` target.

`test/routes.test.ts` gains `the ftl commands on %s` on Hono, Express and Fastify, after
every existing block, on `scopedShip`, so `nodeScopes()` opens each request's scope before
the load. `json`, `calls` and `scopedShip` move into `test/route-helpers.ts`, which
`test/ftl.test.ts` imports too, and every earlier test body stays as it was. From tick 0
`POST /ftl/spool` answers 409
`{ code: 'MERIDIAN_POWER_BUDGET', message: 'The ftl-spool load needs 900 MW, and the router has 0 MW free beside the loads above it.', fix }`,
and the root then has `FTL_DRIVE`. After throttle 1 and 100 ticks a spool answers 202
`{ tick: 101 }`. A jump to Kepler-442b answers 409 `MERIDIAN_FTL_NOT_SPOOLED` with "The
FTL drive holds 0 GJ of the 90 GJ a jump needs.", and a jump with `{}` or a `text/plain`
body answers 400 `MERIDIAN_BAD_COMMAND` with the text of section 3.3. After 200 ticks
`GET /sim` holds `{ status: 'charged', charge: 90000000000, sector: 'Sol', jumped: null }`
with the load allocated 900,000,000 W. A second spool answers 202 `{ tick: 301 }`, and the
jump to Kepler-442b answers 202 `{ tick: 301 }`. One tick later `GET /sim` holds
`{ status: 'idle', charge: 0, sector: 'Kepler-442b', jumped: 301 }` with
`{ armed: false, jump: null }` and no alarm. `GET /commands` holds
`{ reactor: { throttle: 1 } }` at tick 1, `{ ftl: { armed: true } }` at tick 101 and
`{ ftl: { jump: 'Kepler-442b' } }` at tick 301. On a fresh scoped ship a jump as the first
FTL request loads the drive and answers 409 `MERIDIAN_FTL_NOT_SPOOLED` with the 0 GJ text.

`check.test.ts` gains "compiles the FTL drive as a load of both roots", which passes
`Nexus.check(root, { plugins, load: [FtlDrive] })` for `Meridian` and `OfflineMeridian`.
The `inspect()` call of "matches graph.json, the graph the CLI draws" gains
`load: [FtlDrive]`, and a notes case loads the drive and reads `['system: FtlDrive']` on
`FtlDrive in FtlDrive` with no phase note, since `JumpDrive` is no `SHIP_SYSTEMS`
provider. The `graph` target runs
`nexusdi graph src/ship/meridian.ts#Meridian --load src/ship/meridian.ts#FtlDrive --plugins src/ship/plugins.ts#graphPlugins -f json -o graph.json`.
`graph.json` gains the module `FtlDrive`, a root import after `interceptors`, its provider
(`FtlDrive`, implementation `JumpDrive`, singleton class) and four edges, to `TickLoop`,
`ShipState`, `NavCharts` and `PowerRouter`: 16 to 17 modules, 55 to 56 providers and 86
to 90 edges. Without the load the drawn graph equals the one G6 committed.

The telemetry stream extends its scope (section 6.3). `telemetryStream(feed, shutdown?,
rating?)` gains an optional third argument, and its `pull` awaits the rating for the frame
it is about to send. Each `snapshot` frame from then on carries `ftlRating` after the
reading's keys, and a rejection errors the stream. Each `/telemetry` route passes
`ftlRating(await di.scope(c))` on Hono or `ftlRating(await di.scope(req))` on Express and
Fastify. Every earlier call and test passes two arguments or fewer, and `TelemetryEvent`
keeps `snapshot` and `offline`. `test/telemetry-stream.test.ts` gains cases on a fake
scope: a frame at `offline` calls no `extend`, the first frame at `idle` calls `extend`
once before `get`, later frames reuse the rating, and a rejected extend errors the stream.
`test/ftl.test.ts` gains `the telemetry stream on %s` on the three frameworks, each on a
ship built with `nodeScopes()`. `GET /telemetry` opens first, and the frame at tick 0
reads `ftl.status` `offline` with no `ftlRating`. A spool answers 409 and loads the drive,
and the frames up to tick 1 end on `idle` with
`ftlRating` `{ energy: 90000000000, power: 900000000, pulseShare: 0.1, reactorLevel: 0.9, coolantLimit: 1300 }`.

`test/doubles.ts` gains `SimulatedFtlDrive` (section 10.2), and
`test/ftl.test.ts` runs it on
`createTestingContainer(OfflineMeridian).overrideModule(FtlDrive, SimulatedFtlDrive, { lazy: true })`
per framework. A spool on the cold reactor answers 202 `{ tick: 1 }`, and after one tick
the jump to Proxima-b answers 202 `{ tick: 2 }`. One tick later the record reads
`{ status: 'idle', charge: 0, sector: 'Proxima-b', jumped: 2 }` with
`{ armed: false, jump: null }`, five loads (six from G8, with `railgun`) and the coolant
at 500 K. The root's drive is a `SimulatedJumpDrive`, and the telemetry frame at tick 1
carries `ftlRating.power` 0, since the stream reads the bound drive. A case without `lazy`
fails `create()` with
`NEXUS_BLUEPRINT_INVALID`, which carries `NEXUS_OVERRIDE_UNUSED`.

`spoolAndJump` joins `growthCases` as the seventh case, named "a spool and a jump on the
offline ship charge the drive and move the ship to the charted star", and
`e2e/growth/ftl.e2e.ts` runs it on the three Node servers through `withShip`, so it runs on
six runtimes. From tick 0 it posts throttle 1 (202 `{ tick: 1 }`), and a spool answers 409
with the 0 MW text. At tick 100 `ftl` reads `idle` with the load at 0 W. A spool then
answers 202 `{ tick: 101 }`, and the jump 409 with the 0 GJ text. At tick 300 the drive
reads `charged` with 90,000,000,000 J and 900,000,000 W allocated. A second spool answers
202 `{ tick: 301 }`. A jump to Vega answers 400, and a jump to Kepler-442b 202
`{ tick: 301 }`. At
tick 301 the record reads `{ status: 'idle', charge: 0, sector: 'Kepler-442b', jumped: 301 }`,
and `GET /commands` holds `{ reactor: { throttle: 1 } }` at tick 1,
`{ ftl: { armed: true } }` at tick 101 and `{ ftl: { jump: 'Kepler-442b' } }` at tick 301.
A new helper `post` sends to the FTL
routes, and `send` calls it with the label, so every failure message of an earlier case
stays as it was.

G8 adds no route and changes no file under `src`. `weapons fire` goes through
`POST /commands`, and `GET /sim`, `/sim/advance` and the telemetry frames carry `weapons`,
`setpoints.weapons` and the `railgun` load. `test/routes.test.ts` gains
`the weapons commands on %s` on Hono, Express and Fastify, after every existing block, on
`OfflineMeridian` with `bridgePlugins()`. From tick 0 a fire at 10,000 m answers 409
`{ code: 'MERIDIAN_POWER_BUDGET', message: 'The railgun load needs 300 MW, and the router has 0 MW free beside the loads above it.', fix }`,
and throttle 1 answers 202 `{ tick: 1 }`. After 30 ticks a fire with the range `'10000'`,
100,001, −1 or none answers 400 `MERIDIAN_BAD_COMMAND` with "weapons fire got an argument
it cannot use. It takes fire with a range from 0 to 100,000 m.", and `weapons reload`
answers 400 with "weapons has no action 'reload'. It takes fire with a range from 0 to
100,000 m." Two fires at 10,000 m each answer 202 `{ tick: 31 }`. One tick later `GET /sim`
holds `{ status: 'charging', charge: 150000000, shots: 0, hits: 0, lastShot: null }`,
`{ armed: true, range: 10000 }` and the load allocated 300,000,000 W. One more tick holds
`{ status: 'charging', charge: 0, shots: 1, hits: 1, lastShot: { tick: 32, range: 10000, hit: true } }`,
`{ armed: true, range: null }`, the coolant at 507.7 and no alarm, and three more hold
`charged` with 400,000,000 J and the load allocated 200,000,000 W at tick 35. A fire at
50,000 m answers 202 `{ tick: 36 }`, and one tick later the record reads
`{ status: 'charging', charge: 100000000, shots: 2, hits: 1, lastShot: { tick: 36, range: 50000, hit: false } }`.
`GET /commands` holds `{ reactor: { throttle: 1 } }` at tick 1,
`{ weapons: { armed: true, range: 10000 } }` at tick 31 and
`{ weapons: { range: 50000 } }` at tick 36.

`check.test.ts`'s notes case gains `['system: Weapons', 'phase: 3']` for
`ShipSystems in Weapons` and `['system: Weapons']` for `WeaponMount`, `PowerConsumers` and
`CommandHandlers in Weapons`, and `notes.ts` does not change. `graph.json` redraws:
`MeridianSystems` imports `Weapons` after `Helm`, and the module brings four providers and
ten edges. The edges are the loop's, the desk's and the router's `all` edges to the three
contributions, `WeaponMount` to `ShipState` and to `SimOptions`, `WeaponMount` to
`PowerRouter` (lazy), the three contributions to `WeaponMount`, and
`PowerConsumers in Weapons` to `SimOptions in Simulation`. The graph grows from 17 to 18
modules, 56 to 60 providers and 90 to 100 edges, and loses none. `test/ftl.test.ts` reads
six loads where it read five.

`fireRailgun` joins `growthCases` as the eighth case, named "two railgun shots on the
offline ship charge the capacitor, hit at 10 km and miss at 50 km", and
`e2e/growth/weapons.e2e.ts` runs it on the three Node servers through `withShip`, so it
runs on six runtimes. From tick 0 a fire at 10,000 m answers 409 with the 0 MW text, and
throttle 1 answers 202 `{ tick: 1 }`. At tick 30 the record reads `idle` with the load at
0 W. Fires at the range `'far'` and at 100,001 answer 400, and a fire at 10,000 m answers
202 `{ tick: 31 }`. Tick 31 reads 150,000,000 J with the load at 300,000,000 W, tick 32 the
hit, and tick 35 400,000,000 J with the load at 200,000,000 W. A fire at 50,000 m answers
202 `{ tick: 36 }`, tick 36 reads the miss with 100,000,000 J, and `GET /commands` lists
ticks 1, 31 and 36. The case reads through `send`, `advanceTo`, `okJson` and `expectEqual`
alone, and every value it compares is an integer, a string, a boolean or `null`.

### 7.2 The bridge console

The console's server calls `bridge-api` over HTTP, and the browser calls the console only
(demo spec 6.3).

| Route                                             | What it shows                                                                                                                                                                                                                                                    | When      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `/`, `/sectors/:sector`, `/course/:to`, `/charts` | the demo plan's routes                                                                                                                                                                                                                                           | 0.4       |
| `/telemetry`                                      | a resource route that relays `bridge-api`'s SSE with `no-transform`; 503 when the backend fails                                                                                                                                                                  | G0b       |
| `/systems/engineering`                            | a static route with four gauges from `snapshot()`, the throttle and shields forms, and the answer to the last command                                                                                                                                            | G1        |
| `/systems/engineering` action                     | posts the command through `BRIDGE_LINK`; a 400 or a 409 renders the text and the fix                                                                                                                                                                             | G1        |
| `/systems/life-support`                           | a static route with each compartment's analyzer gauges and heater power, the online, habitat thermostat and airlock forms, and the answer to the last command                                                                                                    | G2        |
| `/systems/safety`                                 | a static route with the alarms, each door and the pressure on its sides, each charged room's fire and flood with its temperature, the door and room forms, and the answer to the last command                                                                    | G3        |
| `/airlock`                                        | a static route with the airlock's pump mode and vent, its two doors with the pressure on each side, a form for each command, and the answer to the last command                                                                                                  | G4        |
| `/systems/comms`                                  | a static route with the array's status, its queued hail, the tick of its last hail and its power, the messages it received, a hail button, and the answer to the last command                                                                                    | G5        |
| `/systems/helm`                                   | a static route with the heading, the course, the turn rate and the thrusters' torque and power, the drive's burn level, power, thrust, propellant flow, acceleration, velocity and distance, a course select and a burn form, and the answer to the last command | G6        |
| `/systems/ftl`                                    | a static route with the drive's status, the arm, the spool's charge in GJ and its power, the sector and the last jump, a spool button and a jump select, and the answer to the last command                                                                      | G7        |
| `/systems/weapons`                                | a static route with the mount's status, the arm, the capacitor's charge in MJ and its power, the shot that waits, the shots, the hits and the last shot, a range form, and the answer to the last command                                                        | G8        |
| `/systems/:system`                                | one `lazySection` per system in `SectionBoundary`: gauges and a command form                                                                                                                                                                                     | after G0b |
| `/diagnostics`                                    | `graph(ship)` from `GET /graph`, each module with its providers and their notes                                                                                                                                                                                  | G0b       |

`BRIDGE_LINK` gains three methods in G0b: `snapshot(): Promise<ShipReading>` (`GET /sim`),
`telemetry(): Promise<ReadableStream<Uint8Array>>` (the body of `GET /telemetry`, with the
request's signal as `course()` sends it, so it takes no parameter) and
`graph(): Promise<NexusGraph | null>` (`GET /graph`, null on 404). It gains `command(cmd)`
in G1 with `POST /commands`. `command(cmd)` resolves to `{ accepted: true, tick }` or
`{ accepted: false, status, code, message, fix? }`, and rejects any other status. The
engineering page's loader reads `snapshot()` for four gauges, the reactor level, the
electric output, the coolant temperature and the shields' allocation, and the page has no
`lazySection` in G1.

`BRIDGE_LINK` gains `atmosphere(compartment)` in G2 with
`GET /compartments/:id/atmosphere`; a 404 rejects. The life-support page's loader reads
`snapshot()` and `atmosphere(id)` for the four compartments in parallel, and a call that
fails shows its part offline. The gauges round to a fixed precision: the temperature to
0.1 K, the pressure to 0.1 kPa, the O₂ and CO₂ partial pressures to 0.01 kPa, and the
heater power from `snapshot()` to whole watts. The forms post `online`, a habitat `heater`
target, and the airlock `pump` mode and `vent` open or shut. `fixed()` lives in
`app/bridge/fixed.ts`, which both system pages and the ship layout's status strip import.
Every console gauge shows an SI unit: K, W, MW, Pa or kPa for a pressure or a partial
pressure, and mol for an amount, never ppm, percent or an imperial unit. The fire
intensity `φ` is a dimensionless figure from 0 to 1. The page has no
`lazySection`, and the `lazySection` form of `/systems/:system` stays deferred (section
13).

From G3 `command(cmd)`'s accepted answer carries `flightLog` only when the body holds it,
and `LastAnswer` prints one line per entry under `Queued for tick N`. The safety page's
loader reads `snapshot()` alone. Its Alarms section lists each alarm as
`<code> in <subject>`, or `No alarms`. Its Doors section shows each door Open or Shut and
the pressure on each side to 0.1 kPa, with `space` at 0.0 kPa. Its Fire suppression
section shows, per room with a flood charge, the fire intensity to two decimals (`none` at 0) and the flood released in whole mol, beside the temperature in whole kelvin. The door form
posts `open` or `close` from "Open door" and "Close door", and the room form `flood` or
`drill` from "Flood" and "Drill", through `systemAction('safety', { door: 'text', compartment: 'text' })`.
A refusal shows its message and `Fix:` line, and an accepted door command its flight-log
line.

G4 adds the airlock panel at `/airlock`, inside the ship layout, with a nav link beside the
safety one. The panel sits outside `/systems/`, whose paths name a ship system and where
`/systems/:system` waits for the `lazySection` form. Its loader reads `snapshot()` alone,
and the page shows the ship offline when the call fails. Its Airlock section shows the pump
mode (`off`, `evacuate` or `fill`) and the vent Open or Shut, and its Doors section shows
`habitat-airlock` and `airlock-outer` as the safety page does. `Door` and its helpers move
to `app/routes/systems/doors.tsx`, which the safety page imports, and `CommandSelect` moves
to `system-page.tsx`. The pump and vent forms move from the life-support page to
`AirlockControls` in `app/routes/systems/airlock-controls.tsx`, which both pages render, and
the panel's door select lists the two airlock doors alone. The life-support and safety route
tests pass unchanged.

The panel's action is
`systemAction(AIRLOCK_SYSTEMS, { compartment: 'text', mode: 'text', open: 'boolean', door: 'text' })`,
where `AIRLOCK_SYSTEMS` names the system of each action: `pump` and `vent` post to
`life-support`, and `open` and `close` to `safety`. `systemAction` and `commandFrom` take
`SystemOf`, `string | Readonly<Record<string, string>>`. `commandFrom` reads a record with
`Object.hasOwn(system, action)`, so an action outside the record, `constructor` among
them, posts an empty system, which the desk refuses with `MERIDIAN_BAD_COMMAND`. The doc
comments of `system-page.tsx` and `system-action.server.ts` say the pages under `/systems`
and the airlock panel share them.

G5 adds the comms page at `/systems/comms`, a static route in the `ship-layout.tsx` group of
`app/routes.ts`, with a nav link "Comms" after "Safety". Its loader reads `snapshot()`
alone, and the page shows `SnapshotOffline` when the call fails. Its Comms section shows
the gauges `Status`, `Hail queued` (`Yes` or `No`), `Last hail sent` (`tick N` or `none`)
and `Array power`, the `comms` load's allocated watts in MW to one decimal. Its Messages
section lists each message as `fleet traffic control: sector clear (tick 5)`, or
`No messages`. Its Hail section holds one button, "Hail fleet traffic control", which posts
`command=hail` through `systemAction('comms', {})`. `megawatts(watts)` moves from the
engineering page to `app/bridge/fixed.ts` beside `kilopascals`, and both pages import it.
`ItemList({ label, none, items })` joins `system-page.tsx`, and the safety page's alarms
move onto it with the same markup, so `tests/routes/safety.spec.tsx` passes unchanged.
`tests/routes/comms.spec.tsx` reads `standby`, `No`, `none`, `0.0 MW` and `No messages` at
tick 0; `awaiting reply`, `No`, `tick 1` and `5.0 MW` on the send tick; `awaiting reply`,
`Yes`, `tick 1` and `0.0 MW` for a hail that waits; `no power`, `Yes`, `none` and
`0.0 MW` for a shed hail; `standby`, `No`, `tick 1` and `0.0 MW` on the reply tick; and
`no subspace link`, `Yes`, `none` and `0.0 MW` on the offline ship. The button posts
`{ system: 'comms', action: 'hail' }` and shows `Queued for tick 1`. `shipAtStart` in
`tests/doubles.ts` gains the comms record, `setpoints.comms` and the 0 W `comms` load, and
every other `ShipReading` double spreads it.

G6 adds the helm page at `/systems/helm`, a static route in the `ship-layout.tsx` group,
with a nav link "Helm" after "Comms". Every system page sits at the name of the system its
commands go to, and every command the page posts goes to `helm`. Its loader reads
`snapshot()` alone, and the page shows `SnapshotOffline` when the call fails. Its Helm
section shows the gauges `Heading`, `Course`, `Turn rate`, `Thruster torque` and
`Thruster power`, and its Main drive section `Burn level`, `Drive power`, `Thrust`,
`Propellant flow`, `Acceleration`, `Velocity` and `Distance`. Angles read in degrees to
0.1° in [0, 360) through `bearing(rad)` in `app/bridge/fixed.ts`, which rounds to 0.1°
before it folds, so −10⁻⁷ rad reads `0.0°` and 203° reads `203.0°`. The turn rate reads in
°/s to two decimals through `turnRate`, which never prints `-0.00`. The charts hold
degrees and the console prints `heading 42` on the home and course pages, so one quantity
reads in one unit; the SI accepts the degree for use beside its units, and the snapshot
keeps rad. Torque reads whole N·m, thrust whole N, the flow kg/s to 3 decimals, the
acceleration m/s² to 4, the velocity m/s to 2, the distance whole m and the powers MW to
0.1 through `megawatts()`. Each gauge rounds the eight-digit reading once to its own
decimals. The Course section selects a charted star and posts it from
"Plot course" through `systemAction('helm', { to: 'text', level: 'number' })`, and the
Burn section posts a level from "Burn". `LevelForm({ command, label, button, defaultValue })`
joins `system-page.tsx`, and the engineering page's throttle form moves onto it with the
same markup, so `tests/routes/engineering.spec.tsx` passes unchanged.
`tests/routes/helm.spec.tsx` reads the gauges at tick 0, on a shed tick, on the first
tick of the turn, during the off-axis burn of golden tick 50 (`14.7°`, `-398,800 N·m`,
`0.0032 m/s²`), on the course at golden tick 1,200 (`42.0°`, `2.06 m/s`, `593 m`) and after
a course to TRAPPIST-1e (`203.0°`). The course button posts
`{ system: 'helm', action: 'course', to: 'Kepler-442b' }` and shows `Queued for tick 1`,
the burn posts `{ system: 'helm', action: 'burn', level: 1 }`, and a refused burn shows
its message and `Fix:` line. `shipAtStart` gains the drive and helm records, their
setpoints and the 0 W `thrusters` and `main-drive` loads.

G7 adds the FTL page at `/systems/ftl`, a static route in the `ship-layout.tsx` group,
with a nav link "FTL" after "Helm". Its loader is `snapshotLoader`, and the page shows
`SnapshotOffline` when the call fails. Its FTL drive section shows the gauges `FTL gauges`:
`Status` (`ftl.status`), `Armed` (`Yes` or `No`), `Spool charge` in GJ to 0.1
(`fixed(charge / 1e9, 1)`), `Spool power` (the `ftl-spool` allocation through
`megawatts()`, `0.0 MW` before the load), `Sector` and `Last jump` (`tick N` or `none`).
The joule and the watt are SI units, and giga and mega SI prefixes. Words and ticks carry
no unit. Its Spool section holds one button, "Spool drive" (`command=spool`), and its Jump
section a select `to` of `Object.keys(BUNDLED_CHARTS)` with the button "Jump"
(`command=jump`). The select is `StarSelect` in `star-select.tsx`, which the helm page's
course form uses too.

`BRIDGE_LINK` gains `spool()` and `jump(to)`, which post to `POST /ftl/spool` and
`POST /ftl/jump` and resolve to a `CommandAnswer`. `command(cmd)` and both read the answer
through one private `#post(path, body)`, so the 202, 400 and 409 read exists once.
`ftlAction` joins `system-action.server.ts` beside `systemAction`, and both build on one
`linkAction`, which reads the form and hands it to the request's link. `ftlAction` calls
`link.spool()` or `link.jump(to)` from the form's `command` and `to`, and any other command
goes to `POST /commands`, where the desk refuses the `ftl` system. `ftl.tsx` imports the
library's main entry with `import type` alone and the charts from `./charts`, so the
bundle check stays green. `tests/routes/ftl.spec.tsx` reads `offline`, `No`, `0.0 GJ`,
`0.0 MW`, `Sol` and `none` at tick 0; `spooling`, `Yes`, `0.5 GJ`, `900.0 MW`, `Sol` and
`none` at golden tick 101; `held`, `Yes`, `8.6 GJ` and `0.0 MW` on the shed tick 120;
`charged`, `Yes`, `90.0 GJ` and `900.0 MW` at golden tick 300; and `idle`, `No`, `0.0 GJ`,
`0.0 MW`, `Kepler-442b` and `tick 301` at golden tick 301. `0.45` reads `0.5 GJ` and `8.55`
reads `8.6 GJ`, since the binary doubles sit above the half. The spool button shows
`Queued for tick 1`, and a refused spool shows the 0 MW text and its `Fix:` line. The
select lists the charted stars, and "Jump" for Proxima-b calls `jump('Proxima-b')`. A
refused jump shows the 0 GJ text. `shipAtStart` gains the record at `offline` and its
setpoints, and `fakeBridgeLink` gains `spool` and `jump`.

G8 adds the weapons page at `/systems/weapons`, a static route in the `ship-layout.tsx`
group, with a nav link "Weapons" after "FTL". Its loader is `snapshotLoader` and its action
`systemAction('weapons', { range: 'number' })`. The page shows `SnapshotOffline` when the
call fails, and `BRIDGE_LINK` gains no method. Its Railgun section shows the gauges
`Railgun gauges`: `Status` (`weapons.status`), `Armed` (`Yes` or `No`), `Capacitor charge`
in MJ to 0.1 (`fixed(charge / 1e6, 1)`), `Capacitor power` (the `railgun` allocation
through `megawatts()`), `Shot waiting` (the range in whole m, or `none`), `Shots fired`,
`Hits` and `Last shot` (such as `hit at 10,000 m, tick 32`, or `none`). The joule and the
watt are SI units, and mega an SI prefix. Words and ticks carry no unit. Its Fire section
holds a `NumberForm` with the field `range`, the label `Range (m)`, 0 to 100,000 in steps
of 1, the default 10,000 and the button "Fire".
`NumberForm({ command, name, label, button, min, max, step, defaultValue })` joins
`system-page.tsx`, and `LevelForm` renders it with `name="level"`, 0 to 1 and step 0.01, so
the engineering and helm specs pass unchanged. `weapons.tsx` imports the library's main
entry with `import type` alone, so the bundle check stays green.

`tests/routes/weapons.spec.tsx` reads `idle`, `No`, `0.0 MJ`, `0.0 MW`, `none`, `0`, `0`
and `none` at tick 0; `charging`, `Yes`, `150.0 MJ`, `300.0 MW` and `10,000 m` at golden
tick 31; `0.0 MJ`, `300.0 MW`, `1`, `1` and `hit at 10,000 m, tick 32` at golden tick 32;
`charged`, `400.0 MJ` and `200.0 MW` at golden tick 35; `charged`, `400.0 MJ` and `0.0 MW`
at tick 36; `charging`, `100.0 MJ`, `0.0 MW`, `2`, `1` and `miss at 50,000 m, tick 37` at
tick 37; and `held`, `150.0 MJ`, `0.0 MW` and `0 m` on the shed tick 62. "Fire" posts
`{ system: 'weapons', action: 'fire', range: 10000 }` and shows `Queued for tick 1`, and a
refused fire shows the 0 MW text and its `Fix:` line. `shipAtStart` gains the record and
its setpoints after `comms` and the 0 W `railgun` load.

The engineering page's growth case runs in the console's `e2e-growth` target under
`playwright.e2e-growth.config.mts`, and the gating config ignores `e2e/growth/`. The
console takes the types by `import type` only. Its double `fakeBridgeLink` gains the same
methods, so the route tests stay on `nexusTest`.

The ship layout, `app/routes/ship-layout.tsx`, wraps `/diagnostics`, from G1 `/systems/*`
and from G4 `/airlock`. Its loader returns `snapshot()`, or null when the backend fails, and
`shouldRevalidate` returns false. The root layout stays unchanged, so a page outside the
ship layout opens no `EventSource`. The layout's `StatusStrip` renders the tick, the ship
time and the habitat's temperature in whole kelvin and its pressure to 0.1 kPa from the
reading, both through `fixed()`, or `Telemetry offline` for null. After hydration it
subscribes through `useService(TELEMETRY_CLIENT)`, whose `EventSourceTelemetry` opens
`/telemetry` in `subscribe` only and closes it on an `offline` event or an error, with no
reconnect.

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

The shell reads `bridge-api`'s address from `/bridge.json` on first use, as it reads
`/remotes.json`, so one build serves whatever the server names and startup fetches nothing.
Only the Hono entry answers the shell's origin. That origin is `SHELL_ORIGIN`, which
defaults to `http://localhost:4300`, and `NODE_ENV=production` allows none. A contract
token's description is `<key>/<name>`, so the tokens are described
`meridian/StationTelemetry` and `meridian/CommandLink`. A token named `TelemetryFeed`
would put the bundle check's sentinel into every remote.

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

G4 adds no module and no physics: it runs G2's and G3's commands as the airlock drill, with
its golden, a module test, a case on each runtime and the console's airlock panel, and
`graph.json` stays as it is.

G5 moves `Comms` and `Tactical` into the library, where `Comms` becomes a ship system with
phase 6 physics and the crew command `comms hail`. Every earlier golden gains the comms
fields alone, and `graph.json` redraws.

G6 adds two modules in phase 2, `Propulsion` and `Helm`, with the crew commands
`helm course` and `helm burn`. Every earlier golden gains the G6 records and the two 0 W
loads alone, and `graph.json` redraws.

G7 adds one module, `FtlDrive`, loaded after startup, with phase 3 physics and its own FTL
routes. The desk gains no command. Every earlier golden gains the FTL record and setpoints
alone, and `graph.json` redraws with the load.

G8 adds one static module, `Weapons`, with phase 3 physics and the crew command
`weapons fire`. Every earlier golden gains the weapons fields and the 0 W `railgun` load
alone, and `graph.json` redraws.

G9 adds two stations and helm orders from `command`, and no module or physics to the
simulation. The contract moves to 2.4.0, and `graph.json` and the goldens stay as they are.

The suggested order, each step depending only on G0 and the steps it names:

| Step | Increment                                                                                                                                                                                                                                                                                | Needs  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| G0   | the kernel: `examples/meridian-systems`, `Simulation`, `MeridianSystems`, the deck plan, the driver, `GET /sim` and `POST /sim/advance`                                                                                                                                                  | none   |
| G0b  | telemetry and diagnostics: `Telemetry`, tick listeners, `GET /telemetry`, `GET /graph` with `shipNotes`, `BRIDGE_LINK.snapshot()`, `telemetry()` and `graph()`, the console's status strip and `/diagnostics`, the section 9 bundle check, and the workerd, Deno and Bun smoke cases     | G0     |
| G1   | `Engineering`: reactor, coolant loop, power budget, `/commands`, `BRIDGE_LINK.command(cmd)`, the engineering page                                                                                                                                                                        | G0     |
| G2   | `LifeSupport`: per-compartment atmosphere, heaters, scrubbers, oxygen generators, the airlock vent and pump, the transient analyzers and their calibration, `COMPARTMENT`, `POWER_CONSUMERS`, `GET /compartments/:id/atmosphere`, `BRIDGE_LINK.atmosphere(id)` and the life-support page | G0, G1 |
| G3   | `Safety`: blast doors, the interlock, door mixing, fire, suppression, alarms                                                                                                                                                                                                             | G2     |
| G4   | the airlock drill: the pump and vent cycle across `habitat`, `airlock` and space through the doors under the interlock, with its golden and the console's airlock panel                                                                                                                  | G3     |
| G5   | `Comms` and `Tactical` move into the library, with `COMMS_ARRAY`, the optional link, the hail and the console's comms page                                                                                                                                                               | G0     |
| G6   | `Propulsion` and `Helm`: the main drive, the thrusters, the helm's course and burn commands, and the console's helm page                                                                                                                                                                 | G1, G5 |
| G7   | `FtlDrive`, loaded with `load()`: the spool, the jump, the FTL routes and the console's FTL page                                                                                                                                                                                         | G1, G6 |
| G8   | `Weapons`: the railgun's capacitor on the power router, the shot and its hit draw, the crew command `weapons fire` and the console's weapons page                                                                                                                                        | G1     |
| G9   | the engineering and life-support stations, the contract tokens, helm orders from `command`                                                                                                                                                                                               | G1, G2 |

G1 to G3 come first because they carry the owner's Stationeers picture (air, power,
doors) and the most features of section 6. G5, G6 and G8 can run in parallel with them.

## 8. Determinism and tests

### 8.1 Unit tests of the physics

The physics tests import `src/physics/*` and no NexusDI code:

- `gas.test.ts`: `P = nRT/V` for the habitat's initial state is 101.3 kPa ± 0.1 %; an open
  door conserves every gas's moles to 1 × 10⁻⁹ relative; two rooms at 100 kPa and 50 kPa
  converge within 1 % after 10 τ (G3). From G2: the habitat's heat capacity is
  4,104,250 J/K at the initial air; Magnus gives 2,312 Pa at 293 K; `ventFraction(0.01,
12, 0.5)` removes 0.020618, and a full airlock under a vent falls under 100 Pa at tick
  333; `transfer` conserves each gas's moles and `Σ C · T` to 1 × 10⁻¹² relative, and a
  transfer between rooms at one temperature leaves both at it.
- `atmosphere.test.ts` (G2): metabolism and off-gassing per §5.3; the habitat scrubber
  holds the CO₂ at 2.5245 mol (51.248 Pa at 293 K) and the humidity at 40.00 %; the
  generator settles 60.8 Pa under 21 kPa at 729 W; the bay holds 264.3 K beside a 500 K
  loop; `lifeSupportDemand` is 0 offline; `pumpDraw(0)` is 400 W and
  `pumpDraw(101_300)` and `pumpDraw(200_000)` are 34,166.67 W; the airlock's pump
  fraction is 0.008333; the pump alone stalls at tick 288 with the airlock at
  9,174 Pa ± 1 Pa and the habitat at 110,513 Pa ± 1 Pa; a stalled pump moves no gas and
  keeps drawing; a shed tick runs no device and no pump and still vents; offline, every
  compartment stays as it was; `readAtmosphere` repeats for one compartment and tick,
  draws in its order, rounds to each resolution, reads no field under 0 in an airlock at
  50 Pa, and refuses a compartment the calibration lacks.
- `thermal.test.ts`: with its thermostat at 293 K, the habitat stays between 292.4 K and
  292.7 K from tick 2,400 to tick 7,200 (model 292.552 K), and the bridge settles at
  292.726 K ± 0.05 K at 2,745 W (model 292.725 K); the coolant loop at full output settles at 1,186 K ± 5 K; the trip fires at
  1,450 K. From G8 `pulseCoolant` lives in `thermal.ts`, and a pulse of 75,000,000 J
  raises 500 K to 500.08992805755395 K.
- `power.test.ts`: the router fills by priority and sheds a consumer whose demand does
  not fit, with a property test over random demands that the allocation never exceeds
  `P_e`.
- `motion.test.ts` (G6): `thrust(600e6)` is 14,400 N, the drive spends 0.288 kg/s, and the
  jet power `½ · ṁ · v_e²` equals `η_d · P_d`; an aligned burn accelerates at
  0.0036 m/s², and an off-axis burn at `F · cos(Δ) / M`; one aligned tick from rest gives
  `v` 0.0018 m/s and `s` 0.0009 m, and 400 give 0.72 m/s and 72.18 m to 1 × 10⁻¹²; a
  drive at rest with no power returns the record it got, and a moving one coasts;
  `wrap(π)`, `wrap(−π)` and `wrap(±3π)` are π and `wrap(2π)` is 0, and `toRadians` gives
  0.7330382858376184, 2.0420352248333655, −2.7401669256310974 and `Math.PI` for 42°,
  117°, 203° and 180°; the 180° turn from rest at dt 0.5 comes within 1° at 164.5 s,
  under 180 s, with no overshoot and not before 86.3 s, the fastest a turn at full torque
  passes within 1°, and it settles at tick 786, not before 91.1 s, the fastest turn to the
  exact heading; at dt 1 it comes within 1° at 167 s and settles at 408 s; at `e = π` from
  rest the torque saturates at 5,000,000 N·m and the thrusters ask 20,000,000 W; inside
  the band the torque follows the linear law; a shed tick applies no torque, and at rest
  returns the record it got; a 42° turn snaps at tick 687 by 9.94 × 10⁻⁷ rad, and the next
  step returns the record it got; a settled helm asks 0 W; every record a step builds is
  frozen.
- `rng.test.ts`: seed 7 gives the same first 1,000 numbers on every run (a committed
  fixture); `fork('Safety')` gives the same stream whether or not `fork('Weapons')` was
  called first.
- `comms.test.ts` (G5): `stepComms` returns the record and the setpoints objects it got
  with no hail and no reply due; a hail reads `no subspace link` without the link and
  `no power` when the router shed comms, each with the flag true, and with the link and
  the power it reads `awaiting reply` with `sent` at the tick and the flag false; a hail
  sent at tick 10 at dt 0.5 still awaits at tick 13 and gets its reply at tick 14, and at
  dt 1 the reply comes at `sent + 2`; the reply is
  `{ tick, from: 'fleet traffic control', text: 'sector clear' }`, and eleven replies
  keep the newest 10; a hail while the array awaits keeps its flag and leaves the record
  alone unless the reply is due; `commsDemand` asks 5,000,000 W on each tick a hail waits on
  a linked array with no reply outstanding, and 0 W otherwise; every level of a stepped
  record is frozen.
- `ftl.test.ts` (G7): 200 spool ticks reach 90,000,000,000 J exactly and the 201st keeps
  it; `ftlDemand` asks 900,000,000 W armed below full and ready, and 0 W unarmed, at full,
  at level 0.8999999999999999 and at 1,300 K, and it asks at 1,299.9 K; `stepFtl` returns
  the objects it got when idle, `spooling` with an allocation, `held` armed with none and
  `charged` at full; on a jump it returns
  `{ status: 'idle', charge: 0, sector, jumped: tick }`, `{ armed: false, jump: null }`
  and a pulse of 9,000,000,000 J, and a jump below full changes nothing; `stepFtl` on the
  store's `offline` record with no allocation returns a new `idle` record;
  `pulseCoolant` raises 500 K to 510.7913669064748 K; every built record is frozen. From G8
  the file imports `pulseCoolant` from `./thermal`, and both cases keep their bodies.
- `weapons.test.ts` (G8): three charging ticks reach 150,000,000, 300,000,000 and
  400,000,000 J and a fourth keeps 400,000,000; the third charging tick from empty asks
  200,000,000 W; at dt 1 a bank at 300,000,000 J asks 100,000,000 W, and at dt 2 an empty
  armed bank asks 200,000,000 W; `railgunDemand` asks 0 W unarmed or full; `stepWeapons`
  returns the objects it got unarmed, and reads `charging` with an allocation, `held` when
  shed and `charged` at full; a shot waits at 150,000,000 J and leaves at 300,000,000 J
  with `charge` 0, and a shot from a full bank leaves 100,000,000 J; a draw of 0 hits and a
  draw of 0.99 misses; the shot writes `lastShot`, `shots`, `hits`, `range: null` and a
  pulse of 75,000,000 J; `draw` runs on a shot tick alone; `hitChance(0)` is 0.8 and
  `hitChance(50_000)` is `0.8 / Math.E` to 1 × 10⁻¹⁵; every built record is frozen.
- `tools/repo-checks/src/meridian-purity.test.ts`: the library's ESLint config holds the
  replay rules of section 4.3, and ESLint refuses each known bypass of them. No file
  under `src/physics` imports `@nexusdi/*`, and no `*.module.ts` file passes 120 lines.
  From G3 the rules are `@typescript-eslint/no-restricted-imports` with
  `@typescript-eslint/no-import-type-side-effects`. A type import of
  `@nexusdi/interceptors` passes, and a value import of it, an inline `type` import of
  it, either import of `@nexusdi/interceptors/text` and a type import of `node:crypto` are
  refused. From G5 the pinned globals set holds `fetch` for `src/simulation/x.ts` and
  `src/physics/gas.test.ts` and leaves it out for `src/systems/comms/subspace-relay.ts`,
  and a lint case that calls `fetch` in another file fails. From G6 the pinned sets hold
  `Bun` and `Deno` among the host globals and `WebSocket`, `XMLHttpRequest`,
  `EventSource`, `navigator`, `WebTransport`, `importScripts`, `Worker` and
  `WebSocketStream` for every file, the relay included. A lint case per name, plus a
  `navigator` alias and a `sendBeacon` destructure, fails in a plain file and in the
  relay, and `Bun.nanoseconds()` and `Deno.connect()` fail beside the other clock and host
  cases.

From G7 the kernel's tests beside their classes pin the two attaches.
`fixed-step-loop.test.ts`: `attach` runs a system from the next tick in phase and name
order with its random source forked by name. It refuses a name the loop runs. Its detach
removes it and runs twice safely, and an attach inside a listener first steps on the next
tick.
`plasma-router.test.ts`: `attach` lists the consumer after the `POWER_CONSUMERS` entries,
and its detach removes it and runs twice safely. `ship-state-store.test.ts` reads the
record `offline` and the setpoints idle after `helm`, frozen, and its two `slice(-4)` reads
become `['helm', 'ftl', 'safety', 'setpoints']` and `['drive', 'helm', 'ftl', 'safety']`.

From G8 `ship-state-store.test.ts` gains "starts the weapons record idle and the setpoints
unarmed after comms, frozen", which reads `indexOf('weapons')` at `indexOf('comms') + 1`
in the snapshot and in the setpoints, and its tick-0 load list gains the `railgun` row.
Its two `slice(-4)` reads stay as G7 committed them. `command-arguments.test.ts` gains
`numberArgument`: it reads a number between its bounds, both ends allowed, and refuses
`NaN`, `Infinity`, a string, a missing value, null and a number outside. `levelArgument`'s
cases stay as they were.

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

`ShipUnderTest` is a root that imports `Simulation.forRoot` and the systems under test. It
is global, and binds `TICK_LOOP` as `MeridianSystems` does. From G3, `bridge-api`'s
`test/alarms.test.ts` breaks the sensors the tick reads with
`override(ATMOSPHERE_PROBE, { useClass: FailingProbe })` (every `read` throws a plain
`Error`). Its root `AlarmTestShip` imports `OfflineMeridian` and a global module that
contributes `MemoryAlarmSink` to `ALARM_SINKS`. Each lookup passes
`{ module: OfflineMeridian }`. After ten ticks the sink has heard four raises and no
clear: `SENSOR_FAULT` for each compartment at tick 1. `AUDIT_LOG` holds the four matching
lines and `MASTER_ALARM.active()` the four alarms. A second case overrides the probe on
`createTestingContainer(OfflineMeridian)`, since the bridge resolves from the root, and
`GET /compartments/habitat/atmosphere` answers an empty 500. In G2,
`FailingSensor implements IAtmosphereSensor` (its `read()` throws a plain `Error`) sits in
`bridge-api`'s `test/doubles.ts`, and one routes case per framework overrides
`ATMOSPHERE_SENSOR` with it and reads an empty 500. `nexusSetup` is the fixture
`nexusTest` exposes for the builder steps on `release/0.4`. Other suites: from G7, when
`FtlDrive` arrives, a suite with
`overrideModule(FtlDrive, SimulatedFtlDrive, { lazy: true })`, and a shutdown test that
reads `trace()`'s dispose events and asserts the driver, the alarm, the feed and the
reactor in that order. G1 writes it in `bridge-api`'s `test/shutdown.test.ts`. It filters
the `dispose:instance` events to `SimDriver` and `ReactorCore` and asserts that sequence.
The reactor then reads level 0. G0b and G3 add their tokens to the sequence. The library's
`test/engineering.test.ts` builds `meridianSystems()` with `Nexus.create` and checks the
scram and that the root cannot get `COOLANT_LOOP`.

G2's `test/life-support.test.ts` builds `meridianSystems({ seed: 7, dt: 0.5 })` and checks
that `Nexus.check` passes; that the root reads `ATMOSPHERE_CONTROL`, and
`ATMOSPHERE_SENSOR` in a scope whose request names `habitat`; that a scope naming
`galley` throws `UnknownCompartmentError` on `get`; that two `get()` calls around an
`advance(1)` read two ticks; and that `online` at throttle 0 sheds `life-support`. At
throttle 0.01 with `online` and `pump airlock evacuate` at tick 0, the airlock reads from
36,900 to 37,300 Pa at tick 120. Once the start-of-tick rise reaches 101,300 Pa, every
airlock gas but the volatiles holds exactly for ten ticks while the `life-support` load
asks at least 34,166 W. A `heater` on `airlock` and a `pump` on `habitat` each answer
`MERIDIAN_BAD_COMMAND` with reason `argument`, and after 7,200 ticks at throttle 0.01 the
habitat rounds to 292.6 K. `test/simulation.test.ts` reads `COMPARTMENT` in a scope whose
request names `habitat`, and a scope with none opens and fails only on `get`.

G5's `test/comms.test.ts` builds `meridianSystems({ seed: 7, dt: 0.5 })` offline and with
`relayUrl: 'https://relay.test'`, with `fetch` stubbed by `vi.stubGlobal` to answer
`Response.json(BUNDLED_CHARTS)` and `vi.unstubAllGlobals()` after each case. It asserts the
figures of section 5.12. The relay graph fetches
`https://relay.test/charts?frequency=1420` once at build and nothing during 10 ticks with a
hail queued, and its array reads `linked` true. The desk refuses an unknown system with
`expected: 'comms, engineering, life-support and safety'`.
`src/systems/comms/subspace-relay.test.ts` sits beside the class and stubs `fetch` the same
way, since the `src` lint refuses `globalThis`. It asserts the URL for a `relayUrl` with and
without a trailing slash and the `relay answered 503 for charts` error. `PhasedArray`,
`CommsPhysics`, `CommsPower` and `CommsCommands` each have a test beside the class.

G6's `test/helm.test.ts` builds `meridianSystems({ seed: 7, dt: 0.5 })` offline and on the
relay graph, with `fetch` stubbed as in `test/comms.test.ts`. It checks that `Nexus.check`
passes on both and that the root reads `HELM`, `THRUSTERS` and `MAIN_DRIVE`, and it asserts
the figures of section 5.13. The desk refuses an unknown system with
`expected: 'comms, engineering, helm, life-support and safety'`. `PlasmaDrive`,
`RcsThrusters`, `HelmControl`, `HelmCommands`, `HelmPower`, `PropulsionPower`,
`HelmPhysics` and `PropulsionPhysics` each have a test beside the class, and
`levelArgument` has its own beside `textArgument` and `flagArgument`.
`propulsion-physics.test.ts` pins the rule of section 4.2: on a ship whose `helm.attitude`
differs from `start.helm.attitude`, the drive accelerates by the cosine of the start's
angle against the course.

G7's `test/ftl.test.ts` builds `meridianSystems({ seed: 7, dt: 0.5 })` offline, loads
`FtlDrive` with `ship.load` and asserts the figures of section 5.14. A case runs about 700
ticks, and the library's configs carry `testTimeout: 30_000`. `JumpDrive`, `FtlPhysics`
and `FtlPower` each have a test beside the class. `jump-drive.test.ts` runs on fakes:
`onInit` attaches one system and one consumer, and the disposer calls both detaches.
`spool()` diverts `{ id: 'ftl-spool', priority: 7, demand: 900e6, heatShare: 0.1 }` and
queues `{ ftl: { armed: true } }`, and it queues nothing when `divert` throws. On an armed
snapshot it asks no `divert` and queues nothing. It returns `{ tick: t + 1 }`. `jump('Vega')`
and `jump('constructor')` refuse with reason `argument` and `expected: FTL_ACTIONS`. A jump
below full throws `FtlNotSpooledError` with the charge, and at full it queues
`{ ftl: { jump } }`. `ftl-physics.test.ts` reads phase 3 and the name `FtlDrive`, and an
idle ship comes back as it went in. A jump writes the record and the setpoints, and the
loop reads 10.7914 K higher in a frozen snapshot. `src/errors.test.ts` and
`src/text.test.ts` link the new class to `#MERIDIAN_FTL_NOT_SPOOLED` and word "The FTL
drive holds 22.5 GJ of the 90 GJ a jump needs." `test/notes.test.ts` gains a case: `inspect()` with `load: [FtlDrive]`
labels the drive's provider `system: FtlDrive` with no phase note, and a module a plugin
compiles in place of `FtlDrive` gets its own name, such as `system: StandIn`.

G8's `test/weapons.test.ts` builds `meridianSystems({ seed: 7, dt: 0.5 })` offline and
asserts the figures of section 5.15 in eight cases. `RailgunMount`, `WeaponsPhysics`,
`WeaponsPower` and `WeaponsCommands` each have a test beside the class.
`railgun-mount.test.ts` runs on fakes: the rating is `RAILGUN`, and the constructor never
calls the router thunk. An unarmed fire diverts
`{ id: 'railgun', priority: 6, demand: 300e6, heatShare: 0 }` and queues
`{ weapons: { armed: true, range } }`, and at dt 2 it diverts 200,000,000 W. A refused
divert queues nothing, and an armed fire asks no `divert` and queues
`{ weapons: { range } }`. A range of −1, 100,001, `NaN` or `Infinity` throws `RangeError`,
and 0 and 100,000 m both fire. `weapons-physics.test.ts` reads phase 3 and the name
`Weapons`, and an idle ship comes back as it went in with no draw. A shot draws once from
`TickContext.rng` and writes the record and the setpoints, and the loop reads 0.0899 K
higher in a frozen snapshot. A draw of 0.99 misses. `weapons-power.test.ts` reads `dt`
from a fake `SimOptions`: an armed bank at 300,000,000 J asks 200,000,000 W at dt 0.5 and
100,000,000 W at dt 1, and a mount with another rating changes the load.
`weapons-commands.test.ts` hands fires at 0, 10,000 and 100,000 m to the mount and refuses
`reload` and each bad range with `expected: WEAPONS_ACTIONS`. It words both refusals
through `shipText`.

Five enumerating assertions of earlier tests gain an id, a row, a line or a count, and none
rewrites an earlier value: the tick-0 load list of `ship-state-store.test.ts`, the desk's
list in `test/comms.test.ts`, `test/helm.test.ts`, `test/simulation.test.ts` and
`test/ftl.test.ts`, the load ids of `test/ftl.test.ts`, `bridge-api`'s six loads in its
`test/ftl.test.ts` and the `Weapons` notes of `check.test.ts`.

`bridge-api`'s `test/ftl.test.ts` holds the jump suite over `SimulatedFtlDrive` that
section 8.2 gave the module tests and G6 moved to G7. `bridge-api` holds the doubles and
the routes the stub serves, and the stub exists so a bridge test of a jump never spools a
real drive (section 7.1).

### 8.3 E2E on a seeded simulation

Every e2e server starts with `SIM_MODE=manual SIM_SEED=7`. A case drives ticks with
`POST /sim/advance` and asserts on three things that do not depend on the wall clock:

1. Events at a tick: "after `open habitat-airlock` is refused and the pump runs, the door
   opens at tick 190", read from the command log.
2. Rounded values: the golden prints four significant digits, and the telemetry sends
   eight (issue 191). Eight digits still hide a last-bit difference of `Math.exp` or
   `Math.cos` between engines in a value far from a rounding boundary.
3. A golden file per scenario, `e2e/golden/<scenario>.seed-7.json`, with the snapshot at
   chosen ticks. A test rewrites it with `-u`, and its diff is reviewed like
   `graph.json`'s. The goldens run in the library's `e2e-growth` target, and
   `npx nx run @nexusdi/meridian-systems:e2e-growth -- -u` rewrites them. G2 adds
   `lifeSupport`, `setpoints.lifeSupport` and the 0 W `life-support` load to the idle
   golden, whose `tick`, `time` and `compartments` stay byte-identical, and adds
   `e2e/golden/life-support.seed-7.json`: `engineering throttle 0.01` and
   `life-support online` at tick 0, snapshots at ticks 1, 600 and 7,200, and no pump. The
   model gives the habitat 292.765 K and its heater 2,346 W at tick 600. At tick 7,200 it
   gives the habitat 292.552 K, 4,482 W, 101,007 Pa, CO₂ 48.8 Pa and 40.00 % relative
   humidity, the bridge 292.725 K at 2,745 W, the airlock 286.71 K at 57.55 % and the bay
   291.17 K, from the coolant's climb to 514.1 K. G3 adds `safety` and `setpoints.safety`
   to each snapshot of both goldens, whose `tick`, `time`, `compartments`, `reactor`,
   `coolant`, `power` and `lifeSupport` stay byte-identical. It adds
   `e2e/golden/safety.seed-7.json` (`e2e/safety.e2e.ts`): the pump-down of section 5.4
   from tick 0, `pump airlock fill` at
   tick 120, `pump airlock off` and `safety open habitat-airlock` at tick 189, and
   snapshots at ticks 120, 190 and 209. The interlock reads 70,585 Pa across
   `habitat-airlock` at tick 120, 5,323 Pa at tick 188 and 4,391 Pa at tick 189. The
   model gives the habitat 107,681.0 Pa and the airlock 37,095.6 Pa at tick 120,
   101,565.0 Pa and 98,060.0 Pa at tick 190, and 101,250.9 Pa at 292.897 K and
   101,172.4 Pa at 292.804 K at tick 209, with no alarm. G4 adds
   `e2e/golden/airlock.seed-7.json` (`e2e/airlock.e2e.ts`) on a ship that registers the
   interlock as `test/safety.test.ts` does. Its step table holds the drill's accepted
   commands alone, and it pins the snapshots at ticks 288, 317, 337, 446 and 466. The idle,
   life-support and safety goldens stay byte-identical. The gating module test
   `test/airlock.test.ts` runs the same drill in the library's `test` target. It reads
   `airlock-outer` refused at 9,089 Pa at tick 288 and 5,072 Pa at tick 316 and passed at
   tick 317, and `habitat-airlock` refused at 101,339 Pa at tick 288, 110,413 Pa at tick 337,
   109,401 Pa at tick 338 and 5,915 Pa at tick 445 and passed at tick 446. It also asserts
   the log's ticks 1, 289, 318, 338 and 447, the merged entry of tick 338, a gap of
   132.5 Pa ± 1 Pa across the inner door at tick 466, and no alarm on any tick from 1 to 466.
   G5 adds the comms fields and the 0 W `comms` load to the idle, life-support,
   safety and airlock goldens, which gain 42, 42, 42 and 70 lines and change none. The
   record and the setpoint came first, at 24, 24, 24 and 40 lines, and the move added the
   load, at 18, 18, 18 and 30. G5 adds `e2e/golden/comms.seed-7.json` (`e2e/comms.e2e.ts`)
   on the relay graph with a stubbed `fetch`: throttle 0.01, `online` and `hail` at tick 0,
   pinned at ticks 1, 5 and 600 in 494 lines. Tick 1 holds the send at 5,000,000 W, and
   ticks 5 and 600 hold the reply of tick 5. With the G5 fields stripped, its ticks 1 and
   600 equal the life-support golden's ticks 1 and 600 byte for byte. G6 adds the drive and
   helm records, their setpoints and the 0 W `thrusters` and `main-drive` loads to the
   idle, life-support, safety, airlock and comms goldens, which gain 90, 90, 90, 150 and
   90 lines and change none by Myers, histogram, patience and `diff`. The records and the
   setpoints came first, at 54, 54, 54, 90 and 54 lines, and the wiring added the loads,
   at 36, 36, 36, 60 and 36. With the G6 fields stripped, each replay equals the committed
   golden byte for byte. G6 adds `e2e/golden/helm.seed-7.json` (`e2e/helm.e2e.ts`) on the
   offline graph: throttle 0.6, a course to Kepler-442b and a burn at level 1 at tick 0,
   pinned at ticks 1, 50, 688 and 1,200 in 774 lines. Tick 1 holds both sheds and their
   alarms. Tick 50 holds the helm at `0.2567`, `0.01322` and `-398800` and the drive at
   `0.003188`, `0.001594` and `0.0007971`, the first powered tick of the off-axis burn.
   Tick 688 holds the settle with the velocity `1.144` and the distance `182`, and
   tick 1,200 the velocity `2.065`, the distance `593` and the coolant `1064`. G7 adds the
   FTL record and setpoints to the six goldens, which gain 30, 30, 30, 50, 30 and 40 lines
   and change none, 10 lines per snapshot. With the `ftl` fields stripped, each replay
   equals the committed golden byte for byte, and no earlier golden gains a load. G7 adds
   `e2e/golden/ftl.seed-7.json` (`e2e/ftl.e2e.ts`) on the offline graph with `FtlDrive`
   loaded: throttle 1 at tick 0, a spool after tick 100 and a jump to Kepler-442b after
   tick 300, pinned at ticks 101, 300 and 301 in 620 lines. Tick 101 holds the first spool
   tick at 900,000,000 W and the coolant at `571.9`, tick 300 the full charge and the
   coolant at `832.6`, and tick 301 the jump with the load at 0 W and the coolant at
   `844.4`. G8 adds the weapons record, its setpoints and the 0 W `railgun` load to the
   idle, life-support, safety, airlock, comms, helm and ftl goldens, which gain 51, 51,
   51, 85, 51, 68 and 51 lines and change none by Myers, histogram, patience and `diff`.
   The record and the setpoints came first, at 33, 33, 33, 55, 33, 44 and 33 lines, 11 a
   snapshot, and the wiring added the load, at 18, 18, 18, 30, 18, 24 and 18, 6 a
   snapshot. With the G8 fields stripped, each replay equals the committed golden byte
   for byte. G8 adds `e2e/golden/weapons.seed-7.json` (`e2e/weapons.e2e.ts`) on the
   offline graph: throttle 1 at tick 0, a fire at 10,000 m after tick 30 and a fire at
   50,000 m after tick 40, pinned at ticks 31, 32, 35 and 41 in 882 lines. The railgun
   load reads 300, 300, 200 and 0 MW at those ticks, and the coolant `507.1`, `507.7`,
   `509.1` and `512.5`, where the same run with no shot reads `507.6` at tick 32. Tick 35
   holds `charged` at 400,000,000 J, and tick 41 the miss with 100,000,000 J.

The goldens run on Node only, and on the version `.nvmrc` names: the golden suite reads
`.nvmrc` and fails, naming both versions, when `process.versions.node` differs. A golden
is then written and read on one Node. A case in the library's `test` target asserts
rounded idle values that hold on any Node. `Math.exp` and `Math.cos` are not required to
round identically across engines, and a threshold such as a fire's ignition draw can flip
on the last bit. The workerd, Deno and Bun legs of `bridge-api`'s `e2e-growth` target run
eight cases: the shape of `/sim` at tick 0, 600 ticks to rounded values far from any
threshold, a first telemetry frame (section 7.1), from G4 the airlock drill, whose reads
sit far from each threshold (the outer door opens 1,051 Pa under the interlock, and the
inner door five fill ticks from the limit on either side), from G5 a hail on the offline
ship, where every number it reads is an integer, from G6 a course and an aligned burn, and
from G7 a spool and a jump on the offline ship, where every value it reads is an integer, a
string or null, and from G8 two railgun shots on the offline ship, where every value it
reads is an integer, a string, a boolean or `null`.
Each of the four pinned cases prints a `sim-pin` line per leg with the size and FNV-1a hash of each pinned
`/sim` body, and CI's demo-growth job measured these figures on the Hono, Express and
Fastify servers under Node, on workerd, on Deno 2.9.6 and on Bun 1.4.2. All six legs agree
on the hail byte for byte: the final `/sim` of the case reads 2,288 bytes with FNV-1a
`181f9840` on each. They agree on the course and the burn too: the case's `/sim` at tick
800 reads 2,333 bytes with FNV-1a `3466c837`, and its final `/sim` 2,370 bytes with
`fd72940e`. They agree on the spool and the jump: the case's `/sim` at tick 300 reads 2,395
bytes with FNV-1a `db4dbc5a`, and its final `/sim` 2,376 bytes with `6694a911`. They agree
on the two shots: the case's `/sim` at tick 35 reads 2,372 bytes with FNV-1a `172abcf9`,
and its final `/sim` 2,356 bytes with `4099bd3d`.

`Math.cos` differs by one ulp between Node 24.20.0, Deno 2.9.6 and Bun 1.4.2 on about 3 %
of angles (606, 841 and 853 of 20,000 seeded angles in (−π, π] for the three pairs), and
Node and Deno differ although both run V8. The helm uses `+ − · /`, `Math.ceil`,
`Math.abs`, `Math.min`, `Math.max` and compares, which ECMA-262 fixes bit for bit, so the turn and its settle tick
are the same on every engine. The drive calls `Math.cos(θ_start − θ_course)`. Once the
start-of-tick helm has settled, that angle is exactly 0, and ECMA-262 fixes `Math.cos(±0)`
at 1, so the aligned burn gives the same doubles on every engine. A burn during a turn never
reaches a cross-engine check:

| Check                                         | Engines                | What it reads                                                                 |
| --------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| the goldens (`e2e-growth`, the `.nvmrc` Node) | one Node               | the off-axis burn during the turn, rounded                                    |
| `test/helm.test.ts`, gating                   | Node                   | the off-axis burn to 1 × 10⁻⁶ and 1 × 10⁻⁴, the aligned burn to 1 × 10⁻¹²     |
| `the helm commands on %s`, gating             | Node, three frameworks | ticks 1 and 2: integers and basic-arithmetic values, with the drive unpowered |
| the runtime case `courseAndBurn`              | six runtimes           | the settled helm at tick 800, then the aligned burn exact                     |
| the console's growth case                     | a Node backend         | the settled helm and the aligned burn                                         |

The runtime case reads the settled helm at tick 800 before it posts the burn, so a change
that moved the settle past tick 800 fails that read before any burn. The settle falls at
tick 697 in the case, 103 ticks before the read. ECMA-262 fixes no rounding for the coolant
step's `t ** 4` either. That step predates G6, and the runtime case reads no coolant
figure.

The FTL drive uses `+ − · /`, `Math.min` and compares, which ECMA-262 fixes bit for bit.
Its gates compare the reactor level, which the ramp's arithmetic fixes, and the coolant,
whose `t ** 4` ECMA-262 does not fix. The coolant sits near 830 K, 470 K under the 1,300 K
gate, so every engine takes the same branch, and `spoolAndJump` reads no coolant figure.

The railgun's charge uses `+ − · /`, `Math.min` and compares, which ECMA-262 fixes bit for
bit, and at dt 0.5 every charge is a multiple of 50,000,000 J. The hit compares a draw with
`0.8 · exp(−range / 50 km)`, and ECMA-262 does not fix `Math.exp`, so a draw near the
chance could flip on the last bit. `fireRailgun` fires at 10 km on the first draw (0.5777
against 0.6550, a gap of 0.077) and at 50 km on the second (0.8633, above the 0.8 ceiling
of any range), so no engine can disagree on a hit. The record keeps no hit chance, so
`/sim` sends no result of `Math.exp`, and `fireRailgun` reads no coolant figure.

From G4 a gating case in
`test/routes.test.ts` posts life-support commands to the bridge on the three frameworks
(section 7.1), from G5 `the comms commands on %s` posts the hail on each, and from G6
`the helm commands on %s` posts a course and a burn on each, from G7
`the ftl commands on %s` posts a spool and a jump on each, and from G8
`the weapons commands on %s` posts its fires on each.

S6 keeps old cases stable. In the seeded scenario, a new system starts at zero demand and
zero effect, and only its own cases command it. The RNG forks of S5 keep the numbers
older systems draw unchanged.

Console e2e reads the telemetry strip after `/sim/advance` and, from G1, submits a
command form. Federation e2e reads a station's gauges from a `bridge-api` started in
manual mode.

The console's growth cases run in its `e2e-growth` target, `nx:run-commands` with
`dependsOn: ["build", "^build"]`, which runs
`playwright test --config
playwright.e2e-growth.config.mts` with `testDir: './e2e/growth'`
on ports 4220 and 4221. `playwright.servers.mts` exports `webServers(ports)` for both
configs. The gating config keeps 4210 and 4211 and sets `testIgnore: ['**/growth/**']`,
since Playwright prefixes a glob with that segment itself and Nx's `e2e-ci` inference does
not. The first case starts from the current tick, since the backend keeps its ship across
retries. It reads the ship's tick from `GET /sim`, finds it in the strip on
`/diagnostics`, posts 600 ticks to the backend and reads a tick 600 higher, its ship time,
293 K and 101.3 kPa from the stream. The second case finds `Simulation`, `MeridianSystems`
and `Telemetry` on `/diagnostics`, with `system: Telemetry` on the feed. From G2,
`e2e/growth/life-support.spec.ts` sets throttle 0.01, brings life support online, posts
600 ticks and reads the habitat analyzer from 292.5 K to 292.8 K and 101.0 kPa to 101.2
kPa, and a heater from 2,000 W to 5,000 W. `online` is one-way on the shared manual ship,
so the config runs that case in a second project, `life-support`, which depends on
`chromium`. G3 adds a third project, `safety`, which depends on `life-support`, and the
`chromium` project ignores both cases. Its case opens `bridge-habitat`, reads the
interlock's refusal on `airlock-outer`, then closes `bridge-habitat`, reading each
flight-log line. It drills `reactor-bay` and reads `FIRE in reactor-bay`, then floods it
and reads `No alarms` 70 backend ticks later. G4 adds a fourth project, `airlock`, which
depends on `safety`, and the `chromium` project ignores its case too. `bridgeApi`,
`gauge`, `advance` and `reading` move into `e2e/growth/ship.ts`, and the life-support and
safety cases import them with every `test(...)` body byte-identical. The airlock case,
`e2e/growth/airlock.spec.ts`, runs the drill on `/airlock` from the ship's current tick
with the tick counts of `airlockDrill`. After 300 pump-down ticks the airlock side reads
8.5 to 9.5 kPa, and the outer door's open shows the interlock's refusal and its `Fix:`
line. After 40 vent ticks it reads 3.5 to 4.5 kPa, and the open shows its flight-log line.
After 20 more ticks the airlock side reads 0.0 kPa, and after 114 fill ticks the inner
door opens with its flight-log line. Twenty ticks later the inner door's sides read within
0.5 kPa of each other. The case ends with `No alarms` on `/systems/safety` and no console
error. G5 adds a fifth project, `comms`, which depends on `airlock`, and the `chromium`
project's `testIgnore` becomes `/(life-support|safety|airlock|comms)\.spec\.ts/`. The
case, `e2e/growth/comms.spec.ts`, reads `standby` and `No` on `/systems/comms` from the
ship's tick `t`, and the hail button shows `Queued for tick t + 1`. After 10 backend ticks
and a reload the page reads `no subspace link`, `Yes`, `none`, `0.0 MW` and `No messages`,
with no console error. The shared ship has no link, so its hail stays queued for good and
the case runs last. G6 adds a sixth project, `helm`, which depends on `airlock`, and
`comms` moves to `dependencies: ['helm']`, so the comms case still runs last. The
`chromium` project's `testIgnore` becomes
`/(life-support|safety|airlock|helm|comms)\.spec\.ts/`. The case,
`e2e/growth/helm.spec.ts`, starts from the ship's tick `t` with life support online at
throttle 0.01. A turn needs the reactor above 0.0165, so it first sets the throttle to 0.6
on `/systems/engineering` (`Queued for tick t + 1`) and posts 10 backend ticks.
`/systems/helm` then reads `Heading 0.0°`, `Course 0.0°` and `Thrust 0 N`, and "Plot
course" for Kepler-442b shows `Queued for tick t + 11`. After 800 ticks and a reload the
page reads `Heading 42.0°`, `Course 42.0°`, `Turn rate 0.00 °/s`, `Thruster torque 0 N·m`
and `Thruster power 0.0 MW`. "Burn" at level 1 shows `Queued for tick t + 811`, and after
400 ticks and a reload the page reads `Thrust 14,400 N`, `Propellant flow 0.288 kg/s`,
`Acceleration 0.0036 m/s²`, `Velocity 0.72 m/s`, `Distance 72 m` and
`Drive power 600.0 MW`. `/systems/safety` reads `No alarms`, with no console error. Each
read is exact on any start tick, since the burn starts after the settle. G7 adds a seventh
project, `ftl`, which depends on `helm`, and `comms` moves to `dependencies: ['ftl']`, so
the comms case still runs last. The `chromium` project's `testIgnore` becomes
`/(life-support|safety|airlock|helm|ftl|comms)\.spec\.ts/`. The case,
`e2e/growth/ftl.spec.ts`, starts from the ship's tick `t` at a throttle of 0.6 with the
helm settled at 42° and the drive burning at level 1. It sets the throttle to 1 on
`/systems/engineering` and the burn to 0 on `/systems/helm`, each `Queued for tick t + 1`,
so the spool fits beside the other loads, and posts 40 backend ticks. `/systems/ftl` then
reads `offline`, `0.0 GJ` and `Sol`, since no earlier project loads the drive, and "Spool
drive" shows `Queued for tick t + 41`. After 200 ticks and a reload the page reads
`charged` and `90.0 GJ`. "Jump" to Proxima-b shows `Queued for tick t + 241`, and after one
tick and a reload the page reads `idle`, `0.0 GJ`, `Proxima-b` and `tick t + 241`.
`/systems/safety` reads `No alarms`, with no console error. The level climbs from 0.6 to
0.9 in 30 ticks, so the spool draws from `t + 41` on any start tick and each read is exact.
The backend is a Node server with `nodeScopes()`, so the case runs the section's extend.
G8 adds an eighth project, `weapons`, which depends on `ftl`, and `comms` moves to
`dependencies: ['weapons']`, so the comms case still runs last. The `chromium` project's
`testIgnore` becomes `/(life-support|safety|airlock|helm|ftl|weapons|comms)\.spec\.ts/`. The
case, `e2e/growth/weapons.spec.ts`, starts from the ship's tick `t` at throttle 1 with
life support online, the burn at 0 and the FTL drive disarmed after its jump, and
advances the backend through `POST /sim/advance`. `/systems/weapons` reads
`idle`, `No` and `0.0 MJ`, and "Fire" at 10,000 m shows `Queued for tick t + 1`. After one
backend tick and a reload the page reads `charging`, `150.0 MJ`, `300.0 MW` and
`10,000 m`, and after one more `1`, `1` and `hit at 10,000 m, tick t + 2`. After four more
ticks it reads `charged`, `400.0 MJ` and `0.0 MW`. `/systems/safety` reads `No alarms`,
with no console error. The server starts fresh with `SIM_SEED=7`, and no earlier project
fires, so the shot draws the first number of `fork('Weapons')` and hits on every run.

G9 reads section 7.4's "one e2e case per app" as one case per remote project, since each
station has its own build and port. The shell's growth cases run in its `e2e-growth`
target, with `playwright.e2e-growth.config.mts` and `testDir: './e2e/growth'`. The
projects are `engineering`, `command` and `life-support`, in that order, and all three run
in the shell's suite, since a remote runs only inside the shell. They read a manual
`bridge-api` on seed 7, started on the Hono entry. The growth shell takes `SHELL_PORT + 30`
(4330 by default) and `bridge-api` 4331. Each remote takes its dev port plus 30: `command`
4332, `engineering` 4335 and `life-support` 4336. `bridge-api` gets no e2e case, since the
growth suite drives its Hono entry and `cors.test.ts` covers the headers.

## 9. Risks

| Risk                                                                                                              | What the spec does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ship logic hides NexusDI. A reader opens a module and meets thermodynamics.                                       | Physics lives in `src/physics/` with no NexusDI import (S2). A module file holds tokens, providers and one delegation per system (section 3.4), and the reviewer refuses a module file over 120 lines. Each system's README section names the NexusDI feature it shows first, then the physics.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| The demo teaches odd DI. Compartments as request scopes, or a loaded system that attaches itself, read as tricks. | Section 6 gives the reason for each pairing. The scope carries one request's compartment, and nothing in the simulation holds a scope beyond a request. The attach in G7 is the documented `all()` rule, stated where it happens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Bundle size. A console or station bundles the simulation.                                                         | Frontends take `import type` only, and the console takes the star charts from `@nexusdi/meridian-systems/charts`, which holds no token. A G0b test greps the console's client build and each station's build for the descriptions of `TICK_LOOP`, `SHIP_STATE`, `SIM_CLOCK`, `RNG`, `DECK_PLAN` and `TELEMETRY`, and fails on a hit. A minifier keeps a token's description as a string and renames function names, so `stepAtmosphere` serves as no sentinel. The console's case sits in the gating `e2e/fresh-server.spec.ts` and the stations' in `examples/federation-shell/e2e/bundle.spec.ts`. From G9 each station's build covers `federation-engineering` and `federation-life-support`, and no contract token description contains a sentinel. |
| CI time grows with every increment.                                                                               | Each increment adds at most one e2e case per app, and the physics tests run in milliseconds. Manual mode advances 600 ticks in well under a second. The demo spec's 8-minute budget for `demo-apps` stands, since growth e2e cases run in `demo-growth` (section 14) until a green RC cycle promotes them.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Floating-point drift across engines breaks a golden.                                                              | Goldens run on Node only; other runtimes run a smoke case (section 8.3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A new system changes older e2e expectations.                                                                      | S5 and S6: per-system RNG forks, and idle at start.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Vocabulary drift. The simulation adds about forty names, and a docs page or post picks one up before §7.1 has it. | Section 10 proposes every row. The demo plan's PR G carries them to `spec/docs-site`. Until a row is there, no docs page uses the name, and the domain guard's interface list gains the new interfaces, none ending in `Service`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| "Tactical" reads as weapons to a naval reader.                                                                    | `Tactical` keeps navigation, as §7.1 has it, and the weapons module is `Weapons`. Section 10.2 records the rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Humour creeps in through ship colour (alarm text, hail messages).                                                 | §7.4 binds the demo text too: alarm and hail text states facts (`fleet traffic control: sector clear`), and the reviewer checks it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## 10. Vocabulary

### 10.1 Proposed §7.1 rows, service table

These rows go to `spec/docs-site` with the demo plan's PR G, after the demo apps' own
rows. Until they reach that branch, no docs page uses them.

| Interface            | Token                                                                             | Class                                                           | Lifetime  | Bound in, with deps                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ISimClock`          | `SIM_CLOCK`, described `'SimClock'`                                               | `FixedStepClock`                                                | singleton | `Simulation`, `[SIM_OPTIONS]`                                                                                              |
| `IRandomSource`      | `RNG`, described `'RandomSource'`                                                 | `SeededRandom`                                                  | singleton | `Simulation`, `[SIM_OPTIONS]`                                                                                              |
| `IShipState`         | `SHIP_STATE`, described `'ShipState'`                                             | `ShipStateStore`                                                | singleton | `Simulation`, `[DECK_PLAN]`                                                                                                |
| `ITickLoop`          | `TICK_LOOP`, described `'TickLoop'`                                               | `FixedStepLoop`                                                 | singleton | `MeridianSystems`, `[SIM_CLOCK, SHIP_STATE, RNG, all(SHIP_SYSTEMS)]`                                                       |
| `IShipSystem`        | `SHIP_SYSTEMS`, a `MultiToken<IShipSystem>`                                       | one physics class per system                                    | singleton | each system module                                                                                                         |
| `DeckPlan`           | `DECK_PLAN`                                                                       | the deck file                                                   | value     | `Simulation`                                                                                                               |
| `CompartmentId`      | `COMPARTMENT`, described `'Compartment'`                                          | `compartmentOfRequest`, a factory over `REQUEST`                | scoped    | `Simulation`, `[REQUEST]`, `eager: false`                                                                                  |
| `ICoolantLoop`       | `COOLANT_LOOP`, described `'CoolantLoop'`                                         | `RadiatorLoop`                                                  | singleton | `Engineering`, no deps; not exported                                                                                       |
| `ICommandHandler`    | `COMMAND_HANDLERS`, a `MultiToken<ICommandHandler>` described `'CommandHandlers'` | one handler class per system; `EngineeringCommands` in G1       | singleton | each system module; `Engineering`, `[REACTOR, SHIELD_GRID]`                                                                |
| `ICommandDesk`       | `COMMAND_DESK`, described `'CommandDesk'`                                         | `CommandDesk`                                                   | singleton | `MeridianSystems`, `[all(COMMAND_HANDLERS)]`                                                                               |
| `IAtmosphereSensor`  | `ATMOSPHERE_SENSOR`, described `'AtmosphereSensor'`                               | `GasAnalyzer`                                                   | transient | `LifeSupport`, `[COMPARTMENT, SHIP_STATE, ATMOSPHERE_PROBE]`                                                               |
| `IAtmosphereProbe`   | `ATMOSPHERE_PROBE`, described `'AtmosphereProbe'`                                 | `CalibratedProbe`                                               | singleton | `LifeSupport`, `[RNG, LIFE_SUPPORT_OPTIONS, DECK_PLAN]`                                                                    |
| `IAtmosphereControl` | `ATMOSPHERE_CONTROL`, described `'AtmosphereControl'`                             | `EnvironmentalController`                                       | singleton | `LifeSupport`, `[SHIP_STATE]`                                                                                              |
| `IPowerConsumer`     | `POWER_CONSUMERS`, a `MultiToken<IPowerConsumer>` described `'PowerConsumers'`    | one class per system that draws power; `LifeSupportPower` in G2 | singleton | each system module; `LifeSupport`, `[LIFE_SUPPORT_OPTIONS, DECK_PLAN]`                                                     |
| `IBlastDoors`        | `BLAST_DOORS`                                                                     | `BlastDoorControl`                                              | singleton | `Safety`, `[SHIP_STATE]`; `open` wrapped by `PressureInterlock`, and `open` and `close` by `bridge-api`'s `FlightRecorder` |
| `IFireSuppression`   | `FIRE_SUPPRESSION`                                                                | `InertGasSuppression`                                           | singleton | `Safety`, `[SHIP_STATE]`                                                                                                   |
| `IAlarmSink`         | `ALARM_SINKS`, a `MultiToken<IAlarmSink>`                                         | `AuditAlarmSink`                                                | singleton | `bridge-api`'s global `AlarmPanel`, `[AUDIT_LOG]`; `Safety` binds none                                                     |
| `IMasterAlarm`       | `MASTER_ALARM`                                                                    | `MasterAlarm`                                                   | singleton | `Safety`, `[TICK_LOOP, all(ALARM_SINKS)]`                                                                                  |
| `ICommsArray`        | `COMMS_ARRAY`, described `'CommsArray'`                                           | `PhasedArray`                                                   | singleton | `Comms` or `OfflineComms`, `[SHIP_STATE, optional(SUBSPACE_LINK)]`                                                         |
| `IMainDrive`         | `MAIN_DRIVE`                                                                      | `PlasmaDrive`                                                   | singleton | `Propulsion`, `[SHIP_STATE]`                                                                                               |
| `IThrusters`         | `THRUSTERS`                                                                       | `RcsThrusters`                                                  | singleton | `Helm`, `[SHIP_STATE]`                                                                                                     |
| `IHelm`              | `HELM`                                                                            | `HelmControl`                                                   | singleton | `Helm`, `[THRUSTERS, MAIN_DRIVE, NAV_CHARTS]`                                                                              |
| `IFtlDrive`          | `FTL_DRIVE`                                                                       | `JumpDrive`                                                     | singleton | `FtlDrive`, `[TICK_LOOP, SHIP_STATE, NAV_CHARTS, POWER_ROUTER]`                                                            |
| `IWeaponMount`       | `WEAPON_MOUNT`                                                                    | `RailgunMount`                                                  | singleton | `Weapons`, `[SHIP_STATE, SIM_OPTIONS, lazy(POWER_ROUTER)]`                                                                 |
| `ITelemetryFeed`     | `TELEMETRY`, described `'TelemetryFeed'`                                          | `SnapshotFeed`                                                  | singleton | `Telemetry`, `[TICK_LOOP, SHIP_STATE, DECK_PLAN]`                                                                          |
| `ITelemetryClient`   | `TELEMETRY_CLIENT`, described `'TelemetryClient'`                                 | `EventSourceTelemetry`                                          | singleton | the console's `TelemetryClient`, no deps                                                                                   |
| `ISimDriver`         | `SIM_DRIVER`                                                                      | `WallClockDriver`                                               | singleton | `bridge-api`'s `SimDriver`, `[TICK_LOOP, SIM_OPTIONS, DRIVER_OPTIONS]`                                                     |
| `IStationTelemetry`  | `TELEMETRY_FEED`, described `'meridian/StationTelemetry'`                         | `BridgeTelemetry`                                               | singleton | the shell's `Tactical`, `[BRIDGE_ENDPOINT]`                                                                                |
| `ICommandLink`       | `COMMAND_LINK`, described `'meridian/CommandLink'`                                | `BridgeCommandLink`                                             | singleton | the shell's `Tactical`, `[BRIDGE_ENDPOINT]`                                                                                |
| `IBridgeEndpoint`    | `BRIDGE_ENDPOINT`                                                                 | `RuntimeBridgeEndpoint`                                         | singleton | the shell's `Tactical`, no deps                                                                                            |
| `IHelmOrders`        | `HELM_ORDERS`                                                                     | `HelmOrders`                                                    | singleton | `Command`, `[COMMAND_LINK]`                                                                                                |
| `IEngineRoom`        | `ENGINE_ROOM`                                                                     | `EngineRoom`                                                    | singleton | `EngineeringStation`, `[TELEMETRY_FEED]`                                                                                   |
| `IAtmosphereDesk`    | `ATMOSPHERE_DESK`                                                                 | `AtmosphereDesk`                                                | singleton | `LifeSupportStation`, `[TELEMETRY_FEED, COMMAND_LINK]`                                                                     |
| `SimOptions`         | `SIM_OPTIONS`                                                                     | the `forRoot()` value                                           | none      | `Simulation`                                                                                                               |
| `DriverOptions`      | `DRIVER_OPTIONS`                                                                  | the `forRoot()` value                                           | none      | `bridge-api`'s `SimDriver`                                                                                                 |
| `LifeSupportOptions` | `LIFE_SUPPORT_OPTIONS`                                                            | the `forRootAsync()` value                                      | none      | `LifeSupport`                                                                                                              |

`ITickLoop` gains `listen(listener: TickListener)`, which returns an idempotent
unsubscribe, with `type TickListener = (ship: ShipSnapshot) => void`. Beside the table,
the library exports `readShip(ship, deck)`, which returns a `ShipReading` with a
`CompartmentReading` per compartment, the `CompartmentState` plus its `pressure`.

Changed rows: `IReactorCore` gains "in the simulation, `[SHIP_STATE]`; `output` is the
electric output in W, 1.21e9 W at full (the docs ship's class keeps its own `output` in GW); `throttle(level)` queues the setpoint; its
disposer is the scram". `IPowerRouter` gains `[SHIP_STATE, all(POWER_CONSUMERS)]` in the
simulation, with `loads(ship)` and `divert(load)`.
`IShieldGrid` gains `[SHIP_STATE, lazy(POWER_ROUTER)]` in the simulation, with `draw(ship)` and
the `raise()` and `lower()` commands. `IShipSystem` gains `EngineeringPhysics`,
Engineering's contribution, with `[REACTOR, COOLANT_LOOP, POWER_ROUTER]`, and
`LifeSupportPhysics`, LifeSupport's, with `[LIFE_SUPPORT_OPTIONS, DECK_PLAN]`.
`ICommandHandler` gains `LifeSupportCommands`, with `[ATMOSPHERE_CONTROL]`. From G3
`IShipSystem` gains `SafetyPhysics`, Safety's, with `[DECK_PLAN, ATMOSPHERE_PROBE]`, and
`ICommandHandler` gains `SafetyCommands`, with `[BLAST_DOORS, FIRE_SUPPRESSION]`. From G5
`IShipSystem` gains `CommsPhysics`, `IPowerConsumer` gains `CommsPower` and
`ICommandHandler` gains `CommsCommands`, each Comms' contribution with `[COMMS_ARRAY]`.
From G6 `IShipSystem` gains `PropulsionPhysics`, Propulsion's, with `[MAIN_DRIVE]`, and
`HelmPhysics`, Helm's, with `[THRUSTERS]`. `IPowerConsumer` gains `PropulsionPower` with
`[MAIN_DRIVE]` and `HelmPower` with `[THRUSTERS]`, and `ICommandHandler` gains
`HelmCommands`, Helm's, with `[HELM]`. `IMainDrive` and `IThrusters` each have `rating`,
beside `throttle(level)` and `steer(heading)`. `IHelm` has `course(to)` and `burn(level)`.
`ISubspaceLink`, `INavCharts` and `CommsOptions` keep their §7.1 rows in the library:
`SubspaceRelay` binds the link in `Comms` alone with `[COMMS_OPTIONS]`, `OfflineComms`
binds none, and `INavCharts` gains `new StarCharts(BUNDLED_CHARTS)`, a value in
`OfflineTactical`. `COMPUTER`
keeps its §7.1 row for the docs regions, and the simulation binds none.
From G7 `ITickLoop` gains `attach(system)` and `IPowerRouter` gains `attach(consumer)`,
each returning a detach that runs twice safely. The `IFtlDrive` row keeps its deps, and
`IFtlDrive` has `rating`, `spool()` and `jump(to)`.
From G8 the `IWeaponMount` row reads `[SHIP_STATE, SIM_OPTIONS, lazy(POWER_ROUTER)]`, where
it first read `[SHIP_STATE, RNG]`, and `IWeaponMount` has `rating` and `fire(range)`.
`IShipSystem` gains `WeaponsPhysics`, Weapons' contribution, with `[WEAPON_MOUNT]`,
`IPowerConsumer` gains `WeaponsPower` with `[WEAPON_MOUNT, SIM_OPTIONS]`, and
`ICommandHandler` gains `WeaponsCommands` with `[WEAPON_MOUNT]`.
G9 adds the six rows from `IStationTelemetry` to `IAtmosphereDesk`, and none of the six
interfaces ends in `Service`.

### 10.2 Proposed §7.1 rows, other things

| Thing                  | The name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The simulation         | `examples/meridian-systems`: the system modules and the physics. `bridge-api` runs it. A tick is `0.5 s` of ship time; the seed of every test is 7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| A ship system          | A module that contributes one `IShipSystem` to `SHIP_SYSTEMS`: `Engineering`, `LifeSupport`, `Safety`, `Comms`, `Propulsion`, `Helm`, `Weapons`. `FtlDrive` loads after startup and contributes none: `JumpDrive` attaches its physics with `TICK_LOOP.attach()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| A compartment          | `bridge`, `habitat`, `reactor-bay`, `airlock`; `COMPARTMENT` is the one a request names.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| A door                 | `bridge-habitat`, `habitat-reactor-bay`, `habitat-airlock`, `airlock-outer`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| A snapshot             | `ShipSnapshot`, the frozen state of one tick; `SHIP_STATE.snapshot()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| A ship reading         | `ShipReading`, a rounded snapshot with each compartment's pressure; `readShip(ship, deck)`. The routes and the telemetry frames send it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| A tick listener        | `TickListener`, a function `TICK_LOOP.listen()` calls with each committed snapshot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| A command              | `ShipCommand`, `{ system, action, ...args }`: `{ system: 'engineering', action: 'throttle', level: 1 }`. `COMMAND_DESK` hands it to its system's handler, which queues a `SetpointChange` on `SHIP_STATE` for the next tick. The desk answers a `QueuedCommand`, `{ tick }`. Changes queued between two ticks apply together at the next tick, and the log keeps one entry per tick, a `LoggedChange`, `{ tick, change }`, holding their merge.                                                                                                                                                                                                                                                                                                                                                                 |
| An interlock           | `PressureInterlock`, an interceptor on `BLAST_DOORS.open`, at `@nexusdi/meridian-systems/interlock`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| An alarm               | `HYPOXIA`, `CO2_HIGH`, `PRESSURE_LOW`, `TEMPERATURE`, `FIRE`, `COOLANT_HIGH`, `REACTOR_TRIP`, `LOAD_SHED`, `DECOMPRESSION`, `SENSOR_FAULT`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| The ship's error codes | `MERIDIAN_INTERLOCK`, `MERIDIAN_POWER_BUDGET`, `MERIDIAN_BAD_COMMAND`, `MERIDIAN_FTL_NOT_SPOOLED`, `MERIDIAN_UNKNOWN_COMPARTMENT`, `MERIDIAN_RELAY`, with `InterlockError`, `PowerBudgetError`, `BadCommandError`, `FtlNotSpooledError`, `UnknownCompartmentError`, `RelayError` and the text pack `shipText`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| A rating               | The fixed figures of a part, beside its pure functions in `src/physics/`: `ReactorRating` (`FUSION_REACTOR`), `CoolantRating` (`LITHIUM_LOOP`), from G2 the `LifeSupportRatings` (`LIFE_SUPPORT_RATINGS`) of `ELECTRIC_HEATER`, `CO2_SCRUBBER`, `ELECTROLYSER`, `TRANSFER_PUMP` and `SPACE_VENT`, and from G6 `HullRating` (`HULL`), `DriveRating` (`PLASMA_DRIVE`) and `ThrusterRating` (`RCS_THRUSTERS`), beside the helm's control law `HELM_TUNING` and `HELM_SETTLE`, from G7 `FtlRating` (`FTL_SPOOL`), read through `IFtlDrive.rating`, and from G8 `RailgunRating` (`RAILGUN`), read through `IWeaponMount.rating`.                                                                                                                                                                                     |
| A record               | One part's state in the snapshot: `ReactorRecord`, `CoolantRecord`, `PowerRecord` with its `LoadRecord`s, `LifeSupportRecord` from G2, `SafetyRecord` from G3, `CommsRecord` from G5, `DriveRecord` and `HelmRecord` from G6, `FtlRecord` from G7, `WeaponsRecord` with its `RailgunShot` from G8, and `Setpoints` with `LifeSupportSetpoints`, from G3 `SafetySetpoints`, from G5 `CommsSetpoints`, from G6 `DriveSetpoints` and `HelmSetpoints`, from G7 `FtlSetpoints` and from G8 `WeaponsSetpoints`.                                                                                                                                                                                                                                                                                                       |
| A load                 | `PowerLoad`, `{ id, priority, demand, heatShare }`, a consumer that asks the router for power on a tick: `life-support`, `shields`, `comms`, from G6 `thrusters` and `main-drive`, from G7 `ftl-spool` and from G8 `railgun`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| A device               | An entry of a compartment's `equipment`: `heater`, `scrubber`, `oxygen`, `vent`, `pump`. An `AtmosphereReading` is one analyzer sample; `PumpMode` is `off`, `evacuate` or `fill`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| A system's classes     | `<System>Physics` for its `IShipSystem`, `<System>Commands` for its `ICommandHandler` and `<System>Power` or `<Device>Power` for its `IPowerConsumer`: `EngineeringPhysics`, `EngineeringCommands`, `ShieldPower`, `LifeSupportPhysics`, `LifeSupportCommands`, `LifeSupportPower`, `SafetyPhysics`, `SafetyCommands`, from G5 `CommsPhysics`, `CommsCommands`, `CommsPower`, from G6 `PropulsionPhysics`, `PropulsionPower`, `HelmPhysics`, `HelmCommands`, `HelmPower`, from G7 `FtlPhysics` and `FtlPower`, which `JumpDrive` builds and attaches, and from G8 `WeaponsPhysics`, `WeaponsPower` and `WeaponsCommands`.                                                                                                                                                                                       |
| A station              | A remote of the federation app that shows one system: `cartography`, `command`, `engineering`, `life-support`. The G9 stations name their sections `EngineeringStation` and `LifeSupportStation`; `cartography` and `command` keep `Cartography` and `Command`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Simulation doubles     | `FailingSensor implements IAtmosphereSensor` (`bridge-api`'s `test/doubles.ts` in G2), `FailingProbe implements IAtmosphereProbe` and `MemoryAlarmSink implements IAlarmSink` (the same file in G3), `LoopbackLink implements ISubspaceLink` (§7.1's double, in the same file in G5), `SimulatedFtlDrive` (a module in the same file in G7: it binds `FTL_DRIVE` to `SimulatedJumpDrive` with `[TICK_LOOP, SHIP_STATE]` and exports it; `spool()` and `jump(to)` queue with no check, its phase-3 system named `FtlDrive` fills the charge on an armed tick and jumps with no pulse. Its first unarmed step after the load writes `idle` once, as the drive's does. Its rating is `{ energy: 90e9, power: 0, pulseShare: 0, reactorLevel: 0, coolantLimit: Number.MAX_VALUE }`), `ShipUnderTest` (a test root). |
| A hail                 | `comms hail`, which queues `setpoints.comms.hail`; the reply is a `CommsMessage`, `{ tick, from, text }`: `fleet traffic control: sector clear`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A jump                 | `POST /ftl/spool` arms the spool, and `POST /ftl/jump` with a charted star moves the ship's sector there on a full charge; the ship starts in `Sol`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| A shot                 | `weapons fire` with a `range` in m from 0 to 100,000, which arms the mount and queues the range; the capacitor fires it on the first tick it holds 300 MJ, and `lastShot` records `{ tick, range, hit }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A course               | `helm course to <star>`, which plots the star on `NAV_CHARTS` and steers its heading in rad; `helm burn level <x>` sets the main drive's throttle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| The bundled charts     | `BUNDLED_CHARTS`, the headings in `deck/charts.json` that `OfflineTactical` plots and `bridge-api`'s test relay serves.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Ship notes             | `shipNotes`, a `GraphAnnotator` that labels each provider of the module that binds `TICK_LOOP`, and of every module it imports transitively, `system: <module name>`; the `phase: <n>` label joins in G1, and from G7 the walk also starts from a loaded `FtlDrive`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| A hull section         | A region of the ship's layout, such as the bridge or the reactor bay, holding one or more compartments (section 16.3). A section alone is a module added with `load()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| The network overlay    | A toggle in the MeridianOS chrome that draws the DI graph over the deck from `graph(ship)`, with `lazy()` and `optional()` edges dashed and a broken conduit for each missing provider (section 16.5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| A conduit              | A line of the deck view where a physics flow runs: a power conduit from `PlasmaRouter` to a load, the coolant loop and its branches, or an atmosphere duct through a door (section 16.4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

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
   relation. From G9 the contract is at 2.4.0 and the drift build at 2.5.0. The docs pages
   quote their regions' own 2.3.0 and 2.4.0, which stay.
3. `bridge-api`'s audit module file follows the `<name>.module.ts` form the other modules
   use. Plan B1 renames `src/ship/audit.ts` to `src/ship/audit-trail.module.ts` with the
   module.
4. The vocabulary rows of spec §9.2 call each remote a station, and plan G1 carries this
   spec's section 10 rows to `spec/docs-site` beside them.

Nothing else in the 0.4 plan changes. The routes, the e2e cases, the coverage table and
the CI budget stay as they are.

## 12. Out of scope

- A crew. No crew member is named, and occupants are counts.
- Orbital mechanics. The ship moves in one dimension, along its track, and a jump moves it
  from its sector, `Sol` before the first jump, to the charted star's.
- Multiplayer state. One `bridge-api` process runs one ship, and a second console sees the
  same ship.
- Saving and loading a game. The seed and the command log replay a run, and the demo
  stores neither.

## 13. Delivery

The 0.4 minimum is the demo plan with section 11's amendments. Each growth increment gets
its own short plan in `specs/plans/` when it starts, cut from the step of section 7.4,
with one PR per increment and the demo plan's review gates.

G2 names what it leaves to later increments:

- G3: door mixing (section 5.5), the alarms, `SENSOR_FAULT` with the failing-sensor
  alarm suite, and whether `DECOMPRESSION` fires for an unoccupied airlock under a vent
  (−4.18 kPa/s; the pump starts at −1.69 kPa/s).
- G3: a synchronous tick cannot read the request-scoped sensor, since `ATMOSPHERE_SENSOR`
  takes the scoped `COMPARTMENT` and `createScope` is async. G2 keeps the reading in the
  pure `readAtmosphere`, so G3 can evaluate the alarms on the snapshot. G3's architect
  decides how a test breaks a sensor the tick reads, such as a singleton
  `Token<IAtmosphereProbe>` that the tick and `GasAnalyzer` share.
- G4: the airlock drill scenario (pump down, vent, outer door, refill, interlock) and its
  golden.
- After G0b: the console's `lazySection` form of `/systems/:system`.
- No increment plans a condensation model (section 5.3), the cooling of the gas under a
  vent (section 5.4), or the heat of any device but the heaters (sections 5.2 and 5.6).

G3 settles both of its items. The five atmosphere alarms read occupied rooms only, so the
unoccupied airlock raises no `DECOMPRESSION` under its vent or its outer door, and G4
inherits that rule. The tick and `GasAnalyzer` share the singleton `ATMOSPHERE_PROBE`, and
a test breaks the tick's sensors with `FailingProbe` (section 5.11).

G4 settles its item: the drill runs the existing life-support and safety commands under the
interlock and adds no command. The unoccupied airlock raises no alarm under the drill
(section 5.11). An airlock sequencer, an `Airlock` module with its own commands, stays out
as the owner's option, since a tick-driven sequencer would write door setpoints past
`PressureInterlock`.

G5 leaves out a crew message (`comms send` with text), a station argument, the `LaserLink`
transport, a link that drops or returns during a run, a schema for `CommsOptions` and a
seventh bundle sentinel. A sentinel `'CommsArray'` would edit the sentinel lists of two
earlier e2e cases, so the console's and the shell's bundle checks keep their six. G5
changes no federation file, and nothing under `apps/docs` or `examples/meridian`.

G6 leaves out an attitude command apart from the course (a flip-and-burn to brake), a
`propulsion` command system of its own, a target distance and an arrival, a propellant
tank and the rocket equation, and a seventh bundle sentinel. The helm suite over
`SimulatedFtlDrive`, which section 8.2 gave G6, moves to G7, since `FtlDrive` arrives
there. G6 changes no federation file, and nothing under `apps/docs` or
`examples/meridian`: `examples/meridian/src/pages/lazy.md` defines its own `HELM_CONTROL`
token bound to `HelmStation`, and no page names the library's helm.

G7 leaves out a stand-down command, a jump range or travel time, a propellant cost, and a
seventh bundle sentinel. It runs the suite over `SimulatedFtlDrive` that G6 moved here, as
a jump suite in `bridge-api`'s `test/ftl.test.ts`. G7 changes no federation file, and
nothing under `apps/docs`, `examples/meridian/src` or any `libs/*/README.md` names
`FTL_DRIVE`, `FtlDrive` or `JumpDrive`. `apps/docs/content/load.mdx` teaches `load()`,
`extend()` and `di.load` with its own `Survey` and `Navigation` modules.

G8 leaves out a stand-down command, a target model, ammunition, a cooldown past the
charge, damage, a hit chance on the wire and a seventh bundle sentinel. G8 changes no
federation file, and nothing under `apps/docs`, `examples/meridian/src`,
`examples/federation-*` or any `libs/*/README.md` names `WEAPON_MOUNT`, `WeaponMount`,
`RailgunMount` or `railgun`.

G9 leaves out a crew command, a command system of a station, CORS on the Express, Fastify
and Workers entries, a telemetry reconnect, the heater, vent and pump controls on the
life-support station, and a seventh bundle sentinel. G9 changes nothing under `libs/` and
no docs region; the /federation/ page lists the two new folders.

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

| Date       | Decision                                                                                                                                                                                                                                                                                                                                                                                                             | Source                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 2026-10-21 | The ship is modelled on Stationeers, with the eight systems of decision 1                                                                                                                                                                                                                                                                                                                                            | owner, decision 1               |
| 2026-10-21 | A deterministic, seeded, fixed-step simulation on the backend; the console streams telemetry and commands                                                                                                                                                                                                                                                                                                            | owner, decision 2               |
| 2026-10-21 | The full domain designed now; a 0.4 minimum gates 0.4.0, and the rich systems form a growth track                                                                                                                                                                                                                                                                                                                    | owner, decision 3               |
| 2026-10-21 | Q1: growth increments merge green; their unit tests and graph check gate in `main` and the release verify step; their e2e runs in the non-required `demo-growth` job until a green RC cycle promotes it                                                                                                                                                                                                              | owner                           |
| 2026-10-21 | `TICK_LOOP` is bound in the global aggregate `MeridianSystems`, since `all()` reads only what its module can see; `Simulation` stays global with the other kernel tokens                                                                                                                                                                                                                                             | tech lead, G0 ruling 1          |
| 2026-10-21 | G0 is the kernel with `GET /sim` and `POST /sim/advance`; G0b takes telemetry, `/graph`, `shipNotes`, the console's strip and `/diagnostics`, the bundle check and the runtime smoke case; `BRIDGE_LINK.command` moves to G1                                                                                                                                                                                         | tech lead, G0 ruling 2          |
| 2026-10-21 | `meridianSystems(options: SimOptions)` takes `{ seed, dt }`; G5 widens it with `relayUrl`                                                                                                                                                                                                                                                                                                                            | tech lead, G0 ruling 3          |
| 2026-10-21 | The command queue and `attach()`/`detach()` wait for G1 and G7, and `COMPARTMENT` for G2; `DECK_PLAN`, the deck file and the initial air are in G0                                                                                                                                                                                                                                                                   | tech lead, G0 ruling 4          |
| 2026-10-21 | The driver's mode belongs to `bridge-api`: `SimDriver.forRoot({ mode })`; the static graphs run manual, and `setupFromEnv` defaults to live                                                                                                                                                                                                                                                                          | tech lead, G0 ruling 5          |
| 2026-10-21 | `bridge-api`'s graph check is a case in `test/check.test.ts`; the `graph` target stays the writer of `graph.json`                                                                                                                                                                                                                                                                                                    | tech lead, G0 ruling 6          |
| 2026-10-21 | The golden runs in the library's `e2e-growth` target, pinned to `.nvmrc`'s Node; a `test` case asserts rounded idle values that hold on any Node                                                                                                                                                                                                                                                                     | tech lead, G0 ruling 7          |
| 2026-10-21 | Tick listeners: `ITickLoop.listen` returns an idempotent unsubscribe; listeners run after the commit in subscription order through `callAll`, which throws one error or an `AggregateError`; a listener must not call `advance()`                                                                                                                                                                                    | tech lead, G0b ruling 1         |
| 2026-10-21 | Telemetry: `TELEMETRY` binds `SnapshotFeed` in `Telemetry`, which listens in `onInit`, sends the current reading at subscribe, closes every sink with `ship offline` on dispose, and joins the aggregate's imports and exports                                                                                                                                                                                       | tech lead, G0b ruling 2         |
| 2026-10-21 | `GET /telemetry` frames `snapshot` and `offline` events, keeps only the latest unsent frame, and sends no heartbeat; `stopOnSigterm` closes each Node entry's server and ends the streams through a shutdown signal, and the ship disposes after the server closes                                                                                                                                                   | tech lead, G0b ruling 3         |
| 2026-10-21 | `GET /graph` answers the annotated graph in development and 404 otherwise; `shipNotes` labels each ship provider with its system, and the phase label waits for G1                                                                                                                                                                                                                                                   | tech lead, G0b ruling 4         |
| 2026-10-21 | The console reads `snapshot()`, `telemetry()` and `graph()` through `BRIDGE_LINK`, follows the stream through `TELEMETRY_CLIENT` in the ship layout's status strip, and draws `/diagnostics`                                                                                                                                                                                                                         | tech lead, G0b ruling 5         |
| 2026-10-21 | The console's growth e2e runs in its own `e2e-growth` target on ports 4220 and 4221, and the gating config ignores `**/growth/**`                                                                                                                                                                                                                                                                                    | tech lead, G0b ruling 6         |
| 2026-10-21 | `bridge-api`'s `e2e-growth` runs the growth cases on workerd, Deno and Bun after its Vitest suite; `demo-growth` installs the pinned Deno and Bun; no edge leg                                                                                                                                                                                                                                                       | tech lead, G0b ruling 7         |
| 2026-10-21 | The bundle check greps the console's and the stations' builds for the descriptions of six simulation tokens, and it gates                                                                                                                                                                                                                                                                                            | tech lead, G0b ruling 8         |
| 2026-10-22 | `readShip(ship, deck)` returns a `ShipReading` with each compartment's pressure; `SnapshotFeed` takes `DECK_PLAN`, and `/sim` and the telemetry frames carry the reading; `ShipSnapshot` and the golden stay unchanged                                                                                                                                                                                               | tech lead, G0b ruling 9         |
| 2026-10-21 | `Engineering` binds `REACTOR` (`FusionReactor`, `[SHIP_STATE]`), the private `COOLANT_LOOP` (`RadiatorLoop`, no deps), `POWER_ROUTER` (`PlasmaRouter`, `[SHIP_STATE, lazy(SHIELD_GRID)]`) and `SHIELD_GRID` (`DeflectorGrid`, `[SHIP_STATE, POWER_ROUTER]`) and contributes `EngineeringPhysics` and `EngineeringCommands`; it exports every token but `COOLANT_LOOP`, and `COMPUTER` stays in the docs regions only | tech lead, G1 ruling 1          |
| 2026-10-21 | Commands reach their system through the multi token `COMMAND_HANDLERS`; `CommandDesk` (`[all(COMMAND_HANDLERS)]`) is bound to `COMMAND_DESK` in `MeridianSystems` beside `TICK_LOOP`, so `bridge-api` names no system                                                                                                                                                                                                | tech lead, G1 ruling 2          |
| 2026-10-21 | `SHIP_STATE` queues setpoint changes and applies them in queue order at step 1 of the next tick; `GET /commands` answers the log of the newest 1,000, which never holds a refused command                                                                                                                                                                                                                            | tech lead, G1 ruling 3          |
| 2026-10-21 | `PlasmaRouter.loads(ship)` reads the grid through `lazy(SHIELD_GRID)` on every tick; `DeflectorGrid.raise()` calls `PlasmaRouter.divert(load)`, which runs the tick's `allocatePower` at the current electric output and throws `PowerBudgetError` when the result sheds the load                                                                                                                                    | tech lead, G1 ruling 4          |
| 2026-10-21 | G1 adds no alarm set, and `Safety` raises the alarms in G3 from the engineering records (`reactor.tripped`, `coolant.temperature`, `power.shed`); `EngineeringPhysics` writes the throttle setpoint to 0 on a trip                                                                                                                                                                                                   | tech lead, G1 ruling 5          |
| 2026-10-21 | The coolant loop starts at 500 K, above lithium's melting point, behind radiator louvres with `λ = clamp((T_c − 500 K) / 50 K, 0, 1)`; the idle loop holds 500 K exactly                                                                                                                                                                                                                                             | tech lead, G1 ruling 6          |
| 2026-10-21 | The shield grid's heat share is 0.25; G1 applies no heat to a compartment, and G2 sets the corrected `Q_bay` law of section 5.2                                                                                                                                                                                                                                                                                      | tech lead, G1 ruling 7          |
| 2026-10-21 | G1 raises `MERIDIAN_POWER_BUDGET` and `MERIDIAN_BAD_COMMAND` and exports `shipText` at `./text`; `POST /commands` answers a `BadCommandError` with 400 and any other `NexusError` with 409, each with `explain(error, { text: [shipText] })`, and `errors({ text })` registration stays in G3                                                                                                                        | tech lead, G1 ruling 8          |
| 2026-10-21 | The console gains `BRIDGE_LINK.command(cmd)` and the static route `/systems/engineering` with its forms and the last answer, no gauges and no `lazySection`; its growth case runs under `playwright.e2e-growth.config.mts`                                                                                                                                                                                           | tech lead, G1 ruling 9          |
| 2026-10-21 | `FusionReactor[Symbol.dispose]()` is the scram; the shutdown test asserts `SimDriver` before `ReactorCore` in `trace()`'s `dispose:instance` events, and G0b and G3 add their tokens                                                                                                                                                                                                                                 | tech lead, G1 ruling 10         |
| 2026-10-21 | `C_c` is 8.34 × 10⁸ J/K and the time constant 102 s at 1,186 K (56 s at the trip); a full-throttle heat-up from 500 K to 1,100 K takes 340 s, and the trip test feeds 1,450 K to the pure function, since the alarm and the trip are out of reach in G1                                                                                                                                                              | tech lead, G1 ruling 11         |
| 2026-10-21 | Records and ratings live beside their pure functions in `src/physics/`; `src/systems/engineering/contracts.ts` holds Engineering's interfaces and tokens, and `src/simulation/commands.ts` holds the setpoint types and the command contracts                                                                                                                                                                        | tech lead, G1 ruling 12         |
| 2026-10-22 | `SHIP_STATE` holds one pending `SetpointChange`; `queue(change)` merges each change over it field by field, the later value winning, into a new frozen object, so changes queued between two ticks apply together at the next tick, and the log keeps one entry per tick, whose newest 1,000 `GET /commands` answers                                                                                                 | tech lead, G1 ruling 13         |
| 2026-10-22 | Each `IShipSystem` class declares `static readonly phase`, which its instance field reads; `ShipSystemClass` types it, and `shipNotes` adds `phase: <n>` only to a `SHIP_SYSTEMS` class provider whose static passes the 1 to 6 guard                                                                                                                                                                                | tech lead, G1 ruling 14         |
| 2026-10-22 | Life support starts offline: `setpoints.lifeSupport.online` is false, the action `online` takes no argument and has no reverse, and `LifeSupportPhysics.step` returns the ship unchanged while offline; device commands queue and act from the first online tick                                                                                                                                                     | tech lead, G2 ruling 1          |
| 2026-10-22 | Systems contribute their loads through `POWER_CONSUMERS` (`IPowerConsumer.draw(ship)`), which `PlasmaRouter` reads with `all()`; `LifeSupportPower` draws `life-support` at priority 1 from the pure `lifeSupportDemand`, which phase 4 reads too; a shed tick runs no heater, scrubber, generator or pump, and the tick-0 record lists the 0 W load                                                                 | tech lead, G2 ruling 2          |
| 2026-10-22 | The deck plan lists each compartment's `equipment`, the airlock's `pumpReservoir` and the bay's `coolantConductance`; `Setpoints.lifeSupport` holds one key per listed device, `SetpointChange` is `DeepPartial<Setpoints>` merged by one recursive `mergeFrozen`, and `IAtmosphereControl` and `LifeSupportCommands` refuse a device a compartment lacks with `BadCommandError`; vents and pumps stay in G2         | tech lead, G2 ruling 3          |
| 2026-10-22 | The ratings live in `LIFE_SUPPORT_RATINGS`: the electrolyser runs at 0.01 mol/s and 600 kJ/mol (6 kW), life support asks up to 68.57 kW (§5.7 "up to 69 kW"), the air holds 2.5 % of the habitat's heat capacity, the loop gain is 1.22 × 10⁻³, and the scrubber dries to 40 % by Magnus; only heater power heats a room                                                                                             | tech lead, G2 ruling 4          |
| 2026-10-22 | The bay leak is `Q_bay = UA · (T_c − T)` with `coolantConductance: 2` W/K in the deck, applied while online; the loop's own balance leaves it out                                                                                                                                                                                                                                                                    | tech lead, G2 ruling 5          |
| 2026-10-22 | A vent keeps `exp(−dt · A / (κ · V))` of every gas and its temperature; `transfer` moves a share of each gas and conserves moles and `Σ C · T`; the pump moves `min(1, rate · dt / V)` while the start-of-tick rise stays under 101,300 Pa and draws 400 W to 34,166.67 W, stalled or not; vents run after each room's own step, then pumps                                                                          | tech lead, G2 ruling 6          |
| 2026-10-22 | The library augments `NexusRequest` with `compartment?: string`; `COMPARTMENT` is a scoped factory over `REQUEST` with `eager: false` that throws `UnknownCompartmentError`; `bridge-api`'s mappers read the path through `compartmentOf`, `answerAtmosphere` answers 404 with the refusal, and `refusalOf` moves to `src/bridge/refusal.ts`                                                                         | tech lead, G2 ruling 7          |
| 2026-10-22 | Core rethrows a `NexusError` from a synchronous construct unwrapped, so `scope.get(ATMOSPHERE_SENSOR)` throws `UnknownCompartmentError` itself and `answerAtmosphere` matches it by `instanceof`; this corrects ruling 7, which expected a `ProviderError` with the error on `cause`                                                                                                                                 | controller, G2 ruling 7a        |
| 2026-10-22 | `GasAnalyzer` (transient, `[COMPARTMENT, SHIP_STATE, RNG, LIFE_SUPPORT_OPTIONS, DECK_PLAN]`) samples at construction through the pure `readAtmosphere`, with noise from its fork and each value floored at 0; `readCalibration(deck)` is the async factory of the aggregate's one `LifeSupport.forRootAsync` instance                                                                                                | tech lead, G2 ruling 8          |
| 2026-10-22 | `ShipSnapshot` gains `lifeSupport.heaters` and `setpoints.lifeSupport`; the idle golden gains those records and the 0 W load with `tick`, `time` and `compartments` byte-identical, and `life-support.seed-7.json` pins ticks 1, 600 and 7,200 at throttle 0.01                                                                                                                                                      | tech lead, G2 ruling 9          |
| 2026-10-22 | `bridge-api`'s growth case pumps the airlock from tick 601 and reads at tick 720 an airlock from 36,950 to 37,100 Pa, a habitat from 107 to 108 kPa from `/sim`, and the reading's tick 720                                                                                                                                                                                                                          | tech lead, G2 ruling 9a         |
| 2026-10-22 | `bridge-api` serves `GET /compartments/:id/atmosphere` on three frameworks with its routes, check, profiler and growth cases; the console gains `BRIDGE_LINK.atmosphere(id)` and the static `/systems/life-support` with fixed-precision gauges, the online, thermostat and airlock forms, and one growth case                                                                                                       | tech lead, G2 ruling 10         |
| 2026-10-22 | A cold reactor sheds life support, and G2 has no battery; every powered scenario queues `engineering throttle 0.01` beside `online`                                                                                                                                                                                                                                                                                  | tech lead, G2 ruling 11         |
| 2026-10-22 | G1's tests read the shields load by id and expect `'engineering and life-support'`, and the typed `ShipReading` doubles gain the life-support records                                                                                                                                                                                                                                                                | tech lead, G2 ruling 12         |
| 2026-10-22 | G2 names its deferrals in section 13: door mixing, alarms, `SENSOR_FAULT` and `DECOMPRESSION` for G3, the airlock drill for G4, and no condensation, vent cooling or device heat but the heaters                                                                                                                                                                                                                     | tech lead, G2 ruling 13         |
| 2026-10-22 | A synchronous tick cannot read the request-scoped sensor; G2 keeps the pure `readAtmosphere` for G3                                                                                                                                                                                                                                                                                                                  | tech lead, G2 ruling 14         |
| 2026-10-22 | The console's growth suite runs the life-support case in a second Playwright project that depends on the chromium project, since `online` is one-way on the shared manual ship (`playwright.e2e-growth.config.mts`); `telemetry.spec.ts` stays as G0b left it                                                                                                                                                        | tech lead, G2 ruling 15         |
| 2026-10-22 | The status strip prints the habitat temperature in whole kelvin and the pressure to 0.1 kPa through `fixed()`, and every console gauge shows an SI unit (Pa or kPa for pressures and partial pressures, mol for amounts; no ppm, percent or imperial unit); this overrides the tech lead's call to leave the strip for #182, and closes #182                                                                         | owner                           |
| 2026-10-22 | `ShipSnapshot` gains the safety record and `setpoints.safety`, with `DOOR_IDS` in the simulation's contracts; the store starts every door shut with no fire and no alarm, and `TickContext.start` carries the snapshot `applyQueued` returned, which `DECOMPRESSION` and the deadband read                                                                                                                           | tech lead, G3 ruling 1          |
| 2026-10-22 | `Safety` runs the doors in phase 5; `gas.ts` splits `transfer` into `parcel` and `mix`, and `exchange` mixes both parcels from the start state, so rooms at one molar density and two temperatures trade heat, and `doorFractions` gives `fromA` and `fromB` while `airlock-outer` vents                                                                                                                             | tech lead, G3 ruling 2          |
| 2026-10-22 | `ShipStateStore` refuses an unknown door, a repeated door, a door the deck lacks and a bad `between`; `BlastDoorControl` and `InertGasSuppression` queue `open`, `close`, `flood` and `drill` after an `Object.hasOwn` check, and `SafetyCommands` refuses a missing or non-string argument before a panel runs                                                                                                      | tech lead, G3 ruling 3          |
| 2026-10-22 | `PressureInterlock` (`[SHIP_STATE, DECK_PLAN]`) sits behind `@nexusdi/meridian-systems/interlock` with a type-only import of `@nexusdi/interceptors`, an optional peer; `bridgePlugins()` binds it to `BLAST_DOORS.open` inside `FlightRecorder`, and the throw reaches the desk's caller as the same `InterlockError`                                                                                               | tech lead, G3 ruling 4          |
| 2026-10-22 | The interlock reads the true pressures of the committed snapshot through `doorPressures`, with `space` at 0 Pa, so its answer never depends on the RNG; it refuses above 5,000 Pa, and `close` is never interlocked                                                                                                                                                                                                  | tech lead, G3 ruling 5          |
| 2026-10-22 | `FlightRecorder`, a singleton interceptor on `BLAST_DOORS`, records into the request's `FLIGHT_LOG` through `REQUEST_SCOPES` and `nodeScopes()`; `POST /commands` answers `flightLog` beside the tick when the log holds entries, and `worker.ts` answers `{ tick }`                                                                                                                                                 | tech lead, G3 ruling 6          |
| 2026-10-22 | `ATMOSPHERE_PROBE` (`CalibratedProbe`, singleton) serves the tick and `GasAnalyzer`, bit-identical to G2; Safety reads each room at the start and the end of the tick and any throw raises `SENSOR_FAULT`                                                                                                                                                                                                            | tech lead, G3 ruling 7          |
| 2026-10-22 | `MasterAlarm` (`[TICK_LOOP, all(ALARM_SINKS)]`) clears the gone alarms, then raises the new ones, through `callAll`; `TelemetryAlarmSink` goes; `bridge-api`'s global `AlarmPanel` contributes `AuditAlarmSink`; shutdown disposes `SimDriver`, `MasterAlarm`, `TelemetryFeed` and `ReactorCore` in that order                                                                                                       | tech lead, G3 ruling 8          |
| 2026-10-22 | A room burns above 16 % O₂ and 16 kPa of `p_O₂`; a fire lights above 330 K on one draw per eligible room, follows the laws of section 5.10 and heats the room in phase 5; the drill lights with no draw; a flood releases the deck's charge over 10 s; fires and floods run while life support is offline                                                                                                            | tech lead, G3 ruling 9          |
| 2026-10-22 | Safety evaluates the alarms per compartment in `COMPARTMENT_IDS` order with the deadband of `ALARM_LIMITS`; the five atmosphere alarms read occupied rooms only and `DECOMPRESSION` shuts the room's doors through the setpoints; the seeded scenarios raise no alarm                                                                                                                                                | tech lead, G3 ruling 10         |
| 2026-10-22 | Safety has no online gate; an idle step changes no gas and draws nothing, so the goldens' compartments stay byte-identical                                                                                                                                                                                                                                                                                           | tech lead, G3 ruling 11         |
| 2026-10-22 | `refusalOf` and the development-only `errors({ text: SHIP_TEXT })` read `SHIP_TEXT = [shipText, interceptorsText]`; `InterlockError` carries the door and, in Pa, the difference and the limit, and `POST /commands` answers it with 409                                                                                                                                                                             | tech lead, G3 ruling 12         |
| 2026-10-22 | G3 adds no route; `check.test.ts` gains the notes of Safety's providers and the probe, with `AlarmPanel` among the bridge modules, and `graph.json` the new modules and providers                                                                                                                                                                                                                                    | tech lead, G3 ruling 13         |
| 2026-10-22 | The idle and life-support goldens gain `safety` and `setpoints.safety` with every other record byte-identical, and `safety.seed-7.json` pins the airlock door cycle; `bridge-api`'s growth file holds the door and drill cases, and the console's a third Playwright project                                                                                                                                         | tech lead, G3 ruling 14         |
| 2026-10-22 | G4 adds no route, no command, no module and no sequencer: the airlock drill runs the existing life-support and safety commands under the interlock, and covers the routes it uses on Hono, Express and Fastify                                                                                                                                                                                                       | tech lead, G4 ruling 1          |
| 2026-10-22 | The drill pumps down to the stall, vents to the interlock's 5,000 Pa, holds the outer door open 20 ticks, and fills until the interlock passes the inner door, with log entries at ticks 1, 289, 318, 338 and 447                                                                                                                                                                                                    | tech lead, G4 ruling 2          |
| 2026-10-22 | The golden `e2e/golden/airlock.seed-7.json` pins ticks 288, 317, 337, 446 and 466 with the interlock registered, and the gating `test/airlock.test.ts` asserts each interlock answer and the log                                                                                                                                                                                                                     | tech lead, G4 ruling 3          |
| 2026-10-22 | The drill raises no alarm in any room; the bypass case stays with `test/safety.test.ts`                                                                                                                                                                                                                                                                                                                              | tech lead, G4 ruling 4          |
| 2026-10-22 | `bridge-api` gains a gating parity case for `close airlock-outer`, `vent`, `pump` and a refused `vent habitat`, and the fourth runtime case `airlockDrill` on six runtimes, whose harnesses build the ship with `bridgePlugins({ scopes })`                                                                                                                                                                          | tech lead, G4 ruling 5          |
| 2026-10-22 | The console gains the airlock panel at `/airlock`, which posts to two systems through `systemAction`'s record form, and a fourth growth project `airlock`                                                                                                                                                                                                                                                            | tech lead, G4 ruling 6          |
| 2026-10-22 | §7.4 names G4 as the increment with no module; §5.7 gives life support's 39.3 kW at the first stalled tick, and the climb past it                                                                                                                                                                                                                                                                                    | tech lead, G4 ruling 7          |
| 2026-10-22 | The two G3 prose nits in `src/physics/safety.ts` and the `bridge-api` README take the text of ruling 8                                                                                                                                                                                                                                                                                                               | tech lead, G4 ruling 8          |
| 2026-10-22 | `npx fallow dupes` stays at 2.15 % or under; fallow counts neither `*.spec.*` nor `*.test.*` files                                                                                                                                                                                                                                                                                                                   | tech lead, G4 ruling 9          |
| 2026-10-22 | The console's growth helpers move into `e2e/growth/ship.ts` with every earlier `test(...)` body byte-identical                                                                                                                                                                                                                                                                                                       | tech lead, G4 ruling 10         |
| 2026-10-22 | G5 adds the crew command `comms hail`, with no argument, and no other                                                                                                                                                                                                                                                                                                                                                | tech lead, G5 ruling 1          |
| 2026-10-22 | The snapshot gains `comms` and `setpoints.comms` after `lifeSupport`; the store and phase 6 freeze them                                                                                                                                                                                                                                                                                                              | tech lead, G5 ruling 2          |
| 2026-10-22 | Phase 6 answers a due reply, `fleet traffic control: sector clear`, 2 s after the send, and sends a queued hail when the array has the link and the power and no reply outstanding; otherwise the hail waits under `no subspace link`, `no power` or `awaiting reply`                                                                                                                                                | tech lead, G5 ruling 3          |
| 2026-10-22 | `CommsPower` draws 5 MW at priority 3 on each tick a hail waits on a linked array with no reply outstanding and 0 W otherwise, with heat share 0                                                                                                                                                                                                                                                                     | tech lead, G5 ruling 4          |
| 2026-10-22 | No tick calls the link, which downloads the charts once at startup; the library's lint refuses `fetch` outside `subspace-relay.ts`                                                                                                                                                                                                                                                                                   | tech lead, G5 ruling 5          |
| 2026-10-22 | `PhasedArray` (`[SHIP_STATE, optional(SUBSPACE_LINK)]`) reads `linked` at construction and queues the hail                                                                                                                                                                                                                                                                                                           | tech lead, G5 ruling 6          |
| 2026-10-22 | `meridianSystems({ seed, dt, relayUrl? })`, typed `MeridianSystemsOptions`, imports `Comms.forRoot` and `Tactical` with a relay and `OfflineComms` and `OfflineTactical` without one, and re-exports both                                                                                                                                                                                                            | tech lead, G5 ruling 7          |
| 2026-10-22 | `SubspaceRelay`, `StarCharts` and the chart table move into the library with `git mv`, and the library exports no module object beside `meridianSystems`                                                                                                                                                                                                                                                             | tech lead, G5 ruling 8          |
| 2026-10-22 | `bridge-api` re-exports the moved names from `contracts.ts` and drops `Comms`, `tactical`, `OfflineTactical` and `./offline`, which nothing imports; no route changes                                                                                                                                                                                                                                                | tech lead, G5 ruling 9          |
| 2026-10-22 | `bridge-api` gains `the comms commands on %s`, the fifth runtime case `offlineHail` and the profile of the relay graph's download with `LoopbackLink`                                                                                                                                                                                                                                                                | tech lead, G5 ruling 10         |
| 2026-10-22 | The federation shell does not change                                                                                                                                                                                                                                                                                                                                                                                 | tech lead, G5 ruling 11         |
| 2026-10-22 | The library gains `test/comms.test.ts` and the golden `comms.seed-7.json` at ticks 1, 5 and 600                                                                                                                                                                                                                                                                                                                      | tech lead, G5 ruling 12         |
| 2026-10-22 | The console gains `/systems/comms` on the shared system-page parts with `ItemList`, and a fifth growth project `comms`                                                                                                                                                                                                                                                                                               | tech lead, G5 ruling 13         |
| 2026-10-22 | Five enumerating unit assertions grow with the ship; every earlier golden only gains lines (42, 42, 42 and 70); the four goldens gain the comms records in one commit and the 0 W load in the move                                                                                                                                                                                                                   | tech lead, G5 ruling 14         |
| 2026-10-22 | The four G4 review leftovers take the architect's text; the airlock growth comment's reflow goes in its own commit                                                                                                                                                                                                                                                                                                   | tech lead, G5 ruling 15         |
| 2026-10-22 | G5 changes no docs page or docs region                                                                                                                                                                                                                                                                                                                                                                               | tech lead, G5 ruling 16         |
| 2026-10-22 | `npx fallow dupes` stays at 2.15 % or under from 2.1055 %                                                                                                                                                                                                                                                                                                                                                            | tech lead, G5 ruling 17         |
| 2026-10-23 | The phase-2 systems read each other's records from the start of the tick; `Propulsion` reads the start-of-tick attitude, so their order by name changes no figure                                                                                                                                                                                                                                                    | tech lead, G6 ruling 1          |
| 2026-10-23 | The helm converts the charts' degrees to rad at the command and steers with the clamped PD law; it settles to the course with no torque under 10⁻⁶ rad and 10⁻⁶ rad/s, and `stepHelm` returns the record it got when nothing changes; `RCS_THRUSTERS` is the hardware behind `THRUSTERS`, and `HELM_TUNING` and `HELM_SETTLE` sit beside the law                                                                     | tech lead, G6 ruling 2          |
| 2026-10-23 | The helm's figures are the same on every engine; the drive's angle `attitude − course` reads exactly 0 after the settle, so its cosine is exactly 1; only the Node goldens and the module test read a burn during a turn                                                                                                                                                                                             | tech lead, G6 ruling 3          |
| 2026-10-23 | The snapshot gains `drive` and `helm`, and the setpoints `drive.throttle` and `helm.heading` in rad, after `comms`; the store and phase 2 freeze them                                                                                                                                                                                                                                                                | tech lead, G6 ruling 4          |
| 2026-10-23 | A new course keeps the speed and the distance along the track                                                                                                                                                                                                                                                                                                                                                        | tech lead, G6 ruling 6          |
| 2026-10-23 | `HelmPower` draws `thrusters` at priority 4 from the start-of-tick torque with heat share 0, and `PropulsionPower` draws `main-drive` at priority 5 with heat share 0.4; no helm command diverts; a turn at full torque needs the reactor at 0.01653                                                                                                                                                                 | tech lead, G6 ruling 7          |
| 2026-10-23 | G6 adds the crew commands `helm course` and `helm burn`, and no other; `HelmControl` plots at the command; an uncharted star or a key of `Object.prototype` answers `MERIDIAN_BAD_COMMAND` at the command, and `INavCharts` gains `has`                                                                                                                                                                              | tech lead, G6 rulings 8 and 23  |
| 2026-10-23 | `Propulsion` and `Helm` join the aggregate, and `HelmControl` reads `MAIN_DRIVE` and `NAV_CHARTS` through it; `Propulsion` also exports `SHIP_SYSTEMS` and `POWER_CONSUMERS`, `Helm` also those two and `COMMAND_HANDLERS`, and `IMainDrive` and `IThrusters` carry their `rating`                                                                                                                                   | tech lead, G6 ruling 9          |
| 2026-10-23 | The library gains `test/helm.test.ts` and the golden `helm.seed-7.json` at ticks 1, 50, 688 and 1,200                                                                                                                                                                                                                                                                                                                | tech lead, G6 ruling 11         |
| 2026-10-23 | Four enumerating unit assertions grow with the ship; every earlier golden only gains lines (90, 90, 90, 150 and 90), the records in one commit and the loads with the wiring                                                                                                                                                                                                                                         | tech lead, G6 ruling 12         |
| 2026-10-23 | The four G5 leftovers take the text of G6 ruling 13; the library's lint refuses `WebSocket`, `XMLHttpRequest`, `EventSource` and `navigator` in every file under `src`                                                                                                                                                                                                                                               | tech lead, G6 ruling 13         |
| 2026-10-23 | The lint also refuses `Bun`, `Deno`, `WebTransport`, `importScripts`, `Worker` and `WebSocketStream`, and the second comms title is corrected, each in its own commit                                                                                                                                                                                                                                                | tech lead, G6 rulings 14 and 20 |
| 2026-10-23 | `bridge-api` gains `the helm commands on %s` and the sixth runtime case `courseAndBurn`                                                                                                                                                                                                                                                                                                                              | tech lead, G6 ruling 15         |
| 2026-10-23 | The console gains `/systems/helm` in degrees on `LevelForm` and the shared parts, and a growth project `helm` before `comms`                                                                                                                                                                                                                                                                                         | tech lead, G6 ruling 16         |
| 2026-10-23 | G6 changes no docs page or docs region                                                                                                                                                                                                                                                                                                                                                                               | tech lead, G6 ruling 18         |
| 2026-10-23 | `npx fallow dupes` stays at 2.15 % or under from 2.1451 % and reads 2.1374 % at the end, so the reserve refactor of the console's entry list was not needed                                                                                                                                                                                                                                                          | tech lead, G6 ruling 17         |
| 2026-10-23 | The snapshot gains `ftl` (`status`, `charge` in J, `sector`, `jumped`) and the setpoints `ftl` (`armed`, `jump`) after `helm`; the record starts `offline` with the sector `Sol`, and the drive's first step writes its status                                                                                                                                                                                       | tech lead, G7 ruling 2          |
| 2026-10-23 | The spool charges 450,000,000 J a tick while armed, with the reactor at 0.9 and the coolant under 1,300 K at the start of the tick; a jump on a full charge moves the sector and disarms the drive, and its pulse adds 10.7914 K to the loop in phase 3                                                                                                                                                              | tech lead, G7 ruling 3          |
| 2026-10-23 | `ITickLoop.attach` and `IPowerRouter.attach` let a loaded system join the loop and the router, and `JumpDrive.onInit()` attaches `FtlPhysics` and `FtlPower`; `attach` returns its detach, amending G0 ruling 4                                                                                                                                                                                                      | tech lead, G7 ruling 4          |
| 2026-10-23 | The spool draws `ftl-spool` at priority 7 with heat share 0.1 and draws 0 W while held; `spool()` asks `divert` and refuses with `MERIDIAN_POWER_BUDGET`                                                                                                                                                                                                                                                             | tech lead, G7 rulings 3 and 4   |
| 2026-10-23 | The telemetry stream extends its request scope on the first frame after the drive loads and sends the bound drive's rating as `ftlRating`                                                                                                                                                                                                                                                                            | tech lead, G7 ruling 5          |
| 2026-10-23 | `bridge-api` serves `POST /ftl/spool` and `POST /ftl/jump` through `di.load(FtlDrive)` on three frameworks, and the section loads once and extends a request scope that started; a spool on an armed drive queues nothing and answers the next tick                                                                                                                                                                  | tech lead, G7 ruling 6          |
| 2026-10-23 | `jump(to)` refuses an uncharted star with `MERIDIAN_BAD_COMMAND` and a partial charge with `MERIDIAN_FTL_NOT_SPOOLED`; the FTL commands take their own routes outside the desk, and G7 adds no stand-down command                                                                                                                                                                                                    | tech lead, G7 ruling 7          |
| 2026-10-23 | `FtlDrive` binds `FTL_DRIVE` alone and reads its tokens through the global aggregate; the index exports it with `FtlRating`                                                                                                                                                                                                                                                                                          | tech lead, G7 ruling 8          |
| 2026-10-23 | The `graph` target draws the loaded drive with `--load src/ship/meridian.ts#FtlDrive`, and `shipNotes` labels it                                                                                                                                                                                                                                                                                                     | tech lead, G7 ruling 9          |
| 2026-10-23 | `SimulatedFtlDrive` arms and jumps with no checks and no pulse, and `bridge-api`'s `test/ftl.test.ts` runs it through `overrideModule(FtlDrive, SimulatedFtlDrive, { lazy: true })`                                                                                                                                                                                                                                  | tech lead, G7 ruling 10         |
| 2026-10-23 | The library gains `test/ftl.test.ts` and the golden `ftl.seed-7.json` at ticks 101, 300 and 301; every earlier golden only gains lines (30, 30, 30, 50, 30 and 40)                                                                                                                                                                                                                                                   | tech lead, G7 rulings 2 and 11  |
| 2026-10-23 | `bridge-api` gains `the ftl commands on %s`, `the telemetry stream on %s` and the seventh runtime case `spoolAndJump`                                                                                                                                                                                                                                                                                                | tech lead, G7 rulings 5 and 12  |
| 2026-10-23 | The console gains `/systems/ftl` with the charge in GJ and a growth project `ftl` between `helm` and `comms`; `BRIDGE_LINK` gains `spool()` and `jump(to)`                                                                                                                                                                                                                                                           | tech lead, G7 ruling 14         |
| 2026-10-23 | Two enumerating unit assertions grow with the ship, and `check.test.ts` draws the graph with the load                                                                                                                                                                                                                                                                                                                | tech lead, G7 ruling 13         |
| 2026-10-23 | G7 changes no docs page or docs region, and `npx fallow dupes` stays at 2.15 % or under from 2.1359 %                                                                                                                                                                                                                                                                                                                | tech lead, G7 ruling 15         |
| 2026-10-23 | The snapshot gains `weapons` (`status`, `charge` in J, `shots`, `hits`, `lastShot`) and the setpoints `weapons` (`armed`, `range`), both directly after `comms`, from tick 0 and frozen                                                                                                                                                                                                                              | tech lead, G8 rulings 2 and 10  |
| 2026-10-23 | The step charges first and then fires; an empty bank fires on its second charging tick, and `draw` runs on a shot tick alone                                                                                                                                                                                                                                                                                         | tech lead, G8 ruling 3          |
| 2026-10-23 | The shot heats the loop in phase 3 through the jump's `pulseCoolant`, and §5.6 drops its `Q_pulse` term                                                                                                                                                                                                                                                                                                              | tech lead, G8 ruling 4          |
| 2026-10-23 | The capacitor draws `railgun` at priority 6 with heat share 0                                                                                                                                                                                                                                                                                                                                                        | tech lead, G8 ruling 5          |
| 2026-10-23 | The charger tapers on the tick that fills the bank, so no energy leaves the model, and `WeaponsPower` and `RailgunMount` read `SIM_OPTIONS`                                                                                                                                                                                                                                                                          | tech lead, G8 ruling 6          |
| 2026-10-23 | `weapons fire` takes a range from 0 to 100,000 m through `POST /commands`; the first fire arms the mount and G8 adds no stand-down command                                                                                                                                                                                                                                                                           | tech lead, G8 ruling 7          |
| 2026-10-23 | A fire on an uncharged capacitor answers 202 and waits for the charge; an unarmed fire asks the router and an armed fire asks none                                                                                                                                                                                                                                                                                   | tech lead, G8 ruling 7          |
| 2026-10-23 | `RailgunMount` takes `[SHIP_STATE, SIM_OPTIONS, lazy(POWER_ROUTER)]` and `Weapons` exports four tokens                                                                                                                                                                                                                                                                                                               | tech lead, G8 ruling 8          |
| 2026-10-23 | `graph.json` gains the module, four providers and ten edges                                                                                                                                                                                                                                                                                                                                                          | tech lead, G8 ruling 9          |
| 2026-10-23 | Five enumerating unit assertions grow with the ship, and no earlier assertion is rewritten                                                                                                                                                                                                                                                                                                                           | tech lead, G8 ruling 11         |
| 2026-10-23 | The library gains `test/weapons.test.ts` and the golden `weapons.seed-7.json`; every earlier golden only gains lines                                                                                                                                                                                                                                                                                                 | tech lead, G8 rulings 10 and 12 |
| 2026-10-23 | `bridge-api` gains `the weapons commands on %s` and the eighth runtime case `fireRailgun`                                                                                                                                                                                                                                                                                                                            | tech lead, G8 ruling 13         |
| 2026-10-23 | The console gains `/systems/weapons` in MJ, MW and m and a growth project `weapons` before `comms`; the range form and `LevelForm` share `NumberForm`                                                                                                                                                                                                                                                                | tech lead, G8 ruling 14         |
| 2026-10-23 | `pulseCoolant` moves from `physics/ftl.ts` to `physics/thermal.ts`                                                                                                                                                                                                                                                                                                                                                   | tech lead, G8 ruling 15         |
| 2026-10-23 | G8 changes no docs page or docs region, and `npx fallow dupes` stays at 2.15 % or under from 2.1137 %                                                                                                                                                                                                                                                                                                                | tech lead, G8 ruling 17         |
| 2026-10-23 | The #196 weapons comment names the throttle at 1 and the burn at 0 again and loses its three-clause sentence; G9 has no nit task, and its pull request says "Fixes #196"                                                                                                                                                                                                                                             | tech lead, G9 ruling 1          |
| 2026-10-23 | `TELEMETRY_FEED` is described `meridian/StationTelemetry` and `COMMAND_LINK` `meridian/CommandLink`, so no description holds a bundle sentinel; the contract moves from 2.3.0 to 2.4.0, the drift build yields 2.5.0, and three contract cases move their literal versions up one minor                                                                                                                              | tech lead, G9 ruling 2          |
| 2026-10-23 | The contract declares `TelemetryReading`, `CompartmentTelemetry` and `TelemetryState`, and a type case in the shell ties `ShipReading` to `TelemetryReading`                                                                                                                                                                                                                                                         | tech lead, G9 ruling 3          |
| 2026-10-23 | The shell reads `/bridge.json` on first use and fetches nothing at startup; the receipt text is worded in the shell, the link sends `content-type: application/json` and no other request header, and the stream does not reconnect                                                                                                                                                                                  | tech lead, G9 ruling 4          |
| 2026-10-23 | Only the Hono entry answers the shell's origin through `hono/cors`; `SHELL_ORIGIN` defaults to `http://localhost:4300` and production allows none                                                                                                                                                                                                                                                                    | tech lead, G9 ruling 5          |
| 2026-10-23 | `EngineeringStation` sends no command, `LifeSupportStation` sends `online`, `scrubber` and `oxygen` for the habitat, and `HelmOrders` sends `helm course` and `helm burn`; G9 adds no crew command, and only the G9 sections take `<Name>Station`                                                                                                                                                                    | tech lead, G9 ruling 6          |
| 2026-10-23 | `main.json`, `drift.json` and `unshared.json` stay, and the four records of `mf.test.ts` gain the two station keys                                                                                                                                                                                                                                                                                                   | tech lead, G9 ruling 7          |
| 2026-10-23 | The shell's growth suite holds three cases, one per remote, on a manual `bridge-api` and ports 4330 to 4336; the gating suite gains two bundle titles for the station builds; `bridge-api` gets no e2e case                                                                                                                                                                                                          | tech lead, G9 ruling 8          |
| 2026-10-23 | The shell takes `@nexusdi/bridge-api` as a devDependency, as the console does                                                                                                                                                                                                                                                                                                                                        | tech lead, G9 ruling 9          |
| 2026-10-23 | G9 changes nothing under `libs/`, adds no runtime dependency between packages, removes no export and no test, and leaves `graph.json`, `check.test.ts` and the goldens alone                                                                                                                                                                                                                                         | tech lead, G9 ruling 10         |
| 2026-10-23 | The /federation/ page reads "Six folders hold it" and lists the two new folders                                                                                                                                                                                                                                                                                                                                      | tech lead, G9 ruling 11         |
| 2026-10-23 | `ci.yml` counts six federation projects in the verify step and names `federation-shell` among the `e2e-growth` holders; the comment that records a four-project run stays                                                                                                                                                                                                                                            | tech lead, G9 ruling 12         |
| 2026-10-23 | G9's forecast end for `npx fallow dupes` is 2.12 % to 2.14 %, under the 2.15 % ceiling, and `.fallowrc.jsonc` keeps 2.25 %                                                                                                                                                                                                                                                                                           | tech lead, G9 ruling 13         |
| 2026-10-24 | The Starship Meridian is a small survey frigate: a crew of 6, 60 to 80 m long, with the 1.21 GW reactor (section 16.1)                                                                                                                                                                                                                                                                                               | owner                           |
| 2026-10-24 | The deck plan grows so that every room the art shows is a live compartment with air, heat and doors; it adds only rooms a system or an Academy mission uses, no room exists only in the art, and the implementation rewrites the goldens once (sections 16.2 and 16.7)                                                                                                                                               | owner                           |
| 2026-10-24 | The hull sections, fore to aft: bridge, chart room, computer core, habitat (quarters and galley), airlock, shuttle bay, drone bay, comms, weapons, engineering, reactor bay, FTL core and main drive, each with the code and the Academy mission section 16.3 maps                                                                                                                                                   | owner                           |
| 2026-10-24 | The exterior shows the radiator wings, the deflector emitters, the RCS quads, the dorsal comms array and sensor mast, the spinal railgun barrel, the shuttle and drone bay doors, the airlock hatch, the main engine bells and the markings "MERIDIAN" and a hull number (section 16.6); the 2026-10-28 rows supersede the wings, the comms array and the sensor mast                                                | owner                           |
| 2026-10-24 | The art is a grounded industrial look with terminal-style panels, an original design that copies no franchise's marks or layouts, and one identity for the MeridianOS demo, the docs front page and the Academy (section 16.6)                                                                                                                                                                                       | owner                           |
| 2026-10-24 | The layout draws the physical conduits the simulation models: power from `PlasmaRouter` to each load, the coolant loop from the reactor bay to the radiator wings, and the atmosphere ducts through the doors (section 16.4); superseded on 2026-10-28 for the coolant loop, which runs to the integrated radiators                                                                                                  | owner                           |
| 2026-10-24 | The network overlay, a toggle in the MeridianOS chrome, draws the DI graph over the deck from devtools' graph edges alone, with `lazy()` and `optional()` dashed and a loaded section drawn once loaded; a missing provider or a broken import shows as a broken conduit (section 16.5)                                                                                                                              | owner                           |
| 2026-10-24 | A physical conduit is drawn only where a real dependency or a physics flow exists (section 16.5)                                                                                                                                                                                                                                                                                                                     | owner                           |
| 2026-10-24 | The design research gives guidelines, and the rule of cool outranks real-world constraints across the whole layout; the layout adopts the anchor guidelines and the trade-off recommendations section 16.1 lists                                                                                                                                                                                                     | owner                           |
| 2026-10-24 | Game-scale metrics: main corridors at least 2.0 m, secondary corridors 1.5 m, doors 1.5 m wide, pressure hatches 1.5 m by 2.0 m and decks 3.2 m floor to floor (section 16.1)                                                                                                                                                                                                                                        | owner                           |
| 2026-10-24 | Gravity plating: the floors face dorsal, the deck plan is a true top-down view, and thrust is cosmetic (section 16.1)                                                                                                                                                                                                                                                                                                | owner                           |
| 2026-10-24 | No tank section as a compartment, and reactor shielding does not drive the layout; tanks appear in the art only as exterior or cutaway detail, and a tank is no room (section 16.1)                                                                                                                                                                                                                                  | owner                           |
| 2026-10-24 | The hull number is `SV-01`: the Meridian is the lead ship of the Meridian-class survey vessels, SV is the role and 01 the first hull of the class, with no link to the mission id `survey-7` (section 16.6)                                                                                                                                                                                                          | owner                           |
| 2026-10-24 | The art draws compact "unobtanium" radiator wings, about 96 m in span and swept aft, so the ship fits on screen and reads well on the demo app, the front page, the docs and the Academy; the simulation keeps its heat figures (section 16.6); superseded on 2026-10-28 by the integrated radiators                                                                                                                 | owner                           |
| 2026-10-28 | The drive sits in twin nacelles on pylons, port and starboard of the drive section and symmetric about the long axis, each ending in a larger bell (section 16.6)                                                                                                                                                                                                                                                    | owner                           |
| 2026-10-28 | The radiators are part of the hull: vanes along both nacelles and louvred panels in the reactor block's flanks; the flat 96 m wings go, and the simulation keeps its heat figures (section 16.6)                                                                                                                                                                                                                     | owner                           |
| 2026-10-28 | The comms array sits flush in the canted face of a faired dorsal housing, and the survey sensors in a blister on the command section's roof; no bare mast or antenna stands on the hull (section 16.6)                                                                                                                                                                                                               | owner                           |
| 2026-10-28 | The bridge looks out through a recessed window strip round the bow under an armoured brow, split by the barrel's spine, with the bow emitters off the window line so the bow does not read as a face (section 16.6)                                                                                                                                                                                                  | owner                           |

The owner made the rows whose source is "owner". The architect proposed the "tech lead"
rows and the tech lead decided them, as `specs/plans/2026-10-21-meridian-g0-kernel.md`,
`specs/plans/2026-10-21-meridian-g0b-telemetry.md`,
`specs/plans/2026-10-21-meridian-g1-engineering.md`,
`specs/plans/2026-10-21-meridian-g2-lifesupport.md`,
`specs/plans/2026-10-21-meridian-g3-safety.md`,
`specs/plans/2026-10-21-meridian-g4-airlock.md`,
`specs/plans/2026-10-21-meridian-g5-comms.md`,
`specs/plans/2026-10-21-meridian-g6-propulsion.md`,
`specs/plans/2026-10-21-meridian-g7-ftl.md`,
`specs/plans/2026-10-21-meridian-g8-weapons.md` and
`specs/plans/2026-10-21-meridian-g9-stations.md` record under their rulings. The
controller corrected G2 ruling 7 with 7a on a fact of core's behaviour.

G6 goes past the spec's G6 text in these points, which its plan lists for the owner. None
changes a public docs page.

- The crew commands `helm course to <star>` and `helm burn level <x>`, plotted at the
  command, with `levelArgument` shared with the throttle (G6 ruling 8).
- The settle at 10⁻⁶ rad and 10⁻⁶ rad/s, and the start-of-tick coupling of the two
  phase-2 systems (G6 rulings 1 and 2).
- Ship behaviour the spec left open: the load ids, the thrusters' heat share 0, a burn on
  a cold reactor that sheds with `LOAD_SHED main-drive`, a course at throttle 0.01 that
  waits on the reactor with `LOAD_SHED thrusters`, and a new course that keeps the speed
  (G6 rulings 6 and 7).
- `INavCharts` gains `has(to)`; every implementer in the repo gains it (G6 ruling 23).
- `navigator` refused as a whole global where the owner named `navigator.sendBeacon`, and
  six more names refused in their own commit: `Bun`, `Deno`, `WebTransport`,
  `importScripts`, `Worker` and `WebSocketStream` (G6 rulings 13, 14 and 20).
- The second comms test title, `src/physics/comms.test.ts:211`, corrected beside the one
  the owner named (G6 ruling 14).
- A gating route case per framework, a sixth runtime case, a module test and the helm
  golden (G6 rulings 11 and 15).
- The console page `/systems/helm` with its nav link, `LevelForm` and a growth project
  `helm` that runs before `comms`. Its angles read in degrees and its turn rate in °/s.
  The owner's gauge ruling asks for SI units. The SI accepts the degree for use beside
  them, and the snapshot keeps rad (G6 ruling 16).
- Four enumerating unit assertions grow with the ship (G6 ruling 12).
- The ratings on the contracts, `IMainDrive.rating` and `IThrusters.rating`, read by the
  physics and power classes, and `HELM_TUNING` and `HELM_SETTLE` beside the helm law
  (G6 rulings 2 and 9).
- Module contributions past sections 3.2 and 3.3 as first written: `Propulsion` also
  exports `SHIP_SYSTEMS` and `POWER_CONSUMERS`, and `Helm` also `SHIP_SYSTEMS`,
  `POWER_CONSUMERS` and `COMMAND_HANDLERS`, with five new class rows (G6 ruling 18).
- Spec text G6 does not deliver: the section 8.2 helm suite over `SimulatedFtlDrive` and
  section 6's "a test of the helm does not spool a real drive" move to G7, since
  `FtlDrive` arrives there, and section 8.1's 91 s bound becomes 86.3 s to within 1° and
  91.1 s to the settle (G6 ruling 18).
- The record shapes, and one setpoint `helm.heading` in rad that holds both the set
  heading and the course (G6 ruling 4).
- The docblock of the console's `app/bridge/fixed.ts` said the ship sends raw floats.
  `readShip` rounds every number to four significant digits before `/sim` and the
  telemetry frames send it, so G6 corrects the sentence, and the console's test doubles
  feed the rounded reading. From the eight-digit fix (issue 191), `readShip` keeps eight.
- The library's two vitest configs set `testTimeout: 30_000`, so a slow hour of ticks on a
  loaded machine fails on its assertions alone, and no earlier `it(...)` call changes
  (G6 ruling 21). `.prettierignore` leaves the library's goldens out of the format check,
  since Prettier folds a short array the golden tests compare byte for byte.
- The console moves `@nexusdi/meridian-systems` from a dev dependency to a dependency and
  imports `StarCharts` and `BUNDLED_CHARTS` from the new `./charts` subpath. Its copy of the
  table, `app/bridge/charts.json`, goes, and so does `tests/charts.test.ts` (G6 ruling 24).

G7 goes past the spec's G7 text in these points, which its plan lists for the owner. None
changes a public docs page.

- The CLI needs `path-with-extension#export`, so the spec's `--load src/systems/ftl#FtlDrive`
  exits 2 ("src/systems/ftl#FtlDrive is not a file nexusdi can load."). The `graph` target
  uses `src/ship/meridian.ts#FtlDrive`, and that file re-exports `FtlDrive` from the
  library (G7 ruling 9).
- The bridge never calls `ship.load(FtlDrive)` itself. Each adapter's `di.load(FtlDrive)`
  section calls it and extends the request's scope, registered in front of the handler on
  Hono and Express and through `onRequest` on Fastify, where section 6.3 first had a
  handler call `ship.load`. A plain handler fails the first spool on the Node entries with
  `NEXUS_LOADED_AFTER_SCOPE` (G7 ruling 6).
- The telemetry stream extends its scope as the owner listed. It sends the bound drive's
  rating as a new frame field `ftlRating` from the frame after the load, through a third
  argument of `telemetryStream` and a helper `ftlRating(scope)` (G7 ruling 5).
- The record's status `offline` before the drive loads, a fifth value of `FtlStatus`, and
  the sector `Sol` at tick 0 (G7 ruling 2).
- A second spool on an armed drive answers 202 with the next tick and queues no command,
  and the first FTL request of either route loads the drive, so a jump before any spool
  answers `MERIDIAN_FTL_NOT_SPOOLED` from a loaded drive (G7 ruling 6).
- `IPowerRouter.attach` beside the loop's attach, both returning a detach. Sections 4.2
  and 6.3 named the loop's attach alone. G0 ruling 4's "`attach()`/`detach()`" was a tech
  lead ruling, and G7's own row amends it (G7 ruling 4).
- New public exports of the library: `FtlDrive`, `FTL_DRIVE`, `FtlNotSpooledError`, the
  types `IFtlDrive`, `FtlRating`, `FtlRecord`, `FtlSetpoints` and `FtlStatus`, and the
  members `ITickLoop.attach`, `IPowerRouter.attach` and `IFtlDrive.rating`. No subpath and
  no new dependency (G7 ruling 8).
- Ship behaviour the spec left open: the load id `ftl-spool`, a spool held at 0 W under
  90 % reactor level, the jump pulse applied in phase 3 from `LITHIUM_LOOP`, the charge
  held in J, the home sector `Sol` with a jump allowed to it, and no stand-down command
  (G7 rulings 3, 4 and 7).
- Three earlier unit-test edits, none an e2e body or a golden line: the `inspect()` call of
  `check.test.ts`'s "matches graph.json" case gains `load: [FtlDrive]`, and the two
  `slice(-4)` reads of `ship-state-store.test.ts` take the new key order. The console's
  growth config moves `comms` behind the new `ftl` project, and two helpers
  (`answerCommand`, `send`) call shared code (G7 ruling 13).
- The console page `/systems/ftl` in GJ and MW, `BRIDGE_LINK.spool()` and `jump(to)`, and
  a growth project `ftl` before `comms`. The page shares `StarSelect` with the helm page
  and `linkAction` with `systemAction` (G7 ruling 14).
- Tests beyond the spec: a gating route block and the telemetry cases per framework, the
  stub suite, a seventh runtime case, a module test with the FTL golden, and one library
  notes case for the loaded drive (G7 rulings 5, 10, 11 and 12).
- Spec text fixed in G7 beside the G7 rulings: the wording of the console's chart copy in
  the G6 list above (G7 ruling 16).

G8 goes past the spec's G8 text, which read "`Weapons`" alone, in these points, which its
plan lists for the owner. None changes a public docs page or removes a public export. G8
adds no runtime dependency between packages.

- The crew command `weapons fire` with a `range` in m from 0 to 100,000, through
  `POST /commands` as `comms hail` and the helm's commands go. The first fire arms the
  mount, which stays armed, and G8 adds no stand-down command (G8 ruling 7).
- A fire on an uncharged capacitor answers 202, and the shot leaves when the bank holds
  300 MJ. An unarmed fire refuses with `MERIDIAN_POWER_BUDGET` when the router cannot fit
  the charger, and an armed mount never refuses for power. G8 adds no error code (G8
  ruling 7).
- Behaviour past section 5.9's text: the charger tapers on the tick that fills the bank
  (200 MW at dt 0.5), so no energy leaves the model, and the clamp stays (G8 ruling 6).
- The shot heats the loop in phase 3 through the jump's `pulseCoolant`, and section 5.6
  drops its `Q_pulse` term, which nothing feeds (G8 ruling 4).
- The snapshot and the setpoints place `weapons` directly after `comms`, and section 4.1's
  order sentence changes to match, so no earlier assertion is rewritten (G8 ruling 10).
- Deps that differ from section 3.3 as first written: `RailgunMount` takes
  `[SHIP_STATE, SIM_OPTIONS, lazy(POWER_ROUTER)]` where the spec gave `[SHIP_STATE, RNG]`,
  and `WeaponsPower` reads `SIM_OPTIONS` (G8 rulings 6 and 8).
- New public exports of the library: `WEAPON_MOUNT` and the types `IWeaponMount`,
  `RailgunRating`, `RailgunShot`, `WeaponsRecord`, `WeaponsSetpoints` and `WeaponsStatus`.
  `/sim` and every telemetry frame gain `weapons`, `setpoints.weapons` and the `railgun`
  load (G8 ruling 8).
- Five enumerating unit assertions grow with the ship, each by an appended id, row, line
  or count, and G7's placement case stays as committed. Earlier goldens only gain lines
  (G8 ruling 11).
- The internal `pulseCoolant` moves from `physics/ftl.ts` to `physics/thermal.ts`, and the
  index never exported it (G8 ruling 15).
- The console page `/systems/weapons` in MJ, MW and m, with a growth project `weapons`
  before `comms`. The page's range form and `LevelForm` share `NumberForm` (G8 ruling 14).

G9 goes past the spec's G9 text in these points, which its plan lists for the owner. None
removes a public export or an earlier test. G9 changes nothing under `libs/` and adds no
runtime dependency between packages.

- The public /federation/ page changes: "Four folders hold it" becomes "Six folders hold
  it", with bullets for `examples/federation-engineering` and
  `examples/federation-life-support` (G9 ruling 11).
- The contract tokens are described `meridian/StationTelemetry` and `meridian/CommandLink`,
  since `meridian/TelemetryFeed` would fail the gating bundle check. The contract moves to
  2.4.0 and the drift build to 2.5.0 (G9 ruling 2).
- The federation growth suite holds three cases, one per station remote G9 touches, which
  reads section 7.4's "one e2e case per app" as one per remote project. `bridge-api` gets
  no e2e case (G9 ruling 8).
- The gating federation e2e gains two bundle-check titles for the station builds, as
  section 9 names each station's build (G9 ruling 8).
- `bridge-api`'s Hono entry answers the shell's origin through `hono/cors` in development
  and e2e (`SHELL_ORIGIN`, default `http://localhost:4300`). Express, Fastify and Workers
  get no CORS (G9 ruling 5).
- The shell reads `bridge-api`'s address from a runtime `/bridge.json`, and the telemetry
  stream does not reconnect after the bridge goes offline (G9 ruling 4).
- The life-support station sends `online`, `scrubber` and `oxygen` for the habitat, and the
  heater, vent and pump stay on the console. Engineering sends no command. G9 adds no crew
  command (G9 ruling 6).
- Only the G9 sections take the `<Name>Station` name. `Cartography` and `Command` keep
  theirs (G9 ruling 6).
- The #196 weapons comment regains "the burn at 0", which the first fix dropped, and loses
  a three-clause sentence (G9 ruling 1).
- Three contract unit cases move their literal versions up one minor, and the shell's
  `mf.test.ts` records gain the two station keys (G9 rulings 2 and 7).

## 16. Ship layout

The owner set the ship's class, its hull sections, its exterior and its look on
2026-10-24 (section 15). This section turns those decisions into a deck plan, a map from
each hull section to the code, the conduits, the network overlay and a brief for the art.
The figures come from node runs of the library's own `stepAtmosphere`, `doorFractions`,
`ventFraction`, `burns`, `transfer` and `pumpStalled` over the planned deck. No code
follows the plan yet, and section 16.7 lists what an implementation changes.

A hull section is a region of the layout, such as the bridge or the reactor bay. The word
section alone keeps its §7.1 meaning: a module added after startup with `load()`.

### 16.1 The ship

The Starship Meridian is a small survey frigate with a crew of 6 and the 1.21 GW reactor
of section 5.6. The hull is 72 m long, 16 m in the beam and 13 m high, inside the owner's
60 to 80 m. `HULL` keeps its 4.0 × 10⁶ kg and 3.3 × 10⁹ kg·m²: 4,000 t fill the hull's
box at 267 kg/m³, and a uniform 72 m rod of that mass gives 1.7 × 10⁹ kg·m², so the
mass at the stern and in the drive nacelles holds the rest. The main drive's 14.4 kN
moves the ship at 3.6 mm/s².

The occupants are one watch: two crew on the bridge, two in the mess and two asleep in
the quarters. The bridge holds six stations (helm, cartography, command, engineering,
life support and comms), and the two crew on watch work them.

The layout follows design guidelines, and the owner rules that the rule of cool outranks
real-world constraints across the whole layout. Where a guideline and the look disagree,
the look wins. The layout adopts these guidelines:

- The main drive sits on the thrust line through the centre of mass: two bells in twin
  nacelles, symmetric about the long axis, with the reactor, the capacitor bank and the
  FTL core near that axis.
- The reactor sits aft. Engineering's control room sits forward of it, and the reactor bay
  is a separate, windowless volume.
- The radiators are part of the hull: vanes along both drive nacelles and louvred panels
  in the reactor block's flanks.
- The RCS quads sit far from the centre of mass, at the bow and the stern corners, clear
  of the drive's plume.
- The railgun barrel runs above the main deck on the centreline, and the crew spine, the
  main deck's corridor, runs below it.
- The shuttle bay sits midship and the drone bay aft of it, both ventral and both ahead of
  the reactor bay.
- The comms array sits in a faired housing on the dorsal ridge ahead of the barrel's
  breech hump.
- The bridge keeps a recessed window strip under an armoured brow.
- One master plan drives every view: section 16.2's decks and positions place every room,
  door and conduit, and the deck plan, the side view, the top view and the cutaway derive
  from it.

Gravity plating gives the ship its down. The floors face dorsal, the deck plan is a true
top-down view, and the main drive's thrust is cosmetic, as its 3.6 mm/s² is.

The metrics are game scale, wider than naval or spacecraft figures, so a player moves
through the ship with room to spare:

| Item                 | Figure                            |
| -------------------- | --------------------------------- |
| main corridor        | at least 2.0 m wide               |
| secondary corridor   | 1.5 m wide                        |
| door                 | 1.5 m wide                        |
| pressure hatch       | 1.5 m by 2.0 m                    |
| deck, floor to floor | 3.2 m, with a 2.6 m clear ceiling |

The ship has three decks, 9.6 m together, over a 1.6 m keel and under a 1.8 m dorsal
ridge, which gives the 13 m height. The main deck runs from the bridge to the main drive,
and its 2.0 m spine carries the crew's route from the bridge to engineering. The upper
deck holds the comms relay and the quarters starboard of the barrel, water tanks port of
it over the habitat, and the capacitor room at the barrel's breech. The lower deck holds
the computer core, the two bays and the FTL core. A position below is the distance aft of
the bow in metres.

Every door of the deck is a pressure hatch of 1.5 m by 2.0 m, 3.0 m², since each sits
under `BLAST_DOORS` and the interlock. The two bay doors are larger. A room's `volume` is
its free gas volume, about 20 % to 60 % of the room under its 2.6 m ceiling in a crew or
machinery room, where consoles, berths, cabinets and plant fill the rest, and 9 % in the
reactor bay, where the reactor fills most of a two-deck volume. With the corridors and
hatches at these widths, every room of section 16.2 fits the 72 m by 16 m hull, so the
hull keeps its length and beam and grows 2 m in height for the 3.2 m decks.

Tanks may appear in the art as exterior or cutaway detail where they look good: on the
upper deck at 38.5 to 42.5 m between the capacitor room and the reactor bay, in the keel
under the reactor bay, and as the storm shelter's water tank on the upper deck at 12 to
27 m, port of the barrel. A tank is no room, so it is no compartment, and the rule that
the art shows no room the simulation lacks holds.

### 16.2 Compartments

`COMPARTMENT_IDS` keeps the four existing ids first, in their order, and appends the ten
new ones fore to aft. C is the structure heat capacity and G the hull conductance.

| Id               | Hull section             | Deck and position                        | Volume | Occupants | Equipment                        | C         | G       | Flood charge | Air                     |
| ---------------- | ------------------------ | ---------------------------------------- | ------ | --------- | -------------------------------- | --------- | ------- | ------------ | ----------------------- |
| `bridge`         | bridge                   | main, 2 to 10, centreline                | 60 m³  | 2         | heater, scrubber, oxygen         | 2.0 MJ/K  | 90 W/K  | 1,000 mol    | pressurised, occupied   |
| `habitat`        | habitat, galley and mess | main, 10 to 28, centreline and port      | 120 m³ | 2         | heater, scrubber, oxygen         | 4.0 MJ/K  | 150 W/K | 2,000 mol    | pressurised, occupied   |
| `reactor-bay`    | reactor bay              | main and upper, 43 to 55, windowless     | 80 m³  | 0         | none; `coolantConductance` 2 W/K | 6.0 MJ/K  | 110 W/K | 1,330 mol    | pressurised, unoccupied |
| `airlock`        | airlock                  | main, 24 to 27, port                     | 12 m³  | 0         | vent, pump into `habitat`        | 0.5 MJ/K  | 30 W/K  | none         | pressurised, cycles     |
| `chart-room`     | chart room               | main, 10 to 14, starboard                | 24 m³  | 0         | heater                           | 0.8 MJ/K  | 45 W/K  | 400 mol      | pressurised, unoccupied |
| `computer-core`  | computer core            | lower, 3 to 9, under the bridge          | 20 m³  | 0         | heater                           | 1.5 MJ/K  | 25 W/K  | 330 mol      | pressurised, unoccupied |
| `quarters`       | habitat, quarters        | upper, 17 to 27, starboard of the barrel | 48 m³  | 2         | heater, scrubber, oxygen         | 1.6 MJ/K  | 80 W/K  | 800 mol      | pressurised, occupied   |
| `comms-relay`    | comms                    | upper, 12 to 16, starboard of the barrel | 16 m³  | 0         | heater                           | 0.6 MJ/K  | 40 W/K  | 270 mol      | pressurised, unoccupied |
| `shuttle-bay`    | shuttle bay              | lower, 15 to 31, ventral                 | 480 m³ | 0         | none                             | 12.0 MJ/K | 370 W/K | none         | vacuum                  |
| `drone-bay`      | drone bay                | lower, 31 to 38, ventral                 | 50 m³  | 0         | none                             | 1.5 MJ/K  | 80 W/K  | none         | vacuum                  |
| `capacitor-room` | weapons                  | upper, 30 to 38, at the breech           | 36 m³  | 0         | heater                           | 3.0 MJ/K  | 60 W/K  | 600 mol      | pressurised, unoccupied |
| `engineering`    | engineering              | main, 28 to 43                           | 90 m³  | 0         | heater                           | 4.5 MJ/K  | 120 W/K | 1,500 mol    | pressurised, unoccupied |
| `ftl-core`       | FTL core                 | lower, 38 to 46                          | 50 m³  | 0         | heater                           | 5.0 MJ/K  | 80 W/K  | 830 mol      | pressurised, unoccupied |
| `main-drive`     | main drive               | main, 55 to 65                           | 40 m³  | 0         | heater                           | 4.0 MJ/K  | 70 W/K  | 670 mol      | pressurised, unoccupied |

The crew totals 6. The pressurised volume is 596 m³, and the two vacuum bays hold 530 m³.

The four existing compartments keep their volume, conductance, structure heat capacity,
flood charge and equipment. The habitat's split forces one change: `habitat` drops from
4 occupants to 2, since `quarters` takes 2 of the 6 crew. `habitat` keeps its 120 m³ as
the galley, the mess and the forward companionway, so the pump, vent and flood figures of
sections 5.4 and 5.10 hold for it. The door figures of section 5.5 change with the
hatches' 3.0 m².

The new rooms take their figures from the four existing ones:

- Hull conductance follows `G ≈ 6 W/K · V^(2/3)`, which the existing four fit at 5.7 to
  5.9. A room with less hull outside it takes less: the chart room 45 W/K (an inner wall
  to the bridge) and the computer core 25 W/K (the ventral skin alone).
- Structure heat capacity is 33.3 kJ/(K·m³) in a crew room, as the bridge and the habitat
  have it. A machinery room carries more mass: 50 kJ/(K·m³) in engineering, 75 in the
  computer core, 83 in the capacitor room and 100 in the FTL core and the main drive, beside
  the reactor bay's existing 75.
- A flood charge is 16.67 mol/m³ of N₂, the bridge's and the habitat's figure. Every
  flooded room then reads 14.94 % to 15.03 % O₂ at 141.5 to 142.4 kPa, under the 16 %
  that `burns` needs.
- Every pressurised room has a heater except the reactor bay and the airlock, which keep
  their existing plans. Without one a new room cools toward `T_hull`, and the model has no
  condensation: an unheated comms relay reads 260.0 K and 363 % relative humidity after
  48 h. A scrubber and a generator sit only where crew breathe.
- The two bays hold vacuum. A bay door opens to space, and a pump-down of the 480 m³
  shuttle bay into the 120 m³ habitat would stall far above vacuum. The shuttle bay's
  16 m by 8 m by 4.4 m, from the ventral skin to the main deck's floor, holds the shuttle
  beside 480 m³ of free volume. A suited crew reaches
  the shuttle through the airlock, cycled to vacuum, and the hatch `airlock-shuttle-bay`.

The doors, in deck order:

| Door                         | Between                         | Area   | Per tick         | τ      |
| ---------------------------- | ------------------------------- | ------ | ---------------- | ------ |
| `bridge-habitat`             | `bridge`, `habitat`             | 3.0 m² | f 0.340759       | 1.2 s  |
| `habitat-airlock`            | `habitat`, `airlock`            | 3.0 m² | f 0.433445       | 0.88 s |
| `airlock-outer`              | `airlock`, `space`              | 3.0 m² | keeps 0.00193045 | 0.08 s |
| `bridge-chart-room`          | `bridge`, `chart-room`          | 3.0 m² | f 0.590516       | 0.56 s |
| `bridge-computer-core`       | `bridge`, `computer-core`       | 3.0 m² | f 0.608394       | 0.53 s |
| `habitat-quarters`           | `habitat`, `quarters`           | 3.0 m² | f 0.360091       | 1.12 s |
| `habitat-comms-relay`        | `habitat`, `comms-relay`        | 3.0 m² | f 0.423898       | 0.91 s |
| `airlock-shuttle-bay`        | `airlock`, `shuttle-bay`        | 3.0 m² | f 0.141389       | 3.28 s |
| `shuttle-bay-outer`          | `shuttle-bay`, `space`          | 50 m²  | keeps 0.0739647  | 0.19 s |
| `shuttle-bay-drone-bay`      | `shuttle-bay`, `drone-bay`      | 3.0 m² | f 0.131953       | 3.53 s |
| `drone-bay-outer`            | `drone-bay`, `space`            | 6 m²   | keeps 0.0497871  | 0.17 s |
| `habitat-engineering`        | `habitat`, `engineering`        | 3.0 m² | f 0.300327       | 1.4 s  |
| `engineering-capacitor-room` | `engineering`, `capacitor-room` | 3.0 m² | f 0.448569       | 0.84 s |
| `engineering-ftl-core`       | `engineering`, `ftl-core`       | 3.0 m² | f 0.414749       | 0.93 s |
| `engineering-reactor-bay`    | `engineering`, `reactor-bay`    | 3.0 m² | f 0.356721       | 1.13 s |
| `reactor-bay-main-drive`     | `reactor-bay`, `main-drive`     | 3.0 m² | f 0.464739       | 0.8 s  |

`f` is `1 − exp(−dt / τ)` of section 5.5, and a door to space keeps the share of
`ventFraction` (section 5.4). Every hatch is 1.5 m by 2.0 m. The shuttle bay's ventral
doors are 10 m by 5 m and the drone bay's 3 m by 2 m. The door `habitat-reactor-bay`
leaves the deck: engineering sits between the habitat and the reactor bay, and
`engineering-reactor-bay` carries that route.

The game-scale hatches change the three existing doors. `bridge-habitat` grows from
1.5 m² to 3.0 m², and `habitat-airlock` and `airlock-outer` from 1.2 m² to 3.0 m². Every
`f` stays under 1, so the step stays stable. The habitat stays safe at the interlock's
limit: opening `habitat-airlock` across 5 kPa moves the habitat at −394 Pa/s on the first
tick, under the 2,000 Pa/s `DECOMPRESSION` limit. The outer hatch opened at 5 kPa empties
the unoccupied airlock at −9,981 Pa/s on its first tick, and the airlock raises no alarm.
Every inner door to a vacuum bay opens only under the interlock's 5 kPa (section 6.1), so
the airlock pumps and vents down before the hatch to the shuttle bay opens.

The balance with life support online at throttle 0.01 (the loop at 514.1 K), after 48 h:

| Room                              | T                | Heater         | Air                                     |
| --------------------------------- | ---------------- | -------------- | --------------------------------------- |
| `bridge`                          | 292.725 K        | 2,745 W        | CO₂ 25.6 Pa, 40.0 % RH, unchanged       |
| `habitat`                         | 292.532 K        | 4,680 W        | CO₂ 25.6 Pa, 40.0 % RH                  |
| `quarters`                        | 292.758 K        | 2,421 W        | CO₂ 25.6 Pa, 40.0 % RH                  |
| the seven heated unoccupied rooms | 292.6 to 292.9 K | 823 to 3,913 W | 39.6 % to 40.4 % RH                     |
| `reactor-bay`                     | 265.7 K          | none           | 236 % RH, as section 5.2's law gives it |
| `airlock`                         | 260.0 K          | none           | 363 % RH, as section 5.3 records        |
| the two bays                      | 260.0 K          | none           | vacuum, with off-gassing alone          |

The habitat with two occupants settles at 292.532 K and 4,680 W, where four gave
292.552 K and 4,482 W, and its CO₂ settles at 25.6 Pa, where four gave 51.25 Pa. Its
generator draws 364.6 W, 30.4 Pa under 21 kPa, the bridge's figure. The loop gain per tick
`K_t · dt / C` runs from 1.0 × 10⁻³ (the FTL core) to 8.3 × 10⁻³ (the comms relay), far
from oscillation. The airlock's pump-down into the habitat stalls with the airlock at
9,174 Pa and the habitat at 110,513 Pa, as section 5.4 gives, since the habitat keeps its
volume.

Life support's demand at full grows from 68.57 kW to 155.77 kW: ten heaters at 100 kW,
three scrubbers at 3.6 kW, three generators at 18 kW and the pump at 34.17 kW. It asks
28.9 kW at the 48 h balance. Section 5.7's figures move by that 87.2 kW:

| Figure of section 5.7                         | Now       | With the full deck |
| --------------------------------------------- | --------- | ------------------ |
| priorities 1 to 4 at full                     | 225.07 MW | 225.16 MW          |
| left beside priorities 1 to 4                 | 984.93 MW | 984.84 MW          |
| left beside priorities 1 to 5                 | 384.93 MW | 384.84 MW          |
| reactor level for the drive beside 1, 3 and 4 | 0.5166    | 0.5167             |
| reactor level for a full turn beside 1 and 3  | 0.02072   | 0.02079            |
| reactor level for the spool beside 1 to 4     | 0.9298    | 0.9299             |
| reactor level for the railgun beside 1 to 4   | 0.4339    | 0.4340             |
| throttle 0.01 over life support at full       | 176 times | 78 times           |

The thresholds move in the fourth decimal at most. A scenario that sits on a threshold
can move its first served tick, and the rewritten goldens record each such tick.

### 16.3 Hull sections and their code

Each row names the system of the simulation or the Academy mission that uses its hull
section. A hull section with no such use would get no row and no room. The simulation
gives every room its air, heat and doors. The code of the computer core and the drone bay
lives in the docs ship, `examples/meridian`, where the Academy's missions run.

| Hull section  | Compartments                 | Code                                                                                                                                                                                  | What it shows or teaches                                                                                            |
| ------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Bridge        | `bridge`                     | `Helm`: `HELM` (`HelmControl`) and `THRUSTERS` (`RcsThrusters`); `COMMAND_DESK` over `all(COMMAND_HANDLERS)`; the stations `cartography`, `command`, `engineering` and `life-support` | the command path from a station to a system's handler; federation remotes as stations                               |
| Chart room    | `chart-room`                 | `Tactical` and `OfflineTactical`: `NAV_CHARTS`, the async factory over `StarCharts`; the console's `Cartography` section                                                              | providers, Academy `02-chart-room`; an async factory                                                                |
| Computer core | `computer-core`              | `COMPUTER` (`QuantumComputer`) and `DIAGNOSTICS_PANEL` (`StatusBoard` over `all(DIAGNOSTICS)`) in the docs ship                                                                       | multi providers, Academy `09-diagnostics-sweep`                                                                     |
| Habitat       | `habitat`, `quarters`        | `LifeSupport.forRootAsync`: `ATMOSPHERE_SENSOR` (`GasAnalyzer`, transient, over the scoped `COMPARTMENT`), `ATMOSPHERE_CONTROL`, `ATMOSPHERE_PROBE`; `LifeSupportPower`               | a configured async module; a request that names its compartment through `REQUEST`                                   |
| Airlock       | `airlock`                    | life support's vent and pump; `BLAST_DOORS` (`BlastDoorControl`) behind `PressureInterlock`                                                                                           | an interceptor that refuses a command, `MERIDIAN_INTERLOCK`; the airlock drill of section 8.3                       |
| Shuttle bay   | `shuttle-bay`                | `ship.createScope({ request })`; the scoped `MISSION` and `FLIGHT_LOG` (`ShuttleFlightLog`) of `BridgeApi`                                                                            | scopes and `REQUEST`, Academy `06-shuttle-launch`: a shuttle launch is a scope                                      |
| Drone bay     | `drone-bay`                  | `DRONE` (`ScoutDrone`, transient) in the docs ship's `Tactical`                                                                                                                       | lifetimes, Academy `03-drone-bay`                                                                                   |
| Comms         | `comms-relay`, the array     | `Comms.forRoot({ frequency, transport, relayUrl })` or `OfflineComms`; `COMMS_ARRAY` (`PhasedArray`) over `optional(SUBSPACE_LINK)`; `CommsPower`                                     | configurable modules, Academy `05-open-channel`; an optional dependency                                             |
| Weapons       | `capacitor-room`, the barrel | `Weapons`: `WEAPON_MOUNT` (`RailgunMount`) over `lazy(POWER_ROUTER)`; `WeaponsPower`                                                                                                  | a lazy edge to a provider the mount reads at fire time                                                              |
| Engineering   | `engineering`                | `Engineering`: `REACTOR` (`FusionReactor`), `POWER_ROUTER` (`PlasmaRouter` over `all(POWER_CONSUMERS)`), `SHIELD_GRID` (`DeflectorGrid` over `lazy(POWER_ROUTER)`), `ShieldPower`     | disposal, Academy `07-scram-drill`; a lazy cycle, Academy `08-power-loop`; the contribution point `POWER_CONSUMERS` |
| Reactor bay   | `reactor-bay`, the radiators | `EngineeringPhysics` over `REACTOR` and the private `COOLANT_LOOP` (`RadiatorLoop`)                                                                                                   | a provider a module keeps out of its exports; `COOLANT_HIGH` and `REACTOR_TRIP`                                     |
| FTL core      | `ftl-core`                   | `FtlDrive`, loaded with `ship.load(FtlDrive)` through `di.load`: `FTL_DRIVE` (`JumpDrive`) attaches its physics to `TICK_LOOP` and `FtlPower` to `POWER_ROUTER`                       | `load()` of a section into a running ship                                                                           |
| Main drive    | `main-drive`, the nacelles   | `Propulsion`: `MAIN_DRIVE` (`PlasmaDrive`); `PropulsionPower`                                                                                                                         | a contribution to `POWER_CONSUMERS` whose heat reaches the coolant loop                                             |

Academy `01-first-light` and `04-decks` teach over the whole ship and take no hull section
of their own. The kernel modules (`Simulation`, `MeridianSystems`, `Telemetry`) and
`Safety` have no room either, and the network overlay draws them in the computer core
(section 16.5).

### 16.4 Conduits

The simulation models three kinds of conduit, and the deck view draws each where the
physics moves something. Every conduit runs through the compartments of section 16.2, so
a door, a deck and a position place it.

Power runs from `PlasmaRouter` in engineering to each load of `power.loads`. Six loads
come from `POWER_CONSUMERS`, the shields' among them, and
the FTL spool joins through `POWER_ROUTER.attach()` once the drive loads.

| Load           | Route from engineering                                                                                                                                     | Ends at                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `life-support` | to the habitat, then the bridge, chart room, computer core, quarters, comms relay and airlock; to the capacitor room, FTL core, reactor bay and main drive | each room's devices        |
| `shields`      | through the habitat and the bridge to the bow emitters; through the reactor bay and the main drive to the stern emitters; up and down to the midship pair  | the six deflector emitters |
| `comms`        | through the habitat to the comms relay                                                                                                                     | the dorsal array           |
| `thrusters`    | through the habitat and the bridge to the bow quads; through the reactor bay and the main drive to the stern quads                                         | the four RCS quads         |
| `main-drive`   | through the reactor bay to the main drive                                                                                                                  | the engine bells           |
| `railgun`      | up to the capacitor room                                                                                                                                   | the bank and the barrel    |
| `ftl-spool`    | down to the FTL core, drawn from the tick after the drive loads                                                                                            | the jump drive             |

A power conduit glows with its load's allocation over its demand. A load that `power.shed`
lists goes dark on that tick, beside its `LOAD_SHED` alarm, and a 0 W load draws an idle
line.

The coolant loop runs from the reactor bay out to the flank louvres and the vanes of both
nacelles, and back. Branches
run to each consumer whose heat reaches the loop in section 5.6: the main drive (heat share
0.4), the deflector emitters (0.25), the FTL core (0.1, and the jump's pulse) and the
capacitor room (the shot's pulse). Life support, comms and the thrusters put no heat in the
loop, so they get no branch. The loop's colour follows `coolant.temperature` from 500 K to
the 1,450 K trip, the radiators show the louvres' opening `λ`, and a jump or a shot sends a
pulse from its room to the loop on that tick.

An atmosphere duct runs through each of the sixteen doors, beside the pump line between
the airlock and the habitat and the vent from the airlock to space. An open door's duct
shows the exchange of section 5.5, its direction from `doorPressures` and its rate from
`fromA` and `fromB`. The pump line flows in the direction of its mode and stops when the
pump stalls. The vent and each door to space show the outflow. A door that `DECOMPRESSION`
closes shows shut in the alarm's colour.

### 16.5 The network overlay

The network overlay is a toggle in the MeridianOS chrome that draws the DI graph over the
deck. Every edge comes from the real graph. MeridianOS reads `GET /graph`, which answers
`graph(ship)` with `shipNotes` in development (section 7.1), when the overlay opens and
again after a command that loads a section, a spool or a jump. Outside development the
route answers 404, and the toggle stays disabled. The docs front page and the Academy run
the real core in the browser and draw the overlay from `inspect()` of the ship's root.

- A node is a provider, placed in the hull section of its module by section 16.3. The
  `system:` note of `shipNotes` names the module. A module with no hull section draws in
  the computer core.
- A module import is a conduit between two hull sections, from `modules[].imports`.
- A provider edge takes its style from its `kind`: `required` solid, `optional` and `lazy`
  dashed, `all` a fan from the consumer to each contribution of the multi token, and
  `alias` a thin line.
- A section that `load()` adds appears once loaded: `FtlDrive` and its edges join after the
  first spool or jump.

A missing provider or a broken import shows as a broken conduit. When `Nexus.check` throws
`NEXUS_BLUEPRINT_INVALID`, the overlay reads each `MissingProviderError` in it. The
`requester` gets a conduit that ends at an empty socket labelled with the `token`, and a
`not-imported` or `not-exported` near miss draws the module import between the requester's
module and the near miss's module as broken. The front page's pre-flight check runs this
path: a visitor cuts a conduit, and the overlay shows the break `Nexus.check` names.

The two layers share the deck's geometry. A physical conduit is drawn only where a real
dependency or a physics flow exists:

| Physical conduit   | Its DI edge                                                                                                            | Its physics flow                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| a power conduit    | `PlasmaRouter`'s `all(POWER_CONSUMERS)` to the load's consumer, and `JumpDrive`'s edge to `POWER_ROUTER` for the spool | the allocation of section 5.7                        |
| the coolant loop   | `EngineeringPhysics` to `COOLANT_LOOP`                                                                                 | the loop's balance of section 5.6                    |
| a coolant branch   | none                                                                                                                   | a heat share or a pulse of section 5.6               |
| an atmosphere duct | none                                                                                                                   | the door, pump and vent laws of sections 5.4 and 5.5 |

With the overlay on, a power conduit and its DI edge draw on the same route, so a reader
sees the router's multi-token read as the power bus.

### 16.6 Exterior and silhouette brief

This brief serves the concept boards and a later illustrator. One identity serves the
MeridianOS demo, the docs front page and the Academy.

The look is grounded and industrial: chamfered plates layered over a lofted core with
visible seams, detail at the joints (pylon roots, hatch frames), stencilled compartment
ids at each hatch, hazard banding at bay doors and hatches, and wear along the plate
edges. The shape language takes its cues from Star Citizen's multi-crew ships (CIG's
Constellation and Carrack comm-links, 12783 and 14323), and the views stay readable as
flat 2D shapes. The terminal panels are monochrome amber or green screens in a block
type, framed by chunky physical switches.
The design is original. It copies no franchise's ship silhouettes, logos, type, registry
formats or interior layouts.

The hull is six masses of different widths and heights, each a lofted volume of
`hull.volumes`: a raked command section at 0 to 10 m (bridge, chart room, computer
core), the habitat body at 6.5 to 28.6 m with the bay module under it at 14 to 43 m, a
narrow engineering neck at 28 to 43 m, the reactor block at 42 to 56 m and the drive
section at 55 to 66 m between the twin nacelles. Each mass shows in both the side and the
top silhouette. The bridge looks out through a recessed window strip that wraps the bow
under an armoured brow, split on the centreline by the barrel's spine. The bow emitters
sit under the chin, off the window line, so the bow does not read as a face. The barrel's
shroud runs along the dorsal ridge as one line from the breech hump over the capacitor
room to the muzzle at the bow, where it rides above the raked roof. The reactor bay reads
as the heavier, windowless block, and the nacelles, each 2.8 m in radius at 50 to 69.5 m,
carry the bells at the stern. In the cutaway, tanks fill the upper
deck between the capacitor room and the reactor bay at 38.5 to 42.5 m, and the keel under
the reactor bay. Engineering reaches the reactor bay's forward wall at 43 m on the main
deck, so the hatch `engineering-reactor-bay` sits in a shared wall.

The radiators are built into the hull: five vanes along the outboard side of each
nacelle at 55 to 67 m, and louvred panels in both flanks of the reactor block at 44.5 to
54 m. The owner calls them "unobtanium" radiators. The ship teaches on the demo app, the
front page, the docs and the Academy, so it must fit on one screen and read at thumbnail
size, and the physics serves that goal. The overall width across the nacelles and vanes
is about 23 m, and no part reaches past the 72 m length. The simulation keeps the heat
figures of section 5.6, including its 24,000 m² of radiator, which the art does not
draw to scale. The owner dropped the flat radiator wings of 96 m span on 2026-10-28.

| Feature            | Placement                                                                                                                                      | Code                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| bridge windows     | a recessed strip round the bow at 0 to 6 m, main deck, under the armoured brow, split by the barrel's spine                                    | `bridge`                               |
| radiators          | five vanes along each nacelle at 55 to 67 m, and louvred panels in the reactor block's flanks at 44.5 to 54 m                                  | `COOLANT_LOOP`, the louvres' `λ`       |
| deflector emitters | six: a pair under the bow's chin (2.5 m), a dorsal and a ventral at midship (30 m), a pair on the nacelles (62 m)                              | `SHIELD_GRID`                          |
| RCS quads          | four: bow port and starboard on the command section's shoulders at 5 m, stern port and starboard on the nacelles at 67 m, clear of the plume   | `THRUSTERS`                            |
| comms housing      | a faired dorsal pod at 10.5 to 18.5 m, starboard of the shroud, with the 8 m by 4 m phased array flush in its canted face over the comms relay | `COMMS_ARRAY`                          |
| sensor blister     | a dome on the command section's roof at 5.5 to 8.5 m, starboard of the shroud                                                                  | the survey sensors; no token models it |
| drive nacelles     | two, port and starboard of the drive section on pylons, 2.8 m in radius at 50 to 69.5 m, their axes 8.2 m off the centreline                   | `MAIN_DRIVE`                           |
| railgun barrel     | in the dorsal shroud above the main deck, from the breech over the capacitor room (30 m) to the muzzle in the bow face                         | `WEAPON_MOUNT`                         |
| shuttle bay doors  | ventral, 18 to 28 m, 10 m by 5 m                                                                                                               | `shuttle-bay-outer`                    |
| drone bay doors    | ventral, 33 to 36 m, 3 m by 2 m                                                                                                                | `drone-bay-outer`                      |
| airlock hatch      | port flank at 25 m, 1.5 m by 2.0 m                                                                                                             | `airlock-outer`                        |
| main engine bells  | one at the end of each nacelle, symmetric about the long axis, at 68 to 72 m, 2.6 m in exit radius                                             | `MAIN_DRIVE`                           |
| markings           | "MERIDIAN" on both bow flanks and the dorsal plate; the hull number `SV-01` on the reactor block's flanks and the ventral skin                 | none                                   |

The Meridian is the lead ship of the Meridian-class survey vessels. In `SV-01`, SV is the
role (survey vessel) and 01 is the first hull of the class. The hull number has no link to
the mission id `survey-7`.

The views:

- The side view (port) shows the full profile: the six masses, the window strip under
  the brow, the airlock hatch, both bay doors on the ventral line, the barrel's shroud
  along the ridge, the comms housing, and the nacelle with its vanes and bell.
- The top view (dorsal) shows the narrow neck between the habitat body and the reactor
  block, the twin nacelles, the emitters, the RCS quads, the shroud on the centreline, the
  comms housing, the sensor blister and the markings.
- The cutaway (port, cut on the centreline) shows every compartment of section 16.2 at its
  deck and position, labelled with its id, every door with its id, the tanks on the upper
  deck at 38.5 to 42.5 m between the capacitor room and the reactor bay and in the keel
  under the reactor bay, and the conduits of section 16.4 in one colour per kind. The
  cut hides the storm shelter's water tank, port of the barrel at 12 to 27 m.
  The network overlay draws over the same cutaway as its own layer.
- The deck plan is a true top-down view of each deck, since the floors face dorsal.

One master plan, the decks and positions of section 16.2, drives every view. A vertical
line through a room's boundary meets the same boundary in the side view, the top view,
the cutaway and the deck plan, and the MeridianOS deck view and the front page's schematic
take their geometry from the same plan.

`examples/meridian-systems/deck/meridian.geometry.json` holds that plan in metres: the hull
volumes, the three decks, each compartment's boxes with its `pressurised` flag, the
sixteen doors as rectangles on shared walls, floors and ceilings, the conduit routes of
section 16.4, the tanks and the exterior parts. `@nexusdi/meridian-systems/geometry`
exports it as `SHIP_GEOMETRY`, and a unit test checks that every room sits inside the
hull, that no two boxes overlap, that every door lies on a face both its sides share and
that every conduit leg stays inside one compartment. `tools/meridian-ship` builds the
concept mesh and its renders from the same file, and projects the same file to SVG
outlines for the website and the deck view.

Each compartment lists its fixtures, 42 in all: two to five blockout boxes or upright
cylinders per room, such as the bridge consoles and command chair, the bunks in the
quarters, the reactor vessel, the FTL core's ring, the shuttle and the drones on their
racks. Anything a viewer sees in both the cutaway and a deck plan lives in this list, so
the two views and the PixiJS deck view agree, and the paint-over adds surface detail
alone. The geometry test checks that each fixture sits inside its room, overlaps no
other fixture and keeps 1.0 m clear in front of each wall door and 0.2 m round each
hatch, and that every door of a room reaches every other door through free floor at
least 1.0 m wide. The bay doors are exempt, since the shuttle and the drone sit over
them to launch.

Fitting the rooms of section 16.2 into
boxes changed five placements:

- The airlock runs 5.5 m inboard from the port flank at 24 to 27 m, so its floor hatch
  `airlock-shuttle-bay` opens over the shuttle bay.
- The habitat is three boxes: a companionway at 10 to 14 m port of the chart room, which
  meets the bridge, the mess at 14 to 28 m, and a galley at 14 to 24 m along the port
  flank forward of the airlock.
- The comms relay sits starboard of the barrel, under the comms housing, which sits
  starboard of the shroud.
- Engineering runs to 43 m and the drone bay from 31 m, so the hatches
  `engineering-reactor-bay` and `shuttle-bay-drone-bay` sit in shared walls.
- The shuttle bay is 8 m wide and runs from the ventral skin to the main deck's floor.

### 16.7 What an implementation changes

The deck and the library:

- `deck/meridian.deck.json` holds the fourteen compartments and sixteen doors of section
  16.2. A compartment plan gains `pressurised`, true when absent. A room with `false`
  starts with no gas, and `ShipStateStore` throws a plain `Error` for such a room that
  lists equipment or a flood charge.
- `deck/meridian.geometry.json` already lists the fourteen compartments and sixteen doors.
  Its test checks that each deck compartment has a shape. The commit that grows the deck
  makes the test compare the two id lists and the `pressurised` flags for equality.
- `COMPARTMENT_IDS` appends the ten new ids. `DOOR_IDS` drops `habitat-reactor-bay` and
  gains thirteen doors. `CompartmentId` and `DoorId` widen with them, so every
  `Partial<Record<CompartmentId, …>>` setpoint takes the new keys.
- `deck/sensors.calibration.json` gains an entry for each new room, since
  `readAtmosphere` throws for a room it lacks.
- The gas laws keep their code. Unit tests pin an empty room: `burns` answers false, and
  `stepAtmosphere`, `exchange` and `readAtmosphere` stay finite at 0 mol.
- `graph.json` and `check.test.ts` stay as they are, since the layout adds no token, no
  provider and no module.

The goldens and the tests:

- Every golden under `examples/meridian-systems/e2e/golden/` rewrites once: the idle,
  life-support, airlock, safety, comms, helm, FTL and weapons scenarios. Each lists the
  new rooms and doors, and the life-support load and the habitat's air change with its two
  occupants.
- The unit and module tests that name the door `habitat-reactor-bay` move to
  `engineering-reactor-bay`: `doors.test.ts`, `gas.test.ts`, `safety.test.ts`,
  `ship-state-store.test.ts`, `blast-door-control.test.ts`, `safety-commands.test.ts`,
  `test/safety.test.ts` and `bridge-api`'s `test/routes.test.ts`. The cases that enumerate
  compartments or doors gain the new ids.
- The console's doors page and its `airlock.spec.tsx`, `safety.spec.tsx` and
  `tests/doubles.ts` take the new doors. The life-support station keeps its habitat
  commands.
- The figures of sections 5.2, 5.3 and 5.7 that section 16.2 lists move to their new
  values. The 3.0 m² hatches move the door fractions of section 5.5, the outer door's
  −186.0 kPa/s, and the airlock drill's ticks and rates in sections 5.4 and 5.11. `examples/meridian-systems/README.md` names the new door.

The systems gain per-compartment behaviour:

- Fire: eleven rooms carry a flood charge, so `drill` and `flood` reach each of them. The
  vacuum bays cannot burn, and the airlock carries no flood charge.
- Doors: sixteen doors, three of them to space, each under `PressureInterlock`. A shuttle
  launch cycles the airlock, opens `airlock-shuttle-bay` under 5 kPa and then
  `shuttle-bay-outer`.
- Alarms: the five atmosphere alarms read the three occupied rooms, so the quarters gain
  them. `FIRE` and `SENSOR_FAULT` read every room, and `DECOMPRESSION` closes every door
  of the occupied room it names.
- Telemetry: the frames carry the new rooms and doors. The conduits draw from records the
  snapshot already holds (`power.loads`, `power.shed`, `coolant`, the doors and the
  life-support setpoints), and the network overlay reads `GET /graph`.

The vocabulary: section 10.2's compartment and door rows take the lists of section 16.2
when the deck changes, and the rows for the layout's new terms join it now.
