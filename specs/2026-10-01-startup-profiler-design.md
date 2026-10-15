# Startup profiler (`profile()` and `nexusdi profile`)

Status: draft, 2026-10-01. The architect's proposal with the tech lead's rulings applied,
and the tech lead's rulings of 2026-10-14 (listed in the plan) applied on 2026-10-14.
The owner approved every decision in section 17 on 2026-10-14.
Branch: `spec/startup-profiler`, cut from `origin/release/0.4` at 0.4.0-rc.0 and rebased onto
0.4.0-rc.1 (published 2026-10-08).
Depends on:

- 0.4.0-rc.0 on `release/0.4`: the `Tracer`, `observe`, `TraceEventByType`, `trace()` and
  `context.blueprint()`. Published.
- The graph CLI spec (`specs/2026-09-29-graph-cli-design.md`). Complete: `libs/cli` is on
  `release/0.4`, and this spec adds a second command to its bin.
- Extension principle V2 (`specs/2026-09-30-extension-principle-design.md` on
  `spec/package-owned-errors`): augmentable `TraceEventByType` and `PluginContext.emit`.
  Merged: `libs/core/src/runtime/plugins.ts:59`, and devtools re-exports
  `TraceEventByType` from `libs/devtools/src/index.ts`.
- Benchmarks spec section 14.6 (K14). The harness is on `release/0.4`:
  `libs/core/bench/completeness.test.ts` and the `bench-dispatch` target of `@nexusdi/core`.

Amends: core spec (`specs/2026-09-23-core-0.4-design.md`, on `benchmarks-launch-work`)
sections 10.2 and 3.10.5; graph CLI spec section 3; docs spec
(`specs/2026-09-23-docs-site-design.md`, on `benchmarks-launch-work`) section 4.3. Core spec
3.10.2, extension principle 2.5.11 and benchmarks spec 14.6 stay as they are.

Inputs: `profiler-research.md` (Chrome DevTools, Perfetto, prior art, overhead),
`perf-report.md` (where 0.4 startup time goes), the architect's proposal and prototype
(`scratchpad/profiler-design/proto/`), and the tech lead's rulings with measurements
(`proto/tl3` to `proto/tl7`).

## 1. Problem and what 0.4 has today

A user whose app starts slowly, or never finishes starting, has no way to see which
provider is responsible. The question is sharpest for async startup, the 0.4 flagship: an
async factory that waits on a network call holds back every later level, and an async
`onInit` that never settles leaves `Nexus.create` pending with no error.

0.4.0-rc.0 has the parts a profiler would build on. It has no profiler:

- `Tracer` (`libs/core/src/runtime/trace.ts`) hands events to every `observe` hook. With no
  observer, `now()` reads no clock and `emit()` runs one length test and builds nothing.
- `TraceEventByType` holds `compile`, `construct`, `untracked`, `init`, `scope:create`,
  `scope:extend`, `scope:dispose`, `dispose:instance` and `dispose`. Each timed event
  carries `durationMs` only. A package adds its own event types by augmentation, keyed
  `<package>/<event>`, and emits them through `PluginContext.emit`.
- `@nexusdi/devtools` exports `trace(fn)`, a plugin whose only hook passes every event to
  `fn`, plus `devtools()`, `graph()`, `inspect()`, `toDot()`, `toMermaid()` and
  `parseGraph()`.
- `@nexusdi/cli` has one command, `nexusdi graph`.

What a profiler cannot get from these events today (research section 6):

1. A start time. Every event fires at its end with `durationMs` only. A sink cannot
   subtract `durationMs` from its receipt time reliably, since every observer ahead of it
   delays receipt.
2. The split between the CPU work of a factory and the wait on its promise.
   `construct.durationMs` mixes the synchronous call, the await, options validation and
   `construct` hooks.
3. The level a provider was built in. `bp.singletonLevels` and `scopedLevels` exist, and
   neither the events nor the view expose them.
4. Run boundaries. Nothing marks the start or end of a `create`, `load`, `createScope` or
   `extend()`, so a sink cannot group events per operation or see a failure that names no
   provider.
5. An `init` event for on-demand singletons. `buildOnDemand` calls `onInit` and emits
   nothing.
6. A failed construct or a failed `onInit`. A trace of a failing startup ends without the
   culprit.
7. Anything for a provider that hangs. Events fire at the end, and a hung factory has no
   end.

This spec adds the missing events and fields to core, a `profile()` plugin and its
formatters to `@nexusdi/devtools`, and a `nexusdi profile` command to `@nexusdi/cli`.

## 2. Placement

| Package             | Adds                                                                                                                                       | Runs in     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `@nexusdi/core`     | event fields and event types (section 3); no profiling logic                                                                               | any runtime |
| `@nexusdi/devtools` | `profile()`, `profileStartup()`, `profileTable()`, `criticalPath()`, `toChromeTrace()`, `toPerfettoTrace()`, `parseProfileReport()`, types | any runtime |
| `@nexusdi/cli`      | `nexusdi profile`, CPU sampling through `node:inspector`, clock alignment                                                                  | Node only   |
| repo                | `examples/size/src/devtools-profile.ts`, `.github/workflows/devtools-trace-canary.yml`, the `test-trace` target of `@nexusdi/devtools`     | CI          |

Core only reports. devtools imports nothing from `node:`, and a devtools test fails on any
`node:` specifier under `libs/devtools/src` outside tests. Everything devtools reads from
core is public (section 13).

## 3. Core trace events

### 3.1 The `TraceEventByType` diff

Against `libs/core/src/runtime/trace.ts` at 0.4.0-rc.0. `untracked` and `dispose:instance`
do not change.

```diff
+/** The operation a run is. May gain a member in a minor release; handle an unknown kind. */
+export type RunKind = 'create' | 'load' | 'createScope' | 'extend';
+
+/**
+ * The fields of every build event: construct, construct:await and
+ * construct:failed for a constructor or factory, and init, init:await and
+ * init:failed for an onInit call. One literal in core builds all six.
+ */
+interface BuildEventFields {
+  token: string;
+  providerId: string;
+  module: string;
+  /** null for value and alias providers. */
+  lifetime: Lifetime | null;
+  scope: string | null;
+  /** Whether the call returned a thenable. */
+  async: boolean;
+  run: number | null;
+  level: number | null;
+  parent: string | null;
+  startMs: number;
+  /** From the call until it returned or threw, nested builds included. */
+  syncMs: number;
+  /** From that return until the thenable settled or the build failed; null when the call returned no thenable. */
+  awaitMs: number | null;
+  /** From the build resuming until the instance was stored or the build failed: options validation and construct hooks. 0 on init events. */
+  finishMs: number;
+  /** Wall time from the call to the event, time queued behind the level's other providers included. */
+  durationMs: number;
+}
+
 export interface TraceEventByType {
   compile: {
     phase: 'create' | 'load' | 'check';
     modules: number;
     providers: number;
     errors: number;
+    /** The run this compile starts; null for Nexus.check. */
+    run: number | null;
+    startMs: number;
     durationMs: number;
   };
-  construct: {
-    token: string;
-    providerId: string;
-    module: string;
-    /** null for value and alias providers. */
-    lifetime: Lifetime | null;
-    scope: string | null;
-    async: boolean;
-    durationMs: number;
-  };
+  /** A build stored its instance. */
+  construct: BuildEventFields;
+  /** A factory returned a thenable; core now awaits it. The build ends with construct or construct:failed. */
+  'construct:await': BuildEventFields;
+  /** A build failed between the constructor or factory call and the store. */
+  'construct:failed': BuildEventFields;
   untracked: { token: string; providerId: string; reason: 'root-transient' | 'singleton-thunk' };
-  init: { token: string; providerId: string; durationMs: number };
+  /** A singleton's onInit settled. */
+  init: BuildEventFields;
+  /** onInit returned a thenable; core now awaits it. Ends with init or init:failed. */
+  'init:await': BuildEventFields;
+  /** onInit threw or rejected, or an on-demand build refused its thenable (NEXUS_LAZY_ASYNC). */
+  'init:failed': BuildEventFields;
+  run: {
+    run: number;
+    kind: RunKind;
+    /** The scope for createScope and extend(); null at the root. */
+    scope: string | null;
+    ok: boolean;
+    startMs: number;
+    durationMs: number;
+  };
-  'scope:create': { scope: string; built: number; durationMs: number };
+  'scope:create': { scope: string; built: number; run: number; startMs: number; durationMs: number };
-  'scope:extend': { scope: string; modules: string[]; built: number; durationMs: number };
+  'scope:extend': { scope: string; modules: string[]; built: number; run: number; startMs: number; durationMs: number };
-  'scope:dispose': { scope: string; disposed: number; errors: number; durationMs: number };
+  'scope:dispose': { scope: string; disposed: number; errors: number; startMs: number; durationMs: number };
   'dispose:instance': { token: string; providerId: string; scope: string | null };
-  dispose: { disposed: number; errors: number; durationMs: number };
+  dispose: { disposed: number; errors: number; startMs: number; durationMs: number };
 }
```

`RunKind` is a new export of `@nexusdi/core`. `BuildEventFields` is not exported; plugins
read it through `TraceEvent<'construct'>` and the other five types. No field is removed or
renamed, and no existing field changes type or meaning. `construct.durationMs` keeps the
rc.0 value: the wall span from the factory call to the store. `init` gains `module`,
`lifetime`, `scope`, `parent` and `finishMs` from the shared shape at no byte cost, which
replaces the rejected `init.module` of section 16.

The six build events share one shape so core builds them from one literal (section 3.6).
Each field means the same on every one of them, read up to the moment the event fires:

- On an `:await` event the span ends at the emit, so `awaitMs` and `finishMs` read 0 or
  close to it, and `durationMs` is about `syncMs`.
- On a `:failed` event the times run to the failure: `syncMs` to the return or the throw,
  `awaitMs` (async calls only) to the rejection or the resume, `finishMs` from the resume
  to the throw, 0 when the build failed before it resumed.
- On `init*`, `lifetime` is `'singleton'`, `scope` is `null` and `finishMs` is 0.

### 3.2 Fields

Every time field is in milliseconds of `performance.now()` in the realm that emitted the
event, with the fraction the runtime gives. Browsers coarsen `performance.now()` (Chrome to
100 µs on a page without cross-origin isolation), so a short provider can read 0 in a
browser. The tier column refers to section 5.2.

| Field        | On                                                                      | Meaning                                                                                                                                                                                                                                                                                                         | Tier                                         |
| ------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `run`        | `compile`, `construct*`, `init*`, `run`, `scope:create`, `scope:extend` | The run id. Unique within one container; `create` is run 0; `load`, `createScope` and `extend()` each take the next id from one counter on the root. `null` on `compile` for `Nexus.check`, and on builds no run scheduled (section 3.3).                                                                       | stable                                       |
| `kind`       | `run`                                                                   | The operation: `create`, `load`, `createScope`, `extend`. A minor release may add a member.                                                                                                                                                                                                                     | stable (the union is open to core additions) |
| `ok`         | `run`                                                                   | `true` when the operation settled with a value, `false` when it threw or was aborted by disposal. An `extend()` that shares an in-flight `extend()` to the same blueprint reports the shared work's outcome.                                                                                                    | stable                                       |
| `level`      | the six build events                                                    | The index into the levels array of the blueprint the run built (section 3.3). `null` for on-demand, transient, value and alias builds.                                                                                                                                                                          | presence and type stable; numbering evolving |
| `parent`     | the six build events                                                    | The provider id whose constructor or factory this build ran inside, or `null`. Read from the construction stack when the event fires.                                                                                                                                                                           | stable                                       |
| `startMs`    | every event with `durationMs`, and both `:await` events                 | When the span began. For `construct*` and `init*`, the moment core called the constructor, factory or `onInit`. For `run`, the call: right after plugin registration for `create`, and the call itself for `load`, `createScope` and `extend()`, so the span includes time queued behind earlier calls.         | stable                                       |
| `durationMs` | as in rc.0, plus the new events                                         | The wall span. The event's span is `[startMs, startMs + durationMs]`. For `construct`, the call to the store, with time queued behind level siblings included.                                                                                                                                                  | stable                                       |
| `syncMs`     | the six build events                                                    | From the call until it returned. Nested builds and property injection run inside it.                                                                                                                                                                                                                            | stable                                       |
| `awaitMs`    | the six build events                                                    | From that return until the returned promise settled. `null` when no thenable came back.                                                                                                                                                                                                                         | stable                                       |
| `finishMs`   | the six build events                                                    | From the build resuming until the instance was stored. Today that covers options validation and `construct` hooks.                                                                                                                                                                                              | field stable; the work it covers evolving    |
| `async`      | the six build events                                                    | The call returned a thenable, on every build event. `construct`: as rc.0. `construct:failed`: the factory returned one, and then it rejected, an on-demand build refused it (`NEXUS_LAZY_ASYNC`), or a later step threw. `init:failed`: `onInit` returned one that rejected or that an on-demand build refused. | stable                                       |

Derived values every consumer can compute, and that devtools uses:

- own time: `syncMs + (awaitMs ?? 0) + finishMs`, the time the provider itself took.
- queued time: `durationMs - own`. `settleLevel` calls every `buildOne` of a level
  synchronously before any of them resumes, so a sync provider waits for each later
  sibling's constructor before its store runs. For a sync provider, that wait
  is the span from `startMs + syncMs` to `startMs + syncMs + queued`.

### 3.3 Run ids and levels

`RootState` gains `nextRun`, starting at 0. `Run` (`libs/core/src/runtime/state.ts`) gains
`id`. Scopes draw ids from the root's counter. `Nexus.check` takes no id.

Every call of `load`, `createScope` and `extend()` is a run, a call that does no work
included. A `load()` of a module the root already imports emits `run` with `ok: true` and no
`compile`. A `load()` that throws `NEXUS_INVALID_MODULE` before it compiles emits `run` with
`ok: false` and no `compile`. An `extend()` whose target is the pinned blueprint emits `run`
with `ok: true` and no builds.

A build gets its run this way:

- A level build receives the run id and the level index as parameters: `buildLevels`
  passes the level index to `buildOne(id, level)`.
- An on-demand build of a provider new in the active run reads the container's active
  `Run` (`root.run?.id`, `scope.run?.id`) inside `make`.
- A value or alias provider's `construct` carries the id of the run that registered it,
  with `level: null` and a zero span at the emit.
- Every other build carries `run: null`: a transient, and an on-demand build outside any
  run. A transient or nested build names its enclosing build in `parent`, and its time is
  inside that build's `syncMs`.

What `level` indexes, per caller of `buildLevels`:

| Caller                             | Levels it walks                                  | `level` on its events                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create` (`startBlueprint`)        | `bp.singletonLevels`, every id                   | index into that array                                                                                                                                                               |
| `load` (`startBlueprint`)          | the new blueprint's `singletonLevels`, new ids   | index into the new blueprint's array, so a loaded provider that depends on a level-3 singleton is level 4 though it builds in the first wave; numbers start above 0 and skip values |
| onInit pass (`runInit`)            | the array of the build it follows                | the same index as its `construct`                                                                                                                                                   |
| `createScope` (`openScope`)        | `scope.blueprint.scopedLevels`                   | index into it                                                                                                                                                                       |
| `extend()`                         | the target's `scopedLevels`, delta plus deferred | index into the target's array                                                                                                                                                       |
| on-demand, transient, value, alias | none                                             | `null`                                                                                                                                                                              |

Levels are barriers: level k+1 starts after every provider of level k settled. A level's
span is `min(startMs)` to `max(startMs + durationMs)` of its `construct` events, so core
emits no level event and `BlueprintView` gains no `levels` field.

### 3.4 Emission and order

Each event is emitted once, when its span ends, with two exceptions: `construct:await` and
`init:await` fire at the moment core starts awaiting a thenable. Core hands every event to
observers synchronously.

Order within one run:

1. `compile` (`create` and `load` only).
2. `construct:await` events as factories return thenables.
3. `construct` and `construct:failed` in settle order, which differs from start order.
4. `init:await`, `init` and `init:failed`.
5. `scope:create` or `scope:extend` for those run kinds.
6. `run`, last.

A failed run's `construct:failed` comes before its rollback's `dispose:instance` events.
A run that settles ends with exactly one `run` event. A run that never settles has no
`run` event, and its in-flight set is exact: every `:await` event whose provider has no
later `construct`, `construct:failed`, `init` or `init:failed` in that run.
`profiler.report()` in an app and the CLI's `--timeout` both read this set.

Which sites emit what:

- `construct:failed` is emitted from level builds and on-demand builds. Transient builds
  on the `get()` path get no try/catch; a transient's failure shows through its parent's
  `construct:failed`.
- An observer's throw on `construct:await` or `init:await` fails that build: core emits
  the matching `:failed` event, and the build fails with the observer's throw.
- `init` is emitted from `buildOnDemand` as well, with `level: null`, and `init:failed` on
  a throw there. rc.0 builds on-demand singletons with `onInit` and emits nothing.
- On-demand and transient builds report a real `syncMs`. The transient path reads the clock
  once more after the construct call, inside the existing `root.buildHooks` guard.

### 3.5 Observer throws on failure paths

The operation's own error always reaches the caller.

- On a runtime failure path (`construct:failed`, `init:failed`, and `run` with `ok: false`
  after `create`, `load`, `createScope` or `extend()` failed), core catches an observer's
  throw and appends it to the run's errors. The thrown `ProviderError` carries it in
  `disposalErrors`, after the disposer errors. Rollback already puts observer throws from
  `dispose:instance` there.
- An observer's throw on `construct:await` or `init:await` is a failure of that build
  (section 3.4). The run fails with it as the cause, after its `:failed` event.
- An observer's throw on the `construct` or `init` event of an on-demand build reaches
  the caller of `get()` after the build finished: the instance is settled, its `onInit`
  ran, and the next `get()` returns it.
- On a compile failure (`BlueprintError`, `LoadError`), `compileTraced` drops the
  observer's throw. Those errors have no list to hold it.
- On a success path, an observer's throw on the closing `run` event rejects the call:
  - `create` returns no container, so core abandons the root (disposes what it built and
    runs the started plugins' dispose hooks) and rejects with a `ProviderError` (token
    `startup`) whose `cause` is the observer's throw and whose `disposalErrors` hold the
    disposer errors.
  - `load()` keeps the module it committed and rejects with the same `ProviderError`
    shape, as a throw on its `compile` event does. A retry of that `load()` is a no-op
    run with `ok: true`.
  - `createScope` and `extend()` keep the scope they built or extended, and the
    observer's throw reaches the caller as core spec 3.10.5 states. So does a throw on any
    other event of a success path.
- On an on-demand build outside any run (a `get()` after startup), core drops the
  observer's throw on `construct:failed` and `init:failed`, and `get()` throws its own
  error. No run holds a list for it. If the owner rejects item (b) 2, this case follows the
  owner's rule for compile failures.

This changes rc.0 behaviour on compile failure. See owner item (b) 2.

### 3.6 Core implementation rules

- One function, `traceBuild(type, container, bp, id, run, level, isAsync, start?,
returned?, resumed?)` in `libs/core/src/runtime/build.ts`, emits all six build events
  from one literal. Inside `make` it looks up the record, reads the module name, the
  parent from the construction stack and the end time, and computes `syncMs`, `awaitMs`,
  `finishMs` and `durationMs` from the three times it received. A value or alias provider
  passes no times. `traceConstruct`, `traceFailed`, `traceInit` and `traceInitFailed`
  do not exist.
- `buildInto` owns a level build from the call to the store, for root singletons and
  scoped providers alike; `buildSingleton`, `buildScoped`, `Built` and `store` go. One
  `try/catch` around the call, the await, options validation and construct hooks emits
  `construct:failed` for any failure. `validateOptions` moves to `build.ts`.
- No per-build timing object and no `Ctx` field. `lookup.ts` allocates a `Ctx` per
  `get()`, and K14's get-2000 case already sits near its bound.
- Clock reads per level build with an observer: at the call, after it returns, on resume,
  and inside `make`. `awaitMs` is `resumed - returned`, computed in `make`. Each read is
  `tracer.now()`.
- `traceBuild` rethrows an observer's throw on a non-failure event, and on a `:failed`
  event appends it to `run.errors`, or drops it outside a run. `RunTrace.errors` is
  optional and created on first use.
- `emitCollecting(tracer, errors, make)` appends an observer's throw to `errors`; with no
  list it rethrows, as a success path does. A failure with no list to hold the throw,
  such as `compileTraced`'s, passes `[]`.
- No `input.clock` on `compile()`, no `Tracer.on` getter, no change to `SITE_CONDITIONS`.

### 3.7 Two view fields for build order

The critical path (section 7.2) and the Perfetto flow arrows (7.4) need two facts that only
core's level algorithm knows: which edges order a build, and which providers have no level
of their own. A copy of that rule in devtools breaks P4, and a compare on `edge.kind` or
`lifetime` in devtools reads core's vocabulary by string (P1). Core states both facts on the
view, a contribution point P3 names and core spec 3.10.2 classes as an addition:

```diff
 export interface EdgeView {
   readonly from: string;
   readonly to: string;
   readonly kind: 'required' | 'optional' | 'lazy' | 'all' | 'alias';
+  /** True when core builds the target before the dependent: every kind but lazy today. Cycles count these edges only. */
+  readonly ordersBuild: boolean;
   readonly written: AnyToken;
 }

 export interface ProviderView {
   ...
+  /**
+   * True when the provider has no build level of its own: a transient, which each dependent
+   * builds inside its own build, or an alias, which resolves to its target. Core counts an
+   * inline provider's ordering edges as its dependents' edges.
+   */
+  readonly inline: boolean;
 }
```

Core computes both from two internal helpers in `libs/core/src/blueprint/`:
`ordersBuild(kind)`, which compile pass 4 (`compile.ts`, today `kind !== 'lazy'`) calls,
and `isInline(record)`, which `levels.ts` calls in `levelFunction` and `collectReached`
(today two copies of `lifetime === 'transient' || kind === 'alias'`). `buildView` and
`providerView` call the same helpers, so the view and the algorithm cannot drift. Neither
helper is exported from `@nexusdi/core`. The fields cost a few bytes inside view
construction, which runs only when a plugin asks for a view.

`ProfileReport.graph` copies both fields (section 6.2), so a report re-rendered later, by
another devtools version, keeps the rule of the core that recorded it.

## 4. K14 and core bytes

K14 (benchmarks spec 14.6) bounds what hook sites add with no plugin registered.

- No new hook-site condition. Every new clock read is `tracer.now()`, which tests
  `HOOK_SITES && #sinks.length > 0`. Every new event goes through `tracer.emit(make)`.
  `SITE_CONDITIONS` in `libs/core/bench/completeness.test.ts` is unchanged.
- The off path keeps its shape. With no observer, each added `tracer.now()` is the
  existing length test and returns 0, `make` never runs, and nothing new is allocated.
  The only unguarded new work is one counter increment per run.
- The transient path's extra clock read sits inside the existing `root.buildHooks` guard.
- `bench-dispatch` must pass on the pull request.

Bytes, measured by the tech lead on the size fixture (`examples/size/src/core.ts`, esbuild
`--bundle --minify --format=esm`, gzip 9, core from source):

| Build                                                                        | gzip B | Delta |
| ---------------------------------------------------------------------------- | ------ | ----- |
| base, 0.4.0-rc.0                                                             | 18,541 |       |
| architect's full set                                                         | 19,321 | +780  |
| full set plus both `:await` events and `finishMs`                            | 19,402 | +861  |
| this spec: the above minus `step` events, `compile.passes` and `init.module` | 19,214 | +673  |
| this spec minus every `init` change                                          | 19,051 | +510  |

Marginal bytes inside this spec's set: the two `:await` events 75 B, `startMs` on every
event 24 B, the `run` event 113 B, all `init` changes 163 B, wall `durationMs` plus
`finishMs` against the architect's queue-free `durationMs` 6 B.

The implemented design (section 3.6, the size pass of 2026-10-14) measures 19,271 B against
18,529 B for 0.4.0-rc.1 by the same method, +742 B (+4.0%). Its marginal bytes, each measured
by removing one feature: the `:failed` events 56 B, on-demand `init` 32 B, the two `:await`
events 26 B, the new fields of a level build's `init` event 21 B, the level index 21 B,
`parent` 13 B, the transient path's extra clock read 10 B, `finishMs` 9 B, the two view
fields 8 B.

+742 B is over the 2% `coreGrowthPercent` of `scripts/size-compare.mjs`, so the pull request
carries a `## Size` section. The owner approved it on 2026-10-14 (owner item (a) 1).

The table predates 0.4.0-rc.1. The rc.1 perf work (sparse visibility, provider records built
as one literal) moved the same fixture to 18,516 B with the `gzip -9` command line, 26 B under
rc.0. The deltas were measured on rc.0, and the profiler pull request's size report gives
the figures against rc.1.

The architect's prototype with an array observer measured a 200-provider create at -0.1%
and +1.8% against base in two runs, inside the ±5% run-to-run noise of that machine. K14
is the gate.

## 5. Public contract

### 5.1 Text for `/trace-events/` and the `TraceEventByType` TSDoc

This is the text as the docs page and the TSDoc will carry it:

> Core may add event types and fields in any minor release. An observer ignores what it
> does not know. These rules hold across a release line. Every core event with
> `durationMs` also has `startMs`, both in milliseconds of `performance.now()` in the realm
> that emitted it. The event's span is `[startMs, startMs + durationMs]` in wall time, and
> core hands the event to observers synchronously when that span ends. A package that adds
> a timed event of its own should give it `startMs` with the same meaning. Run ids are unique
> within one container, and `create` is run 0. A run that settles ends with exactly one
> `run` event, after every other event of that run. Level numbers, and which work
> `finishMs` covers beyond options validation and construct hooks, describe how core works
> today and may change in a minor release.

The page follows it with this guidance for profiler authors:

> Read the fields this page marks stable. Treat a level number as a label for one run:
> compare levels within a run, and never store one to compare with a later release. Handle
> an event type or a `kind` you do not know with a default branch. When core changes a
> stable field in a way that breaks your code, `NEXUS_PLUGIN_API` goes up.

### 5.2 Tiers

Stable, part of plugin API 1:

- Event types `compile`, `construct`, `construct:await`, `construct:failed`, `init`,
  `init:await`, `init:failed`, `run`, and the rc.0 types.
- Fields `type`, `run`, `kind`, `ok`, `scope`, `token`, `providerId`, `module`,
  `lifetime`, `async`, `parent`, `level` (presence and type), `startMs`, `durationMs`,
  `syncMs`, `awaitMs`, `finishMs`.
- The field types, and the contract text of 5.1.

Evolving, documented on `/trace-events/` and in `@remarks` TSDoc, and changed without a
version raise:

- Level numbering.
- Which work `finishMs` covers beyond options validation and construct hooks.

Perf-report items 4 (sync build) and 5 (one-pass levels) may change level numbers and what
sits in `finishMs`. The evolving tier exists for them.

### 5.3 Plugin API version

`NEXUS_PLUGIN_API` stays 1. Every change is a new `TraceEventByType` key or a new field,
which core spec 3.10.2 and extension principle 2.5.11 classify as additions.
`libs/devtools/src/plugin-api-1.test-d.ts` gains a third-party profiler fragment that reads
every stable field, so a rename fails type-checking.

`RunKind` is a closed union, which P2 allows because only core adds members. Its TSDoc says
it may gain a member in a minor release. devtools handles an unknown `kind` and an unknown
event type with a default branch, and a devtools test feeds both through `profile()`.

## 6. devtools: `profile()`

### 6.1 API

```ts
// @nexusdi/devtools
import type { NexusPlugin, RootRef, ModuleRef } from '@nexusdi/core';

export interface ProfileOptions {
  /** Draws each run as it closes; pass liveSink() from @nexusdi/devtools/live. Default: no drawing. */
  readonly live?: LiveSink;
  /** Record createScope() and extend() runs as well. Default false: create and load only. */
  readonly scopes?: boolean;
  /** Runs kept; the oldest goes first and counts in report().dropped. Default 1000. */
  readonly maxRuns?: number;
}

/** Draws one run as it closes. */
export type LiveSink = (run: ProfileRun, graph: ProfileReport['graph']) => void;

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

export function profile(options?: ProfileOptions): Profiler;

// @nexusdi/devtools/live, a subpath of its own: an app that never imports it
// ships none of the live drawing code.
/** undefined outside Chromium 134 and later, where console.timeStamp draws nothing. */
export function liveSink(options?: {
  /** The DevTools track group the spans go in. Default 'NexusDI'. */
  readonly trackGroup?: string;
}): LiveSink | undefined;

/** create with a profiler, each load in order, then disposal. */
export function profileStartup(
  root: RootRef,
  options?: {
    readonly plugins?: readonly NexusPlugin[];
    readonly load?: readonly ModuleRef[];
    /** Pass one to read report() while the run is still going, as the CLI's --timeout does. */
    readonly profiler?: Profiler;
  },
): Promise<ProfileReport>;

/** Steps, slowest providers, levels and the critical path. Several reports: the first as cold, the rest as warm medians. */
export function profileTable(
  report: ProfileReport | readonly ProfileReport[],
  options?: { readonly run?: number; readonly top?: number },
): string;

/** null when the report has no graph (no create reached setup). */
export function criticalPath(
  report: ProfileReport,
  run: number,
): CriticalPath | null;

export function toChromeTrace(
  report: ProfileReport,
  options?: {
    readonly cpuProfile?: {
      readonly profile: CpuProfile;
      readonly offsetMs: number;
    };
    readonly trackGroup?: string;
  },
): TraceFile;

export function toPerfettoTrace(report: ProfileReport): TraceFile;

/** Throws NEXUS_DEVTOOLS_PROFILE_INVALID with the path of the first bad field. */
export function parseProfileReport(value: unknown): ProfileReport;
```

`profileStartup` resolves with the report after disposal. When `create` or a `load`
throws, it disposes what was built and rejects with that error; the profiler passed in
still holds the partial report. It uses `Nexus.create` from devtools' own copy of core,
which graph CLI spec section 4.3 makes the project's copy.

### 6.2 The report

```ts
import type { Lifetime, RunKind } from '@nexusdi/core';

export interface ProfileReport {
  readonly format: 'nexusdi-profile';
  readonly version: 1;
  /** performance.timeOrigin of the realm that recorded it. */
  readonly timeOrigin: number;
  /** performance.now() when report() ran; a pending span ends here. */
  readonly reportedMs: number;
  readonly runs: readonly ProfileRun[];
  /** From context.blueprint() at report time; null when no create reached setup. */
  readonly graph: {
    /** The root module's name, looked up in view.modules by BlueprintView.root. */
    readonly root: string;
    readonly providers: readonly {
      readonly id: string;
      readonly token: string;
      readonly module: string;
      readonly lifetime: string | null;
      readonly kind: string;
      /** ProviderView.inline (section 3.7). */
      readonly inline: boolean;
    }[];
    readonly edges: readonly {
      readonly from: string;
      readonly to: string;
      readonly kind: string;
      /** EdgeView.ordersBuild (section 3.7). */
      readonly ordersBuild: boolean;
    }[];
  } | null;
  readonly dropped: number;
  readonly dispose: {
    readonly startMs: number;
    readonly durationMs: number;
    readonly errors: number;
  } | null;
  /**
   * Where the report was recorded: the Node and @nexusdi/core versions. profile() writes
   * none; nexusdi profile adds it to every report it records. Optional, so a report from
   * profile() in an app parses. core is "(unresolved)" when the entry reached no core.
   */
  readonly environment?: {
    readonly node: string;
    readonly core: string;
  };
}

export interface ProfileRun {
  readonly id: number;
  /**
   * Typed as core's RunKind. parseProfileReport accepts any string here, so
   * a report from a newer core keeps a kind this union lacks, and a reader
   * handles one with a default branch.
   */
  readonly kind: RunKind;
  readonly scope: string | null;
  /** null while the run is open. */
  readonly ok: boolean | null;
  readonly startMs: number;
  /** null while the run is open. */
  readonly durationMs: number | null;
  readonly compile: {
    readonly startMs: number;
    readonly durationMs: number;
    readonly modules: number;
    readonly providers: number;
    readonly errors: number;
  } | null;
  /** Derived from event spans (section 7.2). A step with no events is absent. */
  readonly steps: readonly {
    readonly step: 'compile' | 'static' | 'build' | 'init' | 'setup';
    readonly startMs: number;
    readonly durationMs: number;
  }[];
  /** Every construct and construct:failed of the run, in event order. */
  readonly builds: readonly ProfileBuild[];
  /** Every init and init:failed of the run, in event order. */
  readonly inits: readonly ProfileInit[];
  /** Thenables core is still awaiting. Empty once the run settled. */
  readonly pending: readonly {
    readonly providerId: string;
    readonly token: string;
    readonly module: string;
    readonly level: number | null;
    readonly what: 'construct' | 'init';
    readonly startMs: number;
    readonly syncMs: number;
  }[];
}

export interface ProfileBuild {
  readonly providerId: string;
  readonly token: string;
  readonly module: string;
  /** Core's Lifetime; parseProfileReport accepts any string, as for ProfileRun.kind. */
  readonly lifetime: Lifetime | null;
  readonly scope: string | null;
  readonly async: boolean;
  readonly level: number | null;
  readonly parent: string | null;
  readonly startMs: number;
  /** null for a failed build. */
  readonly syncMs: number | null;
  readonly awaitMs: number | null;
  /** null for a failed build. */
  readonly finishMs: number | null;
  readonly durationMs: number;
  readonly failed: boolean;
}

export interface ProfileInit {
  readonly providerId: string;
  readonly token: string;
  readonly level: number | null;
  readonly async: boolean;
  readonly startMs: number;
  /** null for a failed onInit. */
  readonly syncMs: number | null;
  readonly awaitMs: number | null;
  readonly durationMs: number;
  readonly failed: boolean;
}
```

A build with `run: null` joins its parent's run. A build with neither a run nor a parent
(an on-demand build after startup) is not recorded. A consumer reads an init's module from
the `construct` with the same `providerId`.

`CriticalPath`, `TraceFile` and `CpuProfile` are exported types. `CpuProfile` is the V8
`.cpuprofile` shape (`nodes`, `startTime`, `endTime`, `samples`, `timeDeltas`), declared
structurally in devtools. `TraceFile` is `{ traceEvents, metadata?, displayTimeUnit? }`.

### 6.3 Plugin shape

The profiler object is the plugin, as `devtools()` is. Name `nexus:profile`. Hooks:
`observe` and `setup`. `setup` keeps the `PluginContext` so `report()` can read
`context.blueprint()`.

No hook of the profiler throws. Events carry no container identity, so the profiler
detects reuse by a second `compile` event with `phase: 'create'`, a `compile` for a run that
already closed, or a second `run` event for a closed id. The last case catches a second
`create` that failed before its compile. It then stops recording, and `report()` throws
`NEXUS_DEVTOOLS_PROFILE_REUSED`. A `construct`, `init` or `:await` event for a closed run
(an async build that settles after its run failed) is ignored: it is not reuse, and the
profiler does not append it. A throw from `setup` would fail the
user's `create`, and would miss a reuse after a failed `create`, where no `setup` ran.

`observe` branches on `event.type` with a `switch` and a `default` branch that ignores
unknown types. See owner item (c) 1 for how this reads against P1.

### 6.4 Browser and Node

`profile()` behaves the same in every runtime: it pushes plain objects into arrays (about
61 ns per event in Node, research section 5) and builds the report on `report()`. It reads
`performance`, `navigator` and `console` only. No `node:` import, no `process`, no file
system.

| Runtime                    | Recording | Live mode           | Getting a file out                                                                |
| -------------------------- | --------- | ------------------- | --------------------------------------------------------------------------------- |
| Chrome, Edge 134 and later | arrays    | `console.timeStamp` | `JSON.stringify(toChromeTrace(report))` into a Blob download (docs snippet)       |
| Chromium below 134         | arrays    | none                | same                                                                              |
| Firefox, Safari            | arrays    | none                | same; the Perfetto file opens in ui.perfetto.dev                                  |
| Node, Deno, Bun            | arrays    | none                | the app writes the JSON with its own file API, or the user runs `nexusdi profile` |

Node has no live path: Node drops user timings from every trace channel from Node 16 on,
and `console.timeStamp` reaches no consumer there (research sections 1 and 2).

Memory bound: by default the profiler records `create` and `load` runs. `scopes: true`
adds `createScope` and `extend()`. `maxRuns` (default 1,000) drops the oldest run first, so
a server that leaves the profiler on does not grow without bound.

### 6.5 Live mode

`profile({ live: liveSink() })`, with `liveSink` from `@nexusdi/devtools/live`, draws the
spans of section 7.3 for a run when its `run` event arrives, so a Performance recording of a page shows the NexusDI track group with no file
step. The barrier-path colour is known only at the run's end, and `console.timeStamp` takes
explicit start and end times, so each span keeps its recorded start and end. A run that never
settles draws nothing live; `report()` and `toChromeTrace` cover a stalled startup.

- One sink: `console.timeStamp(label, start, end, track, trackGroup, color)`.
- Detection runs once, at `liveSink()`: the `Chromium` entry of
  `navigator.userAgentData.brands` with a version of 134 or later. Every other runtime gets
  `undefined`, and `profile()` draws nothing.
- Cost per span on Chrome 154: 142 ns when nothing records, 999 ns while recording. A
  500-provider startup draws about 600 spans: 0.09 ms and 0.6 ms.
- Every live call sits in a `try/catch` that drops the error. An observe hook's throw would
  reach the user's `create`, and a profiler never fails the app it measures.
- The live sink and `toChromeTrace` share one `spansOf(run)` function, so live tracks and
  file tracks carry the same names and colours.

### 6.6 Error codes

`DevtoolsError` gains two codes, declared in `NexusErrorByCode`. Both carry inline text,
because no container formatter runs where they are thrown (extension principle 2.5.1).
The `doc-error-codes` repo-check requires each code to have a page,
`apps/docs/content/errors/<CODE>.mdx`, with its regions in
`examples/meridian/src/errors/<CODE>.md`, an entry in `apps/docs/content/errors/_meta.ts` and a
row on `/api-errors/`.

| Code                             | Thrown by              | `path`                                                   | Fix line                                                      |
| -------------------------------- | ---------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| `NEXUS_DEVTOOLS_PROFILE_INVALID` | `parseProfileReport()` | the first bad field, such as `runs[0].builds[3].startMs` | re-record the report with this version of `@nexusdi/devtools` |
| `NEXUS_DEVTOOLS_PROFILE_REUSED`  | `report()`             | `null`                                                   | create one `profile()` per container                          |
| `NEXUS_DEVTOOLS_UNREGISTERED`    | `graph()`              | `null`                                                   | unchanged                                                     |
| `NEXUS_DEVTOOLS_GRAPH_INVALID`   | `parseGraph()`         | the first bad field                                      | unchanged                                                     |

`parseProfileReport` rejects a `format` other than `'nexusdi-profile'` and a `version`
other than 1.

### 6.7 Example

```ts
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';
import { profile, profileTable, toChromeTrace } from '@nexusdi/devtools';
import { liveSink } from '@nexusdi/devtools/live';

interface IReactorCore {
  output(): number;
}
interface IShipComputer {
  plot(target: string): readonly string[];
}
interface INavCharts {
  sector(name: string): unknown;
}

const REACTOR_CORE = new Token<IReactorCore>('ReactorCore');
const SHIP_COMPUTER = new Token<IShipComputer>('ShipComputer');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR_CORE, { useClass: FusionReactor }),
    provide(SHIP_COMPUTER, {
      useClass: MainframeComputer,
      deps: [REACTOR_CORE],
    }),
  ],
  exports: [SHIP_COMPUTER],
});

const Tactical = defineModule({
  name: 'Tactical',
  imports: [Engineering],
  providers: [
    provide(NAV_CHARTS, {
      useFactory: async (computer: IShipComputer) =>
        StarCharts.download(computer),
      deps: [SHIP_COMPUTER],
    }),
  ],
  exports: [NAV_CHARTS],
});

const Meridian = defineModule({ name: 'Meridian', imports: [Tactical] });

const profiler = profile({ live: liveSink() });
await using ship = await Nexus.create(Meridian, { plugins: [profiler] });

const report = profiler.report();
console.log(profileTable(report));
const file = JSON.stringify(toChromeTrace(report)); // a Blob download in a browser
```

## 7. Output formats

### 7.1 What each tool shows

| Output         | Opened in                                                                      | Shows                                                                                                                                        | Does not show                                          |
| -------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Table          | terminal, CI log                                                               | steps with shares, slowest providers by own time, levels, critical path with barrier waits                                                   | a timeline                                             |
| Chrome trace   | Chrome or Edge DevTools, Performance, Load profile, with Show custom tracks on | a NexusDI track group: runs, steps, one track per level per run, onInit; tooltips and properties; the JS flame chart under Main with `--cpu` | dependency arrows (DevTools draws none for JSON flows) |
| Perfetto trace | ui.perfetto.dev, `trace_processor`                                             | one track per provider sorted by level, sync, await and finish sub-slices, dependency flow arrows, SQL over slices and flows                 | DevTools' grouping and colours                         |
| Perfetto trace | speedscope                                                                     | the `X` slices per provider as flame graphs                                                                                                  | flows and async events                                 |
| Report JSON    | `nexusdi profile report.json`, scripts                                         | everything above, re-renderable                                                                                                              | nothing the report holds                               |

Two trace files, one per tool. Perfetto renders each `blink.user_timing` measure as an
async slice on its own track, so one combined file would give a 500-provider app 500 extra
tracks beside the 500 provider tracks. The DevTools layout is undocumented, and a second
pid in the Chrome file is one more thing a future Chrome could reject.

### 7.2 Terminal table and critical path

Sorted slowest first by own time, `syncMs + (awaitMs ?? 0) + finishMs`. Columns: provider,
module, level, lifetime, sync ms, await ms, finish ms, own ms, queued ms, with
`queued = durationMs - own`. Numbers below are illustrative.

```
$ npx nexusdi profile src/ship/meridian.ts#Meridian
create 38.4 ms, cold, Node 24.20.0, @nexusdi/core 0.4.0

step       ms   share
compile   6.1   15.9%
static    0.2    0.5%
build    27.9   72.7%   4 levels, 14 providers, 2 async
init      3.9   10.2%   2 onInit
setup     0.3    0.8%

slowest providers
provider          module       level  lifetime   sync ms  await ms  finish ms  own ms  queued ms
NavCharts         Tactical         2  singleton      0.3      21.4        0.1    21.8        0.0   async
SubspaceLink      Comms            1  singleton      2.4         -        0.0     2.4        1.1
ShipComputer      Engineering      1  singleton      1.1         -        0.0     1.1        0.0
ReactorCore       Engineering      0  singleton      0.9         -        0.0     0.9        0.3
...

levels
level  providers  wall ms  slowest
    0          5      1.4  ReactorCore 0.9
    1          4      3.6  SubspaceLink 2.4
    2          3     21.9  NavCharts 21.8
    3          2      0.6  DiagnosticsPanel 0.4

critical path, build 27.9 ms: dependency bound 26.0 ms, level barriers 1.9 ms
level 0  ReactorCore        0.9 ms
level 1  SubspaceLink       2.4 ms   barrier: no dependency built in this run
level 2  NavCharts         21.8 ms   depends on SubspaceLink; started 0.4 ms late, behind sync siblings
level 3  DiagnosticsPanel   0.4 ms   barrier: depends on SubspaceLink, which ended 21.8 ms earlier

barrier waits (start minus the end of its own deps)
DiagnosticsPanel  21.9 ms
ShipComputer       1.5 ms
```

Steps are derived in devtools from event spans, and `/trace-events/` documents the
derivation for third parties:

- compile: the `compile` event.
- static: the `construct` events of value and alias providers (and options schemas): the
  `construct` events with `lifetime: null` and no level.
- build: from the first level `construct` start to the last level `construct` end.
- init: the span of the run's `init` events.
- setup: from the last `init` or `construct` end to the `run` end.

The derived boundaries differ from core's internal ones by the microsecond gaps of core's
scheduling, which do not matter at the millisecond scale a user profiles.

Critical path, per run, from `construct` events with a level plus the report's graph edges:

1. `own(p)` as above. `end(p) = startMs + durationMs`, the store time.
2. Barrier path: per level, the provider with the latest `end`. Its store releases the next
   level, so this chain is the build step's length.
3. For each barrier-path member, `depends` is true when it reaches the previous member
   through edges with `ordersBuild`, passing through providers with `inline` (section 3.7).
   Otherwise the line says "barrier", and names the member's latest-ending dependency built
   in the run and how long before the previous member's end it ended, or says the run built
   none. devtools reads both fields from the report's graph and compares no edge kind or
   lifetime.
4. Barrier wait of `p`: `startMs(p) - max end(d)` over its strong deps `d` built in the same
   run, or the build step's start when it has none. The table lists the largest.
5. Dependency bound: `f(p) = max f(d) + own(p)` over the same deps, in level order. The
   bound is `max f`. Build step minus bound is what level scheduling adds to this app.
6. Late start of an async provider: `startMs - level start`, the time sync siblings ran
   before its factory was called.

For an async chain, items 2, 5 and 6 together name the factory that held startup and how
much of the wait level barriers added. A failed run gets the table up to the failure with
the `construct:failed` provider marked. A run with no graph (no `create` reached `setup`)
gets no critical path.

`criticalPath()` returns the same data:

```ts
export interface CriticalPath {
  readonly run: number;
  readonly buildMs: number;
  readonly boundMs: number;
  readonly barrierMs: number;
  readonly path: readonly {
    readonly providerId: string;
    readonly token: string;
    readonly level: number;
    readonly ownMs: number;
    readonly dependsOnPrevious: boolean;
    /** Async providers only; null otherwise. */
    readonly lateMs: number | null;
    /**
     * Its latest-ending dependency built in this run, and how long before the
     * previous path member's end that dependency ended. null when it has no
     * such dependency, and on the first member.
     */
    readonly latestDep: {
      readonly providerId: string;
      readonly token: string;
      readonly earlierMs: number;
    } | null;
  }[];
  readonly waits: readonly {
    readonly providerId: string;
    readonly token: string;
    readonly waitMs: number;
  }[];
}
```

### 7.3 Chrome DevTools trace file

Layout copied from the research lab's verified `synth-ut2.json` and `combined.json`:

- `M` events: pid 1 `process_name` "Renderer", tid 1 `thread_name` "CrRendererMain"; pid 2
  "Browser", tid 2 "CrBrowserMain".
- One `TracingStartedInBrowser` instant on pid 2, with
  `cat: "disabled-by-default-devtools.timeline"`, `ts` 1 ms before the first event, and
  one frame in `args.data.frames[0]`: `frame: "F1"`, `isInPrimaryMainFrame: true`,
  `isOutermostMainFrame: true`, `processId: 1`, `url: "nexusdi://profile/<graph.root>"`, or
  `"nexusdi://profile"` when the report has no graph (a create that never reached `setup`).
  Without it DevTools draws one collapsed process row.
- Each span is a `b`/`e` pair, `cat: "blink.user_timing"`, unique hex `id2.local`, and
  `args.detail` holding the JSON string
  `{"devtools":{"track","trackGroup","color","properties","tooltipText"}}`.
- Track group `NexusDI` (option `trackGroup`). Tracks: `Runs` (one span per run), `Steps`,
  `<run> · level <n>` per run and level (`create · level 0`, `load 1 · level 0`,
  `s3 · level 0`), and `<run> · onInit`.
- A provider span is `[startMs, startMs + durationMs]`. Children: `sync` from `startMs`,
  `await` after it, `finish` ending at the span's end. The queue is the undrawn gap inside
  the parent.
- Colours: steps `tertiary`, provider spans `primary`, `sync` `primary-light`, `await`
  `secondary`, `finish` `tertiary-light`, failed `error`, barrier-path members
  `primary-dark`. Properties: module, lifetime, level, sync ms, await ms, finish ms, queued
  ms, run, critical path. Tooltip:
  `NavCharts 21.8 ms (0.3 sync, 21.4 await), critical path`.
- One `dataType: "marker"` measure at each run's end: `create ready`.
- A pending build in a partial report draws from its `startMs` to the report time, colour
  `error`, tooltip "still awaiting at timeout".
- With `cpuProfile`: one `P` `Profile` event and one `ProfileChunk`
  (`cat: "disabled-by-default-v8.cpu_profiler"`, pid 1 tid 1) whose `cpuProfile.nodes`
  carry `parent` links derived from `children`, plus `samples` and `timeDeltas`. Span
  timestamps shift by `offsetMs`.
- Timestamps: `ts = (startMs + offsetMs) × 1000` µs.

This layout is Chrome's undocumented format. Section 10 tests it.

### 7.4 Perfetto trace file

Plain Trace Event Format:

- One pid per run, `process_name` "nexusdi create (run 0)".
- tid 1 "steps": `X` slices for compile, static, build, init and setup.
- One tid per built provider, `thread_name` the token,
  `thread_sort_index = level × 10000 + order`. A provider slice spans `[startMs, startMs + durationMs]`, with `sync`, `await` and
  `finish` children as in 7.3. Its `onInit` is a later slice on the same tid. Perfetto
  requires slices on one tid to nest, so concurrent providers each get a tid.
- Flow arrows: v1 `s`/`f` events with `bp: "e"`, one pair per edge with `ordersBuild`
  between two providers built in the run. `s` sits 1 µs before the dependency's end on its
  tid, `f` 1 µs after the dependent's start on its tid, each clamped to its slice, so a
  zero-length slice on a coarse browser clock keeps its arrow. Name `dep`, or `critical` for barrier-path
  edges. v1, because a provider with several dependents needs several flows, and a v2
  `bind_id` slice carries one.
- `args`: module, lifetime, level, run, syncMs, awaitMs, finishMs, async, failed.
- `metadata: { "nexusdi-profile": 1, "nexusdi-core": "<version>" }`,
  `displayTimeUnit: "ms"`. `@nexusdi/core` exports no version constant, and this spec adds
  no core API for one, so `toPerfettoTrace` writes `"nexusdi-profile": 1` only. The CLI
  adds `"nexusdi-core"` from the report's `environment.core` (section 6.2), and leaves it
  out when the report has no environment or its core is unresolved: a re-rendered report
  names the core that recorded it, never the machine's own.

### 7.5 Report JSON

`--json` writes `ProfileReport[]`, one entry per iteration. A `.json` entry for
`nexusdi profile` accepts one report or an array, and `parseProfileReport` checks each.

## 8. CPU profile merge (CLI only)

The CLI samples the CPU in-process and aligns clocks. devtools' `toChromeTrace` takes the
aligned profile as data. The Chrome layout stays in devtools, under one golden test, and a
browser user with a CPU profile from Playwright or CDP can merge it with the same call.

```ts
// libs/cli/src/cpu.ts and profile.ts (Node only)
import { Session } from 'node:inspector/promises';

performance.now(); // loads perf_hooks before sampling starts
const session = new Session();
session.connect();
await session.post('Profiler.enable');
await session.post('Profiler.setSamplingInterval', {
  interval: command.cpuInterval,
}); // µs, default 100
await session.post('Profiler.start');
const start = nexusdiAnchorStart(interval); // [name, startMs, endMs]
const report = await devtools.profileStartup(root, { plugins, load, profiler });
const end = nexusdiAnchorEnd(interval);
const { profile } = await session.post('Profiler.stop');
const aligned = alignClocks(profile, [start, end]); // { offsetMs, errorMs, consistent } | null
const trace = devtools.toChromeTrace(report, {
  cpuProfile: { profile, offsetMs: aligned.offsetMs },
});
```

Anchors:

- Two functions with distinct names. Each reads `performance.now()`, calls
  `nexusdiAnchorSpin` for `max(10 ms, 20 × interval)`, and reads `performance.now()` again
  when the spin returns. The macOS sampler can go 5 to 25 ms without a sample, which is why
  the spin lasts at least 10 ms.
- Node loads `perf_hooks` on the first read of the `performance` global, which takes tens
  of ms with the profiler on. The CLI reads it once before `Profiler.start`, so the load
  falls outside the first anchor's clock read.
- A sample counts when its stack holds the anchor's name. The spin's frame is no test: once
  V8 optimizes an anchor, it inlines the spin, and the profile drops the spin's frame (seen
  on the second profile in one process).
- `alignClocks` walks samples in order, accumulating `timeDeltas` from `profile.startTime`.
  A counted sample at `t` ms on the profile clock, in an anchor that read the clock at
  `startMs` and `endMs`, puts the offset in `[t - endMs, t - startMs]`. The offset is the
  middle of the bounds every counted sample of both anchors sets, and `errorMs` is half their
  width. `consistent` is `lo <= hi`. When the bounds cross, the samples contradict the clock
  reads, and `errorMs` is half the gap.
- When `consistent` is false, the CLI warns
  (`the CPU clock and performance.now() disagree by 0.8 ms; CPU samples may sit up to 0.4 ms off the provider spans`).
  Otherwise, when `errorMs` passes `max(1 ms, 4 × interval)`, it warns
  (`the sampler ran too rarely to align the clocks; CPU samples may sit up to 1.8 ms off the provider spans`).
  Both keep the profile.
- When no anchor has a sample, the CLI warns, writes the Chrome file without the CPU
  profile, and keeps exit code 0. One anchor with samples is enough to align.
- `libs/cli` builds with `tsc` and no minifier, so the names stay intact.
- Error bar: the lab measured 0.22 ms and 0.43 ms agreement at 50 µs on macOS, with the
  first-sample rule. With the bounds rule, 30 runs of the Meridian fixture on macOS gave `errorMs` median 0.041 ms and max 0.15 ms at 100 µs, with no crossed bounds. At 50 µs: median 0.020 ms and max 0.057 ms, and 2 of 30 runs crossed by at most 0.11 ms. A
  `cpu.test.ts` case aligns 10 runs at 100 µs, asserts the median within
  `max(1 ms, 4 × interval)`, and writes the median and max to the GitHub job summary; that
  summary gives the Linux figure. The docs state the error bar as at most
  `max(errorMs, interval)`, never below one sampling interval.

The V8 profile clock and `performance.now()` differ (the lab measured a 376,936 s offset on
macOS), which is why alignment uses anchors. `process.hrtime` does not close the gap: on
macOS it ran 469,632 s apart from the V8 clock.

## 9. `nexusdi profile`

### 9.1 Synopsis

```
nexusdi profile <entry> [options]

<entry>                  path[#export]: a module file as for graph (the default export when
                         #export is absent), or a .json file holding a ProfileReport or an
                         array of them, re-rendered without running the app
    --load <path#export> a module to load() after create, timed as its own run; repeatable
    --plugins <path#export>
                         an exported array of plugins, registered after the profiler
    --repeat <n>         warm iterations after the first, default 0; the table shows the
                         cold run and the warm medians
    --chrome <file>      write the Chrome DevTools trace of the first iteration
    --perfetto <file>    write the Perfetto trace of the first iteration
    --json <file>        write every iteration's ProfileReport as an array
    --cpu                sample the CPU and merge it into --chrome; needs --chrome
    --cpu-interval <us>  sampling interval, default 100
    --top <n>            rows in the slowest-providers table, default 20
    --timeout <ms>       stop waiting for a create or load, default 60000
    --quiet              no table on stdout
-h, --help
-v, --version
```

`--cpu` and Node's `--cpu-prof` differ: Node's flag writes a `.cpuprofile` file, and ours
merges into the `--chrome` file and writes no file of its own.

### 9.2 Examples

```bash
npx nexusdi profile src/ship/meridian.ts#Meridian
npx nexusdi profile src/ship/meridian.ts#Meridian --chrome startup.json --cpu
npx nexusdi profile src/ship/meridian.ts#Meridian --perfetto startup.perfetto.json --repeat 20
npx nexusdi profile src/ship/meridian.ts#Meridian --load src/ship/science.ts#Science --json profile.json
npx nexusdi profile profile.json --chrome startup.json
```

### 9.3 Loading and iterations

Loading reuses the graph command's code unchanged: `prepareLoader` (tsx from the entry's
project, else type stripping), `importEntry`, `path#export` with the exports list on a
missing default, and `@nexusdi/devtools` resolved from the entry at the CLI's exact version
(exit 3 otherwise). `DevtoolsApi` in `libs/cli/src/devtools.ts` gains `profile`,
`profileStartup`, `profileTable`, `toChromeTrace`, `toPerfettoTrace` and
`parseProfileReport`.

Each iteration creates a new profiler and calls
`profileStartup(root, { plugins, load, profiler })`: `create`, each `load` in flag order,
then `ship[Symbol.asyncDispose]()`. Disposal closes database pools and servers the
providers opened before the next iteration. Its time goes into `report.dispose` and one
table line. A disposal error prints a warning and leaves the exit code alone, since the
command measures startup. A disposal that does not settle within `--timeout` warns by name
(`nexusdi: warning: disposal after iteration 1 did not settle within 60000 ms; the startup
figures stand.`), keeps the exit code, and runs no further iteration, which would build
next to the stuck one.

The CLI adds `environment` (section 6.2) to each report it records, and `profileTable`
prints it on the header line: `create 38.4 ms, cold, Node 24.20.0, @nexusdi/core 0.4.0`.
A `.json` entry re-renders with the environment its reports carry, or none, and never the
machine's own. Before a run, two outputs on one path, or an output directory that is
missing or not writable, exit 2. After writing, the CLI calls `process.exit(code)`, as graph does,
so an open handle in user code cannot keep it alive.

`--repeat`: iteration 1 is the cold run. V8 compiles core's functions on first call, about
2.2 ms (perf report section 1.5). Warm iterations give medians per step and per provider.
Every iteration constructs every provider again, side effects included, and the docs say
so. Traces draw iteration 1. `--cpu` samples iteration 1.

### 9.4 Timeout

When `create` or a `load` has not settled within `--timeout`, the CLI reads
`profiler.report()` and prints the open run's `pending` list. The hung operation is parked
on a promise, so the thread is free to do this. The CLI then writes every requested output
with the partial report and exits 1.

```
nexusdi: create did not settle within 60000 ms.
  Still awaiting: NavCharts (Tactical) factory, 60000 ms; PowerRouter (Engineering) onInit, 59800 ms
```

A synchronous constructor that never returns blocks the thread, and no timer or observer
runs. Only a thenable can hang a startup that a profiler can report on, which is why core
emits `:await` events and no `:start` events.

### 9.5 Exit codes

The graph command's four codes:

| Code | Meaning                                                                                                                                                                                                                                                                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | The app started, every `load` succeeded, and the outputs were written. A CPU profile with no anchor sample, or an alignment error past the bound of section 8, warns and keeps 0.                                                                                                                                                                                    |
| 1    | The app failed to start: `create` or a `load` threw after it compiled (a `BlueprintError` included), or `--timeout` fired before every run settled (a disposal that hangs warns and keeps the code, section 9.3). The table and the requested files are still written with what was recorded, and the error text goes to stderr.                                     |
| 2    | The invocation or input is wrong: as graph, plus `--cpu` without `--chrome`; `--load`, `--plugins`, `--repeat` or `--cpu` with a `.json` entry; a `.json` file that `parseProfileReport` rejects (the CLI prints `<file>: ` before devtools' message); a `create` or `load` that threw before it compiled, such as `NEXUS_INVALID_MODULE` or `NEXUS_PLUGIN_INVALID`. |
| 3    | The environment lacks something: as graph.                                                                                                                                                                                                                                                                                                                           |

Code 1 widens graph's "invalid graph" to "the app failed to start". An invalid graph is one
way an app fails to start, so each code keeps its family. The CLI tells the two failures
apart from the profiler's data: the failed run has no `compile` in the report, or the report
has no run at all. It reads no error code, so it holds no list of core's codes (P1). graph
exits 2 for the same input errors. Every stderr message starts with
`nexusdi:`, and codes 2 and 3 end with the fixing command, as in graph.

## 10. Golden-file test of the Chrome layout

The test asserts on DevTools' parsed model. No pixel comparison.

### 10.1 Layer 1, every pull request

- Project `@nexusdi/devtools`, new target `test-trace`
  (`vitest run --config vitest.trace.config.ts`, Node environment). `test` depends on it,
  as core's `test` depends on `test-browser`, so the required `main` job's
  `nx run-many -t lint test build typecheck` runs it. No browser.
- Engine: `@paulirish/trace_engine`, pinned exactly, a root devDependency.
  `Trace.TraceModel.Model.createWithAllHandlers()` then `parse(traceEvents)` (verified on
  0.0.65; pinned at 0.0.66, where `parsedTrace().data` holds the handlers' data and each
  extension group lists its tracks in `entriesByTrack`). The test is
  `libs/devtools/src/profile/trace-engine.trace.test.ts`: the `.test.ts` ending lets the
  repo checks, the dependency lint and fallow treat it as a test, and the main vitest
  config excludes `*.trace.test.ts` so only `test-trace` runs it.
- Fixtures in `libs/devtools/test-fixtures/profile/`: a hand-written `ProfileReport` for
  Meridian (14 providers, async `NAV_CHARTS`, one `load`), a failed-run variant, a partial
  report with one pending build and `graph: null` (a hung create never reaches `setup`; the
  test checks the fallback frame URL and that no span carries the critical-path colour), and a 20-sample `.cpuprofile` cut from the lab's
  `node.cpuprofile`.
- Assertions:
  1. `data.Meta.mainFrameId === 'F1'`. A file without `TracingStartedInBrowser` returns
     `''` from both engines and draws as a collapsed row in DevTools. This is the tripwire.
  2. `data.ExtensionTraceData.extensionTrackData` holds one group, `NexusDI`, whose track
     names equal the golden list in order and whose per-track entry counts match.
  3. Every entry's name, start and duration in µs equal the fixture's spans.
  4. With the CPU fixture: `data.Samples.profilesInProcess.size === 1` for pid 1, and the
     first and last sample fall inside the run's span after alignment.
  5. `JSON.stringify(toChromeTrace(fixture))` equals the committed
     `chrome-trace.golden.json`, so an unintended layout change shows as a diff.
- Perfetto file, same target: a snapshot plus structure checks. Slices on each tid nest,
  every `s` has one `f` with the same id, every tid has a `thread_name`.

### 10.2 Layer 2, Chrome canary

- Workflow `.github/workflows/devtools-trace-canary.yml`. Installs Chrome stable and beta
  with `npx @puppeteer/browsers install chrome@stable` and `chrome@beta`, launches each
  headless with `--remote-debugging-port`, opens `/devtools/devtools_app.html`, and runs
  the layer-1 assertions in the frontend page against
  `await import('/devtools/models/trace/trace.js')` (verified by hand on Chrome 154). It
  also runs layer 1 against `@paulirish/trace_engine@latest`.
- Triggers: a weekly schedule, `workflow_dispatch`, and pull requests that touch
  `libs/devtools/src/profile/**`.
- Never a required check. A scheduled failure opens or updates one issue, as the
  `competitor-releases` job of `benchmarks.yml` does, and the issue records the Chrome build. Beta gives
  four to eight weeks of warning before stable carries a break.
- One Ubuntu job of about 2 minutes a week.

Both layers run because each covers the other's gap: the npm engine (0.0.66, published
2026-10-08) trails Chrome 154, and the frontend's module path is internal and
could move.

### 10.3 Other tests

- Core: a runtime test per event type and field, per run kind, the order of section 3.4,
  the in-flight set on a hung factory and a hung `onInit`, `init` from `buildOnDemand`,
  the failure-path rule of 3.5, and `trace.test-d.ts` for the new types.
- `plugin-api-1.test-d.ts`: the third-party profiler fragment of 5.3.
- devtools: an unknown `kind` and an unknown event type through `profile()`; reuse
  detection; `maxRuns` dropping; `parseProfileReport` paths; the critical path on fixtures
  with a barrier, a dependency chain and a late async start; and the `node:` scan over
  `libs/devtools/src`.
- CLI: argument parsing and every exit code of 9.5; process tests with a Meridian entry
  that has an async factory, a hanging variant for `--timeout`, and `--cpu` finding
  the anchors and the samples in the Chrome file.

## 11. Bundle cost

### 11.1 Core

+742 B gzip, 18,529 to 19,271 (+4.0%) against 0.4.0-rc.1, as designed; the pull request's
size report gives the measured figure. Section 4 has the breakdown. Every byte sits behind
the existing hook guards.

### 11.2 devtools

Measured on the implementation, esbuild `--bundle --minify --format=esm`, gzip 9, with
`@nexusdi/core` external:

| Import                                      | gzip B |
| ------------------------------------------- | ------ |
| `profile()` alone                           | 1,952  |
| `profile()` with `liveSink()` from `/live`  | 3,465  |
| `/live` on top of `profile()`               | 1,513  |
| `devtools()` and `graph()`, no profile code | 1,375  |

`profile()`'s bytes go to the recorder in `observe`, `stepsOf`, `graphOf` with its deep
freeze, and the `NEXUS_DEVTOOLS_PROFILE_REUSED` text. The `/live` subpath carries
`spansOf`, the critical path it colours by, and the `console.timeStamp` sink. The formatters
(`profileTable`, `criticalPath`, `toChromeTrace`, `toPerfettoTrace`, `profileStartup`,
`parseProfileReport`) each add bytes only to an app that imports them.

The size report measures each fixture minus core, so shared code compresses with core:
`devtools+profile` (`examples/size/src/devtools-profile.ts`, plain `profile()`) is 1,622 B and
`devtools+live` (`examples/size/src/devtools-live.ts`) is 3,077 B. An app that never imports
`profile` adds 0 B: devtools is `sideEffects: false`, each formatter is its own module under
`libs/devtools/src/profile/`, and `devtools()`, `graph()` and `trace()` reference no profile
module. A bundle test in `libs/devtools/src/profile/bundle.test.ts` holds that plain
`profile()` carries no `console.timeStamp` or span layout code.

Enforcement: the `examples/size/src/devtools.ts` fixture changes only as core does in the
profiler pull request, and the two fixtures above record `profile()` with and without live
drawing.

## 12. Docs pages

Under docs spec 4.3, where each feature's spec adds its own pages. This spec adds two pages,
`/profiling/` and `/trace-events/`, so the inventory goes from 41 to 43. `@nexusdi/cli` gets
no reference page: the reference loader builds a page from TSDoc, and a CLI has no
TypeScript export. `nexusdi profile`'s flags and exit codes go on `/profiling/` under their
own H2, as `/graph-cli/` documents `nexusdi graph`, and the CLI README keeps the full options
table.

| Path              | Kind        | Band     | Content                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/profiling/`     | `question`  | Guides   | "How do I find out what slows or stalls startup?": `profile()` in an app, `nexusdi profile`, reading the table, barrier waits and the critical path, opening the Chrome and Perfetto files, `--cpu`, live mode, the warning that `--repeat` builds every provider again, and a stalled startup (`report().runs[n].pending` in an app, `--timeout` in the CLI), and an H2 for `nexusdi profile` with its synopsis, flags and the exit codes of 9.5 |
| `/trace-events/`  | `contract`  | Guides   | the catalogue below                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/api-devtools/`  | `reference` | API      | docs spec page 38, planned within the RC window and absent on `release/0.4` today; one H2 per new export. If the page is still absent when the profiler's reference task runs, that task creates it with one H2 per export of `@nexusdi/devtools`, existing ones included, after `/api-errors/`                                                                                                                                                   |
| `/introspection/` | `concept`   | Concepts | existing page; one paragraph in the trace section: events carry `startMs`, link to `/profiling/`                                                                                                                                                                                                                                                                                                                                                  |

`/trace-events/` holds:

1. Every core event type with every field, its type, its tier and what it measures
   (section 3.2).
2. The clock: `performance.now()` ms of the emitting realm, and how to map it to Chrome µs
   and to an OpenTelemetry start time through `performance.timeOrigin`.
3. The contract text of 5.1 and the guidance under it.
4. The order guarantees of 3.4.
5. What `level` indexes per run kind (3.3), and that levels are barriers.
6. `parent` and nesting.
7. The step derivation of 7.2.
8. Where the graph comes from: `context.blueprint().edges` in `setup`, available after a
   `create` succeeded, and the two view fields of 3.7 (`EdgeView.ordersBuild`,
   `ProviderView.inline`) that a critical path reads.
9. The doctested third-party profiler of section 13.
10. How `@nexusdi/devtools` draws the Chrome file (7.3), with the warning that the layout is
    Chrome's undocumented format and a link to the golden test.
11. Namespacing a package's own events (`<package>/<event>`) and `PluginContext.emit`.

Every example is interface-first. Profiler output with times appears only as output of an
executed region or in the page console, and prose states no times. Owner item (c) 2.

## 13. Third-party profilers (P3)

Everything `profile()` uses is public API of `@nexusdi/core`:

| What `profile()` uses                                 | Public as                                           |
| ----------------------------------------------------- | --------------------------------------------------- |
| the events and their fields                           | `TraceEvent`, `TraceEventByType`, `RunKind`         |
| the `observe` and `setup` hooks, `name`, `apiVersion` | `NexusPlugin`, `NEXUS_PLUGIN_API`                   |
| the dependency graph for the critical path            | `PluginContext.blueprint()` (`edges`, `providers`)  |
| which edges order a build, which providers are inline | `EdgeView.ordersBuild`, `ProviderView.inline` (3.7) |
| `profileStartup`'s run                                | `Nexus.create`, `load`, `Symbol.asyncDispose`       |

devtools reaches core through `@nexusdi/core` only, which the `package-imports` repo-check
holds. A third-party package can build the same profiler, a span exporter for
OpenTelemetry, or a NestJS-style "slowest providers" list without a core change. This
example is the doctested one on `/trace-events/`:

```ts
import {
  NEXUS_PLUGIN_API,
  Nexus,
  Token,
  defineModule,
  provide,
  type NexusPlugin,
  type TraceEvent,
} from '@nexusdi/core';

interface ISubspaceLink {
  send(message: string): Promise<void>;
}
interface INavCharts {
  sector(name: string): unknown;
}

const SUBSPACE_LINK = new Token<ISubspaceLink>('SubspaceLink');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');

class SubspaceRelay implements ISubspaceLink {
  async send(message: string): Promise<void> {
    await relay.transmit(message);
  }
}
declare const relay: { transmit(message: string): Promise<void> };
declare function downloadCharts(link: ISubspaceLink): Promise<INavCharts>;

const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(SUBSPACE_LINK, { useClass: SubspaceRelay }),
    provide(NAV_CHARTS, {
      useFactory: (link: ISubspaceLink) => downloadCharts(link),
      deps: [SUBSPACE_LINK],
    }),
  ],
});

type Build = TraceEvent<'construct'>;
const own = (b: Build) => b.syncMs + (b.awaitMs ?? 0) + b.finishMs;

function slowest(top: number): NexusPlugin & { rows(): readonly Build[] } {
  const builds: Build[] = [];
  return {
    name: 'acme:slowest',
    apiVersion: NEXUS_PLUGIN_API,
    observe(event) {
      switch (event.type) {
        case 'construct':
          if (event.run === 0) builds.push(event);
          break;
        default:
          break; // a type this plugin does not know
      }
    },
    rows: () => [...builds].sort((a, b) => own(b) - own(a)).slice(0, top),
  };
}

const probe = slowest(5);
await using ship = await Nexus.create(Meridian, { plugins: [probe] });
for (const b of probe.rows())
  console.log(
    b.token,
    b.level,
    own(b).toFixed(1),
    b.awaitMs === null ? '' : 'async',
  );
```

## 14. Spec amendments

- Core spec 10.2: the event list and fields of section 3.1.
- Core spec 3.10.5: the order guarantees of 3.4 and the failure-path rule of 3.5.
- Core spec 3.10.2: untouched. No version raise.
- Extension principle 2.5.11: unchanged. Owner item (c) 1 records the P1 amendment.
- Graph CLI spec section 3: a second command in the same bin.
- Docs spec 4.3: two pages, `/profiling/` and `/trace-events/`, inventory 43. `/api-devtools/`
  stays docs spec page 38.
- Benchmarks spec 14.6: unchanged. No new site condition.

## 15. Files

Core (`libs/core/src/runtime/`): `trace.ts` (types, `RunKind`, the `run` event helper, the
collecting emit), `build.ts` (`traceBuild`, `buildInto` from
the call to the store, `validateOptions`, `init` from `buildOnDemand`, the transient clock
read), `build-levels.ts` (level index), `startup.ts` (run id, value and alias events),
`init.ts` (the init events through `traceBuild`), `scope.ts`, `load.ts`, `nexus.ts` (the create run),
`compile-traced.ts` (`run`, `startMs`, the dropped observer throw on failure),
`shutdown.ts` (`startMs`), `state.ts` (`nextRun`, `Run.id`), `trace.test-d.ts`; `index.ts`
exports `RunKind`. Core (`libs/core/src/blueprint/`): `views.ts` (`EdgeView.ordersBuild`,
`ProviderView.inline`), `levels.ts` (`isInline`), `compile.ts` (pass 4 calls `ordersBuild`),
and the module that holds the two helpers.

devtools: `src/profile/{profile,live,report,steps,table,critical-path,spans,chrome,perfetto,parse,startup,extent}.ts`,
`src/live.ts` (the `@nexusdi/devtools/live` entry, with `exports["./live"]` in
`package.json`), `src/devtools-error.ts` (two codes), `src/index.ts`,
`src/plugin-api-1.test-d.ts`, `src/profile/bundle.test.ts`,
`src/profile/trace-engine.trace.test.ts`, `vitest.trace.config.ts`,
`test-fixtures/profile/*`, `project.json` (`test-trace`).

CLI: `src/profile.ts` (command, anchors, `alignClocks`, timeout), `src/args.ts` (second
command), `src/devtools.ts` (`DevtoolsApi`), `src/main.ts`, `test-fixtures/profile/*`,
`README.md` (its usage lines and options table, which `src/readme.test.ts` holds against
`OPTIONS` in `src/args.ts`).

Repo: `examples/size/src/devtools-profile.ts`, `examples/size/src/devtools-live.ts`, `.github/workflows/devtools-trace-canary.yml`,
root `package.json` (`@paulirish/trace_engine`, exact pin).

## 16. Rejected options

- Paired `construct:start`, `init:start`, `step:start` and `run:start` events. They double
  the event count and push pairing logic onto every consumer. `startMs` on the end event
  gives every sink the span, and the two `:await` events cover the hung case at +75 B.
- `startMs` derived by a sink as `now() - durationMs` at receipt. The value drifts by the
  run time of every observer ahead of it, and an OpenTelemetry exporter wants an explicit
  start.
- The CLI inferring a hung run's in-flight providers from graph edges. It misreports: with
  A hung and B done in level 0, and C in level 1 depending on B only, it prints "still
  building: C", though C never started. A fix needs levels in the view or a copy of core's
  level algorithm in the CLI, which P4 forbids.
- `levels` on `BlueprintView`, and `level:start`/`level:end` events. A view exists only
  after `setup`, a later `load()` can change it, and a level span is derivable from the
  `construct` spans.
- `step` events (68 B). devtools derives every step from event spans.
- `compile.passes` (100 B), with `input.clock` and `Tracer.on`. Deferred until after
  perf-report items 1 and 5, which change visibility's share and merge cycles and levels
  into one pass, so the pass names would change within a release of being published.
  Item 1 (sparse visibility) is on `release/0.4` since 0.4.0-rc.1; item 5 is not. Core
  maintainers have the bench harness for pass times.
- `init.module` as a field of its own (20 B). The shared build-event shape of section 3.1
  now carries `module` on `init` at no cost.
- A queue-free `construct.durationMs`. It breaks the span rule for every sync provider in
  a wide level: the span would end before the provider was stored, and sibling spans on one
  level track would overlap at the wrong times. `finishMs` makes the queue derivable.
- Renaming `compile.phase` to free the word for steps. It breaks an rc.0 field for naming.
  If a later release adds step events, the name is `step`.
- One trace file for Chrome and Perfetto (section 7.1).
- A `performance.measure` live sink for Chromium 128 to 133. It serves browsers 18 months
  old in a dev-only feature, at 7 times the per-span time when not recording, with a
  `clearMeasures` call per span.
- `node:inspector` in devtools, and the CLI writing `Profile`/`ProfileChunk` itself. The
  first breaks devtools in browsers. The second splits the Chrome layout across two
  packages and leaves browser users with no merge.
- `node --cpu-prof` with a re-spawn. It profiles tsx's compile of the entry as well and
  writes the file at exit, after the CLI has rendered.
- The flag name `--cpu-prof` (section 9.1).
- A `run` field on `Ctx`, and a timing object per build. `lookup.ts` allocates a `Ctx` per
  `get()`, and a timing object would be one allocation per provider in every create,
  plugin or not.
- Throwing `NEXUS_DEVTOOLS_PROFILE_REUSED` from `setup` (section 6.3).
- Two predicate exports on `@nexusdi/core`'s main entry, `ordersBuild(kind)` and
  `passesThrough(provider)`, for the facts of 3.7. Each would be a permanent top-level name
  on `/api/` that no application calls, and each needs an executed region there. A report
  re-rendered by a newer devtools would apply that devtools' copy of core's rule to an
  older core's graph. View fields reach every plugin through the view it already reads, and
  the report records them.
- An `isTraceEvent(event, type)` guard exported by core, so devtools never compares
  `event.type`. It swaps the compiler-checked `switch` every documented observer uses for a
  call per branch. It stays the fallback if the owner rejects item (c) 1.
- `-f`/`-o` for `profile`, as graph uses. One run writes several files, and one `--out`
  cannot express that.
- Pixel comparison of DevTools screenshots, and Playwright's pinned Chromium for layer 2.
  The headless shell has no DevTools frontend, and the canary exists to test the Chrome
  users run.

## 17. Decisions for the owner

Each item carries the tech lead's recommendation. The owner approved every item on 2026-10-14.

### (a) Pillar trade-offs

1. Core grows by 673 B gzip, from 18,541 to 19,214 (+3.6%), against the 10 kB production
   target and over the 2% size-report threshold. Every byte sits behind the existing hook
   guards, so an app with no plugin runs no new code beyond a run counter. A plugin cannot
   measure these numbers from outside core. The cheaper option drops every `init` change,
   at +510 B, and the profiler then cannot see an async or hung `onInit`. Recommendation:
   approve +673 B. The ruling already cut 188 B from the proposal (steps, compile passes,
   `init.module`) and added 81 B for the hung case and `finishMs`. Approved by the owner, 2026-10-14, at about
   +742 B, the implemented design of section 3.6.

### (b) Removals, renames and semantic changes to public API

No public API is removed or renamed. The architect's change to `construct.durationMs` is
withdrawn, and the field keeps its rc.0 values. Two behaviour changes touch rc.0:

1. `init` events start firing for on-demand singletons (`eager: false` with `onInit`),
   which rc.0 builds without an event. A consumer that counts `init` events per container
   sees more of them. Recommendation: approve as a gap fix, with a CHANGELOG entry under the
   next rc. Approved by the owner, 2026-10-14.
2. An observer that throws while core reports a compile failure. rc.0 throws a
   `ProviderError` that wraps the observer's exception, and the caller never sees the
   `BlueprintError` or `LoadError`. New behaviour: the compile error reaches the caller and
   the observer's throw is dropped. On runtime failures, the observer's throw goes into
   `ProviderError.disposalErrors`. Example: a telemetry plugin whose `observe` throws on
   `compile` events today turns a missing-provider error into "plugin failed", and the user
   never sees `NEXUS_MISSING_PROVIDER`. Recommendation: approve. Approved by the owner, 2026-10-14.

### (c) Conflicts with owner rules

1. P1 says a package never lists another package's event types "in a table, switch, regex
   or string compare". `profile()` must test `event.type === 'construct'`, as any `observe`
   consumer does. The compiler checks that literal against core's exported `TraceEvent`
   union, so a typo fails to build. The P1 repo-check does not flag it today, and `trace()`
   never compares types, so `profile()` is the first first-party case. Recommendation: add
   to P1 "A compare on a trace event's `type`, or on one of its fields, against a union the
   owner exports and checked by the compiler, reads through the owner's export
   (`event.type === 'construct'` against core's `TraceEvent`). Code that branches that way
   handles an unknown member with a default branch (P2). Error codes keep their own rule:
   an equality check on a code needs an allowance." Approved by the owner, 2026-10-14.
   This item is the record of the P1 amendment until the extension principle spec
   (`specs/2026-09-30-extension-principle-design.md`) next changes.
2. Docs spec 4.6: every size and time figure on the site comes from the benchmark harness,
   and no page states one by hand. `/profiling/` has to show profiler output, which is full
   of milliseconds. A static code block with "NavCharts 21.8 ms" breaks the rule and the
   `doc-benchmark-figures` guard. The page console can run `profile()` on the Meridian
   specimen and print the table with the reader's own numbers. Recommendation: output with
   times appears only from an executed region or the console, the guard exempts executed
   output, and prose states no times. Approved by the owner, 2026-10-14.
3. The canary installs Chrome stable and beta unpinned, while the repo pins every tool
   through the lockfile. If that is an owner rule: the canary exists to catch a new Chrome
   breaking the undocumented layout, which a pinned Chrome cannot do. Recommendation: allow
   it for this non-required workflow only; the required pull-request path (layer 1) stays
   fully pinned. Approved by the owner, 2026-10-14.
