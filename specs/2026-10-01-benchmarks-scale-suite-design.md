# Benchmarks: the scale suite

Status: amended by the tech lead's rulings (section 13); ready for planning.
Branch: `feat/benchmarks-scale-suite`, from `origin/release/0.4` at `8824502`.
Project: `benchmarks` (`@nexusdi/benchmarks`) and `.github/workflows/benchmarks.yml`.
`libs/core` and `tools/bench-kit` do not change.
Depends on: `specs/2026-09-23-benchmarks-and-launch-design.md`, sections 4.2 to 4.10 and
14 (complete on `release/0.4`: the harness, `scale-200`, the sampler, the results PR of
rc.0, PR #73). The K14 dispatch benchmark (section 14.6) is complete and keeps its own
generator in `libs/core/bench/graph.mjs`; this suite does not import or change it.

## 1. Problem

Every runtime figure the harness publishes comes from Meridian-8, eight providers. The
rc.0 run (PR #73, Xeon 8573C, 4 cores) measured `ready` at 151.6 µs for NexusDI `plain`,
165.4 µs for InversifyJS `decorated`, 61.5 µs for awilix, 12.9 µs for needle-di
`decorated` and 2.5 µs for tsyringe `decorated`. NexusDI's figure includes its six
validation passes (section 14.2 item 5), a fixed amount of work per `create` that eight
providers cannot amortise. A user choosing a container for an app with 500 or 5,000
providers cannot tell from these figures how any of the five libraries grows.

`scale-200` exists, but it is build-only: `size.ts` counts its `tsc` emit and `build.ts`
times its builds. It never runs.

The scale suite runs generated graphs of 50 to 5,000 providers in three shapes through all
five libraries and publishes startup, ready, first-resolve and steady `get()` time,
retained heap and bundle bytes, each against provider count.

## 2. Decisions

1. Sizes are 50, 200, 1,000 and 5,000 providers.
2. Shapes are `wide`, `mixed` and `mixed-async` (section 3). `mixed` is the realistic
   shape and the headline. `wide` is the single-module control: no library needs a
   module form, so no departure from any library's docs applies to it. `mixed-async` is
   `mixed` with its low-tier factories made async, measured only for libraries that
   document async factories.
3. One seeded generator (`mulberry32` from `bench-kit`) builds every graph from a fixed
   graph seed committed in the harness. Both results files record the graph seed and a
   hash of every graph, so a reader can regenerate the exact graph a figure came from.
4. Each library is measured in its documented variant only: NexusDI `plain`, InversifyJS
   `decorated`, tsyringe `decorated`, awilix `plain`, needle-di `decorated`.
5. Startup metrics (load, create, first get, rest, retained heap) come from one fresh
   Node process per sample. An app builds its container once per process, so a
   long-lived worker that builds the same 5,000-provider container thousands of times
   measures a warm JIT no user sees. Steady `get()` uses the existing long-lived worker.
6. Paired ratios against NexusDI `plain`, with the circular block bootstrap of
   `bench-kit`, are published for `first-resolve`, `ready`, `startup`, `heap-ready` and
   `get-cycle`. The phase components (`load`, `create`, `first-get`, `rest`) are published
   as absolute medians with no ratio, because NexusDI builds its singletons in `create`
   and the other four build them on `get`, so a ratio on one phase compares different
   work.
7. The headline figure is `startup` = `load` + `ready`. Decorator libraries register at
   import time, so `ready` alone would leave their registration work out.
8. Every generated cell must build the same object graph before it is timed. A verify
   child checks the dependency digest, singleton identity, one construction per provider
   and each provider's kind (section 5). A cell that fails is recorded with its outcome and
   never timed.
9. One fresh-process block per shape holds all four sizes, so drift on the runner falls
   evenly on every size, and growth exponents come from paired per-round ratios between
   sizes (section 6.4).
10. `mixed` runs 1,000 measured rounds, the published minimum of section 14.4. `wide` and
    `mixed-async` run 200, and their tables print the round count. Relative claims in the
    README, the docs and the launch post come from `mixed` only.
11. Two new results files: `results/scale.json` (deterministic, committed, held by
    `--check`) and `results/scale/<date>-<sha7>.json` (one per published run, like
    `results/timings/`). Raw samples go to `results/raw/scale-<date>-<sha7>.json.gz`.
12. `src/scale/render.ts` writes `results/scale.md` and two SVG charts with no new
    dependency. The charts are log-log: startup time against providers, and gzip bundle
    bytes against providers.
13. Pull requests run the deterministic writer with `--check` and a 50-provider timing
    smoke under `tmp/`. The full timing run is one new job, `scale-timings`, on schedule,
    dispatch and core tags, estimated at 62 minutes. `build-scale-200` and `scale.ts` stay
    as they are.

## 3. The graphs

### 3.1 The model

`src/scale/graph.ts` declares the one graph type every shape produces and every renderer
reads:

```ts
type ProviderKind = 'class' | 'factory' | 'async-factory' | 'value';

interface ScaleProvider {
  /** 0..n-1; also the order of the token table in every rendered app. */
  index: number;
  /** p<index>, zero-padded to the width of n-1, e.g. p0042. */
  name: string;
  kind: ProviderKind;
  /** Indexes, in constructor order. A value has none. */
  deps: number[];
  /** Index into modules. Single-module shapes put every provider in module 0. */
  module: number;
}

interface ScaleModule {
  name: string; // m<index>, zero-padded
  tier: number;
  imports: number[];
  /** Provider indexes the module exports. */
  exports: number[];
}

interface ScaleGraph {
  shape: Shape;
  size: number;
  seed: number;
  providers: ScaleProvider[];
  modules: ScaleModule[];
  /** Modules the root imports: those no other module imports. */
  rootImports: number[];
  /** Providers get() may ask for at the root: the exports of rootImports, or all for one module. */
  entries: number[];
  /** The entry with the largest transitive closure, lowest index on a tie. */
  target: number;
}
```

Every dependency points to a lower index, so the graph is acyclic by construction and a
renderer can emit providers in index order. `checkGraph(graph)` asserts that, and that
every dependency is visible: in the provider's own module, or exported by a module its
module imports directly. NexusDI enforces that rule, so a graph that breaks it would not
compile in NexusDI and would compile everywhere else.

`describeGraph(graph)` returns the figures `scale.json` records: provider, edge and module
counts, maximum depth in edges, mean and maximum fan-out, maximum fan-in, the count of each
kind, the target and its closure size, and `hash`: the first 12 hex digits of the SHA-256
of the canonical JSON of `providers` and `modules`.

The graph seed is `GRAPH_SEED = 20261001` in `src/scale/config.ts`. It changes only when
the generator changes, which also changes every hash, and the change is reviewed like a
fixture change. The sampling seed stays `--seed` (the run id in CI), as it is today.

Each shape draws from its own stream, `mulberry32(GRAPH_SEED ^ hash32(shape) ^ size)`,
where `hash32` is FNV-1a over the shape name. Changing one shape's algorithm leaves the
others' graphs unchanged.

### 3.2 `wide`

The first `⌈n/5⌉` providers are leaves. Every other provider takes two distinct leaves,
drawn uniformly. Depth 1, mean fan-out 1.6, one module, every provider a class. It shows
per-registration and per-lookup work with no recursion and no module structure.

### 3.3 `mixed`

The realistic shape, in four tiers of modules:

- Module sizes are drawn uniformly from 4 to 16 (mean 10); the last module takes the
  remainder. Module `k` of `M` sits in tier `floor(4k / M)`.
- Module 0 is `core`, tier 0, with three exported hub providers: `config` (a value),
  `clock` (a factory with no deps) and `logger` (a class taking `config`). Every other
  module imports `core` plus one or two modules from lower tiers, at least one from tier
  `t - 1` where one exists.
- Each provider's kind: value 5%, factory 10%, class 85%. A value has no deps.
- A class or factory takes `k` deps with `P(k)` = 0:10%, 1:30%, 2:30%, 3:20%, 4:10%
  (mean 1.9). Each dependency slot draws a hub with probability 0.25, an export of an
  imported module with 0.25 and an earlier provider of its own module with 0.5. An
  empty pool falls through to the next in that order; a provider whose pools are all
  empty gets fewer deps.
- A module exports its last `⌈size/4⌉` providers.

All providers are singletons. Transient and scoped lifetimes stay with Meridian-8; at
scale every library's ready work is its singletons. Each renderer sets the singleton
lifetime explicitly where the library's default is transient (InversifyJS
`inSingletonScope()`, awilix `.singleton()`, tsyringe `@singleton()` and
`instanceCachingFactory`); NexusDI and needle-di default to singletons.

### 3.4 `mixed-async`

The `mixed` graph with the same seed and structure, where every factory in a tier-0 or
tier-1 module is `async-factory`. The async factory awaits one resolved promise
(`await Promise.resolve()`) and then constructs. It takes no timer and no I/O, so the
figure measures each library's async machinery. `scale.json` records the async share
(about 5% at every size).

## 4. Rendering each library's idiom

### 4.1 Layout of a generated app

The renderers in `src/scale/render/<library>.ts` turn a `ScaleGraph` into TypeScript
files:

- `wide`: one class per file, as `scale-200` does.
- `mixed`, `mixed-async`: one file per module holding its classes, factories, values and
  its module or registration code.
- `tokens.ts` where the library's idiom uses tokens.
- `app.ts`, which exports the `scale` adapter of section 4.4 and builds nothing at
  import.

Each class has `readonly id = '<name>'` and one field per dependency, `d0`, `d1`, ..., in
constructor order, assigned in the constructor. Factories return `new <Class>(...)` of a
class shaped the same way. A value is `{ id: '<name>' }`. Fields are declared explicitly,
with no parameter properties, as section 4.2 of the launch spec requires. Every class
constructor and factory body ends with `__scaleBuilt(<index>, '<kind>')`, a counter the
adapter exports (section 5). The call is identical in every library and does one array
increment per construction.

### 4.2 The five documented variants

Each renderer follows the library's Meridian-8 fixture for every construct that fixture
uses, and the library's documentation (cited in a header comment of the generated
`app.ts` and in `libraries.json`) for modules and async factories, which Meridian-8 does
not use.

| Library and variant      | Class providers                                                     | Factory and value providers                                              | Module form                                                                                   | Async factory                                    |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| NexusDI `plain`          | `Token<IFoo>`, class `implements IFoo` with `static deps`, `provide(T, { useClass })` | `provide(T, { useFactory, deps })`, `provide(T, { useValue })`           | `defineModule({ name, imports, providers, exports })` per module, root `App` imports the sinks | `useFactory: async (...) => ...`, built in `create` |
| InversifyJS `decorated`  | `@injectable()`, `@inject(Class)` per parameter, `bind(C).toSelf().inSingletonScope()` | `toResolvedValue(fn, [ids]).inSingletonScope()`, `toConstantValue`       | one `ContainerModule` per module, `container.load(...)` (synchronous in 8.2.3)                | `toResolvedValue(async fn)`, `getAsync`          |
| tsyringe `decorated`     | `@singleton()`, constructor types (metadata), `@inject(token)` for tokens | `{ token, useFactory: instanceCachingFactory(...) }`, `{ token, useValue }` | one `@registry([...])` class per module file, registered at import                           | not applicable                                   |
| awilix `plain`           | `asClass(C).singleton()`, PROXY cradle constructor, `strict: true`  | `asFunction(fn).singleton()`, `asValue`                                  | one `register<Module>(container)` function per module file, one `container.register({...})` each | not applicable                                   |
| needle-di `decorated`    | `@injectable()`, `inject(Class)` fields, bound on first `get`      | `{ provide, useFactory }`, `{ provide, useValue }`                       | one `register<Module>(container)` function per module file, one `container.bindAll(...)` each | `{ provide, async: true, useFactory }`, `getAsync` |

The API forms in this table were read from the packages at the pins (section 13). Task 6
records each as a claim in `libraries.json` with its documentation URL.

The NexusDI renderer is interface-first throughout: an interface and a `Token<IFoo>` per
provider, classes that take interfaces, and `useClass` bindings. Competitor renderers use
the tokens their Meridian-8 fixtures use: classes for class providers, and the token type
the fixture uses for `NAV_CHARTS` (a symbol for InversifyJS, a string for tsyringe, an
`InjectionToken` for needle-di, a cradle name for awilix) for factories and values.

### 4.3 Libraries without a module system

The provider graph is the same in every library: same providers, same edges, same kinds.
Module boundaries are a NexusDI feature with work behind it (visibility, export checks).

- InversifyJS: one `ContainerModule` per graph module. InversifyJS has no exports, so
  every binding is visible everywhere. The graph never depends on a token its module
  cannot see, so the result is the same.
- tsyringe: one `@registry([...])` class per graph module, holding that module's factories
  and values. The README documents `@registry` for grouping registrations, so tsyringe
  needs no departure. Its `@singleton()` classes and its registries register at import,
  inside `load`.
- awilix, needle-di: one file per graph module, exporting a `register<Module>(container)`
  function that makes one documented bulk call (`container.register({...})` for awilix,
  `container.bindAll(...)` for needle-di). `app.ts` calls them in module index order.
  needle-di's `@injectable()` classes need no call.

The `register<Module>` function is plain code that the two libraries' docs neither show
nor forbid. `libraries.json` records it as a departure (`moduleForm:
'registration-functions'`) with a one-line reason, and the generated header says so. It
adds one function call per module and nothing else.

### 4.4 The runtime adapter

`fixtures/scale-adapter.d.ts` declares what every generated `app.ts` exports:

```ts
export interface ScaleApp<H = unknown> {
  readonly count: number;
  readonly entries: readonly number[];
  readonly target: number;
  /** Library modules this app imports, for the child to load first. */
  readonly packages: readonly string[];
  /** Constructions per provider index, and the kind each construction reported. */
  readonly built: { readonly counts: Uint32Array; readonly kinds: readonly string[] };
  create(): H | Promise<H>;
  /** Synchronous get by provider index, through a token table built at load. */
  get(handle: H, index: number): unknown;
  /** Only where the graph has async providers and the library resolves them with getAsync. */
  getAsync?(handle: H, index: number): Promise<unknown>;
}
```

`create` does what each library's documented setup does before the first `get`:

| Library   | `create` does                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| NexusDI   | `await Nexus.create(App)`: compiles the blueprint (all validation passes) and builds every singleton (eager by default) |
| InversifyJS | `new Container()`, then `load` of every `ContainerModule` (`wide`: one `bind` per provider)                            |
| tsyringe  | nothing: `@singleton()` classes and `@registry` classes registered on the global container at load                     |
| awilix    | `createContainer({ injectionMode: PROXY, strict: true })` and the `register<Module>` calls                               |
| needle-di | `new Container()` and the `register<Module>` calls; `@injectable()` classes bind on first `get`                          |

Because NexusDI builds its singletons in `create` and the others build on `get`, `create`
and `first-get` alone compare different work. The results page shows them as absolute
medians beside this table, and every relative statement uses `first-resolve`, `ready` or
`startup`.

In `mixed-async` cells the child calls `getAsync` for every get where the adapter has it
(InversifyJS and needle-di require it for any provider whose closure holds an async
provider). NexusDI awaits its async factories in `create` and resolves with `get`.

The token table: `app.ts` builds `const T = [t0, t1, ...]` at load, and `get(h, i)` is
`h.get(T[i])` in the library's call form. NexusDI's root sees only the exports of the
modules the root imports, so its `get` passes `{ module: M[i] }` (the documented
`LookupOptions`) for providers outside `entries`. Every library does one array read per
`get`.

## 5. Equivalence

`src/scale/verify-child.mjs` runs in its own process: imports the cell's bundle, calls
`create`, resolves every provider (target first, then index order, with `getAsync` where
the adapter has it), resolves every provider a second time, and prints one JSON line:

- `digest`: SHA-256 of the sorted lines `<id>(<d0.id>,<d1.id>,...)` over every resolved
  instance;
- `shared`: true when, for every edge `a -> b`, `a.d<i> === get(b)`, and the two passes
  return the same object for every provider;
- `built`: true when `counts[i] === 1` for every provider after both passes, so no
  provider was constructed twice and none was skipped;
- `kinds`: true when every provider reported its model kind through `__scaleBuilt`
  (`class` from a constructor, `factory` or `async-factory` from a factory body, and a
  value never constructs, so its count is 0 and its object is the module constant).

`expectedDigest(graph)` computes the same digest from the model. A cell is `pass` when all
four hold, `wrong-instance` when any fails, and `runtime-error` or `compile-error` as the
matrix classifies them (`outcome.ts`). Only `pass` cells are timed.

The `kinds` check stops a renderer from turning a factory into a class or a value into a
factory, which the digest cannot see. A person still reads each renderer's generated
`app.ts` at n = 50 beside the cited docs page (task 20), because no runtime check can
prove a form is the documented one.

## 6. Metrics

### 6.1 Fresh-process metrics

`src/scale/child.mjs` runs under `node --expose-gc`, one process per sample, with
`NODE_COMPILE_CACHE` and `NODE_OPTIONS` cleared from its environment:

1. Imports the library's `packages` (polyfill first), untimed. Library import time is
   already the cold-start figure.
2. `gc()` twice, reads the retained heap (`base`).
3. Times `await import(bundle)`: `load`.
4. `gc()` twice. Times `create`: `create`.
5. Times `get(target)`: `first-get`.
6. Times resolving every other provider once, in index order: `rest`.
7. `gc()` twice, reads the heap with the handle still referenced: `heap-ready` = heap −
   `base`.
8. Checks, untimed, that `built.counts` sums to the number of non-value providers, and
   exits 1 when it does not.
9. Sends `{ load, create, firstGet, rest, heapReady }` and exits.

Derived, per round before any median: `first-resolve` = `load` + `create` + `first-get`,
the time until the target is usable; `ready` = `create` + `first-get` + `rest`;
`startup` = `load` + `ready`. The `gc()` calls sit between timed phases, never inside one.
Timers are `process.hrtime.bigint()` inside the child, so spawn and IPC are outside every
figure.

Retained heap is the sum of `space_used_size` over `v8.getHeapSpaceStatistics()` minus
the code spaces (`code_space`, `code_large_object_space`). It covers the app's instances,
the container's bookkeeping and the app code's heap objects (bytecode, function
metadata), which grow with the code each library's idiom emits. Import-time registration
counts, because `base` is read before `load`.

The bundle: each cell's `tsc` output is bundled by esbuild into one unminified ESM file,
with the library packages and the polyfill external. A 5,000-file app loaded as 5,000
ESM modules would time Node's module loader; one file times the app's own top-level code,
decorators and registration included. Meridian-8 is one file, so the method agrees with
the existing timings.

Every scale cell compiles with `importHelpers: true` and `tslib` installed. Without it
`tsc` emits its decorator helpers (`__decorate`, `__metadata`, `__param`,
`__esDecorate`, `__runInitializers`) once per file, and the one-file-per-class and
one-file-per-module layouts would charge the three decorator libraries for hundreds of
helper copies in load time and bundle bytes. NexusDI `plain` and awilix emit no helpers,
so the setting changes nothing for them. `libraries.json` records it as a harness-wide
setting and the methodology states it.

### 6.2 Steady `get()`

`src/scale/worker.mjs` is a long-lived worker per library and size on the `mixed` graph
(so the container holds every kind). Its setup builds the app and resolves every
provider. One operation, `get-cycle`, calls `get` on the next index of `entries`, cycling.
Cycling over all entries keeps one hot token from turning the figure into a single
inline-cache hit; Meridian-8's `resolve-singleton` covers the hot token. The sampler,
calibration, 100 warm-up and 1,000 measured iterations, the 2 ns floor and the sink are
those of section 4.7 of the launch spec, through `interleave` and `serveSamples`.

### 6.3 Bundle bytes

Deterministic, in `scale.json`. For each library on `mixed` at every size, the `tsc`
output is bundled with core D12's esbuild flags (`--bundle --minify --format=esm`,
library included), as `size.ts` does for Meridian-8, and gzipped at level 9. The entry
imports `app.ts`, calls `create`, resolves `target` and assigns the result to
`globalThis`, so no bundler drops the graph. `perProvider` is
`(bytes(5,000) − bytes(1,000)) / 4,000`, for minified and for gzip bytes: the marginal
cost of one more provider, with the library's fixed size out of the figure.

### 6.4 Growth

A single log-log fit over 50 to 5,000 reads a library with a large fixed cost as
sub-linear, because the fixed cost dominates the small sizes. NexusDI has the largest
fixed cost of the five (its validation passes), so one exponent per library would flatter
NexusDI. The suite publishes one local exponent per adjacent pair of sizes:

`b(lo, hi) = log(R) / log(hi / lo)`, where `R` is `pairedRatio(t_hi, t_lo, seed)`, the
median over rounds of the same library's time at `hi` over its time at `lo` in the same
round. The interval is the ratio's bootstrap interval through the same transform. The
exponent table shows `b(50, 200)`, `b(200, 1,000)` and `b(1,000, 5,000)` for `startup`
and `ready`; the text reads growth from `b(1,000, 5,000)`. `pairedRatio` is `bench-kit`'s,
so the suite adds no bootstrap code.

Beside it, the marginal cost per provider: `(median(5,000) − median(1,000)) / 4,000` in ns
for `startup` and in bytes for `heap-ready`.

### 6.5 What each figure is

| Metric          | Unit  | Source        | Paired ratio | Shapes                     |
| --------------- | ----- | ------------- | ------------ | -------------------------- |
| `load`          | ns    | fresh process | no           | all                        |
| `create`        | ns    | fresh process | no           | all                        |
| `first-get`     | ns    | fresh process | no           | all                        |
| `rest`          | ns    | fresh process | no           | all                        |
| `first-resolve` | ns    | fresh process | yes          | all                        |
| `ready`         | ns    | fresh process | yes          | all                        |
| `startup`       | ns    | fresh process | yes          | all; headline on `mixed`   |
| `heap-ready`    | bytes | fresh process | yes          | all                        |
| `get-cycle`     | ns    | worker        | yes          | `mixed`                    |
| bundle bytes    | bytes | `scale.json`  | no           | `mixed`                    |

## 7. Sampling

### 7.1 Fresh-process blocks

One block per shape, holding every passing cell of that shape at all four sizes: 20
participants on `wide` and `mixed`, 12 on `mixed-async`. One round spawns one child per
participant, one at a time, in the round's `orderFor(round, participants, seed)` row, and
waits for each to exit. 10 warm-up rounds run first and are recorded in the raw file.
Measured rounds follow: 1,000 on `mixed`, 200 on `wide` and `mixed-async`.

Pairs never cross a round, and rounds never cross a block, so a block is independent of
the others. Blocks run `mixed`, then `wide`, then `mixed-async`. The paired ratio of a
competitor is NexusDI `plain`'s figure over the competitor's at the same size in the same
round, `pairedRatio(nexus, other, seed)`, block size `⌈n^(1/3)⌉` (10 for 1,000 rounds, 6
for 200).

A block that mixes sizes in each round keeps the curves honest: a runner that slows over
the hour slows every size equally. Size-ordered blocks would put the slow minutes on
5,000 and inflate every exponent.

### 7.2 Process isolation

The fresh process is the isolation for every startup metric: no JIT state, no heap and no
global container carries from one sample to the next. That also removes two state
problems a long-lived worker would have at scale: tsyringe's `@singleton()` and
`@registry` classes register in the process-wide container at import, and
`instanceCachingFactory` caches in a closure that `clearInstances()` does not reset.

Steady `get()` runs in long-lived workers, one per library and size, so a worker's heap
and JIT state belong to one library.

### 7.3 Floor and failures

`checkFloor` applies to `get-cycle`. A child that exits non-zero, or a worker that throws,
fails the run with the cell, block and round in the message, as `cold-start.ts` does.

## 8. Results files

### 8.1 `results/scale.json`

Deterministic: no timestamp, sorted, written through `writeResult` and held by `--check`.

```ts
interface ScaleGraphRow {
  shape: Shape;
  size: number;
  hash: string;
  providers: number;
  edges: number;
  modules: number;
  maxDepth: number;
  meanFanOut: number; // rounded to 0.01
  maxFanOut: number;
  maxFanIn: number;
  kinds: Record<ProviderKind, number>;
  target: number;
  targetClosure: number;
}

interface ScaleCell {
  library: LibraryId;
  variant: Variant;
  shape: Shape;
  size: number;
  outcome: Outcome;
  /** For not-applicable: the reason from libraries.json. */
  message?: string;
}

interface ScaleSizeRow {
  library: LibraryId;
  variant: Variant;
  shape: 'mixed';
  size: number;
  minified: number;
  gzip: number;
}

interface ScalePerProvider {
  library: LibraryId;
  variant: Variant;
  shape: 'mixed';
  bytes: 'minified' | 'gzip';
  perProvider: number; // rounded to 0.01
}

interface ScaleFile {
  schema: 1;
  versions: Versions & { bundlers: { esbuild: string }; tslib: string };
  graphSeed: number;
  graphs: ScaleGraphRow[];
  cells: ScaleCell[];
  sizes: ScaleSizeRow[];
  perProvider: ScalePerProvider[];
}
```

`cells` covers every shape at 50, 200 and 1,000, and `mixed` at 5,000 (section 10 gives
the reason). Rounding keeps the file identical across machines whose last floating-point
bits differ.

### 8.2 `results/scale/<YYYY-MM-DD>-<sha7>.json`

One per published run, never edited after its pull request merges, as section 4.10 rules
for `results/timings/`. A separate directory keeps "the newest file in
`results/timings/`" meaning the Meridian-8 run.

```ts
type ScaleMetric =
  | 'load'
  | 'create'
  | 'first-get'
  | 'rest'
  | 'first-resolve'
  | 'ready'
  | 'startup'
  | 'heap-ready'
  | 'get-cycle';

interface ScaleTimingRow {
  metric: ScaleMetric;
  library: LibraryId;
  variant: Variant;
  shape: Shape;
  size: number;
  toolchain: 'tsc';
  unit: 'ns' | 'bytes';
  /** Operations per sample: 1 for fresh-process metrics. */
  batch: number;
  stats: Stats;
  /** Only on first-resolve, ready, startup, heap-ready and get-cycle. */
  vsNexus?: PairedRatio;
}

interface ScaleGrowth {
  metric: 'startup' | 'ready';
  library: LibraryId;
  variant: Variant;
  shape: Shape;
  from: number;
  to: number;
  exponent: number;
  low: number;
  high: number;
}

interface ScaleMarginal {
  metric: 'startup' | 'heap-ready';
  library: LibraryId;
  variant: Variant;
  shape: Shape;
  /** ns or bytes per provider between 1,000 and 5,000. */
  perProvider: number;
}

interface ScaleTimingsFile {
  schema: 1;
  sha: string;
  startedAt: string;
  versions: Versions;
  runner: Runner;
  seed: number;
  graphSeed: number;
  /** Shape, size and hash of every graph timed, matching scale.json. */
  graphs: Array<{ shape: Shape; size: number; hash: string }>;
  /** One fresh-process design per shape, so each records its own round count. */
  design: { 'fresh-process': Record<Shape, Design>; 'steady-get': Design };
  results: ScaleTimingRow[];
  growth: ScaleGrowth[];
  marginal: ScaleMarginal[];
}
```

`schema.ts` gains `Shape`, the two kinds `'scale'` and `'scale-timings'`, their
validators, and `minimums('scale-timings')`: `fresh-process.mixed` at least 1,000
measured, `fresh-process.wide` and `fresh-process.mixed-async` at least 200, `steady-get`
at least 1,000. `writeResult`'s `kind` union gains `'scale'`.

A reader cross-checks a timing file against `scale.json`: every `graphs[].hash` must
equal the committed hash for that shape and size, or the page labels the run as made with
an older generator. `render.ts --check` enforces it.

### 8.3 Raw samples

`results/raw/scale-<date>-<sha7>.json.gz` holds `{ seed, graphSeed, blocks, steady }`
with every round's phase values, warm-up included, so a rerun of the statistics
reproduces each interval. Committed on tag runs and uploaded as an artifact otherwise,
as `raw/` is today.

### 8.4 `libraries.json`

Each library gains:

- `moduleForm`: `'modules'` (NexusDI), `'container-modules'` (InversifyJS), `'registry'`
  (tsyringe) or `'registration-functions'` (awilix, needle-di), with `moduleNote` for the
  departure;
- `notApplicable['async-factory']` with the reason, for tsyringe and awilix;
- claims for the module and async-factory forms, each with its source URL and
  `verifiedAgainst`, which the `libraries-claims` guard already holds to the pin.

`Library` in `libraries.ts` gains the two fields.

## 9. Rendering

`src/scale/render.ts` reads `scale.json` and the newest `results/scale/` file and writes:

- `results/scale.md`: one `startup` table per shape, rows the five libraries, columns the
  four sizes, each cell `median ms` and, for competitors, `ratio [low, high]`, with the
  shape's round count in the caption; the same for `first-resolve` and `ready` on `mixed`;
  the phase table (`load`, `create`, `first-get`, `rest` medians) for `mixed` beside the
  `create` work table of section 4.4; the growth table (local exponents with intervals and
  ns per provider); a `heap-ready` table with bytes per provider; the bundle bytes table
  with bytes per provider; the graph descriptors; the run's runner, versions and seeds.
- `results/scale-startup.svg`: `startup` median against providers on `mixed`, log-log,
  one line per library, p5 to p95 as a vertical bar at each point.
- `results/scale-bundle.svg`: gzip bytes against providers on `mixed`, log-log, one line
  per library through its four points.

The SVG writer is about 150 lines of string building in `src/scale/svg.ts`: decade ticks
for both log axes, direct labels at each line's right end (no legend box), the Okabe-Ito
palette, a `<title>` and `<desc>` for screen readers, and a `<style>` with a
`prefers-color-scheme: dark` block so the chart reads on GitHub in both themes. No
dependency is added. The implementer loads the `dataviz` skill before writing it.

Rendering is a pure function of its inputs, so `render.ts --check` regenerates the three
files and fails when they differ from the committed ones, or when the timing file's graph
hashes disagree with `scale.json`. The README links `benchmarks/results/scale.md` for now;
the root README's comparison table belongs to the launch run (section 14.1 of the launch
spec), which can link the page or read the file.

## 10. CI

### 10.1 Pull requests

`bench-check` already runs `nx run @nexusdi/benchmarks:check` on pull requests that touch
`benchmarks/**`, `libs/core/**`, `examples/toolchain-matrix/**` or `tools/bench-kit/**`.
`check` gains:

1. `node src/scale/deterministic.ts --check`: generates every graph, renders and compiles
   every cell of section 8.1's coverage, verifies it, bundles `mixed` at the four sizes,
   and fails when `scale.json` changed. Estimate: 39 compiles at 50 to 1,000 providers
   (about 4 s each with `tsc`) and 5 at 5,000 (about 25 s each), run four at a time on the
   runner's four cores: about 1.5 minutes.
2. `node src/scale/render.ts --check`.
3. `node src/scale/timings.ts --quick --sizes=50 --shapes=mixed`: 3 warm-up and 10
   measured rounds, 200 steady iterations, written to `tmp/`, validated with
   `where: 'tmp'`. It proves the child, the worker and the writer run, and gates nothing
   on the figures. About 1 minute.

`bench-check` grows by about 3 minutes. A NexusDI change that moves bundle bytes changes
`scale.json`, and the pull request commits the regenerated file, as it does for
`size.json` today.

5,000-provider equivalence for `wide` and `mixed-async` stays out of the pull request
job: 8 more 25-second compiles. The timing job verifies every cell it times, at every
size, and fails before sampling when one does not pass.

### 10.2 Schedule, dispatch and tags

A new job, `scale-timings`, runs beside `timings` with the same trigger and steps
(`release-core.ts`, then `node benchmarks/src/scale/timings.ts --seed=${{ github.run_id }}`),
`timeout-minutes: 150`, and uploads `results/scale/` and `results/raw/`. `merge` gains it
in `needs`, downloads its artifact, and runs `render.ts`. `open-results-pr.ts` adds
`benchmarks/results/scale`, `scale.md` and the two SVGs to the commit and one line naming
the scale file to the body; `scale.json` arrives with the deterministic artifact.

All sizes run in one job, so every point on a curve comes from one machine.

Estimate for one full run on the rc.0 runner class. A round of five libraries at all four
sizes takes about 2.4 s (spawns of about 60, 70, 100 and 250 ms by size); a `mixed-async`
round of three about 1.4 s.

| Step                                                            | Minutes  |
| --------------------------------------------------------------- | -------- |
| Render, compile, bundle and verify 52 cells, four at a time     | 5        |
| `mixed` block, 1,010 rounds of 20 spawns                        | 40       |
| `wide` block, 210 rounds of 20 spawns                           | 9        |
| `mixed-async` block, 210 rounds of 12 spawns                    | 5        |
| Steady `get()`, four sizes                                      | 2        |
| Statistics and write                                            | 1        |
| Total                                                           | about 62 |

The per-spawn figures start from rc.0's cold starts (27 to 82 ms) and add load and ready
time grown from Meridian-8's in-process figures; the first run records the real duration
in its pull request. The job runs in parallel with `build-scale-200` (39 minutes at rc.0),
so the workflow's wall time moves from about 47 minutes to about 70.

### 10.3 `build-scale-200`

It stays: same fixture, same `scale.ts`, same job. The scale suite times no builds at
1,000 or 5,000 providers. Build time at scale is outside this suite's goal; a narrow
`build-scale-1000` is decided after the first scale run is published (section 13).

### 10.4 Nx targets

`benchmarks/package.json` gains `scale` (`node src/scale/deterministic.ts`),
`scale-timings` (`node src/scale/timings.ts`) and `scale-render`
(`node src/scale/render.ts`), all uncached `nx:run-commands`. `check` gains the three
commands of section 10.1, and `bench` gains `scale`, `scale-timings` and `scale-render`
after the existing writers.

## 11. Implementation plan

Rules for every task: write the listed tests first and watch them fail, then implement.
`libs/core` and `tools/bench-kit` do not change. Harness files run with `node file.ts`, so
`src/` keeps erasable syntax only. Each task ends with `nx run @nexusdi/benchmarks:test`,
`lint` and `typecheck` green, and goes to review before the next starts.

Files, all new unless marked:

```
benchmarks/src/scale/
  config.ts        GRAPH_SEED, SIZES, SHAPES, ROUNDS per shape, per-shape streams
  graph.ts         the model, checkGraph, describeGraph, hash, expectedDigest
  shapes.ts        wide, mixed, mixedAsync
  render/          one renderer per library, shared class, token and counter helpers
  verify-child.mjs equivalence check, plain JavaScript
  cells.ts         render, compile, bundle and verify one cell; a pool of four
  deterministic.ts writes results/scale.json
  child.mjs        the fresh-process sample, plain JavaScript
  fresh.ts         the fresh-process block driver
  worker.mjs       steady get(), plain JavaScript
  timings.ts       the orchestrator; writes results/scale/ and raw/
  growth.ts        local exponents and marginal per-provider figures
  svg.ts           the chart writer
  render.ts        results/scale.md and the SVGs
benchmarks/fixtures/scale-adapter.d.ts
benchmarks/fixtures/__test__/fake-scale.mjs
benchmarks/src/schema.ts           (changed)
benchmarks/src/libraries.ts        (changed)
benchmarks/src/cli.ts              (changed: writeResult kind, --sizes, --shapes)
benchmarks/src/timings/cold-start.ts (changed: spawn helper extracted)
benchmarks/src/open-results-pr.ts  (changed)
benchmarks/libraries.json          (changed)
benchmarks/package.json            (changed: tslib devDependency, targets)
.github/workflows/benchmarks.yml   (changed)
```

1. Graph model and `wide`. Tests: `checkGraph` rejects a forward edge, a missing index, an
   invisible dependency; `describeGraph` on a hand-built six-provider graph gives the
   expected counts, depth, fan-in and hash; `hash` is stable across two calls and changes
   when one edge changes; `wide` at every size: provider count, leaf count, depth 1, mean
   fan-out within ±0.05 of 1.6 (n ≥ 200), no duplicate deps, same seed same hash, other
   seed other hash, and the committed hash per size (the regression lock).
2. `mixed` and `mixed-async`. Tests: module sizes in 4..16 except the last, tiers 0 to 3
   present at n ≥ 200, imports only point to lower tiers and include tier `t-1`, `core`
   hubs exported and imported by every other module, every module reachable from the
   root, kind shares within one provider of 5% and 10%, mean fan-out within ±0.15 of 1.9
   at n ≥ 1,000, visibility, `mixed-async` equal to `mixed` except kinds, async only in
   tiers 0 and 1, committed hashes. `target` and `entries` for every shape: the target is
   an entry with the largest closure.
3. `expectedDigest` and `verify-child.mjs`. Tests with `fixtures/__test__/fake-scale.mjs`,
   a hand-written adapter over a six-provider graph: `pass`; a swapped dependency gives
   `wrong-instance`; a factory that builds twice gives `built: false`; a sink registered
   as transient gives `shared: false`; a factory rendered as a class gives `kinds: false`;
   a throwing `create` gives `runtime-error` through `classify`.
4. NexusDI `plain` renderer for all three shapes. Tests: rendered `app.ts` for a
   six-provider graph and the files of a two-module graph match inline snapshots; `wide`,
   `mixed` and `mixed-async` at n = 50 type-check against the workspace core (the
   existing `scale.test.ts` pattern) and pass `verify-child`; `get` passes `{ module }`
   only for non-entries.
5. `cells.ts`: stage a cell in the consumer (`fixtureCell`) with `tslib`, compile with
   `tsc` and `importHelpers: true`, bundle with esbuild (external packages), verify; a pool
   that runs four cells at once. Tests: a pool of fake jobs never runs more than four at
   once and returns results in input order; a failing compile becomes `compile-error`
   with the throwaway path stripped, as `outcome.ts` does; a decorated two-module cell's
   bundle holds one `__decorate` definition.
6. `libraries.json` fields, claims and the `Library` type: `moduleForm`, `moduleNote`,
   `notApplicable['async-factory']`, and a claim with its docs URL for each form in the
   table of section 4.2. Tests: every library has a `moduleForm`; tsyringe and awilix have
   the async reason; the existing claims test covers the new claims. Review: the owner
   reads each claim beside its page.
7. InversifyJS `decorated` renderer. Tests: snapshot of the two-module graph;
   `--only=inversify --sizes=50` run of `deterministic.ts` gives `pass` on every shape.
8. tsyringe `decorated` renderer, with `@registry` per module. Same tests; `mixed-async`
   gives `not-applicable` with the `libraries.json` reason.
9. awilix `plain` renderer. Same tests as task 8.
10. needle-di `decorated` renderer. Same tests as task 7.
11. Schema. Tests in `schema.test.ts`: a valid `scale` and `scale-timings` file pass; a
    wrong `shape`, a missing `hash`, a `growth` entry with an unknown metric, a `vsNexus`
    on `create` each fail with their JSON path; under `results` a `fresh-process.mixed`
    of 999 fails and 1,000 passes, and a `fresh-process.wide` of 199 fails and 200 passes.
12. `deterministic.ts` and bundle bytes per provider. Tests on pure functions:
    `perProvider(rows)` from four known sizes; rounding; sorting of `graphs`, `cells`,
    `sizes`, `perProvider`; `--check` exits 1 on a changed file (reusing `writeResult`).
    Then run it, commit `results/scale.json`, and add it to `check`.
13. `child.mjs`, `fresh.ts` and the spawn helper. Extract `spawnChild(script, args,
    execArgv)` from `cold-start.ts`; `cold-start.test.ts` stays unchanged and green. Tests
    with `fake-scale.mjs`: every phase reported, all non-negative; `ready`,
    `first-resolve` and `startup` equal the sums of their phases per round; heap figures
    exclude code space (a fake that compiles a large function changes `code_space` and
    leaves `heap-ready` within 1%); a fake whose counts fall short exits 1; one block
    holds all four sizes and its rounds follow `orderFor`; warm-up rounds are excluded
    from `measured`; a child that exits 1 before sending rejects with its stderr.
14. `worker.mjs` for `get-cycle`. Tests: the fake worker answers calibrate and sample;
    the cycle visits every entry in order; `checkFloor` fails a 1 ns median.
15. `growth.ts`. Tests: for per-round times `t = 3·n^1.2` with multiplicative noise
    shared within a round, every local exponent is 1.2 to 1e-9; for `t = 100,000 + 50·n`
    the exponent `b(50, 200)` is below 0.1 and `b(1,000, 5,000)` above 0.7, the case a
    single fit would hide; the interval is identical for the same seed and contains the
    point estimate; the marginal figure of a linear set equals its slope.
16. `timings.ts`. Tests on `toScaleRows(raw, seed)`: pairs come from the same round,
    block and size; only NexusDI `plain` is the reference; `load`, `create`, `first-get`
    and `rest` carry no `vsNexus`; derived metrics are summed per round before the
    median; `not-applicable` cells produce no rows. Then a `--quick` run locally, and the
    first full run on dispatch records its duration in the PR description.
17. `svg.ts`. Tests: decade ticks for 50..5,000 are 10, 100, 1,000, 10,000; a point at
    n = 1,000 has the expected x; the output for a fixed two-library dataset matches a
    committed file; the SVG parses as XML.
18. `render.ts` and `--check`. Tests: tables for a fixture input match a committed
    `scale.md`, round counts in the captions; a hash mismatch between the two inputs
    fails `--check` with both hashes in the message.
19. Nx targets and CI. `package.json` targets of section 10.4; `benchmarks.yml`:
    `check` gains its commands, `scale-timings` job, `merge` needs and downloads it;
    `open-results-pr.ts` adds the paths. Test: `open-results-pr` lists the scale paths
    (extract the list into a function if it is inline).
20. Disclosure. Section 4.12 of the launch spec lists "runtime graphs larger than eight
    providers" and "async factories" as not tested. Amend it to cite this suite, state
    `importHelpers`, the round counts per shape and that relative claims come from
    `mixed`. Add to `CONTRIBUTING.md`'s Benchmarks heading that a renderer change is
    reviewed like a fixture change: a person reads the generated `app.ts` at n = 50
    beside the cited page.

## 12. Open questions for the owner

None. The architect's eight questions are ruled in section 13.

## 13. Tech lead rulings (2026-10-01)

Package APIs below were read from inversify 8.2.3 (`@inversifyjs/container`), tsyringe
4.10.0, awilix 13.0.5 and @needle-di/core 1.2.1, installed at those pins.

1. Rounds. `mixed` runs 1,000 measured rounds, the minimum section 14.4 sets and the count
   Meridian-8's cold start already publishes. `wide` and `mixed-async` run 200 and print
   it; no README, docs or post claim cites them. With three shapes the run
   stays near one hour.
2. Headline. `startup` (load + ready) is the headline, with `ready` and `first-resolve`
   published beside it with ratios. tsyringe registers everything at import and needle-di
   binds lazily, so `ready` alone omits their registration work.
3. Ratios on phases. `create` and `first-get` lose their paired ratios. A `first-get`
   ratio compares NexusDI's lookup of an eagerly built instance against a competitor
   building the target's closure, which flatters NexusDI; a `create` ratio does the
   opposite. Both stay as absolute medians beside the work table.
4. Growth. The single log-log exponent goes. A fixed cost reads as sub-linear growth, and
   NexusDI has the largest fixed cost, so one exponent would flatter it. Local exponents
   per adjacent size pair, from paired per-round ratios, replace it; `ols` and the
   `bench-kit` change go with it.
5. Blocks. One block per shape holds all four sizes, so runner drift falls on every size
   alike and the exponents come from paired rounds.
6. Module form. tsyringe documents `@registry([...])` for grouping registrations, so its
   renderer uses one registry class per module and needs no departure. awilix and
   needle-di keep `register<Module>(container)`, each making one documented bulk call
   (`container.register({...})`, `container.bindAll(...)`), recorded as a departure.
7. Async. tsyringe 4.10.0 declares no async resolution and awilix 13.0.5's README sends
   async init to `awilix-manager`, so both are `not-applicable` with no emulation.
   needle-di's `getAsync` retries a sync class whose `inject()` hits an async provider;
   that retry is its documented path and is measured. InversifyJS 8.2.3's `load` is
   synchronous (`loadAsync` also exists), so `create` calls `load`.
8. Equivalence. The digest and edge identity miss two faults: a sink provider built twice
   (nothing depends on it) and a factory rendered as a class. The verify child now also
   resolves everything twice, counts constructions (exactly one each) and checks each
   provider's reported kind. The timed child checks the count total after timing.
9. Helpers. Every cell compiles with `importHelpers: true` and `tslib`. Without it, tsc
   duplicates decorator helpers per file and charges InversifyJS, tsyringe and needle-di
   for the harness's file layout in load time and bundle bytes.
10. Heap. `heap-create` goes: like `create`, it compares eager against lazy work.
    `heap-ready` keeps `base` before `load` so import-time registration counts, and the
    text no longer claims code-space exclusion isolates container bookkeeping.
11. Bundle bytes per provider is the difference quotient between 1,000 and 5,000, which
    keeps each library's fixed size out of the slope.
12. Cuts. `deep` (a 99-deep chain no app has, which penalises recursive resolvers),
    `modular` (`mixed` covers modules), `modular-flat` (a NexusDI-only diagnostic) and the
    `layered` port of `scale-200` (a refactor no curve needs) are out. `scale.ts` does not
    change.
13. Variants: documented only. The fairness rule names the documented setup, and the
    other variants already have Meridian-8 figures.
14. `build-scale-1000`: deferred until the first scale run is published; build time is
    outside this suite's goal.
15. Tables live in `benchmarks/results/scale.md`; the root README reaches them through the
    launch run's `readme.ts`. Results may not favour NexusDI, and they are published with
    the methodology either way.

## 14. Owner-brief amendments (2026-10-01)

The owner's brief names four shapes: wide and flat, deep chains, a modular app of N
modules of M providers with exports, and a realistic mix. Ruling 12 cut two of them. The
orchestrator restores both as secondary shapes. They run 200 rounds like `wide`, print the
count, and no README, docs or post claim cites them. A library that fails a shape (for
example a stack overflow on `deep`) is recorded with its outcome; that is a scaling result.

1. `deep`. `c = ⌈n/100⌉` chains of equal length (the last takes the remainder), one module,
   all classes. Provider `i` of a chain takes its predecessor in the chain, and with
   probability 0.6 one more distinct earlier provider of the same chain. Chain heads have
   no deps. Depth is `n/c - 1` edges (49 at n = 50, 99 at n ≥ 200), mean fan-out near 1.6,
   matching `wide`, so `wide` and `deep` differ only in depth.
2. `modular`. `N = n/10` modules of `M = 10` providers, all classes. Module `k > 0` imports
   one or two distinct modules drawn from `0..k-1`. Each module exports its last 3
   providers. A provider's deps: `k` from P(1) = 0.4, P(2) = 0.6 (mean 1.6), each slot an
   earlier provider of its own module with probability 0.5, else an export of an imported
   module, falling through when a pool is empty. The first provider of module 0 has no
   deps. Each library expresses modules exactly as in `mixed` (section 4.3 and ruling 6).
3. Tasks. Task 1 gains `deep` and task 2 gains `modular`, each with the matching
   structural tests (chain count and depth, module count, imports to lower modules only,
   export count, visibility, mean fan-out within ±0.05 of 1.6 at n ≥ 1,000, committed
   hashes). Every renderer task covers all five shapes. The schema accepts the two shapes
   with a 200-round minimum.
4. Results README. `render.ts` also maintains a "Scaling" section in
   `benchmarks/results/README.md` between generated markers: the startup and gzip-bytes
   table per size and library for `mixed`, links to the SVG charts and to `scale.md`.
   `--check` covers it.
5. Core ref. Profiling found NexusDI's visibility pass grows with modules × tokens (a
   300-provider, 32-module app: 7.6 ms warm, 26.5 ms cold), which a single-module shape
   hides. `mixed`, `mixed-async` and `modular` carry real cross-module imports and exports
   at every size, so the suite exposes it. A fix may change `libs/core` without changing
   its version string, so `results/scale/<date>-<sha7>.json` records `coreRef`: the ref
   passed to `release-core.ts --ref` (or `workspace`) and the git tree SHA of `libs/core`
   that was packed. `render.ts` prints both in the caption. The suite can measure two
   cores by running `release-core.ts --ref <ref>` before each run; results from two refs
   live in two files.
