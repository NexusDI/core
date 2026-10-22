# Simulating the Starship Meridian

The Meridian demos need a ship whose state changes between requests: a reactor the crew throttles, and air in each compartment that later systems heat, scrub, vent and pump. A reader who opens a demo module should still meet tokens and providers first, and an e2e case must read the same numbers on every run. This library holds that ship as a seeded, fixed-step simulation, and `examples/bridge-api` runs it.

The library is an example in the NexusDI repository. It reaches `@nexusdi/core` only through the public points any outside package has: `defineModule`, `provide`, `Token`, `MultiToken`, `all()`, `lazy()`, `errorBase` and the `NexusErrorByCode` interface.

## The Modules a Ship Imports

A ship imports one module, the one `meridianSystems({ seed, dt })` returns. `seed` picks the random streams, and `dt` sets the ship seconds per tick.

- `Simulation`, in `src/simulation/simulation.module.ts`, is a global module that `Simulation.forRoot({ seed, dt })` configures. It binds the clock, the random source, the ship state and the deck plan, and exports them with `SIM_OPTIONS`. Its schema refuses a `seed` that is not a whole number from 0 to 4294967295 and a `dt` that is not a positive finite number. `Nexus.create` then rejects with `NEXUS_PROVIDER_FAILED` for the `SimOptions` token. Its `cause` is `NEXUS_INVALID_MODULE_OPTIONS`, whose `issues` name each refused field, the value it got and the accepted range. The check runs for `forRoot` and `forRootAsync` alike.
- `Telemetry`, in `src/telemetry/telemetry.module.ts`, binds `TELEMETRY` to `SnapshotFeed` and exports it.
- `MeridianSystems`, the aggregate in `src/meridian-systems.module.ts`, is global too. It imports `Simulation.forRoot(options)`, `Telemetry` and `Engineering`, the first ship system (the next section describes it). It binds `TICK_LOOP` with `FixedStepLoop` and `COMMAND_DESK` with `CommandDesk`, and exports both with `TELEMETRY` and `Engineering`. The re-export hands the root `REACTOR`, `POWER_ROUTER` and `SHIELD_GRID`.

Each ship system contributes one `IShipSystem`, with a `name` and a `phase` from 1 to 6, to the multi token `SHIP_SYSTEMS`. `FixedStepLoop` takes them all with `all(SHIP_SYSTEMS)`. `all()` reads the binding module's own providers plus the exports of its imports and of the global modules. Each system module exports `SHIP_SYSTEMS`. A loop bound in `Simulation` would miss a system that a sibling module provides, so `TICK_LOOP` sits in the aggregate, which imports each system module. The command desk reads `all(COMMAND_HANDLERS)` for the same reason, so `COMMAND_DESK` sits beside it.

The tokens follow the interface-first rule: each interface has a token named for its role, and the module binds a class to each service token with `useClass`. `src/index.ts` exports the tokens, their interfaces and the two error classes, and keeps the other classes internal.

| Token              | Interface         | Bound to                  | Bound in               |
| ------------------ | ----------------- | ------------------------- | ---------------------- |
| `SIM_OPTIONS`      | `SimOptions`      | the `forRoot()` value     | `Simulation`           |
| `SIM_CLOCK`        | `ISimClock`       | `FixedStepClock`          | `Simulation`           |
| `RNG`              | `IRandomSource`   | `SeededRandom`            | `Simulation`           |
| `SHIP_STATE`       | `IShipState`      | `ShipStateStore`          | `Simulation`           |
| `DECK_PLAN`        | `DeckPlan`        | `deck/meridian.deck.json` | `Simulation`           |
| `TICK_LOOP`        | `ITickLoop`       | `FixedStepLoop`           | `MeridianSystems`      |
| `COMMAND_DESK`     | `ICommandDesk`    | `CommandDesk`             | `MeridianSystems`      |
| `TELEMETRY`        | `ITelemetryFeed`  | `SnapshotFeed`            | `Telemetry`            |
| `SHIP_SYSTEMS`     | `IShipSystem`     | one class per system      | each system module     |
| `COMMAND_HANDLERS` | `ICommandHandler` | one class per system      | each system module     |
| `REACTOR`          | `IReactorCore`    | `FusionReactor`           | `Engineering`          |
| `COOLANT_LOOP`     | `ICoolantLoop`    | `RadiatorLoop`            | `Engineering`, private |
| `POWER_ROUTER`     | `IPowerRouter`    | `PlasmaRouter`            | `Engineering`          |
| `SHIELD_GRID`      | `IShieldGrid`     | `DeflectorGrid`           | `Engineering`          |

## Engineering

A crew member raises the shields, and the ship must answer at once whether the reactor can power them. The router answers from the reactor's output and its own queue of loads, which belong to different parts of the ship. `Engineering` wires the reactor, the coolant loop, the power router and the shield grid as services behind tokens, so the tick's physics and the crew's commands each take the parts they need.

### The Module and Its Tokens

`Engineering` binds four services and makes two contributions:

```text
REACTOR          FusionReactor        deps [SHIP_STATE]
COOLANT_LOOP     RadiatorLoop         no deps, not exported
POWER_ROUTER     PlasmaRouter         deps [SHIP_STATE, lazy(SHIELD_GRID)]
SHIELD_GRID      DeflectorGrid        deps [SHIP_STATE, POWER_ROUTER]
SHIP_SYSTEMS     EngineeringPhysics   deps [REACTOR, COOLANT_LOOP, POWER_ROUTER]
COMMAND_HANDLERS EngineeringCommands  deps [REACTOR, SHIELD_GRID]
```

It exports `REACTOR`, `POWER_ROUTER`, `SHIELD_GRID`, `SHIP_SYSTEMS` and `COMMAND_HANDLERS`. `COOLANT_LOOP` stays inside the module: `EngineeringPhysics` reads the loop's rating, and every other system reads the reactor and the router. A root that asks for it gets `NEXUS_NOT_VISIBLE`, and `test/engineering.test.ts` checks that.

- `FusionReactor` reads `output`, the electric output now in GW, from `SHIP_STATE`, and `throttle(level)` queues the reactor setpoint there. Its `rating` holds the fixed figures in W.
- `RadiatorLoop` holds the lithium loop's `rating` and nothing else.
- `PlasmaRouter.loads(ship)` lists the loads of a tick, and `divert(load)` checks a new load against the reactor's output.
- `DeflectorGrid.draw(ship)` gives the grid's load from its setpoint: 200 MW at priority 2 while raised, 0 while lowered. `raise()` asks the router to divert that load and then queues the raised setpoint. `lower()` queues the lowered one.

### The Cycle Between the Router and the Grid

The router and the grid read each other. The router lists the grid's draw on every tick, and the grid asks the router whether its raised load fits. `PlasmaRouter` takes `lazy(SHIELD_GRID)`, so the container builds the router with a thunk for the grid, then builds the grid on top of it. The router calls the thunk only in `loads()`, after both exist, so the cycle needs no setter and no second phase.

### The Command Desk

`COMMAND_DESK.submit(body)` takes a crew command, `{ system, action, ...args }`, and returns `{ tick }`, the tick that applies it. `CommandDesk` takes `all(COMMAND_HANDLERS)`, and each `ICommandHandler` names the `system` it serves, so a new system adds its commands with one contribution and no edit to the desk. Two handlers that serve one system make the desk's constructor throw.

The desk checks the envelope: `body` must be an object with a string `system` and a string `action`. It hands the command to the handler of that system. A bad envelope or an unknown system throws `BadCommandError`, and the error's `expected` lists the systems the desk serves.

`EngineeringCommands` serves `engineering` and takes two actions:

```json
{ "system": "engineering", "action": "throttle", "level": 1 }
{ "system": "engineering", "action": "shields", "raised": true }
```

`throttle` takes a `level` from 0 to 1 and calls `REACTOR.throttle(level)`. `shields` takes a boolean `raised` and calls `SHIELD_GRID.raise()` or `lower()`. An unknown action or an argument out of range throws `BadCommandError`. A raise the router cannot fit throws `PowerBudgetError` from `divert()`, and the handler passes it through.

`SHIP_STATE` holds one pending setpoint change. `queue(change)` merges the change over it field by field, the later value winning, and answers with the next tick. A throttle change and a shields change queued in one tick both apply, and of two throttle changes the later applies. At step 1 of that tick, the loop calls `applyQueued(tick)`, which applies the pending change and logs it as one entry under the tick. Changes queued between two ticks apply together at the next tick, and the log keeps one entry per tick. `log()` returns the newest 1,000 entries, oldest first. A refused command throws before it reaches the queue, so the log never holds it.

### The Scram on Shutdown

`FusionReactor[Symbol.dispose]()` is the scram. It commits the current snapshot at the same tick with the reactor at level 0 and no output, and the throttle setpoint at 0. The power record keeps the last tick's allocation. The loop takes `all(SHIP_SYSTEMS)`, `EngineeringPhysics` takes `REACTOR`, and the container disposes in the reverse of the build order, so the reactor scrams after the loop and after every service that takes the loop. `bridge-api`'s shutdown test reads that order from `trace()`.

### The Physics Behind Engineering

`EngineeringPhysics` runs in phase 1 under the name `Engineering`. It delegates each step to the pure functions of `src/physics/thermal.ts` and `src/physics/power.ts`.

- The reactor's level moves toward its throttle by at most 2 % per second, 0.01 per tick at `dt` 0.5, so it reaches full output 100 ticks after a throttle of 1. The thermal output is the level times 3.63 GW, and the electric output a third of it, 1.21 GW at full.
- The coolant loop is 200 t of lithium with a heat capacity of 8.34 × 10⁸ J/K. It gains the reactor's thermal output less its electric output, plus a share of each load's allocated power (0.25 for the shields). Its radiators lose `λ · ε · σ · A · (T_c⁴ − T_bg⁴)`, where the louvre opening `λ` rises from 0 at 500 K to 1 at 550 K. The loop starts at 500 K, above lithium's melting point of 453.7 K, and an idle loop holds 500 K exactly. At full output with no load it settles at 1,186 K.
- `allocatePower(output, loads)` serves the loads by priority, then by id. A load whose whole demand fits gets it. A load that does not fit gets 0 and joins `shed`, and the router moves on to the next.
- `divert(load)` runs the same `allocatePower` at the reactor's current electric output, with `load` in place of the current load of its id. When the result sheds `load`, it throws `PowerBudgetError`, whose `available` is the output less what the loads served before `load` got.
- On a tick, a shed load keeps its setpoint, and `power.shed` lists it on every tick the router sheds it.
- The loop trips the reactor at 1,450 K, read at the start of the tick or after its step. A tripped reactor steps toward 0, `reactor.tripped` stays true, and `EngineeringPhysics` writes the throttle setpoint to 0. The hottest equilibrium the loop reaches in this increment is 1,192 K, at full output with the shields raised, which keeps the 1,350 K alarm and the trip out of reach. The trip test feeds a 1,450 K loop to the pure function.

A throttle of 1 queued at tick 0 shows the budget. After 16 ticks the reactor runs at level 0.16 and gives 193.6 MW, and a raise of the 200 MW grid answers `MERIDIAN_POWER_BUDGET`. After 17 ticks it gives 205.7 MW, and the raise queues for tick 18. The grid fits once the level reaches 0.1653.

The snapshot carries four engineering records, all in SI units:

- `reactor`: `level`, `thermal`, `electric` and `tripped`.
- `coolant`: `temperature`.
- `power`: `output` and `loads`, each load with its `id`, `priority`, `demand` and `allocated`. `shed` lists the ids of the loads that asked for power and got none.
- `setpoints`: `reactor.throttle` and `shields.raised`.

## How a Tick Runs

`TICK_LOOP.advance(ticks)` runs the ship forward. For each tick, the loop first calls `SHIP_STATE.applyQueued(tick)`, which applies the queued setpoint changes. It then calls every system's `step()` in ascending phase, and in name order within a phase, each on the snapshot the previous system returned. It then advances the clock, commits the result to `SHIP_STATE` and calls the tick listeners with the committed snapshot.

- `FixedStepClock` derives the time from the tick, so 600 ticks of 0.5 s read exactly 300 s.
- `SeededRandom` is splitmix32 over the seed. The loop hands each system its own `RNG.fork(name)`, so a new system leaves the numbers an older system draws unchanged.
- `ShipStateStore` starts at tick 0 with the deck's four compartments (`bridge`, `habitat`, `reactor-bay`, `airlock`) filled with air at 293 K and 101.3 kPa, the reactor at level 0 with throttle 0, the coolant at 500 K, no load and the shields lowered.
- `roundSnapshot(ship)` rounds every fraction to four significant digits and keeps integers exact. The golden prints snapshots in that form.
- `readShip(ship, deck)` returns a `ShipReading`: the snapshot with each compartment's `pressure` in pascals, from the moles of every gas, the temperature and the compartment's volume in the deck plan. It rounds the result once, as `roundSnapshot` does. The `bridge-api` routes and the telemetry frames send this reading, so the habitat reads 101.3 kPa at tick 0.

The seeded ship starts idle. Each tick moves the clock, the air keeps the deck's initial values, and the reactor and the coolant stay at 0 and 500 K until a command changes a setpoint.

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

`shipNotes` finds the module that binds the `TICK_LOOP` the root resolves, walks that module's imports transitively and labels each provider in those modules. A module outside that walk, such as one the root imports beside the ship, gets no note. A root without `TICK_LOOP` gets no note at all. The function matches the `GraphAnnotator` shape of `@nexusdi/devtools` and imports nothing from it, so `bridge-api` passes it as `devtools({ annotate: [shipNotes] })`. A `SHIP_SYSTEMS` class provider whose class declares `static readonly phase` also gets `phase: <n>`, so `EngineeringPhysics` reads `system: Engineering` and `phase: 1`. The graph reads the static, so it never builds the class.

## The Physics

The classes delegate the arithmetic to pure functions in `src/physics/`, which import nothing from `@nexusdi/`.

- `gas.ts` holds the five gases, the air fractions, `pressure(moles, temperature, volume)` from `P = nRT/V` with `R` from `constants.ts`, and `molesAt(pressure, temperature, volume, fractions)`, which fills a compartment.
- `thermal.ts` holds the reactor and coolant ratings and records, `stepReactor`, `louvre`, `stepCoolant` and `tripped`.
- `power.ts` holds `PowerLoad`, the power record, `allocatePower` and `loadHeat`.
- `rng.ts` holds `splitmix32` and `fnv1a32`, which `SeededRandom` uses for its streams and its forks.

The library's ESLint config keeps the simulation reproducible. A file under `src/` imports relative paths and `@nexusdi/core` alone (a test file may also import `vitest` and `@nexusdi/errors`), never names the clocks, the timers, `crypto`, `process`, `Intl`, `eval` or the global object, and reads `Math` only as `Math.name` and never `Math.random`, so `nx lint` fails on `node:crypto` or `const { now } = Date` as well as on `Date.now()`. `tools/repo-checks/src/meridian-purity.test.ts` checks that the config holds those rules. It also fails when a file under `src/physics/` imports `@nexusdi/`, and when a `*.module.ts` file grows past 120 lines.

## The Errors the Ship Raises

The library raises two codes of its own through core's `errorBase`, and augments `NexusErrorByCode` with both, so `isNexusError(error, 'MERIDIAN_POWER_BUDGET')` narrows to the class. Each one-line message ends with a link to its section below.

`@nexusdi/meridian-systems/text` exports `shipText`, the text pack of both codes. `explain(error, { text: [shipText] })` from `@nexusdi/errors` returns the message and the fix, and `bridge-api` answers a refused command with them. Without the pack, an error keeps core's one-line message. `shipText` formats its numbers with its own `formatNumber`, so the text is the same on every host and locale.

<a id="MERIDIAN_POWER_BUDGET"></a>

### MERIDIAN_POWER_BUDGET

`PowerBudgetError` says that the power router cannot fit a load at the reactor's current output. `POWER_ROUTER.divert(load)` throws it, and in this increment the shield grid's `raise()` is its one caller. `consumer` holds the id of the load, such as `shields`. `demand` and `available` hold, in W, the power the load asks for and the output less what the loads served before it got.

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

## Testing the Ship

The library has two test targets. The second one also rewrites the golden when you pass `-u`.

```sh
npx nx test @nexusdi/meridian-systems
npx nx run @nexusdi/meridian-systems:e2e-growth
```

- `test` runs the unit tests beside the files in `src/` and the module tests in `test/`. `test/simulation.test.ts` builds `ShipUnderTest` on `@nexusdi/vitest` fixtures with probe systems and the `Telemetry` module, and asserts rounded idle values after 600 ticks that hold on any Node. `test/telemetry.test.ts` reads the feed's frames, and `test/notes.test.ts` reads the ship notes through `inspect()` from `@nexusdi/devtools`. `test/engineering.test.ts` builds `meridianSystems({ seed: 7, dt: 0.5 })` and checks five things on it: that `Nexus.check` passes, the budget case above through `COMMAND_DESK`, the idle ship after 600 ticks, the `NEXUS_NOT_VISIBLE` of `COOLANT_LOOP` and the scram.
- `e2e-growth` runs `e2e/idle.e2e.ts`, which compares seed 7 at ticks 0, 1 and 600 with `e2e/golden/idle.seed-7.json`, engineering records included. The suite runs only on the Node version `.nvmrc` names, and stops with both versions in the message on any other. `npx nx run @nexusdi/meridian-systems:e2e-growth -- -u` rewrites the golden. Review its diff as you review a change to `graph.json`. Under `CI`, Vitest writes no snapshot, so a missing golden fails.

The non-required `demo-growth` CI job runs the `e2e-growth` targets of the three demo projects: `meridian-systems`, `bridge-api` and `bridge-console` (ship systems spec, section 14).

Next, read [`examples/bridge-api`](../bridge-api/README.md), which drives this simulation and serves it over HTTP.
