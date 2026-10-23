# Simulating the Starship Meridian

The Meridian demos need a ship whose state changes between requests: a reactor the crew throttles, and air in each compartment that later systems heat, scrub, vent and pump. A reader who opens a demo module should still meet tokens and providers first, and an e2e case must read the same numbers on every run. This library holds that ship as a seeded, fixed-step simulation, and `examples/bridge-api` runs it.

The library is an example in the NexusDI repository. It reaches `@nexusdi/core` only through the public points any outside package has: `defineModule`, `provide`, `Token`, `MultiToken`, `all()`, `lazy()`, `REQUEST`, `errorBase` and the `NexusErrorByCode` and `NexusRequest` interfaces. `PressureInterlock`, behind the subpath `@nexusdi/meridian-systems/interlock`, also imports the `Interceptor` types of `@nexusdi/interceptors` with `import type`.

## The Modules a Ship Imports

A ship imports one module, the one `meridianSystems({ seed, dt, relayUrl?, relayTimeout? })` returns. `seed` picks the random streams, and `dt` sets the ship seconds per tick. `relayUrl` links the ship to the fleet's relay (the Comms section below), and `relayTimeout` sets how many ms the ship waits for the relay's answer at startup (5000 by default). It must be a whole number from 1 to 2,147,483,647, the longest delay a Node timer holds: `Comms` checks it with a schema, as `Simulation` checks `seed` and `dt`, and `Nexus.create` rejects NaN, a negative, zero, a fraction and Infinity with `NEXUS_PROVIDER_FAILED`, whose cause is `NEXUS_INVALID_MODULE_OPTIONS`. The library exports one module object beside `meridianSystems`: `FtlDrive`, which a running ship loads (the FTL Drive section below).

- `Simulation`, in `src/simulation/simulation.module.ts`, is a global module that `Simulation.forRoot({ seed, dt })` configures. It binds the clock, the random source, the ship state, the deck plan and the request's compartment, and exports them with `SIM_OPTIONS`. Its schema refuses a `seed` that is not a whole number from 0 to 4294967295 and a `dt` that is not a positive finite number. `Nexus.create` then rejects with `NEXUS_PROVIDER_FAILED` for the `SimOptions` token. Its `cause` is `NEXUS_INVALID_MODULE_OPTIONS`, whose `issues` name each refused field, the value it got and the accepted range. The check runs for `forRoot` and `forRootAsync` alike.
- `Telemetry`, in `src/telemetry/telemetry.module.ts`, binds `TELEMETRY` to `SnapshotFeed` and exports it.
- `MeridianSystems`, the aggregate in `src/meridian-systems.module.ts`, is global too. It imports `Simulation.forRoot({ seed, dt })`, `Telemetry` and its ship systems, from `Engineering` to `Weapons`, which the next sections describe. It binds `TICK_LOOP` with `FixedStepLoop` and `COMMAND_DESK` with `CommandDesk`, and exports both with `TELEMETRY`, `Engineering`, `LifeSupport`, `Safety`, the comms module, the tactical module, `Propulsion`, `Helm` and `Weapons`. The re-exports hand the root `REACTOR`, `POWER_ROUTER`, `SHIELD_GRID`, `ATMOSPHERE_PROBE`, `ATMOSPHERE_SENSOR`, `ATMOSPHERE_CONTROL`, `BLAST_DOORS`, `FIRE_SUPPRESSION`, `MASTER_ALARM`, `COMMS_ARRAY`, `NAV_CHARTS`, `MAIN_DRIVE`, `THRUSTERS`, `HELM` and `WEAPON_MOUNT`, and `SUBSPACE_LINK` on a ship with a relay.

Each ship system contributes one `IShipSystem`, with a `name` and a `phase` from 1 to 6, to the multi token `SHIP_SYSTEMS`. `FixedStepLoop` takes them all with `all(SHIP_SYSTEMS)`. `all()` reads the binding module's own providers plus the exports of its imports and of the global modules. Each system module but `Tactical` exports `SHIP_SYSTEMS`. A loop bound in `Simulation` would miss a system that a sibling module provides, so `TICK_LOOP` sits in the aggregate, which imports each system module. The command desk reads `all(COMMAND_HANDLERS)` for the same reason, so `COMMAND_DESK` sits beside it. Engineering's router reads `all(POWER_CONSUMERS)` inside `Engineering`, and LifeSupport's load reaches it through the global aggregate, which re-exports `LifeSupport`. Safety's physics reads LifeSupport's `ATMOSPHERE_PROBE` through the same re-export.

The tokens follow the interface-first rule: each interface has a token named for its role, and the module binds a class to each service token with `useClass`. `src/index.ts` exports the tokens, their interfaces and the six error classes, and keeps the other classes internal. An app registers `PressureInterlock` with the interceptors plugin itself, so `@nexusdi/meridian-systems/interlock` exports that class.

| Token                  | Interface            | Bound to                   | Bound in                      |
| ---------------------- | -------------------- | -------------------------- | ----------------------------- |
| `SIM_OPTIONS`          | `SimOptions`         | the `forRoot()` value      | `Simulation`                  |
| `SIM_CLOCK`            | `ISimClock`          | `FixedStepClock`           | `Simulation`                  |
| `RNG`                  | `IRandomSource`      | `SeededRandom`             | `Simulation`                  |
| `SHIP_STATE`           | `IShipState`         | `ShipStateStore`           | `Simulation`                  |
| `DECK_PLAN`            | `DeckPlan`           | `deck/meridian.deck.json`  | `Simulation`                  |
| `TICK_LOOP`            | `ITickLoop`          | `FixedStepLoop`            | `MeridianSystems`             |
| `COMMAND_DESK`         | `ICommandDesk`       | `CommandDesk`              | `MeridianSystems`             |
| `TELEMETRY`            | `ITelemetryFeed`     | `SnapshotFeed`             | `Telemetry`                   |
| `SHIP_SYSTEMS`         | `IShipSystem`        | one class per system       | each system module            |
| `COMMAND_HANDLERS`     | `ICommandHandler`    | one class per system       | each system module            |
| `REACTOR`              | `IReactorCore`       | `FusionReactor`            | `Engineering`                 |
| `COOLANT_LOOP`         | `ICoolantLoop`       | `RadiatorLoop`             | `Engineering`, private        |
| `POWER_ROUTER`         | `IPowerRouter`       | `PlasmaRouter`             | `Engineering`                 |
| `SHIELD_GRID`          | `IShieldGrid`        | `DeflectorGrid`            | `Engineering`                 |
| `POWER_CONSUMERS`      | `IPowerConsumer`     | one class per system       | each system module            |
| `COMPARTMENT`          | `CompartmentId`      | `compartmentOfRequest`     | `Simulation`, scoped          |
| `LIFE_SUPPORT_OPTIONS` | `LifeSupportOptions` | the `forRootAsync()` value | `LifeSupport`                 |
| `ATMOSPHERE_PROBE`     | `IAtmosphereProbe`   | `CalibratedProbe`          | `LifeSupport`                 |
| `ATMOSPHERE_SENSOR`    | `IAtmosphereSensor`  | `GasAnalyzer`              | `LifeSupport`, transient      |
| `ATMOSPHERE_CONTROL`   | `IAtmosphereControl` | `EnvironmentalController`  | `LifeSupport`                 |
| `BLAST_DOORS`          | `IBlastDoors`        | `BlastDoorControl`         | `Safety`                      |
| `FIRE_SUPPRESSION`     | `IFireSuppression`   | `InertGasSuppression`      | `Safety`                      |
| `MASTER_ALARM`         | `IMasterAlarm`       | `MasterAlarm`              | `Safety`                      |
| `ALARM_SINKS`          | `IAlarmSink`         | one class per sink         | a global module of the app    |
| `COMMS_OPTIONS`        | `CommsOptions`       | the `forRoot()` value      | `Comms`                       |
| `SUBSPACE_LINK`        | `ISubspaceLink`      | `SubspaceRelay`            | `Comms`                       |
| `COMMS_ARRAY`          | `ICommsArray`        | `PhasedArray`              | `Comms`, `OfflineComms`       |
| `NAV_CHARTS`           | `INavCharts`         | `StarCharts`               | `Tactical`, `OfflineTactical` |
| `MAIN_DRIVE`           | `IMainDrive`         | `PlasmaDrive`              | `Propulsion`                  |
| `THRUSTERS`            | `IThrusters`         | `RcsThrusters`             | `Helm`                        |
| `HELM`                 | `IHelm`              | `HelmControl`              | `Helm`                        |
| `WEAPON_MOUNT`         | `IWeaponMount`       | `RailgunMount`             | `Weapons`                     |
| `FTL_DRIVE`            | `IFtlDrive`          | `JumpDrive`                | `FtlDrive`, loaded            |

## Engineering

A crew member raises the shields, and the ship must answer at once whether the reactor can power them. The router answers from the reactor's output and its own queue of loads, which belong to different parts of the ship. `Engineering` wires the reactor, the coolant loop, the power router and the shield grid as services behind tokens, so the tick's physics and the crew's commands each take the parts they need.

### The Module and Its Tokens

`Engineering` binds four services and makes two contributions:

```text
REACTOR          FusionReactor        deps [SHIP_STATE]
COOLANT_LOOP     RadiatorLoop         no deps, not exported
POWER_ROUTER     PlasmaRouter         deps [SHIP_STATE, lazy(SHIELD_GRID), all(POWER_CONSUMERS)]
SHIELD_GRID      DeflectorGrid        deps [SHIP_STATE, POWER_ROUTER]
SHIP_SYSTEMS     EngineeringPhysics   deps [REACTOR, COOLANT_LOOP, POWER_ROUTER]
COMMAND_HANDLERS EngineeringCommands  deps [REACTOR, SHIELD_GRID]
```

It exports `REACTOR`, `POWER_ROUTER`, `SHIELD_GRID`, `SHIP_SYSTEMS` and `COMMAND_HANDLERS`. `COOLANT_LOOP` stays inside the module: `EngineeringPhysics` reads the loop's rating, and every other system reads the reactor and the router. A root that asks for it gets `NEXUS_NOT_VISIBLE`, and `test/engineering.test.ts` checks that.

- `FusionReactor` reads `output`, the electric output now in GW, from `SHIP_STATE`, and `throttle(level)` queues the reactor setpoint there. Its `rating` holds the fixed figures in W.
- `RadiatorLoop` holds the lithium loop's `rating` and nothing else.
- `PlasmaRouter.loads(ship)` lists the loads of a tick: the grid's draw, then the draw of each `POWER_CONSUMERS` entry. `divert(load)` checks a new load against the reactor's output.
- `DeflectorGrid.draw(ship)` gives the grid's load from its setpoint: 200 MW at priority 2 while raised, 0 while lowered. `raise()` asks the router to divert that load and then queues the raised setpoint. `lower()` queues the lowered one.

### The Cycle Between the Router and the Grid

The router and the grid read each other. The router lists the grid's draw on every tick, and the grid asks the router whether its raised load fits. `PlasmaRouter` takes `lazy(SHIELD_GRID)`, so the container builds the router with a thunk for the grid, then builds the grid on top of it. The router calls the thunk only in `loads()`, after both exist, so the cycle needs no setter and no second phase.

### The Command Desk

`COMMAND_DESK.submit(body)` takes a crew command, `{ system, action, ...args }`, and returns `{ tick }`, the tick that applies it. `CommandDesk` takes `all(COMMAND_HANDLERS)`, and each `ICommandHandler` names the `system` it serves, so a new system adds its commands with one contribution and no edit to the desk. Two handlers that serve one system make the desk's constructor throw.

The desk checks the envelope: `body` must be an object with a string `system` and a string `action`. It hands the command to the handler of that system. A bad envelope or an unknown system throws `BadCommandError`, and the error's `expected` lists the systems the desk serves. The aggregate's desk reads `comms, engineering, helm, life-support, safety and weapons`.

`EngineeringCommands` serves `engineering` and takes two actions:

```json
{ "system": "engineering", "action": "throttle", "level": 1 }
{ "system": "engineering", "action": "shields", "raised": true }
```

`throttle` takes a `level` from 0 to 1 and calls `REACTOR.throttle(level)`. `shields` takes a boolean `raised` and calls `SHIELD_GRID.raise()` or `lower()`. An unknown action or an argument out of range throws `BadCommandError`. A raise the router cannot fit throws `PowerBudgetError` from `divert()`, and the handler passes it through.

`SHIP_STATE` holds one pending setpoint change. `queue(change)` merges the change over it key by key at every level, the later value winning, and answers with the next tick. A throttle change and a shields change queued in one tick both apply, and of two throttle changes the later applies. A habitat heater target of 295 K and a habitat heater `on: false` queued in one tick apply as `{ on: false, target: 295 }`, and the bridge heater keeps its setpoint. At step 1 of that tick, the loop calls `applyQueued(tick)`, which applies the pending change and logs it as one entry under the tick. Changes queued between two ticks apply together at the next tick, and the log keeps one entry per tick. `log()` returns the newest 1,000 entries, oldest first. A refused command throws before it reaches the queue, so the log never holds it.

### The Scram on Shutdown

`FusionReactor[Symbol.dispose]()` is the scram. It commits the current snapshot at the same tick with the reactor at level 0 and no output, and the throttle setpoint at 0. The power record keeps the last tick's allocation. The loop takes `all(SHIP_SYSTEMS)`, `EngineeringPhysics` takes `REACTOR`, and the container disposes in the reverse of the build order, so the reactor scrams after the loop and after every service that takes the loop. `bridge-api`'s shutdown test reads that order from `trace()`.

### The Physics Behind Engineering

`EngineeringPhysics` runs in phase 1 under the name `Engineering`. It delegates each step to the pure functions of `src/physics/thermal.ts` and `src/physics/power.ts`.

- The reactor's level moves toward its throttle by at most 2 % per second, 0.01 per tick at `dt` 0.5, so it reaches full output 100 ticks after a throttle of 1. The thermal output is the level times 3.63 GW, and the electric output a third of it, 1.21 GW at full.
- The coolant loop is 200 t of lithium with a heat capacity of 8.34 × 10⁸ J/K. It gains the reactor's thermal output less its electric output, plus a share of each load's allocated power (0.25 for the shields). Its radiators lose `λ · ε · σ · A · (T_c⁴ − T_bg⁴)`, where the louvre opening `λ` rises from 0 at 500 K to 1 at 550 K. The loop starts at 500 K, above lithium's melting point of 453.7 K, and an idle loop holds 500 K exactly. At full output with no load it settles at 1,186 K.
- `allocatePower(output, loads)` serves the loads by priority, then by id. A load whose whole demand fits gets it. A load that does not fit gets 0 and joins `shed`, and the router moves on to the next.
- `divert(load)` runs the same `allocatePower` at the reactor's current electric output, with `load` in place of the current load of its id. When the result sheds `load`, it throws `PowerBudgetError`, whose `available` is the output less what the loads served before `load` got.
- On a tick, a shed load keeps its setpoint, and `power.shed` lists it on every tick the router sheds it.
- The loop trips the reactor at 1,450 K, read at the start of the tick or after its step. A tripped reactor steps toward 0, `reactor.tripped` stays true, and `EngineeringPhysics` writes the throttle setpoint to 0. The hottest equilibrium the loop reaches in this increment is 1,219.6 K, at full output with the shields raised and the main drive at full throttle (the drive puts 40 % of its power into the loop). That keeps the 1,350 K alarm and the trip out of reach. The trip test feeds a 1,450 K loop to the pure function.

A throttle of 1 queued at tick 0 shows the budget. After 16 ticks the reactor runs at level 0.16 and gives 193.6 MW, and a raise of the 200 MW grid answers `MERIDIAN_POWER_BUDGET`. After 17 ticks it gives 205.7 MW, and the raise queues for tick 18. The grid fits once the level reaches 0.1653.

The snapshot carries four engineering records, all in SI units:

- `reactor`: `level`, `thermal`, `electric` and `tripped`.
- `coolant`: `temperature`.
- `power`: `output` and `loads`, each load with its `id`, `priority`, `demand` and `allocated`. `shed` lists the ids of the loads that asked for power and got none.
- `setpoints`: `reactor.throttle` and `shields.raised`, beside `lifeSupport` (next section).

## Life Support

A crew member asks for the habitat's air, and the answer must come from the habitat's analyzer at the current tick. The heaters, scrubbers, oxygen generators and the airlock pump draw power from the reactor, and the router that shares that power belongs to Engineering. `LifeSupport` binds the analyzer and the panel behind tokens, and contributes its physics, its load and its commands. It contributes its load to the router and its commands to the desk, so neither Engineering nor the desk changes when it joins.

### The Module and Its Tokens

`LifeSupport`, in `src/systems/life-support/life-support.module.ts`, binds three services and makes three contributions:

```text
ATMOSPHERE_PROBE    CalibratedProbe          deps [RNG, LIFE_SUPPORT_OPTIONS, DECK_PLAN]
ATMOSPHERE_SENSOR   GasAnalyzer              transient, deps [COMPARTMENT, SHIP_STATE, ATMOSPHERE_PROBE]
ATMOSPHERE_CONTROL  EnvironmentalController  deps [SHIP_STATE]
SHIP_SYSTEMS        LifeSupportPhysics       deps [LIFE_SUPPORT_OPTIONS, DECK_PLAN]
POWER_CONSUMERS     LifeSupportPower         deps [LIFE_SUPPORT_OPTIONS, DECK_PLAN]
COMMAND_HANDLERS    LifeSupportCommands      deps [ATMOSPHERE_CONTROL]
```

It exports all six tokens. `src/systems/life-support/contracts.ts` holds the interfaces and the tokens, and each class sits in its own file beside it.

### Calibrating the Analyzers at Startup

An analyzer reads nothing true until it is calibrated, and the calibration comes from a file. `LifeSupport` declares `options: LIFE_SUPPORT_OPTIONS`, so its classes take the calibration and the device ratings from one `LifeSupportOptions` value. The aggregate configures the module once:

```text
LifeSupport.forRootAsync({ deps: [DECK_PLAN], useFactory: readCalibration })
```

It imports that one instance and re-exports it, so the root and Engineering's router read the same `LifeSupport`. `readCalibration(deck)`, in `read-calibration.ts`, reads `deck/sensors.calibration.json`, throws a plain `Error` when a deck compartment has no entry there, and returns `{ calibration, ratings: LIFE_SUPPORT_RATINGS }`. The file gives every compartment the same noise, 0.05 K on the temperature, 20 Pa on the pressure and 5 Pa on each partial pressure, and every reading rounds to 0.01 K and 1 Pa.

The factory is `async` though the demo has nothing to await, since the file is a static import. A ship that reads its calibration from a device awaits that read there. The container awaits the factory before it builds the classes that take the options, and `bridge-api`'s profiler test finds it as the one async step of startup.

### One Sample per Analyzer

A reading is a sample of one tick. `ATMOSPHERE_SENSOR` is transient, so each `get()` builds a new `GasAnalyzer`, which samples its compartment in its constructor. `read()` answers that sample. Two `get()` calls around an `advance(1)` read two ticks, and a second `read()` of one analyzer repeats its sample. A singleton or scoped sensor would answer the tick it was built in.

The analyzer samples through `ATMOSPHERE_PROBE`, whose `read(compartment, air, tick)` takes the air and the tick it reads. `CalibratedProbe` draws the noise from ``RNG.fork(`AtmosphereSensor:${compartment}:${tick}`)``. A fork's stream depends on the seed and the label alone, so every analyzer of one compartment and tick reads the same numbers, and no other system's draws move. Safety reads through the same probe, so its alarms see the readings a route gives. The arithmetic is the pure `readAtmosphere` of `src/physics/atmosphere.ts`. It draws the temperature, the pressure and then each gas in `GASES` order, and each value is `max(0, true + (2u − 1) · noise)` rounded to its resolution. The floor at 0 keeps a vented airlock from reading a negative pressure.

An `AtmosphereReading` holds `compartment`, `tick`, `temperature` in K, `pressure` in Pa and `partial`, the partial pressure of each gas in Pa.

### The Compartment of a Request

The analyzer takes `COMPARTMENT`, the compartment the current request names, so no method takes the room as an argument. The library augments core's `NexusRequest` with `compartment?: string`, and a server's request mapper sets it from the path. `Simulation` binds `COMPARTMENT` to `compartmentOfRequest`, a factory over `REQUEST` with `lifetime: 'scoped'` and `eager: false`. The factory narrows the string to a `CompartmentId` and throws `UnknownCompartmentError` when the request names no compartment or one the deck lacks.

`eager: false` lets a scope whose request names no compartment open, and only a `get` of `COMPARTMENT`, or of the sensor that takes it, throws. Core rethrows a `NexusError` from a synchronous factory as it is, so `scope.get(ATMOSPHERE_SENSOR)` throws `UnknownCompartmentError` itself. `bridge-api` matches it with `instanceof` and answers 404.

### Life Support's Load on the Router

The router shares the reactor's output among loads, and each system adds its own load with no edit to the router. `POWER_CONSUMERS` is a multi token of `IPowerConsumer`, whose `draw(ship)` returns a `PowerLoad`. `PlasmaRouter` takes `all(POWER_CONSUMERS)` beside `lazy(SHIELD_GRID)` and lists the grid's draw, then each consumer's. It reads LifeSupport's contribution through the global `MeridianSystems`, which re-exports `LifeSupport`.

`LifeSupportPower` draws `{ id: 'life-support', priority: 1, demand, heatShare: 0 }`. The pure `lifeSupportDemand` gives `demand` from the air at the start of the tick, and 0 W while life support is offline. `LifeSupportPhysics` runs its devices from the same function, so the router and phase 4 read one figure. The tick-0 power record lists the 0 W `life-support` load first, since its priority is 1. No life-support command calls `divert()`.

### The Life-Support Commands

`LifeSupportCommands` serves `life-support` and hands each command to `ATMOSPHERE_CONTROL`:

```json
{ "system": "life-support", "action": "online" }
{ "system": "life-support", "action": "heater", "compartment": "habitat", "target": 295 }
{ "system": "life-support", "action": "scrubber", "compartment": "bridge", "on": false }
{ "system": "life-support", "action": "oxygen", "compartment": "habitat", "on": true }
{ "system": "life-support", "action": "vent", "compartment": "airlock", "open": true }
{ "system": "life-support", "action": "pump", "compartment": "airlock", "mode": "evacuate" }
```

- `online` takes no argument. No command takes life support offline again.
- `heater` takes a string `compartment` and at least one of a boolean `on` and a `target` from 283 K to 303 K.
- `scrubber` and `oxygen` take a `compartment` and a boolean `on`, and `vent` a `compartment` and a boolean `open`.
- `pump` takes a `compartment` and a `mode`: `off`, `evacuate`, which moves the room's gas into its reservoir, or `fill`, which moves reservoir gas into the room.

The deck gives the bridge and the habitat a heater, a scrubber and an oxygen generator, and the airlock a vent and a pump whose reservoir is the habitat. `EnvironmentalController` checks that the compartment has the device and throws `BadCommandError` with `reason: 'argument'` when it lacks one, so a heater in the airlock and a pump in the habitat are refused. A missing or bad argument also throws `argument`, and an unknown action throws `action`.

### The Physics Behind Life Support

`LifeSupportPhysics` runs in phase 4 under the name `LifeSupport` and delegates each step to `stepAtmosphere` in `src/physics/atmosphere.ts`.

- Life support starts offline. While `setpoints.lifeSupport.online` is false, the step returns the ship unchanged, so the seeded ship keeps its initial air and the idle golden's compartments stay as they were. From the tick that applies `online`, every term below runs. Device commands queue while life support is offline and act from the first online tick.
- Life support runs on the reactor. At throttle 0 the reactor gives no power, so from the first online tick the router sheds `life-support`, and `test/life-support.test.ts` asserts that. A shed tick runs no heater, scrubber, generator or pump. Metabolism, hull loss, the bay leak and an open vent still run. Every powered scenario queues an engineering throttle of 0.01 beside `online`: the reactor gives 12.1 MW from tick 1, and the coolant settles at 514.1 K. This increment has no battery.
- Each tick, each room first steps from its start-of-tick air: metabolism and off-gassing, the generator, the scrubber, then the heat balance. Every open vent runs next, then every pump that is on and has not stalled, in deck order.
- The heat balance is explicit Euler, `T' = T + dt · (Q_heater + 100 W · occupants + Q_bay − G · (T − T_hull)) / C`, with `C` the structure's heat capacity plus each gas's moles times its `c_v`. The air holds 2.5 % of the habitat's 4,104,250 J/K. Each heater is a proportional thermostat, `clamp(10 kW/K · (T_set − T), 0, 10 kW)`, set to 293 K. After 600 ticks online the habitat reads 292.765 K at 2,346 W, and after an hour 292.552 K at 4,482 W, under the setpoint by the offset of a proportional controller. The bridge settles at 292.725 K at 2,745 W.
- Each occupant uses 3.038 × 10⁻⁴ mol/s of O₂ and gives 2.630 × 10⁻⁴ mol/s of CO₂ and 1.606 × 10⁻³ mol/s of water. Each room gives off 10⁻⁶ mol/s of volatiles.
- A scrubber, 0.05 m³/s at 1.2 kW, removes the fraction `1 − exp(−dt · S / V)` of the CO₂ and the volatiles. Water above 40 % relative humidity falls by the same fraction and stops at 40 %, with the saturation pressure from the Magnus formula (2,312 Pa at 293 K). The habitat's CO₂ climbs toward 2.5245 mol, 51.25 Pa, and reads 48.8 Pa after an hour.
- An oxygen generator adds `clamp(2 × 10⁻⁵ mol/(s·Pa) · (21 kPa − p_O₂), 0, 0.01 mol/s)` of O₂ at 600 kJ per mol, 6 kW at the full rate, and takes its water from the ship's tank. The habitat's generator settles 60.8 Pa under 21 kPa and draws 729 W there.
- The coolant loop leaks into the reactor bay: `Q_bay = UA · (T_c − T)`, with `UA` from the bay's `coolantConductance` of 2 W/K in the deck. The pipe runs 40 m through the bay at 0.3 m across, which gives 37.7 m² of surface, and a vacuum jacket with U ≈ 0.05 W/(m²·K) gives 1.9 W/K, rounded to 2. The loop's own balance leaves the leak out, since it is 7.4 × 10⁻⁷ of the loop's heat at full output. With hull loss alone the bay settles at 264.3 K beside a 500 K loop, with a time constant of 15.05 h, so after an hour at throttle 0.01 it reads 291.17 K.
- A vent of 0.01 m² keeps the fraction `exp(−dt · A / (κ · V))` of every gas, with `κ` 0.02 s/m. The airlock loses 2.0618 % a tick (τ 24 s), and a full airlock falls under 100 Pa at tick 333. The vent keeps the temperature and draws no power.
- The pump moves the fraction `min(1, 0.2 m³/s · dt / V_source)` of each gas, 0.008333 of the airlock per tick. The moved gas carries its energy into the target, so each gas's moles and the total `Σ C · T` stay the same. It draws `400 W + 0.2 m³/s · clamp(rise, 0, 101,300 Pa) / 0.6`, where `rise` is the target's pressure less the source's at the start of the tick, from 400 W to 34,166.67 W while its mode is not `off`. From a rise of 101,300 Pa it moves no gas and still draws the full figure. A pump that evacuates the airlock from tick 0 leaves it at 37,096 Pa at tick 120 and stalls at tick 289 with the airlock at 9,089 Pa. With the pump off and the vent open from tick 290, the airlock reads under 100 Pa at tick 506.
- At full demand the two heaters draw 20 kW, the two scrubbers 2.4 kW, the two generators 12 kW and the pump 34.17 kW, 68.57 kW in all.
- The model leaves out the heat of every device but the heaters, the pump's compression work, the cooling of the gas that stays under a vent, and condensation. The airlock has no scrubber and reads 57.55 % relative humidity after an hour online.

The snapshot carries the life-support records:

- `lifeSupport.heaters`: the power each heater put into its room on the tick, in W, 0 while offline or shed.
- `setpoints.lifeSupport`: `online`, and per device a record keyed by the rooms that carry it: `heaters` (`on` and `target`), `scrubbers`, `oxygen`, `vents` and `pumps`. At tick 0 life support is offline, the heaters are on at 293 K, the scrubbers and the generators are on, the vent is shut and the pump is off.

## Safety

A crew member opens the airlock's inner door, and the ship must refuse while the airlock holds a vacuum. A fire in the habitat must raise an alarm in an audit log that belongs to the server. `Safety` binds its two panels and the master alarm behind tokens, and contributes its physics and its commands. The interlock sits behind its own entry, which an app registers with `@nexusdi/interceptors`, and an app adds its alarm sinks to a multi token.

### The Module and Its Tokens

`Safety`, in `src/systems/safety/safety.module.ts`, binds three services and makes two contributions:

```text
BLAST_DOORS       BlastDoorControl     deps [SHIP_STATE]
FIRE_SUPPRESSION  InertGasSuppression  deps [SHIP_STATE]
MASTER_ALARM      MasterAlarm          deps [TICK_LOOP, all(ALARM_SINKS)]
SHIP_SYSTEMS      SafetyPhysics        deps [DECK_PLAN, ATMOSPHERE_PROBE]
COMMAND_HANDLERS  SafetyCommands       deps [BLAST_DOORS, FIRE_SUPPRESSION]
```

It exports all five tokens. `src/systems/safety/contracts.ts` holds the interfaces and the tokens, `ALARM_SINKS` among them, which no module of the library binds. `SafetyPhysics` reads LifeSupport's `ATMOSPHERE_PROBE` through the global `MeridianSystems`, which re-exports `LifeSupport`, so Safety reads LifeSupport only through LifeSupport's exports.

### The Doors and the Interlock

The deck has the four doors of `DOOR_IDS`: `bridge-habitat`, `habitat-reactor-bay`, `habitat-airlock` and `airlock-outer`, which joins the airlock to `space`. Every door starts shut. `BLAST_DOORS.open(door)` and `close(door)` queue the door's setpoint for the next tick, and throw `BadCommandError` with `reason: 'argument'` for a door the deck lacks. A command for the state a door already holds queues and changes nothing.

`PressureInterlock`, in `src/systems/safety/pressure-interlock.ts`, refuses to open a door with more than 5,000 Pa across it (`PRESSURE_INTERLOCK.limit`). It is an `Interceptor`, with `static deps = [SHIP_STATE, DECK_PLAN] as const`. It reads the true pressures of the committed snapshot through `doorPressures`, with `space` at 0 Pa, so its answer never depends on the RNG, and it throws `InterlockError` with the difference rounded to the pascal. Nothing interlocks `close`. At tick 0 the outer door holds 101,300 Pa, so the interlock refuses it until the airlock falls under 5 kPa.

No module of the library registers the interlock. An app imports it from `@nexusdi/meridian-systems/interlock` and binds it to `open` on `BLAST_DOORS`:

```text
interceptors({
  register: [PressureInterlock],
  bindings: [{ token: BLAST_DOORS, methods: { open: [PressureInterlock] } }],
})
```

The binding wraps the panel `SafetyCommands` holds, so a desk command passes the interlock, and the desk's caller gets the `InterlockError` as it is. `@nexusdi/meridian-systems/interlock` needs `@nexusdi/interceptors`; the main entry does not. `package.json` declares the package as an optional peer, and the interlock imports its types alone.

### The Safety Commands

`SafetyCommands` serves `safety` and hands each command to its panel:

```json
{ "system": "safety", "action": "drill", "compartment": "habitat" }
{ "system": "safety", "action": "flood", "compartment": "habitat" }
{ "system": "safety", "action": "open", "door": "habitat-airlock" }
{ "system": "safety", "action": "close", "door": "habitat-airlock" }
```

- `drill` calls `FIRE_SUPPRESSION.drill(compartment)`, which lights a drill fire in the room on the next tick when its air burns. No room of the seeded ship reaches the 330 K a fire needs to light by chance, so a crew on the seeded ship sees a fire only after a drill.
- `flood` calls `FIRE_SUPPRESSION.flood(compartment)`, which opens the room's flood valve, and the valve releases the room's charge of N₂ over 10 s.
- `open` and `close` take a string `door` and call the door panel.

`drill` and `flood` take a room with a flood charge: every compartment but the airlock. The airlock has none, so the panel refuses it with `reason: 'argument'`. A missing or non-string argument throws `argument` before the panel runs, so an interceptor on a panel reads a string, and an unknown action throws `action`. The error's `expected` reads "open and close with a door of bridge-habitat, habitat-reactor-bay, habitat-airlock or airlock-outer, and flood and drill with a compartment of bridge, habitat or reactor-bay".

### The Master Alarm and Its Sinks

Each tick, the safety step writes the active alarms into `safety.alarms`. `MasterAlarm` tells every `IAlarmSink` what changed. It listens to the loop in `onInit` and compares each committed tick's alarms with the set it last dispatched, keyed by `code` and `subject`. It clears the alarms that went, in their old order, then raises the new ones, in the record's order. A sink hears `raise(alarm, tick)` with the first tick that held the alarm, and `clear(alarm, tick)` with the first tick that did not. A sink that throws leaves the others served, and `advance()` throws its error after the committed tick, as it does for any listener. `MASTER_ALARM.active()` answers the alarms of the last tick. The alarm stops listening in `Symbol.dispose`.

`ALARM_SINKS` is a multi token, and an app contributes a sink with `provide(ALARM_SINKS, { useClass: ... })`. `all(ALARM_SINKS)` in `MasterAlarm` reads Safety's own providers plus the exports of its imports and of the global modules. Safety imports nothing from the app, so the module that contributes a sink must be global. `bridge-api`'s `AlarmPanel` is one such module, and `test/safety.test.ts` defines another around a recording sink. Every telemetry frame carries `safety.alarms`, so the library binds no sink of its own.

### The Physics Behind Safety

`SafetyPhysics` runs in phase 5 under the name `Safety`, after LifeSupport, and delegates each step to `stepSafety` in `src/physics/safety.ts`. The step runs the doors, the fires, the floods and the alarms, in that order. It has no online gate, so fires and floods run while life support is offline.

- Each open door trades gas in deck order, from the air the door before it left. With `f = 1 − exp(−dt · A / (κ · (V_a + V_b)))`, side A sends the fraction `f · V_b / V` of each gas and side B `f · V_a / V`, so one step multiplies the gap in molar density by `1 − f`. For `bridge-habitat`, `f` is 0.188064 a tick. `exchange` in `gas.ts` takes both parcels from the air before the step and mixes each into the other side's kept air at its own room's temperature, so a hot room and a cold room at one molar density still trade heat. Each gas's moles and `Σ C · T` stay the same.
- An open `airlock-outer` vents the airlock to space and keeps 0.08208 of its gas a tick, −186.0 kPa/s from 101.3 kPa.
- A room's air burns while its O₂ mole fraction is above 16 % and `p_O₂` is above 16 kPa (`burns` in `fire.ts`). A room with no fire, above 330 K, whose air burns, lights with the chance `1 − exp(−λ · dt)`, `λ = 10⁻³ /s`, on one draw from Safety's fork. Any other room draws nothing. A drill lights a room whose air burns at any temperature, with no draw, and every drill flag returns to false on that tick, lit or not.
- A fire starts at intensity `φ = 0.05`. While the air burns it grows by `0.05 · dt` a tick to at most 1, and reaches 1 in 38 ticks. While it does not, `φ` falls by the factor `exp(−0.2 · dt)` a tick, and the fire goes out under 0.01. A fire burns `0.5 · φ · dt` mol of O₂ a tick, at most the room's O₂, and heats the room by 400 kJ per mol burned. Each 0.5 mol burned adds 0.4 mol of CO₂ and 0.2 mol of H₂O.
- The deck gives the bridge a flood charge of 1,000 mol of N₂, the habitat 2,000 mol and the reactor bay 1,330 mol (`floodCharge`). An open valve releases `charge / 20` a tick, 10 s at `dt` 0.5, at the room's temperature, and counts it in `safety.flooded`. The tick that releases the last of the charge writes the valve false and the count 0. A flood queued while one runs changes nothing. After a 2,000 mol flood the habitat holds 14.99 % O₂ at 141.9 kPa, so its air no longer burns and the fire dies down.
- Each compartment, in `COMPARTMENT_IDS` order, raises `FIRE` while `φ > 0`. Safety then reads the room twice through `ATMOSPHERE_PROBE`: the start-of-tick air at `tick − 1` and the stepped air at `tick`, the readings a route gives for those two committed ticks. A read that throws raises `SENSOR_FAULT` for the room and skips its atmosphere alarms, and the fault clears on the first tick both reads succeed. An occupied room (`occupants > 0`) then raises the five atmosphere alarms of the table below. `COOLANT_HIGH` above 1,350 K and `REACTOR_TRIP` follow, each with the subject `reactor`, then one `LOAD_SHED` per shed load.

The alarms outside the table follow their records. Each atmosphere alarm raises at its first limit and, once it stood active at the start of the tick, clears only past its second. Each gap is at least ten times the sensor noise, so a noisy reading near a limit raises the alarm once. `dP/dt` is `(P_now − P_start) / dt`.

| Alarm           | Raised when                | Cleared when            |
| --------------- | -------------------------- | ----------------------- |
| `HYPOXIA`       | `p_O₂` < 16,000 Pa         | `p_O₂` ≥ 16,500 Pa      |
| `CO2_HIGH`      | `p_CO₂` > 1,000 Pa         | `p_CO₂` ≤ 950 Pa        |
| `PRESSURE_LOW`  | `P` < 70,000 Pa            | `P` ≥ 72,000 Pa         |
| `TEMPERATURE`   | `T` < 283 K or `T` > 303 K | 283.5 K ≤ `T` ≤ 302.5 K |
| `DECOMPRESSION` | `dP/dt` < −2,000 Pa/s      | `dP/dt` ≥ −1,000 Pa/s   |

While `DECOMPRESSION` stays active, Safety shuts every door of the room on each tick through the setpoints, and the command log gains no entry from it. The airlock has no occupants, so it cycles with no alarm. Two doors opened at tick 0 show the seal: with `habitat-airlock` and `airlock-outer` open, the airlock reads 8,315.2 Pa at tick 1. At tick 2 the habitat reads 99,581.5 Pa and raises `DECOMPRESSION`, and Safety shuts every door of the habitat. At tick 3 the alarm clears.

The step is idle with every door shut, no fire, no room above 330 K, no drill and no valve open. It then changes no gas and draws nothing from Safety's fork. It returns the incoming `compartments` object, so the goldens of the seeded ship keep their compartments byte for byte.

The snapshot carries the safety records:

- `safety`: `fires`, the intensity `φ` of each compartment with 0 for no fire, and `flooded`, the moles the running flood of each charged room has released. Its `alarms` hold each alarm as `{ code, subject }`, with the subject the compartment, or for an engineering alarm the shed load's id or `reactor`.
- `setpoints.safety`: `doors`, and `floods` and `drills` keyed by the charged rooms. At tick 0 every door is shut, and every valve and drill flag is false.

### The Airlock Drill

The airlock drill cycles the airlock under the interlock with the commands life support and Safety already take. The drill adds no command and no module. The crew starts at tick 0 with a throttle of 0.01, life support `online` and `pump evacuate`, and the ship then runs this schedule:

1. At tick 288 the pump has stalled with the airlock at 9,089 Pa, and the interlock refuses `airlock-outer` and `habitat-airlock`. The crew queues `pump off` and `vent open true`, which apply at tick 289.
2. The vent takes the airlock under 5,000 Pa. At tick 316 the interlock still refuses the outer door at 5,072 Pa. At tick 317 it passes it at 4,967 Pa, and `open airlock-outer` applies at tick 318.
3. The outer door stays open 20 ticks. At tick 337 the crew queues `close airlock-outer`, `vent open false` and `pump fill`, which apply at tick 338. The interlock refuses `habitat-airlock` while the fill runs.
4. At tick 445 the interlock still refuses `habitat-airlock` at 5,915 Pa. At tick 446 the fill has brought the airlock within 5,000 Pa of the habitat, so the crew queues `pump off` and `open habitat-airlock`, and both apply at tick 447.

The command log holds five entries, at ticks 1, 289, 318, 338 and 447. The drill raises no alarm in any room. The habitat falls at 184.6 Pa/s at worst, against the 2,000 Pa/s that raises `DECOMPRESSION`, and the airlock has no occupant. `test/safety.test.ts` covers the decompression law for a ship that skips the interlock.

## Comms

A ship far from the fleet may or may not hold a link to the fleet's relay. A server that starts the ship offline, such as a Worker that builds its graph at module scope or a test with no network, must still start and take a hail. The phased array's class therefore asks for its link with `optional(SUBSPACE_LINK)`: a graph that binds the link gives the array one, and a graph that binds none gives it `undefined`. Which graph the ship gets is a choice of module, and `Comms.forRoot` configures the one that links.

### The Modules and Their Tokens

`Comms`, in `src/systems/comms/comms.module.ts`, is a configured module. `Comms.forRoot({ frequency, transport: 'relay', relayUrl, relayTimeout? })` binds `COMMS_OPTIONS`, and the module binds the link and the array and makes three contributions:

```text
SUBSPACE_LINK     SubspaceRelay   deps [COMMS_OPTIONS]
COMMS_ARRAY       PhasedArray     deps [SHIP_STATE, optional(SUBSPACE_LINK)]
SHIP_SYSTEMS      CommsPhysics    deps [COMMS_ARRAY]
POWER_CONSUMERS   CommsPower      deps [COMMS_ARRAY]
COMMAND_HANDLERS  CommsCommands   deps [COMMS_ARRAY]
```

It exports all five tokens. `OfflineComms`, in the same file, binds the array and the three contributions with no link and no options. No module of that graph binds `SUBSPACE_LINK`, so `PhasedArray` reads `undefined`, and its `linked` flag is false for the life of the ship. A configured module's providers are static, so one module cannot drop the link when the options are missing, and the two modules split the choice.

`SubspaceRelay` calls `fetch` for `<relayUrl>/charts?frequency=1420` and rejects a response that is not ok. The request carries `AbortSignal.timeout(relayTimeout)`, 5000 ms by default, which covers the whole exchange, from the connection to the last byte of the body. A relay that stays silent past it makes the link throw `RelayError` with reason `timeout`, and `StarCharts.download` throws the same error with reason `malformed` when the answer is not a plain JSON object that maps each star name to a finite heading. A `null`, an array, a heading that is not a number, and a star name that `Object.prototype` holds, such as `__proto__` or `constructor`, all fail that check. Both errors stop `Nexus.create`: the container wraps the failed `NAV_CHARTS` factory in `NEXUS_PROVIDER_FAILED` and keeps the `MERIDIAN_RELAY` error as its `cause`. `SubspaceRelay` is the one file under `src/` that calls `fetch`, and the library's ESLint config refuses the global in every other file. A tick does no I/O: `PhasedArray` reads whether the link exists at construction, and no tick calls the link.

### Tactical and the Charts

The helm plots courses from `NAV_CHARTS`, an `INavCharts` whose `has(to)` answers whether the charts hold a heading for `to`, and whose `plot(to)` answers `{ to, heading }`, with heading 0 for a star the charts lack. A key of `Object.prototype`, such as `constructor` or `__proto__`, is no star, and an entry of a table that is not a finite number reads as uncharted. A downloaded table never reaches that check with such a key or entry, since `StarCharts.download` refuses it with `RelayError` at startup. `Tactical`, in `src/systems/tactical/tactical.module.ts`, binds `NAV_CHARTS` with an async factory that takes `SUBSPACE_LINK` and runs `StarCharts.download(link)`, which receives the relay's `charts` channel. The container awaits the download one level after it builds the link. `Tactical` imports no link of its own. It reads the one `Comms` exports, so it builds only beside `Comms`. `OfflineTactical` binds `NAV_CHARTS` to a `StarCharts` over `BUNDLED_CHARTS`, the table in `deck/charts.json` that the library exports, and does no I/O. `@nexusdi/meridian-systems/charts` exports `StarCharts` and `BUNDLED_CHARTS` and holds no simulation code, so the bridge console plots over the bundled table with no simulation in its bundle. On the offline ship, and on a relay that serves the bundled table, `NAV_CHARTS.plot('Kepler-442b')` answers heading 42.

### The Ship With and Without a Relay

`meridianSystems({ seed, dt, relayUrl })` imports `Comms.forRoot({ frequency: 1420, transport: 'relay', relayUrl })` and `Tactical`. Without `relayUrl` it imports `OfflineComms` and `OfflineTactical`. The aggregate re-exports whichever pair it imported, so the root reads `COMMS_ARRAY` and `NAV_CHARTS` on both ships, and `SUBSPACE_LINK` on the linked one. `bridge-api` builds its `Meridian` root with a relay and its `OfflineMeridian` root without one.

### The Hail

`CommsCommands` serves `comms` and takes one action, with no argument:

```json
{ "system": "comms", "action": "hail" }
```

The command queues `{ comms: { hail: true } }` through `ICommsArray.hail()` and answers the tick that applies it. Any other action, such as `send`, throws `BadCommandError` with `reason: 'action'`, `expected: 'hail with no arguments'` and the message "comms has no action 'send'. It takes hail with no arguments."

`CommsPhysics` steps the array in phase 6 through `stepComms`. The snapshot carries `comms`, the record, and `setpoints.comms`, the flag, both after `lifeSupport`:

- `comms.status` is `standby`, `no subspace link`, `no power` or `awaiting reply`.
- `comms.sent` is the tick of the last send, or null before the first.
- `comms.messages` holds the newest 10 messages, oldest first, each `{ tick, from, text }`.
- `setpoints.comms.hail` is true while a hail waits. At tick 0 the record is `{ status: 'standby', sent: null, messages: [] }` and the flag is false.

A hail waits while the array cannot send it, and the status says why. Without the link it waits under `no subspace link`. When the router shed the comms load it waits under `no power`. While a reply is outstanding it waits under `awaiting reply`, and it goes out on the tick after the reply. With the link, the power and no reply outstanding, the array sends on that tick: the record reads `awaiting reply` with `sent` at the tick, and the flag clears.

The relay answers `fleet traffic control: sector clear` 2 s after the send. That is 4 ticks at `dt` 0.5, so a hail sent at tick 10 is still `awaiting reply` at tick 13 and back to `standby` at tick 14, and at `dt` 1 the reply comes 2 ticks after the send. No call goes to the relay for the reply, since the simulation models the traffic.

`CommsPower` asks the router for 5 MW at priority 3 on each tick a hail waits on a linked array with no reply outstanding, and 0 W otherwise, with heat share 0. The load reads the snapshot at the start of the tick, as `stepComms` does, so the router allocates the power on the tick that sends. The router sheds the load when less than 5 MW of the reactor's output remains after life support and the shields take their allocations. The router lists `comms` in `power.shed`, and Safety raises `LOAD_SHED` for subject `comms` while the hail waits under `no power`.

Four scenarios from `test/comms.test.ts` fix the figures, each on seed 7 and `dt` 0.5:

- A hail at tick 0 with the reactor at throttle 0.01 goes out at tick 1. The load asks and gets 5,000,000 W of the reactor's 12,100,000 W, ticks 2 to 4 ask 0 W, and tick 5 reads `standby` with `{ tick: 5, from: 'fleet traffic control', text: 'sector clear' }`.
- A hail at tick 0 on a cold reactor reads `no power` for ticks 1 to 3, with the load asking 5,000,000 W, getting 0 W and the alarm `LOAD_SHED` on `comms`. A throttle queued after tick 3 applies at tick 4, the array sends at tick 4 and the reply comes at tick 8.
- A second hail queued after tick 2 applies at tick 3 and waits. Ticks 3 and 4 read `awaiting reply` with the flag true and 0 W. The reply comes at tick 5, the array sends again at tick 6 with 5,000,000 W, and tick 10 reads `standby` with messages at ticks 5 and 10. The command log holds ticks 1 and 3.
- Eleven hails five ticks apart leave 10 messages at tick 55, the oldest from tick 10 and the newest from tick 55, with `sent` at 51.

The offline ship takes a hail at tick 1 and a second at tick 21. At ticks 1, 20 and 600 it reads `no subspace link` with the flag true, no message, no alarm, nothing shed and the load at `{ id: 'comms', priority: 3, demand: 0, allocated: 0 }`.

## Propulsion and the Helm

A crew member picks a star, and the ship must turn to its heading and then push along it. Two parts of the ship do that work. The thrusters turn the hull, and the main drive pushes it. The helm reads the heading from the charts, and the drive needs none of that. `Propulsion` and `Helm` are two modules, so each one binds its own services and contributes its own load and physics, and neither module changes the router or the desk.

### The Modules and Their Tokens

`Propulsion`, in `src/systems/propulsion/propulsion.module.ts`, binds the main drive and makes two contributions:

```text
MAIN_DRIVE       PlasmaDrive         deps [SHIP_STATE]
SHIP_SYSTEMS     PropulsionPhysics   deps [MAIN_DRIVE]
POWER_CONSUMERS  PropulsionPower     deps [MAIN_DRIVE]
```

`Helm`, in `src/systems/helm/helm.module.ts`, binds the thrusters and the helm and makes three contributions:

```text
THRUSTERS         RcsThrusters   deps [SHIP_STATE]
HELM              HelmControl    deps [THRUSTERS, MAIN_DRIVE, NAV_CHARTS]
SHIP_SYSTEMS      HelmPhysics    deps [THRUSTERS]
POWER_CONSUMERS   HelmPower      deps [THRUSTERS]
COMMAND_HANDLERS  HelmCommands   deps [HELM]
```

Each module exports all its tokens. `Propulsion` binds no command handler, since the crew gives every command to the helm. `Helm` imports no module. `HelmControl` reads `MAIN_DRIVE` and `NAV_CHARTS` through the global aggregate, which re-exports `Propulsion` and the tactical module. `IMainDrive.rating` and `IThrusters.rating` hold the hardware's fixed figures, so a test swaps a drive or a thruster set behind the token. The helm's control law, `HELM_TUNING` and `HELM_SETTLE`, sits in `src/physics/motion.ts` beside the hull.

### The Helm Commands

`HelmCommands` serves `helm` and takes two actions:

```json
{ "system": "helm", "action": "course", "to": "Kepler-442b" }
{ "system": "helm", "action": "burn", "level": 1 }
```

`course` takes a string `to`. When the command arrives, `HelmControl` asks `NAV_CHARTS.has(to)` whether the charts hold the star, and refuses the course when they do not. For a charted star it asks `NAV_CHARTS.plot(to)` for the heading once and converts the charts' degrees to radians. The thrusters then queue the heading as `setpoints.helm.heading`. No tick calls the charts. `burn` takes a `level` from 0 to 1 and calls `MAIN_DRIVE.throttle(level)`, which queues `setpoints.drive.throttle`. The range check is the one the engineering throttle uses.

A command that names an unknown action, such as `warp`, throws `BadCommandError` with `reason: 'action'` and the message "helm has no action 'warp'. It takes course with a charted star to steer for and burn with a level from 0 to 1." A `burn` level out of range and a `course` with no string `to` throw it with `reason: 'argument'`. So does a `course` to a star the charts do not hold, such as `Vega` or `constructor`, with the message "helm course got an argument it cannot use. It takes course with a charted star to steer for and burn with a level from 0 to 1." The thrusters throw `RangeError` for a heading that is not finite.

Neither command diverts the router. A burn on a cold reactor queues, and the router sheds the `main-drive` load. Safety raises `LOAD_SHED` for subject `main-drive` until the reactor gives 600 MW.

### The Records and the Setpoints

The snapshot gains two records and two setpoints, all in SI units and all at zero at tick 0. They sit after `comms`:

- `drive`: `thrust` in N, `massFlow` in kg/s, `acceleration` in m/s², `velocity` in m/s and `distance` in m. The ship moves along one track, so `velocity` and `distance` read along the track since tick 0.
- `helm`: `attitude` in rad, in (−π, π], `rate` in rad/s and `torque` in N·m.
- `setpoints.drive.throttle` from 0 to 1, and `setpoints.helm.heading` in rad. The one heading holds the course the crew set and the heading the helm steers for.

The tick-0 power record lists the `thrusters` and `main-drive` loads at 0 W after `comms`.

### The Physics Behind the Helm and the Drive

`HelmPhysics` and `PropulsionPhysics` run in phase 2 under the names `Helm` and `Propulsion`, and delegate to `stepHelm` and `stepDrive` in `src/physics/motion.ts`. The loop steps a phase in name order, so `Helm` steps first. That order changes no figure, because the drive reads the helm's attitude from `TickContext.start`, the snapshot before any system stepped. The thrust direction therefore lags the attitude by one tick during a turn.

- The helm is a PD controller on the yaw angle. With `e = wrap(θ_set − θ)`, the torque is `I · (ω_n² · e − 2 · ζ · ω_n · ω)`, clamped to ±5 MN·m, with the hull's inertia `I` of 3.3 × 10⁹ kg·m², `ω_n` of 0.05 rad/s and `ζ` of 1. The step is semi-implicit Euler: `ω' = ω + τ / I · dt`, then `θ' = wrap(θ + ω' · dt)`. On a tick the router shed the thrusters, the torque is 0 N·m.
- The helm settles. When the error is under 10⁻⁶ rad and the rate under 10⁻⁶ rad/s at the start of a tick, the helm holds `θ = θ_set` with no rate and no torque. Without the settle, the record of a 42° turn would still change at tick 2,272 by a torque of 2.0 × 10⁻²³ N·m. In the 42° turn the snap moves the ship by 9.94 × 10⁻⁷ rad.
- `wrap` and the helm law use only `+`, `−`, `·`, `/`, `Math.ceil`, `Math.abs`, `Math.min`, `Math.max` and compares, which ECMA-262 fixes bit for bit, so every engine computes the same angle. `Math.cos` differs by one ulp between Node, Deno and Bun for about 3 % of angles. The drive calls it as `cos(attitude − course)`, which is `cos(0)` once the helm has settled, and the aligned burn gives the same doubles on every runtime.
- The thrusters ask the router for `20 MW · |τ| / τ_max` at priority 4, and 0 W once the helm settles. They put no power into the coolant loop.
- The drive pushes with `F = 2 · η_d · P_d / v_e`, with `η_d` of 0.6, `v_e` of 50 km/s and `P_d` the power the router allocated the `main-drive` load. That gives 14,400 N at 600 MW and spends `ṁ = F / v_e = 0.288` kg/s. The acceleration is `F · cos(attitude − course) / M` for a ship of 4.0 × 10⁶ kg, 0.0036 m/s² when aligned. The speed and the distance follow by Euler: `v' = v + a · dt` and `s' = s + v' · dt`. The ship's mass stays 4.0 × 10⁶ kg, since 300 s at full power spends 86.4 kg. With no thrust the step computes no cosine and the ship coasts.
- The drive asks the router for `throttle · 600 MW` at priority 5, and 40 % of its allocation heats the coolant. The loop's equilibrium at full output is 1,214.0 K with the drive at full throttle and 1,219.6 K with the shields raised too, under the 1,350 K alarm.
- A new course keeps `velocity` and `distance`. The model has one dimension, and a reset would remove momentum no force removed.

### The Reactor Level a Turn Needs

Both loads read the snapshot at the start of the tick, so the torque the router prices is the torque the helm applies. A turn at full torque asks 20 MW, and the reactor gives its level times 1.21 GW, so the thrusters fit above level 0.0165 (0.01653). At the throttle of 0.01 that the other scenarios use, the reactor gives 12.1 MW. The router then sheds a saturated turn on every tick, so the helm never moves. Safety holds `LOAD_SHED` for `thrusters` all the while. The unclamped demand is `4 · |τ|` W, so at 0.01 a course change under about 21° still turns, and a larger one waits on the reactor. A scenario that turns the ship raises the throttle first. The drive alone needs the reactor at 0.4959 (600 MW of 1.21 GW).

### Following One Course

The golden scenario, from `test/helm.test.ts`, queues a throttle of 0.6, `helm course to Kepler-442b` and `helm burn level 1` at tick 0, and each answers `{ tick: 1 }`. Seed 7, `dt` 0.5, the offline ship:

- At tick 1 the reactor gives 12.1 MW. The router gives the thrusters (20 MW asked) and the drive (600 MW asked) 0 W and lists both in `power.shed`. Safety raises `LOAD_SHED` for each. The heading setpoint reads 0.7330382858376184 rad (42°) and the helm has not moved.
- At tick 2 the thrusters get 20 MW and the helm reads a torque of 5,000,000 N·m, a rate of 0.0007575757575757576 rad/s and an attitude of 0.0003787878787878788 rad.
- Ticks 2 to 49 shed `main-drive` alone. At tick 50 the reactor gives 605 MW, the drive gets 600 MW and thrusts 14,400 N, with an acceleration of 0.003188 m/s² because the attitude is still about 0.48 rad off the course. No alarm is up.
- The helm is within 1° of the course from tick 229 and settles at tick 688, with the thrusters at 0 W from then. At tick 1,200 the velocity is 2.0652 m/s and the distance 592.98 m, and the golden reads the coolant at 1,064 K.

The second scenario turns first and burns after the helm settles. A throttle of 0.6 applies at tick 1 and the course at tick 11. The helm settles at tick 697, and at tick 800 it reads `{ attitude: 0.7330382858376184, rate: 0, torque: 0 }` with both new loads at 0 W. A burn queued after tick 800 applies at tick 801, and at tick 1,200 the drive reads 14,400 N, 0.288 kg/s, 0.0036 m/s², 0.72 m/s and 72.18 m. The command log holds ticks 1, 11 and 801.

## Weapons

A crew member fires the railgun with a range, and the shot leaves once the capacitor holds 300 MJ. The capacitor draws its charge from the power router like any other load, and each shot puts a quarter of its energy into the coolant loop as heat. `Weapons` is a static module of the aggregate, so every ship has it from tick 0.

### The Module and Its Token

`Weapons`, in `src/systems/weapons/weapons.module.ts`, binds the mount and makes three contributions:

```text
WEAPON_MOUNT      RailgunMount     deps [SHIP_STATE, SIM_OPTIONS, lazy(POWER_ROUTER)]
SHIP_SYSTEMS      WeaponsPhysics   deps [WEAPON_MOUNT]
POWER_CONSUMERS   WeaponsPower     deps [WEAPON_MOUNT, SIM_OPTIONS]
COMMAND_HANDLERS  WeaponsCommands  deps [WEAPON_MOUNT]
```

The module exports all four tokens and imports no module. `SIM_OPTIONS` reaches the mount and the consumer through the global `Simulation`, and both read `dt` from it. `src/systems/weapons/contracts.ts` holds `IWeaponMount`, whose `rating` carries the railgun's fixed figures and whose `fire(range)` queues a shot, and `WEAPON_MOUNT`, the `Token<IWeaponMount>`. The index exports the token, the interface and the types `RailgunRating`, `RailgunShot`, `WeaponsRecord`, `WeaponsSetpoints` and `WeaponsStatus`.

`RailgunMount` reads `POWER_ROUTER` through `lazy()`. The router reads the mount's load through `POWER_CONSUMERS`, so the router depends on the mount's consumer and the mount depends on the router. The thunk breaks the cycle, and the constructor never calls it. `PlasmaRouter` takes `lazy(SHIELD_GRID)` for the same reason (the Cycle Between the Router and the Grid section above).

### The Record and the Setpoints

The snapshot gains one record and the setpoints one entry, both after `comms`:

- `weapons`: `status`, `charge` in J, `shots`, `hits` and `lastShot`. `status` is `idle`, `held`, `charging` or `charged`. `shots` counts the shots since tick 0 and `hits` the ones that hit. `lastShot` is `{ tick, range, hit }` for the newest shot, or null before the first.
- `setpoints.weapons`: `armed`, true once the crew fired, and `range`, the range in m of a shot that waits for its charge, or null.

The store starts the record at `{ status: 'idle', charge: 0, shots: 0, hits: 0, lastShot: null }` and the setpoints at `{ armed: false, range: null }`, both frozen. A step that changes nothing returns the record it got, so an idle ship keeps the same object tick after tick. The power record lists `railgun` at 0 W after `main-drive` from tick 0, and the snapshot and the setpoints list `weapons` between `comms` and the drive.

### The Fire Command

`WeaponsCommands` serves `weapons` and takes one action:

```json
{ "system": "weapons", "action": "fire", "range": 10000 }
```

`range` is a number from 0 to 100,000 m. Any other action, a missing or non-numeric `range`, `NaN` and a value out of range throw `BadCommandError`, the action with `reason: 'action'` and the rest with `reason: 'argument'`. The desk answers `{ tick }`, the tick that applies the shot's setpoints.

`IWeaponMount.fire(range)` has two cases:

- On an unarmed mount it asks `POWER_ROUTER.divert` for the load the capacitor will ask once armed, 300 MW at priority 6, and queues `{ armed: true, range }`. It throws `PowerBudgetError` when the router cannot fit the load. At tick 0 the router has 0 MW free, and at tick 24 of a throttle-1 ramp it has 290.4 MW free.
- On an armed mount it asks no `divert` and queues `{ range }`. The first fire arms the mount and it stays armed, because the crew has no stand-down command. A second check would refuse a shot on a tick the router sheds the capacitor, and an armed mount never refuses for power.

Two fires queued in one tick merge, and the later range wins. A fire on a mount that still waits for its charge replaces the waiting range.

### The Physics Behind the Railgun

`WeaponsPhysics` runs in phase 3 under the name `Weapons` and delegates to `stepWeapons` in `src/physics/weapons.ts`. `RAILGUN` holds the rating: a capacity of 400 MJ, a shot of 300 MJ, a charging power of 300 MW, a pulse share of 0.25, an accuracy of 0.8 at 0 m, a falloff of 50,000 m and a range of 100,000 m.

- `railgunDemand` reads the snapshot at the start of the tick. The load asks `min(300 MW, (400 MJ − E) / dt)` while the mount is armed below a full bank, and 0 W otherwise. Its heat share is 0, since the capacitor stores what it draws. `WeaponsPower` draws it at priority 6, after life support, the shields, comms, thrusters and drive and before the FTL spool at priority 7.
- The charge is `min(400 MJ, E + P_w · dt)`, with `P_w` the power the router allocated the `railgun` load. At `dt` 0.5 a full tick adds 150 MJ. The tick that fills the bank asks only what fits, so a bank at 300 MJ asks 200 MW. The capacitor stores every joule it draws, and the clamp stays as a guard.
- A waiting shot fires once the charge, after that tick's top-up, reaches 300 MJ. An empty bank therefore fires on its second charging tick. The step spends 300 MJ, draws one number from the stream the loop forked for `Weapons`, hits when the draw is under `0.8 · exp(−range / 50,000)`, counts the shot, writes `lastShot` and clears `range`. A tick with no shot draws nothing.
- The shot adds a pulse of 75 MJ (`pulseShare · E_shot`) to the coolant loop through `pulseCoolant` with `LITHIUM_LOOP`, which raises it by 0.0899 K in phase 3. The next tick radiates from the raised temperature.
- The step derives the status on every tick: `charged` at a full bank, `idle` when the mount is unarmed, `held` when the router shed the load and `charging` otherwise. A mount that fired is armed, so it reads `charging` until the bank fills again.
- `hitChance` holds the railgun's one call of `Math.exp`, which ECMA-262 does not fix bit for bit. The record keeps no chance: its fields are integers, strings, booleans and null, so the runtime cases compare it exactly on every engine.

### Following Two Shots

The golden scenario, from `test/weapons.test.ts` and `e2e/weapons.e2e.ts`, queues a throttle of 1 at tick 0 on the offline ship. Seed 7, `dt` 0.5:

- A fire at 10,000 m after tick 30 answers `{ tick: 31 }`. At tick 31 the status is `charging`, the charge 150,000,000 J, and the load asks and gets 300 MW.
- At tick 32 the charge reaches 300 MJ and the shot leaves. The draw is under 0.655, so it hits: the record reads `{ status: 'charging', charge: 0, shots: 1, hits: 1, lastShot: { tick: 32, range: 10000, hit: true } }`. The coolant reads 507.68 K, 0.0899 K above the same run with no shot.
- Ticks 33 and 34 charge 150 MJ each. At tick 35 the load asks and gets 200 MW, the charge reads 400 MJ and the status `charged`. At tick 36 the load asks 0 W.
- A fire at 50,000 m after tick 40 answers `{ tick: 41 }`. The shot leaves at tick 41 from the full bank and misses, leaving 100 MJ, with `shots` at 2 and `hits` at 1. The load asks 0 W at tick 41, 300 MW at tick 42 (250 MJ) and the status reads `charged` at tick 43. The command log holds ticks 1, 31 and 41.

Four shorter scenarios close the module test:

- A fire after tick 30 at 16,279 m hits at tick 32, and at 16,280 m it misses, on the same first draw.
- On a ship at throttle 0.6, a fire at range 0 after tick 60 charges 150 MJ at tick 61. A burn of 1 queued then leaves 126 MW after the 600 MW drive, so tick 62 reads `held` at 150 MJ, with `railgun` in `power.shed` and `LOAD_SHED` for it in the alarms.
- A fire at tick 102 beside a spool queued at tick 101 shows both loads at full power from tick 102 to 105, the first shot at tick 103 and a charge of 300 MJ at tick 105. Raised shields at tick 106 shed `ftl-spool`, the lower priority, while the capacitor tops up at 200 MW. A second shot at tick 107 misses, and the spool is shed again at tick 108.
- The cold ship and the tick-24 ramp refuse a fire with `MERIDIAN_POWER_BUDGET` for `railgun`, demand 300 MW, with 0 W and 290.4 MW available. The refused fire leaves the command log without an entry.

## The FTL Drive

A crew member spools the drive, and the ship must hold 90 GJ before a jump moves it. The drive joins a ship that is already running. `FtlDrive` is a module that the library exports and the aggregate leaves out, so a server chooses when the ship gets it, and `load()` adds it to the running container.

### The Module and Its Token

`FtlDrive`, in `src/systems/ftl/ftl-drive.module.ts`, binds one token:

```text
FTL_DRIVE   JumpDrive   deps [TICK_LOOP, SHIP_STATE, NAV_CHARTS, POWER_ROUTER]
```

It exports `FTL_DRIVE` and imports no module. `JumpDrive` reads its four dependencies through the global aggregate, as `HelmControl` does. The index exports `FtlDrive` beside `meridianSystems`, because a server needs the module object to load it. The module works only inside a ship that `meridianSystems()` built, so `Nexus.check(FtlDrive)` alone fails with `NEXUS_MISSING_PROVIDER` for `TickLoop`, `ShipState`, `NavCharts` and `PowerRouter`. `Nexus.check(meridianSystems({ seed, dt }), { load: [FtlDrive] })` passes.

The drive contributes nothing to `SHIP_SYSTEMS` or `POWER_CONSUMERS`. The loop and the router read those two lists once, when they are built, so a provider in a module loaded later would reach neither. `JumpDrive.onInit()` attaches the drive's two parts itself:

```text
TICK_LOOP.attach(new FtlPhysics(rating))    phase 3, the name 'FtlDrive'
POWER_ROUTER.attach(new FtlPower(rating))   the ftl-spool load, after the POWER_CONSUMERS entries
```

Both `attach` methods return a function that removes the part and runs twice safely. `[Symbol.dispose]` calls both, and the container disposes in reverse creation order, so the drive detaches before the loop stops. The loop sorts an attached system by phase and name and forks the random stream by its name. It throws "Two ship systems are named 'FtlDrive'." for a name it already runs. A system attached during a tick first steps on the next one. A container whose plugin sets `onInit: false` gives a drive that never charges.

Before the load, `has(FTL_DRIVE)` is false and the power record lists six loads. The ship reads `ftl` at `offline`. A scope opened before the load throws `NEXUS_LOADED_AFTER_SCOPE` for `FTL_DRIVE`, with the module `FtlDrive`, until `await scope.extend()`. A second `load()` builds nothing.

### The Record and the Setpoints

The snapshot gains one record and the setpoints one entry, both after `helm`:

- `ftl`: `status`, `charge` in J, `sector` and `jumped`. `status` is `offline`, `idle`, `held`, `spooling` or `charged`. `sector` is the star the ship sits at, `Sol` before the first jump. `jumped` is the tick of the last jump, or null before the first.
- `setpoints.ftl`: `armed`, true while the spool may charge, and `jump`, the star of a commanded jump or null.

The store starts the record at `{ status: 'offline', charge: 0, sector: 'Sol', jumped: null }` and the setpoints at `{ armed: false, jump: null }`, both frozen. No step ever writes `offline`. The first step after the load writes `idle` (or `held` or `spooling` on an armed tick) as a new object, so a ship that never loads the drive reads `offline` for good, and every earlier golden carries the record at that value. The power record lists `ftl-spool` at 0 W after `railgun` from the tick after the load.

### The Spool and the Jump

`IFtlDrive` has two commands and `rating`. The command desk serves neither, so it keeps listing `comms, engineering, helm, life-support, safety and weapons`, and `bridge-api` gives the drive its own routes.

- `spool()` asks `POWER_ROUTER.divert` for the `ftl-spool` load, 900 MW at priority 7, and queues `setpoints.ftl.armed`. It throws `PowerBudgetError` when the router cannot fit the load. At tick 0 the router has 0 MW free. At tick 74 of a throttle-1 ramp it has 895.4 MW free, and a spool at tick 75 queues for tick 76. On a throttle of 0.01 with life support online it has 12.1 MW free.
- A second `spool()` on an armed drive asks no `divert` and queues nothing. It returns `{ tick: t + 1 }`, the tick from which the drive is still armed. A second check would refuse the spool on a tick the router sheds it, and a no-op must not do that. After a jump disarms the drive, a spool arms it again.
- `jump(to)` asks `NAV_CHARTS.has(to)` first. A star the charts do not hold, such as `Vega`, `constructor` or `__proto__`, throws `BadCommandError` with `reason: 'argument'` and the message "ftl jump got an argument it cannot use. It takes spool with no arguments and jump with a charted star to jump to." Below a full charge it throws `FtlNotSpooledError`. Otherwise it queues `setpoints.ftl.jump`.

### The Physics Behind the Spool

`FtlPhysics` runs in phase 3 under the name `FtlDrive` and delegates to `stepFtl` in `src/physics/ftl.ts`. `FTL_SPOOL` holds the rating: 90 GJ of charge, 900 MW of power, a pulse share of 0.1, a reactor level of 0.9 and a coolant limit of 1,300 K.

- `ftlDemand` reads the snapshot at the start of the tick. The load asks 900 MW while the drive is armed, below a full charge, with the reactor at 0.9 or more and the coolant under 1,300 K. Otherwise it asks 0 W. Its heat share is 0.1.
- The charge is `min(E, charge + P_f · dt)`, with `P_f` the power the router allocated the `ftl-spool` load. At `dt` 0.5 that adds 450,000,000 J a tick, an integer, so 200 ticks reach 90,000,000,000 J exactly. The record holds joules because a fraction of the charge drifts to 1.0000000000000007 before its clamp.
- The step derives the status on every tick: `charged` at a full charge, `idle` when the drive is unarmed, `spooling` when the router gave it power and `held` when it gave none. The router fits the spool from reactor level 0.7438, so a spool queued under level 0.9 passes the router and holds at 0 W until the reactor reaches 0.9. Beside the raised shields the router fits the spool from level 0.9091, so it sheds a spool at level 0.9 and Safety raises `LOAD_SHED` for `ftl-spool`.
- A jump runs when `setpoints.ftl.jump` is set at a full charge. The step empties the charge, moves `sector` to the star, writes the tick into `jumped` and disarms the drive. These writes stay out of the command log, as Safety's door writes do. The jump also adds a pulse of 9,000,000,000 J (`pulseShare · E`) to the coolant loop through `pulseCoolant` (from `thermal.ts`) with `LITHIUM_LOOP`, which raises it by 10.7914 K. The pulse enters in phase 3, and the next tick radiates from the raised temperature. A jump below a full charge changes nothing.
- The loop's equilibrium at full output is 1,196.5 K with the spool and 1,202.4 K with the spool and the raised shields, so the 1,300 K limit stays out of reach on the ship. The pure test feeds it: `ftlDemand` asks 900 MW at 1,299.9 K and 0 W at 1,300 K.
- `stepFtl` uses only `+`, `−`, `·`, `/`, `Math.min` and compares, which ECMA-262 fixes bit for bit. The gates compare the reactor level and the coolant, which sits near 830 K, far from the 1,300 K gate, so every engine takes the same branch.

### Following One Jump

The golden scenario, from `test/ftl.test.ts` and `e2e/ftl.e2e.ts`, loads `FtlDrive` into the offline ship and queues a throttle of 1 at tick 0. Seed 7, `dt` 0.5:

- A spool after tick 100 answers `{ tick: 101 }`. A jump at tick 100 throws `FtlNotSpooledError` with a charge of 0: "The FTL drive holds 0 GJ of the 90 GJ a jump needs."
- At tick 101 the status is `spooling`, the charge 450,000,000 J, the `ftl-spool` allocation 900 MW and the coolant 571.9 K. At tick 150 a jump throws with 22,500,000,000 J.
- A second spool at tick 200 answers `{ tick: 201 }`, and the command log still holds ticks 1 and 101. At tick 299 the charge is 89,550,000,000 J. At tick 300 the status is `charged`, the charge 90,000,000,000 J and the coolant 832.6 K.
- Jumps to `Vega` and `constructor` throw with `reason: 'argument'`. A jump to Kepler-442b answers `{ tick: 301 }`. At tick 301 the record reads `{ status: 'idle', charge: 0, sector: 'Kepler-442b', jumped: 301 }`, the setpoints read `{ armed: false, jump: null }` and the spool's load is 0 W. The coolant reads 844.4 K, which is 10.7914 K above the same run with no jump. The log holds ticks 1, 101 and 301.
- A spool at tick 302 answers `{ tick: 303 }`, and a jump after tick 502 reaches TRAPPIST-1e at tick 503.

Two shorter scenarios close the module test. A spool armed at tick 101 meets the raised shields and a throttle of 0.9 from tick 111. Tick 120 reads `held` with 8,550,000,000 J. `power.shed` lists `ftl-spool`, and the alarms hold `LOAD_SHED` for it. On a ship at a throttle of 0.01 with life support online, a spool at tick 600 throws with 12,093,132.55 W available.

## How a Tick Runs

`TICK_LOOP.advance(ticks)` runs the ship forward. For each tick, the loop first calls `SHIP_STATE.applyQueued(tick)`, which applies the queued setpoint changes. It then calls every system's `step()` in ascending phase, and in name order within a phase, each on the snapshot the previous system returned. Each step also gets a `TickContext` with the tick, `dt`, the system's fork and `start`, the snapshot `applyQueued` returned before any system stepped. It then advances the clock, commits the result to `SHIP_STATE` and calls the tick listeners with the committed snapshot.

- `FixedStepClock` derives the time from the tick, so 600 ticks of 0.5 s read exactly 300 s.
- `attach(system)` adds a system to the loop after construction and returns its detach. The FTL drive is the one caller (the FTL Drive section above).
- `SeededRandom` is splitmix32 over the seed. The loop hands each system its own `RNG.fork(name)`, so a new system leaves the numbers an older system draws unchanged.
- `ShipStateStore` starts at tick 0 with the deck's four compartments (`bridge`, `habitat`, `reactor-bay`, `airlock`) filled with air at 293 K and 101.3 kPa, the reactor at level 0 with throttle 0, the coolant at 500 K, the 0 W life-support, comms, thrusters, main-drive and railgun loads and the lowered shields, life support offline, every door shut, no fire, the phased array on standby with no hail queued, the ship at rest with heading 0, the main drive at throttle 0, the railgun `idle` with an empty capacitor and unarmed, and the FTL record `offline` at the sector `Sol` with the spool unarmed. It throws a plain `Error` for a deck whose `equipment` lists an unknown device or one device twice, a pump with no `pumpReservoir` or a `pumpReservoir` with no pump, or a reservoir that is unknown or the pump's own room. It also throws for a door the deck lists twice or `DOOR_IDS` lacks, a door of `DOOR_IDS` the deck lacks, a door whose `between` does not hold two distinct sides, each a compartment or `space`, and a `floodCharge` that is not a positive finite number.
- `roundSnapshot(ship)` rounds every fraction to four significant digits and keeps integers exact. The golden prints snapshots in that form.
- `readShip(ship, deck)` returns a `ShipReading`: the snapshot with each compartment's `pressure` in pascals, from the moles of every gas, the temperature and the compartment's volume in the deck plan. It rounds every number once to eight significant digits and keeps integers exact, so a console gauge can round the reading once to its own decimals; the golden's four digits would turn 2.0652 into 2.065. The `bridge-api` routes and the telemetry frames send this reading, so the habitat reads 101.3 kPa at tick 0.

The seeded ship starts idle. Each tick moves the clock, the air keeps the deck's initial values while life support is offline, and the reactor and the coolant stay at 0 and 500 K until a command changes a setpoint. The doors stay shut and no room burns, so Safety changes nothing.

## Following the Ship Tick by Tick

A console that shows the ship live needs each tick as the loop commits it. The loop calls tick listeners, and the `Telemetry` module turns them into a feed that `bridge-api` streams.

`TICK_LOOP.listen(listener)` adds a listener and returns a function that removes it. The function runs twice safely. A function listened twice hears each tick twice.

- The loop calls the listeners after each commit, in the order they subscribed. A listener added during a tick first hears the next one, and a listener removed during a tick hears it no more.
- When a listener throws, the loop still calls the others. The tick stays committed, and `advance()` stops after that tick and throws the error, or an `AggregateError` with every error in call order when two or more threw.
- A listener must not call `advance()`, since the loop is still inside the tick. Nothing guards against it.

`SnapshotFeed` implements `ITelemetryFeed`, with `static deps = [TICK_LOOP, SHIP_STATE, DECK_PLAN] as const`. `TELEMETRY.subscribe(sink)` sends the sink the `readShip` reading of the current snapshot at once, then one reading per tick, and returns a function that unsubscribes the sink without calling its `close`. The feed reads each tick once, and only while a sink is open.

The feed listens to the loop in `onInit`. The container calls `onInit` level by level after it builds the singletons, and the loop is a dependency of the feed, so the feed always subscribes to a loop that is ready. A container built with `onInit: false` gives a feed that never hears a tick. The container disposes in reverse creation order, so the feed disposes before the loop it listens to. It stops listening and calls `close('ship offline')` on each open sink. A subscribe after that gets `close('ship offline')` at once.

## Labelling the Graph with Ship Notes

The devtools graph lists every provider of the ship beside the server's own. `shipNotes(view)` tells them apart: it labels each ship provider `system: <module name>`, such as `system: Telemetry` on `SnapshotFeed`.

`shipNotes` finds the module that binds the `TICK_LOOP` the root resolves, walks that module's imports transitively and labels each provider in those modules. A module outside that walk, such as one the root imports beside the ship, gets no note, with one exception: `FtlDrive`. `load()` adds it as an import of the root, so the walk starts from it too, or from the module a plugin put in its place. `JumpDrive` is no `SHIP_SYSTEMS` provider, so it reads `system: FtlDrive` and carries no phase note. A root without `TICK_LOOP` gets no note at all. The function matches the `GraphAnnotator` shape of `@nexusdi/devtools` and imports nothing from it, so `bridge-api` passes it as `devtools({ annotate: [shipNotes] })`. A `SHIP_SYSTEMS` class provider whose class declares `static readonly phase` also gets `phase: <n>`, so `EngineeringPhysics` reads `system: Engineering` and `phase: 1`, `SafetyPhysics` reads `system: Safety` and `phase: 5`, and each other system its own. The graph reads the static, so it never builds the class.

## The Physics

The classes delegate the arithmetic to pure functions in `src/physics/`, which import nothing from `@nexusdi/`.

- `gas.ts` holds the five gases, the air fractions, `pressure(moles, temperature, volume)` from `P = nRT/V` with `R` from `constants.ts`, and `molesAt(pressure, temperature, volume, fractions)`, which fills a compartment. It also holds `heatCapacity`, the Magnus `saturationPressure`, `ventFraction` and `vent`, then `parcel`, which splits a share of each gas off a room's air, and `mix`, which adds a parcel to a room with its energy. `transfer` runs the two to move a share of each gas from one room to another, and `exchange` runs them both ways through a door.
- `atmosphere.ts` holds the life-support ratings in `LIFE_SUPPORT_RATINGS`, the setpoint and record types, `lifeSupportDemand`, `pumpDraw`, `stepAtmosphere` and `readAtmosphere`.
- `doors.ts` holds `DoorPlan`, `doorFractions`, `doorPressures` and `PRESSURE_INTERLOCK`.
- `fire.ts` holds the fire law in `FIRE`, `FLOOD`, `FloodPlan`, `burns` and `stepFire`.
- `safety.ts` holds the alarm and safety types and `stepSafety`, with the deadband limits as a module constant.
- `constants.ts` holds `R`, `σ`, `T_hull`, `κ` and the molar heat capacities `CV`.
- `thermal.ts` holds the reactor and coolant ratings and records, `stepReactor`, `louvre`, `stepCoolant`, `tripped` and `pulseCoolant`, which the FTL jump and the railgun shot both call.
- `comms.ts` holds the record and setpoint types, `COMMS_LOAD`, `RELAY_ROUND_TRIP`, `MESSAGES_KEPT`, `commsDemand` and `stepComms`.
- `motion.ts` holds the hull, drive and thruster ratings, `HELM_TUNING` and `HELM_SETTLE`, the two loads' ids and priorities, the record and setpoint types, `wrap`, `toRadians`, `thrust`, `helmTorque`, `thrustersDemand`, `driveDemand`, `stepHelm` and `stepDrive`.
- `weapons.ts` holds the railgun rating `RAILGUN` and its load `RAILGUN_LOAD`, the record and setpoint types, `railgunDemand`, `hitChance` and `stepWeapons`.
- `ftl.ts` holds the spool's rating `FTL_SPOOL` and its load `FTL_SPOOL_LOAD`, `HOME_SECTOR`, the record and setpoint types, `ftlDemand` and `stepFtl`.
- `power.ts` holds `PowerLoad`, the power record, `allocatePower` and `loadHeat`.
- `rng.ts` holds `splitmix32` and `fnv1a32`, which `SeededRandom` uses for its streams and its forks.

The library's ESLint config keeps the simulation reproducible. A file under `src/` imports relative paths and `@nexusdi/core` alone, and `@nexusdi/interceptors` with `import type` alone (a test file may also import `vitest` and `@nexusdi/errors`), never names the clocks, the timers, `crypto`, `process`, `Intl`, `eval` or the global object, and outside `src/systems/comms/subspace-relay.ts` never calls `fetch`, and reads `Math` only as `Math.name` and never `Math.random`, so `nx lint` fails on `node:crypto` or `const { now } = Date` as well as on `Date.now()`. `@typescript-eslint/no-import-type-side-effects` refuses `import { type Interceptor }`, which keeps a bare import of the package at runtime. `tools/repo-checks/src/meridian-purity.test.ts` checks that the config holds those rules. It also fails when a file under `src/physics/` imports `@nexusdi/`, and when a `*.module.ts` file grows past 120 lines.

## The Errors the Ship Raises

The library raises six codes of its own through core's `errorBase`, and augments `NexusErrorByCode` with each, so `isNexusError(error, 'MERIDIAN_POWER_BUDGET')` narrows to the class. Each one-line message ends with a link to its section below.

`@nexusdi/meridian-systems/text` exports `shipText`, the text pack of the six codes. `explain(error, { text: [shipText] })` from `@nexusdi/errors` returns the message and the fix, and `bridge-api` answers a refused command with them. Without the pack, an error keeps core's one-line message. `shipText` formats its numbers with its own `formatNumber`, so the text is the same on every host and locale.

`errors({ text: [shipText] })` hands the pack to core's `formatError` hook, and core calls that hook only for the errors core raises and the errors a plugin passes to `context.format`. Core never formats a `MERIDIAN_*` error that a ship service throws, so a server words each refusal with `explain()`, as `bridge-api`'s `refusalOf` does, and no refusal body depends on the plugin.

<a id="MERIDIAN_POWER_BUDGET"></a>

### MERIDIAN_POWER_BUDGET

`PowerBudgetError` says that the power router cannot fit a load at the reactor's current output. `POWER_ROUTER.divert(load)` throws it. `divert` has three callers: `SHIELD_GRID.raise()`, `FTL_DRIVE.spool()` and `WEAPON_MOUNT.fire()`. `consumer` holds the id of the load, such as `shields`. `demand` and `available` hold, in W, the power the load asks for and the output less what the loads served before it got.

The one-line message and the text of `shipText`:

```text
[MERIDIAN_POWER_BUDGET] consumer=shields demand=200000000 available=193600000. https://github.com/NexusDI/core/tree/main/examples/meridian-systems#MERIDIAN_POWER_BUDGET

The shields load needs 200 MW, and the router has 193.6 MW free beside the loads above it.
Fix: raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.
```

To clear it, raise the throttle and advance the ship until `REACTOR.output` covers the load, or lower a load the router serves first. `bridge-api` answers it with 409.

<a id="MERIDIAN_BAD_COMMAND"></a>

### MERIDIAN_BAD_COMMAND

`BadCommandError` says that the command desk or a system's handler cannot read a command. Its `reason` names the part it refused. `system` and `action` hold what the command named, and `expected` holds what the ship takes:

- `envelope`: the body is not an object with a string `system` and a string `action`. `expected` lists the systems the desk serves.
- `system`: no handler serves `system`. `expected` lists the systems.
- `action`: the system has no such action. `expected` lists its actions and their arguments.
- `argument`: an argument is missing, of the wrong type or out of range.

The text of `shipText` for an unknown engineering action:

```text
engineering has no action 'warp'. It takes throttle with a level from 0 to 1 and shields with raised true or false.
Fix: send one of the actions above with its arguments.
```

To clear it, send a command in the shape `expected` describes. `bridge-api` answers it with 400.

<a id="MERIDIAN_UNKNOWN_COMPARTMENT"></a>

### MERIDIAN_UNKNOWN_COMPARTMENT

`UnknownCompartmentError` says that a request names no compartment, or one the deck does not have. The factory of `COMPARTMENT` throws it when a scope's `get` of `COMPARTMENT`, or of `ATMOSPHERE_SENSOR`, reads the request. `compartment` holds the id the request named, and the error leaves it out when the request named none. `expected` lists the deck's compartments in words.

The one-line message and the text of `shipText`:

```text
[MERIDIAN_UNKNOWN_COMPARTMENT] compartment=galley expected=bridge, habitat, reactor-bay and airlock. https://github.com/NexusDI/core/tree/main/examples/meridian-systems#MERIDIAN_UNKNOWN_COMPARTMENT

No compartment is named 'galley'. The deck has bridge, habitat, reactor-bay and airlock.
Fix: read /compartments/<id>/atmosphere with one of the compartments above.
```

For a request that names no compartment, the text reads "The request names no compartment. The deck has bridge, habitat, reactor-bay and airlock." To clear it, read one of the compartments `expected` lists. `bridge-api` answers it with 404.

<a id="MERIDIAN_INTERLOCK"></a>

### MERIDIAN_INTERLOCK

`InterlockError` says that a command asked to open a door with more pressure across it than the interlock allows. `door` holds the id of the door, such as `habitat-airlock`. `difference` and `limit` hold, in Pa, the rounded difference across it and the largest one the interlock lets a door open across. `PressureInterlock` throws it around `BLAST_DOORS.open` once an app registers the interlock. `bridge-api` registers it in its interceptors plugin and imports it from `@nexusdi/meridian-systems/interlock`.

The one-line message and the text of `shipText`:

```text
[MERIDIAN_INTERLOCK] door=habitat-airlock difference=70585 limit=5000. https://github.com/NexusDI/core/tree/main/examples/meridian-systems#MERIDIAN_INTERLOCK

The habitat-airlock door holds 70,585 Pa of difference, above the 5,000 Pa interlock.
Fix: bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.
```

To clear it, run a pump or a vent until the two sides are within `limit` of each other, then open the door. `bridge-api` answers it with 409.

<a id="MERIDIAN_FTL_NOT_SPOOLED"></a>

### MERIDIAN_FTL_NOT_SPOOLED

`FtlNotSpooledError` says that a jump was commanded before the spool held its full charge. `IFtlDrive.jump(to)` throws it after it has checked the star. `charge` and `energy` hold, in J, the charge the spool holds and the charge a jump spends.

The one-line message and the text of `shipText`:

```text
[MERIDIAN_FTL_NOT_SPOOLED] charge=22500000000 energy=90000000000. https://github.com/NexusDI/core/tree/main/examples/meridian-systems#MERIDIAN_FTL_NOT_SPOOLED

The FTL drive holds 22.5 GJ of the 90 GJ a jump needs.
Fix: spool the drive and wait until it holds the full charge, then jump.
```

To clear it, spool the drive and advance the ship until `ftl.charge` reaches `energy`, then jump. `bridge-api` answers it with 409.

<a id="MERIDIAN_RELAY"></a>

### MERIDIAN_RELAY

`RelayError` says that the subspace relay gave no answer in time, or answered a table the ship cannot read. `channel` holds the relay channel the ship asked for, `charts` today. `reason` is `timeout` when the relay stayed silent past `relayTimeout`, and `malformed` when the answer is not a plain JSON object that maps each star name to a finite heading. `expected` holds what the ship needed, in words. `SubspaceRelay` throws the `timeout` and `StarCharts.download` throws the `malformed`, both while `Nexus.create` builds `NAV_CHARTS`, so the ship never starts. The container reports the failed factory as `NEXUS_PROVIDER_FAILED` and keeps the `MERIDIAN_RELAY` error as its `cause`.

The one-line message and the text of `shipText` for a relay that gave no answer:

```text
[MERIDIAN_RELAY] channel=charts reason=timeout expected=within 5,000 ms. https://github.com/NexusDI/core/tree/main/examples/meridian-systems#MERIDIAN_RELAY

The subspace relay did not answer the charts channel within 5,000 ms.
Fix: check that the relay is up and reachable at relayUrl, or raise relayTimeout.
```

For a table the ship cannot read, the text reads "The subspace relay answered the charts channel with a table the ship cannot read. The table must be a JSON object that maps each star name to a finite heading." Its fix is "check what the relay serves on that channel." To clear the `timeout`, bring the relay up or raise `relayTimeout`. To clear the `malformed`, make the relay serve the table in the shape above. A status outside 200 to 299 still throws a plain `Error`, `relay answered <status> for <channel>`.

## Testing the Ship

The library has two test targets. The second one also rewrites the golden when you pass `-u`.

```sh
npx nx test @nexusdi/meridian-systems
npx nx run @nexusdi/meridian-systems:e2e-growth
```

- `test` runs the unit tests beside the files in `src/` and the module tests in `test/`. `test/simulation.test.ts` builds `ShipUnderTest` on `@nexusdi/vitest` fixtures with probe systems and the `Telemetry` module, and asserts rounded idle values after 600 ticks that hold on any Node. `test/telemetry.test.ts` reads the feed's frames, and `test/notes.test.ts` reads the ship notes through `inspect()` from `@nexusdi/devtools`. `test/engineering.test.ts` builds `meridianSystems({ seed: 7, dt: 0.5 })` and checks five things on it: that `Nexus.check` passes, the budget case above through `COMMAND_DESK`, the idle ship after 600 ticks, the `NEXUS_NOT_VISIBLE` of `COOLANT_LOOP` and the scram. `test/life-support.test.ts` builds the same ship and reads the sensor in a scope, a `MERIDIAN_UNKNOWN_COMPARTMENT` for `galley`, two ticks from two `get()` calls, the shed at throttle 0, the airlock pump-down and its stall, the refused heater in the airlock and pump in the habitat, and the habitat at 292.6 K after an hour. `test/safety.test.ts` builds the same ship and checks that `Nexus.check` passes and that the root reads the Safety tokens and the probe. A door command answers through the desk. With the interlock registered, the outer door refuses at tick 0 with a difference of 101,300 Pa, and `bridge-habitat` opens. The file also runs the decompression of the two airlock doors and a fire in a habitat at 340 K that a flood puts out. Its last case floods out a drill fire, after which a second drill in the flooded habitat lights nothing. `test/airlock.test.ts` builds the same ship with the interlock registered and runs the airlock drill above. It asserts each answer of the interlock (the refusals of the outer door at 9,089 Pa and 5,072 Pa, and of the inner door at 101,339, 110,413, 109,401 and 5,915 Pa), the ticks the accepted commands apply on, the inner door open at tick 466 with 132.5 Pa across it, no alarm on any tick from 1 to 466, and the log's five ticks. `test/comms.test.ts` builds the offline ship and the relay graph, and `src/physics/comms.test.ts` steps the array alone. The offline cases pass `Nexus.check`, plot Kepler-442b at heading 42 over the bundled charts, keep a hail queued under `no subspace link` at 0 W with no alarm, refuse `comms send` and read `comms, engineering, helm, life-support, safety and weapons` from the desk. The relay cases fetch `https://relay.test/charts?frequency=1420` once at build and never during 10 ticks, and run the four scenarios of the Comms section. `test/relay-faults.test.ts` starts a local HTTP relay and checks that a relay which never answers, and one which sends part of the body and stops, fail `Nexus.create` with `MERIDIAN_RELAY` and reason `timeout`, that seven `relayTimeout` values (`NaN`, a negative, zero, a fraction, `Infinity`, a string and 2,147,483,648) fail it with `NEXUS_INVALID_MODULE_OPTIONS`, that ten wrong tables (`null`, an array, a number, a string, three bad headings, and the names `__proto__`, `constructor` and `toString`) fail it with reason `malformed`, and that a valid table starts the ship. `test/helm.test.ts` builds the offline ship and the relay graph, and `src/physics/motion.test.ts` steps the helm and the drive alone. `test/helm.test.ts` checks that `Nexus.check` passes on both graphs, that the root reads `HELM`, `THRUSTERS` and `MAIN_DRIVE`, and that the desk lists `comms, engineering, helm, life-support, safety and weapons`. It flies the two scenarios of the Propulsion and the Helm section, refuses the shields at tick 16 with 193,600,000 W available while a burn and a course wait, refuses `helm warp`, a burn of 2, a course to `42` and a course to a star the charts do not hold (`Vega`, `constructor` and `__proto__`), and steers `TRAPPIST-1e` at -2.7401669256310974 rad offline and `Kepler-442b` from a stubbed relay table. `test/weapons.test.ts` builds the offline ship and flies the golden scenario of the Weapons section. It checks that `Nexus.check` passes with and without `FtlDrive` loaded, that the root reads `WEAPON_MOUNT` and one `Weapons` system in phase 3, the snapshot's key order and the idle record by identity. It refuses a fire on the cold ship and on the tick-24 ramp, and refuses `weapons reload` and seven bad ranges (-1, 100,001, `NaN`, `'10000'`, undefined, null and Infinity). It merges two fires in one tick, holds the capacitor under a full burn, runs the shot beside the FTL spool and pins the hit at 16,279 m and the miss at 16,280 m. `src/physics/weapons.test.ts` and `src/systems/weapons/` step the physics and the mount alone. `test/ftl.test.ts` builds the offline ship and loads `FtlDrive` with `load()`. It checks that `Nexus.check` passes as a load and fails alone, that two loads build one drive, that the power record lists `ftl-spool` at 0 W from tick 2 and that the desk refuses `ftl` as a system. It then runs the ramp of a spool queued at tick 75, the golden scenario of the FTL Drive section, the shed at tick 120, the refusal on a cold ship and the scope that `extend()` repairs. `src/physics/ftl.test.ts`, `src/systems/ftl/` and the loop and router tests step the physics and the drive alone, and the loop and router tests pin the two `attach` methods.
- `e2e-growth` runs `e2e/idle.e2e.ts`, which compares seed 7 at ticks 0, 1 and 600 with `e2e/golden/idle.seed-7.json`, engineering and life-support records included. `e2e/life-support.e2e.ts` queues a throttle of 0.01 and `online` at tick 0 and compares ticks 1, 600 and 7,200 with `e2e/golden/life-support.seed-7.json`. Both goldens hold the safety, comms, weapons, drive, helm and FTL records too, the weapons record at `idle` and the FTL record at `offline`. `e2e/comms.e2e.ts` builds the relay graph with `relayUrl: 'https://relay.test'` and a stubbed `fetch`, queues a throttle of 0.01, `online` and a hail at tick 0, and compares ticks 1, 5 and 600 with `e2e/golden/comms.seed-7.json`, 665 lines. With the comms records stripped, its ticks 1 and 600 equal the life-support golden's. `e2e/helm.e2e.ts` queues a throttle of 0.6, a course to Kepler-442b and a burn of 1 at tick 0 on the offline ship, and compares ticks 1, 50, 688 and 1,200 with `e2e/golden/helm.seed-7.json`, 882 lines. `e2e/ftl.e2e.ts` loads `FtlDrive` into the offline ship, queues a throttle of 1 at tick 0, spools after tick 100 and jumps to Kepler-442b after tick 300. It compares ticks 101, 300 and 301 with `e2e/golden/ftl.seed-7.json`, 671 lines. `e2e/weapons.e2e.ts` queues a throttle of 1 at tick 0 on the offline ship, fires at 10,000 m after tick 30 and at 50,000 m after tick 40, and compares ticks 31, 32, 35 and 41 with `e2e/golden/weapons.seed-7.json`, 882 lines. `e2e/safety.e2e.ts` runs with no plugin: it evacuates the airlock from tick 0, fills it from tick 120, opens `habitat-airlock` for tick 190 with the pump off, and compares ticks 120, 190 and 209 with `e2e/golden/safety.seed-7.json`. `e2e/airlock.e2e.ts` replays the accepted commands of the airlock drill on a ship that registers the interlock, and compares ticks 288, 317, 337, 446 and 466 with `e2e/golden/airlock.seed-7.json`. Its step table holds no refused open, so the golden reads the same ship as `test/airlock.test.ts`, which also sends the refused opens, and a command the interlock refused would throw and fail the case. The suite runs only on the Node version `.nvmrc` names, and stops with both versions in the message on any other. `npx nx run @nexusdi/meridian-systems:e2e-growth -- -u` rewrites the goldens. Review its diff as you review a change to `graph.json`. Under `CI`, Vitest writes no snapshot, so a missing golden fails.

The non-required `demo-growth` CI job runs the `e2e-growth` targets of the three demo projects: `meridian-systems`, `bridge-api` and `bridge-console` (ship systems spec, section 14).

Next, read [`examples/bridge-api`](../bridge-api/README.md), which drives this simulation and serves it over HTTP.
