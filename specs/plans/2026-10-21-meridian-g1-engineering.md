# Meridian G1, Engineering: Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Ledger: `.superpowers/sdd/meridian-g1/progress.md`.

Goal: the Starship Meridian gains its first ship system. `Engineering` runs the fusion reactor, the lithium coolant loop, the power router and the shield grid in phase 1 of the tick. A crew member queues commands through `POST /commands`, and the router refuses a load it cannot fit with `MERIDIAN_POWER_BUDGET`. The bridge console gains an engineering page whose form posts those commands. The seeded ship starts idle, so no earlier e2e case changes.

Architecture: one pull request, `feat/meridian-g1-engineering`, cut from `origin/release/0.4` after G0 (#174). The physics stays pure in `src/physics/thermal.ts` and `src/physics/power.ts`. The kernel gains a setpoint queue on `SHIP_STATE` and a command desk in the aggregate. `Engineering` lives in `src/systems/engineering/`, one class per file. `bridge-api` serves `POST /commands` and `GET /commands` on its three frameworks, and the console adds `BRIDGE_LINK.command(cmd)` and the route `/systems/engineering`.

Tech stack: Node from `.nvmrc` (24.20.0), TypeScript 6.0.3, Vitest 5.0.5, Nx 23.3.0, Hono 4.13.13, Express 5.3.0, Fastify 5.12.7, React Router 8.4.0, Playwright 1.64.

Spec: `specs/2026-10-21-meridian-ship-systems-design.md`. Section numbers below (§) refer to it. G0's conventions: `specs/plans/2026-10-21-meridian-g0-kernel.md`. Also the `nexusdi-ways-of-working` skill.

## Rulings this plan carries

The architect proposed and the tech lead decided these on 2026-10-21. Task 9 writes the spec amendments they need.

1. `Engineering` binds `REACTOR` (`FusionReactor`, `[SHIP_STATE]`), `COOLANT_LOOP` (`RadiatorLoop`, no deps, private), `POWER_ROUTER` (`PlasmaRouter`, `[SHIP_STATE, lazy(SHIELD_GRID)]`) and `SHIELD_GRID` (`DeflectorGrid`, `[SHIP_STATE, POWER_ROUTER]`). It contributes `EngineeringPhysics` (`[REACTOR, COOLANT_LOOP, POWER_ROUTER]`) to `SHIP_SYSTEMS` and `EngineeringCommands` (`[REACTOR, SHIELD_GRID]`) to `COMMAND_HANDLERS`. It exports `REACTOR`, `POWER_ROUTER`, `SHIELD_GRID`, `SHIP_SYSTEMS` and `COMMAND_HANDLERS`. `COMPUTER` stays in the docs regions only, since no simulated system reads it.
2. Commands reach their system through a contribution point. `COMMAND_HANDLERS` is a `MultiToken<ICommandHandler>`, and each handler names its `system`. `CommandDesk` (deps `[all(COMMAND_HANDLERS)]`) is bound to `COMMAND_DESK` in `MeridianSystems` and exported beside `TICK_LOOP`. `submit(body: unknown)` checks the envelope and hands the command to the handler of its system. `bridge-api` names no system.
3. `SHIP_STATE` queues setpoint changes and logs them. `queue(change)` returns `{ tick }`, the tick that applies it. `applyQueued(tick)` merges the changes in queue order at step 1 of that tick and logs each. `log()` returns the newest 1,000 entries, and `GET /commands` answers it. A refused command is never queued or logged.
4. The router and the grid form the §7.1 cycle with a real use on both sides. `PlasmaRouter.loads(ship)` reads the grid's load through `lazy(SHIELD_GRID)` on every tick. `DeflectorGrid.raise()` calls `PlasmaRouter.divert(load)`, which runs the same pure `allocatePower` the tick runs, at the reactor's current electric output, and throws `PowerBudgetError` when the result sheds the load.
5. G1 adds no alarm set. The records carry the facts: `reactor.tripped`, `coolant.temperature` and `power.shed`. `Safety` raises `REACTOR_TRIP`, `COOLANT_HIGH` and `LOAD_SHED` from them in G3. On a trip, `EngineeringPhysics` writes the reactor throttle setpoint to 0.
6. The coolant loop starts at 500 K, above lithium's 453.7 K melting point, behind radiator louvres. The radiated power is `λ · ε · σ · A · (T_c⁴ − T_bg⁴)` with `λ = clamp((T_c − 500 K) / 50 K, 0, 1)`. At idle λ is 0 and the loop holds 500 K exactly, so the idle golden gains flat records.
7. The shield grid's heat share is 0.25. G1 applies no heat to a compartment: the bay leak of §5.2 is wrong by about a thousand times (4.82 MW at full output), and G2 sets it.
8. The library raises two codes in G1: `MERIDIAN_POWER_BUDGET` (`PowerBudgetError`) and `MERIDIAN_BAD_COMMAND` (`BadCommandError`). `src/text.ts` exports `shipText` at the `./text` subpath. `POST /commands` answers 202 `{ tick }`, 400 for a `BadCommandError`, and 409 for any other `NexusError`, each refusal with `explain(error, { text: [shipText] })`. Registering `shipText` in `errors({ text })` stays in G3.
9. The console gains `BRIDGE_LINK.command(cmd)` and one static route, `/systems/engineering`, with the throttle and shields forms and the last answer. The gauges wait for G0b's `snapshot()`, and the page has no `lazySection`. Its growth case runs under `playwright.growth.config.mts`, and the main config ignores `e2e/growth/`.
10. `FusionReactor[Symbol.dispose]()` is the scram: it commits the current snapshot with the reactor level and throttle at 0. The shutdown test reads `trace()`'s `dispose:instance` events and asserts `SimDriver` before `ReactorCore`. G0b and G3 add their tokens to that sequence.
11. Spec figures: `C_c` is 8.34 × 10⁸ J/K, the coolant's time constant is 102 s at 1,186 K (the spec says 98 s) and 56 s at the 1,450 K trip, and a full-throttle heat-up from 500 K to 1,100 K takes 340 s. The 1,350 K alarm and the 1,450 K trip are out of reach in G1 (the hottest equilibrium is 1,192 K, at full output with the shields raised), so the trip test feeds a 1,450 K loop to the pure function.
12. Record shapes and ratings live beside their pure functions in `src/physics/`, and `simulation/contracts.ts` imports them with `import type`. `src/systems/engineering/contracts.ts` holds the interfaces and tokens. `Setpoints`, `SetpointChange` and the command contracts live in `src/simulation/commands.ts`, which keeps the files G0b edits small.

## Numbers the tests assert

Each was computed with Node by the architect and the tech lead, and each task's reviewer recomputes the ones its task asserts.

| Quantity                                    | Value                                         |
| ------------------------------------------- | --------------------------------------------- |
| Reactor ramp per tick (`r · dt`)            | 0.01, so full output after 100 ticks          |
| Electric output at full (`η · 3.63 GW`)     | 1.21 GW                                       |
| Coolant equilibrium at full output, no load | 1,185.6 K (test: 1,186 K ± 5 K)               |
| Coolant at idle after 600 ticks             | 500 K exactly                                 |
| Shields fit (200 MW) once the level reaches | 0.1653                                        |
| Throttle 1 queued at tick 0, after 16 ticks | level 0.16, 193.6 MW, raise answers 409       |
| Throttle 1 queued at tick 0, after 17 ticks | level 0.17, 205.7 MW, raise answers 202 (18)  |
| Priorities 1 to 4 at full demand            | 225.04 MW; 385 MW left with the drive burning |

## Global Constraints

- Worktree `.claude/worktrees/meridian-g1`. Prefix every nx command and every `git commit` and `git push` with `NX_NO_CLOUD=true NX_DAEMON=false`. Every nx command takes `--parallel=2`.
- The branch stays under 100 commits. A task is one to four commits.
- Never `--no-verify`, never a bare `git stash`, never a merge commit.
- Commit subjects follow conventional commits with a scope from `commitlint.config.js` (`meridian-systems`, `bridge-api`, `bridge-console`, `specs`), lowercase, with no `@` and no uppercase letter. Each message ends with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Prose in READMEs, comments, specs and commits follows the writing rules of `nexusdi-ways-of-working`.
- Every service is interface-first: an interface, a `Token<IFoo>` named for the role, and a class bound with `useClass`. A consumer declares tokens in `static deps = [...] as const`.
- No file under `src/physics` imports `@nexusdi/`. No file under `examples/meridian-systems/src` reads the wall clock or an unseeded random source (the library's ESLint config). A `*.module.ts` file holds `defineModule` and stays under 120 lines.
- Stay out of the files G0b owns: `src/telemetry/`, `plugins.ts`, the telemetry routes, the console's status strip and `/diagnostics`, and `BRIDGE_LINK.snapshot()` and `telemetry()`. Where both increments touch one file (`contracts.ts`, `fixed-step-loop.ts`, `ship-state-store.ts`, the three entries, `graph.json`, `bridge-link.ts`, `tests/doubles.ts`), keep the G1 change small and additive.

### Heavy work

A heavy job is `npm ci`, a build of more than one project, any `e2e` or `e2e-growth` target, or `nx run-many`. On weekdays from 09:00 to 17:00 one heavy job runs at a time on the machine: take the lock with `until mkdir /tmp/nexusdi-heavy.lock 2>/dev/null; do sleep 20; done`, set `trap 'rmdir /tmp/nexusdi-heavy.lock' EXIT`, and release it after the job. Outside those hours, skip the lock.

### Cleanup

Every task ends with this step before its review gate:

```sh
setopt null_glob 2>/dev/null; rm -rf libs/*/dist libs/*/test-output examples/*/dist examples/*/build \
  examples/*/test-output examples/*/out-tsc examples/bridge-console/.react-router tmp
```

### Review gate

Each task ends with a review by a fresh opus reviewer that did not write the task. The reviewer reads the task's diff against this plan and the spec, runs the task's test command, recomputes each physics number the task asserts, checks the readability rule (a reader who opens a module file sees tokens, providers and imports first), and reports findings. The implementer fixes them in new commits. The gate passes when the reviewer reports no finding. The branch ends with a final review by an independent opus reviewer.

## Tasks

| Task | What                                                                  | Commits |
| ---- | --------------------------------------------------------------------- | ------- |
| 0    | this plan                                                             | 1       |
| 1    | the reactor, coolant and power physics                                | 2       |
| 2    | the error codes and `shipText`                                        | 1 to 2  |
| 3    | the setpoint queue, the command log and the command desk              | 2 to 3  |
| 4    | `Engineering`: its classes, its module, the aggregate and the golden  | 3 to 4  |
| 5    | `POST /commands`, `GET /commands`, `graph.json` and the shutdown test | 2 to 3  |
| 6    | `bridge-api`'s engineering growth case                                | 1       |
| 7    | the console's `BRIDGE_LINK.command` and the engineering page          | 2       |
| 8    | the console's `e2e-growth` target and its case                        | 1 to 2  |
| 9    | READMEs and the spec amendments                                       | 3       |
| 10   | the full gate, the final review and the PR                            | 0       |

---

### Task 0: this plan

- [ ] Commit `docs(specs): plan the g1 engineering increment`.

### Task 1: the physics

Files:

- Create: `examples/meridian-systems/src/physics/thermal.ts`, `src/physics/power.ts`
- Modify: `src/physics/constants.ts` (`SIGMA = 5.67e-8`, `T_BACKGROUND = 4`)
- Test: `src/physics/thermal.test.ts`, `src/physics/power.test.ts`

`thermal.ts` exports, each field documented with its unit:

```ts
export interface ReactorRating {
  readonly thermal: number /* W at full */;
  readonly efficiency: number;
  readonly ramp: number; /* per second */
}
export interface ReactorRecord {
  readonly level: number /* 0..1 */;
  readonly thermal: number /* W */;
  readonly electric: number /* W */;
  readonly tripped: boolean;
}
export interface CoolantRating {
  readonly mass: number;
  readonly heatCapacity: number;
  readonly area: number;
  readonly emissivity: number;
  readonly standby: number;
  readonly band: number;
  readonly alarm: number;
  readonly trip: number;
}
export interface CoolantRecord {
  readonly temperature: number; /* K */
}
export const FUSION_REACTOR: ReactorRating = {
  thermal: 3.63e9,
  efficiency: 1 / 3,
  ramp: 0.02,
};
export const LITHIUM_LOOP: CoolantRating = {
  mass: 200_000,
  heatCapacity: 4_170,
  area: 24_000,
  emissivity: 0.9,
  standby: 500,
  band: 50,
  alarm: 1_350,
  trip: 1_450,
};
export function stepReactor(
  reactor: ReactorRecord,
  throttle: number,
  rating: ReactorRating,
  dt: number,
): ReactorRecord;
export function stepCoolant(
  coolant: CoolantRecord,
  heat: number /* W into the loop */,
  rating: CoolantRating,
  dt: number,
): CoolantRecord;
export function louvre(temperature: number, rating: CoolantRating): number; // λ
export function tripped(coolant: CoolantRecord, rating: CoolantRating): boolean; // T_c >= trip
```

`stepReactor` applies `u' = u + clamp(u_set − u, −r·dt, r·dt)` and leaves `tripped` as it found it. `power.ts` exports:

```ts
export interface PowerLoad {
  readonly id: string;
  readonly priority: number;
  readonly demand: number /* W */;
  readonly heatShare: number;
}
export interface LoadRecord {
  readonly id: string;
  readonly priority: number;
  readonly demand: number;
  readonly allocated: number;
}
export interface PowerRecord {
  readonly output: number /* W */;
  readonly loads: readonly LoadRecord[];
  readonly shed: readonly string[];
}
export function allocatePower(
  output: number,
  loads: readonly PowerLoad[],
): PowerRecord;
export function loadHeat(
  record: PowerRecord,
  loads: readonly PowerLoad[],
): number; // Σ heatShare · allocated
```

`allocatePower` sorts by priority, then by id with `<` and `>`. A load whose whole demand fits gets it. A load that does not fit gets 0 and joins `shed`, and the router moves on to the next. A load of demand 0 is never shed.

- [ ] Step 1: write `thermal.test.ts`. From level 0 at throttle 1, 100 steps of `dt` 0.5 reach level 1 and no step moves more than 0.01; a throttle of 0.3 stops the level at 0.3; at level 1 the electric output is 1.21 GW and the thermal 3.63 GW. `louvre` is 0 at and below 500 K, 0.5 at 525 K and 1 from 550 K. A loop at 500 K with no heat holds 500 K exactly for 600 steps. A loop driven with the full-output heat (`P_th − P_e` = 2.42 GW) from 500 K settles at 1,186 K ± 5 K after 20,000 steps and never overshoots 1,191 K. `tripped` is false at 1,449.9 K and true at 1,450 K. See them fail.
- [ ] Step 2: write `thermal.ts` and `constants.ts`. Commit `feat(meridian-systems): add the reactor and coolant physics`.
- [ ] Step 3: write `power.test.ts`. The loads fill by priority; a load that does not fit is shed and a later, smaller load still gets its share; the §5.7 case with the seven consumers at full demand (life support 40 kW, shields 200 MW, comms 5 MW, helm 20 MW, drive 600 MW, weapons 300 MW, FTL spool 900 MW) at 1.21 GW sheds the spool alone and leaves 85 MW unallocated; with the drive and the weapons at 0 the spool fits; `loadHeat` sums the shares. A property case draws 500 random load sets from `splitmix32` (seed 7) and checks that the allocation never exceeds the output, each load gets 0 or its whole demand, and `shed` lists exactly the loads that got 0 with a demand above 0. See them fail.
- [ ] Step 4: write `power.ts`. Run `npx nx test @nexusdi/meridian-systems --parallel=2` and `npx nx lint @nexusdi/meridian-systems --parallel=2`. Commit `feat(meridian-systems): allocate the reactor output by priority`.
- [ ] Step 5: cleanup, then the review gate.

### Task 2: the error codes and the text pack

Files:

- Create: `examples/meridian-systems/src/errors.ts`, `src/text.ts`
- Modify: `examples/meridian-systems/package.json` (the `./text` export), `src/index.ts`
- Test: `src/errors.test.ts`, `src/text.test.ts`

`errors.ts` holds `DOCS = 'https://github.com/NexusDI/core/tree/main/examples/meridian-systems#'`, `PowerBudgetError extends errorBase<'MERIDIAN_POWER_BUDGET', { consumer: string; demand: number; available: number }>('MERIDIAN_POWER_BUDGET', 'PowerBudgetError', DOCS)`, `BadCommandError extends errorBase<'MERIDIAN_BAD_COMMAND', { reason: 'envelope' | 'system' | 'action' | 'argument'; system: string; action: string; expected: string }>('MERIDIAN_BAD_COMMAND', 'BadCommandError', DOCS)`, and the `NexusErrorByCode` augmentation for both. Power fields are in watts. `text.ts` holds `formatNumber(value, digits)`, which rounds and groups thousands with a comma by a regular expression (`Intl` and `toLocaleString` follow the host locale), and `shipText`, which `satisfies ErrorTextPack`:

```text
[MERIDIAN_POWER_BUDGET] The shields load needs 200 MW, and the router has 193.6 MW free beside the loads above it.
  Fix: raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.
[MERIDIAN_BAD_COMMAND] A ship command is an object with a string system and a string action. The desk serves engineering.
  Fix: send { system, action, ...args } as JSON.
[MERIDIAN_BAD_COMMAND] No ship system is named 'warp-core'. The desk serves engineering.
  Fix: send the command to one of the systems above.
[MERIDIAN_BAD_COMMAND] engineering has no action 'warp'. It takes throttle with a level from 0 to 1 and shields with raised true or false.
  Fix: send one of the actions above with its arguments.
[MERIDIAN_BAD_COMMAND] engineering throttle got an argument it cannot use. It takes throttle with a level from 0 to 1 and shields with raised true or false.
  Fix: send the arguments in the ranges above.
```

`shipText` picks the MERIDIAN_BAD_COMMAND text by `reason`, and returns undefined for a reason it does not know, so the error keeps core's one-line message.

- [ ] Step 1: write the tests. `errors.test.ts`: each class carries its code, its name and its fields; `isNexusError(error, 'MERIDIAN_POWER_BUDGET')` narrows to `PowerBudgetError`; the one-line message ends with the README anchor `...meridian-systems#MERIDIAN_POWER_BUDGET`. `text.test.ts`: `formatNumber(193_600_000 / 1e6, 1)` is `'193.6'`, `formatNumber(98_410, 0)` is `'98,410'`, `formatNumber(1_234_567.89, 2)` is `'1,234,567.89'`; `explain(error, { text: [shipText] })` from `@nexusdi/errors` gives each text above (the test file imports `@nexusdi/errors` as a dev dependency, so add it to `devDependencies` and the spec tsconfig references, and let the ESLint test override allow it). See them fail.
- [ ] Step 2: write both files, the `./text` export (`types`, `import`, `default` to `./src/text.ts`), and export the two classes from `src/index.ts`. Run test, lint and typecheck. Commit `feat(meridian-systems): add the power budget and bad command errors with their text`.
- [ ] Step 3: cleanup, then the review gate.

### Task 3: the setpoint queue and the command desk

Files:

- Create: `examples/meridian-systems/src/simulation/commands.ts`, `src/simulation/command-desk.ts`
- Modify: `src/simulation/contracts.ts`, `src/simulation/ship-state-store.ts`, `src/simulation/fixed-step-loop.ts`, `src/meridian-systems.module.ts`, `src/index.ts`
- Test: `src/simulation/ship-state-store.test.ts`, `src/simulation/fixed-step-loop.test.ts`, `src/simulation/command-desk.test.ts`

`commands.ts`:

```ts
export interface Setpoints {
  readonly reactor: { readonly throttle: number };
  readonly shields: { readonly raised: boolean };
}
export type SetpointChange = {
  readonly [K in keyof Setpoints]?: Partial<Setpoints[K]>;
};
export interface QueuedCommand {
  readonly tick: number;
}
export interface LoggedChange {
  readonly tick: number;
  readonly change: SetpointChange;
}
export interface ShipCommand {
  readonly system: string;
  readonly action: string;
  readonly [arg: string]: unknown;
}
/** One system's commands. handle() throws a NexusError to refuse a command; any other throw is a bug. */
export interface ICommandHandler {
  readonly system: string;
  handle(command: ShipCommand): QueuedCommand;
}
export interface ICommandDesk {
  submit(body: unknown): QueuedCommand;
}
export const COMMAND_HANDLERS = new MultiToken<ICommandHandler>(
  'CommandHandlers',
);
export const COMMAND_DESK = new Token<ICommandDesk>('CommandDesk');
```

`contracts.ts` gains `reactor: ReactorRecord`, `coolant: CoolantRecord`, `power: PowerRecord` and `setpoints: Setpoints` on `ShipSnapshot` (each with `import type`), and `queue(change)`, `applyQueued(tick)` and `log()` on `IShipState`. `ShipStateStore` starts the records idle: level 0, thermal 0, electric 0, not tripped; the coolant at `LITHIUM_LOOP.standby`; power output 0 with no loads and nothing shed; throttle 0 and shields lowered.

- [ ] Step 1: write the failing tests. Store: the initial snapshot holds the idle records above, frozen; `queue()` returns `{ tick: snapshot().tick + 1 }`; `applyQueued(1)` merges two queued changes in queue order (the second throttle wins, the shields change keeps the throttle), logs each as `{ tick: 1, change }`, empties the queue, and returns a frozen snapshot; `log()` keeps the newest 1,000 entries after 1,001 changes. Loop: a change queued before `advance(1)` is in the snapshot the first system steps on, and a change queued between two ticks applies at the second. Desk: `submit` hands `{ system: 'probe', action: 'ping' }` to the probe handler and returns its `QueuedCommand`; a body that is not an object, or lacks a string `system` or `action`, throws `BadCommandError` with `reason: 'envelope'` naming the systems in `expected`; an unknown system throws `BadCommandError` with `reason: 'system'` and `expected` listing the known systems in name order; two handlers for one system make the constructor throw an `Error` that names it. See them fail.
- [ ] Step 2: write `commands.ts` and the contract changes. Write the store methods and `CommandDesk` (deps `[all(COMMAND_HANDLERS)]`). The loop changes one line: `let ship = this.state.applyQueued(tick);`. `meridianSystems` binds `provide(COMMAND_DESK, { useClass: CommandDesk })` with the same `all()` comment as `TICK_LOOP`, and exports it. `src/index.ts` exports the command contracts.
- [ ] Step 3: run test, lint and typecheck. The idle golden fails on its new records, which Task 4 rewrites; run `npx nx run @nexusdi/meridian-systems:e2e-growth --parallel=2 -- -u` here only if the reviewer wants each commit green, and review its diff by the rule of Task 4. Commits `feat(meridian-systems): queue setpoint changes and log them by tick` and `feat(meridian-systems): route commands to their system through command handlers`.
- [ ] Step 4: cleanup, then the review gate.

### Task 4: the Engineering module

Files:

- Create under `examples/meridian-systems/src/systems/engineering/`: `contracts.ts`, `fusion-reactor.ts`, `radiator-loop.ts`, `plasma-router.ts`, `deflector-grid.ts`, `engineering-physics.ts`, `engineering-commands.ts`, `engineering.module.ts`
- Modify: `src/meridian-systems.module.ts`, `src/index.ts`, `e2e/golden/idle.seed-7.json`, `test/simulation.test.ts`
- Test: `src/systems/engineering/*.test.ts` for the classes, `test/engineering.test.ts` for the module

`contracts.ts`:

```ts
export interface IReactorCore {
  /** Electric output now, in GW (docs §7.1). */ readonly output: number;
  readonly rating: ReactorRating;
  throttle(level: number): QueuedCommand;
}
export interface ICoolantLoop {
  readonly rating: CoolantRating;
}
export interface IPowerRouter {
  loads(ship: ShipSnapshot): readonly PowerLoad[];
  divert(load: PowerLoad): void;
}
export interface IShieldGrid {
  draw(ship: ShipSnapshot): PowerLoad;
  raise(): QueuedCommand;
  lower(): QueuedCommand;
}
export const REACTOR = new Token<IReactorCore>('ReactorCore');
export const COOLANT_LOOP = new Token<ICoolantLoop>('CoolantLoop');
export const POWER_ROUTER = new Token<IPowerRouter>('PowerRouter');
export const SHIELD_GRID = new Token<IShieldGrid>('ShieldGrid');
```

The classes, each in its own file with `static deps`:

- `FusionReactor` `[SHIP_STATE]`: `output` reads `snapshot().reactor.electric / 1e9`; `rating` is `FUSION_REACTOR`; `throttle(level)` queues `{ reactor: { throttle: level } }`; `[Symbol.dispose]()` commits the current snapshot with the reactor at level 0, no output and the throttle at 0 (the scram, docs §7.1 "the control rods drop").
- `RadiatorLoop`, no deps: `rating` is `LITHIUM_LOOP`.
- `PlasmaRouter` `[SHIP_STATE, lazy(SHIELD_GRID)]`: `loads(ship)` returns `[this.shields().draw(ship)]`; `divert(load)` runs `allocatePower(snapshot().reactor.electric, loads with load swapped in by id)` and throws `PowerBudgetError({ consumer, demand, available })` when `shed` holds the load, with `available` the output less what the trial gave the loads of higher priority. It never calls the thunk in its constructor.
- `DeflectorGrid` `[SHIP_STATE, POWER_ROUTER]`: `draw(ship)` is `{ id: 'shields', priority: 2, demand: raised ? 200e6 : 0, heatShare: 0.25 }`; `raise()` diverts the raised load, then queues `{ shields: { raised: true } }`; `lower()` queues the lowered setpoint.
- `EngineeringPhysics` `[REACTOR, COOLANT_LOOP, POWER_ROUTER]`, `name = 'Engineering'`, `phase = 1`: steps the reactor on the throttle setpoint, allocates its electric output over `router.loads(ship)`, steps the coolant with `thermal − electric + loadHeat`, and on a trip sets `reactor.tripped` and writes the throttle setpoint to 0.
- `EngineeringCommands` `[REACTOR, SHIELD_GRID]`, `system = 'engineering'`: `throttle` takes a finite `level` from 0 to 1, `shields` takes a boolean `raised`; any other action throws `BadCommandError` with `reason: 'action'`, and a bad argument with `reason: 'argument'`, each with `expected` listing the actions and their ranges.

`engineering.module.ts` holds `defineModule` alone:

```ts
export const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    // Private: other systems read the reactor and the router, never the loop.
    provide(COOLANT_LOOP, { useClass: RadiatorLoop }),
    provide(POWER_ROUTER, { useClass: PlasmaRouter }),
    provide(SHIELD_GRID, { useClass: DeflectorGrid }),
    provide(SHIP_SYSTEMS, { useClass: EngineeringPhysics }),
    provide(COMMAND_HANDLERS, { useClass: EngineeringCommands }),
  ],
  exports: [REACTOR, POWER_ROUTER, SHIELD_GRID, SHIP_SYSTEMS, COMMAND_HANDLERS],
});
```

- [ ] Step 1: write the class tests, each constructing its class with plain doubles: the reactor's `output` in GW and its queued throttle; the scram commits level 0 and throttle 0 at the same tick; the router's `loads` reads the grid only when called; `divert` refuses 200 MW at 193.6 MW with `available` 193.6e6 and accepts it at 205.7 MW; the grid's `draw` follows its setpoint; the physics trips and zeroes the throttle when handed a 1,450 K loop, and sheds the raised shields when the output falls under 200 MW; the commands refuse a level of 1.5, a string level, a missing `raised` and an unknown action with `BadCommandError`. See them fail, then write the classes. Commit `feat(meridian-systems): add the reactor, coolant loop, power router and shield grid`.
- [ ] Step 2: write `test/engineering.test.ts` on `meridianSystems({ seed: 7, dt: 0.5 })` with `Nexus.create`: `Nexus.check` passes; `ship.get(COOLANT_LOOP)` throws `NEXUS_NOT_VISIBLE` and `ship.get(POWER_ROUTER)` resolves (a system shows its panel and keeps its pipes); through `COMMAND_DESK`, throttle 1 queued at tick 0 answers tick 1, after 16 ticks a raise throws `MERIDIAN_POWER_BUDGET`, after 17 a raise answers tick 18, and after one more tick `power.loads` gives the shields 200 MW; a throttle back to 0 then sheds the shields with the setpoint still raised; the idle ship after 600 ticks reads level 0, coolant 500 K and no load; disposing the ship leaves `SHIP_STATE`'s last snapshot at level 0. See it fail.
- [ ] Step 3: write `engineering.module.ts`, import `Engineering` in `meridianSystems` and add `Engineering` to its exports, so the root reads `REACTOR`, `POWER_ROUTER` and `SHIELD_GRID`. `src/index.ts` exports the engineering contracts and no class. Run test, lint and typecheck, and the purity check (`npx nx test @nexusdi/repo-checks --parallel=2 -- meridian-purity`). Commit `feat(meridian-systems): run engineering in phase one of the tick`.
- [ ] Step 4: run `npx nx run @nexusdi/meridian-systems:e2e-growth --parallel=2 -- -u` (heavy), then without `-u`. Check the golden diff: it adds the `reactor`, `coolant`, `power` and `setpoints` records only, and `tick`, `time` and `compartments` stay byte-identical. Commit `test(meridian-systems): add the idle engineering records to the golden`.
- [ ] Step 5: cleanup, then the review gate.

### Task 5: the command routes and the shutdown test

Files:

- Create: `examples/bridge-api/src/bridge/commands.ts`
- Modify: `src/hono.ts`, `src/express.ts`, `src/fastify.ts`, `graph.json`, `package.json` only if a dependency is missing
- Test: `test/commands.test.ts`, `test/routes.test.ts`, `test/shutdown.test.ts`

`commands.ts` exports `answerCommand(desk: ICommandDesk, body: unknown): { status: 202 | 400 | 409; body: unknown }`. Success answers 202 `{ tick }`. `error instanceof BadCommandError` answers 400, and any other `NexusError` (`isNexusError(error)`) answers 409, each with `{ code, message, fix }` from `explain(error, { text: [shipText] })`. Anything else is rethrown. The route compares no code.

- [ ] Step 1: write the failing tests. `commands.test.ts` with stub desks: 202 with the tick; 400 with the bad command text; 409 with the power budget text; a plain `Error` rethrown. `routes.test.ts`, for each framework on the fixture ship: `POST /commands` with a throttle answers 202 `{ tick: 1 }`, a shields raise at the idle reactor answers 409 with `code: 'MERIDIAN_POWER_BUDGET'`, `{ system: 'warp' }` answers 400, a non-JSON body answers 400, a body over 100 kB answers 413, and `GET /commands` answers the log after one advance. `shutdown.test.ts`: a live-mode ship built with `bridgePlugins({ trace })` and fake intervals, disposed, gives `dispose:instance` events whose tokens, filtered to `['SimDriver', 'ReactorCore']`, come in that order, and `SHIP_STATE` read before the disposal shows level 0 after it. See them fail.
- [ ] Step 2: write `commands.ts` and the routes on the three entries, each a few lines that inject `COMMAND_DESK` (or `SHIP_STATE` for the log), reuse `SIM_BODY_LIMIT` and the JSON content-type rule of `/sim/advance`, and answer through `answerCommand`. Commands run in live and manual mode.
- [ ] Step 3: run `npx nx run @nexusdi/bridge-api:graph --parallel=2`, read the diff (the `Engineering` module, its six providers and `COMMAND_DESK` only), and commit it. Run test, typecheck, lint, and `npx nx run @nexusdi/bridge-api:e2e --parallel=2` (heavy): every existing case passes unchanged. Commits `feat(bridge-api): queue ship commands over http` and `test(bridge-api): check that the reactor scrams after the driver stops`.
- [ ] Step 4: cleanup, then the review gate.

### Task 6: `bridge-api`'s engineering growth case

Files:

- Create: `examples/bridge-api/e2e/growth/engineering.e2e.ts`

- [ ] Step 1: on Hono, Express and Fastify through `e2e/servers.ts`, over a manual `offlineMeridian(...)` on seed 7: `POST /commands` throttle 1 answers 202 tick 1; `POST /sim/advance` 16 ticks; a shields raise answers 409 whose `message` reads `The shields load needs 200 MW, and the router has 193.6 MW free beside the loads above it.`; advance 1; the raise answers 202 tick 18; advance 1; `GET /sim` gives the shields 2e8 W allocated and a reactor level of 0.18; `GET /commands` lists the throttle at tick 1 and the raise at tick 18.
- [ ] Step 2: run `npx nx run @nexusdi/bridge-api:e2e-growth --parallel=2` (heavy). Commit `test(bridge-api): raise the shields once the reactor output fits them`.
- [ ] Step 3: cleanup, then the review gate.

### Task 7: the console's command link and engineering page

Files:

- Create: `examples/bridge-console/app/routes/systems/engineering.tsx`
- Modify: `app/bridge/bridge-link.ts`, `app/routes.ts`, `app/routes/layout.tsx`, `package.json` (devDependency `@nexusdi/meridian-systems`), `tsconfig.app.json` and `tsconfig.spec.json` references if the type import needs them
- Test: `tests/bridge-link.test.ts`, `tests/doubles.ts`, `tests/routes/engineering.spec.tsx`

`IBridgeLink` gains `command(cmd: ShipCommand): Promise<CommandAnswer>`, with `ShipCommand` an `import type` from `@nexusdi/meridian-systems` and `CommandAnswer = { accepted: true; tick: number } | { accepted: false; status: 400 | 409; code: string; message: string; fix?: string }`. `BridgeApiLink.command` posts JSON to `commands` with the mission header and the request's signal, and throws on any other status.

- [ ] Step 1: write the failing tests. `bridge-link.test.ts` on a stub server: a 202 gives `{ accepted: true, tick }`, a 409 gives the refusal with its text and fix, a 500 throws. `doubles.ts` gains `fakeBridgeLink.command`, which accepts a throttle and refuses a shields raise with the power budget text. `engineering.spec.tsx` on `nexusTest` with the fake: the page renders the throttle and shields forms; submitting a throttle shows `Queued for tick 1`; submitting a raise shows the refusal message and its `Fix:` line.
- [ ] Step 2: write the link method, the route `route('systems/engineering', 'routes/systems/engineering.tsx')`, the page (an `action` through `di.inject` and `BRIDGE_LINK`, and the two forms with the last answer), and an `Engineering` link in the layout's nav. Run `npx nx test @nexusdi/bridge-console --parallel=2`, typecheck and lint. Commits `feat(bridge-console): send ship commands through the bridge link` and `feat(bridge-console): add the engineering page`.
- [ ] Step 3: cleanup, then the review gate.

### Task 8: the console's growth e2e

Files:

- Create: `examples/bridge-console/playwright.growth.config.mts`, `e2e/growth/engineering.spec.ts`
- Modify: `playwright.config.mts` (`testIgnore: ['growth/**']`), `package.json` (the `e2e-growth` target), `tsconfig.e2e.json`, `.fallowrc.jsonc`

- [ ] Step 1: the growth config reuses the main config's two web servers with `testDir: './e2e/growth'`. If G0b has landed its own growth config on `origin/release/0.4`, reuse it. The `e2e-growth` target runs `playwright test --config playwright.growth.config.mts` from the project directory with `dependsOn: ["build", "^build"]`. The case opens `/systems/engineering`, raises the shields at the idle reactor, and reads the refusal message and its fix; then sets the throttle and reads `Queued for tick 1`. It asserts no console error.
- [ ] Step 2: run `npx nx run @nexusdi/bridge-console:e2e-growth --parallel=2` and `npx nx run @nexusdi/bridge-console:e2e --parallel=2` (heavy). The second runs no growth case. Add the growth config to `.fallowrc.jsonc` beside the e2e config if `npx fallow dead-code` reports it. Commit `test(bridge-console): refuse the shields at the idle reactor in a growth case`.
- [ ] Step 3: cleanup, then the review gate.

### Task 9: READMEs and the spec

Files:

- Modify: `examples/meridian-systems/README.md`, `examples/bridge-api/README.md`, `examples/bridge-console/README.md`, `specs/2026-10-21-meridian-ship-systems-design.md`

- [ ] Step 1: the library README gains an Engineering section that names the module, its exports, the private `COOLANT_LOOP`, the `lazy()` cycle between the router and the grid, the command desk and the multi token `COMMAND_HANDLERS` first, and the physics after. It gains a section per error code, each opened by an explicit `<a id="MERIDIAN_POWER_BUDGET"></a>` (and `<a id="MERIDIAN_BAD_COMMAND"></a>`) above its heading, so the upper-case fragment of the errors' docs link reaches it. `bridge-api`'s README gains `POST /commands` and `GET /commands` in its route table, and the console's README the engineering page and its `e2e-growth` target.
- [ ] Step 2: amend the spec with the rulings: §3.1 (`text.ts` in G1, the aggregate exports), §3.2 and §3.3 (the Engineering row and the class rows, `COMPUTER` in the docs only, the desk and handler rows), §4.2 step 1, §5.6 (the 500 K start, the louvres, `C_c` 8.34 × 10⁸ J/K, 102 s at 1,186 K and 56 s at the trip, 340 s, the unreachable alarm and trip, shields h 0.25, the trip as a record field), §5.2 (the bay leak waits for G2 with its corrected law), §5.7 (the command-time check and the tick-time shed), §6 (the lazy row, the errors() text row in G1, the dispose row), §6.4 (five codes), §7.1 (the two command routes and their answers), §7.2 (`/systems/engineering`, form and answer in G1, gauges after G0b), §8.2 (the shutdown test), §10.1 and §10.2 (the new names), and the rulings in section 15 as tech lead decisions.
- [ ] Step 3: run `npx prettier --check` on the changed files. Commits `docs(meridian-systems): describe the engineering module`, `docs(bridge-api): document the command routes`, `docs(bridge-console): document the engineering page` and `docs(specs): record the g1 rulings in the ship systems spec`.
- [ ] Step 4: cleanup, then the review gate.

### Task 10: the gate and the PR

- [ ] Step 1: run the full gate (heavy): `npx nx run-many -t lint test build typecheck --parallel=2`, `npx nx run @nexusdi/bridge-api:e2e --parallel=2`, `npx nx run @nexusdi/bridge-console:e2e --parallel=2`, every `e2e-growth` target (`npx nx run-many -t e2e-growth --projects=tag:demo --parallel=2`), `npx nx run @nexusdi/bridge-api:graph --parallel=2`, `npx fallow dead-code` and `npx prettier --check .`. Then cleanup.
- [ ] Step 2: the final branch review by an independent opus reviewer; fix rounds until it approves.
- [ ] Step 3: rebase onto `origin/release/0.4`, rerun the graph and the gate if G0b landed, push, and open the PR against `release/0.4`. The body lists the rulings and ends with the Claude Code line. Wait for CI, fix any CodeQL alert, and report the PR number and the result. Do not merge.
