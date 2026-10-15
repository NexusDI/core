# Startup profiler Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Goal: Give users a way to see which provider slows or stalls startup: new trace events and fields in `@nexusdi/core`, a `profile()` plugin with its formatters in `@nexusdi/devtools`, and a `nexusdi profile` command in `@nexusdi/cli`.

Architecture: Core only reports. It adds `startMs` to every timed event, a run id and a closing `run` event per `create`, `load`, `createScope` and `extend()`, the sync, await and finish split of each build, the level index, the `:await` events a hung startup needs, and the `:failed` events of a failed one. Every new clock read is `tracer.now()` and every new event goes through `tracer.emit(make)`, so the off path keeps its shape. devtools records those events into a plain JSON `ProfileReport` and renders it as a table, a Chrome DevTools trace and a Perfetto trace. The CLI loads the project's module the way `nexusdi graph` does, runs `profileStartup`, samples the CPU through `node:inspector` and aligns the clocks with two anchor functions.

Tech Stack: TypeScript 6.0.3, Node 24.20.0 (CLI floor 22.12), Vitest 4.1.9, Nx 23, esbuild 0.28.2, `@paulirish/trace_engine` (exact pin), GitHub Actions.

Spec: `specs/2026-10-01-startup-profiler-design.md` on this branch. The section numbers below refer to it. The extension principle (`specs/2026-09-30-extension-principle-design.md` on `origin/spec/package-owned-errors`) and benchmarks spec 14.6 (K14, `specs/2026-09-23-benchmarks-and-launch-design.md`) constrain it.

## Global Constraints

- Worktree: `/Volumes/projects/Personal/NexusDI/.claude/worktrees/startup-profiler`, branch `spec/startup-profiler`, based on `origin/release/0.4` (0.4.0-rc.1). Implementation goes on a branch cut from it, `feat/startup-profiler`, and its pull request targets `release/0.4`.
- Prefix every nx command and every `git commit` and `git push` with `NX_NO_CLOUD=true NX_DAEMON=false`.
- Never `--no-verify`, never a bare `git stash`, never a merge commit (rebase), force-push only the feature branch with `--force-with-lease`. Never publish, never touch `main` or GitHub settings.
- Commit messages: conventional commits, scopes from `commitlint.config.js` (`core`, `devtools`, `cli`, `docs`, `examples`, `ci`, `repo`, `specs`), ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Every task ends green on `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p <the projects it touched>`. Tasks that touch docs or examples also run `-p @nexusdi/meridian @nexusdi/docs @nexusdi/repo-checks`.
- K14: no new hook-site condition. Every new clock read is `tracer.now()` (or `root.tracer.now()` inside an existing `HOOK_SITES && root.buildHooks` guard), every new event goes through `tracer.emit(make)` or `emitCollecting`, and `SITE_CONDITIONS` in `libs/core/bench/completeness.test.ts` does not change. The only unguarded new work on a success path is the run counter increment, the fields added to objects core already allocates (`Run`, `Built`, `StartupPlan`), and one `RunTrace` literal per `createScope`.
- No timing object per build and no `Ctx` field (spec 3.6). `lookup.ts` allocates a `Ctx` per `get()`.
- No field of an rc.0 event is removed, renamed or changes type or meaning. `construct.durationMs` stays the wall span from the call to the store. `NEXUS_PLUGIN_API` stays 1.
- devtools imports nothing from `node:` under `libs/devtools/src` outside tests, and reads core only through `@nexusdi/core`. devtools is `sideEffects: false`; each formatter is its own module under `libs/devtools/src/profile/`, and `devtools()`, `graph()` and `trace()` import no profile module.
- devtools types compile on TypeScript 5.4 (`libs/devtools/tsconfig.floor.json`, the `types-floor` CI job). CLI code runs on Node 22.12 (the `cli-node-floor` job).
- Prose, TSDoc and commit text follow the writing rules of `nexusdi-ways-of-working`: no em dashes, no bold lead-ins, no antithesis, no gerund subjects, no rule of three, no metaphor verbs, never the word "native", never reflect-metadata. Examples are interface-first (`Token<IFoo>`, `provide(TOKEN, { useClass })`).
- A docs page or briefing change runs the `docs-page` skill's verification commands, and prose states no times (owner item (c) 2): profiler output with times appears only as output of an executed region or the page console.

## Owner gates

These were the open owner items in spec section 17. The owner approved every item on 2026-10-14, so every task may run in plan order. The event-type check of the last row still gates the merge.

| Owner item                                                     | What it decides                                                                                                                                                 | Gated                                                                                                              | State               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------- |
| (a) 1                                                          | core grows about +742 B gzip (+4.0%), the size-pass design                                                                                                      | the merge only. Task 7 records the measured figure for the `## Size` section                                       | approved 2026-10-14 |
| (b) 1                                                          | `init` fires for `eager: false` singletons with `onInit`                                                                                                        | Task 6, Steps 5 to 7                                                                                               | approved 2026-10-14 |
| (b) 2                                                          | a compile failure keeps its error and drops the observer's throw                                                                                                | Task 3                                                                                                             | approved 2026-10-14 |
| (c) 1                                                          | P1 wording for a compiler-checked compare on a trace event's `type` or fields (`event.type`, `RunKind`, `compile.phase`); error codes keep their allowance rule | the merge, and the final form of the `observe` dispatch in `profile.ts` (Task 8), which keeps the planned `switch` | approved 2026-10-14 |
| (c) 2                                                          | profiler times appear only in executed output                                                                                                                   | Tasks 20 and 21                                                                                                    | approved 2026-10-14 |
| (c) 3                                                          | the canary installs Chrome stable and beta unpinned                                                                                                             | Task 19                                                                                                            | approved 2026-10-14 |
| event-type owner-vocabulary check (separate PR to release/0.4) | the P1 repo-check reads trace event types                                                                                                                       | gates the merge                                                                                                    | pending             |

Task 6 Step 8 commits the on-demand `init` with the rest of the task. Task 23 runs last.

## Tech lead rulings (2026-10-14)

The architect proposed rulings on the open questions of this plan; the tech lead checked each against the pillars, users and the code on `release/0.4`. Each is applied to the spec and to the tasks below.

1. Docs placement, accepted. New devtools exports go on `/api-devtools/` (docs spec page 38, absent on `release/0.4`); Task 22 creates the page with every devtools export if it is still absent. `nexusdi profile` gets an H2 on `/profiling/`, as `/graph-cli/` documents graph. No `/api-cli/`. Spec 12 and 14 updated.
2. Plan choice 9 (`reportedMs`, `graph.root`), accepted. A hung create never reaches `setup`, so its report has `graph: null`; the Chrome frame URL falls back to `nexusdi://profile`. Spec 6.2, 7.3, 10.1 and Tasks 8, 11, 13 updated.
3. Size report (Task 14), accepted. `<dir>-<feature>.ts` maps to `libs/<dir>`, and Step 3 now checks that the `devtools` row is unchanged and that `devtools+profile` is near spec 11.2's 975 B.
4. `run` events in every trace, accepted. Core spec 3.10.2 classes a new `TraceEventByType` key as an addition, 0.3 had no trace, and an rc tester who asserts a full event list sees one new type per run. Task 2's commit carries no `!`; Task 23's pull request body gets a "Trace changes for observers" section.
5. Build-order facts for the critical path, amended. No new top-level core exports. Core adds `EdgeView.ordersBuild` and `ProviderView.inline` (spec 3.7), computed by internal helpers that compile pass 4 and `levels.ts` also call; `ProfileReport.graph` copies both, and devtools compares no edge kind or lifetime. The view is a P3 contribution point every plugin already reads, a field on it raises no plugin API version, and a saved report keeps the rule of the core that recorded it. Task 7, Step 5 and Tasks 8, 9, 10, 12, 13 updated.
6. Spec-silent choices:
   1. A no-op `load()` is a run (`ok: true`, no `compile`); a `load()` that throws before it compiles is a run with `ok: false` and no `compile`. Accepted. Spec 3.3, Task 2.
   2. `extend()` to the pinned blueprint is a run. Accepted. Spec 3.3, Task 2.
   3. An on-demand failure outside any run drops the observer's throw. Accepted. Spec 3.5, Tasks 5 and 6.
   4. On-demand `construct` fires before `onInit`; `finishMs` covers construct hooks only. Accepted. Task 4.
   5. `async` on `construct:failed` and `init:failed` means "the call returned a thenable", as on `construct` and `init`, whatever failed after it (a rejection, `NEXUS_LAZY_ASYNC` on demand, or validation or a construct hook). Amended from the architect's wording to cover the validation case. Spec 3.1, 3.2, Tasks 5 and 6.
   6. Reuse is a second `compile` with phase `create`, a `compile` for a closed run, or a second `run` event for a closed id. A `construct`, `init` or `:await` event for a closed run is ignored. Accepted. Spec 6.3, Task 8.
   7. Live mode draws a run when its `run` event arrives; `/profiling/` says so and points a stalled startup at `report()`. Accepted. Spec 6.5, Tasks 11 and 20.
   8. `spansOf` in `src/profile/spans.ts`; anchors and `alignClocks` in `libs/cli/src/cpu.ts`. Accepted. Tasks 11, 18.
   9. Covered by ruling 2.
   10. A failed `create` or `load` whose run has no `compile` in the report, or a report with no run, exits 2; every other failure and the timeout exit 1. The CLI reads profiler data, no error code. Accepted. Spec 9.5, Tasks 16 and 17.

## Plan choices

Choices this plan makes where the spec was silent. The tech lead ruled on each (above); the reviewer of the owning task checks the code against them.

1. A `load()` of a module the root already imports is a run: it takes an id and emits `run` with `ok: true` and no `compile`. A `load()` that throws `NEXUS_INVALID_MODULE` before it compiles emits `run` with `ok: false` and no `compile` (Task 2).
2. An `extend()` whose target is the pinned blueprint is a run in the same way (Task 2).
3. On-demand failures outside any run drop an observer's throw on `construct:failed` and `init:failed`; `get()` throws its own error (Tasks 5 and 6).
4. An on-demand singleton emits `construct` before its `onInit` runs, so `init` follows `construct` as in a level build, and its `finishMs` covers construct hooks only (Task 4).
5. `async` on `construct:failed` and `init:failed` is true when the constructor, factory or `onInit` returned a thenable, whatever failed after it. An on-demand `onInit` or factory that returns a thenable fails with `NEXUS_LAZY_ASYNC` and reports `async: true` (Tasks 5 and 6).
6. `profile()` treats a second `compile` with phase `create`, a `compile` for a closed run, and a second `run` event for a closed id as reuse. It ignores a `construct`, `init` or `:await` event for a closed run (Task 8).
7. Live mode draws a run's spans when its `run` event arrives, through the same `spansOf`, so the barrier-path colour is known (Task 11).
8. `spansOf` lives in `src/profile/spans.ts` so `live.ts` does not pull in the Chrome writer. Anchors and `alignClocks` live in `libs/cli/src/cpu.ts` (Task 18).
9. `ProfileReport` gains `reportedMs` (when `report()` ran) and `graph.root` (the root module's name), now in spec 6.2 (Task 8).
10. A failed `create` or `load` exits 2 when its run has no `compile` in the report or the report has no run (an input error such as `NEXUS_INVALID_MODULE`), and 1 otherwise, as spec 9.5 now reads (Task 16).

## Review Focus

1. A disposal that starts while `create` is still building (a construct hook calls `ship[Symbol.asyncDispose]()`). Expect exactly one `run` event for run 0, with `ok: false`, after the rollback's `dispose:instance` events. Task 2 pins it.
2. One `profile()` passed to two `Nexus.create` calls, including the case where the first create failed before setup. Expect `report()` to throw `NEXUS_DEVTOOLS_PROFILE_REUSED` and neither create to fail because of the profiler. Task 8 pins it.
3. A level provider whose constructor calls `get()` on an `eager: false` singleton, which builds a transient. Expect the profiler to attribute both nested builds to run 0 through `parent`, and the table's own time of the level provider to include them in `syncMs`. Task 8 pins it.
4. A report with an empty root module, and one where every span reads 0 ms (a browser's coarse clock). Expect the table, the critical path and both trace files to render with no `NaN`, no `Infinity` and no division by zero. Tasks 9 and 11 pin it.
5. A token whose display name holds a quote, a backslash or `·`. Expect valid JSON in the Chrome file's `args.detail` string, and track names that DevTools parses. Task 11 pins it.

## File map

```
libs/core/src/runtime/
  trace.ts            RunKind, the new event types and fields, emitCollecting, emitRun, contract TSDoc
  state.ts            RootState.nextRun, RunTrace, Run extends RunTrace
  build-levels.ts     buildOne(id, level)
  settle.ts           settleLevel passes the level; rollBack appends run errors and closes the run
  build.ts            traceBuild (all six build events), buildInto from call to store,
                      validateOptions, on-demand and transient spans, on-demand init
  startup.ts          StartupPlan.run, run ids to the builds, the run's failure path
  init.ts             init fields, init:await, init:failed
  compile-traced.ts   run and startMs on compile, the dropped observer throw on failure
  load.ts             the load run
  scope.ts            the createScope and extend() runs, startMs on scope events
  nexus.ts            the create run
  shutdown.ts         startMs on dispose
  trace-events.test.ts   new: one runtime test per event type, field and run kind
  trace.test-d.ts     the rc.0 compatibility checks, the new types
libs/core/src/index.ts  export type RunKind
libs/devtools/src/profile/
  report.ts           ProfileReport and friends, CpuProfile, TraceFile, CriticalPath
  profile.ts          profile(), the recorder
  live.ts             console.timeStamp sink
  steps.ts            stepsOf(run)
  critical-path.ts    criticalPath()
  table.ts            profileTable()
  spans.ts            spansOf(), shared by live.ts and chrome.ts
  chrome.ts           toChromeTrace()
  perfetto.ts         toPerfettoTrace()
  parse.ts            parseProfileReport()
  startup.ts          profileStartup()
  *.test.ts
libs/devtools/src/devtools-error.ts   NEXUS_DEVTOOLS_PROFILE_REUSED, NEXUS_DEVTOOLS_PROFILE_INVALID
libs/devtools/src/no-node.test.ts     the node: scan
libs/devtools/vitest.trace.config.ts, src/profile/trace-engine.trace.test.ts, test-fixtures/profile/*
libs/cli/src/args.ts, main.ts, devtools.ts, profile.ts, cpu.ts, README.md, test-fixtures/profile/*
examples/size/src/devtools-profile.ts
examples/meridian/src/errors/NEXUS_DEVTOOLS_PROFILE_{REUSED,INVALID}.md
examples/meridian/src/pages/{profiling,trace-events}.md
apps/docs/content/{profiling,trace-events}.mdx, errors/NEXUS_DEVTOOLS_PROFILE_*.mdx
.github/workflows/devtools-trace-canary.yml, tools/trace-canary/run.mjs
```

---

## Part 1: core events (spec sections 3 to 5)

Tasks 1 to 7 change `@nexusdi/core` only, apart from the event-sequence claims Task 2 updates across the repo. Each core task adds its tests to one new file, `libs/core/src/runtime/trace-events.test.ts`, which Task 1 creates with this header:

```ts
import { describe, expect, it, vi } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { recordEvents } from '../../test-support/observe.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';
import type { TraceEvent } from './trace.js';

/** Busy-waits `ms` on the clock, so a constructor takes a measurable time. */
function spin(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function only<K extends TraceEvent['type']>(
  events: readonly TraceEvent[],
  type: K,
): TraceEvent<K>[] {
  return events.filter((e): e is TraceEvent<K> => e.type === type);
}

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  exports: [REACTOR, COMPUTER],
});
```

### Task 1: `startMs` on every timed event

Files:

- Modify: `libs/core/src/runtime/trace.ts`, `compile-traced.ts`, `build.ts` (`traceConstruct`), `init.ts`, `scope.ts`, `shutdown.ts`
- Modify: `libs/core/src/runtime/trace.test-d.ts`
- Create: `libs/core/src/runtime/trace-events.test.ts`

Interfaces:

- Produces: `startMs: number` on `compile`, `construct`, `init`, `scope:create`, `scope:extend`, `scope:dispose` and `dispose`. A `construct` with no start (value and alias providers) reports `startMs` equal to its emit time and `durationMs: 0`.

- [ ] Step 1: Write the failing runtime test (append to `trace-events.test.ts`)

```ts
describe('startMs', () => {
  it('gives every timed event a span inside the operation that emitted it', async () => {
    const { events, plugin } = recordEvents();
    const before = performance.now();
    const ship = await Nexus.create(Engineering, { plugins: [plugin] });
    const shuttle = await ship.createScope();
    await shuttle[Symbol.asyncDispose]();
    await ship[Symbol.asyncDispose]();
    const after = performance.now();
    const timed = events.filter(
      (e): e is Extract<TraceEvent, { durationMs: number }> =>
        'durationMs' in e,
    );
    expect(timed.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        'compile',
        'construct',
        'scope:create',
        'scope:dispose',
        'dispose',
      ]),
    );
    for (const e of timed) {
      expect(e.startMs, e.type).toBeGreaterThanOrEqual(before);
      expect(e.startMs + e.durationMs, e.type).toBeLessThanOrEqual(after);
    }
  });

  it('reads no clock during create, get and dispose without an observer', async () => {
    const clock = vi.spyOn(performance, 'now');
    const ship = await Nexus.create(Engineering);
    ship.get(COMPUTER);
    await ship[Symbol.asyncDispose]();
    expect(clock).not.toHaveBeenCalled();
    clock.mockRestore();
  });
});
```

- [ ] Step 2: Update the type test. In `trace.test-d.ts`, rename `CoreTraceEvent` to `Rc0TraceEvent` (keep its body, it is the rc.0 shape) and replace the three `describe('TraceEvent')` cases with:

```ts
type Rc0Type = Rc0TraceEvent['type'];

describe('TraceEvent', () => {
  it('includes an event a third party adds to TraceEventByType', () => {
    expectTypeOf<'@acme/cache/miss'>().toExtend<TraceEvent['type']>();
    expectTypeOf<TraceEvent<'@acme/cache/miss'>>().toExtend<AcmeMiss>();
    expectTypeOf<AcmeMiss>().toExtend<TraceEvent>();
  });

  it('keeps every rc.0 event type', () => {
    expectTypeOf<Rc0Type>().toExtend<TraceEvent['type']>();
  });

  it('keeps every rc.0 field with its rc.0 type', () => {
    expectTypeOf<{ [K in Rc0Type]: TraceEvent<K> }>().toExtend<{
      [K in Rc0Type]: Extract<Rc0TraceEvent, { type: K }>;
    }>();
  });

  it('gives every timed event a startMs', () => {
    expectTypeOf<TraceEvent<'compile'>['startMs']>().toEqualTypeOf<number>();
    expectTypeOf<TraceEvent<'construct'>['startMs']>().toEqualTypeOf<number>();
    expectTypeOf<TraceEvent<'init'>['startMs']>().toEqualTypeOf<number>();
    expectTypeOf<
      TraceEvent<'scope:create'>['startMs']
    >().toEqualTypeOf<number>();
    expectTypeOf<
      TraceEvent<'scope:extend'>['startMs']
    >().toEqualTypeOf<number>();
    expectTypeOf<
      TraceEvent<'scope:dispose'>['startMs']
    >().toEqualTypeOf<number>();
    expectTypeOf<TraceEvent<'dispose'>['startMs']>().toEqualTypeOf<number>();
  });
});
```

- [ ] Step 3: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/core -- trace-events trace.test-d`
Expected: FAIL. `startMs` is `undefined` at runtime and missing from the types.

- [ ] Step 4: Implement

In `trace.ts`, add `startMs: number;` before `durationMs` in `compile`, `construct`, `init`, `scope:create`, `scope:extend`, `scope:dispose` and `dispose`.

`compile-traced.ts`: add `startMs: start,` to both `tracer.emit` literals.

`build.ts`, `traceConstruct`:

```ts
tracer.emit(() => {
  const end = tracer.now();
  return {
    type: 'construct',
    token: record.name,
    providerId: record.id,
    module: moduleName(bp, record),
    lifetime: record.lifetime,
    scope: container.scopeId,
    async: isAsync,
    startMs: start ?? end,
    durationMs: start === undefined ? 0 : end - start,
  };
});
```

`init.ts`: add `startMs: start,`. `scope.ts`: add `startMs: start,` to `scope:create`, `scope:extend` and `scope:dispose`. `shutdown.ts`: add `startMs: start,` to `dispose`.

Search for literals that build these events outside `runtime/` and add the field: `grep -rn "durationMs" libs/core/src libs/core/test-support libs/devtools/src | grep -v "\.d\.ts"`. `nexus.test.ts:166` and `plugins.test.ts:315` build namespaced test events and need no change.

- [ ] Step 5: Run the core targets

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/core @nexusdi/devtools`
Expected: PASS. `test` runs `test-bench`, whose completeness test fails on a new hook-site condition.

- [ ] Step 6: Commit

```bash
git add libs/core
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(core): give every timed trace event its start time

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: run ids and the `run` event

Files:

- Modify: `libs/core/src/runtime/trace.ts`, `state.ts`, `settle.ts`, `startup.ts`, `load.ts`, `scope.ts`, `nexus.ts`, `compile-traced.ts`, `index.ts`
- Modify: `libs/core/src/runtime/startup.test.ts`, `init.test.ts` (the `startBlueprint` literals), `trace.test-d.ts`, `trace-events.test.ts`
- Modify (event-sequence claims): `libs/devtools/src/trace.test.ts`, `libs/devtools/README.md`, `libs/devtools/docs/examples.md`, `examples/meridian/src/pages/introspection.md`, `examples/meridian/src/pages/write-a-plugin.md`, `apps/docs/content/introspection.mdx`, and every core test Step 6 finds

Interfaces:

- Produces in `trace.ts`: `export type RunKind = 'create' | 'load' | 'createScope' | 'extend';`, event `run: { run: number; kind: RunKind; scope: string | null; ok: boolean; startMs: number; durationMs: number }`, `run: number | null` on `compile`, `run: number` on `scope:create` and `scope:extend`, `emitCollecting(tracer: Tracer, errors: unknown[] | undefined, make: () => TraceEvent): void`, `emitRun(tracer: Tracer, run: number, kind: RunKind, scope: string | null, start: number, ok: boolean, errors?: unknown[]): void`.
- Produces in `state.ts`: `interface RunTrace { readonly id: number; errors: unknown[] | undefined }`, `Run extends RunTrace`, `RootState.nextRun: number` (starts at 1; create is run 0).
- Produces in `startup.ts`: `StartupPlan` gains `readonly run: number; readonly kind: 'create' | 'load'; readonly start: number`.
- Produces in `settle.ts`: `rollBack(container, run: { touched; owned; errors?: unknown[] | undefined }, bp, error, parkIn, close: (errors: unknown[]) => void)`. `close` runs after the rollback disposed everything and before the error is built or parked, with the disposer errors followed by the run's collected observer errors. An observer's throw inside `close` joins that list.
- Produces in `compile-traced.ts`: `compileTraced(tracer, input, phase, run: number | null)`.

- [ ] Step 1: Write the failing tests (append to `trace-events.test.ts`)

```ts
describe('run', () => {
  it('ends create with run 0 after every other event, and gives compile the id', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Engineering, { plugins: [plugin] });
    expect(only(events, 'compile')).toMatchObject([
      { phase: 'create', run: 0 },
    ]);
    expect(events.at(-1)).toMatchObject({
      type: 'run',
      run: 0,
      kind: 'create',
      scope: null,
      ok: true,
    });
    expect(only(events, 'run')).toHaveLength(1);
    void ship;
  });

  it('draws load, createScope and extend ids from one counter on the root', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Engineering, { plugins: [plugin] });
    await using shuttle = await ship.createScope();
    class Probe {}
    await ship.load(defineModule({ name: 'Science', providers: [Probe] }));
    await shuttle.extend();
    expect(only(events, 'run').map((e) => [e.run, e.kind, e.scope])).toEqual([
      [0, 'create', null],
      [1, 'createScope', shuttle.id],
      [2, 'load', null],
      [3, 'extend', shuttle.id],
    ]);
    expect(only(events, 'scope:create')).toMatchObject([{ run: 1 }]);
    expect(only(events, 'compile').map((e) => e.run)).toEqual([0, 2]);
    expect(only(events, 'scope:extend')).toMatchObject([{ run: 3 }]);
  });

  it('gives a Nexus.check compile no run and emits no run event', () => {
    const { events, plugin } = recordEvents();
    Nexus.check(Engineering, { plugins: [plugin] });
    expect(events).toMatchObject([
      { type: 'compile', phase: 'check', run: null },
    ]);
  });

  it('ends a failed create with one run event after its rollback', async () => {
    const { events, plugin } = recordEvents();
    class Disposable {
      [Symbol.dispose]() {}
    }
    class Broken {
      static deps = [Disposable] as const;
      constructor(_: Disposable) {
        throw new Error('coolant leak');
      }
    }
    await rejected(Nexus.create([Disposable, Broken], { plugins: [plugin] }));
    const types = events.map((e) => e.type);
    expect(types.indexOf('dispose:instance')).toBeLessThan(
      types.indexOf('run'),
    );
    expect(only(events, 'run')).toMatchObject([
      { run: 0, kind: 'create', ok: false },
    ]);
    expect(events.at(-1)?.type).toBe('run');
  });

  it('ends a create that fails to compile with a run event', async () => {
    const { events, plugin } = recordEvents();
    await rejected(Nexus.create([null as never], { plugins: [plugin] }));
    expect(events.map((e) => e.type)).toEqual(['compile', 'run']);
    expect(events.at(-1)).toMatchObject({ ok: false, kind: 'create' });
  });

  it('ends a create whose disposal started mid-build with exactly one run event', async () => {
    const { events, plugin } = recordEvents();
    let ship: Nexus | undefined;
    const holder = {
      name: 'test:holder',
      apiVersion: 1,
      construct(_: unknown, __: unknown, ___: unknown, container: unknown) {
        ship ??= container as Nexus;
        void ship[Symbol.asyncDispose]();
        return undefined;
      },
    };
    class Late {
      static deps = [REACTOR] as const;
      constructor(readonly reactor: IReactorCore) {}
    }
    await rejected(
      Nexus.create([provide(REACTOR, { useClass: FusionReactor }), Late], {
        plugins: [plugin, holder],
      }),
    );
    expect(only(events, 'run')).toMatchObject([{ run: 0, ok: false }]);
  });

  it('puts an observer throw on a failed run into ProviderError.disposalErrors', async () => {
    const thrown = new Error('telemetry down');
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe(event: TraceEvent) {
        if (event.type === 'run' && !event.ok) throw thrown;
      },
    };
    const SCANNER = new Token<object>('Scanner');
    const ship = await Nexus.create(
      [
        provide(SCANNER, {
          lifetime: 'scoped',
          useFactory: () => {
            throw new Error('sensor fault');
          },
        }),
      ],
      { plugins: [watcher] },
    );
    const error = (await rejected(ship.createScope())) as {
      code: string;
      disposalErrors: readonly unknown[];
    };
    expect(error.code).toBe('NEXUS_PROVIDER_FAILED');
    expect(error.disposalErrors.at(-1)).toBe(thrown);
    await ship[Symbol.asyncDispose]();
  });

  it('counts a load of a module the root already imports as a run', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(
      defineModule({ name: 'Root', imports: [Engineering] }),
      { plugins: [plugin] },
    );
    await ship.load(Engineering);
    expect(only(events, 'run').map((e) => [e.run, e.kind, e.ok])).toEqual([
      [0, 'create', true],
      [1, 'load', true],
    ]);
  });

  it('counts a load that throws before it compiles as a failed run with no compile', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Engineering, { plugins: [plugin] });
    await rejected(ship.load(42 as never));
    expect(only(events, 'compile').map((e) => e.run)).toEqual([0]);
    expect(only(events, 'run').map((e) => [e.run, e.kind, e.ok])).toEqual([
      [0, 'create', true],
      [1, 'load', false],
    ]);
  });
});
```

Add to `trace.test-d.ts`:

```ts
describe('RunKind', () => {
  it('is exported with the four kinds', () => {
    expectTypeOf<RunKind>().toEqualTypeOf<
      'create' | 'load' | 'createScope' | 'extend'
    >();
    expectTypeOf<TraceEvent<'run'>['kind']>().toEqualTypeOf<RunKind>();
    expectTypeOf<TraceEvent<'compile'>['run']>().toEqualTypeOf<number | null>();
  });
});
```

with `RunKind` added to the `import type { ... } from '../index.js'` line.

- [ ] Step 2: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/core -- trace-events trace.test-d`
Expected: FAIL, no `run` events and no `RunKind` export.

- [ ] Step 3: Types and helpers in `trace.ts`

Add `RunKind` above `TraceEventByType` with the TSDoc `/** The operation a run is. May gain a member in a minor release; handle an unknown kind. */`. In `TraceEventByType`, add `/** The run this compile starts; null for Nexus.check. */ run: number | null;` to `compile`, `run: number;` to `scope:create` and `scope:extend`, and the `run` member from spec 3.1. Then add after `send`:

```ts
/**
 * Emits on a failure path (spec 3.5): an observer's throw joins `errors`,
 * or is dropped when the failure has no list to hold it, so the
 * operation's own error reaches the caller.
 */
export function emitCollecting(
  tracer: Tracer,
  errors: unknown[] | undefined,
  make: () => TraceEvent,
): void {
  try {
    tracer.emit(make);
  } catch (error) {
    errors?.push(error);
  }
}

/** The `run` event that ends a create, load, createScope or extend(). */
export function emitRun(
  tracer: Tracer,
  run: number,
  kind: RunKind,
  scope: string | null,
  start: number,
  ok: boolean,
  errors?: unknown[],
): void {
  const make = (): TraceEvent => ({
    type: 'run',
    run,
    kind,
    scope,
    ok,
    startMs: start,
    durationMs: tracer.now() - start,
  });
  if (ok) tracer.emit(make);
  else emitCollecting(tracer, errors, make);
}
```

`index.ts`: `export type { RunKind, TraceEvent, TraceEventByType } from './runtime/trace.js';`

- [ ] Step 4: Run ids in state and the rollback

`state.ts`:

```ts
/** A run's id, and the observer throws its failure path collected (spec 3.5). */
export interface RunTrace {
  readonly id: number;
  errors: unknown[] | undefined;
}
```

`Run` becomes `export interface Run extends RunTrace { ... }`. `RootState` gains `/** The id the next load, createScope or extend() takes. create is run 0. */ nextRun: number;`, and `createRootState` sets `nextRun: 1`.

`settle.ts`, `rollBack`:

```ts
export async function rollBack(
  container: ContainerState,
  run: {
    readonly touched: readonly string[];
    readonly owned: OwnedEntry[];
    readonly errors?: unknown[] | undefined;
  },
  bp: Blueprint,
  error: unknown,
  parkIn: () => unknown[] | undefined,
  close: (errors: unknown[]) => void,
): Promise<unknown> {
  const { root } = container;
  for (const id of run.touched) container.slots.abandon(id);
  const { errors } = await disposeInReverse(
    run.owned,
    root.ownership,
    reportDisposal(root.tracer, container.scopeId),
  );
  if (run.errors !== undefined) errors.push(...run.errors);
  close(errors);
  const parked = error instanceof DisposedError ? parkIn() : undefined;
  if (parked === undefined) return toProviderError(error, bp, errors);
  parked.push(...errors);
  return error;
}
```

Update its TSDoc: "`close` emits the run's closing event; it runs after the disposal and before the error is built, so an observer's throw there joins the disposal errors."

- [ ] Step 5: Emit the run per operation

`compile-traced.ts`: add the `run: number | null` parameter and `run,` to both literals. `Nexus.check` passes `null`.

`startup.ts`: `StartupPlan` gains the three fields from Interfaces. In `startBlueprint`:

```ts
const run: Run = {
  id: plan.run,
  errors: undefined,
  isNew: plan.isNew,
  owner: built,
  touched,
};
root.run = run;
try {
  // unchanged body
} catch (error) {
  root.run = undefined;
  for (const id of touched) root.asyncFlags.delete(id);
  for (const value of registered) root.ownership.unregisterValue(value);
  throw await rollBack(
    root,
    { touched, owned: built.owned, errors: run.errors },
    plan.bp,
    error,
    () => (root.disposing ? root.abortErrors : undefined),
    (errors) =>
      emitRun(
        root.tracer,
        plan.run,
        plan.kind,
        null,
        plan.start,
        false,
        errors,
      ),
  );
}
```

`nexus.ts`, `createContainer`, the body of the outer `try`:

```ts
const tracer = new Tracer(traceSinks(plugins));
const start = tracer.now();
let module: unknown;
let blueprint: Blueprint;
try {
  module = rootModuleOf(root);
  blueprint = compileTraced(tracer, {/* unchanged input */}, 'create', 0);
} catch (error) {
  // No list holds an observer's throw here (spec 3.5).
  emitRun(tracer, 0, 'create', null, start, false);
  throw error;
}
compiled = blueprint;
const state = createRootState({
  blueprint,
  rootRef: module,
  tracer,
  initEnabled: plugins.onInit,
  plugins,
  canon,
  wrap,
});
await buildRoot(state, {
  bp: blueprint,
  isNew: () => true,
  run: 0,
  kind: 'create',
  start,
});
await runSetup(state, plugins, state.handle, start);
emitRun(tracer, 0, 'create', null, start, true);
return state.handle;
```

`buildRoot(state, plan: StartupPlan)` passes `plan` to `startBlueprint`. A failure there already emitted the run in the rollback. `runSetup(state, plugins, ship, start)`, in its `catch`:

```ts
    } catch (error) {
      if (!(error instanceof SetupFailure)) {
        emitRun(state.tracer, 0, 'create', null, start, false);
        throw error;
      }
      const disposalErrors = await abandonRoot(state);
      emitRun(state.tracer, 0, 'create', null, start, false, disposalErrors);
      throw pluginFailed(error.plugin, 'setup', error.error, disposalErrors);
    }
```

`load.ts`, `loadNow`:

```ts
async function loadNow(root: RootState, module: unknown): Promise<void> {
  const tracer = root.tracer;
  const id = root.nextRun++;
  const start = tracer.now();
  let plan: StartupPlan;
  try {
    assertOpen(root);
    // definition, current, existing: unchanged
    if (
      existing !== undefined &&
      current.modules.get(current.root)?.imports.includes(existing)
    ) {
      emitRun(tracer, id, 'load', null, start, true);
      return;
    }
    const next = compileTraced(tracer, {/* unchanged */}, 'load', id);
    plan = {
      bp: next,
      isNew: (pid) => !current.providers.has(pid),
      run: id,
      kind: 'load',
      start,
    };
  } catch (error) {
    emitRun(tracer, id, 'load', null, start, false);
    throw error;
  }
  await startBlueprint(root, plan);
  root.blueprint = plan.bp;
  emitRun(tracer, id, 'load', null, start, true);
}
```

`scope.ts`, `openScope`: take `const id = root.nextRun++; const start = root.tracer.now();` first. Wrap everything up to `createScopeState` in `try { ... } catch (error) { emitRun(root.tracer, id, 'createScope', null, start, false); throw error; }`, then call `buildScope(scope, id, start)`. In `buildScope(scope, run, runStart)`:

```ts
  const trace: RunTrace = { id: run, errors: undefined };
  // ... buildLevels unchanged until Task 4 passes `trace`
  } catch (error) {
    const aborted = scope.disposal !== undefined;
    scope.disposal ??= Promise.resolve();
    throw await rollBack(
      scope,
      { touched: [], owned: scope.owned, errors: trace.errors },
      scope.blueprint,
      error,
      () => (root.disposing ? root.abortErrors : aborted ? scope.abortErrors : undefined),
      (errors) => emitRun(tracer, run, 'createScope', scope.scopeId, runStart, false, errors),
    );
  }
  root.scopes.add(scope);
  tracer.emit(() => ({ type: 'scope:create', scope: scope.scopeId, built, run, startMs: start, durationMs: tracer.now() - start }));
  emitRun(tracer, run, 'createScope', scope.scopeId, runStart, true);
  return scope.handle;
```

`extendNow`: take `const id = root.nextRun++; const runStart = root.tracer.now();` before `assertScopeOpen`. Wrap the checks up to the `RequestMissingError` throw in `try/catch` that emits `run` with `ok: false` and rethrows. When `target === pinned`, emit `run` with `ok: true` and return. Build `const run: Run = { id, errors: undefined, isNew: ..., owner: built, touched }; scope.run = run;`, pass `errors: run.errors` and `(errors) => emitRun(tracer, id, 'extend', scope.scopeId, runStart, false, errors)` to `rollBack`, add `run: id,` to `scope:extend`, and emit `run` with `ok: true` after it.

Update the four `startBlueprint(root, { bp, isNew })` literals in `startup.test.ts` (lines 378, 404, 421) and `init.test.ts` (line 284): add `run: 0, kind: 'create', start: 0` for a first build and `run: 1, kind: 'load', start: 0` for a second.

- [ ] Step 6: Update the event-sequence claims

`run` events now close each run. Find every assertion and doc claim on a full event list:

Run: `grep -rnE "'scope:create'|'dispose:instance'|e\.type\)|event\.type\)" libs examples apps/docs/content --include=*.ts --include=*.md --include=*.mdx | grep -v node_modules`

Insert `'run'` at the end of each run (after `init` for create, after `scope:create` for createScope, after `scope:extend` for extend, after the load's last build for load). The known claims:

- `libs/devtools/src/trace.test.ts` 'emits the lifecycle in order': `['compile', 'construct', 'init', 'run', 'scope:create', 'run', 'construct', 'dispose:instance', 'scope:dispose', 'dispose:instance', 'dispose']`
- `libs/devtools/README.md`: `events; // -> ['compile', 'construct', 'run']`
- `libs/devtools/docs/examples.md`: `// -> ['compile', 'construct', 'construct', 'run']`
- `examples/meridian/src/pages/introspection.md` region `trace`: `// -> ['compile', 'construct', 'construct', 'init', 'run', 'scope:create', 'run', 'scope:dispose', 'dispose:instance', 'dispose']`
- `examples/meridian/src/pages/write-a-plugin.md`: `// -> ['compile', 'construct', 'acme-recorder/armed', 'run']` (the plugin emits `armed` in `setup`, before the run closes)
- `apps/docs/content/introspection.mdx`: add a bullet after the `scope:create` / `scope:dispose` bullet, "- `run`: When a `create`, `load`, `createScope` or `extend()` settles, with its run id, its kind and whether it succeeded.", and change the Try-it at line 82 to "It prints the ten events' types in the order `compile`, `construct`, `construct`, `init`, `run`, `scope:create`, `run`, `scope:dispose`, `dispose:instance`, `dispose`."

Then run the core tests and fix each remaining full-list assertion the same way: `startup.test.ts`, `scope.test.ts`, `nexus.test.ts`, `shutdown.test.ts`, `eager.test.ts`, `check.test.ts`, `format.test.ts`, `construct-container.test.ts`, `plugins.test.ts`, `regressions/r07-dispose-once-in-order.test.ts`. A test that counts events of one type needs no change.

- [ ] Step 7: Run the targets

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/core @nexusdi/devtools @nexusdi/meridian @nexusdi/docs @nexusdi/repo-checks`
Expected: PASS.

- [ ] Step 8: Commit

```bash
git add libs/core libs/devtools examples/meridian apps/docs/content/introspection.mdx
NX_NO_CLOUD=true NX_DAEMON=false git commit -m "feat(core): close every create, load, createScope and extend() with a run event

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: compile failure keeps its error (owner gate (b) 2)

Files:

- Modify: `libs/core/src/runtime/compile-traced.ts`
- Test: `libs/core/src/runtime/trace-events.test.ts`

Interfaces:

- Consumes: `emitCollecting` (Task 2).

- [ ] Step 1: Write the failing test

```ts
describe('compile failure with a throwing observer', () => {
  it('throws the BlueprintError and drops the observer throw', async () => {
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe(event: TraceEvent) {
        if (event.type === 'compile') throw new Error('telemetry down');
      },
    };
    class Bridge {
      static deps = [REACTOR] as const;
      constructor(readonly reactor: IReactorCore) {}
    }
    const error = (await rejected(
      Nexus.create([Bridge], { plugins: [watcher] }),
    )) as { code: string };
    expect(error.code).toBe('NEXUS_BLUEPRINT_INVALID');
  });

  it('still reports an observer throw on a compile that passed', async () => {
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe(event: TraceEvent) {
        if (event.type === 'compile') throw new Error('telemetry down');
      },
    };
    const error = (await rejected(
      Nexus.create(Engineering, { plugins: [watcher] }),
    )) as { code: string };
    expect(error.code).toBe('NEXUS_PROVIDER_FAILED');
  });
});
```

- [ ] Step 2: Run it and see the first case fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/core -- trace-events`
Expected: FAIL, code `NEXUS_PROVIDER_FAILED` for the first case.

- [ ] Step 3: Implement. In the failure branch of `compileTraced`, replace the inner `try { tracer.emit(...) } catch (traceError) { throw traceFailed(traceError, ''); }` with `emitCollecting(tracer, undefined, () => ({ ...same literal }))`, and update the TSDoc: "On a compile failure an observer's throw is dropped, since a BlueprintError or LoadError has no list to hold it, and the compile error reaches the caller."

- [ ] Step 4: Run the core targets

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/core`
Expected: PASS.

- [ ] Step 5: Commit with `fix(core): keep the compile error when an observer throws while reporting it`.

### Task 4: build spans, levels and `construct:await`

Tasks 4 to 7 follow the size-pass design of 2026-10-14 (spec 3.6): one `traceBuild` emits every build event from one literal, and `buildInto` owns a level build from the call to the store. The reviewer's prototype is the reference for the code below.

Files:

- Modify: `libs/core/src/runtime/trace.ts`, `build-levels.ts`, `settle.ts`, `build.ts`, `startup.ts`, `scope.ts`
- Test: `trace-events.test.ts`, `trace.test-d.ts`

Interfaces:

- Consumes: `RunTrace`, `Run` (Task 2).
- Produces in `trace.ts`: the internal `BuildEventFields` interface of spec 3.1, `construct: BuildEventFields` and `'construct:await': BuildEventFields`.
- Produces in `build-levels.ts`: `buildLevels(levels, include, buildOne: (id: string, level: number) => Promise<void>, afterLevel)`. In `settle.ts`: `settleLevel(ids, build: (id: string, level: number) => Promise<void>, level = -1)`.
- Produces in `build.ts`:

```ts
/** The trace events of one build or onInit call. Tasks 5 and 6 add the rest. */
export type BuildEventType = 'construct' | 'construct:await';
export function traceBuild(
  type: BuildEventType,
  container: ContainerState,
  bp: Blueprint,
  id: string,
  run: Pick<RunTrace, 'id'> | undefined,
  level: number | null,
  isAsync: boolean,
  start?: number,
  returned?: number,
  resumed?: number,
): void;
export function validateOptions(
  record: ProviderRecord,
  bp: Blueprint,
  value: unknown,
): Promise<{ readonly value: unknown }>;
export function buildInto(
  container: ContainerState,
  bp: Blueprint,
  id: string,
  owner: Owner,
  run: RunTrace,
  level: number,
): Promise<void>;
```

`traceConstruct`, `store`, `Built`, `buildSingleton` (startup.ts) and `buildScoped` (scope.ts) go.

- [ ] Step 1: Write the failing tests. Add `spin`, `sleep` and `defined` to the helpers at the top of `trace-events.test.ts`, and `lazy` from `../definitions/modifiers.js` to its imports. Lint forbids non-null assertions, so the tests read a value that must exist through `defined(value)`; TypeScript rejects an unused `await using` binding, so a test that never reads its container ends the create with `void ship;`. Tasks 5 to 7 write their tests the same way:

```ts
/** Busy-waits `ms` on the clock, so a constructor takes a measurable time. */
function spin(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** `value`, after the test checked that it exists. */
function defined<T>(value: T | undefined): T {
  expect(value).toBeDefined();
  return value as T;
}
```

```ts
describe('construct spans', () => {
  it('reports run, level, parent and the sync, await and finish split', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Engineering, { plugins: [plugin] });
    void ship;
    const builds = only(events, 'construct');
    expect(
      builds.map((b) => [b.token, b.run, b.level, b.parent, b.awaitMs]),
    ).toEqual([
      ['ReactorCore', 0, 0, null, null],
      ['ShipComputer', 0, 1, null, null],
    ]);
    for (const b of builds) {
      const own = b.syncMs + (b.awaitMs ?? 0) + b.finishMs;
      expect(own).toBeLessThanOrEqual(b.durationMs + 1e-6);
      expect(b.finishMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('emits construct:await when a factory returns a thenable, then construct with awaitMs', async () => {
    const { events, plugin } = recordEvents();
    const CHARTS = new Token<object>('NavCharts');
    await using ship = await Nexus.create(
      [
        provide(CHARTS, {
          useFactory: async () => {
            await sleep(20);
            return {};
          },
        }),
      ],
      { plugins: [plugin] },
    );
    void ship;
    const waiting = only(events, 'construct:await');
    const done = only(events, 'construct');
    expect(waiting).toMatchObject([{ token: 'NavCharts', run: 0, level: 0 }]);
    expect(done).toMatchObject([{ token: 'NavCharts', async: true }]);
    expect(waiting[0]?.startMs).toBe(done[0]?.startMs);
    expect(waiting[0]?.syncMs).toBe(done[0]?.syncMs);
    expect(done[0]?.awaitMs).toBeGreaterThanOrEqual(15);
    const types = events.map((e) => e.type);
    expect(types.indexOf('construct:await')).toBeLessThan(
      types.indexOf('construct'),
    );
  });

  it('shows a sync provider queued behind its level siblings', async () => {
    const { events, plugin } = recordEvents();
    class Fast {}
    class Slow {
      constructor() {
        spin(5);
      }
    }
    await using ship = await Nexus.create([Fast, Slow], { plugins: [plugin] });
    void ship;
    const fast = defined(
      only(events, 'construct').find((b) => b.token === 'Fast'),
    );
    const own = fast.syncMs + fast.finishMs;
    expect(fast.durationMs - own).toBeGreaterThanOrEqual(4);
  });

  it('reports a real syncMs and a parent for nested on-demand and transient builds', async () => {
    const { events, plugin } = recordEvents();
    class Gauge {
      constructor() {
        spin(2);
      }
    }
    const LOG = new Token<object>('Log');
    // A plain dep on an eager: false singleton builds it in a level of its
    // own (rc.1); lazy() keeps it on demand, inside Console's constructor.
    class Console {
      static deps = [lazy(Gauge), LOG] as const;
      readonly gauge: Gauge;
      constructor(
        gauge: () => Gauge,
        readonly log: object,
      ) {
        this.gauge = gauge();
      }
    }
    await using ship = await Nexus.create(
      [
        provide(Gauge, { eager: false }),
        provide(LOG, { lifetime: 'transient', useFactory: () => ({}) }),
        Console,
      ],
      { plugins: [plugin] },
    );
    void ship;
    const byToken = new Map(only(events, 'construct').map((b) => [b.token, b]));
    const panel = defined(byToken.get('Console'));
    const gauge = defined(byToken.get('Gauge'));
    expect(byToken.get('Gauge')).toMatchObject({
      run: 0,
      level: null,
      parent: panel.providerId,
    });
    expect(gauge.syncMs).toBeGreaterThanOrEqual(1.5);
    expect(byToken.get('Log')).toMatchObject({
      run: null,
      level: null,
      parent: panel.providerId,
    });
    expect(panel.syncMs).toBeGreaterThanOrEqual(gauge.syncMs);
  });

  it('numbers a loaded provider by the new blueprint levels', async () => {
    const { events, plugin } = recordEvents();
    class L0 {}
    class L1 {
      static deps = [L0] as const;
      constructor(readonly d: L0) {}
    }
    class L2 {
      static deps = [L1] as const;
      constructor(readonly d: L1) {}
    }
    class L3 {
      static deps = [L2] as const;
      constructor(readonly d: L2) {}
    }
    const Core = defineModule({
      name: 'Core',
      providers: [L0, L1, L2, L3],
      exports: [L3],
    });
    // A root that imports Core, so the loaded module's import of Core is a
    // module the root already holds.
    await using ship = await Nexus.create(
      defineModule({ name: 'Ship', imports: [Core] }),
      { plugins: [plugin] },
    );
    class Probe {
      static deps = [L3] as const;
      constructor(readonly d: L3) {}
    }
    await ship.load(
      defineModule({ name: 'Science', imports: [Core], providers: [Probe] }),
    );
    expect(
      only(events, 'construct').find((b) => b.token === 'Probe'),
    ).toMatchObject({ run: 1, level: 4 });
  });

  it('reports scoped builds with the createScope run and scopedLevels index', async () => {
    const { events, plugin } = recordEvents();
    const SCANNER = new Token<object>('Scanner');
    await using ship = await Nexus.create(
      [provide(SCANNER, { lifetime: 'scoped', useFactory: () => ({}) })],
      { plugins: [plugin] },
    );
    await using shuttle = await ship.createScope();
    expect(
      only(events, 'construct').find((b) => b.token === 'Scanner'),
    ).toMatchObject({
      run: 1,
      level: 0,
      scope: shuttle.id,
    });
  });
});
```

`trace.test-d.ts`:

```ts
describe('construct timing', () => {
  it('declares the split and the place of a build', () => {
    expectTypeOf<TraceEvent<'construct'>['awaitMs']>().toEqualTypeOf<
      number | null
    >();
    expectTypeOf<TraceEvent<'construct'>['level']>().toEqualTypeOf<
      number | null
    >();
    expectTypeOf<
      TraceEvent<'construct:await'>['syncMs']
    >().toEqualTypeOf<number>();
  });

  it('gives construct:await the shape of construct', () => {
    expectTypeOf<Omit<TraceEvent<'construct:await'>, 'type'>>().toEqualTypeOf<
      Omit<TraceEvent<'construct'>, 'type'>
    >();
  });
});
```

- [ ] Step 2: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/core -- trace-events trace.test-d`
Expected: FAIL, the new fields are `undefined` and `construct:await` is no event type.

- [ ] Step 3: Levels. `buildLevels` walks `levels.entries()` and calls `settleLevel(ids, buildOne, i)`. Add to its TSDoc: "`buildOne` receives the level's index into `levels`, skipped levels counted, which the construct and init events report." `settleLevel(ids, build, level = -1)` maps `ids.map((id) => build(id, level))`. `registerStatic`'s call passes no level.

- [ ] Step 4: Types. In `trace.ts`, add `BuildEventFields` with spec 3.1's TSDoc above `TraceEventByType` (not exported), and set `construct: BuildEventFields;` and `'construct:await': BuildEventFields;` with their one-line TSDoc. `BuildEventFields` keeps every rc.0 field of `construct`, so the rc.0 type test still holds.

- [ ] Step 5: `build.ts`

`traceBuild` replaces `traceConstruct`. It builds the whole event inside `make`, so with no observer it reads no record and no clock:

```ts
/**
 * Emits one build event from one shape. Times are tracer.now() readings:
 * `start` at the call, `returned` when it returned, `resumed` when the
 * build resumed after its await. A value or alias provider passes no
 * times and reports a zero span at the emit instant. `parent` is the frame
 * on top of the construction stack at emit time: the build whose
 * constructor or factory this one ran inside.
 */
export function traceBuild(
  type: BuildEventType,
  container: ContainerState,
  bp: Blueprint,
  id: string,
  run: Pick<RunTrace, 'id'> | undefined,
  level: number | null,
  isAsync: boolean,
  start?: number,
  returned?: number,
  resumed?: number,
): void {
  const tracer = container.root.tracer;
  tracer.emit(() => {
    const record = recordOf(bp, id);
    const end = tracer.now();
    const from = start ?? end;
    const back = returned ?? end;
    return {
      type,
      token: record.name,
      providerId: id,
      module: moduleName(bp, record),
      lifetime: record.lifetime,
      scope: container.scopeId,
      async: isAsync,
      run: run?.id ?? null,
      level,
      parent: constructionStack.top()?.providerId ?? null,
      startMs: from,
      syncMs: back - from,
      awaitMs: isAsync ? (resumed ?? end) - back : null,
      finishMs: end - (resumed ?? end),
      durationMs: end - from,
    };
  });
}
```

Move `validateOptions` from `startup.ts` to `build.ts` and export it (its TSDoc now names `buildInto` as the guard against a thenable result). `buildInto` merges `buildSingleton` and `buildScoped` and settles the instance itself:

```ts
export async function buildInto(
  container: ContainerState,
  bp: Blueprint,
  id: string,
  owner: Owner,
  run: RunTrace,
  level: number,
): Promise<void> {
  const record = recordOf(bp, id);
  const { root } = container;
  const tracer = root.tracer;
  const start = tracer.now();
  let isAsync = false;
  let value = construct(record, { bp, container, owner });
  const returned = tracer.now();
  if (record.kind === 'factory' && isThenable(value)) {
    isAsync = true;
    const pending = Promise.resolve(value);
    container.slots.begin(id, pending);
    traceBuild(
      'construct:await',
      container,
      bp,
      id,
      run,
      level,
      true,
      start,
      returned,
    );
    value = await pending;
  }
  // Every build yields once more before it stores, an async one after its
  // await too, so a level's builds store in the order rc.0 gave them: a sync
  // build ahead of an async sibling that settled at once. Construct hooks
  // and disposal follow that order.
  await 0;
  const resumed = tracer.now();
  // Only an options provider carries a schema. The check skips the
  // validation's microtask for every other provider.
  if (record.schema !== undefined) {
    try {
      value = (await validateOptions(record, bp, value)).value;
    } catch (error) {
      // The rollback disposes the rejected output with what was built.
      adopt(owner, record, value);
      throw error;
    }
  }
  // After validation, so the schema checks the factory's own output and
  // the runtime stores what the construct hooks return.
  value = applyConstruct(container, owner, bp, record, value);
  adopt(owner, record, value);
  container.slots.settle(id, value);
  // A root singleton is ready after its onInit, unless onInit is off.
  if (container !== root || !root.initEnabled) container.slots.markReady(id);
  if (record.kind === 'factory') root.asyncFlags.set(id, isAsync);
  traceBuild(
    'construct',
    container,
    bp,
    id,
    run,
    level,
    isAsync,
    start,
    returned,
    resumed,
  );
}
```

`buildOnDemand`: read `returned` after the `construct` call, and replace the `store` call. The `construct` event fires before `onInit`, as a level build's does (plan choice 4), and after `adopt`:

```ts
  const tracer = root.tracer;
  const start = tracer.now();
  const built = construct(record, { bp: ctx.bp, container, owner });
  const returned = tracer.now();
  if (record.kind === 'factory' && isThenable(built)) throw lazyAsync(built);
  const instance = applyConstruct(container, owner, ctx.bp, record, built);
  adopt(owner, record, instance);
  traceBuild('construct', container, ctx.bp, record.id, run, null, false, start, returned, returned);
  if (/* the onInit condition, unchanged */) {
    // body unchanged
  }
  run?.touched.push(record.id);
  container.slots.settle(record.id, instance);
  container.slots.markReady(record.id);
  if (record.kind === 'factory') root.asyncFlags.set(record.id, false);
  return instance;
```

`buildTransient` reads the clock once more after the call, inside the existing guard, and calls `traceBuild('construct', ctx.container, ctx.bp, record.id, undefined, null, false, start, returned, returned)` where it called `traceConstruct`.

- [ ] Step 6: Callers

`startup.ts`: `settleValue(root, bp, record, value, run: RunTrace)` settles and marks ready the value and calls `traceBuild('construct', root, bp, record.id, run, null, false)`; `registerStatic` passes `plan.run`, and its alias line calls `traceBuild('construct', root, plan.bp, record.id, plan.run, null, false)`. `startBlueprint`'s `buildOne` becomes `(id, level) => { touched.push(id); return buildInto(root, plan.bp, id, built, run, level); }`.

`scope.ts`: `buildScope` passes `(id, level) => buildInto(scope, scope.blueprint, id, scope, trace, level)`; `extendNow` passes `(id, level) => { ...; return buildInto(scope, target, id, old ? scope : built, run, level); }`.

`init.ts`: the `buildOne` callback takes `(id)` and stays valid under the wider signature.

- [ ] Step 7: Run the core targets, then the dispatch bench

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/core @nexusdi/devtools`
Expected: PASS, including `test-bench`'s completeness test.

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/core:bench-dispatch`
Expected: every case `pass`. An `inconclusive` case reruns once; a `fail` sends the task back to its last step.

- [ ] Step 8: Measure with `node scripts/size-report.mjs` and record the core figure in the ledger. Commit with `feat(core): report each build's level, parent and sync, await and finish time`.

### Task 5: `construct:failed`

Files:

- Modify: `libs/core/src/runtime/trace.ts`, `build.ts`, `compile-traced.ts`, `nexus.ts`, `load.ts`, `scope.ts`
- Test: `trace-events.test.ts`

Interfaces:

- Consumes: `traceBuild` and `buildInto` (Task 4), `RunTrace`, `emitCollecting` (Task 2).
- Produces: `'construct:failed': BuildEventFields` in `trace.ts`; `BuildEventType` gains `'construct:failed'`; `traceBuild`'s `run` widens to `Pick<RunTrace, 'id' | 'errors'> | undefined`. `RunTrace.errors` becomes optional (`errors?: unknown[]`), created on first use, and the run literals drop `errors: undefined`. `emitCollecting(tracer, errors: unknown[] | undefined, make)` rethrows when it has no list; `emitRun` calls it with its `errors`, and `compileTraced`'s failure branch passes `[]`.

- [ ] Step 1: Write the failing tests

```ts
describe('construct:failed', () => {
  it('reports a throwing constructor before the rollback disposes', async () => {
    const { events, plugin } = recordEvents();
    class Hull {
      [Symbol.dispose]() {}
    }
    class Breach {
      static deps = [Hull] as const;
      constructor(_: Hull) {
        throw new Error('hull breach');
      }
    }
    await rejected(Nexus.create([Hull, Breach], { plugins: [plugin] }));
    const types = events.map((e) => e.type);
    expect(only(events, 'construct:failed')).toMatchObject([
      { token: 'Breach', run: 0, level: 1, async: false, parent: null },
    ]);
    expect(types.indexOf('construct:failed')).toBeLessThan(
      types.indexOf('dispose:instance'),
    );
    expect(events.at(-1)).toMatchObject({ type: 'run', ok: false });
  });

  it('reports a rejected factory with async true after its construct:await', async () => {
    const { events, plugin } = recordEvents();
    const LINK = new Token<object>('SubspaceLink');
    await rejected(
      Nexus.create(
        [
          provide(LINK, {
            useFactory: async () => Promise.reject(new Error('no carrier')),
          }),
        ],
        { plugins: [plugin] },
      ),
    );
    expect(events.map((e) => e.type)).toEqual([
      'compile',
      'construct:await',
      'construct:failed',
      'run',
    ]);
    expect(only(events, 'construct:failed')).toMatchObject([
      {
        async: true,
        level: 0,
      },
    ]);
  });

  it('reports a failure after the factory returned, in options validation or a construct hook', async () => {
    const { events, plugin } = recordEvents();
    const wrecker = {
      name: 'test:wrecker',
      apiVersion: 1,
      construct() {
        throw new Error('wrapper failed');
      },
    };
    await rejected(
      Nexus.create([FusionReactor], { plugins: [plugin, wrecker] }),
    );
    expect(only(events, 'construct:failed')).toMatchObject([
      { token: 'FusionReactor', async: false },
    ]);
  });

  it('reports an on-demand failure with no run and no level', async () => {
    const { events, plugin } = recordEvents();
    class Flaky {
      constructor() {
        throw new Error('flaky');
      }
    }
    await using ship = await Nexus.create([provide(Flaky, { eager: false })], {
      plugins: [plugin],
    });
    expect(() => ship.get(Flaky)).toThrow();
    expect(only(events, 'construct:failed')).toMatchObject([
      { token: 'Flaky', run: null, level: null, parent: null },
    ]);
  });

  it('reports an on-demand async factory with async true', async () => {
    const { events, plugin } = recordEvents();
    const LINK = new Token<object>('Link');
    await using ship = await Nexus.create(
      [
        provide(LINK, {
          eager: false,
          // The types refuse an async factory with eager: false; the cast
          // reaches the runtime refusal this test reads.
          useFactory: (async () => ({})) as () => object,
        }),
      ],
      { plugins: [plugin] },
    );
    expect(() => ship.get(LINK)).toThrow();
    expect(only(events, 'construct:failed')).toMatchObject([
      { token: 'Link', run: null, async: true },
    ]);
  });

  it("names the parent's failure only when a transient inside it throws", async () => {
    const { events, plugin } = recordEvents();
    const SPARK = new Token<object>('Spark');
    class Panel {
      static deps = [SPARK] as const;
      constructor(readonly spark: object) {}
    }
    await rejected(
      Nexus.create(
        [
          provide(SPARK, {
            lifetime: 'transient',
            useFactory: (): object => {
              throw new Error('short');
            },
          }),
          Panel,
        ],
        { plugins: [plugin] },
      ),
    );
    expect(only(events, 'construct:failed').map((e) => e.token)).toEqual([
      'Panel',
    ]);
  });

  it('puts an observer throw on construct:failed after the disposer errors', async () => {
    const thrown = new Error('telemetry down');
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe(event: TraceEvent) {
        if (event.type === 'construct:failed') throw thrown;
      },
    };
    class Breach {
      constructor() {
        throw new Error('hull breach');
      }
    }
    const error = (await rejected(
      Nexus.create([Breach], { plugins: [watcher] }),
    )) as {
      code: string;
      disposalErrors: readonly unknown[];
    };
    expect(error.code).toBe('NEXUS_PROVIDER_FAILED');
    expect(error.disposalErrors).toEqual([thrown]);
  });

  it('fails the build when an observer throws on construct:await', async () => {
    const { events, plugin } = recordEvents();
    const thrown = new Error('telemetry down');
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe(event: TraceEvent) {
        if (event.type === 'construct:await') throw thrown;
      },
    };
    const CHARTS = new Token<object>('NavCharts');
    const error = (await rejected(
      Nexus.create([provide(CHARTS, { useFactory: async () => ({}) })], {
        plugins: [plugin, watcher],
      }),
    )) as { code: string; cause: unknown };
    expect(error).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      cause: thrown,
    });
    expect(only(events, 'construct:failed')).toMatchObject([
      { token: 'NavCharts', async: true },
    ]);
  });
  it('leaves no unhandled rejection when an observer throws on construct:await', async () => {
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe(event: TraceEvent) {
        if (event.type === 'construct:await') throw new Error('telemetry down');
      },
    };
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => void unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const CHARTS = new Token<object>('NavCharts');
      await rejected(
        Nexus.create(
          [
            provide(CHARTS, {
              useFactory: async () => {
                await sleep(1);
                throw new Error('no carrier');
              },
            }),
          ],
          { plugins: [watcher] },
        ),
      );
      await sleep(20);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toEqual([]);
  });

  it('keeps one on-demand instance when an observer throws on its construct event', async () => {
    const thrown = new Error('telemetry down');
    let armed = false;
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe(event: TraceEvent) {
        if (armed && event.type === 'construct') throw thrown;
      },
    };
    const log: string[] = [];
    class Sensor {
      constructor() {
        log.push('built');
      }
      onInit() {
        log.push('init');
      }
      [Symbol.dispose]() {
        log.push('disposed');
      }
    }
    const ship = await Nexus.create([provide(Sensor, { eager: false })], {
      plugins: [watcher],
    });
    armed = true;
    expect(() => ship.get(Sensor)).toThrow(thrown);
    armed = false;
    const sensor = ship.get(Sensor);
    expect(ship.get(Sensor)).toBe(sensor);
    await ship[Symbol.asyncDispose]();
    expect(log).toEqual(['built', 'init', 'disposed']);
  });
});
```

- [ ] Step 2: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/core -- trace-events`
Expected: FAIL, no `construct:failed` events.

- [ ] Step 3: Implement

`trace.ts`: add `'construct:failed': BuildEventFields`, make `RunTrace.errors` optional, and let `emitCollecting` rethrow with no list:

```ts
export function emitCollecting(
  tracer: Tracer,
  errors: unknown[] | undefined,
  make: () => TraceEvent,
): void {
  try {
    tracer.emit(make);
  } catch (error) {
    if (!errors) throw error;
    errors.push(error);
  }
}
```

`emitRun` ends with `emitCollecting(tracer, errors, make);`. `compileTraced`'s failure branch passes `[]`, which drops the throw as before. Drop `errors: undefined` from the run literals in `nexus.ts`, `load.ts` and `scope.ts`.

`build.ts`: `traceBuild` wraps its emit and keeps the operation's own error on a failure event (spec 3.5):

```ts
try {
  tracer.emit(() => {
    /* unchanged */
  });
} catch (error) {
  if (!type.endsWith('failed')) throw error;
  // The observer's throw joins the run's errors, or is dropped outside a run.
  if (run) (run.errors ??= []).push(error);
}
```

`buildInto` wraps everything from the call to `applyConstruct` in one `try`, so a throw from the call, the await, options validation, a construct hook, or an observer of `construct:await` emits `construct:failed`. `returned` and `resumed` become `let ... : number | undefined` declared before the `try`, so the event reports how far the build got:

```ts
  } catch (error) {
    traceBuild('construct:failed', container, bp, id, run, level, isAsync, start, returned, resumed);
    throw error;
  }
```

Inside that `try`, the `construct:await` emit sits in a `try` of its own whose catch calls `observeRejection(pending)` before it rethrows: after an observer's throw nothing awaits the thenable, and its later rejection must stay handled.

`buildOnDemand` wraps the call through `applyConstruct` the same way, with `isAsync = record.kind === 'factory' && isThenable(built)` set before the `NEXUS_LAZY_ASYNC` throw, so a factory that returns a thenable on demand reports `async: true` (plan choice 5). A `run` of `undefined` drops an observer's throw (plan choice 3). It then settles the instance before its `construct` event, for every on-demand build (the onInit branch no longer settles on its own). An observer's throw on that `construct` event is held in a local, the build finishes (onInit, ready, async flag), and the throw then reaches the caller, so the slot keeps the one instance and the next `get()` returns it.

- [ ] Step 4: Run the core targets and the dispatch bench (as Task 4, Step 7)

- [ ] Step 5: Measure, record in the ledger, and commit with `feat(core): report a failed build with construct:failed`.

### Task 6: `init` fields, `init:await`, `init:failed` and on-demand `init`

Files:

- Modify: `libs/core/src/runtime/trace.ts`, `init.ts`, `build.ts`, `startup.ts`
- Modify: `libs/core/src/runtime/init.test.ts` (the direct `runInit` call)
- Test: `trace-events.test.ts`, `trace.test-d.ts`

Interfaces:

- Consumes: `traceBuild` (Tasks 4 and 5), the level index of `buildLevels` (Task 4).
- Produces: `init: BuildEventFields`, `'init:await': BuildEventFields` and `'init:failed': BuildEventFields` in `trace.ts`; `BuildEventType` gains the three init types; `runInit(root, bp, run: Pick<Run, 'id' | 'errors' | 'isNew'>)`.

- [ ] Step 1: Write the failing tests for level `onInit`

```ts
describe('init', () => {
  it('reports run, level and the sync and await split', async () => {
    const { events, plugin } = recordEvents();
    class Reactor {
      onInit() {
        spin(2);
      }
    }
    class Computer {
      static deps = [Reactor] as const;
      constructor(readonly reactor: Reactor) {}
      async onInit() {
        await sleep(20);
      }
    }
    await using ship = await Nexus.create([Reactor, Computer], {
      plugins: [plugin],
    });
    void ship;
    const inits = only(events, 'init');
    expect(inits.map((e) => [e.token, e.run, e.level, e.async])).toEqual([
      ['Reactor', 0, 0, false],
      ['Computer', 0, 1, true],
    ]);
    const [reactor, computer] = inits;
    expect(reactor).toMatchObject({ awaitMs: null });
    expect(defined(reactor).syncMs).toBeGreaterThanOrEqual(1.5);
    expect(defined(computer).awaitMs).toBeGreaterThanOrEqual(15);
    expect(only(events, 'init:await')).toMatchObject([
      { token: 'Computer', level: 1, run: 0 },
    ]);
    const types = events.map((e) => e.type);
    expect(types.lastIndexOf('construct')).toBeLessThan(types.indexOf('init'));
  });

  it('reports a throwing and a rejecting onInit with init:failed', async () => {
    for (const [onInit, isAsync] of [
      [
        () => {
          throw new Error('scram');
        },
        false,
      ],
      [async () => Promise.reject(new Error('scram')), true],
    ] as const) {
      const { events, plugin } = recordEvents();
      class Reactor {
        onInit = onInit;
      }
      await rejected(Nexus.create([Reactor], { plugins: [plugin] }));
      expect(only(events, 'init:failed')).toMatchObject([
        { token: 'Reactor', run: 0, level: 0, async: isAsync },
      ]);
      expect(events.at(-1)).toMatchObject({ type: 'run', ok: false });
    }
  });

  it('gives a loaded singleton the load run', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Engineering, { plugins: [plugin] });
    class Probe {
      onInit() {}
    }
    await ship.load(defineModule({ name: 'Science', providers: [Probe] }));
    // FusionReactor's own onInit fires in run 0.
    expect(
      only(events, 'init').filter((e) => e.token === 'Probe'),
    ).toMatchObject([{ token: 'Probe', run: 1 }]);
  });
  it('fails the onInit when an observer throws on init:await', async () => {
    const { events, plugin } = recordEvents();
    const thrown = new Error('telemetry down');
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe(event: TraceEvent) {
        if (event.type === 'init:await') throw thrown;
      },
    };
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => void unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      class Reactor {
        async onInit() {
          await sleep(1);
          throw new Error('scram');
        }
      }
      const error = await rejected(
        Nexus.create([Reactor], { plugins: [plugin, watcher] }),
      );
      expect(error).toMatchObject({
        code: 'NEXUS_PROVIDER_FAILED',
        cause: thrown,
      });
      await sleep(20);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(only(events, 'init:failed')).toMatchObject([
      { token: 'Reactor', async: true },
    ]);
    expect(unhandled).toEqual([]);
  });
});
```

`trace.test-d.ts`: assert `Omit<TraceEvent<'init'>, 'type'>` equals `Omit<TraceEvent<'construct'>, 'type'>`.

- [ ] Step 2: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/core -- trace-events trace.test-d`
Expected: FAIL.

- [ ] Step 3: Implement for level builds

`trace.ts`: the three init members become `BuildEventFields`. `init.ts`: `runInit` takes the run, walks `run.isNew`, and its `buildOne` takes `(id, level)`. After the ownership guard:

```ts
const tracer = root.tracer;
const start = tracer.now();
let isAsync = false;
let returned: number | undefined;
try {
  const result = instance.onInit();
  returned = tracer.now();
  isAsync = isThenable(result);
  if (isAsync)
    traceBuild('init:await', root, bp, id, run, level, true, start, returned);
  // Awaited for a plain value too, as rc.0 awaited every onInit.
  await result;
} catch (error) {
  traceBuild('init:failed', root, bp, id, run, level, isAsync, start, returned);
  throw error;
}
traceBuild('init', root, bp, id, run, level, isAsync, start, returned);
```

An observer's throw on `init:await` fails the onInit and emits `init:failed` (spec 3.4); the catch around that emit calls `observeRejection(result)` (exported from `build.ts`) before it rethrows, so a later rejection of the unawaited thenable stays handled. `startBlueprint` calls `runInit(root, plan.bp, run)`. The direct call in `init.test.ts` passes `{ id: 0, isNew: () => true }`.

- [ ] Step 4: Run the core targets

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/core`
Expected: PASS.

- [ ] Step 5: Write the failing tests for on-demand `onInit` (owner item (b) 1, approved)

```ts
describe('init from an on-demand build', () => {
  it('emits construct then init for an eager: false singleton with onInit', async () => {
    const { events, plugin } = recordEvents();
    class Sensor {
      onInit() {}
    }
    await using ship = await Nexus.create([provide(Sensor, { eager: false })], {
      plugins: [plugin],
    });
    const before = events.length;
    ship.get(Sensor);
    expect(events.slice(before).map((e) => e.type)).toEqual([
      'construct',
      'init',
    ]);
    expect(only(events, 'init')).toMatchObject([
      { token: 'Sensor', run: null, level: null, async: false, awaitMs: null },
    ]);
  });

  it('emits init:failed for a throwing on-demand onInit', async () => {
    const { events, plugin } = recordEvents();
    class Sensor {
      onInit() {
        throw new Error('calibration');
      }
    }
    await using ship = await Nexus.create([provide(Sensor, { eager: false })], {
      plugins: [plugin],
    });
    expect(() => ship.get(Sensor)).toThrow();
    expect(only(events, 'init:failed')).toMatchObject([
      { token: 'Sensor', async: false },
    ]);
  });

  it('emits init:failed with async: true for an on-demand onInit that returns a thenable', async () => {
    const { events, plugin } = recordEvents();
    class Sensor {
      // An onInit that may return a thenable passes the types with
      // eager: false, and the runtime refuses the thenable it returns.
      onInit(): void | Promise<void> {
        return Promise.resolve();
      }
    }
    await using ship = await Nexus.create([provide(Sensor, { eager: false })], {
      plugins: [plugin],
    });
    expect(() => ship.get(Sensor)).toThrow();
    expect(only(events, 'init:failed')).toMatchObject([
      { token: 'Sensor', run: null, level: null, async: true },
    ]);
  });
  it('keeps the one instance when an observer throws on its on-demand init event', async () => {
    const thrown = new Error('telemetry down');
    let armed = false;
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe(event: TraceEvent) {
        if (armed && event.type === 'init') throw thrown;
      },
    };
    const log: string[] = [];
    class Sensor {
      constructor() {
        log.push('built');
      }
      onInit() {
        log.push('init');
      }
    }
    await using ship = await Nexus.create([provide(Sensor, { eager: false })], {
      plugins: [watcher],
    });
    armed = true;
    expect(() => ship.get(Sensor)).toThrow(thrown);
    armed = false;
    const sensor = ship.get(Sensor);
    expect(ship.get(Sensor)).toBe(sensor);
    expect(log).toEqual(['built', 'init']);
  });
});
```

- [ ] Step 6: Implement. In `buildOnDemand`'s `onInit` branch, take `start = tracer.now()` before the call (the construct event already used the earlier one). On a throw, `traceBuild('init:failed', root, ctx.bp, record.id, run, null, false, start)` before the rethrow. After the call, `isAsync = isThenable(result)` and one `traceBuild(isAsync ? 'init:failed' : 'init', root, ctx.bp, record.id, run, null, isAsync, start, tracer.now())`; a thenable then throws `NEXUS_LAZY_ASYNC` as before, with `async: true` on its `init:failed` (plan choice 5). An observer's throw on that `init` event is held as Task 5 holds one on the `construct` event, so the build finishes before it reaches the caller. `start` becomes a `let` that the onInit branch reassigns. The thenable test gives `onInit` the return type `void | Promise<void>`, which the types accept with `eager: false`.

- [ ] Step 7: Fix the claims the new on-demand `init` changes. Run `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t test -p @nexusdi/core @nexusdi/devtools @nexusdi/meridian` and update each full event list that builds an `eager: false` singleton with `onInit` (insert `'init'` after its `construct`). No hand CHANGELOG entry: nx release writes it from the commit subject. The pull request body carries the sentence "`init` events now fire for `eager: false` singletons with `onInit`".

- [ ] Step 8: Run the targets of Step 4 plus `@nexusdi/devtools @nexusdi/meridian`, measure and record in the ledger, then commit with `feat(core): report init calls with init:await, init:failed and on-demand init` (commitlint refuses the camelCase `onInit` in a subject).

### Task 7: order, the in-flight set and the contract

Files:

- Modify: `libs/core/src/runtime/trace.ts` (contract TSDoc)
- Modify: `libs/devtools/src/plugin-api-1.test-d.ts`
- Create: `libs/core/src/blueprint/build-order.ts` (Step 5)
- Modify: `libs/core/src/blueprint/views.ts`, `levels.ts`, `compile.ts` (Step 5)
- Test: `trace-events.test.ts`, `libs/core/src/blueprint/views.test.ts`

Interfaces:

- Consumes: everything of Tasks 1 to 6.
- Produces: `EdgeView.ordersBuild: boolean` and `ProviderView.inline: boolean` (spec 3.7), read by Task 8.

- [ ] Step 1: Write the order and in-flight tests (they should pass; they pin spec 3.4)

```ts
describe('order and the in-flight set (spec 3.4)', () => {
  it('orders a run: compile, awaits, builds, inits, run', async () => {
    const { events, plugin } = recordEvents();
    const LINK = new Token<object>('SubspaceLink');
    class Relay {
      static deps = [LINK] as const;
      constructor(readonly link: object) {}
      async onInit() {
        await sleep(1);
      }
    }
    await using ship = await Nexus.create(
      [provide(LINK, { useFactory: async () => ({}) }), Relay],
      { plugins: [plugin] },
    );
    void ship;
    expect(events.map((e) => e.type)).toEqual([
      'compile',
      'construct:await',
      'construct',
      'construct',
      'init:await',
      'init',
      'run',
    ]);
  });

  /** The :await events whose provider has no later end event in that run. */
  function inFlight(events: readonly TraceEvent[]): string[] {
    const open = new Map<string, string>();
    for (const e of events) {
      if (e.type === 'construct:await') open.set(`c ${e.providerId}`, e.token);
      if (e.type === 'construct' || e.type === 'construct:failed')
        open.delete(`c ${e.providerId}`);
      if (e.type === 'init:await') open.set(`i ${e.providerId}`, e.token);
      if (e.type === 'init' || e.type === 'init:failed')
        open.delete(`i ${e.providerId}`);
    }
    return [...open.values()];
  }

  it('leaves a hung factory in the in-flight set with no run event', async () => {
    const { events, plugin } = recordEvents();
    const CHARTS = new Token<object>('NavCharts');
    void Nexus.create(
      [
        provide(CHARTS, {
          useFactory: () => new Promise<object>(() => undefined),
        }),
      ],
      { plugins: [plugin] },
    );
    await sleep(10);
    expect(inFlight(events)).toEqual(['NavCharts']);
    expect(only(events, 'run')).toEqual([]);
  });

  it('leaves a hung onInit in the in-flight set', async () => {
    const { events, plugin } = recordEvents();
    class Router {
      onInit() {
        return new Promise<void>(() => undefined);
      }
    }
    void Nexus.create([Router], { plugins: [plugin] });
    await sleep(10);
    expect(inFlight(events)).toEqual(['Router']);
  });
});
```

- [ ] Step 2: Run them

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/core -- trace-events`
Expected: PASS. A failure here is a defect in Tasks 2 to 6; fix it in the file that owns the event.

- [ ] Step 3: The contract text. Replace the TSDoc on `TraceEventByType` with spec 5.1's first quote, preceded by its current first sentence. The quote binds core events only ("Every core event with `durationMs` also has `startMs`") and recommends that a package's own timed events carry `startMs` with the same meaning; keep both sentences verbatim. Then add:

```ts
 * @remarks
 * Stable in plugin API 1: the event types and fields listed on /trace-events/.
 * Evolving: level numbering, and which work `finishMs` covers beyond options
 * validation and construct hooks. Both may change in a minor release.
```

- [ ] Step 4: The third-party fragment. Append to `libs/devtools/src/plugin-api-1.test-d.ts`. The six build events share one shape, so one branch reads all of them:

```ts
describe('a third-party profiler (startup profiler spec 5.3)', () => {
  it('reads every stable field of the run and build events', () => {
    const rows: unknown[] = [];
    const plugin: NexusPlugin = {
      name: 'acme:profiler',
      apiVersion: 1,
      observe(event: TraceEvent) {
        switch (event.type) {
          case 'run':
            rows.push([
              event.run,
              event.kind,
              event.scope,
              event.ok,
              event.startMs,
              event.durationMs,
            ]);
            break;
          case 'construct':
          case 'construct:await':
          case 'construct:failed':
          case 'init':
          case 'init:await':
          case 'init:failed':
            rows.push([
              event.run,
              event.level,
              event.parent,
              event.token,
              event.providerId,
              event.module,
              event.lifetime,
              event.scope,
              event.async,
              event.startMs,
              event.syncMs,
              event.awaitMs,
              event.finishMs,
              event.durationMs,
            ]);
            break;
          case 'compile':
            rows.push([event.run, event.startMs]);
            break;
          default:
            break;
        }
      },
    };
    expectTypeOf(plugin).toExtend<NexusPlugin>();
    expectTypeOf<RunKind>().toExtend<string>();
  });
});
```

with `type RunKind` added to the `@nexusdi/core` import.

- [ ] Step 5: The view fields (spec 3.7, tech lead ruling 5)

Files: `libs/core/src/blueprint/views.ts`, `levels.ts`, `compile.ts`, a new `libs/core/src/blueprint/build-order.ts`, `views.test.ts`, `levels.test.ts`.

`build-order.ts` (internal; `libs/core/src/index.ts` does not export it):

```ts
import type { EdgeKind, ProviderRecord } from './blueprint.js';

/** True when core builds an edge's target before its dependent. Cycles and levels count these edges only. */
export const ordersBuild = (kind: EdgeKind): boolean => kind !== 'lazy';

/** True for a provider with no build level of its own: a transient or an alias. */
export const isInline = (
  r: Pick<ProviderRecord, 'lifetime' | 'kind'>,
): boolean => r.lifetime === 'transient' || r.kind === 'alias';
```

`compile.ts` pass 4 becomes `successorsOf(bound.edges, ordersBuild)`. `levels.ts` drops the local `passesThrough` in `levelFunction` and the inline copy in `collectReached` and calls `isInline`. `views.ts`: `EdgeView` gains `readonly ordersBuild: boolean;` and `ProviderView` gains `readonly inline: boolean;`, with spec 3.7's TSDoc; `providerView` sets `inline: isInline(record)` and `buildView`'s edge literal sets `ordersBuild: ordersBuild(e.kind)`.

Tests first, in `views.test.ts`: a module with a class provider, a transient factory, an alias and a lazy edge; assert `ordersBuild` is false on the lazy edge only, and `inline` is true on the transient and the alias only. Run the existing `levels.test.ts` and `compile.test.ts` unchanged; they pin that the refactor kept the algorithm. Then run the devtools test that snapshots a view or a graph JSON, if one breaks, and add the two fields to its expectation. `@nexusdi/devtools` `graph()` and `NexusGraph` do not change.

Commit with `feat(core): state on the view which edges order a build and which providers are inline`.

- [ ] Step 6: Measure. Run `node scripts/size-report.mjs` and record core's gzip figure against rc.1 in the ledger for the pull request's `## Size` section. The owner approved about +742 B (owner item (a) 1); report the measured figure, and a moderate overshoot does not stop the work.

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/core @nexusdi/devtools && NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/core:bench-dispatch`
Expected: PASS, every K14 case `pass`.

- [ ] Step 7: Commit with `test(core): pin the trace event order and the stable profiler fields`.

---

## Part 2: devtools (spec sections 6, 7 and 10)

Tasks 8 to 14 add `libs/devtools/src/profile/`. Every module there imports `@nexusdi/core` and its siblings only. `src/index.ts` gains each export in the task that adds it.

A shared fixture builder goes in `libs/devtools/test-support/profile-fixture.ts` (Task 8 creates it):

```ts
import type {
  ProfileBuild,
  ProfileReport,
  ProfileRun,
} from '../src/profile/report.js';

/** A level build that took `durationMs`, all of it sync unless `awaitMs` says otherwise. */
export function build(
  fields: Partial<ProfileBuild> &
    Pick<ProfileBuild, 'providerId' | 'token' | 'startMs' | 'durationMs'>,
): ProfileBuild {
  const awaitMs = fields.awaitMs ?? null;
  return {
    module: 'Engineering',
    lifetime: 'singleton',
    scope: null,
    async: awaitMs !== null,
    level: 0,
    parent: null,
    syncMs: fields.durationMs - (awaitMs ?? 0),
    awaitMs,
    finishMs: 0,
    failed: false,
    ...fields,
  };
}

/** A report of one settled create run over `builds`, with a graph of `edges`. */
export function report(
  builds: readonly ProfileBuild[],
  edges: readonly (readonly [from: string, to: string])[] = [],
  run: Partial<ProfileRun> = {},
): ProfileReport {
  const end = Math.max(0, ...builds.map((b) => b.startMs + b.durationMs));
  return {
    format: 'nexusdi-profile',
    version: 1,
    timeOrigin: 0,
    reportedMs: end + 1,
    runs: [
      {
        id: 0,
        kind: 'create',
        scope: null,
        ok: true,
        startMs: 0,
        durationMs: end + 1,
        compile: {
          startMs: 0,
          durationMs: 0,
          modules: 1,
          providers: builds.length,
          errors: 0,
        },
        steps: [],
        builds,
        inits: [],
        pending: [],
        ...run,
      },
    ],
    graph: {
      root: 'Meridian',
      providers: builds.map((b) => ({
        id: b.providerId,
        token: b.token,
        module: b.module,
        lifetime: b.lifetime,
        kind: 'class',
        inline: false,
      })),
      edges: edges.map(([from, to]) => ({
        from,
        to,
        kind: 'required',
        ordersBuild: true,
      })),
    },
    dropped: 0,
    dispose: null,
  };
}
```

`ProfileRun.steps` in a hand-built report starts empty; formatters call `stepsOf` when a report's steps are empty, so a fixture need not compute them.

### Task 8: the report types, `profile()` and `NEXUS_DEVTOOLS_PROFILE_REUSED`

Files:

- Create: `libs/devtools/src/profile/report.ts`, `profile.ts`, `steps.ts`, `profile.test.ts`, `steps.test.ts`
- Create: `libs/devtools/src/no-node.test.ts`, `libs/devtools/test-support/profile-fixture.ts`
- Modify: `libs/devtools/src/devtools-error.ts`, `libs/devtools/src/index.ts`
- Create: `apps/docs/content/errors/NEXUS_DEVTOOLS_PROFILE_REUSED.mdx`, `examples/meridian/src/errors/NEXUS_DEVTOOLS_PROFILE_REUSED.md`
- Modify: `apps/docs/content/errors/_meta.ts`, `apps/docs/content/api-errors.mdx`

Interfaces:

- Consumes: the core events of Tasks 1 to 6, `PluginContext.blueprint()`, `EdgeView.ordersBuild` and `ProviderView.inline` (Task 7).
- Produces in `report.ts`: `ProfileReport`, `ProfileRun`, `ProfileBuild`, `ProfileInit`, `ProfilePending`, `ProfileStep`, `CriticalPath`, `CpuProfile`, `CpuProfileNode`, `TraceFile`, all exported from the package. Spec 6.2's shapes, which include `ProfileReport.reportedMs: number` (the `performance.now()` at which `report()` ran, where a pending span ends), `graph.root: string` (the root module's name, for the Chrome file's frame URL), `graph.providers[].inline` and `graph.edges[].ordersBuild` (tech lead rulings 2 and 5). `ProfileRun.kind` is core's `RunKind` and `ProfileBuild.lifetime` is core's `Lifetime | null`, so the event-type repo-check (PR #106) sees no compare against a bare string; `profile.ts` maps `compile.phase` to a kind explicitly.
- Produces in `profile.ts`: `ProfileOptions`, `Profiler`, `profile(options?: ProfileOptions): Profiler`, and the internal `runOf(recording): ProfileRun`, which the live sink of Task 11 reads.
- Produces in `steps.ts`: `stepsOf(run: Omit<ProfileRun, 'steps'>): ProfileStep[]` and `runLabel(run: Pick<ProfileRun, 'id' | 'kind' | 'scope'>): string`, the name the table and both trace files give a run.
- Produces in `devtools-error.ts`: code `NEXUS_DEVTOOLS_PROFILE_REUSED`, `path: null`.

- [ ] Step 1: Write the failing tests

`libs/devtools/src/profile/profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  Nexus,
  Token,
  defineModule,
  isNexusError,
  lazy,
  provide,
} from '@nexusdi/core';

import { rejected, thrown } from '../../test-support/catch.js';
import { defined } from '../../test-support/defined.js';
import { profile } from '../index.js';

interface IReactorCore {
  readonly output: number;
}
interface INavCharts {
  readonly sectors: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(NAV_CHARTS, {
      useFactory: async (_: IReactorCore) => ({ sectors: 3 }),
      deps: [REACTOR],
    }),
  ],
  exports: [REACTOR, NAV_CHARTS],
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('profile', () => {
  it('records a create run as plain JSON with its builds, steps and graph', async () => {
    const profiler = profile();
    await using ship = await Nexus.create(Engineering, { plugins: [profiler] });
    void ship;
    const report = profiler.report();
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(report).toMatchObject({
      format: 'nexusdi-profile',
      version: 1,
      dropped: 0,
    });
    const [run] = report.runs;
    expect(run).toMatchObject({ id: 0, kind: 'create', ok: true, pending: [] });
    expect(defined(run).builds.map((b) => [b.token, b.level, b.async])).toEqual(
      [
        ['ReactorCore', 0, false],
        ['NavCharts', 1, true],
      ],
    );
    expect(defined(run).steps.map((s) => s.step)).toEqual([
      'compile',
      'build',
      'setup',
    ]);
    expect(report.graph?.root).toBe('Engineering');
    expect(report.graph?.edges).toEqual([
      { from: 'p1', to: 'p0', kind: 'required', ordersBuild: true },
    ]);
    // The view also lists core's built-in REQUEST provider; the report
    // copies the view as it is.
    expect(
      report.graph?.providers
        .filter((p) => p.token !== 'REQUEST')
        .map((p) => [p.token, p.inline]),
    ).toEqual([
      ['ReactorCore', false],
      ['NavCharts', false],
    ]);
  });

  it('records createScope and extend runs only with scopes: true', async () => {
    const SCANNER = new Token<object>('Scanner');
    const Root = defineModule({
      name: 'Root',
      providers: [
        provide(SCANNER, { lifetime: 'scoped', useFactory: () => ({}) }),
      ],
    });
    for (const scopes of [false, true]) {
      const profiler = profile({ scopes });
      await using ship = await Nexus.create(Root, { plugins: [profiler] });
      await using shuttle = await ship.createScope();
      await shuttle.extend();
      expect(profiler.report().runs.map((r) => r.kind)).toEqual(
        scopes ? ['create', 'createScope', 'extend'] : ['create'],
      );
    }
  });

  it('lists the providers a hung create still awaits', async () => {
    const profiler = profile();
    void Nexus.create(
      [
        provide(NAV_CHARTS, {
          useFactory: () => new Promise<INavCharts>(() => undefined),
        }),
      ],
      { plugins: [profiler] },
    );
    await sleep(10);
    const [run] = profiler.report().runs;
    expect(run).toMatchObject({ ok: null, durationMs: null });
    expect(defined(run).pending).toMatchObject([
      { token: 'NavCharts', what: 'construct', level: 0 },
    ]);
  });

  it('attributes nested on-demand and transient builds to the run of their parent', async () => {
    const profiler = profile();
    class Gauge {}
    const LOG = new Token<object>('Log');
    // lazy() keeps Gauge on demand, built inside Console's constructor.
    class Console {
      static deps = [lazy(Gauge), LOG] as const;
      readonly gauge: Gauge;
      constructor(
        gauge: () => Gauge,
        readonly log: object,
      ) {
        this.gauge = gauge();
      }
    }
    await using ship = await Nexus.create(
      [
        provide(Gauge, { eager: false }),
        provide(LOG, { lifetime: 'transient', useFactory: () => ({}) }),
        Console,
      ],
      { plugins: [profiler] },
    );
    void ship;
    const tokens = defined(profiler.report().runs[0]).builds.map(
      (b) => b.token,
    );
    expect(tokens).toEqual(expect.arrayContaining(['Gauge', 'Log', 'Console']));
  });

  it('records no on-demand build after startup', async () => {
    const profiler = profile();
    class Gauge {}
    await using ship = await Nexus.create([provide(Gauge, { eager: false })], {
      plugins: [profiler],
    });
    ship.get(Gauge);
    expect(defined(profiler.report().runs[0]).builds).toEqual([]);
  });

  it('drops the oldest run past maxRuns', async () => {
    const profiler = profile({ maxRuns: 2 });
    await using ship = await Nexus.create(Engineering, { plugins: [profiler] });
    for (const name of ['A', 'B', 'C'])
      await ship.load(defineModule({ name, providers: [] }));
    const report = profiler.report();
    expect(report.runs.map((r) => r.id)).toEqual([2, 3]);
    expect(report.dropped).toBe(2);
  });

  it('keeps an unknown run kind and ignores an unknown event type', () => {
    const profiler = profile();
    const observe = defined(profiler.observe);
    observe({ type: 'acme/cache/miss', key: 'k' } as never);
    observe({
      type: 'run',
      run: 7,
      kind: 'warp',
      scope: null,
      ok: true,
      startMs: 1,
      durationMs: 2,
    } as never);
    expect(profiler.report().runs).toMatchObject([
      { id: 7, kind: 'warp', ok: true },
    ]);
  });

  it('throws NEXUS_DEVTOOLS_PROFILE_REUSED from report() after a second container, and never from create', async () => {
    const profiler = profile();
    await (
      await Nexus.create(Engineering, { plugins: [profiler] })
    )[Symbol.asyncDispose]();
    await (
      await Nexus.create(Engineering, { plugins: [profiler] })
    )[Symbol.asyncDispose]();
    const error = thrown(() => profiler.report());
    expect(isNexusError(error, 'NEXUS_DEVTOOLS_PROFILE_REUSED')).toBe(true);
  });

  it('detects reuse after a create that failed before it compiled', async () => {
    const profiler = profile();
    await rejected(Nexus.create(42 as never, { plugins: [profiler] }));
    await (
      await Nexus.create(Engineering, { plugins: [profiler] })
    )[Symbol.asyncDispose]();
    expect(
      isNexusError(
        thrown(() => profiler.report()),
        'NEXUS_DEVTOOLS_PROFILE_REUSED',
      ),
    ).toBe(true);
  });

  it('ignores a build for a run that already closed, and does not call it reuse', () => {
    const profiler = profile();
    const observe = defined(profiler.observe);
    observe({
      type: 'run',
      run: 0,
      kind: 'create',
      scope: null,
      ok: false,
      startMs: 0,
      durationMs: 5,
    } as never);
    observe({
      type: 'construct',
      token: 'Late',
      providerId: 'p9',
      module: 'M',
      lifetime: 'singleton',
      scope: null,
      async: true,
      run: 0,
      level: 0,
      parent: null,
      startMs: 1,
      syncMs: 0,
      awaitMs: 6,
      finishMs: 0,
      durationMs: 6,
    } as never);
    expect(profiler.report().runs).toMatchObject([
      { id: 0, ok: false, builds: [] },
    ]);
  });

  it('records the disposal, and clear() drops every run', async () => {
    const profiler = profile();
    await (
      await Nexus.create(Engineering, { plugins: [profiler] })
    )[Symbol.asyncDispose]();
    expect(profiler.report().dispose).toMatchObject({ errors: 0 });
    profiler.clear();
    expect(profiler.report()).toMatchObject({
      runs: [],
      dropped: 0,
      dispose: null,
    });
  });
});
```

`libs/devtools/src/profile/steps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { defined } from '../../test-support/defined.js';
import { build, report } from '../../test-support/profile-fixture.js';
import { stepsOf } from './steps.js';

describe('stepsOf', () => {
  it('derives compile, static, build, init and setup from event spans', () => {
    const run = defined(
      report(
        [
          build({
            providerId: 'v',
            token: 'Config',
            startMs: 2,
            durationMs: 0,
            level: null,
            lifetime: null,
          }),
          build({ providerId: 'a', token: 'A', startMs: 3, durationMs: 4 }),
          build({
            providerId: 'b',
            token: 'B',
            startMs: 7,
            durationMs: 2,
            level: 1,
          }),
        ],
        [],
        {
          compile: {
            startMs: 0,
            durationMs: 2,
            modules: 1,
            providers: 3,
            errors: 0,
          },
          inits: [
            {
              providerId: 'b',
              token: 'B',
              level: 1,
              async: false,
              startMs: 9,
              syncMs: 1,
              awaitMs: null,
              durationMs: 1,
              failed: false,
            },
          ],
          durationMs: 12,
        },
      ).runs[0],
    );
    expect(stepsOf(run)).toEqual([
      { step: 'compile', startMs: 0, durationMs: 2 },
      { step: 'static', startMs: 2, durationMs: 0 },
      { step: 'build', startMs: 3, durationMs: 6 },
      { step: 'init', startMs: 9, durationMs: 1 },
      { step: 'setup', startMs: 10, durationMs: 2 },
    ]);
  });

  it('leaves out a step with no events, and setup while the run is open', () => {
    const run = defined(
      report(
        [build({ providerId: 'a', token: 'A', startMs: 1, durationMs: 1 })],
        [],
        {
          compile: null,
          ok: null,
          durationMs: null,
        },
      ).runs[0],
    );
    expect(stepsOf(run).map((s) => s.step)).toEqual(['build']);
  });
});
```

`libs/devtools/src/no-node.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = new URL('.', import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.ts$/.test(entry.name) &&
      !/\.test(-d)?\.ts$|\.trace\.ts$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe('devtools runs in a browser', () => {
  it('imports no node: module outside tests', () => {
    const found = sources(SRC).filter((file) =>
      /from ['"]node:|import\(['"]node:/.test(readFileSync(file, 'utf8')),
    );
    expect(found).toEqual([]);
  });
});
```

The tests read a value that must exist through `defined()` from `libs/devtools/test-support/defined.ts`, as core's do. The graph test leaves out core's built-in `REQUEST` provider, which the view lists and the report copies as it is. The nested build reads `Gauge` through `lazy()`, so it stays on demand under rc.1.

- [ ] Step 2: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/devtools -- profile steps no-node`
Expected: FAIL, `profile` is not exported. `no-node` passes already.

- [ ] Step 3: The error code. In `devtools-error.ts`, widen `code` to `'NEXUS_DEVTOOLS_UNREGISTERED' | 'NEXUS_DEVTOOLS_GRAPH_INVALID' | 'NEXUS_DEVTOOLS_PROFILE_REUSED'`, add the code to `NexusErrorByCode`, and extend the class TSDoc with "or report() was called on a profile() that recorded a second container."

- [ ] Step 4: `report.ts`. Copy spec 6.2's `ProfileReport`, `ProfileRun`, `ProfileBuild` and `ProfileInit` verbatim; they already carry `reportedMs`, `graph.root`, `inline` and `ordersBuild`. Then:

```ts
export type ProfileStep = ProfileRun['steps'][number];
export type ProfilePending = ProfileRun['pending'][number];

/** spec 7.2. */
export interface CriticalPath {
  /* spec 7.2, verbatim */
}

/** A V8 .cpuprofile, as Profiler.stop and node --cpu-prof return it. */
export interface CpuProfile {
  readonly nodes: readonly CpuProfileNode[];
  /** µs on the V8 profile clock. */
  readonly startTime: number;
  readonly endTime: number;
  readonly samples: readonly number[];
  readonly timeDeltas: readonly number[];
}

export interface CpuProfileNode {
  readonly id: number;
  readonly callFrame: {
    readonly functionName: string;
    readonly scriptId: string | number;
    readonly url: string;
    readonly lineNumber: number;
    readonly columnNumber: number;
  };
  readonly hitCount?: number;
  readonly children?: readonly number[];
}

/** A Trace Event Format file, as Chrome DevTools and Perfetto load it. */
export interface TraceFile {
  readonly traceEvents: readonly Readonly<Record<string, unknown>>[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly displayTimeUnit?: 'ms' | 'ns';
}
```

- [ ] Step 5: `steps.ts`

```ts
import type { ProfileRun, ProfileStep } from './report.js';

/**
 * create, load 1, s3, s3 extend 4. A report that parseProfileReport read
 * may come from a newer core and carry a kind outside RunKind; the last
 * line names it as given.
 */
export function runLabel(
  run: Pick<ProfileRun, 'id' | 'kind' | 'scope'>,
): string {
  if (run.kind === 'create') return 'create';
  if (run.kind === 'load') return `load ${run.id}`;
  if (run.kind === 'createScope' && run.scope !== null) return run.scope;
  if (run.kind === 'extend' && run.scope !== null)
    return `${run.scope} extend ${run.id}`;
  return `${run.kind} ${run.id}`;
}

function span(
  step: ProfileStep['step'],
  spans: readonly (readonly [start: number, end: number])[],
): ProfileStep[] {
  if (spans.length === 0) return [];
  const startMs = Math.min(...spans.map(([s]) => s));
  const end = Math.max(...spans.map(([, e]) => e));
  return [{ step, startMs, durationMs: end - startMs }];
}

/**
 * The startup steps of a run, derived from its event spans (spec 7.2).
 * Static work is the value and alias providers and options schemas: the
 * construct events with lifetime null and no level. Build runs from the first level build's start to the last
 * one's end; setup runs from the last build or init end to the run's end.
 */
export function stepsOf(run: Omit<ProfileRun, 'steps'>): ProfileStep[] {
  const ends = (b: { startMs: number; durationMs: number }) =>
    [b.startMs, b.startMs + b.durationMs] as const;
  const compile = run.compile === null ? [] : [ends(run.compile)];
  const statics = run.builds
    .filter((b) => b.level === null && b.lifetime === null)
    .map(ends);
  const levelled = run.builds.filter((b) => b.level !== null).map(ends);
  const inits = run.inits.map(ends);
  const steps = [
    ...span('compile', compile),
    ...span('static', statics),
    ...span('build', levelled),
    ...span('init', inits),
  ];
  if (run.durationMs !== null) {
    const last = Math.max(
      run.startMs,
      ...[...levelled, ...inits].map(([, e]) => e),
    );
    const end = run.startMs + run.durationMs;
    if (end > last || steps.length > 0)
      steps.push({
        step: 'setup',
        startMs: last,
        durationMs: Math.max(0, end - last),
      });
  }
  return steps;
}
```

- [ ] Step 6: `profile.ts`

```ts
import {
  NEXUS_PLUGIN_API,
  type BlueprintView,
  type NexusPlugin,
  type PluginContext,
  type RunKind,
  type TraceEvent,
} from '@nexusdi/core';

import { DevtoolsError } from '../devtools-error.js';
import type {
  LiveSink,
  ProfileBuild,
  ProfileInit,
  ProfilePending,
  ProfileReport,
  ProfileRun,
} from './report.js';
import { stepsOf } from './steps.js';

export interface ProfileOptions {
  /** Draws each run as it closes; pass liveSink() from @nexusdi/devtools/live. Default: no drawing. */
  readonly live?: LiveSink;
  /** Record createScope() and extend() runs as well. Default false: create and load only. */
  readonly scopes?: boolean;
  /** Runs kept; the oldest goes first and counts in report().dropped. Default 1000. */
  readonly maxRuns?: number;
}

/** A plugin that records where startup time goes. One per container. */
export interface Profiler extends NexusPlugin {
  /**
   * What it recorded so far, as plain JSON. An open run has ok: null and lists
   * its in-flight providers in pending. Throws NEXUS_DEVTOOLS_PROFILE_REUSED
   * when the profiler saw a second create.
   */
  report(): ProfileReport;
  /** Drops every recorded run. */
  clear(): void;
}

/** One run as the profiler accumulates it. */
export interface Recording {
  readonly id: number;
  kind: RunKind;
  scope: string | null;
  ok: boolean | null;
  startMs: number;
  durationMs: number | null;
  compile: ProfileRun['compile'];
  readonly builds: ProfileBuild[];
  readonly inits: ProfileInit[];
  readonly pending: Map<string, ProfilePending>;
}

export function runOf(rec: Recording): ProfileRun {
  const run = {
    id: rec.id,
    kind: rec.kind,
    scope: rec.scope,
    ok: rec.ok,
    startMs: rec.startMs,
    durationMs: rec.durationMs,
    compile: rec.compile,
    builds: [...rec.builds],
    inits: [...rec.inits],
    pending: rec.ok === null ? [...rec.pending.values()] : [],
  };
  return { ...run, steps: stepsOf(run) };
}

// The view is one frozen object per blueprint, so a graph built from it
// stays valid until a load or extend() gives the container a new blueprint.
const graphs = new WeakMap<
  BlueprintView,
  NonNullable<ProfileReport['graph']>
>();

/** The report's graph of `view`, built once per blueprint. */
function graphOf(view: BlueprintView): NonNullable<ProfileReport['graph']> {
  const known = graphs.get(view);
  if (known !== undefined) return known;
  const graph = buildGraph(view);
  graphs.set(view, graph);
  return graph;
}

/**
 * The graph of `view`, frozen to its leaves: every report that shares the
 * blueprint shares this object, so no caller may change it for the next.
 */
function buildGraph(view: BlueprintView): NonNullable<ProfileReport['graph']> {
  const names = new Map(view.modules.map((m) => [m.id, m.name]));
  return Object.freeze({
    root: names.get(view.root) ?? view.root,
    providers: Object.freeze(
      view.providers.map((p) =>
        Object.freeze({
          id: p.id,
          token: p.name,
          module: names.get(p.module) ?? p.module,
          lifetime: p.lifetime,
          kind: p.kind,
          inline: p.inline,
        }),
      ),
    ),
    edges: Object.freeze(
      view.edges.map((e) =>
        Object.freeze({
          from: e.from,
          to: e.to,
          kind: e.kind,
          ordersBuild: e.ordersBuild,
        }),
      ),
    ),
  });
}

const REUSED_TEXT =
  'not one container: this profile() recorded a second Nexus.create, so its report would mix two containers.\n  Fix: create one profile() per container: Nexus.create(Root, { plugins: [profile()] }).';

export function profile(options: ProfileOptions = {}): Profiler {
  const scopes = options.scopes ?? false;
  const live = options.live;
  const maxRuns = options.maxRuns ?? 1000;
  const runs = new Map<number, Recording>();
  // Builds with no run wait here for the build that ran them (spec 6.2).
  const orphans = new Map<string, ProfileBuild[]>();
  const seenScopes = new Set<string>();
  let context: PluginContext | undefined;
  let dispose: ProfileReport['dispose'] = null;
  let dropped = 0;
  let creates = 0;
  let reused = false;

  const open = (
    id: number,
    kind: RunKind,
    scope: string | null,
    startMs: number,
  ): Recording => {
    const known = runs.get(id);
    if (known !== undefined) return known;
    if (runs.size >= maxRuns) {
      const [oldest] = runs.keys();
      if (oldest !== undefined) runs.delete(oldest);
      dropped++;
    }
    const rec: Recording = {
      id,
      kind,
      scope,
      ok: null,
      startMs,
      durationMs: null,
      compile: null,
      builds: [],
      inits: [],
      pending: new Map(),
    };
    runs.set(id, rec);
    return rec;
  };

  /** A scope's first run is its createScope; later ones are extend(). */
  const forScope = (
    id: number,
    scope: string | null,
    startMs: number,
  ): Recording => {
    if (scope === null || runs.has(id))
      return open(id, 'create', scope, startMs);
    const kind = seenScopes.has(scope) ? 'extend' : 'createScope';
    seenScopes.add(scope);
    return open(id, kind, scope, startMs);
  };

  const place = (
    build: ProfileBuild,
    run: number | null,
    parent: string | null,
  ): void => {
    const waiting = orphans.get(build.providerId);
    if (waiting !== undefined) orphans.delete(build.providerId);
    const group = waiting === undefined ? [build] : [...waiting, build];
    if (run !== null) {
      forScope(run, build.scope, build.startMs).builds.push(...group);
      return;
    }
    // An on-demand build after startup has neither, and is not recorded.
    if (parent === null) return;
    const list = orphans.get(parent);
    if (list === undefined) orphans.set(parent, group);
    else list.push(...group);
  };

  const closed = (id: number): boolean => {
    const rec = runs.get(id);
    return rec !== undefined && rec.ok !== null;
  };

  const observe = (event: TraceEvent): void => {
    if (reused) return;
    // A build, onInit or await of a run that already closed (an async build that
    // settled after its run failed) is ignored: not reuse, not recorded (plan choice 6).
    if (
      (event.type === 'construct' ||
        event.type === 'construct:failed' ||
        event.type === 'construct:await' ||
        event.type === 'init' ||
        event.type === 'init:failed' ||
        event.type === 'init:await') &&
      event.run !== null &&
      closed(event.run)
    )
      return;
    switch (event.type) {
      case 'compile': {
        if (event.run === null) return;
        if ((event.phase === 'create' && ++creates > 1) || closed(event.run)) {
          reused = true;
          return;
        }
        open(
          event.run,
          event.phase === 'create' ? 'create' : 'load',
          null,
          event.startMs,
        ).compile = {
          startMs: event.startMs,
          durationMs: event.durationMs,
          modules: event.modules,
          providers: event.providers,
          errors: event.errors,
        };
        return;
      }
      case 'construct':
      case 'construct:failed': {
        if (event.scope !== null && !scopes) return;
        const done = event.type === 'construct' ? event : null;
        place(
          {
            providerId: event.providerId,
            token: event.token,
            module: event.module,
            lifetime: event.lifetime,
            scope: event.scope,
            async: event.async,
            level: event.level,
            parent: event.parent,
            startMs: event.startMs,
            syncMs: done?.syncMs ?? null,
            awaitMs: done?.awaitMs ?? null,
            finishMs: done?.finishMs ?? null,
            durationMs: event.durationMs,
            failed: done === null,
          },
          event.run,
          event.parent,
        );
        if (event.run !== null)
          runs
            .get(event.run)
            ?.pending.delete(`construct ${event.scope} ${event.providerId}`);
        return;
      }
      case 'construct:await':
      case 'init:await': {
        if ((event.scope !== null && !scopes) || event.run === null) return;
        const what = event.type === 'construct:await' ? 'construct' : 'init';
        forScope(event.run, event.scope, event.startMs).pending.set(
          `${what} ${event.scope} ${event.providerId}`,
          {
            providerId: event.providerId,
            token: event.token,
            module: event.module,
            level: event.level,
            what,
            startMs: event.startMs,
            syncMs: event.syncMs,
          },
        );
        return;
      }
      case 'init':
      case 'init:failed': {
        if (event.run === null) return;
        const done = event.type === 'init' ? event : null;
        const rec = forScope(event.run, null, event.startMs);
        rec.inits.push({
          providerId: event.providerId,
          token: event.token,
          level: event.level,
          async: event.async,
          startMs: event.startMs,
          syncMs: done?.syncMs ?? null,
          awaitMs: done?.awaitMs ?? null,
          durationMs: event.durationMs,
          failed: done === null,
        });
        rec.pending.delete(`init ${event.scope} ${event.providerId}`);
        return;
      }
      case 'run': {
        if (event.scope !== null && !scopes) return;
        if (closed(event.run)) {
          reused = true;
          return;
        }
        const rec = open(event.run, event.kind, event.scope, event.startMs);
        // RunKind is open to core's additions (spec 5.2, P2), so the run's own kind wins over the inferred one.
        rec.kind = event.kind;
        rec.scope = event.scope;
        rec.ok = event.ok;
        rec.startMs = event.startMs;
        rec.durationMs = event.durationMs;
        rec.pending.clear();
        if (event.scope !== null) seenScopes.add(event.scope);
        // A run's spans are drawn when it closes, so the critical-path colour
        // is known (spec 6.5). An observe hook never throws (spec 6.3).
        if (live !== undefined)
          try {
            live(
              runOf(rec),
              context === undefined ? null : graphOf(context.blueprint()),
            );
          } catch {
            // The view or the sink failed; the app being measured does not.
          }
        return;
      }
      case 'dispose':
        dispose = {
          startMs: event.startMs,
          durationMs: event.durationMs,
          errors: event.errors,
        };
        return;
      default:
        // A type from a newer core or another package (spec 5.3).
        return;
    }
  };

  return {
    name: 'nexus:profile',
    apiVersion: NEXUS_PLUGIN_API,
    observe,
    setup(ctx) {
      context = ctx;
    },
    report() {
      if (reused)
        throw new DevtoolsError(
          { code: 'NEXUS_DEVTOOLS_PROFILE_REUSED', path: null },
          { text: REUSED_TEXT },
        );
      return {
        format: 'nexusdi-profile',
        version: 1,
        timeOrigin: performance.timeOrigin,
        reportedMs: performance.now(),
        runs: [...runs.values()].map(runOf),
        graph: context === undefined ? null : graphOf(context.blueprint()),
        dropped,
        dispose,
      };
    },
    clear() {
      runs.clear();
      orphans.clear();
      dropped = 0;
      dispose = null;
    },
  };
}
```

A build still in `orphans` when `report()` runs (its parent never reported) is left out. `report()` never mutates the recording, so two calls give equal runs; the reviewer checks it.

`init:await` keys use the scope string `null`, matching the `init` delete key `init null <id>`.

`index.ts`: add

```ts
export {
  profile,
  type ProfileOptions,
  type Profiler,
} from './profile/profile.js';
export type {
  CpuProfile,
  CriticalPath,
  ProfileBuild,
  ProfileInit,
  ProfileReport,
  ProfileRun,
  TraceFile,
} from './profile/report.js';
```

- [ ] Step 7: Run the tests

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/devtools -- profile steps no-node`
Expected: PASS.

`init:await` carries `module` and `scope` (spec 3.1), so the profiler reads both from the event; its pending key and the `init` delete key share the form `init <scope> <id>`.

- [ ] Step 8: The code page (load the `docs-page` skill first). `examples/meridian/src/errors/NEXUS_DEVTOOLS_PROFILE_REUSED.md`, following `NEXUS_DEVTOOLS_GRAPH_INVALID.md`:

````md
# NEXUS_DEVTOOLS_PROFILE_REUSED examples

Regions for `apps/docs/content/errors/NEXUS_DEVTOOLS_PROFILE_REUSED.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';
import { profile } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
});

const profiler = profile();
await (
  await Nexus.create(Engineering, { plugins: [profiler] })
)[Symbol.asyncDispose]();
await (
  await Nexus.create(Engineering, { plugins: [profiler] })
)[Symbol.asyncDispose]();

const reused = (() => {
  try {
    return profiler.report();
  } catch (error) {
    return error;
  }
})();
if (!isNexusError(reused, 'NEXUS_DEVTOOLS_PROFILE_REUSED')) throw reused;
const code = reused.code; // -> 'NEXUS_DEVTOOLS_PROFILE_REUSED'
console.log(code);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { profile } from '@nexusdi/devtools';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
});

async function profiled(): Promise<number> {
  const profiler = profile();
  await (
    await Nexus.create(Engineering, { plugins: [profiler] })
  )[Symbol.asyncDispose]();
  return profiler.report().runs.length;
}

const runs = [await profiled(), await profiled()]; // -> [1, 1]
console.log(runs);
```

<!-- #endregion fix -->
````

The doc-examples transform reads a one-line `import` only, so a region splits an import that prettier would wrap; and a `// ->` claim sits on a declaration line, never on a `console.log` call.

`apps/docs/content/errors/NEXUS_DEVTOOLS_PROFILE_REUSED.mdx`, with the frontmatter of the `GRAPH_INVALID` page (`kind: code`, `package: '@nexusdi/devtools'`, `errorClass: DevtoolsError`), a lead paragraph ("`report()` throws `NEXUS_DEVTOOLS_PROFILE_REUSED` when the `profile()` it belongs to was registered in a second `Nexus.create`. Trace events carry no container identity, so one profiler that hears two creates cannot keep their runs apart, and it stops recording at the second one. Neither create fails because of it."), `## Reproduce`, `## Fix` (one `profile()` per container) and `## Fields of DevtoolsError` sections citing the two regions, each with a Try-it line that names the printed value. Add the `_meta.ts` entry after `NEXUS_DEVTOOLS_GRAPH_INVALID` and a row in the devtools block of `api-errors.mdx`: ``| `@nexusdi/devtools` | [`NEXUS_DEVTOOLS_PROFILE_REUSED`](/errors/NEXUS_DEVTOOLS_PROFILE_REUSED/) | `DevtoolsError` | `report()` on a profiler that recorded a second container. |``. Update the `## Fields of DevtoolsError` lists on both existing devtools code pages to name the new code.

- [ ] Step 9: Run the targets

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/devtools @nexusdi/meridian @nexusdi/docs @nexusdi/repo-checks`, then `npm run check:type-floor`.
Expected: PASS, `doc-error-codes` included.

- [ ] Step 10: Commit with `feat(devtools): record startup runs with profile()`.

### Task 9: `criticalPath()` and `profileTable()`

Files:

- Create: `libs/devtools/src/profile/critical-path.ts`, `table.ts`, `critical-path.test.ts`, `table.test.ts`
- Modify: `libs/devtools/src/index.ts`

Interfaces:

- Consumes: `ProfileReport`, `ProfileRun`, `CriticalPath` (Task 8), `stepsOf`.
- Produces: `criticalPath(report: ProfileReport, run: number): CriticalPath | null`; `criticalPathOf(run: ProfileRun, graph: NonNullable<ProfileReport['graph']>): CriticalPath` (internal, used by `spans.ts`); `profileTable(report: ProfileReport | readonly ProfileReport[], options?: { readonly run?: number; readonly top?: number }): string`; `ownMs(b: ProfileBuild): number`.

- [ ] Step 1: Write the failing tests

`critical-path.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { defined } from '../../test-support/defined.js';
import { build, report } from '../../test-support/profile-fixture.js';
import { criticalPath } from './critical-path.js';

describe('criticalPath', () => {
  it('names a barrier: the level-1 provider depends on nothing in level 0', () => {
    // A is slow in level 0; B is fast; C in level 1 depends on B only.
    const r = report(
      [
        build({ providerId: 'a', token: 'A', startMs: 0, durationMs: 10 }),
        build({ providerId: 'b', token: 'B', startMs: 0, durationMs: 1 }),
        build({
          providerId: 'c',
          token: 'C',
          startMs: 10,
          durationMs: 2,
          level: 1,
        }),
      ],
      [['c', 'b']],
    );
    const path = defined(criticalPath(r, 0) ?? undefined);
    expect(path.path.map((p) => [p.token, p.dependsOnPrevious])).toEqual([
      ['A', false],
      ['C', false],
    ]);
    expect(path.buildMs).toBe(12);
    expect(path.boundMs).toBe(10);
    expect(path.barrierMs).toBe(2);
    expect(path.waits[0]).toMatchObject({ token: 'C', waitMs: 9 });
    expect(path.path[1]?.latestDep).toMatchObject({ token: 'B', earlierMs: 9 });
    expect(path.path[0]?.latestDep).toBeNull();
  });

  it('follows a dependency chain through a transient', () => {
    const r = report(
      [
        build({ providerId: 'a', token: 'A', startMs: 0, durationMs: 3 }),
        build({
          providerId: 'c',
          token: 'C',
          startMs: 3,
          durationMs: 2,
          level: 1,
        }),
      ],
      [
        ['c', 't'],
        ['t', 'a'],
      ],
    );
    const graph = defined(r.graph ?? undefined);
    const withTransient = {
      ...r,
      graph: {
        ...graph,
        providers: [
          ...graph.providers,
          {
            id: 't',
            token: 'T',
            module: 'Engineering',
            lifetime: 'transient',
            kind: 'factory',
            inline: true,
          },
        ],
      },
    };
    expect(
      defined(criticalPath(withTransient, 0) ?? undefined).path.map(
        (p) => p.dependsOnPrevious,
      ),
    ).toEqual([false, true]);
  });

  it('reports the late start of an async provider behind sync siblings', () => {
    const r = report([
      build({ providerId: 's', token: 'Sync', startMs: 0, durationMs: 4 }),
      build({
        providerId: 'n',
        token: 'NavCharts',
        startMs: 4,
        durationMs: 20,
        awaitMs: 19,
      }),
    ]);
    expect(defined(criticalPath(r, 0) ?? undefined).path[0]).toMatchObject({
      token: 'NavCharts',
      lateMs: 4,
    });
  });

  it('returns null with no graph, and an empty path for a run with no level builds', () => {
    expect(criticalPath({ ...report([]), graph: null }, 0)).toBeNull();
    expect(criticalPath(report([]), 0)).toMatchObject({
      buildMs: 0,
      boundMs: 0,
      barrierMs: 0,
      path: [],
      waits: [],
    });
  });
});
```

`table.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { build, report } from '../../test-support/profile-fixture.js';
import { profileTable } from './table.js';

const meridian = report(
  [
    build({
      providerId: 'r',
      token: 'ReactorCore',
      startMs: 1,
      durationMs: 1.2,
      syncMs: 0.9,
      finishMs: 0,
    }),
    build({
      providerId: 'n',
      token: 'NavCharts',
      module: 'Tactical',
      startMs: 2.2,
      durationMs: 21.8,
      awaitMs: 21.4,
      syncMs: 0.3,
      finishMs: 0.1,
      level: 1,
    }),
  ],
  [['n', 'r']],
);

// A barrier on a sibling of the previous member (C), one with no dependency
// built in the run (F), and an async member that starts late behind a sync
// sibling (G).
const fleet = report(
  [
    build({ providerId: 'a', token: 'A', startMs: 0, durationMs: 10 }),
    build({ providerId: 'b', token: 'B', startMs: 0, durationMs: 1 }),
    build({
      providerId: 'c',
      token: 'C',
      startMs: 10,
      durationMs: 2,
      level: 1,
    }),
    build({
      providerId: 'f',
      token: 'F',
      startMs: 12,
      durationMs: 1,
      level: 2,
    }),
    build({
      providerId: 'h',
      token: 'H',
      startMs: 13,
      durationMs: 0.5,
      level: 3,
    }),
    build({
      providerId: 'g',
      token: 'G',
      startMs: 13.5,
      durationMs: 5,
      awaitMs: 4.5,
      level: 3,
    }),
  ],
  [
    ['c', 'b'],
    ['g', 'f'],
  ],
);

describe('profileTable', () => {
  it('prints the steps, the slowest providers, the levels and the critical path', () => {
    const text = profileTable(meridian);
    expect(text.split('\n')[0]).toBe('create 25.0 ms, cold');
    expect(text).toContain('slowest providers');
    expect(text).toMatch(
      /NavCharts\s+Tactical\s+1\s+singleton\s+0\.3\s+21\.4\s+0\.1\s+21\.8\s+0\.0\s+async/,
    );
    expect(text).toMatch(
      /ReactorCore\s+Engineering\s+0\s+singleton\s+0\.9\s+-\s+0\.0\s+0\.9\s+0\.3/,
    );
    expect(text).toContain('critical path');
  });

  it('pins the steps, levels and critical path of the meridian fixture', () => {
    const text = profileTable(meridian);
    expect(text).toMatch(
      /^build\s+23\.0\s+95\.8%\s+2 levels, 2 providers, 1 async$/m,
    );
    expect(text).toMatch(/^\s*0\s+1\s+1\.2\s+ReactorCore 0\.9$/m);
    expect(text).toMatch(/^\s*1\s+1\s+21\.8\s+NavCharts 21\.8$/m);
    expect(text).toContain(
      'critical path, build 23.0 ms: dependency bound 22.7 ms, level barriers 0.3 ms',
    );
    expect(text).toMatch(
      /^level 1\s+NavCharts\s+21\.8 ms\s+depends on ReactorCore$/m,
    );
  });

  it("names a barrier's latest dependency, or says the run built none", () => {
    const text = profileTable(fleet);
    expect(text).toMatch(
      /^level 1\s+C\s+2\.0 ms\s+barrier: depends on B, which ended 9\.0 ms earlier$/m,
    );
    expect(text).toMatch(
      /^level 2\s+F\s+1\.0 ms\s+barrier: no dependency built in this run$/m,
    );
    expect(text).toMatch(
      /^level 3\s+G\s+5\.0 ms\s+depends on F; started 0\.5 ms late, behind sync siblings$/m,
    );
    const waits = text.slice(text.indexOf('barrier waits'));
    expect(
      waits
        .split('\n')
        .slice(1, 5)
        .map((line) => line.split(/\s+/).slice(0, 2).join(' ')),
    ).toEqual(['H 13.0', 'F 12.0', 'C 9.0', 'G 0.5']);
  });

  it('limits the provider rows to top', () => {
    expect(profileTable(meridian, { top: 1 })).not.toMatch(/^ReactorCore/m);
  });

  it('shows the cold run and warm medians for several reports', () => {
    const text = profileTable([meridian, meridian, meridian]);
    expect(text.split('\n')[0]).toBe(
      'create 25.0 ms, cold; 2 warm, median 25.0 ms',
    );
  });

  it('marks a failed provider and lists what an open run still awaits', () => {
    const failed = report(
      [
        build({
          providerId: 'b',
          token: 'Breach',
          startMs: 0,
          durationMs: 1,
          failed: true,
          syncMs: null,
          finishMs: null,
        }),
      ],
      [],
      { ok: false },
    );
    expect(profileTable(failed)).toMatch(/Breach.*failed/);
    const open = report([], [], {
      ok: null,
      durationMs: null,
      pending: [
        {
          providerId: 'n',
          token: 'NavCharts',
          module: 'Tactical',
          level: 0,
          what: 'construct',
          startMs: 0,
          syncMs: 0.2,
        },
      ],
    });
    expect(profileTable(open)).toContain(
      'still awaiting: NavCharts (Tactical) factory',
    );
  });

  it('renders an empty run and an all-zero run without NaN or Infinity', () => {
    for (const r of [
      report([]),
      report(
        [build({ providerId: 'z', token: 'Zero', startMs: 0, durationMs: 0 })],
        [],
        { durationMs: 0 },
      ),
    ]) {
      const text = profileTable(r);
      expect(text).not.toMatch(/NaN|Infinity/);
    }
  });
});
```

- [ ] Step 2: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/devtools -- critical-path table`
Expected: FAIL, modules missing.

- [ ] Step 3: `critical-path.ts`

```ts
import type {
  CriticalPath,
  ProfileBuild,
  ProfileReport,
  ProfileRun,
} from './report.js';

type Graph = NonNullable<ProfileReport['graph']>;

export function ownMs(b: ProfileBuild): number {
  return (b.syncMs ?? 0) + (b.awaitMs ?? 0) + (b.finishMs ?? 0);
}

const endOf = (b: ProfileBuild): number => b.startMs + b.durationMs;

export function criticalPathOf(run: ProfileRun, graph: Graph): CriticalPath {
  const levelled = run.builds.filter(
    (b): b is ProfileBuild & { level: number } => b.level !== null && !b.failed,
  );
  if (levelled.length === 0)
    return {
      run: run.id,
      buildMs: 0,
      boundMs: 0,
      barrierMs: 0,
      path: [],
      waits: [],
    };
  const built = new Map(levelled.map((b) => [b.providerId, b]));
  // Core's rule, as the recording core stated it on the view (spec 3.7).
  const through = new Set(
    graph.providers.filter((p) => p.inline).map((p) => p.id),
  );
  const out = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!e.ordersBuild) continue;
    const list = out.get(e.from);
    if (list === undefined) out.set(e.from, [e.to]);
    else list.push(e.to);
  }
  /** The deps built in this run that `id` reaches, passing through transient and alias nodes. */
  const depsOf = (id: string): ProfileBuild[] => {
    const found: ProfileBuild[] = [];
    const seen = new Set<string>();
    const stack = [...(out.get(id) ?? [])];
    for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
      if (seen.has(next)) continue;
      seen.add(next);
      const b = built.get(next);
      if (b !== undefined) found.push(b);
      else if (through.has(next)) stack.push(...(out.get(next) ?? []));
    }
    return found;
  };

  const buildStart = Math.min(...levelled.map((b) => b.startMs));
  const buildEnd = Math.max(...levelled.map(endOf));
  const levels = [...new Set(levelled.map((b) => b.level))].sort(
    (a, b) => a - b,
  );

  const path: CriticalPath['path'][number][] = [];
  let previous: ProfileBuild | undefined;
  for (const level of levels) {
    const members = levelled.filter((b) => b.level === level);
    const levelStart = Math.min(...members.map((b) => b.startMs));
    const last = members.reduce((a, b) => (endOf(b) > endOf(a) ? b : a));
    const deps = depsOf(last.providerId);
    const latest =
      previous === undefined || deps.length === 0
        ? undefined
        : deps.reduce((a, b) => (endOf(b) > endOf(a) ? b : a));
    path.push({
      providerId: last.providerId,
      token: last.token,
      level,
      ownMs: ownMs(last),
      dependsOnPrevious: previous !== undefined && deps.includes(previous),
      lateMs: last.async ? last.startMs - levelStart : null,
      latestDep:
        latest === undefined || previous === undefined
          ? null
          : {
              providerId: latest.providerId,
              token: latest.token,
              earlierMs: endOf(previous) - endOf(latest),
            },
    });
    previous = last;
  }

  const waits = levelled
    .map((b) => {
      const deps = depsOf(b.providerId);
      const ready =
        deps.length === 0 ? buildStart : Math.max(...deps.map(endOf));
      return {
        providerId: b.providerId,
        token: b.token,
        waitMs: b.startMs - ready,
      };
    })
    .filter((w) => w.waitMs > 0)
    .sort((a, b) => b.waitMs - a.waitMs);

  const finish = new Map<string, number>();
  for (const b of [...levelled].sort((x, y) => x.level - y.level))
    finish.set(
      b.providerId,
      Math.max(
        0,
        ...depsOf(b.providerId).map((d) => finish.get(d.providerId) ?? 0),
      ) + ownMs(b),
    );
  const boundMs = Math.max(0, ...finish.values());
  const buildMs = buildEnd - buildStart;
  return {
    run: run.id,
    buildMs,
    boundMs,
    barrierMs: Math.max(0, buildMs - boundMs),
    path,
    waits,
  };
}

/** null when the report has no graph (no create reached setup) or no such run. */
export function criticalPath(
  report: ProfileReport,
  run: number,
): CriticalPath | null {
  const found = report.runs.find((r) => r.id === run);
  if (report.graph === null || found === undefined) return null;
  return criticalPathOf(found, report.graph);
}
```

- [ ] Step 4: `table.ts`

```ts
import { criticalPathOf, ownMs } from './critical-path.js';
import type { ProfileBuild, ProfileReport, ProfileRun } from './report.js';
import { runLabel, stepsOf } from './steps.js';

const ms = (n: number | null): string => (n === null ? '-' : n.toFixed(1));

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length === 0
    ? 0
    : s.length % 2 === 1
      ? (s[mid] ?? 0)
      : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/** Lines of padded columns; `right` marks the numeric ones. */
function columns(
  rows: readonly (readonly string[])[],
  right: readonly boolean[],
): string[] {
  const widths = right.map((_, i) =>
    Math.max(...rows.map((r) => (r[i] ?? '').length)),
  );
  return rows.map((r) =>
    r
      .map((cell, i) =>
        right[i] ? cell.padStart(widths[i] ?? 0) : cell.padEnd(widths[i] ?? 0),
      )
      .join('  ')
      .trimEnd(),
  );
}

const spanOf = (run: ProfileRun): number =>
  run.durationMs ??
  Math.max(0, ...run.builds.map((b) => b.startMs + b.durationMs - run.startMs));

function pick(
  report: ProfileReport,
  id: number | undefined,
): ProfileRun | undefined {
  return id === undefined
    ? report.runs[0]
    : report.runs.find((r) => r.id === id);
}

/** Steps, slowest providers, levels and the critical path. Several reports: the first as cold, the rest as warm medians. */
export function profileTable(
  report: ProfileReport | readonly ProfileReport[],
  options: { readonly run?: number; readonly top?: number } = {},
): string {
  const reports: readonly ProfileReport[] = Array.isArray(report)
    ? report
    : [report as ProfileReport];
  const [cold, ...warm] = reports;
  const run = cold === undefined ? undefined : pick(cold, options.run);
  if (cold === undefined || run === undefined) return 'no run recorded\n';
  const warmRuns = warm.flatMap((r) => pick(r, options.run) ?? []);
  const lines: string[] = [];

  const status =
    run.ok === false ? ', failed' : run.ok === null ? ', still running' : '';
  lines.push(
    `${runLabel(run)} ${ms(spanOf(run))} ms${status}, cold` +
      (warmRuns.length > 0
        ? `; ${warmRuns.length} warm, median ${ms(median(warmRuns.map(spanOf)))} ms`
        : ''),
  );

  const steps = run.steps.length > 0 ? run.steps : stepsOf(run);
  const total = steps.reduce((sum, s) => sum + s.durationMs, 0);
  const levels = new Map<number, ProfileBuild[]>();
  for (const b of run.builds)
    if (b.level !== null)
      levels.set(b.level, [...(levels.get(b.level) ?? []), b]);
  const note = (step: string): string => {
    if (step === 'build')
      return `${levels.size} levels, ${run.builds.filter((b) => b.level !== null).length} providers, ${run.builds.filter((b) => b.async).length} async`;
    if (step === 'init') return `${run.inits.length} onInit`;
    return '';
  };
  const warmStep = (step: string): string =>
    warmRuns.length === 0
      ? ''
      : ms(
          median(
            warmRuns.map(
              (r) =>
                (r.steps.length > 0 ? r.steps : stepsOf(r)).find(
                  (s) => s.step === step,
                )?.durationMs ?? 0,
            ),
          ),
        );
  lines.push(
    '',
    ...columns(
      [
        [
          'step',
          'ms',
          'share',
          ...(warmRuns.length > 0 ? ['warm ms'] : []),
          '',
        ],
        ...steps.map((s) => [
          s.step,
          ms(s.durationMs),
          `${(total > 0 ? (s.durationMs / total) * 100 : 0).toFixed(1)}%`,
          ...(warmRuns.length > 0 ? [warmStep(s.step)] : []),
          note(s.step),
        ]),
      ],
      [false, true, true, ...(warmRuns.length > 0 ? [true] : []), false],
    ),
  );

  const rows = [...run.builds]
    .sort((a, b) => ownMs(b) - ownMs(a))
    .slice(0, options.top ?? 20);
  lines.push(
    '',
    'slowest providers',
    ...columns(
      [
        [
          'provider',
          'module',
          'level',
          'lifetime',
          'sync ms',
          'await ms',
          'finish ms',
          'own ms',
          'queued ms',
          '',
        ],
        ...rows.map((b) => [
          b.token,
          b.module,
          b.level === null ? '-' : String(b.level),
          b.lifetime ?? '-',
          ms(b.syncMs),
          ms(b.awaitMs),
          ms(b.finishMs),
          ms(ownMs(b)),
          ms(b.failed ? null : Math.max(0, b.durationMs - ownMs(b))),
          b.failed ? 'failed' : b.async ? 'async' : '',
        ]),
      ],
      [false, false, true, false, true, true, true, true, true, false],
    ),
  );

  if (levels.size > 0) {
    lines.push(
      '',
      'levels',
      ...columns(
        [
          ['level', 'providers', 'wall ms', 'slowest'],
          ...[...levels]
            .sort(([a], [b]) => a - b)
            .map(([level, builds]) => {
              const start = Math.min(...builds.map((b) => b.startMs));
              const end = Math.max(
                ...builds.map((b) => b.startMs + b.durationMs),
              );
              const slowest = builds.reduce((a, b) =>
                ownMs(b) > ownMs(a) ? b : a,
              );
              return [
                String(level),
                String(builds.length),
                ms(end - start),
                `${slowest.token} ${ms(ownMs(slowest))}`,
              ];
            }),
        ],
        [true, true, true, false],
      ),
    );
  }

  if (cold.graph !== null && levels.size > 0) {
    const path = criticalPathOf(run, cold.graph);
    lines.push(
      '',
      `critical path, build ${ms(path.buildMs)} ms: dependency bound ${ms(path.boundMs)} ms, level barriers ${ms(path.barrierMs)} ms`,
      ...columns(
        path.path.map((p, i) => [
          `level ${p.level}`,
          p.token,
          `${ms(p.ownMs)} ms`,
          [
            i === 0
              ? ''
              : p.dependsOnPrevious
                ? `depends on ${path.path[i - 1]?.token ?? ''}`
                : p.latestDep === null
                  ? 'barrier: no dependency built in this run'
                  : `barrier: depends on ${p.latestDep.token}, which ended ${ms(p.latestDep.earlierMs)} ms earlier`,
            p.lateMs !== null && p.lateMs > 0
              ? `started ${ms(p.lateMs)} ms late, behind sync siblings`
              : '',
          ]
            .filter((note) => note !== '')
            .join('; '),
        ]),
        [false, false, true, false],
      ),
    );
    if (path.waits.length > 0)
      lines.push(
        '',
        'barrier waits (start minus the end of its own deps)',
        ...columns(
          path.waits.slice(0, 5).map((w) => [w.token, `${ms(w.waitMs)} ms`]),
          [false, true],
        ),
      );
  }

  if (run.pending.length > 0)
    lines.push(
      '',
      `still awaiting: ${run.pending
        .map(
          (p) =>
            `${p.token} (${p.module}) ${p.what === 'construct' ? 'factory' : 'onInit'}, ${ms(cold.reportedMs - p.startMs)} ms`,
        )
        .join('; ')}`,
    );
  if (cold.dispose !== null)
    lines.push(
      '',
      `dispose ${ms(cold.dispose.durationMs)} ms${cold.dispose.errors > 0 ? `, ${cold.dispose.errors} errors` : ''}`,
    );
  return `${lines.join('\n')}\n`;
}
```

`index.ts`: export `criticalPath` and `profileTable`.

- [ ] Step 5: Run the tests, then the package targets

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/devtools`
Expected: PASS.

- [ ] Step 6: Commit with `feat(devtools): print a startup table and the critical path`.

### Task 10: `parseProfileReport()`, `profileStartup()` and `NEXUS_DEVTOOLS_PROFILE_INVALID`

Files:

- Create: `libs/devtools/src/profile/parse.ts`, `startup.ts`, `parse.test.ts`, `startup.test.ts`
- Modify: `libs/devtools/src/devtools-error.ts`, `libs/devtools/src/index.ts`
- Create: `apps/docs/content/errors/NEXUS_DEVTOOLS_PROFILE_INVALID.mdx`, `examples/meridian/src/errors/NEXUS_DEVTOOLS_PROFILE_INVALID.md`
- Modify: `apps/docs/content/errors/_meta.ts`, `apps/docs/content/api-errors.mdx`, both existing devtools code pages' field lists

Interfaces:

- Produces: `parseProfileReport(value: unknown): ProfileReport`; `profileStartup(root: RootRef, options?: { readonly plugins?: readonly NexusPlugin[]; readonly load?: readonly ModuleRef[]; readonly profiler?: Profiler }): Promise<ProfileReport>`; code `NEXUS_DEVTOOLS_PROFILE_INVALID` with `path` the first bad field.

- [ ] Step 1: Write the failing tests

`parse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { isNexusError } from '@nexusdi/core';

import { thrown } from '../../test-support/catch.js';
import { build, report } from '../../test-support/profile-fixture.js';
import { parseProfileReport } from './parse.js';

const good = report([
  build({ providerId: 'a', token: 'A', startMs: 0, durationMs: 1 }),
]);

function pathOf(value: unknown): string | null {
  const error = thrown(() => parseProfileReport(value));
  if (!isNexusError(error, 'NEXUS_DEVTOOLS_PROFILE_INVALID')) throw error;
  return error.path;
}

describe('parseProfileReport', () => {
  it('returns a report that JSON wrote', () => {
    expect(parseProfileReport(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it('names the first bad field', () => {
    const bad = JSON.parse(JSON.stringify(good));
    delete bad.runs[0].builds[0].startMs;
    expect(pathOf(bad)).toBe('runs[0].builds[0].startMs');
  });

  it('rejects another format, another version and a value that is no object', () => {
    expect(pathOf({ ...good, format: 'nexusdi-graph' })).toBe('format');
    expect(pathOf({ ...good, version: 2 })).toBe('version');
    expect(pathOf(42)).toBe('(root)');
  });

  it('rejects a time that is not a finite number', () => {
    expect(pathOf({ ...good, reportedMs: Number.NaN })).toBe('reportedMs');
  });
});
```

`startup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { Token, defineModule, provide } from '@nexusdi/core';

import { rejected } from '../../test-support/catch.js';
import { profile, profileStartup } from '../index.js';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
  [Symbol.dispose]() {}
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR, { useClass: FusionReactor })],
});

describe('profileStartup', () => {
  it('creates, loads in order, disposes and resolves with the report', async () => {
    class Probe {}
    const report = await profileStartup(Engineering, {
      load: [defineModule({ name: 'Science', providers: [Probe] })],
    });
    expect(report.runs.map((r) => [r.kind, r.ok])).toEqual([
      ['create', true],
      ['load', true],
    ]);
    expect(report.dispose).toMatchObject({ errors: 0 });
  });

  it('rejects with the create error and leaves the partial report in the profiler', async () => {
    class Breach {
      constructor() {
        throw new Error('hull breach');
      }
    }
    const profiler = profile();
    await rejected(
      profileStartup(defineModule({ name: 'Root', providers: [Breach] }), {
        profiler,
      }),
    );
    expect(profiler.report().runs).toMatchObject([{ ok: false }]);
  });

  it('resolves when disposal fails, and counts the error', async () => {
    class Leaky {
      [Symbol.dispose]() {
        throw new Error('seal');
      }
    }
    const report = await profileStartup(
      defineModule({ name: 'Root', providers: [Leaky] }),
    );
    expect(report.dispose).toMatchObject({ errors: 1 });
  });
});
```

- [ ] Step 2: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/devtools -- parse startup`
Expected: FAIL.

- [ ] Step 3: The code. Add `'NEXUS_DEVTOOLS_PROFILE_INVALID'` to `DevtoolsFields['code']` and `NexusErrorByCode`, and extend the `path` TSDoc: "NEXUS_DEVTOOLS_PROFILE_INVALID: the first bad field, such as `runs[0].builds[3].startMs`."

`parse.ts`:

```ts
import { DevtoolsError } from '../devtools-error.js';
import type { ProfileReport } from './report.js';

type Check = (value: unknown, path: string) => void;

function fail(path: string, what: string): never {
  throw new DevtoolsError(
    { code: 'NEXUS_DEVTOOLS_PROFILE_INVALID', path },
    {
      text: `not a ProfileReport: ${path} ${what}.\n  Fix: re-record the report with this version of @nexusdi/devtools.`,
    },
  );
}

const WRONG = 'is missing or has the wrong type';
const num: Check = (v, p) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(p, WRONG);
};
const str: Check = (v, p) => {
  if (typeof v !== 'string') fail(p, WRONG);
};
const bool: Check = (v, p) => {
  if (typeof v !== 'boolean') fail(p, WRONG);
};
const orNull =
  (check: Check): Check =>
  (v, p) => {
    if (v !== null) check(v, p);
  };
const literal =
  (expected: unknown, what: string): Check =>
  (v, p) => {
    if (v !== expected) fail(p, what);
  };
const oneOf =
  (values: readonly string[]): Check =>
  (v, p) => {
    if (typeof v !== 'string' || !values.includes(v)) fail(p, WRONG);
  };
const list =
  (each: Check): Check =>
  (v, p) => {
    if (!Array.isArray(v)) fail(p, WRONG);
    v.forEach((item, i) => each(item, `${p}[${i}]`));
  };
const shape =
  (fields: Readonly<Record<string, Check>>): Check =>
  (v, p) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(p, WRONG);
    for (const [key, check] of Object.entries(fields))
      check(
        (v as Record<string, unknown>)[key],
        p === '(root)' ? key : `${p}.${key}`,
      );
  };

const SPAN = { startMs: num, durationMs: num };
const BUILD = shape({
  providerId: str,
  token: str,
  module: str,
  // Any string, for the same reason as a run's kind.
  lifetime: orNull(str),
  scope: orNull(str),
  async: bool,
  level: orNull(num),
  parent: orNull(str),
  startMs: num,
  syncMs: orNull(num),
  awaitMs: orNull(num),
  finishMs: orNull(num),
  durationMs: num,
  failed: bool,
});
const INIT = shape({
  providerId: str,
  token: str,
  level: orNull(num),
  async: bool,
  startMs: num,
  syncMs: orNull(num),
  awaitMs: orNull(num),
  durationMs: num,
  failed: bool,
});
const RUN = shape({
  id: num,
  // Any string: a report from a newer core may carry a kind outside RunKind.
  kind: str,
  scope: orNull(str),
  ok: orNull(bool),
  startMs: num,
  durationMs: orNull(num),
  compile: orNull(
    shape({ ...SPAN, modules: num, providers: num, errors: num }),
  ),
  steps: list(
    shape({
      step: oneOf(['compile', 'static', 'build', 'init', 'setup']),
      ...SPAN,
    }),
  ),
  builds: list(BUILD),
  inits: list(INIT),
  pending: list(
    shape({
      providerId: str,
      token: str,
      module: str,
      level: orNull(num),
      what: oneOf(['construct', 'init']),
      startMs: num,
      syncMs: num,
    }),
  ),
});
const REPORT = shape({
  format: literal('nexusdi-profile', "is not 'nexusdi-profile'"),
  version: literal(1, 'is not 1, the version this @nexusdi/devtools reads'),
  timeOrigin: num,
  reportedMs: num,
  runs: list(RUN),
  graph: orNull(
    shape({
      root: str,
      providers: list(
        shape({
          id: str,
          token: str,
          module: str,
          lifetime: orNull(str),
          kind: str,
          inline: bool,
        }),
      ),
      edges: list(shape({ from: str, to: str, kind: str, ordersBuild: bool })),
    }),
  ),
  dropped: num,
  dispose: orNull(shape({ ...SPAN, errors: num })),
});

/** Throws NEXUS_DEVTOOLS_PROFILE_INVALID with the path of the first bad field. */
export function parseProfileReport(value: unknown): ProfileReport {
  REPORT(value, '(root)');
  return value as ProfileReport;
}
```

`startup.ts`:

```ts
import {
  Nexus,
  type ModuleRef,
  type NexusPlugin,
  type RootRef,
} from '@nexusdi/core';

import { profile, type Profiler } from './profile.js';
import type { ProfileReport } from './report.js';

/**
 * create with a profiler, each load in order, then disposal. Rejects with
 * the error of a failed create or load after disposing what was built; the
 * profiler passed in still holds the partial report. A failed disposal
 * counts in report().dispose.errors and does not reject.
 */
export async function profileStartup(
  root: RootRef,
  options: {
    readonly plugins?: readonly NexusPlugin[];
    readonly load?: readonly ModuleRef[];
    /** Pass one to read report() while the run is still going, as the CLI's --timeout does. */
    readonly profiler?: Profiler;
  } = {},
): Promise<ProfileReport> {
  const profiler = options.profiler ?? profile();
  const ship = await Nexus.create(root as never, {
    plugins: [profiler, ...(options.plugins ?? [])],
  });
  try {
    for (const module of options.load ?? []) await ship.load(module);
  } catch (error) {
    await ship[Symbol.asyncDispose]().catch(() => undefined);
    throw error;
  }
  await ship[Symbol.asyncDispose]().catch(() => undefined);
  return profiler.report();
}
```

Export both from `index.ts`.

- [ ] Step 4: The code page, as Task 8, Step 8, for `NEXUS_DEVTOOLS_PROFILE_INVALID`. The regions in `examples/meridian/src/errors/NEXUS_DEVTOOLS_PROFILE_INVALID.md` build their report with `await profileStartup(Engineering)`, keep each import on one line, and put each `// ->` claim on a declaration. Its reproduce region deletes `runs[0].builds[0].startMs` from `JSON.parse(JSON.stringify(report))` and prints `error.path` (`// -> 'runs[0].builds[0].startMs'`) and the message lines; its fix region parses an untouched report and prints `parseProfileReport(saved).runs.length` (`// -> 1`). The lead paragraph says nothing of `nexusdi profile` until Task 16, Step 7 adds that sentence.

- [ ] Step 5: Run the targets (as Task 8, Step 9), then commit with `feat(devtools): parse saved reports and profile a startup in one call`.

### Task 11: `spansOf()`, `toChromeTrace()` and live mode

Files:

- Create: `libs/devtools/src/profile/spans.ts`, `chrome.ts`, `live.ts`, `spans.test.ts`, `chrome.test.ts`, `live.test.ts`
- Modify: `libs/devtools/src/profile/profile.ts` (live option), `libs/devtools/src/index.ts`

Interfaces:

- Consumes: `criticalPathOf`, `ownMs` (Task 9), `runOf`, `runLabel`, `stepsOf` (Task 8).
- Produces in `spans.ts`:

```ts
export type SpanColor =
  | 'primary'
  | 'primary-light'
  | 'primary-dark'
  | 'secondary'
  | 'secondary-light'
  | 'secondary-dark'
  | 'tertiary'
  | 'tertiary-light'
  | 'tertiary-dark'
  | 'error';
export interface Span {
  readonly name: string;
  readonly track: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly color: SpanColor;
  readonly tooltip: string;
  readonly properties: readonly (readonly [string, string])[];
  readonly marker: boolean;
}
export function spansOf(
  run: ProfileRun,
  graph: ProfileReport['graph'],
  reportedMs: number,
): Span[];
```

- Produces: `toChromeTrace(report: ProfileReport, options?: { readonly cpuProfile?: { readonly profile: CpuProfile; readonly offsetMs: number }; readonly trackGroup?: string }): TraceFile`; in `@nexusdi/devtools/live`, `liveSink(options?: { readonly trackGroup?: string }): LiveSink | undefined`, with `type LiveSink = (run: ProfileRun, graph: ProfileReport['graph']) => void` exported from both entries.

- [ ] Step 1: Write the failing tests

`spans.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { defined } from '../../test-support/defined.js';
import { build, report } from '../../test-support/profile-fixture.js';
import { spansOf } from './spans.js';

const r = report(
  [
    build({
      providerId: 'r',
      token: 'ReactorCore',
      startMs: 1,
      durationMs: 1.2,
      syncMs: 0.9,
      finishMs: 0,
    }),
    build({
      providerId: 'n',
      token: 'NavCharts',
      startMs: 2.2,
      durationMs: 21.8,
      syncMs: 0.3,
      awaitMs: 21.4,
      finishMs: 0.1,
      level: 1,
    }),
  ],
  [['n', 'r']],
);

describe('spansOf', () => {
  it('draws one track per level with sync, await and finish children', () => {
    const spans = spansOf(defined(r.runs[0]), r.graph, r.reportedMs);
    const nav = spans.filter((s) => s.track === 'create · level 1');
    const tenth = (n: number) => Math.round(n * 10) / 10;
    expect(
      nav.map((s) => [s.name, tenth(s.startMs), tenth(s.endMs), s.color]),
    ).toEqual([
      ['NavCharts', 2.2, 24, 'primary-dark'],
      ['sync', 2.2, 2.5, 'primary-light'],
      ['await', 2.5, 23.9, 'secondary'],
      ['finish', 23.9, 24, 'tertiary-light'],
    ]);
    expect(defined(nav[0]).tooltip).toBe(
      'NavCharts 21.8 ms (0.3 sync, 21.4 await), critical path',
    );
  });

  it('draws the run, its steps and a ready marker', () => {
    const spans = spansOf(defined(r.runs[0]), r.graph, r.reportedMs);
    expect(
      spans.filter((s) => s.track === 'Runs' && !s.marker).map((s) => s.name),
    ).toEqual(['create']);
    expect(spans.filter((s) => s.marker).map((s) => s.name)).toEqual([
      'create ready',
    ]);
    expect(spans.some((s) => s.track === 'Steps' && s.name === 'build')).toBe(
      true,
    );
  });

  it('draws a pending build to the report time in the error colour', () => {
    const open = report([], [], {
      ok: null,
      durationMs: null,
      pending: [
        {
          providerId: 'n',
          token: 'NavCharts',
          module: 'Tactical',
          level: 0,
          what: 'construct',
          startMs: 5,
          syncMs: 0.2,
        },
      ],
    });
    const pending = spansOf(defined(open.runs[0]), open.graph, 60_005).find(
      (s) => s.name === 'NavCharts',
    );
    expect(pending).toMatchObject({
      startMs: 5,
      endMs: 60_005,
      color: 'error',
      tooltip: 'NavCharts still awaiting at timeout',
    });
  });
  it('draws a failed build and its run in the error colour', () => {
    const failed = report(
      [
        build({
          providerId: 'b',
          token: 'Breach',
          startMs: 0,
          durationMs: 1,
          failed: true,
          syncMs: null,
          finishMs: null,
        }),
      ],
      [],
      { ok: false },
    );
    const spans = spansOf(defined(failed.runs[0]), failed.graph, 2);
    expect(spans.find((s) => s.name === 'Breach')).toMatchObject({
      color: 'error',
      tooltip: 'Breach 1.0 ms, failed',
    });
    expect(spans.filter((s) => s.marker)).toMatchObject([
      { name: 'create failed', color: 'error' },
    ]);
  });

  it("draws onInit calls and a pending onInit on the run's onInit track", () => {
    const open = report([], [], {
      ok: null,
      durationMs: null,
      inits: [
        {
          providerId: 'r',
          token: 'Reactor',
          level: 0,
          async: false,
          startMs: 1,
          syncMs: 1,
          awaitMs: null,
          durationMs: 1,
          failed: false,
        },
      ],
      pending: [
        {
          providerId: 'c',
          token: 'Computer',
          module: 'Engineering',
          level: 0,
          what: 'init',
          startMs: 2,
          syncMs: 0,
        },
      ],
    });
    const spans = spansOf(defined(open.runs[0]), open.graph, 10);
    expect(
      spans
        .filter((s) => s.track === 'create · onInit')
        .map((s) => [s.name, s.color]),
    ).toEqual([
      ['Reactor', 'primary'],
      ['Computer', 'error'],
    ]);
  });
});
```

`chrome.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { defined } from '../../test-support/defined.js';
import { build, report } from '../../test-support/profile-fixture.js';
import { toChromeTrace } from './chrome.js';

const r = report([
  build({ providerId: 'q', token: 'Quote"\\·Core', startMs: 1, durationMs: 2 }),
]);

describe('toChromeTrace', () => {
  it('starts with the metadata and the TracingStartedInBrowser frame DevTools needs', () => {
    const { traceEvents } = toChromeTrace(r);
    const started = defined(
      traceEvents.find((e) => e['name'] === 'TracingStartedInBrowser'),
    );
    expect(started).toMatchObject({
      pid: 2,
      tid: 2,
      cat: 'disabled-by-default-devtools.timeline',
      ts: 0,
    });
    expect(
      (
        started['args'] as {
          data: { frames: { frame: string; url: string }[] };
        }
      ).data.frames[0],
    ).toMatchObject({
      frame: 'F1',
      url: 'nexusdi://profile/Meridian',
      isInPrimaryMainFrame: true,
      isOutermostMainFrame: true,
      processId: 1,
    });
  });

  it('writes each span as a b/e pair with a JSON detail that stays valid with quotes and backslashes', () => {
    const { traceEvents } = toChromeTrace(r, { trackGroup: 'Ship' });
    const begin = defined(
      traceEvents.find((e) => e['ph'] === 'b' && e['name'] === 'Quote"\\·Core'),
    );
    const detail = JSON.parse((begin['args'] as { detail: string }).detail) as {
      devtools: { track: string; trackGroup: string };
    };
    expect(detail.devtools).toMatchObject({
      track: 'create · level 0',
      trackGroup: 'Ship',
    });
    expect(begin['ts']).toBe(1000);
    const end = defined(
      traceEvents.find(
        (e) =>
          e['ph'] === 'e' &&
          (e['id2'] as { local: string }).local ===
            (begin['id2'] as { local: string }).local,
      ),
    );
    expect(end['ts']).toBe(3000);
  });

  it('writes the ready marker with no track or track group', () => {
    const { traceEvents } = toChromeTrace(r);
    const marker = defined(
      traceEvents.find((e) => e['ph'] === 'b' && e['name'] === 'create ready'),
    );
    const { devtools } = JSON.parse(
      (marker['args'] as { detail: string }).detail,
    ) as { devtools: Record<string, unknown> };
    expect(devtools['dataType']).toBe('marker');
    expect(devtools).not.toHaveProperty('track');
    expect(devtools).not.toHaveProperty('trackGroup');
  });

  it('merges a CPU profile and shifts every span by offsetMs', () => {
    const profile = {
      nodes: [
        {
          id: 1,
          callFrame: {
            functionName: '(root)',
            scriptId: '0',
            url: '',
            lineNumber: -1,
            columnNumber: -1,
          },
          children: [2],
        },
        {
          id: 2,
          callFrame: {
            functionName: 'build',
            scriptId: '1',
            url: 'file:///a.js',
            lineNumber: 1,
            columnNumber: 1,
          },
        },
      ],
      startTime: 500_000,
      endTime: 520_000,
      samples: [2, 2],
      timeDeltas: [0, 100],
    };
    const { traceEvents } = toChromeTrace(r, {
      cpuProfile: { profile, offsetMs: 500 },
    });
    const chunk = defined(
      traceEvents.find((e) => e['name'] === 'ProfileChunk'),
    );
    const nodes = (
      chunk['args'] as {
        data: { cpuProfile: { nodes: { id: number; parent?: number }[] } };
      }
    ).data.cpuProfile.nodes;
    expect(nodes.find((n) => n.id === 2)?.parent).toBe(1);
    expect(
      defined(
        traceEvents.find(
          (e) => e['ph'] === 'b' && e['name'] === 'Quote"\\·Core',
        ),
      )['ts'],
    ).toBe(501_000);
  });

  it('writes no NaN for an empty report', () => {
    expect(JSON.stringify(toChromeTrace(report([])))).not.toMatch(
      /NaN|"ts":null|"dur":null/,
    );
  });
  it('names no root in the frame URL when the report has no graph', () => {
    const { traceEvents } = toChromeTrace({ ...r, graph: null });
    const started = defined(
      traceEvents.find((e) => e['name'] === 'TracingStartedInBrowser'),
    );
    expect(
      (started['args'] as { data: { frames: { url: string }[] } }).data
        .frames[0]?.url,
    ).toBe('nexusdi://profile');
  });
  it('writes a report of 160,000 spans', () => {
    // scopes: true with maxRuns 1000 can pass the 65,536 arguments a spread
    // call may take in JavaScriptCore; V8 stops near 125,000.
    const builds = Array.from({ length: 40_000 }, (_, i) =>
      build({
        providerId: `p${i}`,
        token: `P${i}`,
        startMs: i,
        durationMs: 1,
        finishMs: 0,
      }),
    );
    const { traceEvents } = toChromeTrace(report(builds));
    expect(traceEvents.length).toBeGreaterThan(160_000);
  });
});
```

`live.test.ts`:

```ts
import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { defined } from '../../test-support/defined.js';
import { liveSink } from '../live.js';

describe('liveSink', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws nothing outside Chromium 134 and later', () => {
    vi.stubGlobal('navigator', {
      userAgentData: { brands: [{ brand: 'Chromium', version: '133' }] },
    });
    expect(liveSink()).toBeUndefined();
    vi.stubGlobal('navigator', undefined);
    expect(liveSink()).toBeUndefined();
  });

  it('calls console.timeStamp per span and swallows its errors', () => {
    vi.stubGlobal('navigator', {
      userAgentData: { brands: [{ brand: 'Chromium', version: '134' }] },
    });
    // Node's timeStamp records nothing, so the test stubs one.
    const stamp = vi.fn(() => {
      throw new Error('no recorder');
    });
    vi.stubGlobal('console', { ...console, timeStamp: stamp });
    const sink = defined(liveSink());
    expect(() =>
      sink(
        {
          id: 0,
          kind: 'create',
          scope: null,
          ok: true,
          startMs: 0,
          durationMs: 1,
          compile: null,
          steps: [],
          builds: [],
          inits: [],
          pending: [],
        },
        null,
      ),
    ).not.toThrow();
    expect(stamp).toHaveBeenCalledWith(
      'create',
      0,
      1,
      'Runs',
      'NexusDI',
      'secondary-dark',
    );
  });
  it('draws in the track group it is given', () => {
    vi.stubGlobal('navigator', {
      userAgentData: { brands: [{ brand: 'Chromium', version: '154' }] },
    });
    // Node's timeStamp records nothing, so the test stubs one.
    const stamp = vi.fn();
    vi.stubGlobal('console', { ...console, timeStamp: stamp });
    defined(liveSink({ trackGroup: 'Ship' }))(
      {
        id: 0,
        kind: 'create',
        scope: null,
        ok: true,
        startMs: 0,
        durationMs: 1,
        compile: null,
        steps: [],
        builds: [],
        inits: [],
        pending: [],
      },
      null,
    );
    expect(stamp).toHaveBeenCalledWith(
      'create',
      0,
      1,
      'Runs',
      'Ship',
      'secondary-dark',
    );
  });
  it('is the module the @nexusdi/devtools/live subpath exports', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { exports: Record<string, Record<string, string>> };
    expect(manifest.exports['./live']).toEqual({
      '@nexusdi/source': './src/live.ts',
      types: './dist/live.d.ts',
      import: './dist/live.js',
      default: './dist/live.js',
    });
  });
});
```

- [ ] Step 2: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/devtools -- spans chrome live`
Expected: FAIL.

- [ ] Step 3: `spans.ts`

```ts
import { criticalPathOf, ownMs } from './critical-path.js';
import type { ProfileBuild, ProfileReport, ProfileRun } from './report.js';
import { runLabel, stepsOf } from './steps.js';

/** A colour name DevTools draws a custom-track span in. */
export type SpanColor =
  | 'primary'
  | 'primary-light'
  | 'primary-dark'
  | 'secondary'
  | 'secondary-light'
  | 'secondary-dark'
  | 'tertiary'
  | 'tertiary-light'
  | 'tertiary-dark'
  | 'error';
/** One span of a run, as live mode and the Chrome file draw it. */
export interface Span {
  readonly name: string;
  readonly track: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly color: SpanColor;
  readonly tooltip: string;
  readonly properties: readonly (readonly [string, string])[];
  readonly marker: boolean;
}

const ms = (n: number): string => n.toFixed(1);

function span(
  name: string,
  track: string,
  startMs: number,
  endMs: number,
  color: SpanColor,
  tooltip = name,
  properties: Span['properties'] = [],
): Span {
  return {
    name,
    track,
    startMs,
    endMs,
    color,
    tooltip,
    properties,
    marker: false,
  };
}

/** The spans of one run, in the layout of spec 7.3. live.ts and chrome.ts both draw these. */
export function spansOf(
  run: ProfileRun,
  graph: ProfileReport['graph'],
  reportedMs: number,
): Span[] {
  const label = runLabel(run);
  const end =
    run.durationMs === null ? reportedMs : run.startMs + run.durationMs;
  const critical = new Set(
    graph === null
      ? []
      : criticalPathOf(run, graph).path.map((p) => p.providerId),
  );
  const spans: Span[] = [
    span(label, 'Runs', run.startMs, end, 'secondary-dark'),
  ];
  for (const s of run.steps.length > 0 ? run.steps : stepsOf(run))
    spans.push(
      span(s.step, 'Steps', s.startMs, s.startMs + s.durationMs, 'tertiary'),
    );

  const provider = (b: ProfileBuild & { level: number }): void => {
    const track = `${label} · level ${b.level}`;
    const stop = b.startMs + b.durationMs;
    const onPath = critical.has(b.providerId);
    const queued = b.failed ? null : Math.max(0, b.durationMs - ownMs(b));
    const tooltip =
      `${b.token} ${ms(b.durationMs)} ms` +
      (b.syncMs === null
        ? ''
        : ` (${ms(b.syncMs)} sync${b.awaitMs === null ? '' : `, ${ms(b.awaitMs)} await`})`) +
      (b.failed ? ', failed' : onPath ? ', critical path' : '');
    spans.push(
      span(
        b.token,
        track,
        b.startMs,
        stop,
        b.failed ? 'error' : onPath ? 'primary-dark' : 'primary',
        tooltip,
        [
          ['module', b.module],
          ['lifetime', b.lifetime ?? '-'],
          ['level', String(b.level)],
          ['sync ms', b.syncMs === null ? '-' : ms(b.syncMs)],
          ['await ms', b.awaitMs === null ? '-' : ms(b.awaitMs)],
          ['finish ms', b.finishMs === null ? '-' : ms(b.finishMs)],
          ['queued ms', queued === null ? '-' : ms(queued)],
          ['run', label],
          ['critical path', onPath ? 'yes' : 'no'],
        ],
      ),
    );
    if (b.syncMs === null) return;
    spans.push(
      span('sync', track, b.startMs, b.startMs + b.syncMs, 'primary-light'),
    );
    if (b.awaitMs !== null)
      spans.push(
        span(
          'await',
          track,
          b.startMs + b.syncMs,
          b.startMs + b.syncMs + b.awaitMs,
          'secondary',
        ),
      );
    if (b.finishMs !== null)
      spans.push(
        span('finish', track, stop - b.finishMs, stop, 'tertiary-light'),
      );
  };
  for (const b of run.builds)
    if (b.level !== null) provider(b as ProfileBuild & { level: number });

  for (const i of run.inits)
    spans.push(
      span(
        i.token,
        `${label} · onInit`,
        i.startMs,
        i.startMs + i.durationMs,
        i.failed ? 'error' : 'primary',
        `${i.token} onInit ${ms(i.durationMs)} ms${i.failed ? ', failed' : ''}`,
      ),
    );

  for (const p of run.pending)
    spans.push(
      span(
        p.token,
        p.what === 'init'
          ? `${label} · onInit`
          : `${label} · level ${p.level ?? 0}`,
        p.startMs,
        reportedMs,
        'error',
        `${p.token} still awaiting at timeout`,
      ),
    );

  if (run.ok !== null)
    spans.push({
      ...span(
        `${label} ${run.ok ? 'ready' : 'failed'}`,
        'Runs',
        end,
        end,
        run.ok ? 'tertiary-dark' : 'error',
      ),
      marker: true,
    });
  return spans;
}
```

- [ ] Step 4: `chrome.ts`

```ts
import { least } from './extent.js';
import type { CpuProfile, ProfileReport, TraceFile } from './report.js';
import { spansOf } from './spans.js';

type Event = Readonly<Record<string, unknown>>;

/** The node tree as a ProfileChunk carries it: each node names its parent. */
function withParents(profile: CpuProfile): Event[] {
  const parents = new Map<number, number>();
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parents.set(child, node.id);
  return profile.nodes.map((n) => ({
    id: n.id,
    callFrame: n.callFrame,
    ...(parents.has(n.id) ? { parent: parents.get(n.id) } : {}),
  }));
}

/**
 * The report as a Chrome DevTools Performance trace (spec 7.3): one
 * NexusDI track group of user-timing spans, and with `cpuProfile` the JS
 * flame chart under Main. The layout is Chrome's undocumented format; the
 * golden test in vitest.trace.config.ts holds it.
 */
export function toChromeTrace(
  report: ProfileReport,
  options: {
    readonly cpuProfile?: {
      readonly profile: CpuProfile;
      readonly offsetMs: number;
    };
    readonly trackGroup?: string;
  } = {},
): TraceFile {
  const trackGroup = options.trackGroup ?? 'NexusDI';
  const offset = options.cpuProfile?.offsetMs ?? 0;
  const us = (msValue: number): number => Math.round((msValue + offset) * 1000);
  const spans = report.runs.flatMap((run) =>
    spansOf(run, report.graph, report.reportedMs),
  );
  const cpu = options.cpuProfile?.profile;
  const first = least(
    spans.map((s) => us(s.startMs)),
    cpu === undefined ? Infinity : cpu.startTime,
  );
  const origin = Number.isFinite(first) ? first : 0;

  const events: Event[] = [
    {
      name: 'process_name',
      ph: 'M',
      pid: 1,
      tid: 1,
      ts: 0,
      args: { name: 'Renderer' },
    },
    {
      name: 'thread_name',
      ph: 'M',
      pid: 1,
      tid: 1,
      ts: 0,
      args: { name: 'CrRendererMain' },
    },
    {
      name: 'process_name',
      ph: 'M',
      pid: 2,
      tid: 2,
      ts: 0,
      args: { name: 'Browser' },
    },
    {
      name: 'thread_name',
      ph: 'M',
      pid: 2,
      tid: 2,
      ts: 0,
      args: { name: 'CrBrowserMain' },
    },
    {
      name: 'TracingStartedInBrowser',
      ph: 'I',
      s: 't',
      cat: 'disabled-by-default-devtools.timeline',
      pid: 2,
      tid: 2,
      ts: Math.max(0, origin - 1000),
      args: {
        data: {
          frameTreeNodeId: 1,
          persistentIds: true,
          frames: [
            {
              frame: 'F1',
              name: '',
              processId: 1,
              isInPrimaryMainFrame: true,
              isOutermostMainFrame: true,
              url:
                report.graph === null
                  ? 'nexusdi://profile'
                  : `nexusdi://profile/${report.graph.root}`,
            },
          ],
        },
      },
    },
  ];

  spans.forEach((s, i) => {
    const id2 = { local: `0x${(i + 1).toString(16)}` };
    const detail = JSON.stringify({
      devtools: {
        dataType: s.marker ? 'marker' : 'track-entry',
        ...(s.marker ? {} : { track: s.track, trackGroup }),
        color: s.color,
        properties: s.properties,
        tooltipText: s.tooltip,
      },
    });
    events.push(
      {
        name: s.name,
        cat: 'blink.user_timing',
        ph: 'b',
        id2,
        pid: 1,
        tid: 1,
        ts: us(s.startMs),
        args: { detail },
      },
      {
        name: s.name,
        cat: 'blink.user_timing',
        ph: 'e',
        id2,
        pid: 1,
        tid: 1,
        ts: us(s.endMs),
        args: {},
      },
    );
  });

  if (cpu !== undefined) {
    const cat = 'disabled-by-default-v8.cpu_profiler';
    events.push(
      {
        name: 'Profile',
        ph: 'P',
        id: '0x1',
        cat,
        pid: 1,
        tid: 1,
        ts: cpu.startTime,
        args: { data: { startTime: cpu.startTime } },
      },
      {
        name: 'ProfileChunk',
        ph: 'P',
        id: '0x1',
        cat,
        pid: 1,
        tid: 1,
        ts: cpu.startTime,
        args: {
          data: {
            cpuProfile: { nodes: withParents(cpu), samples: cpu.samples },
            timeDeltas: cpu.timeDeltas,
          },
        },
      },
    );
  }
  return { traceEvents: events, metadata: { 'nexusdi-profile': 1 } };
}
```

`TracingStartedInBrowser` sits 1 ms before the first span, clamped at 0; the fixture's run starts at 0, so the first test expects `ts: 0`. Task 13's golden file pins the rest of the layout.

- [ ] Step 5: `live.ts` and the option

```ts
import type { LiveSink } from './report.js';
import { spansOf } from './spans.js';

interface Brands {
  readonly userAgentData?: {
    readonly brands?: readonly {
      readonly brand: string;
      readonly version: string;
    }[];
  };
}

type TimeStamp = (
  label: string,
  start: number,
  end: number,
  track: string,
  group: string,
  color: string,
) => void;

/**
 * A sink for profile({ live }) that draws each run's spans with
 * console.timeStamp in the DevTools track group `trackGroup` (default
 * 'NexusDI'), spec 6.5. undefined outside Chromium 134 and later, where
 * console.timeStamp draws nothing. A draw never throws; a profiler never
 * fails the app it measures.
 */
export function liveSink(
  options: { readonly trackGroup?: string } = {},
): LiveSink | undefined {
  const trackGroup = options.trackGroup ?? 'NexusDI';
  const brands =
    (globalThis.navigator as Brands | undefined)?.userAgentData?.brands ?? [];
  if (!brands.some((b) => b.brand === 'Chromium' && Number(b.version) >= 134))
    return undefined;
  const stamp = console.timeStamp as unknown as TimeStamp;
  return (run, graph) => {
    for (const s of spansOf(run, graph, performance.now())) {
      try {
        stamp(s.name, s.startMs, s.endMs, s.track, trackGroup, s.color);
      } catch {
        // Nothing is recording, or the browser changed the signature.
      }
    }
  };
}
```

Live mode is a subpath of its own (tech lead ruling, 2026-10-15). `libs/devtools/src/live.ts` is the `@nexusdi/devtools/live` entry: it re-exports `liveSink` and the `LiveSink` type, and `package.json` gains `exports["./live"]` with the `@nexusdi/source`, `types`, `import` and `default` conditions. `LiveSink` is declared in `report.ts` and exported as a type from both entries. `ProfileOptions` takes `readonly live?: LiveSink` ("Draws each run as it closes; pass liveSink() from @nexusdi/devtools/live. Default: no drawing.") and has no `trackGroup`; `liveSink({ trackGroup })` takes it. `profile.ts` imports nothing from `live.ts`: it reads `options.live`, and at the end of the `run` case calls it with `runOf(rec)` and the graph, inside `try {} catch {}`. The profile test passes `profile({ live: liveSink() })`, and the tests import the entry as `../live.js`, since the project lint forbids a package importing itself by name; `live.test.ts` also asserts the `exports["./live"]` entry. `src/profile/bundle.test.ts` bundles plain `profile()` with esbuild and asserts it holds no `timeStamp` and none of `spansOf`'s strings, and that `profile()` with `/live` holds both. Node's `console` has no `timeStamp`, so the live tests stub the global `console` with one (`vi.stubGlobal('console', { ...console, timeStamp: stamp })`) where `vi.spyOn` would throw.

`least()` and `most()` in `src/profile/extent.ts` replace every `Math.min(...)`/`Math.max(...)` spread in the profile modules: a spread call throws a RangeError past 65,536 arguments in JavaScriptCore (near 125,000 in V8), and 1,000 runs with scopes can hold more spans. `graphOf` keeps one graph per view object in a `WeakMap`, so live mode builds it again only after the blueprint changes. Export `toChromeTrace` from `index.ts`.

- [ ] Step 6: Run the targets

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/devtools`
Expected: PASS.

- [ ] Step 7: Commit with `feat(devtools): write a Chrome DevTools trace and draw spans live`.

### Task 12: `toPerfettoTrace()`

Files:

- Create: `libs/devtools/src/profile/perfetto.ts`, `perfetto.test.ts`
- Modify: `libs/devtools/src/index.ts`

Interfaces:

- Produces: `toPerfettoTrace(report: ProfileReport): TraceFile`.

- [ ] Step 1: Write the failing test

```ts
import { describe, expect, it } from 'vitest';

import { defined } from '../../test-support/defined.js';
import { build, report } from '../../test-support/profile-fixture.js';
import { toPerfettoTrace } from './perfetto.js';

const r = report(
  [
    build({
      providerId: 'r',
      token: 'ReactorCore',
      startMs: 1,
      durationMs: 1,
      syncMs: 1,
      finishMs: 0,
    }),
    build({
      providerId: 'c',
      token: 'ShipComputer',
      startMs: 2,
      durationMs: 3,
      syncMs: 2,
      finishMs: 1,
      level: 1,
    }),
  ],
  [['c', 'r']],
);

type Ev = Record<string, unknown>;

describe('toPerfettoTrace', () => {
  const { traceEvents, metadata, displayTimeUnit } = toPerfettoTrace(r);
  const evs = traceEvents as Ev[];

  it('gives each run a pid, the steps tid 1 and each provider a named, sorted tid', () => {
    expect(evs.find((e) => e['name'] === 'process_name')).toMatchObject({
      pid: 1,
      args: { name: 'nexusdi create (run 0)' },
    });
    const threads = evs
      .filter((e) => e['name'] === 'thread_name')
      .map((e) => (e['args'] as { name: string }).name);
    expect(threads).toEqual(['steps', 'ReactorCore', 'ShipComputer']);
    const sorts = evs
      .filter((e) => e['name'] === 'thread_sort_index')
      .map((e) => (e['args'] as { sort_index: number }).sort_index);
    expect(sorts).toEqual([0, 1, 10001]);
  });

  it('nests the sync and finish slices inside the provider slice on its tid', () => {
    const tid = defined(
      evs.find((e) => e['name'] === 'ShipComputer' && e['ph'] === 'X'),
    )['tid'];
    const slices = evs.filter((e) => e['ph'] === 'X' && e['tid'] === tid);
    const [first, ...children] = slices;
    const parent = defined(first);
    for (const child of children) {
      expect(child['ts'] as number).toBeGreaterThanOrEqual(
        parent['ts'] as number,
      );
      expect(
        (child['ts'] as number) + (child['dur'] as number),
      ).toBeLessThanOrEqual(
        (parent['ts'] as number) + (parent['dur'] as number),
      );
    }
  });

  it('pairs every flow start with one finish, and names the barrier-path edge critical', () => {
    const starts = evs.filter((e) => e['ph'] === 's');
    const finishes = evs.filter((e) => e['ph'] === 'f');
    expect(starts.map((e) => e['id']).sort()).toEqual(
      finishes.map((e) => e['id']).sort(),
    );
    expect(starts.map((e) => e['name'])).toEqual(['critical']);
    expect(finishes[0]).toMatchObject({ bp: 'e' });
  });

  it('carries the profile metadata in ms', () => {
    expect(metadata).toMatchObject({ 'nexusdi-profile': 1 });
    expect(displayTimeUnit).toBe('ms');
  });
});

describe('toPerfettoTrace edges and slices', () => {
  it('draws no flow for an edge that orders no build, and names an edge off the path dep', () => {
    const fleet = report(
      [
        build({ providerId: 'a', token: 'A', startMs: 0, durationMs: 1 }),
        build({ providerId: 'b', token: 'B', startMs: 0, durationMs: 2 }),
        build({
          providerId: 'c',
          token: 'C',
          startMs: 2,
          durationMs: 1,
          level: 1,
        }),
      ],
      [
        ['c', 'a'],
        ['c', 'b'],
      ],
    );
    const graph = defined(fleet.graph ?? undefined);
    const lazy = {
      ...fleet,
      graph: {
        ...graph,
        edges: graph.edges.map((e) =>
          e.to === 'a' ? { ...e, kind: 'lazy', ordersBuild: false } : e,
        ),
      },
    };
    const names = (traceEvents: readonly Ev[]) =>
      traceEvents.filter((e) => e['ph'] === 's').map((e) => e['name']);
    expect(names(toPerfettoTrace(fleet).traceEvents as Ev[])).toEqual([
      'dep',
      'critical',
    ]);
    expect(names(toPerfettoTrace(lazy).traceEvents as Ev[])).toEqual([
      'critical',
    ]);
  });

  it("puts an onInit on its provider's tid", () => {
    const withInit = report(
      [build({ providerId: 'r', token: 'Reactor', startMs: 0, durationMs: 1 })],
      [],
      {
        inits: [
          {
            providerId: 'r',
            token: 'Reactor',
            level: 0,
            async: false,
            startMs: 2,
            syncMs: 1,
            awaitMs: null,
            durationMs: 1,
            failed: false,
          },
        ],
      },
    );
    const evs = toPerfettoTrace(withInit).traceEvents as Ev[];
    const tid = defined(evs.find((e) => e['name'] === 'Reactor'))['tid'];
    expect(evs.find((e) => e['name'] === 'onInit')).toMatchObject({
      tid,
      ts: 2000,
      dur: 1000,
    });
  });

  it('keeps a child slice inside its parent when the ends round apart', () => {
    // A 1 µs build whose finish is its last 0.5 µs. Rounding the finish's
    // start (0.5 µs) and length (0.5 µs) apart would end it at 2 µs, past
    // its parent's end at 1 µs.
    const tight = report([
      build({
        providerId: 't',
        token: 'Tight',
        startMs: 0,
        durationMs: 0.001,
        syncMs: 0.0005,
        finishMs: 0.0005,
      }),
    ]);
    const evs = (toPerfettoTrace(tight).traceEvents as Ev[]).filter(
      (e) => e['ph'] === 'X' && e['tid'] === 2,
    );
    const [first, ...children] = evs;
    const parent = defined(first);
    const end = (e: Ev) => (e['ts'] as number) + (e['dur'] as number);
    for (const child of children)
      expect(end(child)).toBeLessThanOrEqual(end(parent));
  });
});
```

- [ ] Step 2: Run it and see it fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/devtools -- perfetto`
Expected: FAIL.

- [ ] Step 3: Implement `perfetto.ts`

```ts
import { criticalPathOf } from './critical-path.js';
import type { ProfileReport, TraceFile } from './report.js';
import { stepsOf } from './steps.js';

type Event = Readonly<Record<string, unknown>>;

const us = (msValue: number): number => Math.round(msValue * 1000);

/**
 * The report as plain Trace Event Format for ui.perfetto.dev (spec 7.4):
 * one pid per run, tid 1 for the steps, one tid per built provider sorted
 * by level, and a flow arrow per edge with ordersBuild between two
 * providers the run built. Perfetto requires slices on a tid to nest, so
 * concurrent providers each get a tid.
 */
export function toPerfettoTrace(report: ProfileReport): TraceFile {
  const events: Event[] = [];
  let flow = 0;
  report.runs.forEach((run, index) => {
    const pid = index + 1;
    const meta = (name: string, tid: number, args: Event): void => {
      events.push({ name, ph: 'M', pid, tid, ts: 0, args });
    };
    // Both ends round on their own, so a child slice that ends inside its
    // parent in ms also ends inside it in µs, and the slices still nest.
    const slice = (
      name: string,
      tid: number,
      startMs: number,
      endMs: number,
      args?: Event,
    ): void => {
      events.push({
        name,
        ph: 'X',
        pid,
        tid,
        ts: us(startMs),
        dur: us(endMs) - us(startMs),
        ...(args === undefined ? {} : { args }),
      });
    };
    meta('process_name', 0, { name: `nexusdi ${run.kind} (run ${run.id})` });
    meta('thread_name', 1, { name: 'steps' });
    meta('thread_sort_index', 1, { sort_index: 0 });
    for (const s of run.steps.length > 0 ? run.steps : stepsOf(run))
      slice(s.step, 1, s.startMs, s.startMs + s.durationMs);

    const tids = new Map<string, number>();
    const order = new Map<number, number>();
    const builds = [...run.builds].sort(
      (a, b) => (a.level ?? -1) - (b.level ?? -1) || a.startMs - b.startMs,
    );
    for (const b of builds) {
      const tid = tids.size + 2;
      tids.set(b.providerId, tid);
      const level = b.level ?? 0;
      const n = (order.get(level) ?? 0) + 1;
      order.set(level, n);
      meta('thread_name', tid, { name: b.token });
      meta('thread_sort_index', tid, { sort_index: level * 10000 + n });
      const end = b.startMs + b.durationMs;
      slice(b.token, tid, b.startMs, end, {
        module: b.module,
        lifetime: b.lifetime,
        level: b.level,
        run: run.id,
        syncMs: b.syncMs,
        awaitMs: b.awaitMs,
        finishMs: b.finishMs,
        async: b.async,
        failed: b.failed,
      });
      if (b.syncMs !== null) {
        slice('sync', tid, b.startMs, b.startMs + b.syncMs);
        if (b.awaitMs !== null)
          slice(
            'await',
            tid,
            b.startMs + b.syncMs,
            b.startMs + b.syncMs + b.awaitMs,
          );
      }
      if (b.finishMs !== null) slice('finish', tid, end - b.finishMs, end);
    }
    for (const i of run.inits) {
      const tid = tids.get(i.providerId);
      if (tid !== undefined)
        slice('onInit', tid, i.startMs, i.startMs + i.durationMs);
    }

    if (report.graph === null) return;
    const path = criticalPathOf(run, report.graph).path;
    // A barrier-path member and the member before it, as an edge key.
    const critical = new Set(
      path.slice(1).map((p, i) => `${p.providerId} ${path[i]?.providerId}`),
    );
    const byId = new Map(run.builds.map((b) => [b.providerId, b]));
    for (const e of report.graph.edges) {
      const from = byId.get(e.from);
      const to = byId.get(e.to);
      if (!e.ordersBuild || from === undefined || to === undefined) continue;
      const id = ++flow;
      const name = critical.has(`${e.from} ${e.to}`) ? 'critical' : 'dep';
      events.push(
        {
          name,
          cat: 'dep',
          ph: 's',
          id,
          pid,
          tid: tids.get(to.providerId),
          ts: us(to.startMs + to.durationMs) - 1,
        },
        {
          name,
          cat: 'dep',
          ph: 'f',
          bp: 'e',
          id,
          pid,
          tid: tids.get(from.providerId),
          ts: us(from.startMs) + 1,
        },
      );
    }
  });
  return {
    traceEvents: events,
    metadata: { 'nexusdi-profile': 1 },
    displayTimeUnit: 'ms',
  };
}
```

`metadata` also carries `"nexusdi-core": "<version>"` in spec 7.4. The report does not hold core's version, so the CLI adds it to the file before writing (Task 16); `toPerfettoTrace` writes only `nexusdi-profile`.

Each slice's `dur` is `us(end) - us(start)`, so a child that ends inside its parent in ms also does in µs, and Perfetto's nesting rule holds after rounding. Export `toPerfettoTrace` from `index.ts`.

- [ ] Step 4: Run the targets (as Task 11, Step 6), then commit with `feat(devtools): write a Perfetto trace with dependency flows`.

### Task 13: the golden test of the Chrome layout (`test-trace`)

Files:

- Create: `libs/devtools/vitest.trace.config.ts`, `libs/devtools/src/profile/trace-engine.trace.test.ts`
- Create: `libs/devtools/test-fixtures/profile/meridian.report.json`, `failed.report.json`, `partial.report.json`, `node.cpuprofile`, `chrome-trace.golden.json`
- Modify: `libs/devtools/project.json`, root `package.json` and `package-lock.json`

Interfaces:

- Consumes: `toChromeTrace`, `toPerfettoTrace`, `parseProfileReport`.

- [ ] Step 1: Pin the engine

Run: `npm view @paulirish/trace_engine version` and `npm i -D -E @paulirish/trace_engine@<that version>` at the repository root. The spec verified 0.0.65; take the newest published version at or above it, and record it in the ledger.

- [ ] Step 2: The fixtures. Write `meridian.report.json` by hand: the spec 6.7 Meridian with 14 providers over four levels, an async `NavCharts` (sync 0.3, await 21.4, finish 0.1), one `load` run of `Science`, a `dispose`, `graph.root: "Meridian"`, `reportedMs` after the last run. Pass it through `parseProfileReport` in the test, so a hand slip fails there first. `failed.report.json` is the same create with `ShieldGrid` failed in level 2 and `ok: false`. `partial.report.json` has `ok: null`, `durationMs: null`, one pending `NavCharts` construct and `graph: null`, since a hung create never reaches `setup` (tech lead ruling 2). Every graph provider carries `inline` and every edge `ordersBuild`, as `parseProfileReport` requires. The test of the partial fixture also checks that the frame URL is `nexusdi://profile` and that no span has the colour `primary-dark` (no critical path). `node.cpuprofile` is a 20-sample profile: copy `nodes` for the call path `(root) > (program) > build > construct` from any `node --cpu-prof` run, with `startTime` 1,000,000, `timeDeltas` of 100 each, and `samples` that alternate the two leaves.

- [ ] Step 3: The config and target

`libs/devtools/vitest.trace.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/devtools-trace',
  test: {
    name: '@nexusdi/devtools:trace',
    watch: false,
    environment: 'node',
    include: ['src/**/*.trace.test.ts'],
    reporters: ['default'],
  },
});
```

`project.json`:

```json
"test-trace": {
  "executor": "nx:run-commands",
  "cache": true,
  "inputs": ["default", "^production"],
  "options": { "cwd": "libs/devtools", "command": "vitest run --config vitest.trace.config.ts" }
},
"test": { "dependsOn": ["^build", "build", "test-trace"] }
```

- [ ] Step 4: Write the test `src/profile/trace-engine.trace.test.ts`

```ts
import { readFileSync, writeFileSync } from 'node:fs';

import * as Trace from '@paulirish/trace_engine';
import { describe, expect, it } from 'vitest';

import {
  parseProfileReport,
  toChromeTrace,
  toPerfettoTrace,
  type CpuProfile,
  type TraceFile,
} from '../index.js';
import { spansOf } from './spans.js';

const at = (name: string): URL =>
  new URL(`../../test-fixtures/profile/${name}`, import.meta.url);

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(at(name), 'utf8'));

/** The trace as the DevTools trace engine, the one DevTools ships, reads it. */
async function model(file: TraceFile) {
  const engine = Trace.TraceModel.Model.createWithAllHandlers();
  await engine.parse(file.traceEvents as never);
  const parsed = engine.parsedTrace();
  if (parsed === null) throw new Error('the engine parsed nothing');
  return parsed.data;
}

type Event = Readonly<Record<string, unknown>>;

/** The track entries the file writes: each non-marker b/e pair, by track. */
function spansByTrack(
  file: TraceFile,
): Map<string, [string, number, number][]> {
  const ends = new Map<string, number>();
  for (const e of file.traceEvents)
    if (e['ph'] === 'e')
      ends.set((e['id2'] as { local: string }).local, e['ts'] as number);
  const byTrack = new Map<string, [string, number, number][]>();
  for (const e of file.traceEvents as readonly Event[]) {
    if (e['ph'] !== 'b') continue;
    const { devtools } = JSON.parse(
      (e['args'] as { detail: string }).detail,
    ) as {
      devtools: { dataType: string; track?: string };
    };
    if (devtools.dataType === 'marker' || devtools.track === undefined)
      continue;
    const start = e['ts'] as number;
    const end = ends.get((e['id2'] as { local: string }).local) ?? start;
    const list = byTrack.get(devtools.track) ?? [];
    list.push([e['name'] as string, start, end - start]);
    byTrack.set(devtools.track, list);
  }
  return byTrack;
}

const meridian = parseProfileReport(fixture('meridian.report.json'));
const partial = parseProfileReport(fixture('partial.report.json'));
const failed = parseProfileReport(fixture('failed.report.json'));

/** The golden track list: Runs, Steps, then each run's level tracks and onInit. */
const TRACKS = [
  'Runs',
  'Steps',
  'create · level 0',
  'create · level 1',
  'create · level 2',
  'create · level 3',
  'create · onInit',
  'load 1 · level 0',
];

describe('the Chrome layout, as the DevTools trace engine reads it', () => {
  it('finds the main frame (the tripwire for TracingStartedInBrowser)', async () => {
    expect((await model(toChromeTrace(meridian))).Meta.mainFrameId).toBe('F1');
  });

  it('draws one NexusDI group with the golden tracks and entry counts', async () => {
    const file = toChromeTrace(meridian);
    const groups = (await model(file)).ExtensionTraceData.extensionTrackData;
    expect(groups.map((g) => g.name)).toEqual(['NexusDI']);
    const tracks = Object.entries(groups[0]?.entriesByTrack ?? {});
    expect(tracks.map(([name]) => name)).toEqual(TRACKS);
    const written = spansByTrack(file);
    expect(
      Object.fromEntries(tracks.map(([name, list]) => [name, list.length])),
    ).toEqual(
      Object.fromEntries(
        [...written].map(([name, list]) => [name, list.length]),
      ),
    );
  });

  it("keeps every entry's name, start and duration in µs", async () => {
    const file = toChromeTrace(meridian);
    const groups = (await model(file)).ExtensionTraceData.extensionTrackData;
    const read = Object.entries(groups[0]?.entriesByTrack ?? {}).map(
      ([track, list]) => [
        track,
        list
          .map((entry) => [entry.name, entry.ts, entry.dur] as const)
          .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])),
      ],
    );
    // The fixture's own spans, in µs, independent of the file's events.
    const us = (ms: number) => Math.round(ms * 1000);
    const expected = new Map<string, (readonly [string, number, number])[]>();
    for (const run of meridian.runs)
      for (const span of spansOf(run, meridian.graph, meridian.reportedMs)) {
        if (span.marker) continue;
        const list = expected.get(span.track) ?? [];
        list.push([
          span.name,
          us(span.startMs),
          us(span.endMs) - us(span.startMs),
        ]);
        expected.set(span.track, list);
      }
    expect(read).toEqual(
      [...expected].map(([track, list]) => [
        track,
        [...list].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])),
      ]),
    );
  });

  it('merges the CPU profile into pid 1, its samples inside the run', async () => {
    const profile = fixture('node.cpuprofile') as CpuProfile;
    const run = meridian.runs[0];
    if (run === undefined || run.durationMs === null)
      throw new Error('the fixture has no settled create run');
    const offsetMs = profile.startTime / 1000 - run.startMs;
    const data = await model(
      toChromeTrace(meridian, { cpuProfile: { profile, offsetMs } }),
    );
    expect(data.Samples.profilesInProcess.size).toBe(1);
    const [threads] = [...data.Samples.profilesInProcess.values()];
    const [samples] = [...(threads?.values() ?? [])];
    const times = samples?.parsedProfile.timestamps ?? [];
    expect(times.length).toBeGreaterThan(0);
    // The engine keeps sample times in ms.
    const startMs = run.startMs + offsetMs;
    const endMs = run.startMs + run.durationMs + offsetMs;
    for (const ts of [times[0], times[times.length - 1]]) {
      expect(ts).toBeGreaterThanOrEqual(startMs);
      expect(ts).toBeLessThanOrEqual(endMs);
    }
  });

  it('matches the committed golden file', () => {
    const text = `${JSON.stringify(toChromeTrace(meridian), null, 2)}\n`;
    // UPDATE=1 rewrites the golden file; review its diff before committing.
    if (process.env['UPDATE'])
      writeFileSync(at('chrome-trace.golden.json'), text);
    expect(text).toBe(readFileSync(at('chrome-trace.golden.json'), 'utf8'));
  });

  it('draws the failed and partial fixtures', async () => {
    for (const report of [failed, partial])
      expect((await model(toChromeTrace(report))).Meta.mainFrameId).toBe('F1');
  });

  it('gives a partial report with no graph the bare frame URL and no critical path', () => {
    const file = toChromeTrace(partial);
    const started = file.traceEvents.find(
      (e) => e['name'] === 'TracingStartedInBrowser',
    );
    expect(
      (started?.['args'] as { data: { frames: { url: string }[] } }).data
        .frames[0]?.url,
    ).toBe('nexusdi://profile');
    const colours = (file.traceEvents as readonly Event[])
      .filter((e) => e['ph'] === 'b')
      .map(
        (e) =>
          (
            JSON.parse((e['args'] as { detail: string }).detail) as {
              devtools: { color: string };
            }
          ).devtools.color,
      );
    expect(colours).not.toContain('primary-dark');
    expect(colours).toContain('error');
  });
});

describe('the Perfetto file', () => {
  it('nests slices per tid, pairs every flow and names every tid', () => {
    const events = toPerfettoTrace(meridian).traceEvents as readonly Event[];
    const named = new Set(
      events
        .filter((e) => e['name'] === 'thread_name')
        .map((e) => `${e['pid']} ${e['tid']}`),
    );
    const slices = events.filter((e) => e['ph'] === 'X');
    for (const e of slices)
      expect(named.has(`${e['pid']} ${e['tid']}`)).toBe(true);
    // On each tid, two slices that overlap nest: one holds the other.
    const byTid = new Map<string, Event[]>();
    for (const e of slices) {
      const key = `${e['pid']} ${e['tid']}`;
      byTid.set(key, [...(byTid.get(key) ?? []), e]);
    }
    const start = (e: Event) => e['ts'] as number;
    const end = (e: Event) => start(e) + (e['dur'] as number);
    const holds = (a: Event, b: Event) =>
      start(a) <= start(b) && end(b) <= end(a);
    for (const list of byTid.values())
      for (const a of list)
        for (const b of list)
          if (a !== b && start(a) < end(b) && start(b) < end(a))
            expect(holds(a, b) || holds(b, a)).toBe(true);
    const ids = (ph: string) =>
      events
        .filter((e) => e['ph'] === ph)
        .map((e) => e['id'])
        .sort();
    expect(ids('s')).toEqual(ids('f'));
  });
});
```

The main `vite.config.ts` excludes `src/**/*.trace.test.ts` (with `configDefaults.exclude`), `.fallowrc.jsonc` lists `vitest.trace.config.ts` as an entry and `@paulirish/trace_engine` under `ignoreDependencies`, and `no-node.test.ts` needs no `.trace.ts` exception. Spec 10.1's third assertion compares each engine entry with `spansOf` over the report, so a shift in the writer fails it. The engine's type names (`parsedTrace`, `entriesByTrack`, `profilesInProcess`) follow the version pinned in Step 1. Where that version names a field differently, read its `.d.ts` and keep each assertion's meaning: spec 10.1 lists the five assertions this file must make.

The CPU test asserts the samples land on pid 1, tid 1, where DevTools draws the flame chart under Main. The 20-sample `node.cpuprofile` is hand-cut; Task 18 adds a recorded fixture from a real `node --cpu-prof` run and holds the merge against it too.

- [ ] Step 5: Write the golden file and run the target

Run once with `UPDATE=1`, guarded in the test as `if (process.env['UPDATE']) writeFileSync(...)`, then read the file in review: every span of the fixture appears once, the frame URL is `nexusdi://profile/Meridian`, and the `ts` values are integers.
Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/devtools:test-trace`
Expected: PASS.

- [ ] Step 6: Run the targets

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/devtools && npx fallow dead-code --fail-on-issues`
Expected: PASS. Add `test-fixtures/profile/**` to fallow's ignore list in `.fallowrc.jsonc` if it reports the JSON files.

- [ ] Step 7: Commit with `test(devtools): hold the Chrome trace layout against the DevTools trace engine`.

### Task 14: bundle cost and the size fixture

Files:

- Create: `examples/size/src/devtools-profile.ts`, `examples/size/src/devtools-live.ts`
- Modify: `scripts/size-report.mjs`, `tools/repo-checks/src/size-fixtures.ts` and its test

Interfaces:

- Produces: the size report lists `devtools+profile` (the `devtools-profile.ts` fixture minus core).

- [ ] Step 1: The fixture

```ts
import { Nexus } from '@nexusdi/core';
import { profile } from '@nexusdi/devtools';

import { App, UserService } from './app.ts';

const profiler = profile();
const app = await Nexus.create(App, { plugins: [profiler] });
app.get(UserService).logger.log('ready');
console.log(profiler.report().runs.length);
```

`devtools-live.ts` is the same app with `profile({ live: liveSink() })` and `import { liveSink } from '@nexusdi/devtools/live';`.

- [ ] Step 2: Measure it. `size-report.mjs` measures `<dir>.ts` and `<dir>-text.ts` only. In `measurePackages`, also measure every `<dir>-<feature>.ts` other than `-text` whose `<dir>` is a folder under `libs/`, reported as `<dir>+<feature>`, minus core. `size-fixtures.ts` reports a `<dir>-<feature>.ts` fixture whose `<dir>` is no `libs/` folder. `scripts/size-compare.mjs` needs no change: it prints a key with no baseline as `new`. Add a case to `size-fixtures.test.ts` that `devtools-profile.ts` is accepted and `gone-profile.ts` (no `libs/gone`) is reported. Write the failing test first, run `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- size-fixtures`, then implement.

- [ ] Step 3: Check the claims of spec 11.2

Run: `npm run size`
Expected: the `devtools` row moves only as core does (no profile code reaches `devtools()`, `graph()` or `trace()`; their sources do not change). `devtools+profile` and `devtools+live` match spec 11.2's report figures (1,622 B and 3,077 B at Task 14), and a standalone build with core external gives `profile()` near 1,960 B and `/live` near 1,530 B on top. Record both in the ledger for the pull request. If `devtools` moved, find the import that pulled a profile module into `devtools.ts`, `graph.ts` or `trace.ts` and remove it.

- [ ] Step 4: Run the targets and commit

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test typecheck -p @nexusdi/repo-checks @nexusdi/size`
Commit with `chore(repo): measure the profile fixture in the size report`.

---

## Part 3: `nexusdi profile` (spec sections 8 and 9)

The CLI reaches devtools only through `DevtoolsApi`, which `loadDevtools` resolves from the entry's project (the named P5 exception of `optional-dependencies.test.ts` covers it). Process tests spawn the built bin, as `bin.test.ts` does.

### Task 15: parse the `profile` command

Files:

- Modify: `libs/cli/src/args.ts`, `libs/cli/src/main.ts` (`USAGE`), `libs/cli/README.md`, `libs/cli/src/readme.test.ts`
- Test: `libs/cli/src/args.test.ts`

Interfaces:

- Produces in `args.ts`:

```ts
export interface ProfileCommand {
  readonly kind: 'profile';
  readonly entry: EntryRef;
  readonly load: readonly EntryRef[];
  readonly plugins: EntryRef | null;
  /** Warm iterations after the first. */
  readonly repeat: number;
  /** Absolute paths; null writes no file. */
  readonly chrome: string | null;
  readonly perfetto: string | null;
  readonly json: string | null;
  readonly cpu: boolean;
  /** µs. */
  readonly cpuInterval: number;
  readonly top: number;
  /** ms. */
  readonly timeout: number;
  readonly quiet: boolean;
}
export type Command =
  | GraphCommand
  | ProfileCommand
  | { readonly kind: 'help' }
  | { readonly kind: 'version' };
```

`OPTIONS` gains `repeat`, `chrome`, `perfetto`, `json`, `'cpu-interval'`, `top`, `timeout` (all `type: 'string'`) and `cpu`, `quiet` (`type: 'boolean'`).

- [ ] Step 1: Write the failing tests (append to `args.test.ts`)

```ts
describe('parseCommand, profile', () => {
  const cwd = '/project';
  it('reads the defaults', () => {
    expect(
      parseCommand(['profile', 'src/ship.ts#Meridian'], cwd),
    ).toMatchObject({
      kind: 'profile',
      entry: { path: '/project/src/ship.ts', exportName: 'Meridian' },
      repeat: 0,
      chrome: null,
      perfetto: null,
      json: null,
      cpu: false,
      cpuInterval: 100,
      top: 20,
      timeout: 60_000,
      quiet: false,
    });
  });

  it('reads every flag', () => {
    expect(
      parseCommand(
        [
          'profile',
          'a.ts',
          '--load',
          'b.ts#B',
          '--plugins',
          'p.ts#plugins',
          '--repeat',
          '20',
          '--chrome',
          'c.json',
          '--perfetto',
          'p.json',
          '--json',
          'r.json',
          '--cpu',
          '--cpu-interval',
          '50',
          '--top',
          '5',
          '--timeout',
          '100',
          '--quiet',
        ],
        cwd,
      ),
    ).toMatchObject({
      repeat: 20,
      chrome: '/project/c.json',
      perfetto: '/project/p.json',
      json: '/project/r.json',
      cpu: true,
      cpuInterval: 50,
      top: 5,
      timeout: 100,
      quiet: true,
    });
  });

  it.each([
    [['profile', 'a.ts', '--cpu'], '--cpu needs --chrome'],
    [['profile', 'r.json', '--load', 'b.ts'], 'a .json entry'],
    [['profile', 'r.json', '--repeat', '3'], 'a .json entry'],
    // node:util reads "--repeat -1" as a flag with no value and refuses it;
    // "--repeat=-1" reaches the CLI's own check.
    [
      ['profile', 'a.ts', '--repeat', '-1'],
      "Option '--repeat' argument is ambiguous",
    ],
    [['profile', 'a.ts', '--repeat=-1'], '--repeat takes'],
    [['profile', 'a.ts', '--timeout', 'soon'], '--timeout takes'],
    [['profile', 'a.ts', '-f', 'svg'], '-f is a graph option'],
    [['graph', 'a.ts', '--chrome', 'c.json'], '--chrome is a profile option'],
  ])('refuses %j with exit 2', (argv, message) => {
    const error = thrown(() => parseCommand(argv, cwd)) as CliError;
    expect(error.exitCode).toBe(2);
    expect(error.message).toContain(message);
  });
});
```

Import `thrown` the way the file's existing tests catch a `CliError` (add a local `thrown` helper if it has none).

`node:util`'s `parseArgs` refuses `--repeat -1` itself (an option value that starts with a dash is ambiguous), with exit 2; the row for the CLI's own `--repeat takes` message passes `--repeat=-1`.

- [ ] Step 2: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/cli -- args`
Expected: FAIL, `unknown command "profile"`.

- [ ] Step 3: Implement. In `parseCommand`, after `parseArgs`, accept `graph` or `profile` as the command (the no-command message's fix becomes `Run: nexusdi graph <entry> or nexusdi profile <entry>`). Then:

```ts
const GRAPH_ONLY = ['format', 'out', 'view'] as const;
const PROFILE_ONLY = [
  'repeat',
  'chrome',
  'perfetto',
  'json',
  'cpu',
  'cpu-interval',
  'top',
  'timeout',
  'quiet',
] as const;

function refuseFlags(
  values: Record<string, unknown>,
  names: readonly string[],
  owner: string,
): void {
  for (const name of names)
    if (values[name] !== undefined) {
      const short = (OPTIONS as Record<string, { short?: string }>)[name]
        ?.short;
      throw new CliError(
        2,
        `${short === undefined ? `--${name}` : `-${short}`} is a ${owner} option.`,
        HELP_FIX,
      );
    }
}

function count(
  flag: string,
  value: string | undefined,
  fallback: number,
  min: number,
): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min)
    throw new CliError(
      2,
      `${flag} takes a whole number of at least ${min}; got "${value}".`,
      HELP_FIX,
    );
  return n;
}
```

`graph` calls `refuseFlags(values, PROFILE_ONLY, 'profile')`, `profile` calls `refuseFlags(values, GRAPH_ONLY, 'graph')` and builds the `ProfileCommand` with `count('--repeat', values.repeat, 0, 0)`, `count('--cpu-interval', ..., 100, 1)`, `count('--top', ..., 20, 1)`, `count('--timeout', ..., 60_000, 1)`, and output paths through `resolve(cwd, value)`. It then refuses, with exit 2: `--cpu` without `--chrome` ("--cpu needs --chrome: the CPU profile merges into the Chrome trace." / "Add --chrome startup.json"); and, for a `.json` entry, any of `--load`, `--plugins`, `--repeat` above 0 or `--cpu` ("--load, --plugins, --repeat and --cpu need a module entry; a .json entry is a finished report." / "Drop them, or pass the file that defines the root module."). Every refusal carries a fix line, as graph's do. The existing `--load`/`--plugins` `.json` checks apply to both commands.

`USAGE` in `main.ts` becomes the graph block followed by the spec 9.1 synopsis, and its exit-code line becomes "Exit codes: 0 written, 1 invalid graph or failed startup, 2 bad invocation or input, 3 missing tool."

`refuseFlags` reads a flag's short form with `'short' in option`, since a typed `{ short?: string }` view of `OPTIONS` fails TypeScript's weak-type check. Until Task 16 runs the command, `main()` exits 2 on a profile command ("nexusdi profile is not available in this build."), and `main.test.ts` pins that and the `--help` synopsis; Task 16 replaces both.

- [ ] Step 4: The README. Add a `## Profile startup` section after `## Usage`, with two `npx nexusdi profile` lines from spec 9.2 and one sentence each, and add every new flag as a row of the `## Options` table, with "profile" in its purpose cell. In `readme.test.ts`: collect command lines from both sections; accept `kind: 'graph'` or `'profile'`; keep the Usage section's count rule at one to four; and change the flag regex to `/(--?[a-z][a-z-]*)/g` so `--cpu-interval` reads as one flag. The README standard caps a package README at 75 lines, so the nine profile flags share four rows, each listing its flags inside one backtick span (`--repeat, --top`, `--chrome, --perfetto, --json`, `--cpu, --cpu-interval`, `--timeout, --quiet`) the way `-f, --format` does.

- [ ] Step 5: Run the targets

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/cli`
Expected: PASS.

- [ ] Step 6: Commit with `feat(cli): parse the profile command`.

### Task 16: run the profile and write its outputs

Files:

- Create: `libs/cli/src/profile.ts`, `libs/cli/src/profile.test.ts`
- Create: `libs/cli/test-fixtures/profile/meridian.module.js`, `science.module.js`, `broken.module.js`, `leaky.module.js`, `plugins.js`, `report.json`, `bad-report.json`
- Modify: `libs/cli/src/devtools.ts`, `libs/cli/src/main.ts`, `libs/cli/src/graph.ts` (share the loader), `libs/cli/src/cli-error.ts` (exit code 1 TSDoc)

Interfaces:

- Consumes: `ProfileCommand` (Task 15); devtools' `profile`, `profileStartup`, `profileTable`, `toChromeTrace`, `toPerfettoTrace`, `parseProfileReport` (Tasks 8 to 12).
- Produces: `runProfile(command: ProfileCommand, io: Io, version: string): Promise<number>`; in `graph.ts`, `loadEntry(command: { entry; load; plugins }, version: string, via: string): Promise<{ root: unknown; load: unknown[]; plugins: unknown[] | undefined; devtools: DevtoolsApi }>`, which `graphFor` now calls too.

- [ ] Step 1: The fixtures. `meridian.module.js`, interface-first in JavaScript form:

```js
import { Token, defineModule, provide } from '@nexusdi/core';

export const REACTOR_CORE = new Token('ReactorCore');
export const NAV_CHARTS = new Token('NavCharts');

class FusionReactor {
  output() {
    return 1.21;
  }
}

export const Engineering = defineModule({
  name: 'Engineering',
  providers: [provide(REACTOR_CORE, { useClass: FusionReactor })],
  exports: [REACTOR_CORE],
});

export const Tactical = defineModule({
  name: 'Tactical',
  imports: [Engineering],
  providers: [
    provide(NAV_CHARTS, {
      useFactory: async (core) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { sector: () => core.output() };
      },
      deps: [REACTOR_CORE],
    }),
  ],
  exports: [NAV_CHARTS],
});

export const Hung = defineModule({
  name: 'Hung',
  providers: [
    provide(NAV_CHARTS, { useFactory: () => new Promise(() => undefined) }),
  ],
});

export const Meridian = defineModule({ name: 'Meridian', imports: [Tactical] });
export default Meridian;
```

`science.module.js` exports `Science`, a module with one class provider. `broken.module.js` exports `Broken`, whose provider's constructor throws `new Error('hull breach')`. `leaky.module.js` exports `Leaky`, whose provider's `[Symbol.dispose]` throws. `plugins.js` exports `plugins = []`. `not-a-module.module.js` exports `NotAModule`, an object with a key core rejects before it compiles (`{ providers: [], imports: [], wiring: true }`); check the key against `InvalidModuleError` on `release/0.4` when writing it. `report.json` is `JSON.stringify(await profileStartup(Meridian))` saved once (write it with a throwaway script and commit the file); `bad-report.json` is the same with `runs[0].builds[0].startMs` deleted.

- [ ] Step 2: Write the failing process tests `profile.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FIXTURES, runCli } from '../test-support/run.js';
import { tempDir } from '../test-support/temp.js';

const DIR = join(FIXTURES, 'profile');

describe('nexusdi profile', () => {
  it('prints the table for a module entry and exits 0', () => {
    const run = runCli(['profile', 'meridian.module.js#Meridian'], {
      cwd: DIR,
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^Node \d+\.\d+\.\d+, @nexusdi\/core /);
    expect(run.stdout).toContain('slowest providers');
    expect(run.stdout).toMatch(/NavCharts\s+Tactical\s+1\s+singleton.*async/);
  });

  it('writes the Chrome, Perfetto and JSON files, and nothing to stdout with --quiet', () => {
    const dir = tempDir();
    const run = runCli(
      [
        'profile',
        'meridian.module.js',
        '--load',
        'science.module.js#Science',
        '--repeat',
        '2',
        '--quiet',
        '--chrome',
        join(dir, 'c.json'),
        '--perfetto',
        join(dir, 'p.json'),
        '--json',
        join(dir, 'r.json'),
      ],
      { cwd: DIR },
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('');
    const reports = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')) as {
      runs: { kind: string }[];
    }[];
    expect(reports).toHaveLength(3);
    expect(reports[0]!.runs.map((r) => r.kind)).toEqual(['create', 'load']);
    expect(
      JSON.parse(readFileSync(join(dir, 'c.json'), 'utf8')).traceEvents.length,
    ).toBeGreaterThan(0);
    expect(
      JSON.parse(readFileSync(join(dir, 'p.json'), 'utf8')).metadata,
    ).toMatchObject({ 'nexusdi-profile': 1 });
  });

  it('re-renders a saved report without running the app', () => {
    const run = runCli(['profile', 'report.json'], { cwd: DIR });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('slowest providers');
  });

  it('exits 2 for a report devtools rejects, naming the file first', () => {
    const run = runCli(['profile', 'bad-report.json'], { cwd: DIR });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(
      /^nexusdi: bad-report\.json: \[NEXUS_DEVTOOLS_PROFILE_INVALID\]/,
    );
  });

  it('exits 1 when the app fails to start, and still writes the table and files', () => {
    const dir = tempDir();
    const run = runCli(
      ['profile', 'broken.module.js#Broken', '--json', join(dir, 'r.json')],
      { cwd: DIR },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('hull breach');
    expect(run.stdout).toContain('failed');
    expect(
      JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8'))[0].runs[0].ok,
    ).toBe(false);
  });

  it('exits 2 when create throws before it compiles', () => {
    const run = runCli(['profile', 'not-a-module.module.js#NotAModule'], {
      cwd: DIR,
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(
      /^nexusdi: create failed:\n.*NEXUS_INVALID_MODULE/,
    );
  });

  it('warns on a disposal error and keeps exit 0', () => {
    const run = runCli(['profile', 'leaky.module.js#Leaky'], { cwd: DIR });
    expect(run.status).toBe(0);
    expect(run.stderr).toMatch(/^nexusdi: warning: disposal/);
  });
});
```

- [ ] Step 3: Run them and see them fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/cli -- profile`
Expected: FAIL (the bin knows no `profile` run).

- [ ] Step 4: Share the loader. Move the body of `graphFor` that imports `refs`, prepares the loader, loads devtools and picks `root`, `load` and `plugins` into `loadEntry` in `graph.ts`, with `via` (`'nexusdi graph'` or `'nexusdi profile'`) passed into `ENTRY_USE`. `graphFor` calls it and keeps its `inspect` call. The graph tests stay green unchanged.

`devtools.ts`: `DevtoolsApi` gains `profile`, `profileStartup`, `profileTable`, `toChromeTrace`, `toPerfettoTrace` and `parseProfileReport` (as `typeof` imports from `@nexusdi/devtools`).

- [ ] Step 5: `profile.ts`

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ProfileReport, Profiler } from '@nexusdi/devtools';

import type { ProfileCommand } from './args.js';
import { CliError } from './cli-error.js';
import { loadDevtools, type DevtoolsApi } from './devtools.js';
import { entryKind } from './entry.js';
import { loadEntry } from './graph.js';
import type { Io } from './main.js';
import { emit, writeTo } from './write.js';

type Outcome =
  | { readonly kind: 'done'; readonly report: ProfileReport }
  | { readonly kind: 'failed'; readonly error: unknown }
  | { readonly kind: 'timeout' };

/** Waits for `work` up to `ms`. The hung operation stays parked on its promise. */
function within(work: Promise<ProfileReport>, ms: number): Promise<Outcome> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ kind: 'timeout' }), ms);
    work.then(
      (report) => {
        clearTimeout(timer);
        resolve({ kind: 'done', report });
      },
      (error: unknown) => {
        clearTimeout(timer);
        resolve({ kind: 'failed', error });
      },
    );
  });
}

async function readReports(
  command: ProfileCommand,
  devtools: DevtoolsApi,
): Promise<ProfileReport[]> {
  const { path, shown } = command.entry;
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new CliError(
      2,
      `${shown} is not a readable JSON file: ${(error as Error).message}`,
      'Pass a file written by nexusdi profile --json.',
    );
  }
  const values = Array.isArray(value) ? value : [value];
  try {
    return values.map((v) => devtools.parseProfileReport(v));
  } catch (error) {
    // devtools' message ends in its Fix line.
    throw new CliError(2, `${shown}: ${(error as Error).message}`);
  }
}

async function writeOutputs(
  io: Io,
  command: ProfileCommand,
  devtools: DevtoolsApi,
  reports: readonly ProfileReport[],
  version: string,
  cpu: Parameters<DevtoolsApi['toChromeTrace']>[1],
): Promise<void> {
  const [first] = reports;
  if (first === undefined) return;
  if (command.json !== null)
    await emit(JSON.stringify(reports), command.json, io.stdout);
  if (command.chrome !== null)
    await emit(
      JSON.stringify(devtools.toChromeTrace(first, cpu)),
      command.chrome,
      io.stdout,
    );
  if (command.perfetto !== null) {
    const file = devtools.toPerfettoTrace(first);
    await emit(
      JSON.stringify({
        ...file,
        metadata: { ...file.metadata, 'nexusdi-core': version },
      }),
      command.perfetto,
      io.stdout,
    );
  }
}

export async function runProfile(
  command: ProfileCommand,
  io: Io,
  version: string,
): Promise<number> {
  const header = `Node ${process.versions.node}, @nexusdi/core ${version}\n`;
  if (entryKind(command.entry) === 'json') {
    const devtools = await loadDevtools(join(io.cwd, 'package.json'), version);
    const reports = await readReports(command, devtools);
    await writeOutputs(io, command, devtools, reports, version, undefined);
    if (!command.quiet)
      await writeTo(
        io.stdout,
        header + devtools.profileTable(reports, { top: command.top }),
      );
    return 0;
  }

  const { root, load, plugins, devtools } = await loadEntry(
    command,
    version,
    'nexusdi profile',
  );
  const reports: ProfileReport[] = [];
  let code = 0;
  let cpu: Parameters<DevtoolsApi['toChromeTrace']>[1];
  for (let i = 0; i <= command.repeat; i++) {
    const profiler: Profiler = devtools.profile();
    // Task 18 starts and stops CPU sampling around iteration 1 here.
    const outcome = await within(
      devtools.profileStartup(root as never, {
        plugins: plugins as never,
        load: load as never,
        profiler,
      }),
      command.timeout,
    );
    if (outcome.kind === 'done') {
      reports.push(outcome.report);
      if (outcome.report.dispose !== null && outcome.report.dispose.errors > 0)
        await writeTo(
          io.stderr,
          `nexusdi: warning: disposal after iteration ${i + 1} raised ${outcome.report.dispose.errors} errors; the startup figures stand.\n`,
        );
      continue;
    }
    const partial = profiler.report();
    reports.push(partial);
    const open = partial.runs.find((r) => r.ok === null);
    if (outcome.kind === 'timeout') {
      const waiting = (open?.pending ?? [])
        .map(
          (p) =>
            `${p.token}${p.module === '' ? '' : ` (${p.module})`} ${p.what === 'construct' ? 'factory' : 'onInit'}, ${Math.round(partial.reportedMs - p.startMs)} ms`,
        )
        .join('; ');
      await writeTo(
        io.stderr,
        `nexusdi: ${open?.kind ?? 'create'} did not settle within ${command.timeout} ms.\n${waiting === '' ? '' : `  Still awaiting: ${waiting}\n`}`,
      );
    } else {
      const failed = partial.runs.find((r) => r.ok === false);
      const detail =
        outcome.error instanceof Error
          ? outcome.error.message
          : String(outcome.error);
      await writeTo(
        io.stderr,
        `nexusdi: ${failed?.kind ?? 'create'} failed:\n${detail}\n`,
      );
      // A run that failed before it compiled, or no run at all, is an input error
      // (spec 9.5, plan choice 10). The profiler's data decides; no error code is read.
      if (failed === undefined || failed.compile === null) {
        code = 2;
        break;
      }
    }
    code = 1;
    break;
  }
  await writeOutputs(io, command, devtools, reports, version, cpu);
  if (!command.quiet)
    await writeTo(
      io.stdout,
      header + devtools.profileTable(reports, { top: command.top }),
    );
  return code;
}
```

`main.ts`: after `parseCommand`, for `command.kind === 'profile'` run `checkOut` once per output path against the input refs, `requireCore(version)`, then `const { runProfile } = await import('./profile.js'); return await runProfile(command, io, version);`. The bin already calls `process.exit(code)`, so an open handle in user code, or the hung operation of a timeout, cannot keep it alive. `cli-error.ts`: the `ExitCode` TSDoc reads "1: the graph is invalid, or the app failed to start after it compiled."

`emit` falls back to stdout only for a null path, which `writeOutputs` never passes.

- [ ] Step 6: Run the targets

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/cli @nexusdi/devtools`
Expected: PASS.

- [ ] Step 7: Add `"nexusdi-core": "<version>"` to the Perfetto file's `metadata` before writing it (spec 7.4). Read the version from the `package.json` of the `@nexusdi/core` the entry resolves, as the devtools version check already finds it; add no core export for it. Extend the process test that writes `--perfetto` to assert the field equals that package's version.

- [ ] Step 8: Put the CLI sentence back on `apps/docs/content/errors/NEXUS_DEVTOOLS_PROFILE_INVALID.mdx`, at the end of its opening paragraph, once this task makes it true: "`nexusdi profile` from `@nexusdi/cli` calls `parseProfileReport` for each report of a `.json` entry, and for a file that holds no report it prints `nexusdi: <file>: ` followed by this error's message, then exits with code 2." Check each clause against `libs/cli/src/profile.ts` first (the prefix, the exit code, and that an array entry is parsed per element), and edit the sentence to what the CLI does.

- [ ] Step 9: Commit with `feat(cli): profile a startup and write the table and trace files`.

### Task 17: `--timeout` and the exit codes

Files:

- Test: `libs/cli/src/profile.test.ts`, `libs/cli/src/bin.test.ts`

Interfaces:

- Consumes: `runProfile` (Task 16).

- [ ] Step 1: Write the tests

```ts
describe('nexusdi profile --timeout', () => {
  it('prints what a hung create still awaits, writes the partial report and exits 1', () => {
    const dir = tempDir();
    const started = Date.now();
    const run = runCli(
      [
        'profile',
        'meridian.module.js#Hung',
        '--timeout',
        '300',
        '--chrome',
        join(dir, 'c.json'),
        '--json',
        join(dir, 'r.json'),
      ],
      { cwd: DIR, timeout: 10_000 },
    );
    expect(Date.now() - started).toBeLessThan(8_000);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(
      /^nexusdi: create did not settle within 300 ms\.\n  Still awaiting: NavCharts \(Hung\) factory, \d+ ms\n$/,
    );
    const [report] = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')) as {
      runs: { ok: null; pending: unknown[] }[];
    }[];
    expect(report!.runs[0]).toMatchObject({ ok: null });
    expect(report!.runs[0]!.pending).toHaveLength(1);
    expect(readFileSync(join(dir, 'c.json'), 'utf8')).toContain(
      'still awaiting at timeout',
    );
  });
});

describe('nexusdi profile exit codes (spec 9.5)', () => {
  it.each([
    [['profile', 'meridian.module.js', '--cpu'], 2],
    [['profile', 'report.json', '--repeat', '1'], 2],
    [['profile', 'missing.module.js'], 2],
    [['profile', 'meridian.module.js#Nope'], 2],
  ])('%j exits %i with a nexusdi: message and a fix line', (argv, status) => {
    const run = runCli(argv, { cwd: DIR });
    expect(run.status).toBe(status);
    expect(run.stderr).toMatch(/^nexusdi: .*\n  \S/);
  });
});
```

For exit 3, add a case to `bin.test.ts` next to graph's missing-devtools case: the same temp project without `@nexusdi/devtools`, run with `profile`, expects status 3 and the `npm i -D @nexusdi/devtools@<version>` fix line.

- [ ] Step 2: Run them

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/cli -- profile bin`
Expected: PASS. A failure points at Task 15 (argument checks) or Task 16 (the timeout branch); fix it there.

- [ ] Step 3: Run the targets of Task 16 and commit with `test(cli): pin the profile timeout and exit codes`.

### Task 18: `--cpu`

Files:

- Create: `libs/cli/src/cpu.ts`, `libs/cli/src/cpu.test.ts`
- Modify: `libs/cli/src/profile.ts`
- Test: `libs/cli/src/profile.test.ts`

Interfaces:

- Produces in `cpu.ts`: `startCpu(interval: number): Promise<Sampling>`, `stopCpu(sampling: Sampling): Promise<CpuProfile>`, `nexusdiAnchorStart(interval: number): number`, `nexusdiAnchorEnd(interval: number): number`, `alignClocks(profile: CpuProfile, anchors: readonly (readonly [name: string, perfNow: number])[]): { readonly offsetMs: number; readonly driftMs: number } | null`.

- [ ] Step 1: Write the failing unit test `cpu.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import { alignClocks } from './cpu.js';

const frame = (functionName: string) => ({
  functionName,
  scriptId: '1',
  url: '',
  lineNumber: 0,
  columnNumber: 0,
});
const profile = {
  nodes: [
    { id: 1, callFrame: frame('(root)'), children: [2, 3] },
    { id: 2, callFrame: frame('nexusdiAnchorStart'), children: [4] },
    { id: 3, callFrame: frame('nexusdiAnchorEnd') },
    { id: 4, callFrame: frame('spin') },
  ],
  startTime: 1_000_000,
  endTime: 1_010_000,
  samples: [1, 4, 4, 1, 3],
  timeDeltas: [0, 100, 100, 5000, 100],
};

describe('alignClocks', () => {
  it('takes the first sample whose stack holds each anchor, and reports their drift', () => {
    // Start: sample 2 at 1,000,100 µs = 1000.1 ms; anchor read 10 ms -> offset 990.1.
    // End: sample 5 at 1,005,300 µs = 1005.3 ms; anchor read 15.1 ms -> offset 990.2.
    const aligned = alignClocks(profile, [
      ['nexusdiAnchorStart', 10],
      ['nexusdiAnchorEnd', 15.1],
    ])!;
    expect(aligned.offsetMs).toBeCloseTo(990.1, 6);
    expect(aligned.driftMs).toBeCloseTo(0.1, 6);
  });

  it('returns null when an anchor has no sample', () => {
    expect(
      alignClocks({ ...profile, samples: [1, 1, 1, 1, 1] }, [
        ['nexusdiAnchorStart', 10],
        ['nexusdiAnchorEnd', 15],
      ]),
    ).toBeNull();
  });
});
```

- [ ] Step 2: Run it and see it fail

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/cli -- cpu`
Expected: FAIL.

- [ ] Step 3: Implement `cpu.ts`

```ts
import { Session } from 'node:inspector/promises';

import type { CpuProfile } from '@nexusdi/devtools';

export interface Sampling {
  readonly session: Session;
}

export async function startCpu(interval: number): Promise<Sampling> {
  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.setSamplingInterval', { interval });
  await session.post('Profiler.start');
  return { session };
}

export async function stopCpu(sampling: Sampling): Promise<CpuProfile> {
  const { profile } = await sampling.session.post('Profiler.stop');
  sampling.session.disconnect();
  return profile as unknown as CpuProfile;
}

function spin(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end);
}

// The anchors' names are what alignClocks looks for in the samples. The
// CLI builds with tsc and no minifier, so the names reach the profile intact.
/** Records performance.now(), then spins long enough for at least 20 samples. */
export function nexusdiAnchorStart(interval: number): number {
  const at = performance.now();
  spin(Math.max(2, (20 * interval) / 1000));
  return at;
}

export function nexusdiAnchorEnd(interval: number): number {
  const at = performance.now();
  spin(Math.max(2, (20 * interval) / 1000));
  return at;
}

/**
 * The offset from performance.now() ms to the profile's clock (spec 8):
 * per anchor, the time of the first sample whose stack holds its name,
 * minus the time the anchor read. null when an anchor has no sample.
 */
export function alignClocks(
  profile: CpuProfile,
  anchors: readonly (readonly [name: string, perfNow: number])[],
): { readonly offsetMs: number; readonly driftMs: number } | null {
  const names = new Map(
    profile.nodes.map((n) => [n.id, n.callFrame.functionName]),
  );
  const parents = new Map<number, number>();
  for (const n of profile.nodes)
    for (const child of n.children ?? []) parents.set(child, n.id);
  const holds = (id: number, name: string): boolean => {
    for (
      let at: number | undefined = id;
      at !== undefined;
      at = parents.get(at)
    )
      if (names.get(at) === name) return true;
    return false;
  };
  const offsets: number[] = [];
  for (const [name, perfNow] of anchors) {
    let t = profile.startTime;
    let found: number | null = null;
    for (let i = 0; i < profile.samples.length && found === null; i++) {
      t += profile.timeDeltas[i] ?? 0;
      if (holds(profile.samples[i]!, name)) found = t / 1000 - perfNow;
    }
    if (found === null) return null;
    offsets.push(found);
  }
  const [first = 0, ...rest] = offsets;
  return {
    offsetMs: first,
    driftMs: Math.max(0, ...rest.map((o) => Math.abs(o - first))),
  };
}
```

- [ ] Step 4: Wire it into `runProfile`, for iteration 1 only:

```ts
const sampling =
  i === 0 && command.cpu ? await startCpu(command.cpuInterval) : null;
const before = sampling === null ? 0 : nexusdiAnchorStart(command.cpuInterval);
const outcome = await within(/* unchanged */);
if (sampling !== null) {
  const after = nexusdiAnchorEnd(command.cpuInterval);
  const profile = await stopCpu(sampling);
  const aligned = alignClocks(profile, [
    ['nexusdiAnchorStart', before],
    ['nexusdiAnchorEnd', after],
  ]);
  if (aligned === null) {
    await writeTo(
      io.stderr,
      'nexusdi: warning: no CPU sample landed in an anchor, so the Chrome trace has no CPU profile.\n',
    );
  } else {
    const limit = Math.max(1, (4 * command.cpuInterval) / 1000);
    if (aligned.driftMs > limit)
      await writeTo(
        io.stderr,
        `nexusdi: warning: clock drift ${aligned.driftMs.toFixed(1)} ms; CPU samples may sit up to ${aligned.driftMs.toFixed(1)} ms off the provider spans.\n`,
      );
    cpu = { cpuProfile: { profile, offsetMs: aligned.offsetMs } };
  }
}
```

On a timeout, stop the sampling before writing (the `if (sampling !== null)` block runs on every outcome).

- [ ] Step 5: The process test (append to `profile.test.ts`)

```ts
describe('nexusdi profile --cpu', () => {
  it.runIf(process.platform === 'linux')(
    'finds both anchors on Linux and merges the samples',
    () => {
      const dir = tempDir();
      const run = runCli(
        [
          'profile',
          'meridian.module.js',
          '--chrome',
          join(dir, 'c.json'),
          '--cpu',
          '--cpu-interval',
          '50',
          '--quiet',
        ],
        { cwd: DIR },
      );
      expect(run.status).toBe(0);
      expect(run.stderr).not.toContain('no CPU sample');
      const events = JSON.parse(readFileSync(join(dir, 'c.json'), 'utf8'))
        .traceEvents as { name: string }[];
      expect(events.some((e) => e.name === 'ProfileChunk')).toBe(true);
    },
  );
});
```

Record the drift the Linux CI run reports in the ledger: spec 8 says the docs state an error bar only after this test finds both anchors there.

- [ ] Step 6: Record a real profile for the golden test: run the Meridian fixture with `node --cpu-prof`, keep the `.cpuprofile` in `libs/devtools/test-fixtures/profile/recorded.cpuprofile`, and add a case to `trace-engine.trace.test.ts` that merges it through `toChromeTrace` and finds its samples on pid 1, tid 1 inside the run.

- [ ] Step 7: Run the targets of Task 16 and commit with `feat(cli): sample the CPU and merge it into the Chrome trace`.

---

## Part 4: the canary, the docs and the pull request

### Task 19: the Chrome canary (owner gate (c) 3)

Files:

- Create: `.github/workflows/devtools-trace-canary.yml`, `tools/trace-canary/run.mjs`
- Create: `tools/repo-checks/src/trace-canary-workflow.test.ts`

Interfaces:

- Consumes: `libs/devtools/test-fixtures/profile/chrome-trace.golden.json` and the golden track list of Task 13.

- [ ] Step 1: Write the failing repo-check `trace-canary-workflow.test.ts`. It reads the workflow YAML (parse it the way `benchmarks-workflow.test.ts` does) and asserts: triggers `schedule`, `workflow_dispatch`, and `pull_request` with `paths: ['libs/devtools/src/profile/**']`; one job on `ubuntu-24.04`; job permissions exactly `contents: read` and `issues: write`; every `uses:` pinned to a 40-character SHA; and no `continue-on-error`. The canary is never a required check; the owner keeps branch protection as it is.

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- trace-canary`
Expected: FAIL, the workflow is missing.

- [ ] Step 2: `tools/trace-canary/run.mjs` (Node 24, no dependencies)

```js
#!/usr/bin/env node
// Runs the layer-1 assertions of the profiler's golden test inside the
// DevTools frontend of a real Chrome (startup profiler spec 10.2).
//   node tools/trace-canary/run.mjs <chrome binary>
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [chrome] = process.argv.slice(2);
const golden = readFileSync(
  new URL(
    '../../libs/devtools/test-fixtures/profile/chrome-trace.golden.json',
    import.meta.url,
  ),
  'utf8',
);
const TRACKS = [
  'Runs',
  'Steps',
  'create · level 0',
  'create · level 1',
  'create · level 2',
  'create · level 3',
  'create · onInit',
  'load 1 · level 0',
];
const port = 9333;
const browser = spawn(
  chrome,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'canary-'))}`,
    'about:blank',
  ],
  { stdio: 'inherit' },
);

async function cdp(url) {
  for (let i = 0; i < 50; i++) {
    try {
      return await (await fetch(url, { method: 'PUT' })).json();
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`no DevTools endpoint at ${url}`);
}

const version = await cdp(`http://127.0.0.1:${port}/json/version`);
const target = await cdp(
  `http://127.0.0.1:${port}/json/new?http://127.0.0.1:${port}/devtools/devtools_app.html`,
);
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) =>
  socket.addEventListener('open', resolve, { once: true }),
);
let next = 0;
const send = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++next;
    const onMessage = (message) => {
      const data = JSON.parse(String(message.data));
      if (data.id !== id) return;
      socket.removeEventListener('message', onMessage);
      if (data.error || data.result?.exceptionDetails)
        reject(
          new Error(JSON.stringify(data.error ?? data.result.exceptionDetails)),
        );
      else resolve(data.result);
    };
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });

await new Promise((r) => setTimeout(r, 3000));
const { result } = await send('Runtime.evaluate', {
  awaitPromise: true,
  returnByValue: true,
  expression: `(async () => {
    const Trace = await import('/devtools/models/trace/trace.js');
    const model = Trace.TraceModel.Model.createWithAllHandlers();
    await model.parse(${golden}.traceEvents);
    const data = model.parsedTrace();
    const groups = data.ExtensionTraceData.extensionTrackData;
    return { frame: data.Meta.mainFrameId, groups: groups.map((g) => g.name), tracks: (groups[0]?.tracks ?? []).map((t) => t.name) };
  })()`,
});
browser.kill();
const got = result.value;
const failures = [];
if (got.frame !== 'F1')
  failures.push(`mainFrameId is ${JSON.stringify(got.frame)}, expected "F1"`);
if (JSON.stringify(got.groups) !== JSON.stringify(['NexusDI']))
  failures.push(`groups ${JSON.stringify(got.groups)}`);
if (JSON.stringify(got.tracks) !== JSON.stringify(TRACKS))
  failures.push(`tracks ${JSON.stringify(got.tracks)}`);
console.log(
  `${version.Browser}: ${failures.length === 0 ? 'the NexusDI layout parses' : failures.join('; ')}`,
);
process.exit(failures.length === 0 ? 0 : 1);
```

The frontend's module path and the engine's API names follow Task 13; if Task 13 adjusted a name for the pinned engine, use the same name here.

- [ ] Step 3: The workflow

```yaml
name: devtools trace canary

on:
  schedule:
    - cron: '17 6 * * 1'
  workflow_dispatch:
  pull_request:
    paths:
      - 'libs/devtools/src/profile/**'

permissions: {}

jobs:
  canary:
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      issues: write # open or update one issue when a scheduled run fails
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      # Unpinned on purpose: the canary exists to catch a new Chrome
      # breaking the undocumented layout (owner item (c) 3).
      - id: stable
        run: echo "path=$(npx @puppeteer/browsers install chrome@stable --path "$RUNNER_TEMP/chrome" | tail -1 | cut -d' ' -f2-)" >> "$GITHUB_OUTPUT"
      - id: beta
        run: echo "path=$(npx @puppeteer/browsers install chrome@beta --path "$RUNNER_TEMP/chrome" | tail -1 | cut -d' ' -f2-)" >> "$GITHUB_OUTPUT"
      - run: node tools/trace-canary/run.mjs "${{ steps.stable.outputs.path }}"
      - run: node tools/trace-canary/run.mjs "${{ steps.beta.outputs.path }}"
      - run: |
          npm i --no-save @paulirish/trace_engine@latest
          npx nx run @nexusdi/devtools:test-trace --skip-nx-cache
        env:
          NX_NO_CLOUD: 'true'
          NX_DAEMON: 'false'
      - if: failure() && github.event_name == 'schedule'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh label create devtools-trace --repo "$GITHUB_REPOSITORY" --force --color d93f0b --description 'Chrome trace layout canary'
          body="The devtools trace canary failed on $(date -u +%F): $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
          number=$(gh issue list --repo "$GITHUB_REPOSITORY" --label devtools-trace --state open --json number --jq '.[0].number')
          if [ -n "$number" ]; then gh issue comment "$number" --repo "$GITHUB_REPOSITORY" --body "$body"; else gh issue create --repo "$GITHUB_REPOSITORY" --label devtools-trace --title 'The Chrome trace layout canary fails' --body "$body"; fi
```

The run step prints the Chrome build (`version.Browser`), so the issue's linked run records it.

- [ ] Step 4: Run the check and the canary by hand

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/repo-checks -- trace-canary`, then `node tools/trace-canary/run.mjs "$(npx @puppeteer/browsers install chrome@stable --path /tmp/chrome | tail -1 | cut -d' ' -f2-)"`.
Expected: PASS, and the script prints `<Chrome build>: the NexusDI layout parses`.

- [ ] Step 5: Commit with `ci(devtools): run the Chrome trace layout canary weekly`.

### Task 20: the `/profiling/` page (owner gate (c) 2)

Files:

- Create: `examples/meridian/src/pages/profiling.md`, `apps/docs/content/profiling.mdx`
- Modify: `apps/docs/content/_meta.ts`

Interfaces:

- Consumes: `profile`, `profileTable`, `toChromeTrace`, `criticalPath` (Tasks 8 to 11), `nexusdi profile` (Tasks 15 to 18).

- [ ] Step 1: Load the `docs-page` skill and read `docs/documentation-style-guide.md`. Draft the prose with the repo's gemma docs workflow where the session lists that skill; Claude then checks every fact against `libs/`.

- [ ] Step 2: The regions. `examples/meridian/src/pages/profiling.md` holds, each as an `@import.meta.vitest` block with at least one `// ->` claim that states no time:

1. `in-app`: spec 6.7's example in full (interface-first, `profile()`, `Nexus.create`, `profileTable`), with `StarCharts.download` declared as `declare const StarCharts: { download(c: IShipComputer): Promise<INavCharts> }` and implemented by a resolved promise in the test. Claims: `report.runs.map((r) => r.kind); // -> ['create']` and `report.runs[0].builds.find((b) => b.token === 'NavCharts')?.async; // -> true`.
2. `stalled`: a factory that never settles, `void Nexus.create(...)`, a short wait, then `profiler.report().runs[0].pending.map((p) => p.token); // -> ['NavCharts']`.
3. `critical-path`: `criticalPath(report, 0)?.path.map((p) => p.token)` with a claim on the token list.
4. `download`: the Blob download of `JSON.stringify(toChromeTrace(report))`, in a fence marked to type-check only, as the guide shows for browser-only code.

- [ ] Step 3: The page. Frontmatter `kind: question`, title "How do I find out what slows or stalls startup?", a `requires` line naming `introspection`. Sections in Context, Concept, Detail order (spec 12): what the reader can't see today; `profile()` in an app (region 1); reading the table (sync, await, finish, own, queued; levels as barriers; the critical path and barrier waits, region 3), with any output that shows times taken from region output or the page console only; `nexusdi profile` from the terminal with the spec 9.2 commands; opening the Chrome file (DevTools, Performance, Load profile, Show custom tracks) and the Perfetto file (ui.perfetto.dev); `--cpu`; live mode on Chromium 134 and later, shown with its import line, `import { liveSink } from '@nexusdi/devtools/live';`, and `profile({ live: liveSink() })`; the warning that `--repeat` builds every provider again, side effects included; a stalled startup (region 2 and `--timeout`); live mode draws a run once it settles, so a stalled startup reads through `report()` and `toChromeTrace`; and a reference H2 for `nexusdi profile` with the spec 9.1 synopsis, every flag and the spec 9.5 exit-code table (tech lead ruling 1; check them against `OPTIONS` in `libs/cli/src/args.ts`). End with the next step: `/trace-events/`. Add `profiling` to `_meta.ts` in the Guides band after `graph-cli`.

- [ ] Step 4: Run the docs checks

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck -p @nexusdi/meridian @nexusdi/docs @nexusdi/repo-checks`, then the `docs-page` skill's CI commands.
Expected: PASS, `doc-benchmark-figures` included. Dispatch the `docs-reviewer` agent on the page and fix what it reports.

- [ ] Step 5: Commit with `docs(docs): add the profiling guide`.

### Task 21: the `/trace-events/` page and the introspection note

Files:

- Create: `examples/meridian/src/pages/trace-events.md`, `apps/docs/content/trace-events.mdx`
- Modify: `apps/docs/content/_meta.ts`, `apps/docs/content/introspection.mdx`, `examples/meridian/src/pages/introspection.md` if the new paragraph cites a region

- [ ] Step 1: The regions. `trace-events.md` holds spec 13's third-party profiler as region `third-party` (with `downloadCharts` and `relay` implemented by stubs in the test, and the claim `probe.rows().map((b) => b.token); // -> ['NavCharts', 'SubspaceLink']` ordered by own time, made deterministic with a factory that awaits a 20 ms timer), and a region `order` that records the events of a create with one async factory and pins `events.map((e) => e.type); // -> ['compile', 'construct:await', 'construct', 'run']`.

- [ ] Step 2: The page, `kind: contract`, title "What the trace events promise", in the Guides band after `profiling`. It holds spec 12's eleven items, in that order: every core event with every field, its type, its tier and what it measures (spec 3.2's table, extended to the rc.0 events); the clock and its mapping to Chrome µs and to an OpenTelemetry start through `performance.timeOrigin`; the contract text of spec 5.1 and the guidance under it, verbatim; the order guarantees of 3.4; what `level` indexes per run kind and that levels are barriers; `parent` and nesting; the step derivation of 7.2, whose static step reads "value and alias providers (and options schemas): the `construct` events with `lifetime: null` and no level"; where the graph comes from (`context.blueprint().edges` in `setup`, and `EdgeView.ordersBuild` and `ProviderView.inline`, which a critical path reads); the third-party region; how devtools draws the Chrome file, with the warning that the layout is Chrome's undocumented format and a link to `libs/devtools/src/profile/trace-engine.trace.test.ts`; namespacing a package's own events and `PluginContext.emit`. Check every field against `libs/core/src/runtime/trace.ts` after Task 7.

- [ ] Step 3: `introspection.mdx`: add one paragraph to the trace section: events carry `startMs` and a run id, and `/profiling/` shows how to read them.

- [ ] Step 4: Run the docs checks of Task 20, Step 4, dispatch `docs-reviewer` on both pages, and commit with `docs(docs): document the trace event contract`.

### Task 22: reference entries for the devtools exports

Tech lead ruling 1 placed them. `nexusdi profile` is documented on `/profiling/` (Task 20); there is no `/api-cli/`.

- [ ] Step 1: Check whether `apps/docs/content/api-devtools.mdx` exists on the current `origin/release/0.4`.
- [ ] Step 2: If it exists, add one H2 per new export (`profile`, `profileStartup`, `profileTable`, `criticalPath`, `toChromeTrace`, `toPerfettoTrace`, `parseProfileReport`, and the exported types), each with the `<!-- reference @nexusdi/devtools#<name> -->` directive and a cited region in `examples/meridian/src/pages/api-devtools.md`. If it is absent, create it as docs spec page 38: `kind: reference`, title `@nexusdi/devtools`, one H2 per export of `@nexusdi/devtools`, the existing ones (`devtools`, `graph`, `inspect`, `trace`, `toDot`, `toMermaid`, `parseGraph`) included, each with the directive and an executed region (reference pages need one per callable export), and an `api-devtools` entry in `_meta.ts` after `api-errors`. Reuse the regions `/introspection/` and `/graph-cli/` already cite where they fit.
- [ ] Step 3: Run the checks of Task 20, Step 4, including `doc-reference`, dispatch `docs-reviewer`, and commit with `docs(docs): add the devtools reference`.

### Task 23: the whole branch

- [ ] Step 1: Rebase `feat/startup-profiler` onto the current `origin/release/0.4` with `NX_NO_CLOUD=true NX_DAEMON=false git rebase origin/release/0.4`.

- [ ] Step 2: Run everything the pull request's CI runs

Run: `NX_NO_CLOUD=true NX_DAEMON=false npx nx run-many -t lint test build typecheck && npx fallow dead-code --fail-on-issues && npx fallow dupes && npm run check:type-floor && NX_NO_CLOUD=true NX_DAEMON=false npx nx run @nexusdi/core:bench-dispatch && npm run size`
Expected: PASS; every K14 case `pass`.

- [ ] Step 3: An independent opus reviewer reviews the whole branch against the spec and this plan's Review Focus. Fix rounds until it is satisfied.

- [ ] Step 4: Push and open the pull request against `release/0.4`. The body carries: a `## Size` section with core's measured growth over rc.1 and the `devtools` and `devtools+profile` figures; the owner gates of this plan with their state; the behaviour notes (`init` for on-demand singletons; the compile-failure change); a "Trace changes for observers" section listing the new events (`run` closing every `create`, `load`, `createScope` and `extend()`; `construct:await` and `init:await` in async startups; `construct:failed` and `init:failed`), a separate line that the existing `init` event now also fires for an `eager: false` singleton with `onInit`, after its `construct`, which rc builds did not report, and that `init` carries the build-event fields (`run`, `level`, `module`, the sync and await split), the two view fields `EdgeView.ordersBuild` and `ProviderView.inline`, and the advice to filter by `event.type` and assert subsequences, never a full event list; and the tech lead rulings of 2026-10-14. Put the same "Trace changes for observers" line in the release notes of the next rc.

---

## Self-review notes

- Spec coverage: 3.1 and 3.2 (Tasks 1, 2, 4, 5, 6), 3.3 (Tasks 2, 4), 3.4 (Tasks 2, 7), 3.5 (Tasks 2, 3, 5, 6), 3.6 (Tasks 4, 5), 4 and 11.1 (Tasks 4, 7, 23), 5.1 to 5.3 (Task 7), 6.1 to 6.6 (Tasks 8, 10, 11), 6.7 (Task 20), 7.1 to 7.5 (Tasks 9, 11, 12, 16), 8 (Task 18), 9 (Tasks 15 to 18), 10.1 (Task 13), 10.2 (Task 19), 10.3 (Tasks 1 to 18), 11.2 (Task 14), 12 (Tasks 2, 8, 10, 20, 21, 22), 13 (Tasks 7, 21), 15 (file map).
- Not in this plan: spec 14's amendments to the core, graph CLI and docs specs. Those specs live on `benchmarks-launch-work` and `spec/package-owned-errors`; amend them in the same pull request as Task 23 only if they are on `release/0.4` by then, else note the amendments in the pull request body.
- Plan choice 9: `ProfileReport.reportedMs` and `graph.root` are now in spec 6.2 (tech lead ruling 2).
- Spec 3.7 (view fields) is Task 7, Step 5.
