# Meridian G4, the Airlock Drill: Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Ledger: `.superpowers/sdd/meridian-g4/progress.md` in the main checkout.

Goal: the Starship Meridian runs its airlock cycle as a drill under the interlock. The crew pumps the airlock down, vents it to the interlock's 5,000 Pa, opens the outer door, holds it 20 ticks, shuts it, refills the airlock and opens the inner door once the interlock passes it. The drill uses the commands G2 and G3 added: `life-support pump` and `vent`, and `safety open` and `close`. G4 adds no route, no command, no module and no ship behaviour. It adds a gating module test of the drill, a golden, a route case on each of the three frameworks, a fourth runtime case, the console's airlock panel with its growth case, and the spec and README text for all of it.

Architecture: one pull request, `feat/meridian-g4-airlock`, cut from `origin/release/0.4` at `7a8c1d34` (G0, G0b, G1 #180, G2 #183 and G3 #184 merged). Ledger `.superpowers/sdd/meridian-g4/progress.md` in the main checkout. The library gains tests and a golden. `bridge-api` gains a route case, the `airlockDrill` case in `test/runtime/growth-cases.ts`, and runtime harnesses that build the ship with `bridgePlugins({ scopes })`. The console gains `/airlock` inside the ship layout with shared door and airlock components, and a fourth growth project.

Tech stack: Node from `.nvmrc` (24.20.0), TypeScript 6.0.3, Vitest 5.0.5, Nx 23.3.0, Hono 4.13.13, Express 5.3.0, Fastify 5.12.7, React Router 8.4.0, Playwright 1.64, Deno 2.9.6, Bun 1.4.2.

Spec: `specs/2026-10-21-meridian-ship-systems-design.md` (§ below). Earlier plans: `specs/plans/2026-10-21-meridian-g0-kernel.md`, `-g0b-telemetry.md`, `-g1-engineering.md`, `-g2-lifesupport.md`, `-g3-safety.md`. Also the `nexusdi-ways-of-working` skill.

## Owner rulings

1. Earlier e2e cases and goldens stay unchanged. A golden may gain lines, and no earlier assertion changes.
2. Console gauges use SI units: K as whole numbers, kPa, Pa, mol and W.
3. Deterministic checks gate the growth track: the unit tests, `check.test.ts`'s graph check and the purity checks run in `main`, and `e2e-growth` never gates.
4. The rule of three applies everywhere except lists of figures or ids. No absolute local path and no vault path appears in a committed file.

## Rulings this plan carries

The architect proposed and the tech lead decided these on 2026-10-22. The tech lead's text overrides the architect's. The full text and the node scripts behind each figure sit in the session scratchpad's `meridian-g4/` folder (`architect.md`, `rulings.md`, `drill.mts`, the `arch-*` and `tl-*` scripts and their logs). Task 7 writes them into the spec, each as "tech lead, G4 ruling N".

1. Scope. G4 adds no route, no command, no sequencer and no ship behaviour. "Its routes and commands" means the ones the drill uses: `POST /commands`, `GET /sim`, `POST /sim/advance` and `GET /commands`. One gating parity case per framework covers them, and the drill's growth case runs on each Node server. A tick-driven sequencer would write door setpoints past `PressureInterlock`, and one that calls `BLAST_DOORS.open` gets the wrapped instance only where `bridge-api` registers the interceptor, so the library and the bridge would run two ships. The sequencer stays out as the owner's option.
2. The schedule. The drill runs from tick 0 with throttle 0.01, life support online and `pump evacuate`. At tick 288 it queues `pump off` and `vent open true`. At 317 `open airlock-outer` passes at 4,967 Pa and applies at 318. At 337 it queues `close airlock-outer`, `vent open false` and `pump fill`. At 446 `open habitat-airlock` passes at 4,991 Pa and applies at 447, together with `pump off`. The pump-down ends at the stall (rise 101,338.6 Pa at 288), the outer door stays open 20 ticks, and the command log holds five entries, at ticks 1, 289, 318, 338 and 447. Every refusal and accept comes from `tl-golden.log`, and no rounded difference sits within 0.03 Pa of a half pascal.
3. The golden. `examples/meridian-systems/e2e/airlock.e2e.ts` writes `e2e/golden/airlock.seed-7.json`: `roundSnapshot` of the whole snapshot at ticks 288, 317, 337, 446 and 466. The ship registers the interlock as `test/safety.test.ts` does, and the case runs a step table `{ at, commands }` that holds the accepted commands alone. A refused open queues nothing, so the golden reads the same ship either way, and an accepted command the interlock refused would throw and fail the case. The interlock assertions live in the gating module test `test/airlock.test.ts`, since a golden in `e2e-growth` never gates. The `idle`, `life-support` and `safety` goldens stay byte-identical.
4. Alarms. The drill raises no alarm in any room: the habitat falls at −184.6 Pa/s at worst against the −2,000 Pa/s limit, and the airlock has no occupant. The bypass case (no interlock) raises `DECOMPRESSION habitat` at tick 339 and clears it at 340, and `test/safety.test.ts` already covers that law. The module test asserts an empty alarm set on every tick of the drill.
5. bridge-api. The route case `the airlock commands on %s` in `test/routes.test.ts` runs on `scopedShip` on Hono, Express and Fastify. `airlockDrill` joins `growthCases` in `test/runtime/growth-cases.ts` as the fourth case, from tick 0 with fixed tick counts far from every threshold, and reads `GET /commands` at the end. `test/runtime/growth.ts` and `test/worker/growth/sim.test.ts` build each ship as `worker.offline.ts` does: one `nodeScopes()` passed to `bridgePlugins({ scopes })` and to `createBridge(ship, { scopes })`. Without the plugin the interlock never refuses. The three earlier cases keep their code and assertions, and no route they call reaches an interceptor. `e2e/growth/airlock.e2e.ts` runs `airlockDrill` on the three Node servers through `withShip`. The graph does not change, and `check.test.ts` stays as it is.
6. Console. The airlock panel lives at `/airlock`, inside `ship-layout.tsx`, with a nav link in `layout.tsx` beside the safety one. Paths under `/systems/` name a ship system, and §7.2 reserves `/systems/:system` for the deferred `lazySection` form, so the compartment-level panel sits outside it. The panel is built on `SystemPage`, `ControlSection`, `Gauges` and `systemAction`. Its loader is `snapshotLoader` (one `GET /sim`), null offline. Its gauges list `Pump` (`off`, `evacuate` or `fill`), `Vent` (Open or Shut) and the two `Door` gauges with each side's true pressure to 0.1 kPa and `Space side` at 0.0 kPa. Its door select lists `habitat-airlock` and `airlock-outer` alone. `systemAction(AIRLOCK_SYSTEMS, { compartment: 'text', mode: 'text', open: 'boolean', door: 'text' })` takes `AIRLOCK_SYSTEMS = { pump: 'life-support', vent: 'life-support', open: 'safety', close: 'safety' }`. `systemAction` and `commandFrom` widen `system` to `string | Readonly<Record<string, string>>`, and `commandFrom` reads the record with `Object.hasOwn(system, action) ? system[action] : ''`, so the desk refuses an action outside the record with `MERIDIAN_BAD_COMMAND` (`reason: 'system'`). `Door`, `DOORS`, `sideName` and `sidePressure` move from `safety.tsx` to `app/routes/systems/doors.tsx`. `CommandSelect` moves to `system-page.tsx`. The pump and vent forms move from `life-support.tsx` to `app/routes/systems/airlock-controls.tsx` as `AirlockControls`. The `system-page.tsx` and `system-action.server.ts` doc comments say the pages under `/systems` and the airlock panel share them. The life-support and safety route tests pass unchanged. The growth case `e2e/growth/airlock.spec.ts` runs in a fourth Playwright project `airlock` with `dependencies: ['safety']`, and the `chromium` project's `testIgnore` becomes `/(life-support|safety|airlock)\.spec\.ts/`.
7. Spec amendments (Task 7). §7.4 keeps its bullets and gains one sentence: "G4 adds no module and no physics: it runs G2's and G3's commands as the airlock drill, with its golden, a module test, a case on each runtime and the console's airlock panel, and `graph.json` stays as it is." The G4 row reads "the airlock drill: the pump and vent cycle across `habitat`, `airlock` and space through the doors under the interlock, with its golden and the console's airlock panel". §5.7: "The airlock pump-down peaks at 39.3 kW in the full model" holds only to the first stall, and becomes "Life support asks 39.3 kW at the first stalled tick of a pump-down from tick 0, 34.17 kW of it for the pump. A stalled pump keeps its 34.17 kW while it runs, and the rest of life support climbs, to 41.0 kW in all at tick 600." (39,303.6 W at 289, 39,382.1 W at 300, 41,027.4 W at 600, from `arch-spec.log` 2). §5.4: after "a vent on a full airlock starts at −4.18 kPa/s, above it" add that the vent from tick 289 takes the stalled airlock from 9,089 Pa under 5 kPa at tick 317, the outer door from tick 318 takes it under 100 Pa at tick 319, and the fill from tick 338 brings it within 5 kPa of the habitat at tick 446. §5.11: the airlock sentence keeps −4.18 and −9.18 kPa/s and adds that the drill opens the outer door at 4,967 Pa with the vent open, −9,135.3 Pa/s on its first tick, and raises no alarm in any room (habitat −184.6 Pa/s at worst). §7.2: the route table gains `/airlock` (G4), and the ship-layout paragraph reads "wraps `/diagnostics`, from G1 `/systems/*` and from G4 `/airlock`", followed by the panel's description and the `systemAction` record form. §7.1: G4 adds no route; the e2e-growth paragraph gains the drill and the route test paragraph gains the airlock command case. §8.3: the runtime sentence becomes "run four cases: the shape of `/sim` at tick 0, 600 ticks to rounded values far from any threshold, a first telemetry frame (section 7.1), and from G4 the airlock drill, whose reads sit far from each threshold (the outer door opens 1,051 Pa under the interlock, and the inner door five fill ticks from the limit on either side)". It also names the new golden with its ticks, the module test, the route case and the fourth console project. §13: the G4 item gains its settlement (the drill runs the existing commands, adds no command, and the unoccupied airlock raises no alarm). §15: ten rows, below. The closing paragraph adds `specs/plans/2026-10-21-meridian-g4-airlock.md` to the plans it lists.
8. Prose nits. `examples/meridian-systems/src/physics/safety.ts:91` becomes ``/** The engineering records Safety reads this tick, with `coolant` in K. */``. `examples/bridge-api/README.md:100` becomes: "The inner door stands open after the first command, so close it first. Then bring life support online and open the airlock's vent. Once the airlock holds under 5,000 Pa, the interlock lets the outer door open." Life support must be online, since with `online` false no term of the atmosphere runs (`atmosphere.ts:72`), and a shed tick still runs the vent (§5.4).
9. Duplication. `npx fallow dupes` reads 2.1207 % at `7a8c1d34` (1,402 of 66,109 lines, `arch-dupes.json`). At 2.15 % the branch may add 19 duplicated lines plus 2.15 % of its new counted lines. Fallow counts plain `.ts` and `.tsx` files and `*.e2e.ts`, and leaves out `*.spec.*` and `*.test.*`. The counted G4 files are `e2e/airlock.e2e.ts`, `test/runtime/growth-cases.ts`, `e2e/growth/airlock.e2e.ts`, the console's `app/` files and its `e2e/growth/ship.ts`. In `growth-cases.ts` a `post` helper can match `e2e/growth/ship.ts`'s `post` and case 2's inline `/sim/advance` call. If fallow reports a group, the drill posts through one `json(body)` init builder and keeps case 2 as it is. In the console, `airlock.tsx` beside `safety.tsx` can share the offline section and the loader line, and the shared components of ruling 6 take the rest. Each task that adds a counted file runs `npx fallow dupes` and records the figure. The branch ends at 2.15 % or under, and `.fallowrc.jsonc` keeps 2.25 %.
10. Console growth helpers. `e2e/growth/safety.spec.ts` defines `bridgeApi`, `gauge` and `advance`, and `life-support.spec.ts` defines `bridgeApi`, `gauge` and `reading`. They move into `e2e/growth/ship.ts`, and the two specs import them. Every `test(...)` body and every helper's text stays byte-identical, so no check changes (bridge-api made the same move in `d25230a7`). The reviewer checks it by diff: each earlier spec loses the helper definitions and gains one import. `engineering.spec.ts` and `telemetry.spec.ts` keep their own `bridgeApi` line. Names carry `airlock` (`airlock.e2e.ts`, `airlock.seed-7.json`, `airlock.spec.ts`, `airlockDrill`), and no G4 symbol uses `drill` alone, since G3 has a `safety drill` command for the fire drill.

The §15 rows G4 adds, each dated 2026-10-22 and ending "tech lead, G4 ruling N":

1. G4 adds no route, no command, no module and no sequencer: the airlock drill runs the existing life-support and safety commands under the interlock, and covers the routes it uses on Hono, Express and Fastify.
2. The drill pumps down to the stall, vents to the interlock's 5,000 Pa, holds the outer door open 20 ticks, and fills until the interlock passes the inner door, with log entries at ticks 1, 289, 318, 338 and 447.
3. The golden `e2e/golden/airlock.seed-7.json` pins ticks 288, 317, 337, 446 and 466 with the interlock registered, and the gating `test/airlock.test.ts` asserts each interlock answer and the log.
4. The drill raises no alarm in any room; the bypass case stays with `test/safety.test.ts`.
5. `bridge-api` gains a gating parity case for `close airlock-outer`, `vent`, `pump` and a refused `vent habitat`, and the fourth runtime case `airlockDrill` on six runtimes, whose harnesses build the ship with `bridgePlugins({ scopes })`.
6. The console gains the airlock panel at `/airlock`, which posts to two systems through `systemAction`'s record form, and a fourth growth project `airlock`.
7. §7.4 names G4 as the increment with no module; §5.7 gives life support's 39.3 kW at the first stalled tick, and the climb past it.
8. The two G3 prose nits in `src/physics/safety.ts` and the `bridge-api` README take the text of ruling 8.
9. `npx fallow dupes` stays at 2.15 % or under; fallow counts neither `*.spec.*` nor `*.test.*` files.
10. The console's growth helpers move into `e2e/growth/ship.ts` with every earlier `test(...)` body byte-identical.

## Numbers the tests assert

Each was computed with Node by the architect and the tech lead. Each task's reviewer recomputes the ones its task asserts (`scratchpad/meridian-g4/tl-golden.mts`, `tl-bridge.mts`, `arch-drill.mts`, `arch-spec.mts`).

Library module test `test/airlock.test.ts` (gating): `meridianSystems({ seed: 7, dt: 0.5 })` with the interlock registered. Each refusal is an `InterlockError` with `{ door, difference }`.

| Tick | Assertion                                                                                                                                                                                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `throttle 0.01`, `online`, `pump evacuate` each `{ tick: 1 }`                                                                                                                                                                                                                            |
| 288  | `airlock-outer` refused at 9,089 Pa; `habitat-airlock` refused at 101,339 Pa; `pump off` and `vent open` `{ tick: 289 }`                                                                                                                                                                 |
| 316  | `airlock-outer` refused at 5,072 Pa                                                                                                                                                                                                                                                      |
| 317  | `open airlock-outer` `{ tick: 318 }`                                                                                                                                                                                                                                                     |
| 337  | `close airlock-outer`, `vent open false`, `pump fill` `{ tick: 338 }`; `habitat-airlock` refused at 110,413 Pa                                                                                                                                                                           |
| 338  | `habitat-airlock` refused at 109,401 Pa                                                                                                                                                                                                                                                  |
| 445  | `habitat-airlock` refused at 5,915 Pa                                                                                                                                                                                                                                                    |
| 446  | `pump off`, `open habitat-airlock` `{ tick: 447 }`                                                                                                                                                                                                                                       |
| 466  | `habitat-airlock` open; the true gap 132.5 Pa ± 1 Pa; `safety.alarms` empty on every tick 1 to 466; the log's ticks `[1, 289, 318, 338, 447]`, the 338 entry `{ safety: { doors: { 'airlock-outer': false } }, lifeSupport: { vents: { airlock: false }, pumps: { airlock: 'fill' } } }` |

Library golden (`e2e-growth`, Node from `.nvmrc`): `roundSnapshot` at 288, 317, 337, 446 and 466 in `e2e/golden/airlock.seed-7.json`. The golden's step table holds the accepted commands alone, so its ship matches the module test's at each pinned tick.

`bridge-api` route case (gating, Hono, Express and Fastify), on `scopedShip`:

| Request                                        | Answer                                                                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `close airlock-outer`                          | 202 `{ tick: 1, flightLog: ['survey-7: closed airlock-outer'] }`                                                                                                      |
| `vent airlock open false`                      | 202 `{ tick: 1 }`                                                                                                                                                     |
| `pump airlock fill`                            | 202 `{ tick: 1 }`                                                                                                                                                     |
| `vent habitat open true`                       | 400 `MERIDIAN_BAD_COMMAND` (the habitat has no vent)                                                                                                                  |
| `GET /commands` after `POST /sim/advance` of 1 | the one merged entry `{ tick: 1, change: { safety: { doors: { 'airlock-outer': false } }, lifeSupport: { vents: { airlock: false }, pumps: { airlock: 'fill' } } } }` |

`bridge-api` `airlockDrill` (`e2e-growth` on Hono, Express, Fastify, workerd, Deno and Bun), from tick 0; model values from `tl-bridge.log`:

| After tick | Assertion (model)                                                                                                                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0          | `throttle 0.01`, `online`, `pump evacuate` 202 `{ tick: 1 }`                                                                                                                                                                                 |
| 300        | `open airlock-outer` 409 `MERIDIAN_INTERLOCK`, message `^The airlock-outer door holds [\d,]+ Pa of difference`; airlock 8,500 to 9,500 Pa (9,089); no alarm; `pump off`, `vent open true` `{ tick: 301 }`                                    |
| 340        | airlock 3,500 to 4,500 Pa (3,949), no alarm; `open airlock-outer` 202 `{ tick: 341, flightLog: ['survey-7: opened airlock-outer'] }`                                                                                                         |
| 360        | airlock under 100 Pa (8.863 × 10⁻⁶), `airlock-outer` open, no alarm; `close airlock-outer` 202 `{ tick: 361, flightLog: ['survey-7: closed airlock-outer'] }`, `vent open false` and `pump fill` `{ tick: 361 }`; `open habitat-airlock` 409 |
| 474        | habitat and airlock within 2,500 Pa (410), no alarm; `pump off` `{ tick: 475 }`; `open habitat-airlock` 202 `{ tick: 475, flightLog: ['survey-7: opened habitat-airlock'] }`                                                                 |
| 494        | `habitat-airlock` open, the two within 500 Pa (100), no alarm; `GET /commands` entry ticks `[1, 301, 341, 361, 475]`                                                                                                                         |

The final `GET /sim` FNV-1a is `c4fc77d2` on Node, Deno 2.9.6 and Bun 1.4.2 in `tl-bridge.mts`'s bundle.

Console growth case (`airlock` project), from the current tick `t` (model start 1,272, `arch-drill-console.log`): `pump evacuate` queues for `t + 1`; after 300 ticks the outer door's open shows the interlock's message (`/^The airlock-outer door holds [\d,]+ Pa of difference, above the 5,000 Pa interlock\.$/`) and the exact `Fix:` line, and its airlock side reads 8.5 to 9.5 kPa (9.0); `pump off` and `Open vent`, 40 ticks, 3.5 to 4.5 kPa (3.9), `Open door` on `airlock-outer` reads `survey-7: opened airlock-outer`; 20 ticks, `0.0 kPa`; `Close door`, `Shut vent`, `pump fill`, the inner door refused; 114 ticks (gap 554 Pa), `pump off`, `Open door` on `habitat-airlock` reads `survey-7: opened habitat-airlock`; 20 ticks, the inner door `Open` with its sides within 0.5 kPa; `/systems/safety` reads `No alarms`; no console error.

Spec figures (Task 7): 39,303.6 W at tick 289, 39,382.1 W at 300 and 41,027.4 W at 600; 4,967 Pa and −9,135.3 Pa/s at the outer door's first open tick; −184.6 Pa/s at worst in the habitat.

## Global Constraints

- Worktree `.claude/worktrees/feat/meridian-g4-airlock`. Prefix every nx command and every `git commit` and `git push` with `NX_NO_CLOUD=true NX_DAEMON=false`. Every nx command takes `--parallel=2`. Never touch the main checkout or switch a branch.
- The branch holds 100 commits or fewer (GitHub's rebase merge refuses more). A task is one to three commits, 16 in all. Fix-ups go in `git commit --fixup=<sha>` commits of the commit each fix belongs to and fold before the PR.
- Every commit passes `npx nx test @nexusdi/meridian-systems --parallel=2` and `npx nx test @nexusdi/bridge-api --parallel=2 -- test/check.test.ts` on its own, and the final `rebase -x` checks it. No commit changes the graph, so none carries `graph.json`. Tasks 2 and 3 run `npx nx run @nexusdi/bridge-api:graph --parallel=2` (it ends in `git diff --exit-code graph.json`) to confirm that.
- Never `--no-verify`, never a bare `git stash`, never a merge commit, never a push before the final task.
- Commit subjects follow conventional commits with a scope from `commitlint.config.js` (`meridian-systems`, `bridge-api`, `bridge-console`, `specs`), lowercase, no `@`, no triad. Each message ends with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, whichever model writes it.
- Test first: write the failing test, run it, see it fail, then implement.
- Prose in READMEs, comments, specs and commits follows the writing rules of `nexusdi-ways-of-working`. Every example is interface-first (`Token<IFoo>` with `useClass`).
- Run `npx prettier --write` on every file a task changes.
- Duplication: `npx fallow dupes` ends at 2.15 % or under on the measured figure (start 2.1207 %), and `.fallowrc.jsonc` keeps its 2.25 % limit untouched. Each task that adds a counted file records the figure in its hand-back.
- Helpers and probe scripts live in the session scratchpad's `meridian-g4/` folder only, prefixed by task (`t5-...`). A committed file never holds an absolute local path.
- Console gauges round to a fixed precision in SI units. Test fixtures feed real unrounded values, such as seed 7's floats.

### Heavy work

A heavy job is `npm ci`, a build of more than one project, any `e2e` or `e2e-growth` target, `nx run-many`, or the final `rebase -x`. Run one at a time at all hours. On weekdays from 09:00 to 17:00 (check `date`) wrap every nx, vitest and playwright run in the lock, and release it promptly:

```sh
(until mkdir /tmp/nexusdi-heavy.lock 2>/dev/null; do sleep 20; done; trap 'rmdir /tmp/nexusdi-heavy.lock' EXIT; NX_NO_CLOUD=true NX_DAEMON=false npx nx ... --parallel=2)
```

Outside those hours skip the lock.

### Cleanup

Every task ends with this step before its review gate:

```sh
setopt null_glob 2>/dev/null; rm -rf libs/*/test-output examples/*/dist examples/*/build \
  examples/*/test-output examples/*/out-tsc examples/bridge-console/.react-router tmp
```

### Review gate

Each task ends with a review by a fresh opus reviewer that did not write the task. The reviewer reads the task's diff against this plan and the spec, runs the task's test commands, checks that each commit passes the two per-commit suites (`scratchpad/meridian-g4/each.sh` does it), recomputes the figures the task names, checks the writing rules on every added comment and message, and reports findings. The implementer fixes them in fixup commits. The gate passes when the reviewer reports no finding. The branch ends with the final review of Task 9.

## Tasks

| Task | Model  | What                                                                              | Commits |
| ---- | ------ | --------------------------------------------------------------------------------- | ------- |
| 0    | sonnet | this plan                                                                         | 1       |
| 1    | opus   | the library's module test and golden, and the `safety.ts` comment                 | 3       |
| 2    | sonnet | `bridge-api`'s gating route case                                                  | 1       |
| 3    | opus   | the runtime harnesses with the bridge plugins, and `airlockDrill` on six runtimes | 2       |
| 4    | sonnet | the console's shared components and record form, and the airlock panel            | 3       |
| 5    | sonnet | the console's shared growth helpers and the airlock growth case                   | 2       |
| 6    | sonnet | READMEs, with the `bridge-api` nit                                                | 3       |
| 7    | opus   | the spec amendments                                                               | 1       |
| 8    | sonnet | the full gate and the cleanup                                                     | 0       |
| 9    | opus   | the final review, fix-up rounds and the PR                                        | 0       |

---

### Task 0: this plan

Model: sonnet.

- [ ] Commit `docs(specs): plan the g4 airlock drill`.

### Task 1: the library's module test and golden

Model: opus (the thresholds are tight).

Files:

- Create: `examples/meridian-systems/test/airlock.test.ts`
- Create: `examples/meridian-systems/e2e/airlock.e2e.ts`
- Create: `examples/meridian-systems/e2e/golden/airlock.seed-7.json`
- Modify: `examples/meridian-systems/src/physics/safety.ts` (line 91 comment)

- [ ] Step 1: write the failing `test/airlock.test.ts` of the library table, on the ship `test/safety.test.ts` builds with the interlock registered. Each refusal is read as an `InterlockError` through `toThrow` and `toMatchObject({ door, difference })`. The case asserts `safety.alarms` empty on every tick from 1 to 466 and the log's five ticks and the 338 entry. Run `npx nx test @nexusdi/meridian-systems --parallel=2 -- test/airlock.test.ts` and see it fail on the missing file, then pass once the case is complete (the library needs no source change, so a wrong figure is the failure to chase). Commit `test(meridian-systems): cycle the airlock under the interlock in a module test`.
- [ ] Step 2: run `npx nx run @nexusdi/meridian-systems:e2e-growth --parallel=2` (heavy) once without `-u`: the `idle`, `life-support` and `safety` goldens pass. Write `e2e/airlock.e2e.ts` on the step table of ruling 3 (the throttle, online and pump commands at tick 0, the accepted commands at 288, 317, 337 and 446, and `roundSnapshot` pinned at 288, 317, 337, 446 and 466), run it with `-u` to write the golden, and run it again without `-u`. `git diff --stat` adds the one golden file and changes no other. Run `npx fallow dupes` and record the figure. Commit `test(meridian-systems): pin the airlock drill to a golden`.
- [ ] Step 3: change the comment at `src/physics/safety.ts:91` to the text of ruling 8. Run `npx nx test @nexusdi/meridian-systems --parallel=2`, lint and typecheck. Commit `docs(meridian-systems): say which engineering records safety reads`.
- [ ] Step 4: cleanup, then the review gate.

Reviewer recomputes: every difference and tick of the library table with `scratchpad/meridian-g4/tl-golden.mts`, the five golden ticks, and the 132.5 Pa gap at tick 466. The reviewer checks that the three earlier goldens show no diff.

### Task 2: `bridge-api`'s gating route case

Model: sonnet.

Files:

- Modify: `examples/bridge-api/test/routes.test.ts`

- [ ] Step 1: write the failing `the airlock commands on %s` case on `scopedShip` for Hono, Express and Fastify, with the five answers of the route table. Run `npx nx test @nexusdi/bridge-api --parallel=2 -- test/routes.test.ts`, see it fail, and fix the case until it passes (no source changes are expected). Run `npx nx run @nexusdi/bridge-api:graph --parallel=2`: no diff. Run `npx nx test @nexusdi/bridge-api --parallel=2`, typecheck and lint. Commit `test(bridge-api): queue the airlock commands on each framework`.
- [ ] Step 2: cleanup, then the review gate.

Reviewer recomputes: the five answers with `scratchpad/meridian-g4/tl-bridge.log` item 1, and that the case sends a `vent` and a `pump` command, which no gating test did before.

### Task 3: the runtime harnesses and `airlockDrill`

Model: opus.

Files:

- Modify: `examples/bridge-api/test/runtime/growth.ts`
- Modify: `examples/bridge-api/test/worker/growth/sim.test.ts`
- Modify: `examples/bridge-api/test/runtime/growth-cases.ts`
- Create: `examples/bridge-api/e2e/growth/airlock.e2e.ts`

- [ ] Step 1: build each harness ship as `worker.offline.ts` does: one `nodeScopes()` per case, `plugins: bridgePlugins({ scopes })` for `Nexus.create(OfflineMeridian, ...)` and `{ scopes }` for `createBridge`. The three earlier cases keep their code and assertions. Run `npx nx test @nexusdi/bridge-api --parallel=2`, then `npx nx run @nexusdi/bridge-api:e2e-growth --parallel=2` (heavy) with `scratchpad/rt/node_modules/.bin` first on `PATH`: the three earlier cases pass on every leg. Commit `test(bridge-api): build the runtime growth ships with the bridge plugins`.
- [ ] Step 2: write `airlockDrill` as the fourth entry of `growthCases`, with the steps and bounds of the table, one `airlock(system, action, args)` command builder and the closing `GET /commands` read of `[1, 301, 341, 361, 475]`. Write `e2e/growth/airlock.e2e.ts` as `describe.each(['hono', 'express', 'fastify'])` with `withShip(framework, manual, (url) => airlockDrill.run((path, init) => fetch(`${url}${path}`, init)))`. Run it, see it fail on the missing case, then pass. Run `npx fallow dupes` and apply the `json(body)` fallback of ruling 9 if it reports a group. Commit `test(bridge-api): cycle the airlock on every runtime in a growth case`.
- [ ] Step 3: run the six legs (heavy, one run). Put `scratchpad/rt/node_modules/.bin` first on `PATH` so the Deno 2.9.6 and Bun 1.4.2 legs use the pinned versions, and check `runtime-leg.mjs` accepts them against `toolchains.json`. Run `npx nx run @nexusdi/bridge-api:e2e-growth --parallel=2`: the target runs the Node servers and workerd, then the Deno and Bun legs through `runtime-leg.mjs`. Run `npx nx run @nexusdi/bridge-api:graph --parallel=2`: no diff.
- [ ] Step 4: cleanup, then the review gate.

Reviewer recomputes: each bound of the `airlockDrill` table against `tl-bridge.log` and the Deno and Bun logs (`tl-bridge.deno.log`, `tl-bridge.bun.log`, FNV-1a `c4fc77d2`), and the margins (1,051 Pa at the outer door, five ticks at the inner door). The reviewer confirms that no earlier case's text changed, and that the legs ran on the pinned versions.

### Task 4: the console's airlock panel

Model: sonnet.

Files:

- Create: `examples/bridge-console/app/routes/airlock.tsx`
- Create: `examples/bridge-console/app/routes/systems/doors.tsx`
- Create: `examples/bridge-console/app/routes/systems/airlock-controls.tsx`
- Modify: `app/routes/systems/system-page.tsx`, `app/routes/systems/system-action.server.ts`, `app/routes/systems/safety.tsx`, `app/routes/systems/life-support.tsx`, `app/routes.ts`, `app/routes/layout.tsx`
- Test: `tests/routes/airlock.spec.tsx`, `tests/routes/system-page.spec.tsx`

- [ ] Step 1: the refactor. Move `Door`, `DOORS`, `sideName` and `sidePressure` to `doors.tsx` (with `DOOR_IDS` if the airlock panel needs it), `CommandSelect` into `system-page.tsx`, and the pump and vent forms to `airlock-controls.tsx` as `AirlockControls`. The life-support and safety pages render the same markup. Run `npx nx test @nexusdi/bridge-console --parallel=2`: the existing route tests pass unchanged. Run typecheck and lint. Commit `refactor(bridge-console): share the door gauges and the airlock controls`.
- [ ] Step 2: write the failing cases in `system-page.spec.tsx` for the record form: `commandFrom` reads the system of each action from a record, answers `''` for an action outside it, and does not read `constructor` off the prototype (a hand-built post names `constructor`). See them fail, then widen `systemAction` and `commandFrom` as ruling 6 says, and update the two doc comments. Commit `feat(bridge-console): let a page name the system of each action`.
- [ ] Step 3: write the failing `airlock.spec.tsx` on seed 7's unrounded floats: the gauges (`Pump`, `Vent`, the two doors with each side to 0.1 kPa and `Space side` at 0.0 kPa), each form's posted command and its system, a refusal's message and `Fix:` line, an accepted door command's flight-log line, the door select listing `habitat-airlock` and `airlock-outer` alone, and the offline page. Write the page, add `route('airlock', 'routes/airlock.tsx')` to the `routes/ship-layout.tsx` layout in `app/routes.ts`, and add the nav link in `layout.tsx`. Run `npx nx test @nexusdi/bridge-console --parallel=2`, typecheck and lint, then `npx fallow dupes` and record the figure. Commit `feat(bridge-console): add the airlock panel`.
- [ ] Step 4: cleanup, then the review gate.

Reviewer recomputes: the gauge roundings against seed 7's floats (kPa to 0.1, whole K), and checks by diff that the refactor moved code without edits to markup, and that the `safety.spec.tsx` and `life-support.spec.tsx` files are untouched.

### Task 5: the console's growth helpers and case

Model: sonnet.

Files:

- Create: `examples/bridge-console/e2e/growth/ship.ts`
- Modify: `e2e/growth/safety.spec.ts`, `e2e/growth/life-support.spec.ts`
- Create: `examples/bridge-console/e2e/growth/airlock.spec.ts`
- Modify: `examples/bridge-console/playwright.e2e-growth.config.mts`

- [ ] Step 1: move `bridgeApi`, `gauge`, `advance` and `reading` into `e2e/growth/ship.ts` with their text unchanged, and import them in the two specs. Every `test(...)` body stays byte-identical. Run `npx nx run @nexusdi/bridge-console:e2e-growth --parallel=2` (heavy): the three existing projects pass. Commit `test(bridge-console): share the growth helpers`.
- [ ] Step 2: add the fourth project `airlock` with `dependencies: ['safety']`, change the `chromium` project's `testIgnore` to `/(life-support|safety|airlock)\.spec\.ts/`, and write `airlock.spec.ts` with the steps of the console table, the backend advanced through `request.post('/sim/advance')` and a console-error assertion. Run `npx nx run @nexusdi/bridge-console:e2e-growth --parallel=2` and `npx nx run @nexusdi/bridge-console:e2e --parallel=2` (heavy, one at a time). Commit `test(bridge-console): cycle the airlock in a growth case`.
- [ ] Step 3: cleanup, then the review gate.

Reviewer recomputes: the console margins against `arch-drill-console.log` (9.0 kPa, 3.9 kPa, 0.0 kPa, 554 Pa). The reviewer diffs Step 1 by sentence: each earlier spec loses its helper definitions and gains one import, `engineering.spec.ts` and `telemetry.spec.ts` stay untouched, and each `test(...)` body is byte-identical.

### Task 6: READMEs

Model: sonnet.

Files:

- Modify: `examples/meridian-systems/README.md`, `examples/bridge-api/README.md`, `examples/bridge-console/README.md`

- [ ] Step 1: the library README gains "The airlock drill" paragraph in its Safety section (the steps and the ticks of ruling 2) and the golden and module test in its test list. Commit `docs(meridian-systems): describe the airlock drill`.
- [ ] Step 2: the `bridge-api` README gains the route case, the growth file, the fourth runtime case and the harnesses' plugins, and line 100 takes the text of ruling 8. Commit `docs(bridge-api): document the airlock cases and fix the vent step`.
- [ ] Step 3: the console README gains `/airlock` and the fourth growth project. Run `npx prettier --check` on the three files, and the README doctests if a README gains a `ts` block. Commit `docs(bridge-console): document the airlock page`.
- [ ] Step 4: cleanup, then the review gate.

Reviewer recomputes: each tick and figure a README states, against the Task 1 table, and the sentence for line 100 against the ruling.

### Task 7: the spec amendments

Model: opus.

Files:

- Modify: `specs/2026-10-21-meridian-ship-systems-design.md`

- [ ] Step 1: apply ruling 7 section by section (§5.4, §5.7, §5.11, §7.1, §7.2, §7.4, §8.3, §13), add the ten §15 rows, and add this plan to the closing paragraph's list. Check each figure against `arch-drill-golden.log`, `arch-spec.log` and `tl-golden.log`. Run `npx prettier --check` on the file. Commit `docs(specs): record the g4 rulings in the ship systems spec`.
- [ ] Step 2: cleanup, then the review gate.

Reviewer recomputes: 39,303.6 W, 39,382.1 W and 41,027.4 W (`arch-spec.mts`), the 4,967 Pa and −9,135.3 Pa/s of the first open tick, the −184.6 Pa/s habitat minimum, and the ticks 289, 317, 318, 319, 338 and 446 of §5.4.

### Task 8: the gate

Model: sonnet.

- [ ] Step 1: run `scratchpad/meridian-g4/gate.sh` (heavy, holds the lock itself): `npx nx run-many -t lint test build typecheck --parallel=2`, the `bridge-api` and console `e2e` targets, `npx nx run-many -t e2e-growth --projects=tag:demo --parallel=2` with the pinned Deno 2.9.6 and Bun 1.4.2 first on `PATH`, the `graph` target with no diff, `npx fallow dead-code --fail-on-issues`, `npx fallow dupes` and `npx prettier --check .`. Record the dupes figure, which must read 2.15 % or under, and confirm `git diff origin/release/0.4 -- .fallowrc.jsonc` is empty. Fix any finding in a fixup commit.
- [ ] Step 2: cleanup.

### Task 9: the final review and the PR

Model: opus.

- [ ] Step 1: the final branch review by an independent opus reviewer, who recomputes every figure in "Numbers the tests assert" and checks the diff of the earlier goldens and e2e files, fix rounds in fixup commits until it approves.
- [ ] Step 2: fold the fixups with `GIT_SEQUENCE_EDITOR=: NX_NO_CLOUD=true NX_DAEMON=false git rebase -i --autosquash origin/release/0.4`. Then check every commit on its own (heavy): `NX_NO_CLOUD=true NX_DAEMON=false git rebase origin/release/0.4 -x 'NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/meridian-systems --parallel=2 --skip-nx-cache && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/bridge-api --parallel=2 --skip-nx-cache -- test/check.test.ts'`. A commit that fails gets its fix folded into it, and the step reruns. Check `git rev-list --count origin/release/0.4..HEAD` is 100 or fewer.
- [ ] Step 3: if `origin/release/0.4` moved, rebase onto it and rerun the graph, the gate and Step 2. Push with `NX_NO_CLOUD=true NX_DAEMON=false git push -u origin feat/meridian-g4-airlock`, and open the PR against `release/0.4`. The body lists the rulings and the additions beyond the spec's G4 text (the `/airlock` page and nav link, the record form of `systemAction`, the fourth console project, the fourth runtime case with the plugin harnesses, the gating route case, the module test and the interlocked golden, the helper move, and the sequencer left out as the owner's option) and ends with the Claude Code line. Wait for CI, fix any CodeQL alert, and report the PR number and the result.
