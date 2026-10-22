# Meridian G2, LifeSupport: Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Ledger: `.superpowers/sdd/meridian-g2/progress.md` in the main checkout.

Goal: the Starship Meridian gains its second ship system. `LifeSupport` runs the air of every compartment in phase 4 of the tick: gas by gas, with heat and an ideal-gas pressure. Heaters with a proportional thermostat, scrubbers, oxygen generators, a vent and a pump draw their power from the reactor through the router. A transient sensor samples one compartment in one tick, and a request scope carries the compartment from the path. `LifeSupport.forRootAsync` reads the sensor calibration at startup. The seeded ship starts with life support offline, so no earlier e2e case changes.

Architecture: one pull request, `feat/meridian-g2-lifesupport`, cut from `origin/release/0.4` at `d7f9820b` (G0 #174, G0b #178 and G1 #180 merged). The physics stays pure in `src/physics/gas.ts` and `src/physics/atmosphere.ts`. The kernel gains a deep setpoint merge, the life-support records and `COMPARTMENT`. Engineering's router gains the contribution point `POWER_CONSUMERS`. `LifeSupport` lives in `src/systems/life-support/`, one class per file. `bridge-api` serves `GET /compartments/:id/atmosphere` on its three frameworks, and the console adds `BRIDGE_LINK.atmosphere(id)` and `/systems/life-support`.

Tech stack: Node from `.nvmrc` (24.20.0), TypeScript 6.0.3, Vitest 5.0.5, Nx 23.3.0, Hono 4.13.13, Express 5.3.0, Fastify 5.12.7, React Router 8.4.0, Playwright 1.64, Deno 2.9.6, Bun 1.4.2.

Spec: `specs/2026-10-21-meridian-ship-systems-design.md` (§ below). Earlier plans: `specs/plans/2026-10-21-meridian-g0-kernel.md`, `-g0b-telemetry.md`, `-g1-engineering.md`. Also the `nexusdi-ways-of-working` skill.

## Owner rulings

1. The growth track never blocks a release. Its e2e runs in `e2e-growth` targets, which only the non-required `demo-growth` job runs.
2. Its deterministic unit tests, `bridge-api`'s graph check and the purity checks run in `main` and the release verify step.
3. G2 starts idle in the seeded scenario, so earlier e2e cases do not change, apart from documented golden additions.
4. The demo stays readable as a DI example.
5. Growth systems finished before 0.4.0 ship with it.

## Rulings this plan carries

The architect proposed and the tech lead decided these on 2026-10-22. The full text, with the node scripts behind each figure, sits in the session scratchpad (`meridian-g2/architect.md`, `rulings.md`). Task 10 writes them into the spec.

1. Idle gate. `setpoints.lifeSupport.online` starts false. The action `online` takes no argument and queues `{ lifeSupport: { online: true } }`. G2 has no action that sets it back, since no ship can stop metabolism and hull loss. `LifeSupportPhysics.step` returns `ship` unchanged while offline, so the deck holds its initial air. Device commands queue while offline and act from the first online tick.
2. Power. `src/systems/engineering/contracts.ts` gains `IPowerConsumer { draw(ship: ShipSnapshot): PowerLoad }` and `POWER_CONSUMERS = new MultiToken<IPowerConsumer>('PowerConsumers')`, exported from `src/index.ts`. `PlasmaRouter.deps = [SHIP_STATE, lazy(SHIELD_GRID), all(POWER_CONSUMERS)]`, and `loads(ship)` returns the shields load and each consumer's draw. A comment says the router reads LifeSupport's contribution through the global `MeridianSystems`, which re-exports it. `LifeSupportPower` (`[LIFE_SUPPORT_OPTIONS, DECK_PLAN]`) draws `{ id: 'life-support', priority: 1, demand: lifeSupportDemand(...), heatShare: 0 }`. The router and phase 4 read the one pure `lifeSupportDemand`. A tick whose `power.shed` holds `life-support` runs no heater, scrubber, generator or pump; metabolism, hull loss, the bay leak and an open vent still run. No command diverts. The tick-0 power record lists the 0 W `life-support` load, which sorts first.
3. Equipment, setpoints, commands. `CompartmentPlan` gains `equipment?: readonly string[]`, `pumpReservoir?: string` and `coolantConductance?: number` (W/K). The deck: `bridge` and `habitat` list `["heater", "scrubber", "oxygen"]`; `reactor-bay` has `"coolantConductance": 2`; `airlock` lists `["vent", "pump"]` with `"pumpReservoir": "habitat"`. `LIFE_SUPPORT_DEVICES = ['heater', 'scrubber', 'oxygen', 'vent', 'pump'] as const`; `ShipStateStore` throws a plain `Error` for an unknown or repeated device, a pump without a reservoir or the reverse, or a reservoir that is unknown or the pump's own room. `Setpoints.lifeSupport = { online, heaters: Partial<Record<CompartmentId, { on, target }>>, scrubbers, oxygen, vents: Partial<Record<CompartmentId, boolean>>, pumps: Partial<Record<CompartmentId, PumpMode>> }`, `PumpMode = 'off' | 'evacuate' | 'fill'` (evacuate moves the room's gas into its reservoir, fill the reverse), one key per device the deck lists. Initial: offline, heaters on at 293 K, scrubbers and generators on, the vent shut, the pump off. `SetpointChange = DeepPartial<Setpoints>`, and one recursive `mergeFrozen(base, change)` over plain objects (skips undefined, replaces primitives and arrays, freezes every level) replaces `mergeChange`, `mergeSetpoints` and `definedFields`. `IAtmosphereControl` (`EnvironmentalController`, `[SHIP_STATE]`): `online()`, `heater(compartment, { on?, target? })`, `scrubber(compartment, on)`, `oxygen(compartment, on)`, `vent(compartment, open)`, `pump(compartment, mode)`, each `QueuedCommand`; each checks `Object.hasOwn` on the device's setpoint record and throws `BadCommandError` (`reason: 'argument'`) when the room lacks it. `LifeSupportCommands` (`[ATMOSPHERE_CONTROL]`, `system = 'life-support'`) reads the arguments: `online` none; `heater` a string `compartment` and at least one of a boolean `on` and a finite `target` from 283 K to 303 K; `scrubber` and `oxygen` a compartment and boolean `on`; `vent` a compartment and boolean `open`; `pump` a compartment and `mode`. `LIFE_SUPPORT_ACTIONS` holds the words: "online with no arguments, heater with a compartment and on true or false or a target from 283 to 303 K, scrubber and oxygen with a compartment and on true or false, vent with a compartment and open true or false, and pump with a compartment and mode off, evacuate or fill".
4. Ratings and figures. In `src/physics/atmosphere.ts`, gathered in `LIFE_SUPPORT_RATINGS`: `ELECTRIC_HEATER { gain: 10_000 W/K, max: 10_000 W }`, `CO2_SCRUBBER { flow: 0.05 m³/s, power: 1_200 W, humidity: 0.4 }`, `ELECTROLYSER { gain: 2e-5 mol/(s·Pa), max: 0.01 mol/s, energy: 600_000 J/mol, setpoint: 21_000 Pa }` (about 95 % against the 571.6 kJ HHV), `TRANSFER_PUMP { rate: 0.2 m³/s, base: 400 W, efficiency: 0.6, maxRise: 101_300 Pa }`, `SPACE_VENT { area: 0.01 m² }`. `src/physics/constants.ts` gains `KAPPA = 0.02` s/m and `CV`, the molar heat capacities of §5.1. The generator takes its water from the ship's tank. Life support's demand peaks at 68.57 kW (§5.7 "up to 69 kW"); priorities 1 to 4 take 225.07 MW and 84.93 MW remain. The air holds 2.5 % of the heat capacity in the bridge and habitat (habitat `C` 4,104,250 J/K), and the loop gain is 1.22 × 10⁻³ (habitat) and 2.44 × 10⁻³ (bridge). Humidity: saturation by Magnus, `610.94 · exp(17.625 · (T − 273.15) / (T − 30.11))` (2,312 Pa at 293 K); a powered scrubber sets `n_H₂O' = max(n_set, n_H₂O · exp(−dt · S / V))` while `n_H₂O > n_set = 0.4 · p_sat · V / (R · T)`. Only heater power heats a room; the model drops the heat of the other devices and the pump's compression work, and has no condensation.
5. The bay leak. `Q_bay = UA · (T_c − T)` on every compartment whose plan has `coolantConductance`, read from `ship.coolant.temperature`, while online. UA = 2 W/K: 40 m of 0.3 m vacuum-jacketed pipe gives 37.7 m², and U ≈ 0.05 W/(m²·K) gives 1.9 W/K. The radiators sit outside the hull and radiate to space, so the old law's 0.2 % of their emission (4.82 MW at full output) reaches no compartment. The figure lives in the deck, since `LITHIUM_LOOP` sits behind Engineering's private `COOLANT_LOOP`. The loop's own balance leaves the leak out (7.4 × 10⁻⁷ of its heat at full output; at idle a 414 W drain would pull it under the 500 K standby G1 ruling 6 pins).
6. Vents and pumps (§5.4). `ventFraction(area, volume, dt) = exp(−dt · area / (KAPPA · volume))`; a vent keeps the temperature. `transfer(source, target, targetStructure, fraction)` in `gas.ts` moves `fraction` of each gas and sets the target's temperature to `(C_t · T_t + Σ Δn_g · c_v,g · T_s) / (C_t + Σ Δn_g · c_v,g)`, so each gas's moles and `Σ C · T` are conserved. A pump moves `m = min(1, rate · dt / V_source)` per tick while `rise = P_target − P_source` (start of tick) stays under `maxRise`, and draws `pumpDraw(rise) = base + rate · clamp(rise, 0, maxRise) / efficiency` (400 W to 34,166.67 W) while its mode is not `off`, stalled or not. A stalled pump moves no gas, so the airlock keeps every gas but the volatiles, which grow by off-gassing. `stepAtmosphere` runs each compartment's own step from the start-of-tick state (metabolism and off-gassing, generator, scrubber, heat balance with `C` from the start-of-tick moles), then every open vent, then every running pump that has not stalled, in `COMPARTMENT_IDS` order.
7. `COMPARTMENT`. The library augments `NexusRequest` with `compartment?: string` in `src/simulation/contracts.ts`, beside `COMPARTMENT = new Token<CompartmentId>('Compartment')`. `Simulation` binds `provide(COMPARTMENT, { useFactory: compartmentOfRequest, deps: [REQUEST], lifetime: 'scoped', eager: false })` (`src/simulation/compartment-of-request.ts`), which throws `UnknownCompartmentError` (`MERIDIAN_UNKNOWN_COMPARTMENT`, fields `compartment?: string`, `expected: string`) for a missing or unknown id. `bridge-api`'s `src/bridge/compartment-of.ts` exports `compartmentOf(path)`, matching `^/compartments/([^/?#]+)` without decoding. The Hono mapper passes `new URL(c.req.url).pathname`, since `c.req.path` decodes percent escapes, and the Express and Fastify mappers pass `req.path` and `req.url`, which hold the path as sent. `src/bridge/atmosphere.ts` exports `answerAtmosphere(scope)`: 200 with `scope.get(ATMOSPHERE_SENSOR).read()`, or 404 with the refusal when the throw is an `UnknownCompartmentError` (`instanceof`), rethrowing the rest. Ruling 7a: core rethrows a `NexusError` from a synchronous construct unwrapped, so the sensor's `get` throws `UnknownCompartmentError` itself, with no `ProviderError` around it (controller, a fact correction of this ruling's first text). `refusalOf` moves into `src/bridge/refusal.ts`. Text: "No compartment is named 'galley'. The deck has bridge, habitat, reactor-bay and airlock." or "The request names no compartment. The deck has ...", fix "read /compartments/<id>/atmosphere with one of the compartments above."
8. The sensor. `GasAnalyzer` (transient, `[COMPARTMENT, SHIP_STATE, RNG, LIFE_SUPPORT_OPTIONS, DECK_PLAN]`) samples in its constructor and `read()` answers that sample, so the lifetime matters: two `get()` around an `advance(1)` give two ticks, a second `read()` of one instance repeats. The arithmetic is pure: `readAtmosphere(air, plan, compartment, tick, calibration, draw)` in `atmosphere.ts`, with `draw` the `next` of ``rng.fork(`AtmosphereSensor:${compartment}:${tick}`)``. Draw order: temperature, pressure, then `GASES`. Each value is `max(0, true + (2u − 1) · noise)`, rounded to its resolution through `toFixed`. `AtmosphereReading = { compartment, tick, temperature (K), pressure (Pa), partial: Record<Gas, Pa> }`. `deck/sensors.calibration.json` holds `{ resolution: { temperature: 0.01, pressure: 1 }, compartments: { <id>: { noise: { temperature: 0.05, pressure: 20, partial: 5 } } } }`. `LifeSupportOptions = { calibration: SensorCalibration; ratings: LifeSupportRatings }`. `readCalibration(deck)` (`src/systems/life-support/read-calibration.ts`) is `async` with nothing to await (its docblock says a ship that reads a device awaits it there), checks one entry per deck compartment and returns the options. The aggregate imports one `LifeSupport.forRootAsync({ deps: [DECK_PLAN], useFactory: readCalibration })` and re-exports that instance.
9. Records and goldens. `CompartmentState` keeps its shape. `ShipSnapshot` gains `lifeSupport: { heaters: Partial<Record<CompartmentId, number>> }` (W, 0 at start) and `setpoints.lifeSupport`. The idle golden gains `lifeSupport`, `setpoints.lifeSupport` and the 0 W `life-support` load; `tick`, `time` and `compartments` stay byte-identical. `e2e/golden/life-support.seed-7.json`: `engineering throttle 0.01` and `life-support online` at tick 0, snapshots at ticks 1, 600 and 7,200. Model: habitat 292.765 K and heater 2,346 W at 600; at 7,200 habitat 292.552 K, 4,482 W, 101,007 Pa, CO₂ 48.8 Pa, RH 40.00 %, bridge 292.725 K at 2,745 W, airlock 286.71 K (RH 57.55 %), bay 291.17 K. Ruling 9a (tech lead, during the run): `bridge-api`'s growth case pumps the airlock from tick 601 and asserts at tick 720 an airlock reading from 36,950 to 37,100 Pa (model 37,023 Pa; seed 7's reading 37,033 Pa), a habitat pressure from `/sim` from 107,000 to 108,000 Pa (model 107,590.6 Pa), and the reading's tick 720.
10. Apps. `bridge-api`: the route on three entries, `graph.json`, `check.test.ts` keyed by token and module (`ShipSystems` and `CommandHandlers` have a provider in Engineering and one in LifeSupport, and `PowerConsumers` has LifeSupport's alone; LifeSupport's physics reads `['system: LifeSupport', 'phase: 4']`), routes tests (200 for `habitat` and `airlock`, 404 with `MERIDIAN_UNKNOWN_COMPARTMENT`, an empty 500 through `FailingSensor` in `test/doubles.ts`), a profiler test that finds the `LifeSupportOptions` factory as an async step of `OfflineMeridian`, and one e2e-growth case. The runtime smoke cases stay as they are. The console: `BRIDGE_LINK.atmosphere(compartment)` (a 404 rejects), `/systems/life-support` (static, like `/systems/engineering`) whose loader reads `snapshot()` and the four sensor reads in parallel, gauges at fixed precision (temperature 0.1 K, pressure 0.1 kPa, O₂ and CO₂ 0.01 kPa, heater W whole), forms for online, the habitat thermostat target and the airlock (pump mode, vent), the last answer, a nav link, `fixed()` in `app/bridge/fixed.ts`, and one console e2e-growth case.
11. A cold reactor sheds life support. Every powered scenario queues `engineering throttle 0.01` beside `online` at tick 0: 12.1 MW from tick 1, and the coolant settles at 514.1 K. A unit case asserts the shed at throttle 0. No battery in G2.
12. G1 test churn. `test/engineering.test.ts` reads the shields load by id; `test/simulation.test.ts` expects `'engineering and life-support'`; typed `ShipReading` doubles in `bridge-api` and the console gain the new records.
13. Deferrals the spec names: G3 door mixing, alarms, `SENSOR_FAULT` and whether `DECOMPRESSION` fires for an empty airlock under a vent (−4.18 kPa/s; the pump starts at −1.69 kPa/s); G4 the airlock drill scenario and its golden; no condensation, no device heat but the heaters, no gas cooling under a vent; the console's `lazySection` form after G0b.
14. For G3: a synchronous tick cannot read the request-scoped sensor, since `createScope` is async. G2 keeps the pure `readAtmosphere` for G3.
15. The console's growth suite runs the life-support case in a second Playwright project that depends on the chromium project, since `online` is one-way on the shared manual ship (`playwright.e2e-growth.config.mts`). `telemetry.spec.ts` stays as G0b left it (tech lead, during the run).
16. The status strip prints the habitat temperature in whole kelvin and the pressure to 0.1 kPa through `fixed()`, and every console gauge shows an SI unit: Pa or kPa for pressures and partial pressures, mol for amounts, no ppm, percent or imperial unit. The owner ruled this on 2026-10-22 over the tech lead's call to leave the strip for #182; `telemetry.spec.ts` keeps `293 K` and `101.3 kPa`, and the strip's unit case reads `95.4 kPa`.

## Numbers the tests assert

Each was computed with Node by the architect and the tech lead. Each task's reviewer recomputes the ones its task asserts.

| Quantity                                          | Value                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| Habitat heat capacity at the initial air          | 4,104,250 J/K ± 1                                                 |
| Saturation pressure at 293 K (Magnus)             | 2,312 Pa ± 1                                                      |
| Habitat thermostat, ticks 2,400 to 7,200          | between 292.4 K and 292.7 K (model 292.552 K)                     |
| Bridge thermostat equilibrium                     | 292.726 K ± 0.05 K at 2,745 W (model 292.725 K)                   |
| Habitat CO₂ equilibrium with its scrubber         | 2.5245 mol ± 1e-5 mol, 51.248 Pa ± 0.001 Pa at 293 K              |
| Habitat generator offset under 21 kPa             | 60.8 Pa, 729 W                                                    |
| Bay equilibrium at a 500 K loop, hull loss only   | 264.3 K                                                           |
| Vent fraction per tick in the airlock             | 0.020618 (τ 24 s); a full airlock under 100 Pa at tick 333        |
| Pump draw                                         | 400 W at no rise, 34,166.67 W at 101,300 Pa or more               |
| Pump alone, airlock evacuate from the initial air | stalls at tick 288: airlock 9,174 Pa, habitat 110,513 Pa (± 1 Pa) |
| Full model, pump evacuate from tick 0             | airlock 36,900 to 37,300 Pa at tick 120 (model 37,096 Pa)         |
| Life-support golden, tick 600                     | habitat 292.765 K, heater 2,346 W                                 |

## Global Constraints

- Worktree `.claude/worktrees/feat/meridian-g2-lifesupport`. Prefix every nx command and every `git commit` and `git push` with `NX_NO_CLOUD=true NX_DAEMON=false`. Every nx command takes `--parallel=2`.
- The branch stays under 100 commits. A task is one to four commits.
- Never `--no-verify`, never a bare `git stash`, never a merge commit.
- Commit subjects follow conventional commits with a scope from `commitlint.config.js` (`meridian-systems`, `bridge-api`, `bridge-console`, `specs`), lowercase, with no `@` and no uppercase letter. Each message ends with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Prose in READMEs, comments, specs and commits follows the writing rules of `nexusdi-ways-of-working`.
- Every service is interface-first: an interface, a `Token<IFoo>` named for the role, and a class bound with `useClass`. A consumer declares tokens in `static deps = [...] as const`.
- No file under `src/physics` imports `@nexusdi/` or a file outside `src/physics`; the simulation's contracts import physics types with `import type`. No file under `examples/meridian-systems/src` reads the wall clock or an unseeded random source (the library's ESLint config). A `*.module.ts` file holds `defineModule` and stays under 120 lines.
- Console gauges round to a fixed precision. Test fixtures feed real unrounded values, such as seed 7's floats.
- Helpers live under the session scratchpad `meridian-g2/` only.

### Heavy work

A heavy job is `npm ci`, a build of more than one project, any `e2e` or `e2e-growth` target, or `nx run-many`. On weekdays from 09:00 to 17:00 one heavy job runs at a time on the machine: take the lock with `until mkdir /tmp/nexusdi-heavy.lock 2>/dev/null; do sleep 20; done`, set `trap 'rmdir /tmp/nexusdi-heavy.lock' EXIT`, and release it after the job. Outside those hours, skip the lock.

### Cleanup

Every task ends with this step before its review gate:

```sh
setopt null_glob 2>/dev/null; rm -rf libs/*/test-output examples/*/dist examples/*/build \
  examples/*/test-output examples/*/out-tsc examples/bridge-console/.react-router tmp
```

### Review gate

Each task ends with a review by a fresh opus reviewer that did not write the task. The reviewer reads the task's diff against this plan and the spec, runs the task's test command, recomputes each physics number the task asserts, checks the readability rule (a reader who opens a module file sees tokens, providers and imports first), and reports findings. The implementer fixes them in new commits. The gate passes when the reviewer reports no finding. The branch ends with a final review by an independent opus reviewer.

## Tasks

| Task | What                                                                  | Commits |
| ---- | --------------------------------------------------------------------- | ------- |
| 0    | this plan                                                             | 1       |
| 1    | the atmosphere physics                                                | 3       |
| 2    | `MERIDIAN_UNKNOWN_COMPARTMENT` and its text                           | 1       |
| 3    | the kernel: deep merge, life-support records, the deck, `COMPARTMENT` | 2 to 3  |
| 4    | the router's `POWER_CONSUMERS`                                        | 1       |
| 5    | `LifeSupport`: classes, calibration, module, aggregate, goldens       | 4       |
| 6    | `bridge-api`: the atmosphere route, `graph.json`, check, profiler     | 3       |
| 7    | `bridge-api`'s life-support growth case                               | 1       |
| 8    | the console's `BRIDGE_LINK.atmosphere` and the life-support page      | 2 to 3  |
| 9    | the console's life-support growth case                                | 1       |
| 10   | READMEs and the spec amendments                                       | 4       |
| 11   | the full gate, the final review and the PR                            | 0       |

---

### Task 0: this plan

- [ ] Commit `docs(specs): plan the g2 life support increment`.

### Task 1: the atmosphere physics

Files:

- Modify: `examples/meridian-systems/src/physics/constants.ts` (`KAPPA`, `CV`), `src/physics/gas.ts`
- Create: `src/physics/atmosphere.ts`
- Test: `src/physics/gas.test.ts`, `src/physics/thermal.test.ts`, `src/physics/atmosphere.test.ts`

`gas.ts` gains `heatCapacity(air, structure)`, `saturationPressure(T)`, `ventFraction(area, volume, dt)`, `vent(air, fraction)` and `transfer(source, target, targetStructure, fraction)`, over a physics-local `Air = { moles: Readonly<Record<Gas, number>>; temperature: number }`. `atmosphere.ts` holds the ratings of ruling 4, `LIFE_SUPPORT_DEVICES`, the physics-local shapes it needs (a room's plan, the life-support setpoints and records, `SensorCalibration`, `AtmosphereReading`), `heaterPower`, `oxygenRate`, `pumpDraw`, `lifeSupportDemand`, `stepAtmosphere` (ruling 6, which takes the compartments, the deck's rooms, the setpoints, the coolant temperature, whether the load was shed, `dt` and the ratings, and returns the new compartments and the heater record) and `readAtmosphere` (ruling 8). `simulation/contracts.ts` will import the shapes with `import type` in Task 3, so `atmosphere.ts` imports only from `src/physics`.

- [ ] Step 1: write `gas.test.ts` cases (habitat heat capacity 4,104,250 J/K ± 1; Magnus 2,312 Pa ± 1 at 293 K; `ventFraction(0.01, 12, 0.5)` removes 0.020618 to six digits; a full airlock vented each tick falls under 100 Pa at tick 333; `transfer` conserves each gas's moles and `Σ C · T` to 1e-12 relative; a transfer between rooms at one temperature leaves both at it) and `thermal.test.ts` cases (habitat thermostat between 292.4 K and 292.7 K from tick 2,400 to 7,200; bridge 292.726 K ± 0.05 K at 2,745 W ± 5 W). See them fail. Write the `gas.ts` functions and the constants. Commit `feat(meridian-systems): add heat capacity, saturation, vents and gas transfer`.
- [ ] Step 2: write `atmosphere.test.ts`: metabolism per §5.3 over one tick; the scrubber's CO₂ equilibrium at 2.5245 mol (51.248 Pa at 293 K); the humidity clamp holds 40.00 % RH; the generator settles 60.8 Pa under 21 kPa at 729 W ± 2 W; the bay settles at 264.3 K for a 500 K loop; `lifeSupportDemand` is 0 offline and sums the devices online; `pumpDraw(0)` 400 W, `pumpDraw(101_300)` and `pumpDraw(200_000)` 34,166.67 W; the airlock pump fraction 0.008333; the pump-alone stall at tick 288 (9,174 Pa and 110,513 Pa ± 1 Pa); a shed tick runs no device and no pump and still vents; offline input leaves every compartment unchanged. See them fail. Write `atmosphere.ts` without `readAtmosphere`. Commit `feat(meridian-systems): step the air of each compartment`.
- [ ] Step 3: write the `readAtmosphere` cases: one compartment and tick repeat; another tick differs; every value rounds to its resolution; an airlock at 50 Pa reads every field at 0 or above. Write it. Run `npx nx test @nexusdi/meridian-systems --parallel=2`, `npx nx lint @nexusdi/meridian-systems --parallel=2`, `npx nx typecheck @nexusdi/meridian-systems --parallel=2`. Commit `feat(meridian-systems): read a compartment through a noisy analyzer`.
- [ ] Step 4: cleanup, then the review gate.

### Task 2: the unknown compartment error

Files:

- Modify: `examples/meridian-systems/src/errors.ts`, `src/text.ts`, `src/index.ts`
- Test: `src/errors.test.ts`, `src/text.test.ts`

- [ ] Step 1: write the failing cases: `UnknownCompartmentError` carries `MERIDIAN_UNKNOWN_COMPARTMENT`, its name and fields, and narrows through `isNexusError`; `explain(error, { text: [shipText] })` gives the two texts of ruling 7 and the fix. Write the class, the augmentation and the text. Export the class from `src/index.ts`. Run test, lint, typecheck. Commit `feat(meridian-systems): refuse an unknown compartment`.
- [ ] Step 2: cleanup, then the review gate.

### Task 3: the kernel

Files:

- Modify: `examples/meridian-systems/deck/meridian.deck.json`, `src/simulation/contracts.ts`, `src/simulation/commands.ts`, `src/simulation/ship-state-store.ts`, `src/simulation/simulation.module.ts`, `src/index.ts`
- Create: `src/simulation/compartment-of-request.ts`
- Test: `src/simulation/ship-state-store.test.ts`, `src/simulation/compartment-of-request.test.ts`, `test/simulation.test.ts`

- [ ] Step 1: write the failing store cases: the initial snapshot holds `setpoints.lifeSupport` and `lifeSupport` as ruling 3 and 9 give them, and the 0 W `life-support` load first in `power.loads`; `heaters.habitat.target` 295 then `heaters.habitat.on` false queued in one tick apply as `{ on: false, target: 295 }` with the bridge heater untouched; a throttle and a heater change in one tick both apply; every level of the result is frozen; the deck checks of ruling 3 each throw. Write `DeepPartial`, `mergeFrozen`, the new setpoints and records, and the deck fields. Commit `feat(meridian-systems): hold the life support setpoints and merge changes deeply`.
- [ ] Step 2: write the failing `compartment-of-request` cases (a known id narrows; a missing or unknown id throws `UnknownCompartmentError` with `expected` naming the four rooms) and a `test/simulation.test.ts` case that a scope with `request: { compartment: 'habitat' }` resolves `COMPARTMENT`, and a scope with none opens and fails only on `get`. Write the factory, the `NexusRequest` augmentation and the provider (`eager: false`), and export `COMPARTMENT`. Run test, lint, typecheck. The idle golden fails on its new records; Task 5 rewrites it. Commit `feat(meridian-systems): scope the compartment over the request`.
- [ ] Step 3: cleanup, then the review gate.

### Task 4: the router's consumers

Files:

- Modify: `examples/meridian-systems/src/systems/engineering/contracts.ts`, `plasma-router.ts`, `src/index.ts`
- Test: `src/systems/engineering/plasma-router.test.ts`, `test/engineering.test.ts`

- [ ] Step 1: write the failing cases: `loads(ship)` lists the shields load, then each consumer's draw; `divert` fits the shields beside a consumer's load; `test/engineering.test.ts` reads the shields load by id. Write the contract and the dep. Run test, lint, typecheck. Commit `feat(meridian-systems): let systems contribute their loads to the router`.
- [ ] Step 2: cleanup, then the review gate.

### Task 5: the LifeSupport module

Files:

- Create under `examples/meridian-systems/src/systems/life-support/`: `contracts.ts`, `gas-analyzer.ts`, `environmental-controller.ts`, `life-support-commands.ts`, `life-support-physics.ts`, `life-support-power.ts`, `read-calibration.ts`, `life-support.module.ts`; `deck/sensors.calibration.json`; `e2e/golden/life-support.seed-7.json`; `e2e/life-support.e2e.ts`
- Modify: `src/meridian-systems.module.ts`, `src/index.ts`, `e2e/golden/idle.seed-7.json`, `test/simulation.test.ts`, `.fallowrc.jsonc` if fallow asks
- Test: `src/systems/life-support/*.test.ts`, `test/life-support.test.ts`

`contracts.ts` holds `IAtmosphereSensor { read(): AtmosphereReading }`, `IAtmosphereControl`, `LifeSupportOptions`, `ATMOSPHERE_SENSOR`, `ATMOSPHERE_CONTROL` and `LIFE_SUPPORT_OPTIONS = new Token<LifeSupportOptions>('LifeSupportOptions')`. `LifeSupportPhysics` (`[LIFE_SUPPORT_OPTIONS, DECK_PLAN]`, `name = 'LifeSupport'`, `static readonly phase = 4`) delegates to `stepAtmosphere`, and a comment states that no phase 2 or 3 system changes the compartments in G2, so its demand matches the router's. `life-support.module.ts` holds `defineModule` alone, as §3.4 shows, with `LifeSupportPower` on `POWER_CONSUMERS` and `LifeSupportCommands` on `COMMAND_HANDLERS`, and exports `ATMOSPHERE_SENSOR`, `ATMOSPHERE_CONTROL`, `SHIP_SYSTEMS`, `POWER_CONSUMERS` and `COMMAND_HANDLERS`.

- [ ] Step 1: write the class tests with plain doubles: the analyzer samples at construction and repeats on a second `read()`; the controller queues each setpoint and refuses a device the room lacks; the commands refuse each bad argument with `BadCommandError`; the physics returns the ship unchanged offline and steps it online; the power draw is 0 W offline; `readCalibration` refuses a deck room with no entry. See them fail, then write the classes and the calibration file. Commit `feat(meridian-systems): add the gas analyzer, the environmental controller and the life support physics`.
- [ ] Step 2: write `test/life-support.test.ts` on `meridianSystems({ seed: 7, dt: 0.5 })`: `Nexus.check` passes; the root reads `ATMOSPHERE_SENSOR` in a scope with a compartment and `ATMOSPHERE_CONTROL`; two `get()` around an `advance(1)` give two ticks; online at throttle 0 sheds `life-support`; throttle 0.01, online and `pump airlock evacuate` at tick 0 read the airlock between 36,900 and 37,300 Pa at tick 120, and once the start-of-tick rise reaches 101,300 Pa the airlock's moles hold for ten ticks while the load asks for 34,166 W or more; a `heater` on `airlock` and a `pump` on `habitat` answer `MERIDIAN_BAD_COMMAND`; after 7,200 ticks with throttle 0.01 and online the habitat rounds to 292.6 K. Write the module, import the one `forRootAsync` instance in the aggregate and add it to the exports, update `src/index.ts` (contracts and tokens, no class) and the churn of ruling 12. Run test, lint, typecheck and `npx nx test @nexusdi/repo-checks --parallel=2 -- meridian-purity`. Commit `feat(meridian-systems): run life support in phase four of the tick`.
- [ ] Step 3: run `npx nx run @nexusdi/meridian-systems:e2e-growth --parallel=2 -- -u` (heavy), then without `-u`. The idle golden diff adds `lifeSupport`, `setpoints.lifeSupport` and the `life-support` load only, and `tick`, `time` and `compartments` stay byte-identical. Commit `test(meridian-systems): add the idle life support records to the golden`.
- [ ] Step 4: write `e2e/life-support.e2e.ts` for the scenario of ruling 9 and run it with `-u`, then without. Check the golden against the model figures of ruling 9 to four digits. Commit `test(meridian-systems): pin an hour of life support to a golden`.
- [ ] Step 5: cleanup, then the review gate.

### Task 6: the atmosphere route

Files:

- Create: `examples/bridge-api/src/bridge/compartment-of.ts`, `src/bridge/atmosphere.ts`, `src/bridge/refusal.ts`
- Modify: `src/bridge/commands.ts`, `src/hono.ts`, `src/express.ts`, `src/fastify.ts`, `graph.json`
- Test: `test/compartment-of.test.ts`, `test/atmosphere.test.ts`, `test/routes.test.ts`, `test/check.test.ts`, `test/doubles.ts`, `test/profile.test.ts`

- [ ] Step 1: write the failing tests: `compartmentOf` reads `/compartments/habitat/atmosphere`, `/compartments/airlock?x=1` and gives undefined for `/sim`; `answerAtmosphere` over stub scopes answers 200, 404 with the text, and rethrows other throws; for each framework on the fixture ship, `GET /compartments/habitat/atmosphere` and `/compartments/airlock/atmosphere` answer 200 with the reading at tick 0, `/compartments/galley/atmosphere` answers 404 with `code: 'MERIDIAN_UNKNOWN_COMPARTMENT'`, and a ship with `ATMOSPHERE_SENSOR` overridden by `FailingSensor` answers an empty 500. See them fail. Write the helpers, the mappers and the three routes, each a few lines. Commit `feat(bridge-api): read a compartment's atmosphere in its request scope`.
- [ ] Step 2: run `npx nx run @nexusdi/bridge-api:graph --parallel=2` and read the diff (LifeSupport, its providers, the router's new dep, `COMPARTMENT`). Rewrite `check.test.ts`'s notes by token and module. Commit `test(bridge-api): draw life support in the graph`.
- [ ] Step 3: write `test/profile.test.ts`: `profile()` from `@nexusdi/devtools` over `OfflineMeridian` lists the `LifeSupportOptions` factory as an async step. Run test, typecheck, lint, and `npx nx run @nexusdi/bridge-api:e2e --parallel=2` (heavy): every existing case passes unchanged. Commit `test(bridge-api): profile the calibration as an async startup step`.
- [ ] Step 4: cleanup, then the review gate.

### Task 7: `bridge-api`'s life-support growth case

Files:

- Create: `examples/bridge-api/e2e/growth/life-support.e2e.ts`

- [ ] Step 1: on Hono, Express and Fastify over a manual `offlineMeridian(...)` on seed 7: post throttle 0.01 and online (202, tick 1); read the habitat at tick 0; advance 600; the habitat reads within 0.1 K of 292.765 K and `GET /sim` gives the habitat heater 2,346 W to four digits; post `pump airlock evacuate` for tick 601, advance 120, and at tick 720 the airlock reads from 36,950 to 37,100 Pa and the habitat from 107 to 108 kPa (ruling 9a); `/compartments/galley/atmosphere` answers 404 with the text. Run `npx nx run @nexusdi/bridge-api:e2e-growth --parallel=2` (heavy, needs the pinned Deno and Bun on `PATH`). Commit `test(bridge-api): heat the habitat and pump the airlock in a growth case`.
- [ ] Step 2: cleanup, then the review gate.

### Task 8: the console's life-support page

Files:

- Create: `examples/bridge-console/app/bridge/fixed.ts`, `app/routes/systems/life-support.tsx`
- Modify: `app/bridge/bridge-link.ts`, `app/routes/systems/engineering.tsx`, `app/routes.ts`, `app/routes/layout.tsx`
- Test: `tests/bridge-link.test.ts`, `tests/doubles.ts`, `tests/fixed.test.ts`, `tests/routes/life-support.spec.tsx`

- [ ] Step 1: write the failing tests: `atmosphere('habitat')` reads the route and a 404 rejects; `fixed` rounds and groups; the page renders each compartment's gauges from seed 7's unrounded floats at fixed precision, the forms post `online`, a habitat `heater` target and the airlock `pump` and `vent`, and the last answer shows. Write `fixed.ts` (the engineering page imports it), the link method, the double, the page, the route and the nav link. Run `npx nx test @nexusdi/bridge-console --parallel=2`, typecheck and lint. Commits `feat(bridge-console): read a compartment's atmosphere through the bridge link` and `feat(bridge-console): add the life support page`.
- [ ] Step 2: cleanup, then the review gate.

### Task 9: the console's growth case

Files:

- Create: `examples/bridge-console/e2e/growth/life-support.spec.ts`

- [ ] Step 1: the case opens `/systems/life-support`, sets the throttle on `/systems/engineering` to 0.01, brings life support online and reads `Queued for tick`, advances the backend through `/sim/advance`, reloads and reads the habitat gauges, and asserts no console error. It starts from the current tick, since the backend keeps its ship across retries. Run `npx nx run @nexusdi/bridge-console:e2e-growth --parallel=2` and `npx nx run @nexusdi/bridge-console:e2e --parallel=2` (heavy). Commit `test(bridge-console): bring life support online in a growth case`.
- [ ] Step 2: cleanup, then the review gate.

### Task 10: READMEs and the spec

Files:

- Modify: `examples/meridian-systems/README.md`, `examples/bridge-api/README.md`, `examples/bridge-console/README.md`, `specs/2026-10-21-meridian-ship-systems-design.md`

- [ ] Step 1: the library README gains a LifeSupport section that names the module, `forRootAsync` and its calibration, the transient sensor and its fork, `COMPARTMENT` over `REQUEST`, `POWER_CONSUMERS` and the commands first, and the physics after, including the idle gate and the cold-reactor shed. It gains `<a id="MERIDIAN_UNKNOWN_COMPARTMENT"></a>` above its error section. `bridge-api`'s README gains the route and the `nexusdi profile src/ship/meridian.ts#OfflineMeridian` line, and the console's README the page.
- [ ] Step 2: amend the spec with rulings 1 to 14: §3.1, §3.2, §3.3, §3.4, §5.1 to §5.4, §5.6, §5.7, §6 (the calibration, compartment, sensor, profiler and testing rows), §6.2, §6.4, §7.1, §7.2, §7.4 (the G2 and G4 rows), §8.1, §8.2, §10.1, §10.2, §13, and the rulings in section 15 as "tech lead, G2 ruling N".
- [ ] Step 3: run `npx prettier --check` on the changed files. Commits `docs(meridian-systems): describe the life support module`, `docs(bridge-api): document the atmosphere route`, `docs(bridge-console): document the life support page` and `docs(specs): record the g2 rulings in the ship systems spec`.
- [ ] Step 4: cleanup, then the review gate.

### Task 11: the gate and the PR

- [ ] Step 1: run the full gate (heavy): `npx nx run-many -t lint test build typecheck --parallel=2`, `npx nx run @nexusdi/bridge-api:e2e --parallel=2`, `npx nx run @nexusdi/bridge-console:e2e --parallel=2`, every `e2e-growth` target (`npx nx run-many -t e2e-growth --projects=tag:demo --parallel=2`), `npx nx run @nexusdi/bridge-api:graph --parallel=2`, `npx fallow dead-code` and `npx prettier --check .`. Then cleanup.
- [ ] Step 2: the final branch review by an independent opus reviewer; fix rounds until it approves.
- [ ] Step 3: rebase onto `origin/release/0.4` if it moved, rerun the graph and the gate, push, and open the PR against `release/0.4`. The body lists the rulings and ends with the Claude Code line. Wait for CI, fix any CodeQL alert, and report the PR number and the result. Do not merge.
