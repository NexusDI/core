# Meridian G3, Safety: Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Ledger: `.superpowers/sdd/meridian-g3/progress.md` in the main checkout.

Goal: the Starship Meridian gains its third ship system. `Safety` runs in phase 5 of the tick. It mixes the air through open doors and runs fires and floods. Each tick it writes the active alarm set into the snapshot. `PressureInterlock` refuses a door with more than 5 kPa across it, and `MasterAlarm` tells every alarm sink what was raised and cleared. A shared atmosphere probe lets the tick read the same noisy sensors the routes read, and a test that breaks the probe sees `SENSOR_FAULT`. `bridge-api` records each door command in the request's flight log through `nodeScopes()`, and the console adds `/systems/safety`. The seeded ship starts with every door shut and no fire, so no earlier e2e case changes.

Architecture: one pull request, `feat/meridian-g3-safety`, cut from `origin/release/0.4` at `0142690c` (G0 #174, G0b #178, G1 #180 and G2 #183 merged). The physics stays pure in `src/physics/gas.ts`, `doors.ts`, `fire.ts` and `safety.ts`. The kernel gains the safety records, `DOOR_IDS`, the flood charges and `TickContext.start`. LifeSupport gains the contribution `ATMOSPHERE_PROBE`. `Safety` lives in `src/systems/safety/`, one class per file, and `PressureInterlock` sits behind the subpath `@nexusdi/meridian-systems/interlock`. `bridge-api` registers the interlock and its `FlightRecorder` and answers safety commands on `POST /commands` on its three frameworks. Its global `AlarmPanel` contributes `AuditAlarmSink`. The console adds `/systems/safety`.

Tech stack: Node from `.nvmrc` (24.20.0), TypeScript 6.0.3, Vitest 5.0.5, Nx 23.3.0, Hono 4.13.13, Express 5.3.0, Fastify 5.12.7, React Router 8.4.0, Playwright 1.64, Deno 2.9.6, Bun 1.4.2.

Spec: `specs/2026-10-21-meridian-ship-systems-design.md` (§ below). Earlier plans: `specs/plans/2026-10-21-meridian-g0-kernel.md`, `-g0b-telemetry.md`, `-g1-engineering.md`, `-g2-lifesupport.md`. Also the `nexusdi-ways-of-working` skill.

## Owner rulings

1. The growth track never blocks a release. Its e2e runs in `e2e-growth` targets, which only the non-required `demo-growth` job runs.
2. Its deterministic unit tests, `bridge-api`'s graph check and the purity checks run in `main` and the release verify step.
3. G3 starts idle in the seeded scenario, so earlier e2e cases do not change, apart from documented golden additions.
4. The demo stays readable as a DI example.
5. Growth systems finished before 0.4.0 go out with it.
6. Earlier e2e cases stay unchanged. A golden may gain documented additions, and no earlier assertion changes.
7. Console gauges use SI units: K as whole numbers, kPa, Pa, mol and W.
8. Deterministic checks gate the growth track: the unit tests, `check.test.ts`'s graph check and the purity checks run in `main`, and `e2e-growth` never gates.
9. Safety reads LifeSupport only through LifeSupport's exports. A package or module extends another only through public contribution points (P1 to P5).

## Rulings this plan carries

The architect proposed and the tech lead decided these on 2026-10-22. Where the tech lead changed a ruling, this list gives the tech lead's text. The full text, with the node scripts behind each figure, sits in the session scratchpad's `meridian-g3/` folder (`architect.md`, `rulings.md`, `tl-safety.mts` and the `g3-*.mts` scripts). Task 17 writes them into the spec, each as "tech lead, G3 ruling N".

1. Records. `src/simulation/contracts.ts` gains `DOOR_IDS = ['bridge-habitat', 'habitat-reactor-bay', 'habitat-airlock', 'airlock-outer'] as const`, `DoorId`, and `ShipSnapshot.safety: SafetyRecord<CompartmentId>`. `src/physics/safety.ts` holds `AlarmCode`, a union of `FIRE`, `SENSOR_FAULT`, `HYPOXIA`, `CO2_HIGH`, `PRESSURE_LOW`, `TEMPERATURE`, `DECOMPRESSION`, `COOLANT_HIGH`, `REACTOR_TRIP` and `LOAD_SHED`, `Alarm { code; subject }` (the compartment, the shed load's id, or `reactor`), `SafetyRecord { fires: Record<Id, number>; flooded: Partial<Record<Id, number>>; alarms: readonly Alarm[] }` and `SafetySetpoints { doors: Record<Door, boolean>; floods: Partial<Record<Id, boolean>>; drills: Partial<Record<Id, boolean>> }`. `Setpoints.safety` is `SafetySetpoints<CompartmentId, DoorId>`. `ShipStateStore` builds every door shut, `floods` and `drills` false for each room with a `floodCharge`, `fires` 0 for every compartment, `flooded` 0 for each charged room, and no alarm. `CompartmentState` keeps its shape. `TickContext` gains `readonly start: ShipSnapshot`, the snapshot `applyQueued` returned for the tick before any system stepped, and `FixedStepLoop` passes it. DECOMPRESSION reads the start-of-tick air from it, and the deadband of ruling 10 reads `start.safety.alarms` as the previous set.
2. Door mixing. `Safety` runs the doors in phase 5, and LifeSupport's files stay as G2 left them. `gas.ts` splits `transfer` into `parcel(air, fraction): { kept; moved }` and `mix(target, structure, parcel)`, the G2 transfer law `(C_t · T_t + Σ n_p · c_v · T_p) / (C_t + Σ n_p · c_v)`. `transfer` runs `parcel` then `mix` with the same arithmetic in the same order, so the G2 goldens stay byte-identical. `exchange(a, b, structureA, structureB, fromA, fromB)` takes both parcels from the start state and mixes each into the other side's kept air. The parcels carry each side's temperature, so a hot room and a cold room at equal molar density still trade heat (§5.5's net term would freeze that gap). `src/physics/doors.ts` holds `doorFractions(area, volumeA, volumeB, dt) = { fromA: f · V_b / V, fromB: f · V_a / V }` with `f = 1 − exp(−dt · A / (KAPPA · (V_a + V_b)))`, `doorPressures(compartments, rooms, door): readonly [number, number]` with `space` at 0 Pa, `PRESSURE_INTERLOCK = { limit: 5_000 }` (Pa) and `DoorPlan`, which `simulation/contracts.ts` re-exports. The step runs every open door in deck order, each from the air the previous door left. `airlock-outer` runs `vent(air, ventFraction(1.2, 12, dt))`.
3. Doors and their commands. `ShipStateStore` throws a plain `Error` for a deck door that is unknown or listed twice, a `DOOR_IDS` entry the deck lacks, and a `between` that does not hold two distinct entries, each a compartment id or `space`, with at most one `space`. `IBlastDoors` (`BlastDoorControl`, `[SHIP_STATE]`): `open(door: string)` and `close(door: string)`, each a `QueuedCommand`. Each checks `Object.hasOwn(snapshot.setpoints.safety.doors, door)`, throws `BadCommandError({ reason: 'argument', system: 'safety', action, expected: SAFETY_ACTIONS })` for an unknown door, and queues `{ safety: { doors: { [door]: true } } }` or `false`. `IFireSuppression` (`InertGasSuppression`, `[SHIP_STATE]`): `flood(compartment: string)` and `drill(compartment: string)`, which check `floods` and `drills` the same way and queue `{ safety: { floods: { [compartment]: true } } }` or `{ safety: { drills: { [compartment]: true } } }`. `SafetyCommands` (`[BLAST_DOORS, FIRE_SUPPRESSION]`, `system = 'safety'`): `open` and `close` take a string `door`, `flood` and `drill` a string `compartment`; a missing or non-string argument answers reason `argument` before the panel runs, so the interlock sees strings alone, and any other action answers reason `action`. `SAFETY_ACTIONS` in `src/systems/safety/contracts.ts` reads "open and close with a door of bridge-habitat, habitat-reactor-bay, habitat-airlock or airlock-outer, and flood and drill with a compartment of bridge, habitat or reactor-bay". A unit test checks the doors against `DOOR_IDS` and the rooms against the deck's charges. A command for the state a door already holds queues and changes nothing, and `open` of an open door still passes the interlock. The desk's served list reads "engineering, life-support and safety".
4. PressureInterlock. The class lives at `src/systems/safety/pressure-interlock.ts` with `import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors'`. `package.json` `exports` gains `"./interlock"` with the same three conditions as `./text`, and `src/index.ts` does not export the class; `InterlockError`, `PRESSURE_INTERLOCK` and `doorPressures` stay on the main entry. `package.json` declares `"@nexusdi/interceptors": "*"` in `peerDependencies` with `peerDependenciesMeta: { "@nexusdi/interceptors": { "optional": true } }`, and in `devDependencies`; `npx nx sync` adds the tsconfig reference. `examples/meridian-systems/eslint.config.mjs` swaps core `no-restricted-imports` for `@typescript-eslint/no-restricted-imports` with two patterns: the current one with `@nexusdi/interceptors` among the exempt names, and `{ regex: '^@nexusdi/interceptors$', allowTypeImports: true }`. It adds `@typescript-eslint/no-import-type-side-effects: 'error'`, and the `src/**/*.test.ts` block gets the same two patterns with its own exempt list. `tools/repo-checks/src/meridian-purity.test.ts` reads the new rule ids and gains cases: `import type { Interceptor } from '@nexusdi/interceptors'` passes; a value import of it, `import { type Interceptor } from '@nexusdi/interceptors'`, a value import of `@nexusdi/interceptors/text` and `import type { Interceptor } from '@nexusdi/interceptors/text'` are refused; `node:crypto` stays refused, type import included. The class:

   ```ts
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

   `bridgePlugins()` registers it with `interceptors({ imports: [AuditTrail], providers: [provide(REQUEST_SCOPES, { useValue: options.scopes ?? NO_SCOPES })], register: [NavAudit, FlightRecorder, PressureInterlock], bindings: [{ token: NAV_CHARTS, class: [NavAudit] }, { token: BLAST_DOORS, methods: { open: [FlightRecorder, PressureInterlock], close: [FlightRecorder] } }] })`, importing the class from `@nexusdi/meridian-systems/interlock`. The chain runs outermost first (`libs/interceptors/src/chain.ts`), so a refused open records nothing. The interlock reads `SHIP_STATE` and `DECK_PLAN` through the global `Simulation`. The binding wraps the instance `SafetyCommands` holds, the throw reaches `CommandDesk.submit`'s caller as the same `InterlockError`, and the sync path stays sync. The library README says "`@nexusdi/meridian-systems/interlock` needs `@nexusdi/interceptors`; the main entry does not."

5. The pressures across a door. The interlock reads the true pressures of the committed snapshot through `doorPressures`, with `space` at 0 Pa, so a command's answer never depends on the RNG. The console's door gauges show the same pressures. `close` is never interlocked, and the flight recorder still wraps it. At tick 0 the outer door holds 101,300 Pa, so it refuses until the airlock is under 5 kPa.
6. FLIGHT_LOG through `nodeScopes()`. `bridge-api`'s `src/ship/contracts.ts` gains `IScopeSource { current(): Scope | undefined }` and `REQUEST_SCOPES = new Token<IScopeSource>('RequestScopes')`. `FlightRecorder` (a private class in `src/ship/plugins.ts` beside `NavAudit`, `[REQUEST_SCOPES]`) calls `next()`, then ``this.scopes.current()?.get(FLIGHT_LOG).record(`${DONE[method]} ${door}`)`` with `DONE = { open: 'opened', close: 'closed' }`, so the entry reads `survey-7: opened habitat-airlock`. `bridgePlugins(options: { dev?; trace?; scopes?: IScopeSource })` binds `NO_SCOPES = { current: () => undefined }` without `scopes`. `shipFromEnv(scopes?: IScopeSource)` passes them on. Each Node server entry and `worker.offline.ts` create `const scopes = nodeScopes()` once and pass it to `shipFromEnv(scopes)` and `createBridge(ship, { scopes })`; `worker.ts` and the edge entry pass none and answer `{ tick }`. `POST /commands` on the three frameworks injects `{ desk: COMMAND_DESK, log: FLIGHT_LOG }`, and `answerCommand(desk, body, log)` answers 202 with `{ tick, flightLog: [...log.entries()] }` when the log holds entries and `{ tick }` when it holds none. `CommandReply`'s 202 body becomes `QueuedCommand & { readonly flightLog?: readonly string[] }`. Engineering and life-support commands record nothing, so every G1 and G2 `toEqual({ tick })` holds. The §6 row's "Ship system" cell reads "`nodeScopes()` makes the request's scope current for the whole handler, so `FlightRecorder`, a singleton interceptor on `BLAST_DOORS`, records `survey-7: opened habitat-airlock` into the request's scoped `FLIGHT_LOG` with no argument, and `POST /commands` answers the entry beside the tick", and its "Why it fits" cell reads "a singleton interceptor serves every request, so it finds the request's log through the current scope".
7. The probe and the sensor reads. `src/systems/life-support/contracts.ts` gains `IAtmosphereProbe { read(compartment: CompartmentId, air: CompartmentState, tick: number): AtmosphereReading<CompartmentId> }` and `ATMOSPHERE_PROBE = new Token<IAtmosphereProbe>('AtmosphereProbe')`. `CalibratedProbe` (`calibrated-probe.ts`, `[RNG, LIFE_SUPPORT_OPTIONS, DECK_PLAN]`, singleton) runs `readAtmosphere` with `draw` the `next` of ``rng.fork(`AtmosphereSensor:${compartment}:${tick}`)``, the G2 fork. `GasAnalyzer` becomes `[COMPARTMENT, SHIP_STATE, ATMOSPHERE_PROBE]` and samples `probe.read(compartment, ship.compartments[compartment], ship.tick)`, bit-identical to G2. `LifeSupport` binds and exports `ATMOSPHERE_PROBE`, and `SafetyPhysics` reads it through the global aggregate's re-export. Each tick Safety reads every compartment twice: the start-of-tick air with `tick − 1` and the end-of-step air with `tick`, the readings a route gives for those two committed ticks. `FIRE` comes first for each compartment and runs before the reads. When either read throws (any throw), Safety raises `SENSOR_FAULT` for the room and skips its atmosphere alarms; it clears on the first tick both reads succeed. `FailingProbe implements IAtmosphereProbe` (every `read` throws a plain `Error`) and `MemoryAlarmSink` sit in `bridge-api`'s `test/doubles.ts` beside `FailingSensor`. The §6 testing row reads `override(ATMOSPHERE_PROBE, { useClass: FailingProbe })` raises `SENSOR_FAULT` from G3, and the G2 sensor case stays.
8. MasterAlarm and sinks. `src/systems/safety/contracts.ts`: `IAlarmSink { raise(alarm: Alarm, tick: number): void; clear(alarm: Alarm, tick: number): void }`, `ALARM_SINKS = new MultiToken<IAlarmSink>('AlarmSinks')`, `IMasterAlarm { active(): readonly Alarm[] }` and `MASTER_ALARM = new Token<IMasterAlarm>('MasterAlarm')`. `MasterAlarm` (`[TICK_LOOP, all(ALARM_SINKS)]`) listens in `onInit` and unsubscribes in `Symbol.dispose`. Each tick it compares `ship.safety.alarms` with the set it last dispatched, keyed by `code` and `subject`, clears the gone ones in the old order, then raises the new ones in the new order, through `callAll`. One failing sink leaves the others served, and the loop throws after the committed tick. The last set starts empty. `TelemetryAlarmSink` goes, since every frame carries `safety.alarms`. `bridge-api` contributes `AuditAlarmSink` (`[AUDIT_LOG]`), which records `raised DECOMPRESSION habitat at tick 2` and `cleared DECOMPRESSION habitat at tick 3`, from a new module `AlarmPanel` (`src/ship/alarm-panel.module.ts`: `global: true`, `imports: [AuditTrail]`, `providers: [provide(ALARM_SINKS, { useClass: AuditAlarmSink })]`, `exports: [ALARM_SINKS]`). Its comment says why it is global: `all()` in `Safety` reads its own module, its imports' exports and the global modules' exports. `meridian()` and `offlineMeridian()` import it. `Safety` exports `BLAST_DOORS`, `FIRE_SUPPRESSION`, `MASTER_ALARM`, `SHIP_SYSTEMS` and `COMMAND_HANDLERS`, and `src/index.ts` exports `ALARM_SINKS`. The aggregate imports `Safety` after `LifeSupport`, and shutdown disposes `SimDriver`, `MasterAlarm`, `TelemetryFeed`, `ReactorCore` in that order.
9. Fire. `burns(air, volume)` in `src/physics/fire.ts` holds when the O₂ mole fraction is above 16 % and `p_O₂` is above 16 kPa. Ignition: above 330 K while `burns` holds, with chance `1 − exp(−λ · dt)`, `λ = 1 × 10⁻³ /s` (4.9988 × 10⁻⁴ a tick), one draw from the Safety fork per eligible room per tick in `COMPARTMENT_IDS` order; a room with a fire, at 330 K or under, or where `burns` fails draws nothing. Ignition sets `φ = 0.05`. A burning room grows `φ' = min(1, φ + 0.05 · dt)` while `burns` holds, else `φ' = φ · exp(−0.2 · dt)`, and goes out when `φ' < 0.01`. It burns `min(n_O₂, 0.5 · φ' · dt)` mol of O₂ and adds CO₂ and H₂O at 0.4 and 0.2 per 0.5 burned, with `Q_fire = 400 kJ` per mol of O₂ added as `T' = T + Q / C`, `C` from the room's air before the burn. The heat enters in Safety's step after the doors; LifeSupport's balance stays as G2 wrote it. The drill: a room with `drills[id]` true and no fire lights at `φ = 0.05` when `burns` holds, with no temperature condition and no draw, and every drill flag returns to false in the same tick, lit or not; a drill on a burning or flooded room changes nothing. Floods: `CompartmentPlan = RoomPlan & FloodPlan`, `FloodPlan = { readonly floodCharge?: number }` (mol) in `fire.ts`; the deck gives `bridge` 1,000, `habitat` 2,000 and `reactor-bay` 1,330, and `ShipStateStore` throws a plain `Error` for a charge that is not a positive finite number. A flood releases `charge / 20` a tick for 10 s at the room's temperature, counts it in `safety.flooded`, and when the count reaches the charge writes the valve false and the count 0. A flood queued while one runs changes nothing. Fire and floods run while life support is offline. The step order: doors, fires, floods, alarms.
10. Alarms. `stepSafety` evaluates per compartment in `COMPARTMENT_IDS` order: `FIRE` when `φ > 0`, then `SENSOR_FAULT` when a read throws, then in an occupied room only (`occupants > 0`) `HYPOXIA`, `CO2_HIGH`, `PRESSURE_LOW`, `TEMPERATURE` and `DECOMPRESSION` on the reads, with `dP/dt = (P_now − P_start) / dt`. Then `COOLANT_HIGH` (`coolant.temperature > 1,350 K`, subject `reactor`), `REACTOR_TRIP` (`reactor.tripped`, subject `reactor`) and one `LOAD_SHED` per entry of `power.shed`, in its order. While `DECOMPRESSION` is active Safety writes `setpoints.safety.doors` false on every tick for each door whose `between` names the room, and no command log entry comes from it. Each atmosphere alarm raises at its first limit and, once active in `start.safety.alarms`, clears only past its second (`ALARM_LIMITS` in `src/physics/safety.ts`, each gap at least ten times the sensor noise):

    | Alarm           | Raised when                | Cleared when            |
    | --------------- | -------------------------- | ----------------------- |
    | `HYPOXIA`       | `p_O₂` < 16,000 Pa         | `p_O₂` ≥ 16,500 Pa      |
    | `CO2_HIGH`      | `p_CO₂` > 1,000 Pa         | `p_CO₂` ≤ 950 Pa        |
    | `PRESSURE_LOW`  | `P` < 70,000 Pa            | `P` ≥ 72,000 Pa         |
    | `TEMPERATURE`   | `T` < 283 K or `T` > 303 K | 283.5 K ≤ `T` ≤ 302.5 K |
    | `DECOMPRESSION` | `dP/dt` < −2,000 Pa/s      | `dP/dt` ≥ −1,000 Pa/s   |

    `FIRE`, `SENSOR_FAULT` and the engineering alarms follow their records with no deadband. The airlock cycles by design (vent −4.18 kPa/s, outer door at the limit −9.18 kPa/s), so it raises no atmosphere alarm, and G4's drill can vent through the outer door. The idle ship over 600 ticks, the life-support golden scenario over 7,200 ticks, G2's `bridge-api` scenario to tick 720 and G1's engineering scenario raise nothing; G2's unit case `online` at throttle 0 raises `LOAD_SHED life-support`, which it does not assert against.

11. Idle. Safety has no online gate. With every door shut, no room above 330 K, no drill and no valve open, the step changes no gas, draws nothing from the Safety fork and returns the incoming `compartments` object, so the goldens' compartments stay byte-identical.
12. `errors()` text. `bridge-api`'s `src/bridge/refusal.ts` exports `SHIP_TEXT = [shipText, interceptorsText] as const`. `refusalOf` calls `explain(error, { text: SHIP_TEXT })`, and `bridgePlugins({ dev: true })` registers `errors({ text: SHIP_TEXT })`; registration stays dev only beside `devtools()`, since core's `formatError` words only the errors core raises and no refusal body depends on the plugin. `InterlockError` (`MERIDIAN_INTERLOCK`) carries `door: string`, `difference: number` (Pa, rounded) and `limit: number` (Pa). `shipText` reads "The habitat-airlock door holds 70,585 Pa of difference, above the 5,000 Pa interlock." and the fix "bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.", each number through `formatNumber`. `answerCommand` answers it 409 with `{ code: 'MERIDIAN_INTERLOCK', message, fix }`, and the console shows it through the existing `LastAnswer`.
13. Routes and the graph. G3 adds no route: safety commands ride `POST /commands`, and `GET /sim` carries `safety` and `setpoints.safety`. The §7.1 row for `POST /commands` reads "202 with `{ tick }`, and `flightLog` when the request's flight log holds entries". `check.test.ts` adds `'ShipSystems in Safety': ['system: Safety', 'phase: 5']`, `['system: Safety']` for `CommandHandlers`, `BlastDoors`, `FireSuppression` and `MasterAlarm in Safety`, `'AtmosphereProbe in LifeSupport': ['system: LifeSupport']`, and `'AlarmPanel'` in `bridgeModules`. `graph.json` gains `Safety`, `AlarmPanel`, the probe, `FlightRecorder`, `PressureInterlock` and `RequestScopes`. `test/profile.test.ts` stays unchanged.
14. Goldens and growth cases. `idle.seed-7.json` and `life-support.seed-7.json` gain `safety` and `setpoints.safety` (`drills` included) in each snapshot; `tick`, `time`, `compartments`, `reactor`, `coolant`, `power` and `lifeSupport` stay byte-identical. The new `e2e/golden/safety.seed-7.json` pins the door scenario of Task 10. `bridge-api`'s growth file holds the door case and the drill case of Task 13, and the console's holds the case of Task 15 in a third Playwright project.
15. The spec. Task 17 lists each section the rulings above change.

## Numbers the tests assert

Each was computed with Node by the architect and the tech lead. Each task's reviewer recomputes the ones its task asserts.

| Quantity                                                | Value                                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Door `f` per tick                                       | `bridge-habitat` 0.188064, `habitat-reactor-bay` 0.170971, `habitat-airlock` 0.203297                                                 |
| `fromA` and `fromB` per tick                            | 0.125376 and 0.062688; 0.068388 and 0.102583; 0.018482 and 0.184815                                                                   |
| `airlock-outer` open                                    | keeps 0.08208 a tick, −186.0 kPa/s from 101.3 kPa                                                                                     |
| Bridge 100 kPa, habitat 50 kPa, 48 ticks                | moles to 1 × 10⁻⁹, `Σ C · T` to 1 × 10⁻¹², within 1 % (model 66,668.18 and 66,665.91 Pa)                                              |
| 330 K bridge with 50 mol CO₂ against habitat, 200 ticks | moles and `Σ C · T` to 1 × 10⁻¹²; CO₂ densities agree at 0.28887 mol/m³                                                               |
| Habitat after a 2,000 mol flood                         | 14.99 % O₂ at 141.9 kPa, `p_O₂` 21.27 kPa; `burns` fails                                                                              |
| `burns` at a total of 75 kPa                            | fails (`p_O₂` 15.75 kPa)                                                                                                              |
| Fire growth and decay                                   | 0.05 to 1 in 38 ticks; 1 to under 0.01 in 47 ticks                                                                                    |
| Habitat moles at 340 K (117,549 Pa), forced ignition    | `φ = 1` from tick 39; `burns` fails at 986 ± 1; out at 1,033 ± 1; peak 363.79 K ± 0.01; 244.2 ± 0.1 mol O₂                            |
| Same room at `φ = 1`, flood from the next tick          | `burns` fails on flood tick 16; out at tick 63 ± 1                                                                                    |
| Safety fork of seed 7                                   | first draw under 4.9988 × 10⁻⁴ on draw 177 (`u` = 1.5665 × 10⁻⁴)                                                                      |
| Full ship, habitat at 340 K at tick 0                   | `φ` 0.05 at 177, 1 at 215; flood at 400 puts it out at 460 ± 2; valve false from 420; 167.6 ± 0.5 kPa                                 |
| Doors `habitat-airlock` and `airlock-outer` at tick 0   | tick 1 habitat 101,300 ± 1, airlock 8,315.2 ± 1; tick 2 habitat 99,581.5 ± 1 and `DECOMPRESSION`; tick 3 airlock 171.8 Pa             |
| Drill habitat at tick 0, throttle 0.01, online          | tick 1 `φ` 0.05; `φ = 1` from 39, at 40 (293.501 K, 101,495.1 Pa); flood at 60 puts it out at 122 ± 2                                 |
| Same, tick 200                                          | habitat 142,652.5 ± 500 Pa, 294.49 ± 0.05 K, no alarm                                                                                 |
| Same, no flood                                          | `CO2_HIGH habitat` at tick 256, `TEMPERATURE habitat` at tick 441, each once                                                          |
| Bay drill after the 7,200-tick run                      | lights the next tick (291.17 K); a flood from the tick after puts it out 54 ticks later at 140,968 Pa                                 |
| Safety golden                                           | tick 120: 107,681.0 and 37,095.6 Pa; tick 190: 101,565.0 and 98,060.0 Pa; tick 209: 101,250.9 and 101,172.4 Pa, 292.897 and 292.804 K |
| Interlock across `habitat-airlock`, door case           | 70,585 Pa at tick 120; 5,323 Pa at tick 188; 4,391 Pa at tick 189                                                                     |

## Global Constraints

- Worktree `.claude/worktrees/feat/meridian-g3-safety`. Prefix every nx command and every `git commit` and `git push` with `NX_NO_CLOUD=true NX_DAEMON=false`. Every nx command takes `--parallel=2`.
- The branch holds 100 commits or fewer. A task is one to four commits.
- Every commit passes `npx nx test @nexusdi/meridian-systems --parallel=2` and `npx nx test @nexusdi/bridge-api --parallel=2 -- test/check.test.ts` on its own, and the final `rebase -x` checks it. A commit that changes the graph (a provider, a dep, a module or a plugin) carries the regenerated `graph.json` and the `check.test.ts` notes in the same commit. G2's first final review failed on a `graph.json` that trailed its module change. The tasks below are ordered so this holds.
- Never `--no-verify`, never a bare `git stash`, never a merge commit.
- Commit subjects follow conventional commits with a scope from `commitlint.config.js` (`meridian-systems`, `bridge-api`, `bridge-console`, `specs`), lowercase, with no `@` and no uppercase letter. Each message ends with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Prose in READMEs, comments, specs and commits follows the writing rules of `nexusdi-ways-of-working`.
- Every service is interface-first: an interface, a `Token<IFoo>` named for the role, and a class bound with `useClass`. A consumer declares tokens in `static deps = [...] as const`.
- No file under `src/physics` imports `@nexusdi/` or a file outside `src/physics`; the simulation's contracts import physics types with `import type`. No file under `examples/meridian-systems/src` reads the wall clock or an unseeded random source, and `pressure-interlock.ts` alone imports `@nexusdi/interceptors`, types only. A `*.module.ts` file holds `defineModule` and stays under 120 lines.
- Console gauges round to a fixed precision in SI units. Test fixtures feed real unrounded values, such as seed 7's floats.
- Helpers live in the session scratchpad's `meridian-g3/` folder only.

### Heavy work

A heavy job is `npm ci`, a build of more than one project, any `e2e` or `e2e-growth` target, `nx run-many`, or the final `rebase -x`. On weekdays from 09:00 to 17:00 one heavy job runs at a time on the machine: take the lock with `until mkdir /tmp/nexusdi-heavy.lock 2>/dev/null; do sleep 20; done`, set `trap 'rmdir /tmp/nexusdi-heavy.lock' EXIT`, and release it after the job. Outside those hours, skip the lock.

### Cleanup

Every task ends with this step before its review gate:

```sh
setopt null_glob 2>/dev/null; rm -rf libs/*/test-output examples/*/dist examples/*/build \
  examples/*/test-output examples/*/out-tsc examples/bridge-console/.react-router tmp
```

### Review gate

Each task ends with a review by a fresh opus reviewer that did not write the task. The reviewer reads the task's diff against this plan and the spec, runs the task's test command, checks that each commit passes the two per-commit suites, recomputes each physics number the task asserts, checks the readability rule (a reader who opens a module file sees tokens, providers and imports first), and reports findings. The implementer fixes them in `fixup!` commits of the commit each fix belongs to. The gate passes when the reviewer reports no finding. The branch ends with a final review by an independent opus reviewer.

## Tasks

| Task | What                                                                           | Commits |
| ---- | ------------------------------------------------------------------------------ | ------- |
| 0    | this plan                                                                      | 1       |
| 1    | `parcel`, `mix` and `exchange`, with `transfer` built on them                  | 1       |
| 2    | the door and fire physics                                                      | 2       |
| 3    | `stepSafety`, the alarm limits and the deadband                                | 1       |
| 4    | `MERIDIAN_INTERLOCK` and its text                                              | 1       |
| 5    | the kernel: safety records, doors, flood charges, `TickContext.start`, goldens | 2       |
| 6    | `ATMOSPHERE_PROBE`, `CalibratedProbe` and the analyzer on it, with the graph   | 1       |
| 7    | the type import of `@nexusdi/interceptors`: ESLint, purity, package            | 1       |
| 8    | the Safety classes and the `./interlock` subpath                               | 3       |
| 9    | the `Safety` module in the aggregate, with the graph, and the module test      | 2       |
| 10   | the safety golden                                                              | 1       |
| 11   | `bridge-api`: `SHIP_TEXT`, the flight recorder, the interlock, `flightLog`     | 2       |
| 12   | `bridge-api`: `AlarmPanel`, the alarm suite and the safety route cases         | 2       |
| 13   | `bridge-api`'s safety growth cases                                             | 1       |
| 14   | the console's flight log and the safety page                                   | 2       |
| 15   | the console's safety growth case                                               | 1       |
| 16   | READMEs, with the `bridge-api` routing note                                    | 3       |
| 17   | the spec amendments and the G2 plan's Hono path                                | 2       |
| 18   | the full gate, the final review and the PR                                     | 0       |

---

### Task 0: this plan

- [ ] Commit `docs(specs): plan the g3 safety increment`.

### Task 1: the two-way exchange

Files:

- Modify: `examples/meridian-systems/src/physics/gas.ts`
- Test: `src/physics/gas.test.ts`

- [ ] Step 1: write the failing `gas.test.ts` cases of ruling 2: `parcel` splits each gas at the air's temperature; `exchange` against §5.5's net moles agrees to 1 × 10⁻¹² relative; `exchange(a, b, structureA, structureB, fromA, 0)` gives a `b` side equal bit for bit to `transfer(a, b, structureB, fromA)`, both sides' moles equal bit for bit, and the `a` temperature within 1 × 10⁻¹⁵ relative of `a.temperature`; the 330 K bridge with 50 mol of CO₂ against the 293 K habitat for 200 ticks conserves moles and `Σ C · T` to 1 × 10⁻¹² and the CO₂ densities agree at 0.28887 mol/m³. The G2 `transfer` cases stay. See them fail. Write `parcel`, `mix` and `exchange`, and rebuild `transfer` on them with the same arithmetic in the same order. Run `npx nx test @nexusdi/meridian-systems --parallel=2`, `npx nx lint @nexusdi/meridian-systems --parallel=2`, `npx nx typecheck @nexusdi/meridian-systems --parallel=2`, then `npx nx run @nexusdi/meridian-systems:e2e-growth --parallel=2` (heavy) without `-u`: both G2 goldens pass byte for byte. Commit `feat(meridian-systems): exchange gas both ways through a parcel and a mix`.
- [ ] Step 2: cleanup, then the review gate.

### Task 2: the door and fire physics

Files:

- Create: `examples/meridian-systems/src/physics/doors.ts`, `src/physics/fire.ts`
- Test: `src/physics/doors.test.ts`, `src/physics/fire.test.ts`

`doors.ts` holds `DoorPlan`, `doorFractions`, `doorPressures` and `PRESSURE_INTERLOCK` (ruling 2). `fire.ts` holds `FIRE` (ignition 330 K, `lambda` 1 × 10⁻³ /s, growth 0.05, decay 0.2, out 0.01, start 0.05, burn O₂ 0.5, CO₂ 0.4, H₂O 0.2 mol/s, energy 400,000 J/mol), `FLOOD = { seconds: 10 }`, `FloodPlan`, `burns(air, volume)` and `stepFire(air, room, intensity, dt, draw, drill)` returning `{ air, intensity }` (ruling 9). Both import only from `src/physics`.

- [ ] Step 1: write `doors.test.ts`: the three `f`, `fromA` and `fromB` of the table; the bridge at 100 kPa and the habitat at 50 kPa through `bridge-habitat` for 48 ticks conserve each gas's moles to 1 × 10⁻⁹ relative and `Σ C · T` to 1 × 10⁻¹², and end within 1 % of each other; one step shrinks the molar-density gap by `1 − f` to 1 × 10⁻¹²; `doorPressures` reads `space` as 0 Pa and gives the outer door 101,300 Pa on the initial air. See them fail, write `doors.ts`. Commit `feat(meridian-systems): add the door fractions and the pressures across a door`.
- [ ] Step 2: write `fire.test.ts`: `burns` holds for the initial habitat, fails after a 2,000 mol flood (14.99 %) and at a total of 75 kPa; growth from 0.05 reaches 1 in 38 ticks and decay from 1 goes under 0.01 in 47; the 340 K habitat with a forced ignition gives the figures of the table; the same room at `φ = 1` with a flood from the next tick goes out at tick 63 ± 1; a drill lights `φ = 0.05` at 293 K where `burns` holds and a `draw` spy is never called; a drill after a 2,000 mol flood lights nothing; a room at 330 K or under draws nothing. See them fail, write `fire.ts`. Run test, lint, typecheck. Commit `feat(meridian-systems): add the fire law, the drill and the flood charges`.
- [ ] Step 3: cleanup, then the review gate.

### Task 3: the safety step

Files:

- Create: `examples/meridian-systems/src/physics/safety.ts`
- Test: `src/physics/safety.test.ts`

`safety.ts` holds the types of ruling 1, `ALARM_LIMITS` of ruling 10 and `stepSafety(input: SafetyInput<Id, Door>): SafetyStep<Id, Door>`. `SafetyInput` holds `ids` (the compartment order), `start` (`{ compartments, alarms }`), `compartments` (the phase-4 air), `rooms` (each a `RoomPlan & FloodPlan`), `doors` (`readonly DoorPlan[]`), `setpoints` (`SafetySetpoints`), `record` (the incoming `SafetyRecord`), `engineering` (`{ coolant: number; tripped: boolean; shed: readonly string[] }`), `read(id, air, tick)`, `draw()`, `tick` and `dt`. `SafetyStep` holds `compartments`, `safety` and `setpoints`. The step runs doors, fires, floods and alarms in that order.

- [ ] Step 1: write the failing `safety.test.ts` cases on hand-made inputs: an alarm per code at its raise limit and one just short of it; a value between the two limits keeps an active alarm and raises no new one, one case per row of the deadband table; the five atmosphere alarms only in occupied rooms; a `read` that throws gives `FIRE` beside `SENSOR_FAULT`; `DECOMPRESSION` shuts exactly the room's doors on every tick it stays active; the alarm list follows the order of ruling 10; a drill flag returns false lit or not; a flood finishes on its 20th tick with the valve false and `flooded` 0; with nothing acting, the returned `compartments` is the input object and `draw` is never called. See them fail. Write `safety.ts`. Run test, lint, typecheck. Commit `feat(meridian-systems): step the doors, fires and floods and evaluate the alarms`.
- [ ] Step 2: cleanup, then the review gate.

### Task 4: the interlock error

Files:

- Modify: `examples/meridian-systems/src/errors.ts`, `src/text.ts`, `src/index.ts`, `README.md` (the `MERIDIAN_INTERLOCK` anchor)
- Test: `src/errors.test.ts`, `src/text.test.ts`

- [ ] Step 1: write the failing cases: `InterlockError` carries `MERIDIAN_INTERLOCK`, its name and the fields `door`, `difference` and `limit`, and narrows through `isNexusError`; `explain(error, { text: [shipText] })` gives the message and fix of ruling 12 for `{ door: 'habitat-airlock', difference: 70585, limit: 5000 }`. Write the class, the augmentation and the text, export the class from `src/index.ts`, and add `<a id="MERIDIAN_INTERLOCK"></a>` to the README's error section. Run test, lint, typecheck. Commit `feat(meridian-systems): refuse a door with too much pressure across it`.
- [ ] Step 2: cleanup, then the review gate.

### Task 5: the kernel

Files:

- Modify: `examples/meridian-systems/deck/meridian.deck.json` (`floodCharge`), `src/simulation/contracts.ts`, `src/simulation/ship-state-store.ts`, `src/simulation/fixed-step-loop.ts`, `src/index.ts`, `e2e/golden/idle.seed-7.json`, `e2e/golden/life-support.seed-7.json`, `examples/bridge-console/tests/doubles.ts` (the typed `ShipReading` double)
- Test: `src/simulation/ship-state-store.test.ts`, `src/simulation/fixed-step-loop.test.ts`, `src/systems/engineering/engineering-physics.test.ts` and `src/systems/life-support/life-support-physics.test.ts` (their hand-written contexts gain `start`)

This task changes the snapshot every app reads. It touches no provider, so `graph.json` stays; Step 1 runs `check.test.ts` to confirm it.

- [ ] Step 1: write the failing store cases: the initial snapshot holds the records and setpoints of ruling 1; a queued `{ safety: { doors: { 'bridge-habitat': true } } }` applies with the other doors untouched; the door and charge checks of rulings 3 and 9 each throw. Write the failing loop case: `calls[0].tick.start` is the snapshot the first system got. Write the contracts, the deck fields, the store checks, the initial records and `start`, re-export `DoorPlan`, and export `DOOR_IDS`, `DoorId` and the safety types from `src/index.ts`. Give the console's typed double the new records. Run `npx nx test @nexusdi/meridian-systems --parallel=2`, its lint and typecheck, `npx nx test @nexusdi/bridge-api --parallel=2`, `npx nx typecheck @nexusdi/bridge-console --parallel=2`. Commit `feat(meridian-systems): hold the door and flood setpoints and the safety record`.
- [ ] Step 2: run `npx nx run @nexusdi/meridian-systems:e2e-growth --parallel=2 -- -u` (heavy), then without `-u`. Each golden diff adds `safety` and `setpoints.safety` only, and `tick`, `time`, `compartments`, `reactor`, `coolant`, `power` and `lifeSupport` stay byte-identical. Commit `test(meridian-systems): add the idle safety records to the goldens`.
- [ ] Step 3: cleanup, then the review gate.

### Task 6: the probe

Files:

- Create: `examples/meridian-systems/src/systems/life-support/calibrated-probe.ts`
- Modify: `src/systems/life-support/contracts.ts`, `gas-analyzer.ts`, `life-support.module.ts`, `src/meridian-systems.module.ts` (the export comment), `src/index.ts`, `examples/bridge-api/graph.json`, `examples/bridge-api/test/check.test.ts`
- Test: `src/systems/life-support/calibrated-probe.test.ts`, `gas-analyzer.test.ts`, `test/life-support.test.ts`

The probe adds a provider to LifeSupport and changes the analyzer's deps, so this commit carries `graph.json` and the `'AtmosphereProbe in LifeSupport'` note.

- [ ] Step 1: write the failing cases: `CalibratedProbe` gives the same reading as G2's analyzer for one compartment and tick; the analyzer reads through a probe double; the root reads `ATMOSPHERE_PROBE`. Write `IAtmosphereProbe`, the token, the class and the provider, export the token from `src/index.ts`, and move the analyzer onto it. Run `npx nx run @nexusdi/bridge-api:graph --parallel=2`, read the diff (the probe, the analyzer's deps), and add the note to `check.test.ts`. Run `npx nx test @nexusdi/meridian-systems --parallel=2`, its lint and typecheck, `npx nx test @nexusdi/bridge-api --parallel=2`, and `npx nx run @nexusdi/meridian-systems:e2e-growth --parallel=2` (heavy, goldens unchanged). Commit `feat(meridian-systems): share one atmosphere probe between the tick and the analyzer`.
- [ ] Step 2: cleanup, then the review gate.

### Task 7: the interceptor types

Files:

- Modify: `examples/meridian-systems/eslint.config.mjs`, `examples/meridian-systems/package.json`, the tsconfig reference `npx nx sync` writes, `package-lock.json`, `tools/repo-checks/src/meridian-purity.test.ts`

- [ ] Step 1: write the failing purity cases of ruling 4. Swap the rule, add the two patterns and `no-import-type-side-effects`, and add `@nexusdi/interceptors` to `peerDependencies` (optional) and `devDependencies`. Run `npm install` (heavy), `NX_NO_CLOUD=true NX_DAEMON=false npx nx sync`, `npx nx lint @nexusdi/meridian-systems --parallel=2`, `npx nx test @nexusdi/repo-checks --parallel=2 -- meridian-purity` and `npx nx test @nexusdi/meridian-systems --parallel=2`. Commit `build(meridian-systems): let the library import the interceptor types alone`.
- [ ] Step 2: cleanup, then the review gate.

### Task 8: the Safety classes

Files:

- Create under `examples/meridian-systems/src/systems/safety/`: `contracts.ts`, `blast-door-control.ts`, `inert-gas-suppression.ts`, `safety-commands.ts`, `safety-physics.ts`, `master-alarm.ts`, `pressure-interlock.ts`
- Modify: `examples/meridian-systems/package.json` (`./interlock`), `src/index.ts`
- Test: one `*.test.ts` beside each class

`contracts.ts` holds `IBlastDoors`, `IFireSuppression`, `IAlarmSink`, `IMasterAlarm`, `BLAST_DOORS`, `FIRE_SUPPRESSION`, `ALARM_SINKS`, `MASTER_ALARM` and `SAFETY_ACTIONS`. `SafetyPhysics` (`[DECK_PLAN, ATMOSPHERE_PROBE]`, `name = 'Safety'`, `static readonly phase = 5`) delegates to `stepSafety` with `tick.start`, `tick.rng.next` as `draw` and the probe's `read`. No module binds the classes yet, so the graph stays.

- [ ] Step 1: write the failing tests with plain doubles: `BlastDoorControl` queues `open` and `close` and refuses an unknown door; `InertGasSuppression` queues `flood` and `drill` and refuses `airlock`; `SafetyCommands` answers each refusal reason, a missing or non-string argument before the panel runs, and the `SAFETY_ACTIONS` words against `DOOR_IDS` and the deck's charges. Write the contracts and the three classes, and export the contracts and tokens from `src/index.ts`. Run test, lint, typecheck. Commit `feat(meridian-systems): add the blast doors, the fire suppression and the safety commands`.
- [ ] Step 2: write the failing tests: `SafetyPhysics` steps a ship and reads `start`; `MasterAlarm` raises and clears by diff, a throwing sink leaves the others served, and it unsubscribes on dispose. Write both classes. Run test, lint, typecheck. Commit `feat(meridian-systems): add the safety physics and the master alarm`.
- [ ] Step 3: write the failing `pressure-interlock.test.ts` with a hand-made `CallContext` and a `next` spy: an unknown door calls `next`; 5,000 Pa and 5,000.4 Pa pass; 5,001 Pa throws `InterlockError` with the rounded difference; the `space` side reads 0 Pa. Write the class and the `./interlock` entry in `package.json`. Run test, lint, typecheck, and `npx nx test @nexusdi/repo-checks --parallel=2 -- meridian-purity`. Commit `feat(meridian-systems): hold a door shut across a pressure difference`.
- [ ] Step 4: cleanup, then the review gate.

### Task 9: the Safety module

Files:

- Create: `examples/meridian-systems/src/systems/safety/safety.module.ts`, `test/safety.test.ts`
- Modify: `src/meridian-systems.module.ts`, `src/index.ts`, `test/simulation.test.ts`, `README.md` (the desk's served list), `examples/bridge-api/graph.json`, `examples/bridge-api/test/check.test.ts`, `examples/bridge-api/test/shutdown.test.ts`

The module joins the graph, so Step 1's commit carries `graph.json`, the Safety notes and the shutdown order.

- [ ] Step 1: write the failing `test/safety.test.ts` cases on `meridianSystems({ seed: 7, dt: 0.5 })`: `Nexus.check` passes; the root reads `BLAST_DOORS`, `FIRE_SUPPRESSION`, `MASTER_ALARM` and `ATMOSPHERE_PROBE`; a safety command answers through the desk. Write `safety.module.ts` (`defineModule` alone, exporting the tokens of ruling 8), import it in the aggregate after `ConfiguredLifeSupport`, re-export it, and update the export comment. Change the desk's served list in `test/simulation.test.ts` and the README. Run `npx nx run @nexusdi/bridge-api:graph --parallel=2`, read the diff (`Safety` and its providers), add the Safety notes to `check.test.ts`, and set `shutdown.test.ts`'s order to `['SimDriver', 'MasterAlarm', 'TelemetryFeed', 'ReactorCore']`. Run `npx nx test @nexusdi/meridian-systems --parallel=2`, its lint and typecheck, and `npx nx test @nexusdi/bridge-api --parallel=2`. Commit `feat(meridian-systems): run safety in phase five of the tick`.
- [ ] Step 2: add the scenario cases: with `plugins: [interceptors({ register: [PressureInterlock], bindings: [{ token: BLAST_DOORS, methods: { open: [PressureInterlock] } }] })]`, `open airlock-outer` at tick 0 throws `InterlockError` with `difference: 101300` and `open bridge-habitat` answers `{ tick: 1 }`; the decompression case of ruling 10 with no plugin (figures of the table, `MASTER_ALARM` raised at tick 2 and cleared at tick 3, the airlock raising nothing); the hot-room fire case of ruling 9; the drill and flood case of ruling 9 with throttle 0.01 and online, and a drill on the flooded habitat at tick 200 lighting nothing. Run test, lint, typecheck. Commit `test(meridian-systems): decompress the habitat and burn and flood a fire`.
- [ ] Step 3: cleanup, then the review gate.

### Task 10: the safety golden

Files:

- Create: `examples/meridian-systems/e2e/safety.e2e.ts`, `e2e/golden/safety.seed-7.json`

- [ ] Step 1: write `e2e/safety.e2e.ts` with no plugin: `engineering throttle 0.01`, `life-support online` and `pump airlock evacuate` at tick 0; `pump airlock fill` at tick 120; `pump airlock off` and `safety open habitat-airlock` at tick 189; snapshots at ticks 120, 190 and 209. Run `npx nx run @nexusdi/meridian-systems:e2e-growth --parallel=2 -- -u` (heavy), then without `-u`. Check the golden against the table's figures to four digits and that it holds no alarm. Commit `test(meridian-systems): pin an airlock cycle through an open door to a golden`.
- [ ] Step 2: cleanup, then the review gate.

### Task 11: the flight recorder and the interlock in `bridge-api`

Files:

- Modify: `examples/bridge-api/src/bridge/refusal.ts`, `src/bridge/commands.ts`, `src/ship/contracts.ts`, `src/ship/plugins.ts`, `src/ship-from-env.ts`, `src/hono.ts`, `src/express.ts`, `src/fastify.ts`, `src/server.hono.ts`, `src/server.express.ts`, `src/server.fastify.ts`, `src/worker.offline.ts`, `graph.json`, `e2e/growth/ship.ts` (`withShip` passes `nodeScopes()`)
- Create: `test/flight-recorder.test.ts`
- Test: `test/commands.test.ts`, `test/routes.test.ts`, `test/check.test.ts`, `test/ship-from-env.test.ts`

- [ ] Step 1: write the failing `commands.test.ts` case: `refusalOf` over an `InterlockError` gives the text of ruling 12, read through `SHIP_TEXT`. Write `SHIP_TEXT` and register `errors({ text: SHIP_TEXT })` in the dev branch of `bridgePlugins`. Run `npx nx test @nexusdi/bridge-api --parallel=2`; if `graph.json` moves, regenerate it in this commit. Commit `feat(bridge-api): word the interlock and interceptor errors from one text list`.
- [ ] Step 2: write the failing tests: `flight-recorder.test.ts` of ruling 6 (inside `scopes.run(scope, ...)`, `open airlock-outer` at tick 0 throws `InterlockError` and `scope.get(FLIGHT_LOG).entries()` is `[]`; `open bridge-habitat` then leaves `['survey-7: opened bridge-habitat']`); `answerCommand` answers `{ tick }` for an empty log and `{ tick, flightLog }` otherwise, and 409 for `MERIDIAN_INTERLOCK`; per framework on a ship with `bridgePlugins({ scopes })` and a bridge with the same `scopes`, `open bridge-habitat` at tick 0 answers 202 `{ tick: 1, flightLog: ['survey-7: opened bridge-habitat'] }` and `survey-9: …` under `x-mission-id: survey-9`, the same without `scopes` answers `{ tick: 1 }`, `open airlock-outer` answers 409 with the code, the message for 101,300 Pa and the fix, and `close airlock-outer` answers `{ tick: 1, flightLog: ['survey-7: closed airlock-outer'] }`. Write `REQUEST_SCOPES`, `FlightRecorder`, the registration, `shipFromEnv(scopes)`, the entries and the three routes. Run `npx nx run @nexusdi/bridge-api:graph --parallel=2`, read the diff (`FlightRecorder`, `PressureInterlock`, `RequestScopes`). Run `npx nx test @nexusdi/bridge-api --parallel=2`, typecheck, lint, and `npx nx run @nexusdi/bridge-api:e2e --parallel=2` (heavy): every existing case passes unchanged. Commit `feat(bridge-api): record each door command in the request's flight log`.
- [ ] Step 3: cleanup, then the review gate.

### Task 12: the alarm panel and the safety route cases

Files:

- Create: `examples/bridge-api/src/ship/alarm-panel.module.ts`, `test/alarms.test.ts`
- Modify: `src/ship/meridian.ts`, `src/ship/index.ts`, `graph.json`, `test/check.test.ts` (`'AlarmPanel'` in `bridgeModules`), `test/doubles.ts` (`FailingProbe`, `MemoryAlarmSink`), `test/routes.test.ts`

- [ ] Step 1: write the failing `alarms.test.ts`: a root `AlarmTestShip` imports `OfflineMeridian` and a global module that exports `MemoryAlarmSink` under `ALARM_SINKS`; `nexusTest(base, AlarmTestShip, { create: { plugins: bridgePlugins() } })`; the suite runs `test.override('nexusSetup', [(b) => b.override(ATMOSPHERE_PROBE, { useClass: FailingProbe })])`. After ten ticks `MemoryAlarmSink` heard four raises, `SENSOR_FAULT` for each compartment at tick 1, and no clear; `AUDIT_LOG.calls` holds the four matching lines; `MASTER_ALARM.active()` holds the four; `GET /compartments/habitat/atmosphere` answers an empty 500. Write `AlarmPanel` and `AuditAlarmSink`, and import the panel in `meridian()` and `offlineMeridian()`. Run `npx nx run @nexusdi/bridge-api:graph --parallel=2`, read the diff (`AlarmPanel`, its sink), and add `'AlarmPanel'` to `bridgeModules`. Run `npx nx test @nexusdi/bridge-api --parallel=2`, typecheck, lint. Commit `feat(bridge-api): hear every alarm in the audit log from a global alarm panel`.
- [ ] Step 2: write the per-framework route cases of ruling 13: `open` with `door: 'galley'` answers 400 `MERIDIAN_BAD_COMMAND` with the message naming the doors; `flood airlock` and `drill airlock` answer 400 `MERIDIAN_BAD_COMMAND`, reason `argument`; `drill habitat` at tick 0 answers 202 `{ tick: 1 }` with no `flightLog`; `GET /sim` at tick 0 shows `safety.alarms` `[]`, the four doors false and `drills` false for the three charged rooms; the empty 404 for an unmatched path stays. Run test, typecheck, lint. Commit `test(bridge-api): answer the safety commands on each framework`.
- [ ] Step 3: cleanup, then the review gate.

### Task 13: `bridge-api`'s safety growth cases

Files:

- Create: `examples/bridge-api/e2e/growth/safety.e2e.ts`

- [ ] Step 1: on Hono, Express and Fastify, a fresh manual `offlineMeridian(...)` on seed 7 for each case. The door case: post `engineering throttle 0.01`, `life-support online` and `pump airlock evacuate` (each 202 `{ tick: 1 }`); advance 120; `open habitat-airlock` answers 409 with "The habitat-airlock door holds 70,585 Pa of difference, above the 5,000 Pa interlock." and the fix; `pump airlock fill` answers `{ tick: 121 }`; advance 68, and `open habitat-airlock` answers 409 with 5,323 Pa; advance 1; `open habitat-airlock` answers 202 `{ tick: 190, flightLog: ['survey-7: opened habitat-airlock'] }` and `pump airlock off` `{ tick: 190 }`; advance 20 to tick 209, and `GET /sim` holds the door open, the habitat and airlock pressures within 200 Pa of each other and no alarm, and `GET /commands` holds `{ tick: 190, change: { lifeSupport: { pumps: { airlock: 'off' } }, safety: { doors: { 'habitat-airlock': true } } } }`; `close habitat-airlock` with `x-mission-id: survey-9` answers `{ tick: 210, flightLog: ['survey-9: closed habitat-airlock'] }`. The drill case: post throttle 0.01, `online` and `safety drill habitat` (each `{ tick: 1 }`); advance 1, and `GET /sim` holds `fires.habitat` 0.05, `alarms` `[{ code: 'FIRE', subject: 'habitat' }]` and `drills.habitat` false; advance 59; `safety flood habitat` answers `{ tick: 61 }`; advance 70, and `GET /sim` holds `fires.habitat` 0, no alarm, the valve false and the habitat from 142,000 to 143,500 Pa. Run `npx nx run @nexusdi/bridge-api:e2e-growth --parallel=2` (heavy, needs the pinned Deno and Bun on `PATH`). Commit `test(bridge-api): cycle the airlock door and put out a drill fire in a growth case`.
- [ ] Step 2: cleanup, then the review gate.

### Task 14: the console's safety page

Files:

- Create: `examples/bridge-console/app/routes/systems/safety.tsx`
- Modify: `app/bridge/bridge-link.ts` (`CommandAnswer`), `app/routes/systems/system-page.tsx` (`LastAnswer`), `app/routes.ts`, `app/routes/ship-layout.tsx` (the nav link)
- Test: `tests/bridge-link.test.ts`, `tests/routes/system-page.spec.tsx`, `tests/doubles.ts` (`fakeBridgeLink`), `tests/routes/safety.spec.tsx`

- [ ] Step 1: write the failing tests: `CommandAnswer`'s accepted branch carries `flightLog` only when the body has it, so the G1 and G2 `toEqual` cases hold; `LastAnswer` prints one line per entry under `Queued for tick N`. Write both. Run `npx nx test @nexusdi/bridge-console --parallel=2`, typecheck and lint. Commit `feat(bridge-console): show the flight log a command recorded`.
- [ ] Step 2: write the failing `safety.spec.tsx` on seed 7's unrounded floats: the Alarms section lists each `<code> in <subject>` or "No alarms"; the Doors section shows each door Open or Shut and each side's pressure to 0.1 kPa, `space` as 0.0 kPa; the Fire suppression section shows per charged room the fire intensity to two decimals ("none" at 0), the flood released in whole mol and the temperature in whole K; the door select posts `command=open|close` from "Open door" and "Close door"; the room select posts `command=flood|drill` from "Flood" and "Drill"; the refusal shows its message and `Fix:` line, and an accepted door command its flight-log line. Write the page on `SystemPage` and `systemAction('safety', { door: 'text', compartment: 'text' })`, its loader reading `snapshot()` alone, the static route and the nav link. Run test, typecheck, lint. Commit `feat(bridge-console): add the safety page`.
- [ ] Step 3: cleanup, then the review gate.

### Task 15: the console's growth case

Files:

- Create: `examples/bridge-console/e2e/growth/safety.spec.ts`
- Modify: `playwright.e2e-growth.config.mts`

- [ ] Step 1: add a third project `safety` with `dependencies: ['life-support']`, and change the `chromium` project's `testIgnore` to `/(life-support|safety)\.spec\.ts/`. The case starts from the current tick: open `bridge-habitat` reads `Queued for tick <t + 1>` and `survey-7: opened bridge-habitat`; open `airlock-outer` shows `/^The airlock-outer door holds [\d,]+ Pa of difference, above the 5,000 Pa interlock\.$/` and the exact `Fix:` line; close `bridge-habitat` reads `survey-7: closed bridge-habitat`, and after one backend tick the page shows `bridge-habitat` Shut; drill `reactor-bay` reads `Queued for tick <t + 1>`, and after one backend tick the Alarms section reads `FIRE in reactor-bay`; flood `reactor-bay` reads `Queued for tick <t' + 1>`, and after 70 backend ticks the Alarms section reads "No alarms". It asserts no console error. Run `npx nx run @nexusdi/bridge-console:e2e-growth --parallel=2` and `npx nx run @nexusdi/bridge-console:e2e --parallel=2` (heavy). Commit `test(bridge-console): work the doors and put out a bay fire in a growth case`.
- [ ] Step 2: cleanup, then the review gate.

### Task 16: READMEs

Files:

- Modify: `examples/meridian-systems/README.md`, `examples/bridge-api/README.md`, `examples/bridge-console/README.md`

- [ ] Step 1: the library README gains a Safety section that names the module, the doors and their interlock behind `./interlock` with the optional-peer sentence of ruling 4, `ATMOSPHERE_PROBE`, `MASTER_ALARM` and `ALARM_SINKS` with the global-module rule, the commands with the drill first, and the physics after (the exchange, the fire and suppression laws, the deadband, the idle step). It gains the sentence of ruling 12: `errors()` words core's and the interceptors' errors, and `refusalOf` words every `MERIDIAN_*` refusal. Commit `docs(meridian-systems): describe the safety module`.
- [ ] Step 2: `bridge-api`'s README gains the `POST /commands` row of ruling 13, `FlightRecorder`, `REQUEST_SCOPES` and the entries that pass `nodeScopes()`, the sentence that `worker.ts` answers `{ tick }`, `AlarmPanel`, the new tests and the growth cases. It says that Express routes match case-sensitively and strictly, as G2 made all three frameworks match, that every framework answers an unmatched path with an empty 404, and the route table gains an "any unmatched path" row. Commit `docs(bridge-api): document the flight log and the alarm panel`.
- [ ] Step 3: the console's README gains `/systems/safety` and the third growth project. Run `npx prettier --check` on the three files and the README doctests if a README gains a `ts` block. Commit `docs(bridge-console): document the safety page`.
- [ ] Step 4: cleanup, then the review gate.

### Task 17: the spec and the G2 plan

Files:

- Modify: `specs/2026-10-21-meridian-ship-systems-design.md`, `specs/plans/2026-10-21-meridian-g2-lifesupport.md`

- [ ] Step 1: amend the spec with rulings 1 to 14: §3.2 and §3.3 (Safety's exports without `ALARM_SINKS`, no `TelemetryAlarmSink`, `AuditAlarmSink` in `bridge-api`'s global `AlarmPanel`, rows for `IAtmosphereProbe`, `PressureInterlock` at `@nexusdi/meridian-systems/interlock`, `SafetyPhysics` and `SafetyCommands`, `IFireSuppression` with `flood` and `drill`, `GasAnalyzer`'s deps); §4.1 (`safety`, `setpoints.safety`, `TickContext.start`); §4.2 (doors in phase 5); §5.2 (`Q_fire` enters in phase 5); §5.5 (the two-way exchange and its energy term); §5.10 (the suppression law, the flood charges, no room reaches 330 K, the drill in two sentences, the vent sentence goes); §5.11 (the deadband table, `FIRE` as `φ > 0`, occupied rooms for the five atmosphere alarms, the read pair, the doors shut through the setpoints); §6 rows (request scopes, the dispose order, the testing row, `errors()` text); §6.1 (ruling 4's code and registration); §6.4 (`InterlockError`'s fields and text, and "Its one optional dependency, `@nexusdi/interceptors`, is a type import behind the `./interlock` subpath (P5)"); §7.1 (the `POST /commands` row); §8.3 ("the door opens at tick 190"); §13 (the DECOMPRESSION item settled, G4 inherits the occupied-only rule); §15 (one row per ruling, "tech lead, G3 ruling N"). Commit `docs(specs): record the g3 rulings in the ship systems spec`.
- [ ] Step 2: in the G2 plan, ruling 7 says the mappers pass `c.req.path`. Change it to say the Hono mapper passes `new URL(c.req.url).pathname`, since `c.req.path` decodes percent escapes, and Express and Fastify pass `req.path` and `req.url`. Run `npx prettier --check` on both files. Commit `docs(specs): name the pathname the hono mapper reads in the g2 plan`.
- [ ] Step 3: cleanup, then the review gate.

### Task 18: the gate and the PR

- [ ] Step 1: run the full gate (heavy): `npx nx run-many -t lint test build typecheck --parallel=2`, `npx nx run @nexusdi/bridge-api:e2e --parallel=2`, `npx nx run @nexusdi/bridge-console:e2e --parallel=2`, every `e2e-growth` target with the pinned Deno 2.9.6 and Bun 1.4.2 on `PATH` (`npx nx run-many -t e2e-growth --projects=tag:demo --parallel=2`), `npx nx run @nexusdi/bridge-api:graph --parallel=2` with no diff, `npx fallow dead-code --fail-on-issues`, `npx fallow dupes` (the figure stays at 2.2 % or under, and no commit raises the threshold in `.fallowrc.jsonc`) and `npx prettier --check .`. Then cleanup.
- [ ] Step 2: the final branch review by an independent opus reviewer; fix rounds in `fixup!` commits until it approves.
- [ ] Step 3: fold the fixups with `GIT_SEQUENCE_EDITOR=: NX_NO_CLOUD=true NX_DAEMON=false git rebase -i --autosquash origin/release/0.4`. Then check every commit on its own (heavy): `NX_NO_CLOUD=true NX_DAEMON=false git rebase origin/release/0.4 -x 'NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/meridian-systems --parallel=2 --skip-nx-cache && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/bridge-api --parallel=2 --skip-nx-cache -- test/check.test.ts'`. A commit that fails gets its fix folded into it, and the step reruns. Check `git rev-list --count origin/release/0.4..HEAD` is 100 or fewer.
- [ ] Step 4: if `origin/release/0.4` moved, rebase onto it and rerun the graph, the gate and Step 3. Push with `NX_NO_CLOUD=true NX_DAEMON=false git push -u origin feat/meridian-g3-safety`, and open the PR against `release/0.4`. The body lists the rulings and ends with the Claude Code line. Wait for CI, fix any CodeQL alert, and report the PR number and the result.
