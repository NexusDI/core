# Meridian G0, the simulation kernel: Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Ledger: `.superpowers/sdd/meridian-g0/progress.md`.

Goal: the Starship Meridian runs a deterministic, seeded, fixed-step simulation with no ship system yet. `examples/meridian-systems` holds the kernel, `bridge-api` imports it through `meridianSystems(...)`, drives it with `WallClockDriver`, and serves `GET /sim` and `POST /sim/advance`. The ship starts idle, so no existing e2e case changes.

Architecture: one pull request, `feat/meridian-g0-kernel`, cut from `origin/release/0.4`. The library holds pure physics in `src/physics/` and the `Simulation` module in `src/simulation/`. The aggregate `MeridianSystems` is global and binds `TICK_LOOP`. `bridge-api` adds a `SimDriver` module with `forRoot({ mode })`, the two routes on Hono, Express and Fastify, and an `e2e-growth` target that only the `demo-growth` CI job runs.

Tech stack: Node from `.nvmrc` (24.20.0), TypeScript 6.0.3, Vitest 5.0.5, Nx 23.3.0 (`@nx/js:library`), Hono 4.13.13, Express 5.3.0, Fastify 5.12.7.

Spec: `specs/2026-10-21-meridian-ship-systems-design.md`. Section numbers below (§) refer to it. Also the `nexusdi-ways-of-working` skill.

## Rulings this plan carries

The architect proposed and the tech lead decided these on 2026-10-21. Task 9 writes the spec amendments they need.

1. `TICK_LOOP` is bound in the aggregate `MeridianSystems`, which is `global: true`. A module's `all()` gathers its own providers, its imports' exports and the global modules' exports (`libs/core/src/blueprint/visibility.ts`), so a loop bound in `Simulation` never sees a system that a sibling module imports. `Simulation` stays global and binds `SIM_OPTIONS`, `SIM_CLOCK`, `RNG`, `SHIP_STATE` and `DECK_PLAN`. The `provide(TICK_LOOP, ...)` line carries a one-line comment that `all()` reads what this module can see.
2. G0 is the kernel. `GET /sim` joins it, since every e2e case reads the ship. A G0b increment takes `Telemetry`, tick listeners, `GET /telemetry`, `GET /graph` with `shipNotes`, `BRIDGE_LINK.snapshot()` and `telemetry(signal)`, the console's status strip and `/diagnostics`, the §9 bundle check and the workerd, Deno and Bun `/sim` smoke case. `BRIDGE_LINK.command(cmd)` moves to G1 with `POST /commands`.
3. `meridianSystems(options: SimOptions)` takes `{ seed, dt }`. G5 widens it with `relayUrl` when `Comms` and `Tactical` move into the library.
4. The command queue and `attach()`/`detach()` wait for G1 and G7, and `COMPARTMENT` waits for G2. `DECK_PLAN`, the deck file and the initial air are in G0.
5. The driver's mode belongs to `bridge-api`: `SimDriver.forRoot({ mode })`. `SimOptions` stays `{ seed, dt }`. The static `Meridian` and `OfflineMeridian` run manual, and `setupFromEnv` defaults to live.
6. `bridge-api`'s graph check becomes a case in `test/check.test.ts`, so `main`'s `test` target and the release verify step run it. The `graph` target stays the writer of `graph.json`.
7. The golden runs in the library's `e2e-growth` target, pinned to `.nvmrc`'s Node. A case in the library's `test` target asserts rounded idle values that hold on any Node.

## Global Constraints

- Worktree `.claude/worktrees/feat/meridian-g0-kernel`. Prefix every nx command and every `git commit` and `git push` with `NX_NO_CLOUD=true NX_DAEMON=false`.
- The branch stays under 100 commits. A task is one to four commits.
- Never `--no-verify`, never a bare `git stash`, never a merge commit.
- Commit messages follow conventional commits with a scope from `commitlint.config.js` (`meridian-systems`, `bridge-api`, `repo`, `specs`), a lowercase subject, and the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Prose in READMEs, comments and commits follows the writing rules of `nexusdi-ways-of-working`.
- Every token is interface-first: an interface, a `Token<IFoo>` named for the role, and a class bound with `useClass`. Consumers declare tokens in `static deps = [...] as const`.
- No file under `examples/meridian-systems/src` reads the wall clock or an unseeded random source. The library's ESLint config enforces it (spec section 4.3). No file under `src/physics` imports `@nexusdi/`.
- A `*.module.ts` file holds tokens, providers and at most one small delegation, and stays under 120 lines.

### Heavy work

A heavy job is `npm ci`, a build of more than one project, any `e2e` or `e2e-growth` target, `nx run-many`, or `npm run size`. On weekdays from 09:00 to 17:00 one heavy job runs at a time on the machine: take the lock with `until mkdir /tmp/nexusdi-heavy.lock 2>/dev/null; do sleep 20; done`, set `trap 'rmdir /tmp/nexusdi-heavy.lock' EXIT`, and release it after the job. Outside those hours, skip the lock. Every nx command takes `--parallel=2`.

### Cleanup

Every task ends with this step before its review gate:

```sh
setopt null_glob 2>/dev/null; rm -rf libs/*/dist libs/*/test-output examples/*/dist examples/*/build \
  examples/*/test-output examples/*/out-tsc tmp
```

### Review gate

Each task ends with a review by a fresh opus reviewer that did not write the task. The reviewer reads the task's diff against this plan and the spec, runs the task's test command, checks the readability rule (a reader who opens a module file sees tokens, providers and imports first), and reports findings. The implementer fixes them in new commits. The gate passes when the reviewer reports no finding. The branch ends with a final review by an independent opus reviewer.

## Tasks

| Task | What                                                                    | Commits |
| ---- | ----------------------------------------------------------------------- | ------- |
| 0    | the commit scope and the generator scaffold                             | 2       |
| 1    | wire the library; the RNG and the gas physics; the deck plan            | 3 to 4  |
| 2    | the contracts and the four kernel classes                               | 3 to 4  |
| 3    | `Simulation`, `meridianSystems`, `roundSnapshot` and the module tests   | 2 to 3  |
| 4    | the purity repo-check                                                   | 1       |
| 5    | the golden, the Node pin and the library's `e2e-growth` target          | 2       |
| 6    | `SimDriver`, the ship setup, `setupFromEnv`, `graph.json` and its check | 3 to 4  |
| 7    | `GET /sim` and `POST /sim/advance` on three frameworks                  | 2 to 3  |
| 8    | `bridge-api`'s `e2e-growth` target and its cases                        | 2       |
| 9    | READMEs, fallow entries and the spec amendments                         | 2 to 3  |
| 10   | the full gate, the final review and the PR                              | 0       |

---

### Task 0: scope and scaffold (done)

- [x] `chore(repo): add the meridian-systems commit scope` (`commitlint.config.js`, `CONTRIBUTING.md`).
- [x] `feat(meridian-systems): scaffold with @nx/js:library`, the output of `nx g @nx/js:library --directory=examples/meridian-systems --name=@nexusdi/meridian-systems --bundler=none --unitTestRunner=vitest --linter=eslint`. The generator also stripped the comments from `nx.json` and the root `eslint.config.mjs` and changed nothing else in them, so the commit keeps both files as they were.

### Task 1: wiring, the RNG, the gas physics and the deck

Files:

- Delete: `examples/meridian-systems/src/lib/`
- Modify: `examples/meridian-systems/package.json`, `tsconfig.lib.json`, `tsconfig.spec.json`, `vitest.config.mts`, `src/index.ts`
- Create: `src/physics/rng.ts`, `src/physics/gas.ts`, `src/physics/constants.ts`, `deck/meridian.deck.json`
- Test: `src/physics/rng.test.ts`, `src/physics/__fixtures__/rng.seed-7.json`, `src/physics/gas.test.ts`

- [ ] Step 1: wire the scaffold. `package.json`: `version` `0.0.0`, `nx.tags: ["demo"]`, `dependencies` `{ "@nexusdi/core": "*" }`, `devDependencies` `{ "@nexusdi/vitest": "*" }`. `tsconfig.lib.json` and `tsconfig.spec.json` follow `examples/bridge-api`: `rootDir: "."` in the lib config, `module: esnext`, `moduleResolution: bundler`, `resolveJsonModule`, `verbatimModuleSyntax`, `lib: ["es2022", "esnext.disposable"]`, no `importHelpers`, `include` with `deck/*.json`, and references to `libs/core/tsconfig.lib.json` (and `libs/vitest`, `libs/testing` in the spec config). `vitest.config.mts`: `globals` off, `include: ['src/**/*.test.ts', 'test/**/*.test.ts']`, an `fsModuleCachePath` under `node_modules/.vite/examples/meridian-systems`. Delete `src/lib/`. Run `npm install` (heavy) for the lockfile, then `npx nx typecheck @nexusdi/meridian-systems` and `npx nx lint @nexusdi/meridian-systems`. Commit `chore(meridian-systems): wire the library into the workspace`.
- [ ] Step 2: write `rng.test.ts`. It checks `fnv1a32('')` is `0x811c9dc5` and `fnv1a32('a')` is `0xe40c292c` (the published FNV-1a vectors); that `splitmix32` from state `7` gives the first 1,000 values in `__fixtures__/rng.seed-7.json`; and that every value is a `uint32`. Generate the fixture once with a scratch script under the session scratchpad from the reference splitmix32 (state `+= 0x9e3779b9`, then `z = Math.imul(z ^ (z >>> 16), 0x21f0aaad)`, `z = Math.imul(z ^ (z >>> 15), 0x735a2d97)`, `z ^ (z >>> 15)`, all `>>> 0`). Run `npx nx test @nexusdi/meridian-systems` and see it fail on the missing module.
- [ ] Step 3: write `rng.ts`: `export function splitmix32(state: number): { value: number; state: number }` and `export function fnv1a32(text: string): number`, each over `Math.imul` and `>>> 0`, with a doc comment that names why integer arithmetic gives one sequence on every engine (§4.3). Run the test and see it pass. Commit `feat(meridian-systems): add splitmix32 and fnv-1a`.
- [ ] Step 4: write `gas.test.ts`. The habitat's initial air (`molesAt(101_300, 293, 120, AIR)`) gives `pressure(...)` of 101.3 kPa within 0.1 %, the fractions of §5.1 sum to 1, and `molesAt` then `pressure` round-trips any `P`, `T`, `V` to 1e-9 relative. A second case reads `deck/meridian.deck.json` and checks the four compartments, volumes, conductances, structure heat capacities and occupants of §5.1, and the four doors with their areas, in that order. See them fail.
- [ ] Step 5: write `constants.ts` (`R = 8.314`), `gas.ts` (`type Gas`, `AIR` fractions of §5.1 with volatiles as the rest, `pressure(moles, temperature, volume)`, `molesAt(pressure, temperature, volume, fractions)`) and the deck file: `{ "compartments": [{ "id", "volume", "conductance", "structureHeatCapacity", "occupants" }], "doors": [{ "id", "between": [a, b | "space"], "area" }], "initial": { "temperature": 293, "pressure": 101300 } }`. Run the tests. Commit `feat(meridian-systems): add the gas law and the deck plan`.
- [ ] Step 6: cleanup, then the review gate.

### Task 2: the contracts and the kernel classes

Files:

- Create: `src/simulation/contracts.ts`, `src/simulation/seeded-random.ts`, `src/simulation/fixed-step-clock.ts`, `src/simulation/ship-state-store.ts`, `src/simulation/fixed-step-loop.ts`
- Test: `src/simulation/seeded-random.test.ts`, `fixed-step-clock.test.ts`, `ship-state-store.test.ts`, `fixed-step-loop.test.ts`

`contracts.ts` holds every interface, data type and token of the kernel, as `bridge-api`'s `contracts.ts` does:

```ts
export interface SimOptions { readonly seed: number; readonly dt: number }
export type CompartmentId = 'bridge' | 'habitat' | 'reactor-bay' | 'airlock';
export interface CompartmentState { readonly moles: Readonly<Record<Gas, number>>; readonly temperature: number }
export interface ShipSnapshot { readonly tick: number; readonly time: number; readonly compartments: Readonly<Record<CompartmentId, CompartmentState>> }
export interface DeckPlan { ... }            // the deck file's shape
export type Phase = 1 | 2 | 3 | 4 | 5 | 6;
export interface IRandomSource { next(): number; fork(label: string): IRandomSource }
export interface ISimClock { readonly dt: number; readonly tick: number; readonly time: number; advance(): number }
export interface IShipState { snapshot(): ShipSnapshot; commit(next: ShipSnapshot): void }
export interface TickContext { readonly tick: number; readonly dt: number; readonly rng: IRandomSource }
export interface IShipSystem { readonly name: string; readonly phase: Phase; step(ship: ShipSnapshot, tick: TickContext): ShipSnapshot }
export interface ITickLoop { advance(ticks: number): ShipSnapshot }
export const SIM_OPTIONS = new Token<SimOptions>('SimOptions');
export const SIM_CLOCK = new Token<ISimClock>('SimClock');
export const RNG = new Token<IRandomSource>('RandomSource');
export const SHIP_STATE = new Token<IShipState>('ShipState');
export const SHIP_SYSTEMS = new MultiToken<IShipSystem>('ShipSystems');
export const TICK_LOOP = new Token<ITickLoop>('TickLoop');
export const DECK_PLAN = new Token<DeckPlan>('DeckPlan');
```

`ShipSnapshot` is one closed interface the library owns (P2 allows a closed set only its owner adds to). Each later increment adds its required record and its initial value in `ShipStateStore`.

- [ ] Step 1: write the four class tests, each constructing the class directly with plain values:
  - `SeededRandom`: `next()` is in `[0, 1)` and equals the fixture's first value divided by 2³² for seed 7; two sources at seed 7 agree on 100 draws; `fork('Safety')` gives the same 100 draws whether or not `fork('Weapons')` was called and drawn from first (§8.1); a fork's stream differs from its parent's.
  - `FixedStepClock`: starts at tick 0 and time 0; `advance()` returns the new tick; after 600 advances at `dt` 0.5 the time is exactly 300 (time is `tick * dt`, never a running sum).
  - `ShipStateStore`: the initial snapshot has tick 0, one record per deck compartment at 293 K and the deck's initial air, its keys equal the `CompartmentId` union (a typed list `COMPARTMENT_IDS` in `contracts.ts`), and the snapshot and its records are frozen. `commit(next)` replaces it.
  - `FixedStepLoop`: with three probe systems registered out of order (`phase 4 'b'`, `phase 1 'z'`, `phase 4 'a'`), one tick runs them as `z`, `a`, `b`, each on the snapshot the previous one returned; each system's `tick.rng` is the fork for its name, made once (two ticks draw a continuing stream); the loop stamps `tick` and `time` after the systems run, so a system that returns a wrong tick cannot change them; `advance(600)` returns tick 600; a second system named `a` makes the constructor throw an `Error` that names `a`; with no systems, `advance(n)` changes only `tick` and `time` and shares the compartment records.
    Run `npx nx test @nexusdi/meridian-systems` and see them fail.
- [ ] Step 2: write `contracts.ts`. Commit with Step 3.
- [ ] Step 3: write the four classes, one per file, each with `static deps = [...] as const`:
  - `SeededRandom` deps `[SIM_OPTIONS]`, holds the splitmix32 state; `fork(label)` returns `SeededRandom.from(fnv1a32(`${seed}:${label}`))`. Keep a static factory for the fork so the class has one constructor shape for the container.
  - `FixedStepClock` deps `[SIM_OPTIONS]`.
  - `ShipStateStore` deps `[DECK_PLAN]`, builds the initial snapshot with `molesAt`.
  - `FixedStepLoop` deps `[SIM_CLOCK, SHIP_STATE, RNG, all(SHIP_SYSTEMS)]` (§3.3); it reads `dt` from the clock. It sorts once in the constructor by phase, then by name with `<` and `>` (never `localeCompare`), and stores `{ system, rng: rng.fork(system.name) }`. `advance(ticks)` runs §4.2 steps 2 and 3 (step 1, the command queue, comes in G1) and returns the last snapshot.
    Run the tests. Commit `feat(meridian-systems): add the kernel contracts` and `feat(meridian-systems): add the clock, the random source, the ship state and the tick loop`.
- [ ] Step 4: cleanup, then the review gate.

### Task 3: the modules

Files:

- Create: `src/simulation/simulation.module.ts`, `src/meridian-systems.module.ts`, `src/simulation/round-snapshot.ts`, `test/ship-under-test.ts`, `test/fixtures.ts`
- Modify: `src/index.ts`
- Test: `test/simulation.test.ts`, `src/simulation/round-snapshot.test.ts`

- [ ] Step 1: write the failing tests.
  - `round-snapshot.test.ts`: `roundSnapshot` rounds every number to four significant digits with `Number(x.toPrecision(4))`, keeps integers such as the tick exact, and returns plain JSON.
  - `test/simulation.test.ts`, on `nexusTest(base, ShipUnderTest, { setup: (b) => b.override(SIM_OPTIONS, { useValue: { seed: 7, dt: 0.5 } }) })`: `Nexus.check(meridianSystems({ seed: 7, dt: 0.5 }))` passes; the probe systems of `ShipUnderTest` run in phase order through `TICK_LOOP`; a probe provider inside a module that `ShipUnderTest` imports reads `TICK_LOOP` (the global-import edge `MasterAlarm` and `JumpDrive` form later); and the idle ship after `advance(600)` reads, through `roundSnapshot`, tick 600, time 300, habitat temperature 293 and habitat pressure 101,300 Pa (`pressure(...)` rounded to four digits). These values sit far from any threshold, so the case holds on any Node and gates `main`.
  - `meridianSystems({ seed: 7, dt: 0.5 })` on its own builds with `Nexus.create`, and two builds advanced 600 ticks give equal snapshots.
    See them fail.
- [ ] Step 2: write `simulation.module.ts`, the `defineModule` call only: `name: 'Simulation'`, `global: true`, `options: SIM_OPTIONS`, `provide(SIM_CLOCK, { useClass: FixedStepClock })`, `provide(RNG, { useClass: SeededRandom })`, `provide(SHIP_STATE, { useClass: ShipStateStore })`, `provide(DECK_PLAN, { useValue: deck })` with the deck imported `with { type: 'json' }`, and the exports. Write `meridian-systems.module.ts`:

```ts
export function meridianSystems(options: SimOptions) {
  return defineModule({
    name: 'MeridianSystems',
    global: true,
    imports: [Simulation.forRoot(options)],
    providers: [
      // all(SHIP_SYSTEMS) reads the systems this module can see: its imports and the globals.
      provide(TICK_LOOP, { useClass: FixedStepLoop }),
    ],
    exports: [TICK_LOOP],
  });
}
```

`test/ship-under-test.ts` writes its root out in full, so a reader sees what the aggregate does: `Simulation.forRoot`, a `ProbeSystems` module that contributes two `IShipSystem` doubles to `SHIP_SYSTEMS` and holds the probe that reads `TICK_LOOP`, and `provide(TICK_LOOP, { useClass: FixedStepLoop })`. `src/index.ts` exports `meridianSystems`, `roundSnapshot`, the contracts and `pressure`, and no class.

- [ ] Step 3: run `npx nx test @nexusdi/meridian-systems` and `npx nx typecheck @nexusdi/meridian-systems`. Commit `feat(meridian-systems): add the simulation module and the meridianSystems aggregate`.
- [ ] Step 4: cleanup, then the review gate.

### Task 4: the purity repo-check

Files:

- Create: `tools/repo-checks/src/meridian-purity.ts`, `tools/repo-checks/src/meridian-purity.test.ts`, fixtures under `tools/repo-checks/src/__fixtures__/meridian-purity/`

- [ ] Step 1: write the test first. A pure function `impurities(files: readonly { path: string; text: string }[])` returns one line per hit. Fixture cases: a file that calls `Math.random()`, one with `Date.now()`, `new Date(`, `performance.now()`, `process.hrtime`, `setTimeout(`, `setInterval(` and `setImmediate(`, a file under `src/physics/` that imports `@nexusdi/core`, a `*.module.ts` of 121 lines, and a clean tree. Then a case on the real `examples/meridian-systems/src` that expects no hit. Comments count as hits, so no file mentions the names in prose. See it fail.
- [ ] Step 2: write the checker. Run `npx nx test @nexusdi/repo-checks -- meridian-purity`. Commit `test(repo): keep clocks, timers and nexusdi imports out of the ship physics`.
- Revision (review of PR #174): a text match missed imports and indirect reads, so ESLint enforces the replay rules. A scoped block in `examples/meridian-systems/eslint.config.mjs` for `src/**` sets `no-restricted-imports` (relative paths and `@nexusdi/core` alone, plus `vitest` in a test file), `no-restricted-globals` (the clocks, the timers, `crypto`, `process`, `Intl`, `eval`, `Function`, the GC hooks, `Atomics` and the global object) and `no-restricted-properties` (`Math.random`), and `no-restricted-syntax` refuses a dynamic `import()` and any read of `Math` other than `Math.name`. `impurities` keeps the two checks ESLint has no rule for: no `@nexusdi/` import under `src/physics` and the 120-line cap on a `*.module.ts` file. The test reads the resolved config with `calculateConfigForFile` and checks each rule and entry, and lints one case per known bypass with `lintText`.
- [ ] Step 3: cleanup, then the review gate.

### Task 5: the golden

Files:

- Create: `examples/meridian-systems/vitest.e2e-growth.config.ts`, `e2e/node-pin.ts`, `e2e/idle.e2e.ts`, `e2e/golden/idle.seed-7.json`
- Modify: `examples/meridian-systems/package.json` (the `e2e-growth` target), `tsconfig.spec.json` (include `e2e/**/*.ts`), `.fallowrc.jsonc`

- [ ] Step 1: write `e2e/idle.e2e.ts`: build `meridianSystems({ seed: 7, dt: 0.5 })`, record `roundSnapshot` at ticks 0, 1 and 600, and `await expect(JSON.stringify(record, null, 2) + '\n').toMatchFileSnapshot('golden/idle.seed-7.json')`. Write `e2e/node-pin.ts`, a vitest `globalSetup` that reads the workspace's `.nvmrc` and throws `the goldens run on Node <pinned> (.nvmrc); this is Node <current>` when `process.versions.node` differs. The config includes `e2e/**/*.e2e.ts`, names the project `@nexusdi/meridian-systems:e2e-growth`, and has its own `fsModuleCachePath`. The target is `nx:run-commands` with `cwd: examples/meridian-systems`, `dependsOn: ["^build"]`, command `vitest run --config vitest.e2e-growth.config.ts`.
- [ ] Step 2: run `npx nx run @nexusdi/meridian-systems:e2e-growth -- -u` (heavy) once to write the golden, read it, then run without `-u` and see it pass. Under `CI` Vitest writes no snapshot, so a missing golden fails. Add `examples/meridian-systems/e2e/**/*.ts`, `examples/meridian-systems/vitest.e2e-growth.config.ts` and `examples/meridian-systems/e2e/golden/*.json` to `.fallowrc.jsonc`'s entries with a comment, and add `deck/meridian.deck.json` only if `npx fallow dead-code` reports it.
- [ ] Step 3: commit `test(meridian-systems): pin the idle ship to a golden on the .nvmrc node`.
- [ ] Step 4: cleanup, then the review gate.

### Task 6: the driver and the ship setup in `bridge-api`

Files:

- Create: `examples/bridge-api/src/ship/sim-driver.module.ts`
- Modify: `examples/bridge-api/package.json` (`"@nexusdi/meridian-systems": "*"`), `tsconfig.lib.json` and `tsconfig.spec.json` (references), `src/ship/contracts.ts`, `src/ship/meridian.ts`, `src/ship/index.ts`, `src/ship-from-env.ts`, `graph.json`, `e2e/entries.e2e.ts`
- Test: `test/sim-driver.test.ts`, `test/ship-from-env.test.ts`, `test/check.test.ts`

- [ ] Step 1: write the failing tests.
  - `test/check.test.ts` gains: `expect(JSON.parse(JSON.stringify(inspect(Meridian, { plugins: graphPlugins }))), 'run nx run @nexusdi/bridge-api:graph and commit graph.json').toEqual(drawn)`, with `inspect` from `@nexusdi/devtools`. The CLI makes the same call (`libs/cli/src/graph.ts`), and the JSON round-trip drops `undefined` as the CLI's `JSON.stringify` does. `OfflineMeridian` and `offlineMeridian({ sim: { seed: 7, dt: 0.5 }, mode: 'live' })` pass `Nexus.check`.
  - `test/sim-driver.test.ts`, with `vi.useFakeTimers()`: a live ship advances one tick per 500 ms of fake time; a manual ship starts no timer (`vi.getTimerCount()` is 0) and `SIM_DRIVER.advance(3)` returns tick 3; disposing a live ship leaves no timer.
  - `test/ship-from-env.test.ts`: `setupFromEnv({})` is seed 7, dt 0.5, mode live; `SIM_MODE=manual SIM_SEED=42` gives those; `SIM_SEED` of `-1`, `1.5`, `abc` or `4294967296`, and `SIM_MODE=fast`, each throw an `Error` that names the variable and the accepted values.
    See them fail.
- [ ] Step 2: in `contracts.ts` add `type SimMode = 'live' | 'manual'`, `interface DriverOptions { readonly mode: SimMode }`, `interface ISimDriver { readonly mode: SimMode; advance(ticks: number): ShipSnapshot }`, `DRIVER_OPTIONS` and `SIM_DRIVER`, with `ShipSnapshot` as `import type` from `@nexusdi/meridian-systems`. Write `sim-driver.module.ts`: `WallClockDriver` (deps `[TICK_LOOP, SIM_OPTIONS, DRIVER_OPTIONS]`) starts `setInterval(() => this.loop.advance(1), dt * 1000)` in `onInit` when the mode is live and clears it in `[Symbol.dispose]()`; this is the demo's one timer. `SimDriver = defineModule({ name: 'SimDriver', options: DRIVER_OPTIONS, providers: [provide(SIM_DRIVER, { useClass: WallClockDriver })], exports: [SIM_DRIVER] })`.
- [ ] Step 3: in `meridian.ts` add `ShipSetup { sim: SimOptions; mode: SimMode }`, `SEEDED` (seed 7, dt 0.5, manual) with a comment that the static graphs run manual and `setupFromEnv` defaults to live, `meridian(relayUrl, setup = SEEDED)` and `offlineMeridian(setup = SEEDED)`, each importing `meridianSystems(setup.sim)` and `SimDriver.forRoot({ mode: setup.mode })` beside the modules they import today. `Meridian` and `OfflineMeridian` keep their names and exports. In `ship-from-env.ts` add `setupFromEnv(env = process.env): ShipSetup` and pass it to `meridian` or `offlineMeridian`. `e2e/entries.e2e.ts` sets `SIM_MODE: 'manual'` and `SIM_SEED: '7'` in the child's env (§8.3); its cases do not change.
- [ ] Step 4: run `npx nx run @nexusdi/bridge-api:graph`, which rewrites `graph.json`, read the diff (the new modules `MeridianSystems`, `Simulation`, `SimDriver` and their providers only), and commit it. Run `npx nx test @nexusdi/bridge-api`, `npx nx typecheck @nexusdi/bridge-api` and `npx nx run @nexusdi/bridge-api:e2e --parallel=2` (heavy): every existing case passes unchanged.
- [ ] Step 5: commits `feat(bridge-api): drive the simulation with a wall clock driver`, `feat(bridge-api): read the seed and the mode from the environment`, `test(bridge-api): check graph.json in the test target`.
- [ ] Step 6: cleanup, then the review gate.

### Task 7: the routes

Files:

- Create: `examples/bridge-api/src/bridge/sim-ticks.ts`
- Modify: `src/hono.ts`, `src/express.ts`, `src/fastify.ts`
- Test: `test/sim-ticks.test.ts`, `test/routes.test.ts`

- [ ] Step 1: write the failing tests. `sim-ticks.test.ts`: `parseTicks({ ticks: 3 })` is 3; `0`, `1.5`, `10_001`, `'3'`, a missing field and a non-object each give `undefined`. `routes.test.ts` on the fixture ship, for each framework: `GET /sim` answers tick 0; `POST /sim/advance` with `{ "ticks": 3 }` answers the rounded snapshot at tick 3, and a second `GET /sim` reads tick 3; `{ "ticks": 0 }` answers 400. A live ship (`offlineMeridian({ ..., mode: 'live' })` with fake timers) answers 404 on `POST /sim/advance`.
- [ ] Step 2: add both routes to the three entries. Each resolves `SIM_DRIVER` or `SHIP_STATE` through the adapter's `inject`, answers `roundSnapshot(...)`, gives 404 in live mode and 400 when `parseTicks` returns `undefined`. Express reads the body with `express.json()` on that route.
- [ ] Step 3: run `npx nx test @nexusdi/bridge-api` and `typecheck`. Commit `feat(bridge-api): serve the ship snapshot and advance it by hand`.
- [ ] Step 4: cleanup, then the review gate.

### Task 8: `bridge-api`'s growth e2e

Files:

- Create: `examples/bridge-api/vitest.e2e-growth.config.ts`, `e2e/growth/sim.e2e.ts`
- Modify: `examples/bridge-api/vitest.e2e.config.ts`, `project.json`, `tsconfig.spec.json`, `.fallowrc.jsonc`

- [ ] Step 1: write the config (name `@nexusdi/bridge-api:e2e-growth`, include `e2e/growth/**/*.e2e.ts`, its own `fsModuleCachePath`), the `e2e-growth` target (as the `e2e` target, with the new config), and `exclude: [...configDefaults.exclude, 'e2e/growth/**']` in `vitest.e2e.config.ts`. A case moves into the gating job with a `git mv` out of `e2e/growth/`.
- [ ] Step 2: write the cases on Hono, Express and Fastify through `e2e/servers.ts`, over `offlineMeridian(...)`: a manual ship advanced 600 ticks answers tick 600 and time 300, and `GET /sim` reads tick 600 and habitat temperature 293; a live ship answers 404 on `POST /sim/advance` and leaves no open handle after disposal; ticks of `0`, `1.5` and `10001` answer 400. One more case spawns `src/server.hono.ts` under `tsx` with `SIM_MODE=manual SIM_SEED=7 PORT=0 RELAY_URL=`, advances 600 ticks and reads `GET /sim`, so the environment path runs end to end.
- [ ] Step 3: run `npx nx run @nexusdi/bridge-api:e2e-growth --parallel=2` and `npx nx run @nexusdi/bridge-api:e2e --parallel=2` (heavy). The first passes; the second runs no growth case. Add `examples/bridge-api/vitest.e2e-growth.config.ts` to `.fallowrc.jsonc` beside the e2e config.
- [ ] Step 4: commit `test(bridge-api): run the simulation cases in an e2e-growth target`.
- [ ] Step 5: cleanup, then the review gate.

### Task 9: READMEs and the spec

Files:

- Modify: `examples/meridian-systems/README.md`, `examples/bridge-api/README.md`, `specs/2026-10-21-meridian-ship-systems-design.md`

- [ ] Step 1: the library README opens with the problem it solves for the demo, names the `Simulation` module, the aggregate and the multi token first and the physics after, and states that it is an example in the NexusDI repository that reaches core only through the public points any outside package has. It lists the `test` and `e2e-growth` targets and the golden's `-u` command. `bridge-api`'s README gains the two routes in its route table, `SIM_MODE` and `SIM_SEED` under Running a Server, and the `e2e-growth` target under Testing.
- [ ] Step 2: amend the spec. §3.2, §3.3 and §10.1: `TICK_LOOP` is bound in `MeridianSystems`, which is global, with the visibility reason. §3.1: `meridianSystems({ seed, dt })` in G0, `relayUrl` from G5. §4.4 and §10.1: `ISimDriver` is bound in `SimDriver` with `DRIVER_OPTIONS`, and the mode is `SimDriver.forRoot({ mode })`. §7.4: a G0b row (needs G0) with the items of ruling 2, and `BRIDGE_LINK.command` in G1. §8.3: the golden runs in the library's `e2e-growth` target. Add the rulings to section 15 as tech lead decisions.
- [ ] Step 3: run `npx prettier --check` on the changed files. Commit `docs(meridian-systems): describe the simulation kernel`, `docs(bridge-api): document the simulation routes and variables` and `docs(specs): record the g0 rulings in the ship systems spec`.
- [ ] Step 4: cleanup, then the review gate.

### Task 10: the gate and the PR

- [ ] Step 1: run the full gate (heavy): `npx nx run-many -t lint test build typecheck --parallel=2`, `npx nx run @nexusdi/bridge-api:e2e --parallel=2`, both `e2e-growth` targets, `npx nx run @nexusdi/bridge-api:graph`, `npx fallow dead-code` and `npx prettier --check .`. Then cleanup.
- [ ] Step 2: the final branch review by an independent opus reviewer; fix rounds until it approves.
- [ ] Step 3: rebase onto `origin/release/0.4`, push, and open the PR against `release/0.4`. The body lists the rulings, the G0b follow-up, and ends with the Claude Code line. Wait for CI and report the PR number and the result. Do not merge.
