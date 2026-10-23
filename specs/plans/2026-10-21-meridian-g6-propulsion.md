# Meridian G6, Propulsion and Helm in the Library: Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Ledger: `.superpowers/sdd/meridian-g6/progress.md` in the main checkout.

Goal: the Starship Meridian gets its main drive and its helm. `Propulsion` and `Helm` join `@nexusdi/meridian-systems` as two modules in phase 2. The snapshot gains `drive` (thrust, mass flow, acceleration, velocity, distance) and `helm` (attitude, rate, torque), the setpoints gain `drive.throttle` and `helm.heading`, and the router gains two loads: `thrusters` (20 MW at full torque, priority 4) and `main-drive` (600 MW at full throttle, priority 5). The crew steers with the new command `helm course` and burns with `helm burn`. The helm turns the ship with a clamped PD law and settles on the course. The drive pushes along the attitude and the ship moves along the track. G6 adds no route. It adds the pure physics in `src/physics/motion.ts`, a library module test and a golden, a gating route case on each of the three frameworks, a sixth runtime case, the console's `/systems/helm` page with its growth case, the G5 review leftovers, and the spec and README text for all of it.

Architecture: one pull request, `feat/meridian-g6-propulsion`, cut from `release/0.4` at `ee67ae90` (G0 to G5 merged). The library gains `src/physics/motion.ts`, `src/systems/propulsion/` and `src/systems/helm/`, and `meridianSystems()` imports and re-exports `Propulsion` and `Helm` after the tactical module. `bridge-api` gains test cases only. The console gains the helm page on the shared system-page parts with a shared `LevelForm`, and a sixth growth project. The federation shell and the docs do not change.

Tech stack: Node from `.nvmrc` (24.20.0), TypeScript 6.0.3, Vitest 5.0.5, Nx 23.3.0, Hono 4.13.13, Express 5.3.0, Fastify 5.12.7, React Router 8.4.0, Playwright 1.64, Deno 2.9.6, Bun 1.4.2.

Spec: `specs/2026-10-21-meridian-ship-systems-design.md` (§ below). Earlier plans: `specs/plans/2026-10-21-meridian-g0-kernel.md`, `-g0b-telemetry.md`, `-g1-engineering.md`, `-g2-lifesupport.md`, `-g3-safety.md`, `-g4-airlock.md`, `-g5-comms.md`. Also the `nexusdi-ways-of-working` skill.

## Owner rulings

1. Earlier e2e test bodies and earlier goldens stay unchanged, and a golden may only gain lines. Four enumerating unit assertions grow with the ship under the condition of ruling 12.
2. Console gauges show SI units: K as whole numbers, kPa, Pa, mol and W, plus m/s, m/s², N, N·m and kg/s for the drive and the helm. Angles read as ruling 16 rules.
3. Deterministic checks gate the growth track: the unit tests, `check.test.ts`'s graph check and the purity checks run in `main`, and `e2e-growth` never gates.
4. The rule of three applies everywhere except lists of figures or ids. No absolute local path and no vault path appears in a committed file.
5. The duplication limit is `.fallowrc.jsonc`'s 2.25 %. The branch aims at 2.15 % or less and never raises the limit.
6. The branch stays at 100 commits or fewer, the limit of GitHub's rebase merge.
7. No hook is bypassed in any way: no `HUSKY=0`, no `--no-verify`, no `git commit-tree`, no `git update-ref` on a commit, no `-c core.hooksPath`. An `amend!` fixup carries the full message, the subject line included.

## Rulings this plan carries

The architect proposed and the tech lead decided these on 2026-10-23. The tech lead's text overrides the architect's, and the numbering below is the tech lead's. The full text and the node scripts behind each figure sit in the session scratchpad's `meridian-g6/` folder (`architect.md`, `rulings.md`, the `arch-*` and `tl-*` scripts and their logs). Task 9 writes them into the spec, each as "tech lead, G6 ruling N".

1. Phase-2 order. `FixedStepLoop` sorts a phase by `name`, so `Helm` steps before `Propulsion`, and a rename would move the figures with no test naming the cause. The rule: systems that share a phase read each other's records from `TickContext.start`, the snapshot `applyQueued` returned, so their order changes no figure. `PropulsionPhysics` reads `start.helm.attitude`, and `HelmPhysics` reads its own `ship.helm`, which no other system writes. §4.2's table keeps "`Propulsion`, `Helm`" and gains the sentence of ruling 18. `propulsion-physics.test.ts` pins the rule with a ship whose `helm.attitude` differs from `start.helm.attitude`. The thrust direction lags the attitude by one tick during a turn, so the golden scenario's figures move in the fourth digit (numbers section). The aligned burn, the runtime case, the route case and the console's reads do not move. The tech lead rejects a phase of its own for Propulsion: it renumbers every later phase and redraws `check.test.ts`'s `phase: 6` note and `graph.json` for no gain.
2. Units, the course and the settle. The charts hold degrees (`deck/charts.json`: Kepler-442b 42, Proxima-b 117, TRAPPIST-1e 203), and the PD law and `wrap` run in radians. The helm converts once, at the command: `θ_course = wrap(heading · π / 180)`, which gives 0.7330382858376184, 2.0420352248333655 and −2.7401669256310974 rad, and `toRadians(180) === Math.PI`. `wrap(x) = x − 2π · ceil((x − π) / 2π)` maps to (−π, π]: `wrap(π)`, `wrap(−π)` and `wrap(±3π)` are π, and `wrap(2π)` is 0. One setpoint, `setpoints.helm.heading` in rad, holds `θ_set` and `θ_course`. The law: `e = wrap(θ_set − θ)`, `τ = clamp(I · (ω_n² · e − 2 · ζ · ω_n · ω), −τ_max, τ_max)`, 0 on a tick the router shed the thrusters, `ω' = ω + τ / I · dt`, `θ' = wrap(θ + ω' · dt)`. The settle: when `|wrap(θ_set − θ)| < 1e-6` rad and `|ω| < 1e-6` rad/s at the start of a tick, the helm holds `θ = θ_set`, `ω = 0`, `τ = 0`. Without it the 42° turn's record last changes at tick 2,272 with a torque of 2.0 × 10⁻²³ N·m. The snap moves the ship 9.94 × 10⁻⁷ rad at tick 687, under the four significant digits every reading shows, and it makes `θ − θ_course` exactly 0. `stepHelm` returns the record it got whenever the step changes no field, a shed tick at rest included, as `stepComms` does. The ratings split: `RCS_THRUSTERS = { maxTorque: 5e6, power: 20e6 }` is hardware a test swaps behind `THRUSTERS`, `HELM_TUNING = { naturalFrequency: 0.05, damping: 1 }` and `HELM_SETTLE = { angle: 1e-6, rate: 1e-6 }` are the helm's control law and sit beside it in `motion.ts`, `HULL = { mass: 4.0e6, inertia: 3.3e9 }` and `PLASMA_DRIVE = { efficiency: 0.6, exhaust: 50_000, power: 600e6 }`. Rejected: no settle (sub-attowatt loads in every snapshot) and a minimum torque (a limit cycle in the golden). A 10⁻⁴ rad window is rejected too, since it snaps by 0.006°.
3. Determinism. `Math.cos` differs by one ulp between Node 24.20.0, Deno 2.9.6 and Bun 1.4.2 on about 3 % of angles (606, 841 and 853 of 20,000 seeded angles in (−π, π] for the three pairs). The helm uses `+ − · /`, `ceil`, `abs` and compares, which ECMA-262 fixes bit for bit, and the drive calls `cos(attitude − course)`, which is exactly `cos(0)` once the start-of-tick helm has settled. `Math.cos(±0)` is 1 by the specification. The coolant step uses `t ** 4`, which no rule fixes, and predates G6. What each check reads:

   | Check                                     | Engines                | What it reads                                                                   |
   | ----------------------------------------- | ---------------------- | ------------------------------------------------------------------------------- |
   | the goldens (`e2e-growth`, `.nvmrc` Node) | one Node               | the off-axis burn during the turn, rounded                                      |
   | `test/helm.test.ts`, gating               | Node                   | the off-axis burn to 1 × 10⁻⁶ and 1 × 10⁻⁴, the aligned burn exact to 1 × 10⁻¹² |
   | the route case, gating                    | Node, three frameworks | ticks 1 and 2: integers and basic-arithmetic values, the drive unpowered        |
   | the runtime case `courseAndBurn`          | six runtimes           | the settled helm at tick 800, then the aligned burn exact                       |
   | the console's growth case                 | a Node backend         | the settled helm and the aligned burn                                           |

   A burn during a turn never reaches a cross-engine check. The runtime case reads the settled helm at tick 800 before it posts the burn. The settle falls at tick 697 in that case (course applied at tick 11), 104 ticks of margin. The probe of the golden scenario printed the same drive records on all four engine builds (FNV-1a `d244e6e0` over 1,200 ticks), which is evidence and gates nothing.

4. Records and setpoints. `ShipSnapshot` gains `drive: DriveRecord` and `helm: HelmRecord`, in that order after `comms`, and `Setpoints` gains `drive: DriveSetpoints` and `helm: HelmSetpoints` after `comms`. `DriveRecord` holds `thrust` (N), `massFlow` (kg/s), `acceleration` (m/s²), `velocity` (m/s) and `distance` (m, since tick 0). `HelmRecord` holds `attitude` (rad, in (−π, π]), `rate` (rad/s) and `torque` (N·m). `DriveSetpoints` holds `throttle` (0 to 1) and `HelmSetpoints` holds `heading` (rad). The store starts them at zero and freezes every level, and the keys sit before `safety`, so every committed golden only gains lines. `ship-state-store.test.ts:574-578` keeps reading `comms` right after `lifeSupport`. Each physics class returns the ship it got when its step returns the record it got.
5. What phase 2 computes. Helm, pure `stepHelm(helm, setpoints, { dt, shed }, thrusters, hull)`, as ruling 2 gives it. Propulsion, pure `stepDrive(drive, { power, attitude, course, dt }, rating, hull)` with `attitude` the start of the tick's: `P_d` is the main-drive load's allocation this tick (0 when shed), `F = 2 · η_d · P_d / v_e`, `ṁ = F / v_e`, `a = F · cos(attitude − course) / M`, `v' = v + a · dt`, `s' = s + v' · dt`. With `F = 0` the step computes no cosine, a record at rest comes back as the record it got, and a moving ship coasts (`a = 0`, `s` grows). `M` stays 4.0 × 10⁶ kg: a 600 MW burn spends 0.288 kg/s, 86.4 kg in 300 s (0.0022 % of `M`).
6. A new course keeps `v` and `s`. The model has one dimension (§12 of the architect), and `v` and `s` read as the speed and the distance along the ship's track since tick 0. A reset would remove momentum no force removed, and a projection would remove a cross-track part the model cannot hold. The README and §5.8 say "along the track".
7. Power. Two loads join `POWER_CONSUMERS`, each drawn from the snapshot at the start of the tick: `THRUSTERS_LOAD = { id: 'thrusters', priority: 4, heatShare: 0 }` with `thrustersDemand = 20 MW · |τ| / τ_max` from the PD law on the start-of-tick helm and 0 W when settled, and `MAIN_DRIVE_LOAD = { id: 'main-drive', priority: 5, heatShare: 0.4 }` with `driveDemand = throttle · 600 MW`. Phase 1 does not touch the helm, so the torque the router prices is the torque phase 2 applies. A shed tick applies no torque and no thrust. The tick-0 record lists both at 0 W after `comms`, and a 0 W load fits any remainder, so the five replays equal the committed goldens with the G6 fields stripped. The reactor figures: priorities 1 to 5 at full take 825,068,570 W and leave 384,931,430 W; the drive alone needs the reactor at 0.4959, and the drive with full thrusters, life support and comms needs 0.5166; a turn at full torque needs 0.01653 (20 MW of 1.21 GW) and 0.02072 beside life support at full and comms. `PowerBudgetError` keeps its text and its `available`: with a burn and a course queued at throttle 1, a raise of the shields at tick 16 answers `consumer: 'shields'`, `demand: 200,000,000`, `available: 193,600,000`, and a raise at tick 17 queues for tick 18. The coolant equilibria: 1,185.6 K at full output with no load, 1,191.7 K with the shields, 1,214.0 K with the drive alone, 1,219.6 K with the shields and the drive at full, 1,084.2 K at level 0.6 with the drive. All stay under the 1,350 K alarm. Throttle 0.01 gives 12.1 MW, so the router sheds a saturated turn's 20 MW on every tick, the helm never moves and Safety holds `LOAD_SHED thrusters`. The unclamped demand is `4 · |τ|` W, so at 0.01 a course change under about 21° turns and a larger one waits on the reactor. The README and the console's growth case say a turn needs the reactor above 0.0165, and the growth case raises the throttle first. No helm command diverts: a burn on a cold reactor queues, the router sheds `main-drive`, and Safety raises `LOAD_SHED main-drive` until the reactor gives 600 MW (a burn at tick 0 sheds through tick 52 after a throttle of 0.6 queued at tick 4). Rejected: `PlasmaDrive.throttle()` through `POWER_ROUTER.divert()`, which adds `POWER_ROUTER` to a class §3.3 gives `[SHIP_STATE]` and stops a pilot from queueing a burn for the tick the reactor gets there.
8. Commands. G6 adds one handler, `HelmCommands` (`COMMAND_HANDLERS`, deps `[HELM]`), serving `helm`: `course` with a string `to`, and `burn` with a finite `level` from 0 to 1. `HELM_ACTIONS` reads "course with a charted star to steer for and burn with a level from 0 to 1". Refusals: `helm warp` answers "helm has no action 'warp'. It takes course with a charted star to steer for and burn with a level from 0 to 1." with the fix "send one of the actions above with its arguments."; a `burn` level of 2 or none, and a `course` with no string `to`, answer "helm burn got an argument it cannot use. It takes …" or "helm course got …" with the fix "send the arguments in the ranges above.". The desk's list becomes "comms, engineering, helm, life-support and safety". `levelArgument(command, name, refuse)` joins `src/simulation/command-arguments.ts` beside `textArgument` and `flagArgument`; `EngineeringCommands` reads `throttle`'s level through it and `HelmCommands` reads `burn`'s, so the range check exists once, and `engineering-commands.test.ts` passes unchanged. `HelmControl` plots at the command. A plot in the tick would call `NavAudit` on every tick and fill `AUDIT_LOG`. The audit records `has Kepler-442b` and `plot Kepler-442b` on the fixture's ship and nothing on the offline graph, whose charts are a value. `INavCharts` gains `has(to)`, and `HelmControl.course` throws `BadCommandError` with reason `argument` for a star the charts do not hold, before it plots, so a course to Vega, `constructor` or `__proto__` answers "helm course got an argument it cannot use. It takes …" (ruling 23). `plot` keeps heading 0 for such a star. Left out: an attitude command apart from the course (a flip-and-burn), a `propulsion` system of its own, a target distance and an arrival, and a propellant tank. §3.3 gives `HelmControl` the deps `[THRUSTERS, MAIN_DRIVE, NAV_CHARTS]`, so the commands go to `helm`, and `Propulsion` binds no handler.
9. Modules, tokens and files.

   ```text
   src/physics/motion.ts                        HullRating, HULL, DriveRating, PLASMA_DRIVE, ThrusterRating,
                                                RCS_THRUSTERS, HELM_TUNING, HELM_SETTLE, MAIN_DRIVE_LOAD,
                                                THRUSTERS_LOAD, the four record types, wrap, toRadians, thrust,
                                                helmTorque, thrustersDemand, stepHelm, driveDemand, stepDrive
   src/systems/propulsion/contracts.ts          IMainDrive, MAIN_DRIVE
   src/systems/propulsion/plasma-drive.ts       PlasmaDrive
   src/systems/propulsion/propulsion-physics.ts PropulsionPhysics, phase 2
   src/systems/propulsion/propulsion-power.ts   PropulsionPower
   src/systems/propulsion/propulsion.module.ts  Propulsion
   src/systems/helm/contracts.ts                IThrusters, THRUSTERS, IHelm, HELM, HELM_ACTIONS
   src/systems/helm/rcs-thrusters.ts            RcsThrusters
   src/systems/helm/helm-control.ts             HelmControl
   src/systems/helm/helm-physics.ts             HelmPhysics, phase 2
   src/systems/helm/helm-power.ts               HelmPower
   src/systems/helm/helm-commands.ts            HelmCommands
   src/systems/helm/helm.module.ts              Helm
   ```

   `motion.ts` imports `./power` for `PowerLoad` and nothing from `@nexusdi/*`. Each class has its test beside it. Every binding is a singleton with `useClass`:

   | Interface         | Token / contribution | Class               | Deps                                  |
   | ----------------- | -------------------- | ------------------- | ------------------------------------- |
   | `IMainDrive`      | `MAIN_DRIVE`         | `PlasmaDrive`       | `[SHIP_STATE]`                        |
   | `IThrusters`      | `THRUSTERS`          | `RcsThrusters`      | `[SHIP_STATE]`                        |
   | `IHelm`           | `HELM`               | `HelmControl`       | `[THRUSTERS, MAIN_DRIVE, NAV_CHARTS]` |
   | `IShipSystem`     | Helm's contribution  | `HelmPhysics`       | `[THRUSTERS]`                         |
   | `IShipSystem`     | Propulsion's         | `PropulsionPhysics` | `[MAIN_DRIVE]`                        |
   | `IPowerConsumer`  | Helm's contribution  | `HelmPower`         | `[THRUSTERS]`                         |
   | `IPowerConsumer`  | Propulsion's         | `PropulsionPower`   | `[MAIN_DRIVE]`                        |
   | `ICommandHandler` | Helm's contribution  | `HelmCommands`      | `[HELM]`                              |

   `IMainDrive` has `rating: DriveRating` and `throttle(level): QueuedCommand`, which queues `{ drive: { throttle: level } }`. `IThrusters` has `rating: ThrusterRating` and `steer(heading): QueuedCommand`, which queues `{ helm: { heading } }` wrapped to (−π, π]. `IHelm` has `course(to)`, which plots on `NAV_CHARTS` and steers `wrap(heading · π / 180)`, and `burn(level)`. Tokens: `MAIN_DRIVE` is `'MainDrive'`, `THRUSTERS` is `'Thrusters'`, `HELM` is `'Helm'`. The physics and power classes read the ratings through `rating`, as `EngineeringPhysics` reads the reactor's, so a test swaps a rating behind the token. Controllers hold no physics. `Propulsion` provides `MAIN_DRIVE`, `PropulsionPhysics` (`SHIP_SYSTEMS`) and `PropulsionPower` (`POWER_CONSUMERS`) and exports the three tokens. `Helm` provides `THRUSTERS`, `HELM`, `HelmPhysics`, `HelmPower` and `HelmCommands` and exports all five tokens. `HelmControl` reads `MAIN_DRIVE` and `NAV_CHARTS` through the global `MeridianSystems`, which re-exports `Propulsion` and the tactical module, as every cross-system read in the library does. `Helm` alone, or beside `Propulsion` in a root that is not global, fails `Nexus.check` with `NEXUS_BLUEPRINT_INVALID` (`NEXUS_MISSING_PROVIDER` for `MainDrive` and `NavCharts`), and `Propulsion` alone passes, so the index exports no module object. An import of `Propulsion` into `Helm` is rejected: it would re-export Propulsion's `SHIP_SYSTEMS` contribution through `Helm`, and `NAV_CHARTS` would still come through the aggregate. The aggregate grows from 91 to about 97 lines, under the 120-line limit. The index gains `MAIN_DRIVE`, `THRUSTERS`, `HELM` and the types `IMainDrive`, `IThrusters`, `IHelm`, `DriveRecord`, `DriveSetpoints`, `HelmRecord`, `HelmSetpoints`; `npx fallow dead-code --fail-on-issues` settles any of them nothing imports. G6 removes no export. P1 to P5 hold: the modules join through `SHIP_SYSTEMS`, `POWER_CONSUMERS` and `COMMAND_HANDLERS` (P2, P3), `HelmControl` reads `NAV_CHARTS` through the library's own token (P1), `levelArgument` moves a check into the shared helper file (P4) and G6 adds no dependency (P5).

10. The ship notes and the graph. `check.test.ts`'s notes case gains `ShipSystems in Helm` and `ShipSystems in Propulsion` with `['system: <module>', 'phase: 2']`; `Thrusters`, `Helm`, `PowerConsumers` and `CommandHandlers in Helm` with `['system: Helm']`; `MainDrive` and `PowerConsumers in Propulsion` with `['system: Propulsion']`. Its existing assertions stay and `bridgeModules` keeps four modules. `graph.json` redraws in the wiring commit alone: `MeridianSystems` imports `Propulsion` and `Helm` after `OfflineTactical` (on the drawn `Meridian`, after `Tactical`), and the two modules bring eight providers. The profiles stay: the offline root awaits `LifeSupportOptions` alone, and the relay root with `LoopbackLink` awaits `LifeSupportOptions` at level 0 and `NavCharts` at level 1, `HelmControl` in neither. `test/profile.test.ts` and `test/shutdown.test.ts` stay byte-identical.
11. Library tests and the golden. `motion.test.ts` asserts the 180° turn reaches 1° at 164.5 s (under 180 s) with 0° of overshoot and not before 86.3 s, and settles at tick 786 and not before 91.1 s, the bang-bang time `2√(π I / τ_max)`, so §8.1's "no turn completes in under 91 s" stays true. 86.27 s is the moment the time-optimal 180° turn passes within 1°, so it bounds the crossing of any turn from rest that ends at 180° with no overshoot. The golden scenario's figures that move with ruling 1: tick 50 acceleration 0.003188247 (to 1 × 10⁻⁶), tick 1,200 velocity 2.0652 m/s and distance 592.98 m (to 1 × 10⁻⁴). The golden `e2e/golden/helm.seed-7.json` is written by `e2e/helm.e2e.ts` on the offline graph: throttle 0.6, course Kepler-442b and burn 1 at tick 0, and `roundSnapshot` at ticks 1, 50, 688 and 1,200, 774 lines.
12. Earlier goldens and assertions. Every earlier golden only gains lines, with 0 changed by Myers, histogram, patience and `diff`. Four enumerating unit assertions grow with the ship under G5 ruling 14's condition (only the enumerated value changes, and the name stays true): (1) `examples/meridian-systems/test/simulation.test.ts:59`, the desk's list gains `helm`; (2) `examples/meridian-systems/test/comms.test.ts:108`, the same list; (3) `examples/meridian-systems/src/simulation/ship-state-store.test.ts:324-328`, the tick-0 loads gain `thrusters` and `main-drive` at 0 W; (4) `tools/repo-checks/src/meridian-purity.test.ts:299-321, 328-334, 345`, the pinned globals sets gain the network names (ruling 13). Every whole-array read of `power.loads` in `bridge-api` and the console uses `toContainEqual`, `find` by id or builds its own double, so no earlier e2e body changes. `examples/bridge-console/playwright.e2e-growth.config.mts` gains the `helm` project and `helm` in `chromium`'s `testIgnore`. `comms` takes `dependencies: ['helm']`.
13. The G5 leftovers. (1) `eslint.config.mjs`: `NETWORK = ['WebSocket', 'XMLHttpRequest', 'EventSource', 'navigator']`, each with "A tick does no I/O, so src/systems/comms/subspace-relay.ts alone reaches the network, through fetch."; the main block refuses `[...HOST_GLOBALS, ...NETWORK, FETCH]` and the relay block `[...HOST_GLOBALS, ...NETWORK]`. The owner named `navigator.sendBeacon`; the rule refuses the whole `navigator` global, since a property rule misses `const n = navigator; n.sendBeacon()` and the global rule catches the call and the alias, and the destructure too. `meridian-purity.test.ts` pins the relay set `HOST_GLOBALS ∪ NETWORK` and the others `∪ {fetch}`, and lints a refusal per name plus the alias and the destructure, in a plain file and in the relay. (2) §8.1 (line 1873) reads "`commsDemand` asks 5,000,000 W on each tick a hail waits on a linked array with no reply outstanding, and 0 W otherwise", and `comms-power.test.ts:42` is titled `draws 5,000,000 W on each tick a hail waits on a linked array with no reply outstanding` with its body unchanged. (3) `examples/meridian-systems/README.md:360` reads "The router sheds the load when less than 5 MW of the reactor's output remains after life support and the shields take their allocations." (4) `examples/bridge-console/README.md:170-171` reads "Its last two cases read the offline snapshot and post a hail that queues for tick 1." (the last two cases of `tests/routes/comms.spec.tsx`, lines 185 and 200). Issue 188 stays out.
14. The extras, each flagged for the owner and each in a commit of its own so one revert undoes it. `Bun` and `Deno` join `HOST_GLOBALS` (`Bun.nanoseconds()` reads the clock, `Deno.connect()` the network, and the library runs on both in `bridge-api`'s runtime legs, so §4.3's "no file reads the wall clock" is false today). `WebTransport` and `importScripts` join `NETWORK`. With the eight names every case fails lint in both files except `fetch` in the relay. `src/physics/comms.test.ts:211`, `asks 5,000,000 W on the tick the array sends`, states the same falsehood as leftover 2, so it becomes `asks 5,000,000 W while a hail waits on a linked array with no reply outstanding`, in leftover 2's commit. The owner's later instruction on the sibling title sets the precedent over G5 ruling 14's rule on names.
15. `bridge-api`. The route case `the helm commands on %s` reads ticks 1 and 2 as the numbers section gives them, after every existing block. The sixth runtime case `courseAndBurn` reads as the numbers section gives it. The runtime logs are byte-identical on Node, the Node bundle, Deno 2.9.6 and Bun 1.4.2 (tick 800 `/sim` 1,965 bytes, FNV-1a `32548374`; final `/sim` 2,001 bytes, `ef7c70c9`; the prototype's key order), so Task 4 records the committed code's hashes. Nobody ran workerd; the gate runs it.
16. The console. The path is `/systems/helm`: every system page sits at its command system's name, and every command the page posts goes to `helm`. Angles read in degrees to 0.1° in [0, 360) through a new `bearing(rad)` in `app/bridge/fixed.ts`, which rounds to 0.1° before it folds, so −10⁻⁷ rad reads `0.0°` and 203° reads `203.0°`. The turn rate reads in °/s to two decimals with no `-0.00`. The charts hold degrees and the console prints `heading 42` on the home and course pages, so one quantity reads in one unit, and the snapshot keeps rad. Torque reads whole N·m, thrust whole N, flow kg/s to 3 decimals, acceleration m/s² to 4, velocity m/s to 2, distance whole m, power in MW to 0.1 through `megawatts()`. `LevelForm({ command, label, button, defaultValue })` joins `system-page.tsx`, and the engineering page's throttle form moves onto it with the same markup, so `tests/routes/engineering.spec.tsx` passes unchanged. The growth project `helm` depends on `airlock`, and `comms` moves to `dependencies: ['helm']`, so the comms case still runs last and its comment stays true. The gauge strings of the route spec stand as ruling 16 gives them (golden tick 50 reads `-398,800 N·m` and tick 1,200 `2.06 m/s`): the doubles feed the rounded reading `/sim` sends, and 2.065 is 2.0649999... in binary64.
17. Duplication. `npx fallow dupes` reads 2.1451 % at `ee67ae90` (1,442 of 67,222 lines, 94 clone groups). The branch may add `3.27 + 0.0215 · N` duplicated lines for `N` new counted lines, 22 lines at N = 900. Two clones are unavoidable because the earlier e2e files stay byte-identical: `e2e/growth/helm.e2e.ts` beside `airlock.e2e.ts:13-17` and `comms.e2e.ts:13-17` (5 lines), and `e2e/helm.e2e.ts` beside `comms.e2e.ts:18-26` and `safety.e2e.ts:10-18` (up to 9). That leaves about 8 lines for the library and the console. Every task that adds a counted file runs `npx fallow dupes` after its commit and records the figure in the ledger. A task whose figure passes 2.15 % removes its own new clone in a fixup first. If the excess pairs new code with frozen earlier files, the controller runs the reserve commit `refactor(bridge-console): share the entry list of the home and course pages` (sonnet, in Task 5's line): `course.tsx:35-39, 51-56` and `home.tsx:61-67` form two app-code groups over the same entry list, and one component removes them with the route specs of both pages unchanged. `.fallowrc.jsonc` keeps 2.25 %.
18. Spec errors and amendments. The architect's spec errors stand: (1) §5.8 says `θ_course` is `NAV_CHARTS.plot(target).heading`, but the charts hold degrees; (2) §3.2's `Propulsion` row exports `MAIN_DRIVE` alone and the `Helm` row `HELM` and `THRUSTERS`, while phase 2 needs `SHIP_SYSTEMS` from both, §5.7 needs `POWER_CONSUMERS` from both and the commands need `COMMAND_HANDLERS` from `Helm`; (3) §3.3 and §10.1 have no rows for the five contributions; (4) §8.1's "under 91 s" is the bang-bang time to the exact heading, and to within 1° the bound is 86.3 s; (5) §5.8's "semi-implicit Euler keeps it stable" belongs to the PD loop (eigenvalues 0.97865 and 0.97072), since the translation has eigenvalues 1 and 1 and the step overstates `s` by `a · dt · t / 2`; (6) §5.8 gives the PD law no rest state; (7) §5.8 computes `τ` in phase 2 and prices `P_rcs` in phase 1, so the router reads the start-of-tick torque; (8) §8.2's helm suite over `SimulatedFtlDrive` belongs to G7, since `FtlDrive` arrives there; (9) §5.6's "hottest equilibrium is 1,192 K" becomes 1,219.6 K with the drive's heat. Error 10 changes: the §4.2 table is right, and the rule of ruling 1 belongs beside it. Two more: (11) §5.7's level for a turn is 0.01653, and (12) §8.3's runtime sentence says "run five cases" and reads six from G6. The amendments of the architect's section 16 stand, with these changes. §4.2: after "Systems that share a phase run in the order of their `name`", add "and read each other's records from `start`, so the order changes no figure. From G6 `Propulsion` reads the helm's attitude at the start of the tick." §5.7: "a turn at full torque needs the reactor at 0.01653, and at throttle 0.01 a course change over about 21° waits on the reactor with `LOAD_SHED thrusters`". §5.8: the step order reads "the helm, and the drive along the start-of-tick attitude"; `RCS_THRUSTERS` and `HELM_TUNING` as ruling 2 splits them; "the PD controller saturates through 30.5 s"; `v` and `s` along the track. §8.1: the motion item of ruling 11 and the purity item with the network names and ruling 14's extras. §8.3: the golden's figures of ruling 11 and the runtime sentence of ruling 3. §13: "G6 leaves out an attitude command apart from the course, a target distance and an arrival, a propellant tank and the rocket equation, a refusal of an uncharted star, and a seventh bundle sentinel." The other sections (§3.1, §3.2, §3.3, §4.1, §4.3, §5.6, new §5.13, §6, §7.1, §7.2, §7.4, §8.2, §10.1, §10.2) take the architect's section 16 as it stands. Task 9 applies them.
19. Commits and parallel work. 21 commits before fixups, 22 with the reserve, under the 100 the rebase merge allows. The wiring is one commit for G5's reason: the aggregate's import changes the graph, so `graph.json` and `check.test.ts` go with it, and the tick-0 loads go with their consumers, or tick 0 would list loads that tick 1 drops. Two tasks run together only when they touch different Nx projects. Order and groups are in the Tasks section.

The §15 rows G6 adds, each dated 2026-10-23 and ending "tech lead, G6 ruling N":

1. The phase-2 systems read each other's records from the start of the tick; `Propulsion` reads the start-of-tick attitude, so their order by name changes no figure (ruling 1).
2. The helm converts the charts' degrees to rad at the command and steers with the clamped PD law. It settles to the course with no torque under 10⁻⁶ rad and 10⁻⁶ rad/s, and `stepHelm` returns the record it got when nothing changes (ruling 2).
3. The helm's figures are the same on every engine; the drive's angle `attitude − course` reads exactly 0 after the settle, so its cosine is exactly 1; only the Node goldens and module test read a burn during a turn (ruling 3).
4. The snapshot gains `drive` and `helm`, and the setpoints `drive.throttle` and `helm.heading` in rad, after `comms`; the store and phase 2 freeze them (ruling 4).
5. A new course keeps the speed and the distance along the track (ruling 6).
6. `HelmPower` draws `thrusters` at priority 4 from the start-of-tick torque with heat share 0, and `PropulsionPower` draws `main-drive` at priority 5 with heat share 0.4; no helm command diverts; a turn at full torque needs the reactor at 0.01653 (ruling 7).
7. G6 adds the crew commands `helm course` and `helm burn`, and no other; `HelmControl` plots at the command; an uncharted star or a key of `Object.prototype` answers `MERIDIAN_BAD_COMMAND` at the command, and `INavCharts` gains `has` (rulings 8 and 23).
8. `Propulsion` and `Helm` join the aggregate, and `HelmControl` reads `MAIN_DRIVE` and `NAV_CHARTS` through it (ruling 9).
9. The library gains `test/helm.test.ts` and the golden `helm.seed-7.json` at ticks 1, 50, 688 and 1,200 (ruling 11).
10. Four enumerating unit assertions grow with the ship; every earlier golden only gains lines (90, 90, 90, 150 and 90), the records in one commit and the loads with the wiring (ruling 12).
11. The four G5 leftovers take the text of ruling 13; the library's lint refuses `WebSocket`, `XMLHttpRequest`, `EventSource` and `navigator` in every file under `src` (ruling 13).
12. The lint also refuses `Bun`, `Deno`, `WebTransport` and `importScripts`, and the second comms title is corrected, each in its own commit (ruling 14).
13. `bridge-api` gains `the helm commands on %s` and the sixth runtime case `courseAndBurn` (ruling 15).
14. The console gains `/systems/helm` in degrees on `LevelForm` and the shared parts, and a growth project `helm` before `comms` (ruling 16).
15. G6 changes no docs page or docs region (ruling 18).
16. `npx fallow dupes` stays at 2.15 % or under from 2.1451 %, with a reserve refactor of the console's entry list (ruling 17).

## Numbers the tests assert

Every figure comes from the tech lead's scripts (`tl-physics.log`, `tl-figures.start.log`, `tl-golden-helm.log`, `tl-bridge.log`, `tl-runtime.*.log`, `tl-console-case.log`) and the architect's `arch-gauges.log`. Where the architect's figure differs, the tech lead's holds (ruling 1's golden figures, 0.01653, 30.5 s). Each task's reviewer recomputes the ones its task asserts.

Physics (`motion.ts`):

- `thrust(600e6)` is 14,400 N exactly in binary64; jet power `½ ṁ v_e²` is 360 MW, which equals `η_d · P_d`; `ṁ` is 0.288 kg/s; the aligned `a` is 0.0036 m/s²; an aligned burn from rest for 300 s at dt 0.5 gives `v` 1.08 m/s and `s` 162.27 m (exact 162).
- `ω_n · dt` is 0.025 at dt 0.5 and 0.05 at dt 1. The linear step's eigenvalues are 0.97865 and 0.97072 at dt 0.5 (real, `exp(−ω_n dt)` 0.97531) and 0.96 and 0.9375 at dt 1.
- The unclamped PD torque at `e = π` is 25.9 MN·m, 5.18 times `τ_max`, so it saturates; at `e = π` from rest the torque is 5,000,000 N·m and the thrusters ask 20,000,000 W. The torque at 31 s is 4.76 MN·m, so the controller saturates through 30.5 s.
- Fastest 180° turn, bang-bang: 91.07 s to the exact heading and 86.27 s to within 1° (`arch-turn.log`; `tl-physics.log`'s 90.82 s is the rest-to-rest 179° turn). The 86.27 s bound holds for a turn from rest with no overshoot: full torque with no braking passes 179° at 64.2 s. Fastest 42° turn: 43.99 s.
- The 180° turn at dt 0.5: within 1° at 164.5 s, overshoot 0°, saturated to 30.5 s, braking from 38.5 s, midpoint at 48 s, peak 0.05133 rad/s at 38 s, settled at tick 786 (393 s). At dt 1: within 1° at 167 s, overshoot 0°, settled at 408 s.
- The 42° turn: within 1° at 114 s, settled at tick 687 (343.5 s) and snapped by 9.94 × 10⁻⁷ rad, peak 0.01354 rad/s, 357.4 MJ. The 42° to 203° (−157°) turn: within 1° at 159.5 s, settled at 388 s. The 0 to 117° turn: within 1° at 146.5 s, settled at 375.5 s.
- One aligned tick from rest: `v` 0.0018 and `s` 0.0009. 400 aligned ticks: `v` 0.72 and `s` 72.18, to 1 × 10⁻¹².

Library unit tests beside each class: `PlasmaDrive.throttle(1)` queues `{ drive: { throttle: 1 } }`; `RcsThrusters.steer(4)` queues the wrapped heading; `HelmControl.course('Kepler-442b')` steers 0.7330382858376184 through a charts double and `burn(0.5)` throttles the drive; `HelmCommands` refuses `warp` with reason `action` and `expected: HELM_ACTIONS`, and a burn level of −0.1, 1.5, NaN or none and a course with no string `to` with reason `argument`; `HelmPower` and `PropulsionPower` draw their loads from the pure demands; `HelmPhysics` and `PropulsionPhysics` run in phase 2 as `Helm` and `Propulsion`, return the ship they got when idle, read `power.shed` and the main-drive allocation, and return frozen snapshots; `propulsion-physics.test.ts` accelerates by the cosine of `start.helm.attitude − course` on a ship whose stepped helm differs from its start.

Library module test `test/helm.test.ts` (gating), `meridianSystems({ seed: 7, dt: 0.5 })`:

| Case            | Assertion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| build           | `Nexus.check` passes offline and on the relay graph; the root reads `HELM`, `THRUSTERS` and `MAIN_DRIVE`; the desk's list reads `comms, engineering, helm, life-support and safety`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| golden scenario | throttle 0.6, course Kepler-442b, burn 1 at tick 0, each `{ tick: 1 }`. Tick 1: thrusters ask 20,000,000 W and get 0, main-drive asks 600,000,000 W and gets 0, `shed: ['thrusters', 'main-drive']`, alarms `LOAD_SHED thrusters` and `LOAD_SHED main-drive`, helm `{ 0, 0, 0 }`, `setpoints.helm.heading` 0.7330382858376184. Tick 2: torque 5,000,000, rate 0.0007575757575757576, attitude 0.0003787878787878788, thrusters 20,000,000 W allocated, main-drive shed. Ticks 2 to 49 shed `main-drive` alone. Tick 50: the drive gets 600,000,000 W at 605.0 MW output, thrust 14,400 N, acceleration 0.003188247 (to 1 × 10⁻⁶), no alarm. Within 1° from tick 229; settled at tick 688 with thrusters 0 W from then. Tick 1,200: velocity 2.0652 m/s and distance 592.98 m (to 1 × 10⁻⁴), coolant under 1,350 K. The log holds one entry at tick 1 |
| aligned burn    | throttle 0.6 at tick 0, course after tick 10, burn after tick 800: course `{ tick: 11 }`; settled from tick 697; tick 800 helm `{ attitude: 0.7330382858376184, rate: 0, torque: 0 }`, both new loads 0 W; burn `{ tick: 801 }`; tick 1,200 thrust 14,400, massFlow 0.288, acceleration 0.0036, velocity 0.72 and distance 72.18 (to 1 × 10⁻¹²), main-drive 600,000,000 W allocated, no alarm; log ticks `[1, 11, 801]`                                                                                                                                                                                                                                                                                                                                                                                                                              |
| power           | throttle 1, a burn and a course queued at tick 0: `shields` raised at tick 16 answers `MERIDIAN_POWER_BUDGET` with `consumer` `shields`, `demand` 200,000,000 and `available` 193,600,000; at tick 17 the raise queues for tick 18                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| refusals        | `helm warp` reason `action`; `burn` 2 and `course` with `to: 42` reason `argument`; each with `expected: HELM_ACTIONS`; the log stays empty                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| charts          | offline, `course` to `TRAPPIST-1e` sets −2.7401669256310974; on the relay graph with `fetch` stubbed by `vi.stubGlobal` to a table that holds Kepler-442b at 90, `course` to `Kepler-442b` sets 1.5707963267948966 (`toRadians(90)`) from the downloaded table                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Library golden `e2e/golden/helm.seed-7.json` (`e2e-growth`, Node from `.nvmrc`): offline graph, throttle 0.6, course Kepler-442b and burn 1 at tick 0; ticks 1, 50, 688 and 1,200; 774 lines. Tick 1 holds both sheds and their alarms. Tick 50 holds helm `0.2567`, `0.01322`, `-398800` and drive `0.003188`, `0.001594`, `0.0007971`. Tick 688 holds velocity `1.144` and distance `182`. Tick 1,200 holds velocity `2.065`, distance `593` and coolant `1064`.

Golden line counts (`git diff --numstat`; Myers, histogram and patience agree, and `diff` reports 0 changed lines). Each snapshot gains 18 lines of records and setpoints and 12 of loads. With the G6 fields stripped, each replay equals the committed golden byte for byte.

| Golden                     | Records and setpoints (Task 1) | Loads (wiring commit) | G6 total | Lines after |
| -------------------------- | ------------------------------ | --------------------- | -------- | ----------- |
| `idle.seed-7.json`         | +54 −0                         | +36 −0                | +90 −0   | 572         |
| `life-support.seed-7.json` | +54 −0                         | +36 −0                | +90 −0   | 572         |
| `safety.seed-7.json`       | +54 −0                         | +36 −0                | +90 −0   | 572         |
| `airlock.seed-7.json`      | +90 −0                         | +60 −0                | +150 −0  | 952         |
| `comms.seed-7.json`        | +54 −0                         | +36 −0                | +90 −0   | 584         |
| `helm.seed-7.json` (new)   | n/a                            | n/a                   | 774      | 774         |

`bridge-api` route case `the helm commands on %s` (gating; Hono, Express, Fastify), after every existing block:

| Ship                                                      | Requests                                                                      | Answer                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nexus` fixture (`FakeCharts`, heading 42 for every star) | `engineering throttle 0.6`, `helm course to Kepler-442b`, `helm burn level 1` | each 202 `{ tick: 1 }`; `AUDIT_LOG.calls` `['has Kepler-442b', 'plot Kepler-442b']` after the course                                                                                                                                                                                             |
| same, 1 tick                                              | `GET /sim`                                                                    | `setpoints.helm` `{ heading: 0.733 }`, `setpoints.drive` `{ throttle: 1 }`, loads `{ id: 'thrusters', priority: 4, demand: 20000000, allocated: 0 }` and `{ id: 'main-drive', priority: 5, demand: 600000000, allocated: 0 }`, `shed` `['thrusters', 'main-drive']`, alarms `LOAD_SHED` for both |
| same, 1 more tick                                         | `GET /sim`, `GET /commands`                                                   | helm `{ attitude: 0.0003788, rate: 0.0007576, torque: 5000000 }`, thrusters 20,000,000 W allocated, `shed` `['main-drive']`; one entry `{ tick: 1, change: { reactor: { throttle: 0.6 }, helm: { heading: (42 * Math.PI) / 180 }, drive: { throttle: 1 } } }`                                    |
| `OfflineMeridian`                                         | `helm course to TRAPPIST-1e`, 1 tick                                          | 202 `{ tick: 1 }`; `setpoints.helm.heading` −2.74; `AUDIT_LOG.calls` `[]`, since interceptors skip the bundled value                                                                                                                                                                             |
| either                                                    | `helm burn level 1.5`, `helm course` with no `to`, `helm flip`                | 400 `MERIDIAN_BAD_COMMAND` with the texts of ruling 8; the log stays empty                                                                                                                                                                                                                       |
| `OfflineMeridian`                                         | `helm course to Vega`, `to constructor`, `to __proto__`, each then 1 tick     | 400 `MERIDIAN_BAD_COMMAND` with the text of ruling 23; `setpoints.helm` `{ heading: 0 }`; no `LOAD_SHED`                                                                                                                                                                                         |

The sixth runtime case `courseAndBurn` (Hono, Express, Fastify, workerd, Deno, Bun), named "a course and a burn on the offline ship settle the helm on the charted heading and drive the ship along it". From tick 0: throttle 0.6 (202 `{ tick: 1 }`); `advanceTo(fetch, 10, 10)`; `helm course to Kepler-442b` (202 `{ tick: 11 }`); `advanceTo(fetch, 790, 800)` reads helm `{ attitude: 0.733, rate: 0, torque: 0 }`, `setpoints.helm.heading` 0.733 and both new loads at 0 W; `helm burn level 1` (202 `{ tick: 801 }`); `advanceTo(fetch, 400, 1200)` reads drive `{ thrust: 14400, massFlow: 0.288, acceleration: 0.0036, velocity: 0.72, distance: 72.18 }` and main-drive `{ demand: 600000000, allocated: 600000000 }`; `GET /commands` ticks `[1, 11, 801]`. `advanceTo` checks no alarm on each read. The case compares exact values with no margin. `e2e/growth/helm.e2e.ts` runs it on the three Node servers through `withShip`. Every earlier case keeps its text.

Console route spec `tests/routes/helm.spec.tsx` (gating), each double spreading `shipAtStart` and feeding the reading `/sim` sends: `readShip` rounds every number to four significant digits, so the doubles carry seed 7's figures as the golden holds them. `arch-gauges.log` fed these strings because it computes them from the golden's values. Gauge strings:

| Reading                        | Helm gauges (Heading, Course, Turn rate, Thruster torque, Thruster power) | Main drive gauges (Burn level, Drive power, Thrust, Propellant flow, Acceleration, Velocity, Distance) |
| ------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| tick 0                         | `0.0°`, `0.0°`, `0.00 °/s`, `0 N·m`, `0.0 MW`                             | `0.00`, `0.0 MW`, `0 N`, `0.000 kg/s`, `0.0000 m/s²`, `0.00 m/s`, `0 m`                                |
| shed (golden tick 1)           | `0.0°`, `42.0°`, `0.00 °/s`, `0 N·m`, `0.0 MW`                            | `1.00`, `0.0 MW`, `0 N`, `0.000 kg/s`, `0.0000 m/s²`, `0.00 m/s`, `0 m`                                |
| turning (route tick 2)         | `0.0°`, `42.0°`, `0.04 °/s`, `5,000,000 N·m`, `20.0 MW`                   | `1.00`, `0.0 MW`, `0 N`, `0.000 kg/s`, `0.0000 m/s²`, `0.00 m/s`, `0 m`                                |
| off-axis burn (golden tick 50) | `14.7°`, `42.0°`, `0.76 °/s`, `-398,800 N·m`, `1.6 MW`                    | `1.00`, `600.0 MW`, `14,400 N`, `0.288 kg/s`, `0.0032 m/s²`, `0.00 m/s`, `0 m`                         |
| aligned (golden tick 1,200)    | `42.0°`, `42.0°`, `0.00 °/s`, `0 N·m`, `0.0 MW`                           | `1.00`, `600.0 MW`, `14,400 N`, `0.288 kg/s`, `0.0036 m/s²`, `2.06 m/s`, `593 m`                       |
| course TRAPPIST-1e set         | `0.0°`, `203.0°`, `0.00 °/s`, `0 N·m`, `0.0 MW`                           | the tick-0 strings                                                                                     |

The course button posts `{ system: 'helm', action: 'course', to: 'Kepler-442b' }` and shows `Queued for tick 1`; the burn posts `{ system: 'helm', action: 'burn', level: 1 }`; a refused burn shows its message and `Fix:` line; the offline page shows `Ship snapshot offline`. A double with a tiny negative turn rate reads `0.00 °/s`, never `-0.00 °/s`.

Console growth case (`helm` project), from the shared ship's tick `t` (throttle 0.01, life support online): `/systems/engineering` sets the throttle to 0.6 (`Queued for tick t + 1`); 10 backend ticks; `/systems/helm` reads `Heading 0.0°`, `Course 0.0°`, `Thrust 0 N`; "Plot course" for Kepler-442b shows `Queued for tick t + 11`; 800 ticks and a reload read `Heading 42.0°`, `Course 42.0°`, `Turn rate 0.00 °/s`, `Thruster torque 0 N·m`, `Thruster power 0.0 MW`; "Burn" at level 1 shows `Queued for tick t + 811`; 400 ticks and a reload read `Thrust 14,400 N`, `Propellant flow 0.288 kg/s`, `Acceleration 0.0036 m/s²`, `Velocity 0.72 m/s`, `Distance 72 m`, `Drive power 600.0 MW`; `/systems/safety` reads `No alarms`; no console error. Each read is exact on any start tick, since the burn starts after the settle. The comms case then reads the array at 0 W.

`check.test.ts` notes: ruling 10. Duplication: base 2.1451 % (1,442 of 67,222 lines); end at 2.15 % or under.

## Global Constraints

- Worktree `.claude/worktrees/feat/meridian-g6-propulsion`. Prefix every nx command and every `git commit` and `git push` with `NX_NO_CLOUD=true NX_DAEMON=false`. Every nx command takes `--parallel=2`. Never touch the main checkout or switch a branch.
- The branch holds 100 commits or fewer. A task with code or text is one to three commits, Task 7 six, 21 in all before fixups and 22 with the reserve. Fixups go in `git commit --fixup=<sha>` commits of the commit each fix belongs to and fold before the PR. A fixup that amends a message uses `git commit --fixup=amend:<sha>` and carries the full message, the subject line included.
- Every commit passes `npx nx test @nexusdi/meridian-systems --parallel=2` and `npx nx test @nexusdi/bridge-api --parallel=2 -- test/check.test.ts` on its own, and the final `rebase -x` checks it. A commit that changes the graph carries the regenerated `graph.json` (`npx nx run @nexusdi/bridge-api:graph --parallel=2`) and the `check.test.ts` notes. Only the wiring commit of Task 2 changes the graph; the classes of Task 1 sit in no module.
- Per-commit obligations beyond that pair:

  | Commit                           | Adds                                                                                                                                                                                                                                 |
  | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | Task 7, both `build` commits     | `npx nx test @nexusdi/repo-checks --parallel=2 -- meridian-purity`, `npx nx lint @nexusdi/meridian-systems --parallel=2`                                                                                                             |
  | Task 1 third, Task 2 first       | `npx nx run-many -t typecheck -p @nexusdi/meridian-systems @nexusdi/bridge-api @nexusdi/bridge-console --parallel=2`, the console's `test`, the library's `e2e-growth`; Task 2's first also the full `bridge-api` `test` and `graph` |
  | Task 3, Task 5                   | the full `test`, `typecheck` and `lint` of the project it touches                                                                                                                                                                    |
  | Task 4                           | bridge-api `e2e-growth` with workerd, Deno 2.9.6 and Bun 1.4.2                                                                                                                                                                       |
  | Task 6                           | the console's `e2e` and `e2e-growth`                                                                                                                                                                                                 |
  | every task adding a counted file | `npx fallow dupes`, figure in the ledger                                                                                                                                                                                             |

- Goldens change in Task 1's third commit (records), Task 2's first (loads) and Task 2's second (the new `helm.seed-7.json`). Each runs the library's `e2e-growth` once without `-u`, so the diff shows the G6 fields alone, then with `-u`, then once more without.
- Parallel work in one worktree: stage your own files by path (`git add <paths>`), never `git add -A` or `git commit -a`, check `git diff --cached --name-only` before each commit, and commit with `git commit -- <paths>` so a peer's staged files stay out. If `index.lock` exists, wait 10 s and retry. If the pre-commit hook fails on a peer's uncommitted edit, report it and leave the peer's files alone.
- Never `--no-verify`, never `HUSKY=0`, never `git commit-tree`, `git update-ref` or `-c core.hooksPath`, never a bare `git stash`, never a merge commit, never a push before the final task. Every commit runs the hooks. To fix a message, use `git commit --fixup=amend:<sha>`.
- Commit subjects follow conventional commits with a scope from `commitlint.config.js` (`meridian-systems`, `bridge-api`, `bridge-console`, `specs`), lowercase, no `@` anywhere in the message, body lines wrapped at 100 characters. Each message ends with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, whichever model writes it.
- Test first: write the failing test, run it, see it fail, then implement. Earlier e2e test bodies and earlier golden lines never change.
- Prose in READMEs, comments, specs and commits follows the writing rules of `nexusdi-ways-of-working`. Every example is interface-first (`Token<IFoo>` with `useClass`).
- Run `npx prettier --write` on every file a task changes.
- Duplication: `npx fallow dupes` ends at 2.15 % or under on the measured figure (start 2.1451 %), and `.fallowrc.jsonc` keeps its 2.25 % limit untouched. Each task that adds a counted file records the figure in its hand-back.
- Helpers and probe scripts live in the session scratchpad's `meridian-g6/` folder only, prefixed by task (`t5-...`), and a committed file refers to them as `scratchpad/meridian-g6/<file>`. A committed file never holds an absolute local path or a vault path.
- The docs regions (`examples/meridian/src/pages`) and the docs site (`apps/docs`) never import a private demo package and keep building. G6 changes nothing there. `examples/meridian/src/pages/lazy.md` defines its own `HELM_CONTROL` token bound to `HelmStation`, and no page names the library's helm, so nothing reads false.
- Console gauges round to a fixed precision in SI units. Test fixtures feed the reading `/sim` sends: `readShip` rounds every number to four significant digits, so the doubles carry seed 7's figures as the golden holds them.

### Heavy work

A heavy job is `npm ci`, a build of more than one project, any `e2e` or `e2e-growth` target, `nx run-many`, or the final `rebase -x`. Run one at a time at all hours. On weekdays from 09:00 to 17:00 (check `date`) wrap every nx, vitest and playwright run in the lock, and release it promptly. Never hold it while thinking or editing:

```sh
(until mkdir /tmp/nexusdi-heavy.lock 2>/dev/null; do sleep 20; done; trap 'rmdir /tmp/nexusdi-heavy.lock' EXIT; NX_NO_CLOUD=true NX_DAEMON=false npx nx ... --parallel=2)
```

Outside those hours skip the lock. Tasks 4 and 6 each run a heavy target, so both take the lock for every `e2e` and `e2e-growth` run at any hour.

### Cleanup

Every task ends with this step before its review gate:

```sh
setopt null_glob 2>/dev/null; rm -rf libs/*/test-output examples/*/dist examples/*/build \
  examples/*/test-output examples/*/out-tsc examples/bridge-console/.react-router tmp
```

### Review gate

Each task ends with a review by a fresh opus reviewer that did not write the task, and the next task in its line starts after the gate passes. The reviewer reads the task's diff against this plan and the spec, runs the task's test commands, checks that each commit passes the two per-commit suites (`scratchpad/meridian-g6/each.sh` does it), recomputes the figures the task names, checks the writing rules on every added comment and message, and reports findings. The implementer fixes them in fixup commits. The gate passes when the reviewer reports no finding. The branch ends with the final review of Task 11.

## Tasks

Order and parallelism: Task 7 runs beside Task 0 (library config, `repo-checks`, the spec and two READMEs) and finishes before Task 1 starts, since its commits lint the library. Tasks 1 and 2 run alone, in order. Task 3 (`bridge-api`) runs beside Task 5 (console). Task 4 (`bridge-api` `test/runtime` and `e2e/growth`) runs after Task 3, beside Task 6 (console `e2e/growth` and its config). Tasks 8 and 9 run together after Tasks 3 to 6. Task 10 follows them, then Task 11.

| Task | Model  | What                                                                                                            | Commits |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------- | ------- |
| 0    | sonnet | this plan                                                                                                       | 1       |
| 7    | sonnet | the G5 leftovers: network globals, the Bun and Deno extras, the two comms titles, the spec line and two READMEs | 6       |
| 1    | opus   | `src/physics/motion.ts`, `levelArgument`, then the records and the eight classes in no module yet               | 3       |
| 2    | opus   | the wiring with the tick-0 loads and the graph, then the helm golden                                            | 2       |
| 3    | sonnet | `bridge-api`'s gating helm case                                                                                 | 1       |
| 5    | sonnet | `LevelForm` and the console's helm page, plus the reserve refactor if the dupes figure needs it                 | 2 or 3  |
| 4    | sonnet | `courseAndBurn` on six runtimes and `e2e/growth/helm.e2e.ts`                                                    | 1       |
| 6    | sonnet | the console's helm growth case and the sixth project                                                            | 1       |
| 8    | sonnet | READMEs                                                                                                         | 3       |
| 9    | opus   | the spec amendments                                                                                             | 1       |
| 10   | sonnet | the full gate and the cleanup                                                                                   | 0       |
| 11   | opus   | the final review with its fixup rounds, and the PR                                                              | 0       |

---

### Task 0: this plan

Model: sonnet.

- [ ] Commit `docs(specs): plan the g6 propulsion and helm`.

### Task 7: the G5 leftovers

Model: sonnet. Runs beside Task 0 and finishes before Task 1.

Files:

- Modify: `examples/meridian-systems/eslint.config.mjs`, `tools/repo-checks/src/meridian-purity.test.ts`
- Modify: `examples/meridian-systems/src/systems/comms/comms-power.test.ts` (line 42), `examples/meridian-systems/src/physics/comms.test.ts` (line 211)
- Modify: `specs/2026-10-21-meridian-ship-systems-design.md` (line 1873)
- Modify: `examples/meridian-systems/README.md` (line 360), `examples/bridge-console/README.md` (lines 170-171)

- [ ] Step 1: write the failing cases in `meridian-purity.test.ts` first. The pinned relay set is `HOST_GLOBALS ∪ NETWORK` and the others `∪ {fetch}`; one refusal case per name (`WebSocket`, `XMLHttpRequest`, `EventSource`, `navigator`), the alias `const n = navigator` and the destructure, each linted in a plain file and in `src/systems/comms/subspace-relay.ts`. Run `npx nx test @nexusdi/repo-checks --parallel=2 -- meridian-purity` and see them fail. Edit the library's ESLint config as ruling 13 says. Run the purity test, `npx nx lint @nexusdi/meridian-systems --parallel=2` and the two per-commit suites. Commit `build(meridian-systems): refuse the network globals outside the subspace relay`.
- [ ] Step 2: add the failing cases for `Bun`, `Deno`, `WebTransport` and `importScripts` (the first two join `HOST_GLOBALS`, the last two `NETWORK`), see them fail, edit the config and run the same commands. Commit `build(meridian-systems): refuse the bun and deno globals, webtransport and importscripts`.
- [ ] Step 3: retitle `comms-power.test.ts:42` to `draws 5,000,000 W on each tick a hail waits on a linked array with no reply outstanding` and `src/physics/comms.test.ts:211` to `asks 5,000,000 W while a hail waits on a linked array with no reply outstanding`. The bodies stay. Run the library `test` target. Commit `test(meridian-systems): name the comms load's demand on each waiting tick`.
- [ ] Step 4: edit §8.1 (line 1873) of the spec to the sentence of ruling 13, item 2. Run `npx prettier --check` on the file. Commit `docs(specs): correct the comms demand in the unit test list`.
- [ ] Step 5: edit `examples/meridian-systems/README.md:360` to the sentence of ruling 13, item 3. Run `npx prettier --check`. Commit `docs(meridian-systems): state when the router sheds the comms load`.
- [ ] Step 6: edit `examples/bridge-console/README.md:170-171` to the sentences of ruling 13, item 4, after reading `tests/routes/comms.spec.tsx` at lines 185 and 200. Run `npx prettier --check`. Commit `docs(bridge-console): reword the comms page's test paragraph`.
- [ ] Step 7: cleanup, then the review gate.

Reviewer checks: the diff of each title commit changes the title and no body line, and the refused sets match rulings 13 and 14 with the `Bun` and `Deno` entries failing no existing file under `src`.

### Task 1: motion physics, `levelArgument` and the classes

Model: opus (the settle, the shed rule and the frozen records are the hard parts).

Files:

- Create: `examples/meridian-systems/src/physics/motion.ts` and `motion.test.ts`
- Modify: `examples/meridian-systems/src/simulation/command-arguments.ts` and its test, `examples/meridian-systems/src/systems/engineering/engineering-commands.ts` (the file that reads `throttle`'s level)
- Create (commit 3): `examples/meridian-systems/src/systems/propulsion/contracts.ts`, `plasma-drive.ts`, `propulsion-physics.ts`, `propulsion-power.ts` and a `.test.ts` beside each class; `examples/meridian-systems/src/systems/helm/contracts.ts`, `rcs-thrusters.ts`, `helm-control.ts`, `helm-physics.ts`, `helm-power.ts`, `helm-commands.ts` and a `.test.ts` beside each class
- Modify (commit 3): the snapshot and setpoint types in `examples/meridian-systems/src/simulation/contracts.ts`, `src/simulation/ship-state-store.ts`, `examples/bridge-console/tests/doubles.ts`, and the five goldens `idle`, `life-support`, `safety`, `airlock` and `comms` `.seed-7.json` under `examples/meridian-systems/e2e/golden/`

- [ ] Step 1: write the failing `src/physics/motion.test.ts`. Test names:
  - `thrusts 14,400 N at 600 MW and burns 0.288 kg/s`
  - `accelerates an aligned ship at 0.0036 m/s²`
  - `scales an off-axis burn by the cosine of the angle`
  - `wraps an angle to (−π, π]` (π, −π, 3π and −3π give π, 2π gives 0)
  - `converts the charts' degrees to radians` (42, 117, 203 and 180)
  - `turns 180° within 1° at 164.5 s at dt 0.5 with no overshoot and no sooner than 86.3 s`
  - `turns 180° within 1° at 167 s at dt 1 and settles at 408 s`
  - `settles the 180° turn at tick 786 and no sooner than 91.1 s`
  - `saturates at 5,000,000 N·m and asks 20,000,000 W at e = π`
  - `follows the linear law inside the band`
  - `applies no torque on a shed tick`
  - `returns the record it got on a shed tick at rest`
  - `snaps a 42° turn at tick 687 and returns the record it got on the next step`
  - `asks 0 W once settled`
  - `returns the drive record it got at rest with no power`
  - `gives v 0.0018 and s 0.0009 after one aligned tick`
  - `gives v 0.72 and s 72.18 after 400 aligned ticks`
  - `coasts with no thrust`
  - `freezes every record a step builds`

  Run `npx nx test @nexusdi/meridian-systems --parallel=2 -- src/physics/motion.test.ts` and see it fail on the missing file. Write `motion.ts` as ruling 9 lists it, importing `./power` for `PowerLoad` and nothing from `@nexusdi/*`. Run it until it passes. Run `npx nx test @nexusdi/meridian-systems --parallel=2` and `npx nx test @nexusdi/bridge-api --parallel=2 -- test/check.test.ts`, then `npx fallow dupes` and record the figure. Commit `feat(meridian-systems): model the main drive's thrust and the helm's turn`.

- [ ] Step 2: write the failing `levelArgument` cases beside `textArgument` and `flagArgument` in the helper's test (a level of 0 and 1 passes; −0.1, 1.5, NaN, a string and none call `refuse`). Add `levelArgument(command, name, refuse)` and move `EngineeringCommands`' range check onto it. `engineering-commands.test.ts` passes unchanged. Run the library `test` target and the per-commit pair. Commit `refactor(meridian-systems): share the level argument of the commands`.
- [ ] Step 3: write the failing class tests, each beside its class, with the assertions of the unit-test paragraph of the numbers section, and widen the types: `ShipSnapshot.drive` and `.helm`, `Setpoints.drive` and `.helm`, each after `comms`, the store's initial values frozen at every level, and the console's `shipAtStart` with the four records. The store's loads stay as they are, so the 0 W loads, `ship-state-store.test.ts:324-328` and the load entries in `shipAtStart` wait for Task 2. If the widened type forces another fixture to change, change its spread only and report it. Write the eight classes and the two `contracts.ts` files. `HelmPhysics` and `PropulsionPhysics` return the ship they got when their step returns the record it got. Run `npx nx run @nexusdi/meridian-systems:e2e-growth --parallel=2` (heavy) once without `-u`: it must fail on the five goldens and show the four records and the two setpoints as the only diff. Run it with `-u`, then once more without. `git diff --numstat` on the goldens reads idle +54 −0, life-support +54 −0, safety +54 −0, airlock +90 −0 and comms +54 −0. Run the per-commit pair, `npx nx run-many -t typecheck -p @nexusdi/meridian-systems @nexusdi/bridge-api @nexusdi/bridge-console --parallel=2`, the console's `test` and lint, then `npx fallow dupes` and `npx nx run @nexusdi/bridge-api:graph --parallel=2` (no diff, since no module binds the classes). Commit `feat(meridian-systems): add the drive and helm records and their classes`.
- [ ] Step 4: cleanup, then the review gate.

Reviewer recomputes the physics figures of the numbers section with `scratchpad/meridian-g6/tl-physics.mts` and `arch-turn.mts`, and checks the frozen levels and that `engineering-commands.test.ts` is untouched. `git diff --numstat` on the five goldens reads 54, 54, 54, 90 and 54 with zero removed.

### Task 2: the wiring and the golden

Model: opus.

Files, first commit:

- Create: `examples/meridian-systems/src/systems/propulsion/propulsion.module.ts`, `examples/meridian-systems/src/systems/helm/helm.module.ts`, `examples/meridian-systems/test/helm.test.ts`
- Modify (library): the aggregate (`examples/meridian-systems/src/meridian-systems.module.ts`), `examples/meridian-systems/src/simulation/ship-state-store.ts` (the tick-0 0 W `thrusters` and `main-drive` loads after `comms`), `examples/meridian-systems/src/simulation/ship-state-store.test.ts:324-328`, `examples/meridian-systems/src/index.ts`, `examples/meridian-systems/test/simulation.test.ts:59`, `examples/meridian-systems/test/comms.test.ts:108`, the five goldens `examples/meridian-systems/e2e/golden/{idle,life-support,safety,airlock,comms}.seed-7.json`
- Modify (`bridge-api`): `examples/bridge-api/test/check.test.ts`, `examples/bridge-api/graph.json`
- Modify (console): `examples/bridge-console/tests/doubles.ts` (`shipAtStart` gains the two 0 W loads)

Files, second commit: `examples/meridian-systems/e2e/helm.e2e.ts` and `examples/meridian-systems/e2e/golden/helm.seed-7.json`.

- [ ] Step 1: write the failing `test/helm.test.ts`: the six rows of the module-test table (build, golden scenario, aligned burn, power, refusals, charts), one `it` each, titled `builds with the helm and the drive and lists helm on the desk`, `flies the golden scenario: sheds at tick 1, burns off axis at tick 50, settles at tick 688`, `burns along the settled course from tick 801`, `refuses the shields at tick 16 with 193,600,000 W available`, `refuses helm warp, a burn of 2 and a course to 42` and `steers the charted heading offline and from the relay's table`, with `fetch` stubbed by `vi.stubGlobal` for the relay row and `vi.unstubAllGlobals()` after. Run `npx nx test @nexusdi/meridian-systems --parallel=2 -- test/helm.test.ts` and see it fail.
- [ ] Step 2: write `Propulsion` and `Helm` as ruling 9 gives them, import and re-export both in the aggregate after the tactical module, add the exports to the index, extend the export comments by a sentence each, and add the two tick-0 loads to the store after `comms`. Update the three enumerating assertions of ruling 12. Keep the aggregate under the 120-line limit. Run the module test until it passes.
- [ ] Step 3: run `npx nx run @nexusdi/meridian-systems:e2e-growth --parallel=2` (heavy) once without `-u`. It must fail on the five goldens and show the two 0 W loads as the only diff. Run it with `-u`, then once more without. `git diff --numstat` reads +36, +36, +36, +60 and +36, all with −0, against Task 1's third commit, and +90, +90, +90, +150 and +90 against `ee67ae90`.
- [ ] Step 4: `bridge-api`. Update `check.test.ts` with the eight notes of ruling 10, run `npx nx run @nexusdi/bridge-api:graph --parallel=2` to redraw `graph.json`, and read the diff: `Propulsion` and `Helm` join `MeridianSystems`'s imports after `OfflineTactical`, with eight providers. The target exits 1 while `graph.json` differs from the index. Stage the file and rerun it for a zero exit. `test/profile.test.ts` and `test/shutdown.test.ts` stay byte-identical.
- [ ] Step 5: run in turn: the library `test`; `npx nx test @nexusdi/bridge-api --parallel=2` (full); the console `test`; `npx nx run-many -t typecheck -p @nexusdi/meridian-systems @nexusdi/bridge-api @nexusdi/bridge-console --parallel=2` and lint of the three projects; `npx fallow dupes` (record the figure). Check the docs regions and `apps/docs` for imports of the three packages: none. Commit `feat(meridian-systems): fly the ship with the propulsion and helm modules`, with a body that names the files and the line counts.
- [ ] Step 6: the golden. Write `e2e/helm.e2e.ts` on the offline graph (`seed: 7`, `dt: 0.5`): throttle 0.6, `helm course to Kepler-442b` and `helm burn level 1` at tick 0, `roundSnapshot` at ticks 1, 50, 688 and 1,200. Title the golden `pins a course and a burn on the offline ship, seed 7, to the golden`. Run `e2e-growth` (heavy) once with `CI=true` and see it fail on the missing golden, since a local run without `-u` writes a missing file snapshot and passes. Run it with `-u`, then without. Check the file has 774 lines and the values of the golden paragraph of the numbers section. Run `npx fallow dupes` and record the figure. Run the per-commit pair. Commit `test(meridian-systems): pin a course and a burn to a golden`.
- [ ] Step 7: cleanup, then the review gate.

Reviewer recomputes: `tl-figures.start.log` A to H against the module test and the golden, `tl-bridge.log` 2 against the notes, and `tl-golden-lines.log` against the line counts. The reviewer checks that the five earlier goldens only gain lines, that each commit passes the per-commit pair, that the aggregate stays under 120 lines, that `test/fixtures.ts`, `test/profile.test.ts` and `test/shutdown.test.ts` are byte-identical, and that `npx fallow dead-code --fail-on-issues` reports no unused export.

### Task 3: `bridge-api`'s helm case

Model: sonnet. Runs beside Task 5.

Files: modify `examples/bridge-api/test/routes.test.ts`.

- [ ] Step 1: write the failing `the helm commands on %s` case after every existing block, on Hono, Express and Fastify, with the five rows of the route table (the `OfflineMeridian` row builds the ship as the file's other blocks do). Run `npx nx test @nexusdi/bridge-api --parallel=2 -- test/routes.test.ts`, see it fail on the first assertion that needs the new ship, and fix the case until it passes (no source change is expected, so a wrong figure is the failure to chase). Run `npx nx run @nexusdi/bridge-api:graph --parallel=2`: no diff. Run the full `bridge-api` test target, typecheck and lint. Run the per-commit pair. Commit `test(bridge-api): steer and burn through the helm on each framework`.
- [ ] Step 2: cleanup, then the review gate.

Reviewer recomputes the five answers against `tl-bridge.log` 4, and checks that `test/fixtures.ts` is untouched and no earlier block's text changed.

### Task 5: the console's helm page

Model: sonnet. Runs beside Task 3.

Files:

- Modify: `examples/bridge-console/app/routes/systems/system-page.tsx`, `examples/bridge-console/app/routes/systems/engineering.tsx`, `examples/bridge-console/app/bridge/fixed.ts`, `examples/bridge-console/app/routes.ts`, `examples/bridge-console/app/routes/layout.tsx`
- Create: `examples/bridge-console/app/routes/systems/helm.tsx`
- Test: `examples/bridge-console/tests/routes/helm.spec.tsx`, `examples/bridge-console/tests/routes/system-page.spec.tsx`, `examples/bridge-console/tests/fixed.test.ts` (`bearing` and `turnRate`)

- [ ] Step 1: write the failing `LevelForm` case in `system-page.spec.tsx`, then add `LevelForm({ command, label, button, defaultValue })` to `system-page.tsx` and move the engineering page's throttle form onto it with the same markup. Run `npx nx test @nexusdi/bridge-console --parallel=2`: `tests/routes/engineering.spec.tsx` passes unchanged. Typecheck and lint. Commit `refactor(bridge-console): share the level form of the system pages`.
- [ ] Step 2: write the failing `bearing` cases (−10⁻⁷ rad reads `0.0°`, 203° reads `203.0°`) and the cases of `turnRate(rad)` in `app/bridge/fixed.ts` (a negative zero prints `0.00 °/s`), then the failing `tests/routes/helm.spec.tsx` on the six readings of the gauge table, the course button, the burn button, a refused burn and the offline page. Each double spreads `shipAtStart`. Write the page on `SystemPage`, `ControlSection`, `Gauges`, `LevelForm`, `SnapshotOffline`, `snapshotLoader` and `systemAction('helm', { to: 'text', level: 'number' })`. Sections: "Helm" (gauges `Helm gauges`), "Main drive" (gauges `Main drive gauges`), "Course" (a select `to` of the keys of `BUNDLED_CHARTS` from `@nexusdi/meridian-systems/charts` and the button "Plot course", `command=course`) and "Burn" (`LevelForm` with the label "Burn level" and the button "Burn", level from 0 to 1, step 0.01). Correct the docblock of `fixed` in `app/bridge/fixed.ts`: its sentence "The ship sends raw floats, such as 0.18000000000000002" is false, since `readShip` rounds every number to four significant digits before `/sim` and the telemetry frames send it. The docblock says the reading arrives rounded to four significant digits and every gauge still fixes the decimals it shows. Add the static route `/systems/helm` to the `ship-layout.tsx` group in `app/routes.ts` and the "Helm" link after "Comms" in `layout.tsx`. Run the console `test`, typecheck and lint, then `npx fallow dupes` and record the figure. `helm.tsx` imports the library's main entry with `import type` only and the charts from `./charts`, so the bundle check of `e2e/fresh-server.spec.ts` stays green. Commit `feat(bridge-console): add the helm page`.
- [ ] Step 3: reserve, only when the controller reports a dupes figure over 2.15 % that pairs new code with frozen earlier files. Share the entry list of `course.tsx:35-39, 51-56` and `home.tsx:61-67` in one component, with the route specs of both pages unchanged. Commit `refactor(bridge-console): share the entry list of the home and course pages`.
- [ ] Step 4: cleanup, then the review gate.

Reviewer recomputes the gauge strings against the gauge table and `arch-gauges.log` (computed from the golden's rounded values, which is what `/sim` sends), and checks by diff that the refactor moved the throttle form's markup without edits and that `engineering.spec.tsx` is untouched.

### Task 4: `courseAndBurn` on six runtimes

Model: sonnet. Runs after Task 3, beside Task 6.

Files:

- Modify: `examples/bridge-api/test/runtime/growth-cases.ts`
- Create: `examples/bridge-api/e2e/growth/helm.e2e.ts`

- [ ] Step 1: write `courseAndBurn` as the sixth entry of `growthCases`, after `offlineHail`, with the name and the steps of the runtime-case paragraph of the numbers section and the file's `send`, `advanceTo` and `command` helpers. Write `e2e/growth/helm.e2e.ts` as `describe.each(['hono', 'express', 'fastify'])` with `withShip`, as `comms.e2e.ts` does. Run it, see it fail on the missing case, then pass. Run `npx fallow dupes`; the group against `airlock.e2e.ts` and `comms.e2e.ts` (5 lines) is a budgeted clone. Record the figure.
- [ ] Step 2: run the six legs (heavy, one run) with the scratchpad's pinned Deno 2.9.6 and Bun 1.4.2 first on `PATH` and workerd for the worker leg: `npx nx run @nexusdi/bridge-api:e2e-growth --parallel=2`. The earlier five cases keep their text and pass. Node, the Node bundle, Deno and Bun print the same `/sim` bodies byte for byte: record the committed code's tick-800 and final hashes (the prototype's were 1,965 bytes `32548374` and 2,001 bytes `ef7c70c9`). Run `npx nx run @nexusdi/bridge-api:graph --parallel=2`: no diff. Commit `test(bridge-api): fly a course and a burn on every runtime`.
- [ ] Step 3: cleanup, then the review gate.

Reviewer recomputes the checkpoints against `tl-runtime.*.log` and confirms the legs ran on the pinned versions with workerd. No earlier case's text changes.

### Task 6: the console's helm growth case

Model: sonnet. Runs beside Task 4.

Files:

- Create: `examples/bridge-console/e2e/growth/helm.spec.ts`
- Modify: `examples/bridge-console/playwright.e2e-growth.config.mts`

- [ ] Step 1: add the sixth project `helm` with `dependencies: ['airlock']`, move `comms` to `dependencies: ['helm']`, change the `chromium` project's `testIgnore` to `/(life-support|safety|airlock|helm|comms)\.spec\.ts/`, and write `helm.spec.ts` with the steps of the console growth case (the backend advanced through `request.post('/sim/advance')`, and a console-error assertion). `comms.spec.ts` stays byte-identical and the config's comment over `comms` stays true. Run `npx nx run @nexusdi/bridge-console:e2e-growth --parallel=2` and `npx nx run @nexusdi/bridge-console:e2e --parallel=2` (heavy, one at a time). The config has `retries: 0`, so the first read of `Heading 0.0°` holds. Commit `test(bridge-console): fly a course from the helm page in a growth case`.
- [ ] Step 2: cleanup, then the review gate.

Reviewer recomputes the page's words against the gauge table and `tl-console-case.log`, and checks that the five earlier growth specs are untouched.

### Task 8: READMEs

Model: sonnet. Runs with Task 9, after Tasks 3 to 6.

Files: modify `examples/meridian-systems/README.md`, `examples/bridge-api/README.md`, `examples/bridge-console/README.md`.

- [ ] Step 1: the library README gains the propulsion and helm modules, the commands `helm course` and `helm burn`, the settle, the reactor level a turn needs (above 0.0165) and the throttle 0.01 behaviour, the golden and the module test. Commit `docs(meridian-systems): describe propulsion and the helm`.
- [ ] Step 2: the `bridge-api` README gains the helm route case and the sixth runtime case. Commit `docs(bridge-api): describe the helm cases`.
- [ ] Step 3: the console README gains `/systems/helm` with its angles in degrees, and the sixth growth project. Run `npx prettier --check` on the three files, and the README doctests if a README gains a `ts` block. Commit `docs(bridge-console): document the helm page`.
- [ ] Step 4: cleanup, then the review gate.

Reviewer recomputes each tick and figure a README states against the numbers section.

### Task 9: the spec amendments

Model: opus.

Files: modify `specs/2026-10-21-meridian-ship-systems-design.md`.

- [ ] Step 1: apply ruling 18 section by section (§3.1, §3.2, §3.3, §4.1, §4.2, §4.3, §5.6, §5.7, §5.8, new §5.13, §6, §7.1, §7.2, §7.4, §8.1, §8.2, §8.3, §10.1, §10.2, §13), add the sixteen §15 rows, and add this plan to the closing paragraph's list. Check each figure against the tech lead's logs (the comms sentence is in since Task 7; check it). Run `npx prettier --check` on the file. Commit `docs(specs): record the g6 rulings in the ship systems spec`.
- [ ] Step 2: cleanup, then the review gate.

Reviewer recomputes the golden scenario and the aligned burn in §5.13, the golden's 774 lines, the 90, 90, 90, 150 and 90 line counts, and the 86.3 s and 91.1 s bounds.

### Task 10: the gate

Model: sonnet.

- [ ] Step 1: run `scratchpad/meridian-g6/gate.sh` (heavy, holds the lock itself): `npx nx run-many -t lint test build typecheck --parallel=2`, the `bridge-api` and console `e2e` targets, `npx nx run-many -t e2e-growth --projects=tag:demo --parallel=2` with the pinned Deno 2.9.6 and Bun 1.4.2 first on `PATH` and workerd for the worker leg, the `graph` target with no diff, `npx fallow dead-code --fail-on-issues`, `npx fallow dupes` and `npx prettier --check .`. Record the dupes figure, which must read 2.15 % or under, and confirm `git diff origin/release/0.4 -- .fallowrc.jsonc` is empty. Fix any finding in a fixup commit.
- [ ] Step 2: cleanup.

### Task 11: the final review and the PR

Model: opus.

- [ ] Step 1: the final branch review by an independent opus reviewer, who recomputes every figure in "Numbers the tests assert" and checks the diff of the earlier goldens and e2e files, fix rounds in fixup commits until it approves.
- [ ] Step 2: fold the fixups with `GIT_SEQUENCE_EDITOR=: NX_NO_CLOUD=true NX_DAEMON=false git rebase -i --autosquash origin/release/0.4`. Then check every commit on its own (heavy): `NX_NO_CLOUD=true NX_DAEMON=false git rebase origin/release/0.4 -x 'NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/meridian-systems --parallel=2 --skip-nx-cache && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/bridge-api --parallel=2 --skip-nx-cache -- test/check.test.ts'`. A commit that fails gets its fix folded into it, and the step reruns. Check `git rev-list --count origin/release/0.4..HEAD` is 100 or fewer.
- [ ] Step 3: if `origin/release/0.4` moved, rebase onto it and rerun the graph, the gate and Step 2. Push with `NX_NO_CLOUD=true NX_DAEMON=false git push -u origin feat/meridian-g6-propulsion`, and open the PR against `release/0.4`. The body lists the rulings and the additions beyond the spec's G6 text (the list "For the owner" below) and ends with the Claude Code line. Wait for CI and fix any CodeQL alert, then report the PR number and the result.

## For the owner

Additions beyond the spec's G6 text. None changes a public docs page.

1. The crew commands `helm course to <star>` and `helm burn level <x>`, plotted at the command, with `levelArgument` shared with the throttle (ruling 8).
2. The settle at 10⁻⁶ rad and 10⁻⁶ rad/s, and the start-of-tick coupling of the two phase-2 systems (rulings 1 and 2).
3. Ship behaviour the spec leaves open: the load ids, the thrusters' heat share 0, a burn on a cold reactor that sheds with `LOAD_SHED main-drive`, a course at throttle 0.01 that waits on the reactor with `LOAD_SHED thrusters`, a new course that keeps the speed (rulings 6 and 7).
4. `INavCharts` gains `has(to)`; every implementer in the repo gains it (ruling 23).
5. `navigator` refused as a whole global where you named `navigator.sendBeacon`, and four more names refused (`Bun`, `Deno`, `WebTransport`, `importScripts`) in their own commit (rulings 13 and 14).
6. The second comms test title (`src/physics/comms.test.ts:211`) corrected beside the one you named (ruling 14).
7. A gating route case per framework, a sixth runtime case, a module test and the helm golden (rulings 11 and 15).
8. The console page `/systems/helm` with its nav link, `LevelForm` and a growth project `helm` that runs before `comms` (ruling 16). Its angles read in degrees and its turn rate in °/s. Your gauge ruling asks for SI units, and the degree is outside the SI (accepted for use with it); the snapshot keeps rad.
9. Four enumerating unit assertions grow with the ship (ruling 12).
10. The ratings on the contracts: `IMainDrive.rating` and `IThrusters.rating`, read by the physics and power classes, and `HELM_TUNING` and `HELM_SETTLE` beside the helm law (rulings 2 and 9).
11. Module contributions past §3.2 and §3.3: `Propulsion` also exports `SHIP_SYSTEMS` and `POWER_CONSUMERS`, `Helm` also `SHIP_SYSTEMS`, `POWER_CONSUMERS` and `COMMAND_HANDLERS`, with five new class rows (ruling 18, errors 2 and 3).
12. Spec text G6 does not deliver: the §8.2 helm suite over `SimulatedFtlDrive` and §6's 'a test of the helm does not spool a real drive' move to G7, since `FtlDrive` arrives there; §8.1's 91 s bound becomes 86.3 s to within 1° and 91.1 s to the settle (ruling 18, errors 4 and 8).
13. The record shapes and one setpoint `helm.heading` in rad that holds both the set heading and the course (ruling 4).
14. The dupes figure reads 2.1374 % at the end, so the reserve refactor of the console's home and course pages was not needed (ruling 17).
15. The docblock of `examples/bridge-console/app/bridge/fixed.ts` says the ship sends raw floats. `readShip` rounds every number to four significant digits before `/sim` and the telemetry frames send it, so Task 5 corrects the sentence. The console's test doubles feed the rounded reading for the same reason.
16. The library's two vitest configs set `testTimeout: 30_000`, so a slow hour of ticks on a loaded machine fails on its assertions alone, and no earlier `it(...)` call changes (ruling 21). `.prettierignore` leaves the library's goldens out of the format check, since Prettier folds a short array the golden tests compare byte for byte.
17. The console takes `@nexusdi/meridian-systems` as a dependency and imports `StarCharts` and `BUNDLED_CHARTS` from the new `./charts` subpath. `app/bridge/charts.json` and `tests/charts.test.ts` go (ruling 24).
