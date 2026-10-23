# Meridian G9, the Stations: Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Ledger: `.superpowers/sdd/meridian-g9/progress.md`.

Goal: the engineering and life-support stations become federation remotes. `federation-engineering` exposes `EngineeringStation` and `federation-life-support` exposes `LifeSupportStation`. The `meridian` contract gains `TELEMETRY_FEED` and `COMMAND_LINK` and moves from 2.3.0 to 2.4.0. The shell provides both tokens over bridge-api's telemetry stream and commands route. `command` sends helm orders over `COMMAND_LINK`. bridge-api's Hono entry answers the shell's origin through `hono/cors`. The shell gains an `e2e-growth` target with three cases, and the `/federation/` guide lists the two new folders. G9 adds no module, physics or crew command to the simulation.

Architecture: one pull request, `feat/meridian-g9-stations`, cut from `release/0.4` at `169b5baa` (G0 to G8 merged). The branch already holds two commits for issue #196 on top of the base: `df636c87` (`test(bridge-api): reuse the load helper in the railgun cases`) and `969945e8` (`test(bridge-console): state the railgun shot tick in the weapons spec comment`) (hashes before the fold). The PR body says "Fixes #196". G9 changes nothing under `libs/`, `graph.json`, `check.test.ts` or a golden.

Tech stack: Node from `.nvmrc` (24.20.0), TypeScript 6.0.3, Vitest 5.0.5, Nx 23.3.0, Hono 4.13.13, React Router 8.4.0, Rspack with Module Federation, Playwright 1.64.

Spec: `specs/2026-10-21-meridian-ship-systems-design.md` (§3.1, §6 rows for the two stations, §7.3, §7.4 G9 row, §9, §10, §11, §13, §15). Earlier plans: `specs/plans/2026-10-21-meridian-g0-kernel.md` through `-g8-weapons.md`. Also the `nexusdi-ways-of-working` skill.

G8 is complete and merged. G9 reads the simulation's snapshot (`ShipReading`), `HelmCommands`, `LifeSupportCommands` and `deck/meridian.deck.json` as they stand at `169b5baa`.

## Owner rulings

1. Earlier e2e test bodies and earlier goldens stay unchanged, and a golden may only gain lines. The one exception is the comment of ruling 1 below, which the owner asked for.
2. Console and station gauges show SI units: K, kPa, Pa, mol, W, plus mega as an SI prefix (MW to 0.1).
3. Deterministic checks gate; `e2e-growth` never gates.
4. The rule of three applies everywhere except lists of figures or ids. No absolute local path and no vault path appears in a committed file.
5. The duplication limit is `.fallowrc.jsonc`'s 2.25 %. The branch aims at 2.15 % or less and never raises the limit.
6. The branch stays at 100 commits or fewer, the limit of GitHub's rebase merge.
7. No hook is bypassed in any way: no `HUSKY=0`, no `--no-verify`, no `git commit-tree`, no `git update-ref`, no `-c core.hooksPath`, in the main worktree or in a scratch worktree.
8. Issues #188, #191 and #194 are out of scope.

## Rulings this plan carries

The architect proposed and the tech lead decided these on 2026-10-23. The tech lead's text overrides the architect's, and the numbering is the tech lead's. The full text sits in the controller's scratchpad (`meridian-g9/architect.md` and `rulings.md`). Task 6 writes them into the spec, each as "tech lead, G9 ruling N".

1. Issue #196. `df636c87` and `969945e8` are branch commits on top of `169b5baa`. They close items 1 to 4 (`load(0)` at `growth-cases.ts:472`, the `load(demand)` helper at `routes.test.ts:1264`, the value comment at `growth-cases.ts:434`). Item 5 says to leave the merged G8 bodies alone. G9 has no nit task. The comment in `examples/bridge-console/e2e/growth/weapons.spec.ts` lost "the burn at 0", which only the ftl case sets (`ftl.spec.ts:27`), and it holds a three-clause sentence. Task 6 makes a `git commit --fixup=969945e8` (content only, the message stays) whose comment reads exactly:

   ```ts
   // The growth cases share one manual ship, which keeps its tick and its state
   // across the cases. The ftl case leaves the throttle at 1 and the burn at 0,
   // and its jump disarms the drive. The fire queues for t + 1 and arms the
   // mount on that tick. The capacitor takes 150 MJ a tick, so the shot leaves
   // at t + 2 with the bank at 300 MJ.
   ```

   The test body's statements stay byte-identical.

2. Token descriptions, sentinels and version. `String(TELEMETRY)` is `TelemetryFeed` (`telemetry/contracts.ts:21`), and a contract token's description is `<key>/<name>` (`libs/federation/src/contract.ts:52`). A token named `TelemetryFeed` would put `meridian/TelemetryFeed` in the shell and every remote, and the gating `bundle.spec.ts` would fail on all five existing dists. The tokens are `meridian.token<IStationTelemetry>('StationTelemetry')` and `meridian.token<ICommandLink>('CommandLink')`, described `meridian/StationTelemetry` and `meridian/CommandLink`. The sentinel list stays six (`TickLoop`, `ShipState`, `SimClock`, `RandomSource`, `DeckPlan`, `TelemetryFeed`) and `bundle.spec.ts` stays byte-identical. No G9 string or class name contains a sentinel. The contract moves from 2.3.0 to 2.4.0. `drift/version.ts` stays byte-identical and now yields 2.5.0; the gating drift case reads `needed at 2.5.0, and the provider has 2.4.0` with an unchanged body. In `federation-contracts/src/index.test.ts` three existing cases move their literal versions up one minor (`is at version 2.4.0`, a 2.4.0 provider passes, a 2.3.0 provider fails), and no case goes. A new `it.each` covers the three tokens' descriptions and their failure against a 2.3.0 provider with `NEXUS_CONTRACT_VERSION` (`required: '2.4.0'`, `provided: '2.3.0'`). `shellAt(version)` grows to provide all three tokens.

3. The contract's reading types. The contracts package builds with tsc under `nodenext` and `@nexusdi/meridian-systems` exposes extensionless TS sources, so the contract cannot import `ShipReading`. It declares `TelemetryReading`, `CompartmentTelemetry` and `TelemetryState`. The shell's type case `expectTypeOf<ShipReading>().toExtend<TelemetryReading>()` ties them to the simulation (use `toMatchTypeOf` if the installed `expect-type` lacks `toExtend`). The bridge-api frame type is `ShipReading & { ftlRating? }` (`bridge-api/src/ship/contracts.ts:52`), so a parsed frame satisfies `TelemetryReading`.

4. The shell's HTTP link. `/bridge.json` is read on first use, which follows the `/remotes.json` rule (one build serves whatever the server names). Startup fetches nothing, so the gating `renders the bridge with no console error` sees no new request. `CommandReceipt.text` is worded in the shell so the wording lives in one place; the console words its receipts inline in JSX and exports no helper. No reconnect, as the console's client. `BridgeCommandLink` sends `content-type: application/json` and no other request header, which is what the CORS `allowHeaders` lists.

5. CORS on the Hono entry. `hono/cors` is a subpath of `hono` 4.13.13, already in bridge-api's `dependencies`. The probe gives an SSE body with `access-control-allow-origin` for a listed origin, a 204 preflight, and no allow header for another origin. Spec §7.3 names `hono/cors`, so Express, Fastify and the Workers entry get none, and `routes.test.ts` and `graph.json` stay unchanged. `shellOrigins()` gives `[]` under `NODE_ENV=production` whatever `SHELL_ORIGIN` holds.

6. The stations and the crew commands.
   - `EngineeringStation` sends no command. It reads `TELEMETRY_FEED` alone.
   - `LifeSupportStation` sends `life-support online`, `scrubber` and `oxygen` for the habitat. All three exist in `LifeSupportCommands` (`life-support-commands.ts:39,62,67`), the habitat carries `scrubber` and `oxygen` (`deck/meridian.deck.json`), and `online()` queues with no power check (`environmental-controller.ts:30`).
   - `HelmOrders` sends `helm course` and `helm burn`, both in `HelmCommands`. `steer` and `throttle` queue setpoints with no power check, so the growth case's setpoint reads hold on a cold reactor.
   - G9 adds no command to the simulation and no command system of a station.
   - Only the G9 sections take `<Name>Station`. Renaming `Cartography` or `Command` would edit the gating diagnostics case and the docs page.
   - `Command`'s test-local `Tactical` gains a `COMMAND_LINK` provider, since `HelmOrders` depends on it. The two existing case bodies stay.
   - `shared: meridianShared()` on both stations keeps core, React and `@nexusdi/react` singletons, so the NEXUS_CORE_NOT_SHARED guarantee holds. Only cartography's unshared build drops core.

7. Shell routes and remote lists. `e2e/remotes/main.json`, `drift.json` and `unshared.json` stay. `mf.test.ts`'s four `toEqual` records each gain the two station keys and keep every earlier key. No new nav label contains `Command`, `Diagnostics` or `Bridge`, so the gating role lookups (substring matches) stay unique.

8. The federation e2e. §7.4 asks "one e2e case per app it touches" and §9 says "at most one e2e case per app". Each station is its own Nx project with its own build and port, so the growth suite holds one case per remote G9 touches: `engineering`, `command` and `life-support`. All three run in the shell's suite, since a remote runs only inside the shell. bridge-api gets no e2e case: the growth suite drives the real `server.hono.ts` through `hono/cors`, and `cors.test.ts` covers the headers. The growth cases live in the shell's `e2e-growth` target, which `demo-growth` picks up through `--projects=tag:demo` (the shell carries the `demo` tag), so no ci.yml step changes. The gating suite gains only two bundle titles (`keeps the simulation out of federation-engineering/dist/main` and `.../federation-life-support/dist/main`), which gate because deterministic checks gate and the station builds already gate in `demo-apps`. The growth ports and the `SHELL_PORT=4400` rule are in the numbers section. The implementer measures the habitat row's texts on the suite's fixed start tick (fresh server per run, `workers: 1`, `retries: 0`) and pins those strings. The architect's `293.0 K` and `101.3 kPa` are a forecast, since the analyzer adds noise to compartment readings.

9. The shell's devDependency on bridge-api. The shell declares `@nexusdi/bridge-api` as the console does, so `^build` builds what `node --import tsx bridge-api/src/server.hono.ts` resolves. It is a devDependency of a private demo and adds no runtime dependency. If `@nx/dependency-checks` refuses it, it goes into that rule's `ignoredDependencies` with a comment, as the contracts package does for `react`.

10. Scope guards. G9 changes nothing under `libs/`. No new runtime dependency between packages: the stations take the same dependencies as `federation-cartography`, and bridge-api reads `hono/cors` from its own `hono`. No export goes: `serve()` in `playwright.config.mts` is file-local and moves to `playwright.servers.mts`, and `STATIONS` in `mf.ts` is not exported. No test goes. Earlier e2e test bodies and goldens stay byte-identical, except the comment of ruling 1. `graph.json`, `check.test.ts` and the goldens do not change.

11. The `/federation/` docs page. "Four folders hold it" is false once the folders exist. The change: "Six folders hold it" and two bullets, one each for `examples/federation-engineering` and `examples/federation-life-support`, in the form of the cartography bullet (the remote, its section, what it shows). The `federation-command` bullet stays as it is. The bullets name no token, since §7.1 has no row for `TELEMETRY_FEED` or `COMMAND_LINK`. `decorators.mdx:23` and `errors/NEXUS_CONTRACT_VERSION.mdx` stay true: the error page quotes its region's 2.3.0 and 2.4.0. The task runs the docs-page skill's checks and a docs-reviewer pass.

12. ci.yml comments. Line 133 ("The four federation demo projects carry the demo-frontend tag") becomes six. Line 157 ("With the four federation projects, run 39642501189 ... took 2 min 26 s") stays, since it records a measured run with four projects. The demo-growth comment (line 213) gains federation-shell among the `e2e-growth` holders. No step changes.

13. Duplication. The two new route files follow `charts.tsx` and `command.tsx`, which fallow does not group today. The stations carry no `bootstrap.tsx` (the cartography and command pair is an 11-line clone group), take the receipt text from the shell, and use different shapes (a `<dl>` against a `<table>`). Each task that adds a counted file records `npx fallow dupes` in its hand-back. A figure over 2.15 % removes its own clone in a fixup inside G9's new files. `.fallowrc.jsonc` keeps 2.25 %.

14. Spec text. Task 6 writes it in `docs(specs): record the g9 rulings in the ship systems spec`. The items sit under Task 6.

## Numbers

| Figure                              | Value                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Base                                | `169b5baa` (`origin/release/0.4`), plus `df636c87` and `969945e8` on the branch                                              |
| Contract version                    | 2.3.0 to 2.4.0                                                                                                               |
| Drift build version                 | 2.4.0 to 2.5.0, `drift/version.ts` unchanged                                                                                 |
| Token descriptions                  | `meridian/StationTelemetry`, `meridian/CommandLink`                                                                          |
| Remote dev ports                    | command 4302 (existing), engineering 4305, life-support 4306                                                                 |
| Federation module names             | `federation_engineering`, `federation_life_support`, expose `./section`                                                      |
| Gating e2e ports                    | unchanged; locally every run sets `SHELL_PORT=4400` (gating shells 4400, 4410, 4420)                                         |
| Growth ports (default `SHELL_PORT`) | shell `SHELL_PORT + 30` (4330, 4430 locally), bridge-api 4331, command 4332, engineering 4335, life-support 4336             |
| Other ports in use                  | console 4210, 4211, 4220, 4221; Docker holds 4300 locally                                                                    |
| Dupes base                          | 2.1253 % (1,487 of 69,968 lines, 97 groups), inside G8's forecast end of 2.125 % to 2.135 %                                  |
| Dupes forecast                      | 2.12 % to 2.14 %; limit for this branch 2.15 % (about +29 duplicated lines of headroom)                                      |
| Counted lines added (forecast)      | about 550: contracts 60, bridge-api 25, shell 160, engineering 80, life-support 130, command 35, servers and ports 60        |
| Commits                             | 22 before fixups (Task 0 included), plus the two #196 commits on the branch; 1 planned fixup                                 |
| Growth cases                        | 3 (`engineering`, `command`, `life-support`)                                                                                 |
| Gating e2e additions                | 2 bundle titles; sentinel list stays 6                                                                                       |
| Helm refs                           | `course` to Kepler-442b charted at 42, heading 0.733 rad (3 decimals); `burn` level 0.5 gives `setpoints.drive.throttle` 0.5 |

## Global Constraints

- Worktree `.claude/worktrees/feat/meridian-g9-stations`. Use absolute paths in every command, with `cd` into the worktree in the same command. Never touch the main checkout or switch a branch. Prefix every nx command, every `git commit` and every `git push` with `NX_NO_CLOUD=true NX_DAEMON=false`. Every nx command takes `--parallel=2` or less.
- The branch holds 100 commits or fewer. Review fixes go in `git commit --fixup=<sha>` commits of the commit each fix belongs to and fold before the PR. A fixup that amends a message uses `git commit --fixup=amend:<sha>` and carries the full message, the subject line included.
- Never change files under `libs/` (that includes `@nexusdi/federation`). If a library behaves differently from this plan or the spec, stop and report it.
- Every commit passes `npx nx test @nexusdi/meridian-systems --parallel=2` and `npx nx test @nexusdi/bridge-api --parallel=2 -- test/check.test.ts` on its own, and the final `rebase -x` checks it. A commit that changes the graph carries the regenerated `graph.json`; G9 changes none.
- Never bypass hooks, anywhere, scratch worktrees included: no `HUSKY=0`, no `--no-verify`, no `git commit-tree`, no `git update-ref`, no `-c core.hooksPath`. Never a bare `git stash`, never a merge commit, never a push before the final task. To fix a message, use `git commit --fixup=amend:<sha>`.
- Edit files with the Edit and Write tools only. Never edit files with Python, sed -i, perl or any other ad-hoc script. In G8 the permission check refused a Python edit script. If the permission check refuses an action, stop and report it in the hand-back. Do not route around it.
- Parallel work in one worktree: commit with `git commit -- <paths>` (pathspec form) only. Never `git add -A` or `git commit -a`. If `index.lock` exists, wait 10 s and retry. The pre-commit hook lints affected projects' working tree, so a peer's uncommitted edit can fail your commit. Report that and leave the peer's files alone.
- Commit subjects follow conventional commits with a scope from `commitlint.config.js`, lowercase, no `@` anywhere in the message, body lines wrapped at 100 characters. Each message ends with exactly this trailer line, whichever model writes it: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Task 1 adds the scopes `federation-engineering` and `federation-life-support`; commits before it use only existing scopes.
- Stations take `import type` only from `@nexusdi/meridian-systems`. Section names are `<Name>Station` for the two G9 sections. The command station's classes stay decorated with `@Injectable` and `@Inject`. Keep the NEXUS_CORE_NOT_SHARED singleton guarantee.
- Test first: write the failing test, run it, see it fail, then implement.
- Interface-first: every token is `Token<IFoo>` bound with `useClass`. No new name ends in `Service`.
- Prose in READMEs, comments, specs and commits follows the writing rules of `nexusdi-ways-of-working`: no em dashes, no antithesis ("not X but Y", "instead of", "rather than"), no rule of three outside lists of figures or ids, no bold lead-ins, no metaphor verbs (bites, lands, buys, costs, earns, pays, survives, ships), no filler openers, no table under four rows.
- Run `npx prettier --write` on every file a task changes.
- Run `npx fallow dead-code --fail-on-issues` before handing back any task that adds an export. An export that nothing imports until a later commit of this branch is reported and named in the hand-back.
- Duplication: `npx fallow dupes` ends at 2.15 % or under (start 2.1253 %). `.fallowrc.jsonc` keeps its 2.25 % limit.
- Helpers and probe scripts live in the controller's scratchpad (`meridian-g9/`), prefixed by task (`t3-...`). A committed file refers to them by basename at most. A committed file never holds an absolute local path or a vault path.
- The docs regions (`examples/meridian/src/pages`) and the docs site (`apps/docs`) never import a private demo package and keep building. The `/federation/` page cites regions of the federation demo; keep every cited region present and true.
- Mutation checks: never mutate files in the shared worktree while peers run. Use a scratch worktree under the scratchpad's `meridian-g9/` folder (`git worktree add`, hooks on) with a real `node_modules/@nexusdi` directory linking the example packages to the scratch copies, or ask the controller.
- Owner rulings that hold: earlier e2e test bodies and goldens stay unchanged; gauges are SI; deterministic checks gate; the crew commands `comms hail`, the helm commands and `weapons fire` stay.
- Out of scope: issues #188, #191 and #194.
- If the plan is wrong on a point, do the closest right thing for a fact correction only (a figure, a file name). Otherwise stop and report the question.

### Heavy work

A heavy job is `npm ci`, a build of more than one project, any `e2e` or `e2e-growth` target, `nx run-many`, or the final `rebase -x`. Run one at a time at all hours, with `--parallel=2` or less. On a weekday from 09:00 to 17:00 (check `date`) wrap every nx, vitest and playwright run in the lock and release it promptly:

```sh
(until mkdir /tmp/nexusdi-heavy.lock 2>/dev/null; do sleep 20; done; trap 'rmdir /tmp/nexusdi-heavy.lock' EXIT; NX_NO_CLOUD=true NX_DAEMON=false npx nx ... --parallel=2)
```

Outside those hours skip the lock but still run one heavy job at a time. Tasks 5 and 7 take the lock for every e2e run at any hour. Federation e2e runs set `SHELL_PORT=4400` locally.

### Cleanup

Every task ends with this step before its review gate:

```sh
setopt null_glob 2>/dev/null; rm -rf libs/*/test-output examples/*/dist examples/*/build \
  examples/*/test-output examples/*/out-tsc examples/bridge-console/.react-router tmp
```

### Review gate

Each task ends with a review by a fresh reviewer that did not write the task, and the next task in its line starts after the gate passes. The reviewer reads the task's diff against this plan and the spec, runs the task's test commands, checks that each commit passes the two per-commit suites, recomputes the figures the task names, checks the writing rules on every added comment and message, and reports findings. The implementer fixes them in fixup commits. The gate passes when the reviewer reports no finding.

## Tasks

Groups run in order A to G. Groups B and C each run two tasks in parallel, under the cap of four agents.

| Task | Group | Depends on | Model (implementer / reviewer) | Commits                       |
| ---- | ----- | ---------- | ------------------------------ | ----------------------------- |
| 0    | A     | none       | sonnet / sonnet                | 1                             |
| 1    | B     | 0          | sonnet / sonnet                | 5                             |
| 2    | B     | 0          | opus / opus                    | 2                             |
| 3    | C     | 2          | opus / opus                    | 5                             |
| 4    | C     | 1, 2       | sonnet / sonnet                | 2                             |
| 5    | D     | 3, 4       | opus / opus                    | 3                             |
| 6    | E     | 5          | sonnet / sonnet                | 4, plus the fixup of ruling 1 |
| 7    | F     | 6          | sonnet / none                  | fixups only                   |
| 8    | G     | 7          | opus                           | none                          |

In group C, Task 3 touches the shell and bridge-api and Task 4 touches only the two station folders, so their commits never share a path. 22 commits before fixups.

### Task 0: this plan

Model: sonnet.

- [ ] Run `npx prettier --write` on this file and commit `docs(specs): plan meridian g9 stations` through `git commit -- specs/plans/2026-10-21-meridian-g9-stations.md`.

### Task 1: scaffold the two station projects

Model: sonnet. Depends on Task 0.

Files:

- Commit 1: `commitlint.config.js` (scopes `federation-engineering` and `federation-life-support`, under the federation demo comment) and `CONTRIBUTING.md` (the two scopes).
- Commits 2 and 3: the output of the generators, one commit per station.
- Commits 4 and 5: per station `package.json`, `project.json`, `rspack.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json`, `vitest.config.mts`, `index.html`, `src/index.ts`, `README.md`, the root `tsconfig.json` references and `package-lock.json` (workspace links).

Failing test first: `npx nx test @nexusdi/repo-checks --parallel=2 -- project-folder-name commitlint-scope-enum` (the repo-checks project under `tools/repo-checks`) fails once a new project folder exists without a scope. Confirm the exact project name with `nx show projects`, run it before commit 1 against the generated folders to see the failure, then add the scopes.

- [ ] Step 1: commit 1, the scopes. Add the scopes after the generators ran locally in a scratch state only if needed to see the failure; the commit itself holds only the two config files.
- [ ] Step 2: scaffold with the official generator (`@nx/react:provider` exists in the installed `@nx/react` 23.3.0), then commit its output alone per station:

  ```sh
  npx nx g @nx/react:provider examples/federation-engineering --bundler=rspack --port=4305 \
    --exposeName=section --consumer=@nexusdi/federation-shell
  npx nx g @nx/react:provider examples/federation-life-support --bundler=rspack --port=4306 \
    --exposeName=section --consumer=@nexusdi/federation-shell
  npx nx g @nx/vitest:configuration --project=@nexusdi/<folder> --uiFramework=react --testEnvironment=jsdom
  ```

  If the generator writes ranges into the root `package.json`, restore the exact pins D2 used. If it edits any shell file beyond what `--consumer` documents, stop and report. Commit subjects: `chore(federation-engineering): scaffold the engineering station with the nx generators` and `chore(federation-life-support): scaffold the life-support station with the nx generators`.

- [ ] Step 3: adapt each project to the shape of `federation-command` without decorators:
  - `package.json`: `@nexusdi/<folder>`, `private`, `nx.tags: ["demo-frontend"]`, the same pinned dependencies as `federation-cartography`.
  - `project.json`: `serve` with `dependsOn: ["^build", "@nexusdi/federation-shell:serve"]`, cached `build` to `dist/main`.
  - `rspack.config.ts`: command's config less the decorator options, `PORT` 4305 or 4306, `NAME` `federation_engineering` or `federation_life_support`, `exposes: { './section': './src/section.ts' }`, `shared: meridianShared()`.
  - `index.html` holds the sentence `federation-engineering is a remote of the Meridian shell. Open the shell on port 4300.` (life-support likewise), `src/index.ts` is the empty entry with a comment. No `bootstrap.tsx` (ruling 13).
  - `README.md` of the project: tagline, what it exposes, port, how it pairs with the shell.
  - Commit subjects: `chore(federation-engineering): name, tag and pin the engineering station` and `chore(federation-life-support): name, tag and pin the life-support station`.
- [ ] Step 4: verify. `npx nx run-many -t typecheck lint --projects=@nexusdi/federation-engineering,@nexusdi/federation-life-support --parallel=2`, the repo-checks test above, and one build of both (heavy): `npx nx run-many -t build --projects=@nexusdi/federation-engineering,@nexusdi/federation-life-support --parallel=2`. Both builds emit `dist/main/remoteEntry.js`. Record `npx fallow dupes`.
- [ ] Step 5: cleanup, then the review gate.

### Task 2: the contract tokens and helm orders

Model: opus (the contract and the first decorated consumer). Depends on Task 0.

Files:

- Commit 1: `examples/federation-contracts/src/station-telemetry.ts`, `command-link.ts` (new), `index.ts`, `version.ts`, `index.test.ts`, `README.md`.
- Commit 2: `examples/federation-command/src/helm-orders.ts` (new), `command.module.ts`, `command-deck.tsx`, `command.test.ts`, `README.md`.

Failing test first, commit 1: in `index.test.ts` move the three literal versions up one minor and add the `it.each` of ruling 2 (descriptions, and each token failing a 2.3.0 provider with `required: '2.4.0'`, `provided: '2.3.0'`; `shellAt(version)` provides all three tokens). Run `npx nx test @nexusdi/federation-contracts --parallel=2` and see it fail on the missing exports. The built-entry case stays.

`station-telemetry.ts`:

```ts
/** One compartment's air. Kelvin, pascals and moles. */
export interface CompartmentTelemetry {
  readonly temperature: number;
  readonly pressure: number;
  readonly moles: Readonly<Record<string, number>>;
}
/** The parts of a ship reading the stations show. Watts, kelvin, pascals. */
export interface TelemetryReading {
  readonly tick: number;
  readonly reactor: { readonly level: number; readonly electric: number };
  readonly coolant: { readonly temperature: number };
  readonly power: {
    readonly loads: readonly {
      readonly id: string;
      readonly allocated: number;
    }[];
    readonly shed: readonly string[];
  };
  readonly compartments: Readonly<Record<string, CompartmentTelemetry>>;
}
export interface TelemetryState {
  readonly status: 'connecting' | 'online' | 'offline';
  readonly reading: TelemetryReading | null;
}
/** The ship's telemetry, shaped for useSyncExternalStore. Both members are bound. */
export interface IStationTelemetry {
  /** The first listener opens the stream and the last one's unsubscribe closes it. */
  readonly subscribe: (listener: () => void) => () => void;
  /** The same object until the stream sends a reading or changes status. */
  readonly state: () => TelemetryState;
}
```

`command-link.ts`:

```ts
/** A crew command, as bridge-api's POST /commands reads it. */
export interface StationCommand {
  readonly system: string;
  readonly action: string;
  readonly [arg: string]: unknown;
}
/** The answer to a command, worded by the shell. send() never rejects. */
export type CommandReceipt =
  | { readonly queued: true; readonly tick: number; readonly text: string }
  | { readonly queued: false; readonly text: string };
export interface ICommandLink {
  send(command: StationCommand): Promise<CommandReceipt>;
}
```

`index.ts` adds `export const TELEMETRY_FEED = meridian.token<IStationTelemetry>('StationTelemetry');` and `export const COMMAND_LINK = meridian.token<ICommandLink>('CommandLink');`, with type re-exports of the six types. `version.ts` goes from `'2.3.0'` to `'2.4.0'`. Confirm `examples/federation-cartography/src/builds.test.ts` and the gating `federation.spec.ts` need no edit. The README names three tokens and the version.

- [ ] Step 1: commit 1, `feat(federation-contracts): add the station telemetry and command link tokens at 2.4.0`. Verify `npx nx run-many -t test typecheck lint --projects=@nexusdi/federation-contracts,@nexusdi/federation-cartography --parallel=2`, the per-commit pair, and `npx fallow dead-code --fail-on-issues` (the new exports are reported until Tasks 3 and 4 import them; name them in the hand-back).
- [ ] Step 2: failing test for commit 2 in `command.test.ts`: `HelmOrders` built through `@Injectable`, `course('Kepler-442b')` sends `{ system: 'helm', action: 'course', to: 'Kepler-442b' }`, `burn(0.5)` sends `{ system: 'helm', action: 'burn', level: 0.5 }` (through a fake `ICommandLink`), and `Nexus.check` passes with `COMMAND_LINK` provided. The test-local `Tactical` gains a `COMMAND_LINK` provider (ruling 6). The two existing case bodies stay. See it fail, then implement:

  ```ts
  export interface IHelmOrders {
    /** Sends `helm course` to the charted star `to`. */
    course(to: string): Promise<CommandReceipt>;
    /** Sends `helm burn` at `level`, 0 to 1. */
    burn(level: number): Promise<CommandReceipt>;
  }
  export const HELM_ORDERS = new Token<IHelmOrders>('HelmOrders');

  @Injectable({ deps: [COMMAND_LINK] })
  export class HelmOrders implements IHelmOrders {
    constructor(private readonly link: ICommandLink) {}
    course(to: string) {
      return this.link.send({ system: 'helm', action: 'course', to });
    }
    burn(level: number) {
      return this.link.send({ system: 'helm', action: 'burn', level });
    }
  }
  ```

  `Command` gains `provide(HELM_ORDERS, { useClass: HelmOrders })` and exports it; `@Module` keeps `name: 'Command'`. `Bridge` keeps `@Inject(NAV_CHARTS) accessor charts`. `CommandDeck` keeps `course to Kepler-442b, heading 42`, gains the buttons `Steer for Kepler-442b` and `Burn at 0.5`, and a `<p role="status">` with the receipt text. The gating command case builds `HelmOrders` without a request, since the endpoint reads lazily.

  Commit `feat(federation-command): send helm orders over the command link`. Verify `npx nx run-many -t test typecheck lint --projects=@nexusdi/federation-command --parallel=2`, the per-commit pair and `npx fallow dupes`.

- [ ] Step 3: cleanup, then the review gate.

### Task 3: both ends of the shell's HTTP link, then its routes

Model: opus (the stream and the route wiring). Depends on Task 2.

Files:

- Commit 1: `examples/bridge-api/src/hono.ts`, `src/ship-from-env.ts`, `src/server.hono.ts`, `test/cors.test.ts` (new), `test/ship-from-env.test.ts`, `README.md`.
- Commit 2: `examples/federation-shell/src/ship/bridge-endpoint.ts` (+test), `public/bridge.json`, `e2e/serve.ts`.
- Commit 3: `src/ship/bridge-telemetry.ts` (+test), `src/ship/tactical.ts`, `src/ship/ship.test.ts` (provider and type cases).
- Commit 4: `src/ship/bridge-command-link.ts` (+test), `src/ship/tactical.ts`.
- Commit 5: `src/mf.ts`, `src/mf.test.ts`, `src/sections.ts`, `src/routes/engineering.tsx`, `src/routes/life-support.tsx`, `src/routes/home.tsx`, `src/App.tsx`, `public/remotes.json`, the shell `README.md`.

Commit 1, `feat(bridge-api): answer the federation shell's origin through hono/cors`. Failing tests first. `test/cors.test.ts` on `createBridge(ship, { origins: ['http://127.0.0.1:4330'] })`: a preflight of `POST /commands` answers 204 with the origin and `POST` allowed; `GET /sim` from the origin carries `access-control-allow-origin`; another origin gets no allow header; no `origins` gives none. `ship-from-env.test.ts`: `shellOrigins` gives the dev default `http://localhost:4300`, a two-origin `SHELL_ORIGIN` (comma separated), and `[]` under `NODE_ENV=production` with `SHELL_ORIGIN` set. Then:

- `src/hono.ts`: `BridgeOptions.origins?: readonly string[]`. When it holds an origin, `createBridge` registers `cors({ origin: [...origins], allowMethods: ['GET', 'POST'], allowHeaders: ['content-type'] })` first, before `/health`.
- `src/ship-from-env.ts`: `shellOrigins(env: Env = process.env): readonly string[]` returns `(env.SHELL_ORIGIN || 'http://localhost:4300').split(',')` when `isDev(env)`, and `[]` in production whatever `SHELL_ORIGIN` holds.
- `src/server.hono.ts` passes `origins: shellOrigins()`. Express, Fastify and the Workers entry get none. `routes.test.ts`, `graph.json` and `check.test.ts` stay unchanged.
- README: `SHELL_ORIGIN` under Running a Server.

Verify `npx nx test @nexusdi/bridge-api --parallel=2` and the per-commit pair.

Commits 2 to 4, the shell's side. Failing test first for each class.

- `bridge-endpoint.ts`: `IBridgeEndpoint { url(): Promise<URL> }`, `BRIDGE_ENDPOINT = new Token<IBridgeEndpoint>('BridgeEndpoint')`, class `RuntimeBridgeEndpoint` reads `/bridge.json` (`{ "url": "http://localhost:3000/" }`, bridge-api's default port) on the first call and keeps a successful answer. A failed read rejects and the next call reads again. Test: one fetch for two calls, a retry after a failed read. `public/bridge.json` is copied into every dist by `CopyRspackPlugin`. `e2e/serve.ts`: when `BRIDGE_API_URL` is set, `/bridge.json` answers `{ "url": BRIDGE_API_URL }`, beside the `REMOTES` rule. Commit `feat(federation-shell): read bridge-api's address from /bridge.json`.
- `bridge-telemetry.ts`: `BridgeTelemetry implements IStationTelemetry`, `static deps = [BRIDGE_ENDPOINT]`. A listener set. The first subscribe sets `connecting` and opens `new EventSource(new URL('telemetry', url))` once the endpoint resolves. A `snapshot` event sets `online` with the parsed reading. An `offline` event or an `error` closes the source and sets `offline` with `reading: null`, with no reconnect. The last unsubscribe closes the source, and a later first subscribe opens it again. A generation counter drops a late endpoint answer after the close. Each change replaces a frozen state object and calls the listeners. Tests with a stubbed `EventSource`: opens `<url>telemetry` on the first subscribe only; `connecting` then `online` with the reading; `offline` on the event and on an error with the source closed; the last unsubscribe closes; `state()` keeps identity between events; a late endpoint answer after the close opens nothing. `tactical.ts` provides `TELEMETRY_FEED` (BridgeTelemetry) and exports the token. `ship.test.ts` gains: Tactical exports the token, `Nexus.check` passes, and the type case `expectTypeOf<ShipReading>().toExtend<TelemetryReading>()` (type import of `@nexusdi/meridian-systems`, already a shell devDependency). Commit `feat(federation-shell): provide the station telemetry over the telemetry stream`.
- `bridge-command-link.ts`: `BridgeCommandLink implements ICommandLink`, `static deps = [BRIDGE_ENDPOINT]`, posts JSON to `new URL('commands', url)` with `content-type: application/json` and no other request header. The receipt text: 202 gives `{ queued: true, tick, text: 'Queued for tick N' }`; 400 and 409 give `{ queued: false, text }` with `${code}: ${message}` plus ` Fix: ${fix}` when present; a network failure or any other status gives `{ queued: false, text: 'The bridge is unreachable' }`. `send()` never rejects. Tests: 202, 400 with fix, 409, 500, a rejected fetch. `tactical.ts` provides `COMMAND_LINK` (BridgeCommandLink) and `BRIDGE_ENDPOINT` (RuntimeBridgeEndpoint, not exported), keeps `NAV_CHARTS` and `global`, and exports the three contract tokens. Commit `feat(federation-shell): provide the command link over the commands route`.

Commit 5, `feat(federation-shell): route the engineering and life-support stations`. Failing test first: `mf.test.ts`'s four `toEqual` records gain `federation_engineering` and `federation_life_support` (`failed` where the fixture lists two remotes) and keep every earlier key. Then:

- `src/mf.ts`: `STATIONS` gains the two names; the docblock says four stations. `STATIONS` stays unexported.
- `src/sections.ts`: `EngineeringPackage = SectionPackage<'EngineeringStation', 'EngineeringPanel'>`, `LifeSupportPackage = SectionPackage<'LifeSupportStation', 'LifeSupportPanel'>`, loaders `engineering()` and `lifeSupport()`, `lazySection('engineering', ...)` and `lazySection('life-support', ...)`.
- `src/routes/engineering.tsx` (`/engineering`) and `src/routes/life-support.tsx` (`/life-support`) on the `charts.tsx` and `command.tsx` pattern. `App.tsx` routes and links `Engineering` and `Life support`. `routes/home.tsx` names four stations in four clauses.
- `public/remotes.json` adds `federation_engineering` at `http://localhost:4305/remoteEntry.js` and `federation_life_support` at `http://localhost:4306/remoteEntry.js`.
- Shell `README.md`: four stations, ports 4305 and 4306, `/bridge.json`, pairing with `npx nx dev @nexusdi/bridge-api`, the `e2e-growth` target and its ports.

Verify per commit: `npx nx run-many -t test typecheck lint --projects=@nexusdi/federation-shell,@nexusdi/bridge-api --parallel=2`, the per-commit pair, `npx fallow dupes`, and `npx fallow dead-code --fail-on-issues` (commit 5 loads the stations' `./section` exposes, which Task 4 fills; Task 1's projects are present).

- [ ] Steps 1 to 5: the five commits in order, each test first. Step 6: cleanup, then the review gate.

### Task 4: the two station sections

Model: sonnet. Depends on Tasks 1 and 2.

Files: per station the module, the panel, `src/section.ts`, a test file and `README.md`.

Failing tests first.

Engineering, commit `feat(federation-engineering): show the reactor, coolant and power gauges`:

- `src/engineering-station.module.ts`: `type Gauge = readonly [label: string, text: string]`; `IEngineRoom { readonly subscribe; readonly state; gauges(state: TelemetryState): readonly Gauge[] | null }`; `ENGINE_ROOM = new Token<IEngineRoom>('EngineRoom')`; `class EngineRoom` with `static deps = [TELEMETRY_FEED]`, `subscribe` and `state` as bound arrows over the feed; `EngineeringStation = defineModule({ name: 'EngineeringStation', providers: [provide(ENGINE_ROOM, { useClass: EngineRoom })], exports: [ENGINE_ROOM] })`.
- Gauges in SI: `Reactor level` (`level.toFixed(2)`), `Electric output` (MW to 0.1), `Coolant` (K to 0.1), `Power allocated` (sum of `loads[].allocated`, MW to 0.1), `Loads shed` (`none` or the ids joined with `, `). Group thousands with `Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })`. Idle seed 7: `0.00`, `0.0 MW`, `500.0 K`, `0.0 MW`, `none`.
- `src/engineering-panel.tsx`: `EngineeringPanel`, `useService(ENGINE_ROOM)`, `useSyncExternalStore(room.subscribe, room.state)`, `useMemo` over the state. It renders `<section aria-label="engineering">`, `<h2>Engineering</h2>`, `Telemetry, tick N` while online, `Waiting for telemetry` while connecting, `Telemetry offline` while offline, and a `<dl aria-label="Engineering gauges">`.
- `src/section.ts` exports `EngineeringStation` and `EngineeringPanel`.
- `engineering.test.ts`: the idle gauges and a powered fixture; `null` with no reading; the room passes `subscribe` and `state` through; `Nexus.check(Meridian, { plugins: [federation()] })` with a test Tactical giving `TELEMETRY_FEED`.

Life support, commit `feat(federation-life-support): show the compartment air and send atmosphere commands`:

- `src/life-support-station.module.ts`: `CompartmentGauges { readonly id: string; readonly gauges: readonly Gauge[] }`; `IAtmosphereDesk { subscribe; state; compartments(state): readonly CompartmentGauges[] | null; online(); scrubber(compartment, on); oxygen(compartment, on) }`, the three commands returning `Promise<CommandReceipt>`; `ATMOSPHERE_DESK = new Token<IAtmosphereDesk>('AtmosphereDesk')`; `class AtmosphereDesk` with `static deps = [TELEMETRY_FEED, COMMAND_LINK]`; `LifeSupportStation = defineModule({ name: 'LifeSupportStation', ... })`.
- Gauges per compartment, in reading order (`bridge`, `habitat`, `reactor-bay`, `airlock`): `Temperature` (K to 0.1), `Pressure` (kPa to 0.1), `O₂ partial pressure` and `CO₂ partial pressure` (kPa to 0.01, `pressure · n_gas / Σ n`). The unit test computes the habitat's texts from the idle golden of `examples/meridian-systems/e2e/golden/idle.seed-7.json`.
- Commands, all in `LifeSupportCommands`: `{ system: 'life-support', action: 'online' }`, `{ system: 'life-support', action: 'scrubber', compartment, on }`, `{ system: 'life-support', action: 'oxygen', compartment, on }`. The panel sends them for the habitat. Scrubbers and generators start on, so the panel offers `Bring life support online`, `Stop the habitat scrubber`, `Run the habitat scrubber`, `Stop the habitat oxygen generator` and `Run the habitat oxygen generator`. `heater`, `vent` and `pump` stay on the console.
- `src/life-support-panel.tsx`: `LifeSupportPanel`, a `<table aria-label="Compartment air">` (one row per compartment, one column per gauge; this differs in shape from the engineering `<dl>`, which also keeps fallow apart), the five buttons, and `<p role="status">` with the last receipt's `text`.
- `src/section.ts` exports `LifeSupportStation` and `LifeSupportPanel`.
- `life-support.test.ts`: the habitat idle gauges, the partial pressures, compartment order, each command's exact `StationCommand` through a fake link, and `Nexus.check`.

Neither panel repeats receipt wording. Verify per station: `npx nx run-many -t test typecheck lint build --projects=@nexusdi/federation-engineering,@nexusdi/federation-life-support --parallel=2` (the build is heavy; run it once for both), the per-commit pair, `npx fallow dupes`, `npx fallow dead-code --fail-on-issues`.

- [ ] Step 1 and 2: the two commits, each test first. Step 3: cleanup, then the review gate.

### Task 5: the federation growth suite

Model: opus. Depends on Tasks 3 and 4.

Files: `examples/federation-shell/playwright.servers.mts` (new), `playwright.config.mts`, `playwright.e2e-growth.config.mts` (new), `e2e/ports.ts`, `e2e/dists.ts`, `e2e/remotes/growth.json` (new), `e2e/growth/engineering.spec.ts`, `command.spec.ts`, `life-support.spec.ts` (new), `project.json`, `package.json`, `package-lock.json`, `.fallowrc.jsonc`.

Commit 1, `test(federation-shell): share the static servers between the playwright configs`. A refactor with no behaviour change: `serve(folder, port, ready, env?)` moves out of `playwright.config.mts` into `playwright.servers.mts`, which also gains `bridgeApi(port, shellOrigin)` (`node --import tsx bridge-api/src/server.hono.ts`, cwd `examples`, env `PORT`, `SIM_MODE=manual`, `SIM_SEED=7`, `SHELL_ORIGIN`, ready at `/health`). `playwright.config.mts` imports them and gains `testIgnore: '**/growth/**'`. Verify by running the gating suite once (heavy): `SHELL_PORT=4400 npx nx e2e @nexusdi/federation-shell --parallel=2`, every earlier case passing, no body changed.

Commit 2, `test(federation-shell): check the station builds for simulation code`. `e2e/dists.ts`: `STATION_DISTS = ['federation-engineering/dist/main', 'federation-life-support/dist/main']`, and `DISTS` gains them. `project.json`: `e2e.dependsOn` gains the two station builds. `bundle.spec.ts` stays byte-identical and its loop over `DISTS` now yields the two titles `keeps the simulation out of federation-engineering/dist/main` and `keeps the simulation out of federation-life-support/dist/main`. Run the gating suite once and see both titles pass. A dist that holds a sentinel fails the case: confirm by reading the grep in `bundle.spec.ts`, not by mutating a build.

Commit 3, `test(federation-shell): read the stations against a manual bridge-api in a growth suite`.

- `e2e/ports.ts`: `GROWTH = { shell: shell + 30, api: 4331, command: 4332, engineering: 4335, lifeSupport: 4336 }`, derived from the same `SHELL_PORT` constant as `SHELLS` (`process.env['SHELL_PORT'] ?? 4300`), beside the gating ports.
- `e2e/dists.ts`: `GROWTH_DISTS` serves command, engineering and life-support on the growth ports. `e2e/remotes/growth.json` names those three remotes.
- `playwright.e2e-growth.config.mts`: `testDir: './e2e/growth'`, `workers: 1`, `fullyParallel: false`, `retries: 0`; servers: the bridge-api (`SHELL_ORIGIN=http://127.0.0.1:<GROWTH.shell>`), the three remotes and one shell (`REMOTES=federation-shell/e2e/remotes/growth.json`, `BRIDGE_API_URL=http://127.0.0.1:<GROWTH.api>/`, built from `GROWTH.shell` and `GROWTH.api`); projects `engineering`, then `command` (depends on engineering), then `life-support` (depends on command, since `online` is one-way).
- `project.json`: new `e2e-growth` target (`nx:run-commands`, cwd the shell, `playwright test --config playwright.e2e-growth.config.mts`, `dependsOn: ["build-e2e", "^build", { projects: [command, engineering, life-support], target: "build" }]`, with the three projects named by their Nx names). `package.json` gains the devDependency `@nexusdi/bridge-api`, `package-lock.json` follows. If `@nx/dependency-checks` refuses it, add it to that rule's `ignoredDependencies` with a comment (ruling 9).
- `.fallowrc.jsonc`: entries for `examples/federation-shell/playwright.e2e-growth.config.mts` and `examples/federation-shell/e2e/**/*.ts`, as the console's. The threshold stays 2.25.
- Cases, each with a `problems(page)` check empty at the end and `t` read from `GET /sim`:
  - `engineering.spec.ts`: `/engineering` shows `Telemetry, tick t` and the five idle gauges; `POST /sim/advance { ticks: 1 }` and the page shows `Telemetry, tick t + 1` with no reload; Diagnostics lists `EngineeringStation`.
  - `command.spec.ts`: `/command` keeps `course to Kepler-442b, heading 42`; `Steer for Kepler-442b` and `Burn at 0.5` each show `Queued for tick t + 1`; after one tick `GET /sim` reads `setpoints.helm.heading` close to 0.733 rad (3 decimals) and `setpoints.drive.throttle` 0.5.
  - `life-support.spec.ts`: the habitat row reads the measured temperature and pressure texts (ruling 8: the implementer measures and pins them; forecast `293.0 K` and `101.3 kPa`); `Bring life support online` and `Stop the habitat scrubber` each show `Queued for tick t + 1`; after one tick `GET /sim` reads `setpoints.lifeSupport.online` true and `scrubbers.habitat` false, and the page shows tick t + 1; Diagnostics lists `LifeSupportStation`.

Verify (heavy, one at a time, `SHELL_PORT=4400`): the gating suite once, then `SHELL_PORT=4400 npx nx e2e-growth @nexusdi/federation-shell --parallel=2` once, all three cases passing. Confirm `git diff 169b5baa -- examples/federation-shell/e2e` shows no earlier test body changed, and that `serve.ts`, `dists.ts`, `ports.ts` and the configs changed around them only. Record `npx fallow dupes` after each commit.

- [ ] Steps 1 to 3: the three commits in order, the failing growth cases first in commit 3 (run before the stations are wired in the config, or with a wrong expectation, to see them fail). Step 4: cleanup, then the review gate.

### Task 6: docs, ci comments, the spec and the record

Model: sonnet, with the docs-reviewer agent for the page. Depends on Task 5.

Commit 1, `docs(docs): list the engineering and life-support stations on the federation guide`: `apps/docs/content/federation.mdx` per ruling 11. Run the docs-page skill's checks and a docs-reviewer pass, and keep every cited region present and true.

Commit 2, `ci(repo): count the six federation projects`: `.github/workflows/ci.yml` comments per ruling 12. No step changes.

Commit 3, `docs(specs): record the g9 rulings in the ship systems spec`: `specs/2026-10-21-meridian-ship-systems-design.md`.

1. §7.3, after its closing paragraph: the shell reads bridge-api's address from `/bridge.json` on first use; only the Hono entry answers the shell's origin (`SHELL_ORIGIN`, default `http://localhost:4300`, none in production); the tokens are described `meridian/StationTelemetry` and `meridian/CommandLink`.
2. §7.4, after the G8 paragraph: "G9 adds two stations and helm orders from `command`, and no module or physics to the simulation. The contract moves to 2.4.0, and `graph.json` and the goldens stay as they are."
3. §8.3, after the console's growth paragraph: the shell's `e2e-growth` target, `playwright.e2e-growth.config.mts` with `testDir: './e2e/growth'`, the projects `engineering`, `command` and `life-support` in that order, a manual bridge-api on seed 7, and the ports of the numbers section.
4. §9, the bundle row: "each station's build" now covers engineering and life-support, and no contract token description contains a sentinel.
5. §10.1, rows for `IStationTelemetry` (`TELEMETRY_FEED`, described `'meridian/StationTelemetry'`, `BridgeTelemetry`, the shell's `Tactical`), `ICommandLink` (`COMMAND_LINK`, `'meridian/CommandLink'`, `BridgeCommandLink`, `Tactical`), `IBridgeEndpoint` (`BRIDGE_ENDPOINT`, `RuntimeBridgeEndpoint`, `Tactical`), `IHelmOrders` (`HELM_ORDERS`, `HelmOrders`, `Command`), `IEngineRoom` (`ENGINE_ROOM`, `EngineRoom`, `EngineeringStation`) and `IAtmosphereDesk` (`ATMOSPHERE_DESK`, `AtmosphereDesk`, `LifeSupportStation`). §9 says section 10 proposes every new name, and none ends in `Service`.
6. §10.2, the "A station" row: "Its section is `<Name>Station` from G9 on" becomes "The G9 stations name their sections `EngineeringStation` and `LifeSupportStation`; `cartography` and `command` keep `Cartography` and `Command`."
7. §11 item 2: "Today it still yields `2.4.0`, and every text the spec quotes stays." becomes "From G9 the contract is at 2.4.0 and the drift build at 2.5.0. The docs pages quote their regions' own 2.3.0 and 2.4.0, which stay."
8. §13: "G9 leaves out a crew command, a command system of a station, CORS on the Express, Fastify and Workers entries, a telemetry reconnect, the heater, vent and pump controls on the life-support station, and a seventh bundle sentinel. G9 changes nothing under `libs/` and no docs region; the /federation/ page lists the two new folders."
9. §15: the plan list gains `specs/plans/2026-10-21-meridian-g9-stations.md`; one row per ruling 1 to 13 above, dated 2026-10-23, each ending "tech lead, G9 ruling N"; a "G9 goes past the spec's G9 text" list with the items of "For the owner" below.

§14 needs no edit. The spec has no G9 error beyond the gaps above; the token description (ruling 2) is a gap, since the spec named none.

Commit 4, `docs(specs): record the g9 figures and ledger in the plan`: this file gains the measured `npx fallow dupes` figure and the commit list with hashes.

Then the fixup of ruling 1: `git commit --fixup=969945e8 -- examples/bridge-console/e2e/growth/weapons.spec.ts`, content only, with the comment of ruling 1 exactly as written there and the test body's statements byte-identical (check with `git diff` that only comment lines changed). Task 7 runs the console's `e2e-growth`, which holds this file.

Verify: `npx prettier --check` on every changed file, the docs-page skill's commands for commit 1, the per-commit pair for the rest. Record `npx fallow dupes`.

- [ ] Steps 1 to 4 and the fixup, then cleanup and the review gate.

### Task 7: the gate

Model: sonnet. Depends on Task 6.

- [ ] Step 1: run (heavy, one job at a time, `--parallel=2`): `npx nx run-many -t lint test build typecheck --parallel=2`; the federation gating suite and the growth suite (`SHELL_PORT=4400`); the console's `e2e-growth` (it holds the file of ruling 1); `npx nx run-many -t e2e-growth --projects=tag:demo --parallel=2` once; `npx fallow dead-code --fail-on-issues`; `npx fallow dupes`; `npx prettier --check .`. Confirm `git diff 169b5baa -- .fallowrc.jsonc` shows added entries only and the threshold at 2.25, and that `git diff 169b5baa --stat -- libs` is empty. Record the dupes figure, which must read 2.15 % or under. Fix any finding in a fixup commit.
- [ ] Step 2: cleanup.

### Task 8: the final review and the PR

Model: opus.

- [ ] Step 1: an independent final branch review that recomputes the figures in the numbers section and checks that earlier goldens and e2e bodies are unchanged (apart from the comment of ruling 1) and that nothing under `libs/` changed. It reads the commit messages against the writing rules. Fix rounds go in fixup commits until it approves.
- [ ] Step 2: fold the fixups with `GIT_SEQUENCE_EDITOR=: NX_NO_CLOUD=true NX_DAEMON=false git rebase -i --autosquash origin/release/0.4`. Then check every commit on its own (heavy): `NX_NO_CLOUD=true NX_DAEMON=false git rebase origin/release/0.4 -x 'NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/meridian-systems --parallel=2 --skip-nx-cache && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/bridge-api --parallel=2 --skip-nx-cache -- test/check.test.ts'`. A commit that fails gets its fix folded into it. Check `git rev-list --count origin/release/0.4..HEAD` is 100 or fewer.
- [ ] Step 3: if `origin/release/0.4` moved, rebase onto it and rerun the gate, then Step 2. Push with `NX_NO_CLOUD=true NX_DAEMON=false git push -u origin feat/meridian-g9-stations` and open the PR against `release/0.4`. The body lists the rulings and the additions beyond the spec's G9 text ("For the owner" below), says "Fixes #196", and ends with the Claude Code line. Wait for CI and fix any CodeQL alert, then report the PR number and the result.

## Open

Questions the architect and the tech lead left for the controller.

1. Task 0's commit subject is `docs(specs): plan meridian g9 stations` (the controller's instruction); the tech lead's task list says `docs(specs): plan the g9 stations`.
2. The habitat row's measured texts are pinned by the Task 5 implementer. If the measured texts show noise between runs, the case needs a ruling.
3. Task 1's failing test depends on which repo-checks test fails first with a new folder and no scope; the implementer confirms the project name and test names.
4. Whether `expect-type` in the repo has `toExtend` (ruling 3 gives the `toMatchTypeOf` fallback).
5. The demo-apps budget comment in ci.yml records run 39642501189 with four projects. The budget figures stay until a CI run with six projects is measured.

## For the owner

Additions and divergences beyond the spec's G9 row. None removes a public export or an earlier test, changes anything under `libs/`, or adds a runtime dependency between packages.

1. The public `/federation/` page changes: "Four folders hold it" becomes "Six folders hold it", with bullets for `examples/federation-engineering` and `examples/federation-life-support` (ruling 11).
2. The contract tokens are described `meridian/StationTelemetry` and `meridian/CommandLink`, since `meridian/TelemetryFeed` would trip the gating bundle check. The contract moves to 2.4.0 and the drift build to 2.5.0 (ruling 2).
3. The federation growth suite holds three cases, one per station remote G9 touches, which reads §7.4's "one e2e case per app" as one per remote project. bridge-api gets no e2e case (ruling 8).
4. The gating federation e2e gains two bundle-check titles for the new station builds, as §9 names each station's build (ruling 8).
5. bridge-api's Hono entry answers the shell's origin through `hono/cors` in development and e2e (`SHELL_ORIGIN`, default `http://localhost:4300`). Express, Fastify and Workers get no CORS (ruling 5).
6. The shell reads bridge-api's address from a runtime `/bridge.json`, and the telemetry stream does not reconnect after the bridge goes offline (ruling 4).
7. The life-support station sends `online`, `scrubber` and `oxygen` for the habitat. Heater, vent and pump stay on the console. Engineering sends no command. G9 adds no crew command (ruling 6).
8. Only the G9 sections take the `<Name>Station` name. `Cartography` and `Command` keep theirs (ruling 6).
9. The #196 weapons comment regains "the burn at 0", which the first fix dropped, and loses a three-clause sentence (ruling 1).
10. Three contract unit cases move their literal versions up one minor, and the shell's `mf.test.ts` records gain the two station keys (rulings 2 and 7).
