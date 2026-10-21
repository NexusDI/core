# Simulating the Starship Meridian

The Meridian demos need a ship whose state changes between requests: air in each compartment that later systems heat, scrub, vent and pump. A reader who opens a demo module should still meet tokens and providers first, and an e2e case must read the same numbers on every run. This library holds that ship as a seeded, fixed-step simulation, and `examples/bridge-api` runs it.

The library is an example in the NexusDI repository. It reaches `@nexusdi/core` only through the public points any outside package has: `defineModule`, `provide`, `Token`, `MultiToken` and `all()`.

## The Modules a Ship Imports

A ship imports one module, the one `meridianSystems({ seed, dt })` returns. `seed` picks the random streams, and `dt` sets the ship seconds per tick.

- `Simulation`, in `src/simulation/simulation.module.ts`, is a global module that `Simulation.forRoot({ seed, dt })` configures. It binds the clock, the random source, the ship state and the deck plan, and exports them with `SIM_OPTIONS`. Its schema refuses a `seed` that is not a whole number from 0 to 4294967295 and a `dt` that is not a positive finite number. `Nexus.create` then rejects with `NEXUS_PROVIDER_FAILED` for the `SimOptions` token. Its `cause` is `NEXUS_INVALID_MODULE_OPTIONS`, whose `issues` name each refused field, the value it got and the accepted range. The check runs for `forRoot` and `forRootAsync` alike.
- `MeridianSystems`, the aggregate in `src/meridian-systems.module.ts`, is global too. It imports `Simulation.forRoot(options)`, and binds and exports `TICK_LOOP` with `FixedStepLoop`.

Each ship system contributes one `IShipSystem`, with a `name` and a `phase` from 1 to 6, to the multi token `SHIP_SYSTEMS`. `FixedStepLoop` takes them all with `all(SHIP_SYSTEMS)`. `all()` reads the binding module's own providers plus the exports of its imports and of the global modules. Each system module exports `SHIP_SYSTEMS`. A loop bound in `Simulation` would miss a system that a sibling module provides, so `TICK_LOOP` sits in the aggregate, which imports each system module from G1 on.

The tokens follow the interface-first rule: each interface has a token named for its role, and the module binds a class to each service token with `useClass`. `src/index.ts` exports the tokens and their interfaces, and keeps the classes internal.

| Token          | Interface       | Bound to                  | Bound in           |
| -------------- | --------------- | ------------------------- | ------------------ |
| `SIM_OPTIONS`  | `SimOptions`    | the `forRoot()` value     | `Simulation`       |
| `SIM_CLOCK`    | `ISimClock`     | `FixedStepClock`          | `Simulation`       |
| `RNG`          | `IRandomSource` | `SeededRandom`            | `Simulation`       |
| `SHIP_STATE`   | `IShipState`    | `ShipStateStore`          | `Simulation`       |
| `DECK_PLAN`    | `DeckPlan`      | `deck/meridian.deck.json` | `Simulation`       |
| `TICK_LOOP`    | `ITickLoop`     | `FixedStepLoop`           | `MeridianSystems`  |
| `SHIP_SYSTEMS` | `IShipSystem`   | one class per system      | each system module |

## How a Tick Runs

`TICK_LOOP.advance(ticks)` runs the ship forward. For each tick, the loop calls every system's `step()` in ascending phase, and in name order within a phase, each on the snapshot the previous system returned. It then advances the clock and commits the result to `SHIP_STATE`.

- `FixedStepClock` derives the time from the tick, so 600 ticks of 0.5 s read exactly 300 s.
- `SeededRandom` is splitmix32 over the seed. The loop hands each system its own `RNG.fork(name)`, so a new system leaves the numbers an older system draws unchanged.
- `ShipStateStore` starts at tick 0 with the deck's four compartments (`bridge`, `habitat`, `reactor-bay`, `airlock`) filled with air at 293 K and 101.3 kPa.
- `roundSnapshot(ship)` rounds every fraction to four significant digits and keeps integers exact. The `bridge-api` routes and the golden print snapshots in that form.

This first increment (G0) has no ship system yet. The ship is idle: each tick moves the clock, and the air keeps the deck's initial values.

## The Physics

The classes delegate the arithmetic to pure functions in `src/physics/`, which import nothing from `@nexusdi/`.

- `gas.ts` holds the five gases, the air fractions, `pressure(moles, temperature, volume)` from `P = nRT/V` with `R` from `constants.ts`, and `molesAt(pressure, temperature, volume, fractions)`, which fills a compartment.
- `rng.ts` holds `splitmix32` and `fnv1a32`, which `SeededRandom` uses for its streams and its forks.

The library's ESLint config keeps the simulation reproducible. A file under `src/` imports relative paths and `@nexusdi/core` alone, never names the clocks, the timers, `crypto`, `process`, `Intl`, `eval` or the global object, and reads `Math` only as `Math.name` and never `Math.random`, so `nx lint` fails on `node:crypto` or `const { now } = Date` as well as on `Date.now()`. `tools/repo-checks/src/meridian-purity.test.ts` checks that the config holds those rules. It also fails when a file under `src/physics/` imports `@nexusdi/`, and when a `*.module.ts` file grows past 120 lines.

## Testing the Ship

The library has two test targets. The second one also rewrites the golden when you pass `-u`.

```sh
npx nx test @nexusdi/meridian-systems
npx nx run @nexusdi/meridian-systems:e2e-growth
```

- `test` runs the unit tests beside the files in `src/` and the module tests in `test/`. The module tests build `ShipUnderTest` on `@nexusdi/vitest` fixtures with probe systems, and assert rounded idle values after 600 ticks that hold on any Node.
- `e2e-growth` runs `e2e/idle.e2e.ts`, which compares seed 7 at ticks 0, 1 and 600 with `e2e/golden/idle.seed-7.json`. The suite runs only on the Node version `.nvmrc` names, and stops with both versions in the message on any other. `npx nx run @nexusdi/meridian-systems:e2e-growth -- -u` rewrites the golden. Review its diff as you review a change to `graph.json`. Under `CI`, Vitest writes no snapshot, so a missing golden fails.

The non-required `demo-growth` CI job runs both `e2e-growth` targets (ship systems spec, section 14).

Next, read [`examples/bridge-api`](../bridge-api/README.md), which drives this simulation and serves it over HTTP.
