# Benchmarks: the scale suite

Status: amended by the tech lead's rulings (sections 13 and 15); ready for planning.
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

1. Sizes are 50, 200, 1,000, 2,500 and 5,000 providers. 2,500 is real-app scale: the
   largest applications measured hold 1,200 to 2,250 providers of their own, more with
   library providers. 5,000 is headroom past every application measured, and no README,
   docs or post claim cites it.
2. Shapes are `wide`, `mixed` and `mixed-async` (section 3). `mixed` is the realistic
   shape and the headline, calibrated against 22 measured applications (section 15).
   `wide` is the single-module control: no library needs a module form, so no departure
   from any library's docs applies to it. `mixed-async` is `mixed` with its lowest-index
   5% of factories made async, measured only for libraries that document async
   factories.
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
9. One fresh-process timing block per shape holds every size, so drift on the runner falls
   evenly on every size, and growth exponents come from paired per-round ratios between
   sizes (section 6.4). A serial heap block of its own per shape produces `heap-ready`
   (section 7.1).
10. `mixed` runs 1,000 measured rounds, the published minimum of section 14.4, until the
    width rule of section 7.4 decides a count from the first run. `wide`, `deep`,
    `modular` and `mixed-async` run 200, and their tables print the round count.
    Relative claims in the README, the docs and the launch post come from `mixed` only.
11. Two new results files: `results/scale.json` (deterministic, committed, held by
    `--check`) and `results/scale/<date>-<sha7>.json` (one per published run, like
    `results/timings/`). Raw samples go to `results/raw/scale-<date>-<sha7>.json.gz`.
12. `src/scale/render.ts` writes `results/scale.md` and two SVG charts with no new
    dependency. The charts are log-log: startup time against providers, and gzip bundle
    bytes against providers.
13. Pull requests run the deterministic writer with `--check` and a 50-provider timing
    smoke under `tmp/` in both child modes. The timing run is one job per shape plus a
    steady job (section 10.2). `build-scale-200` and `scale.ts` stay as they are.
14. The child has a timing mode and a heap mode (section 6.1). Timing rounds drop the heap
    settles, which halve the cost of a round, and a paired protocol check on the first
    dispatch run decides whether that changes any comparison (section 7.4).

## 3. The graphs

### 3.1 The model

`src/scale/graph.ts` declares the one graph type every shape produces and every renderer
reads:

```ts
type ProviderKind = 'class' | 'factory' | 'async-factory' | 'value' | 'alias';

interface ScaleProvider {
  /** 0..n-1; also the order of the token table in every rendered app. */
  index: number;
  /** p<index>, zero-padded to the width of n-1, e.g. p0042. */
  name: string;
  kind: ProviderKind;
  /** Indexes, in constructor order. A value has none and an alias one. */
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
  /** The provider with the largest transitive closure in the whole graph, lowest index on a tie. */
  target: number;
}
```

An `alias` provider has exactly one dep, the provider it aliases, and shares that
provider's instance; it constructs nothing, like a value. The target is any provider, not
only an entry: real apps reach their largest closure through a provider the framework
resolves inside its module, and NexusDI's adapter already passes `{ module }` for a
provider outside `entries`. The four competitors are flat and need no change.

Every dependency points to a lower index, so the graph is acyclic by construction and a
renderer can emit providers in index order. `checkGraph(graph)` asserts that, that an
alias has one dep, and that every dependency is visible: in the provider's own module, or exported by a module its
module imports directly. NexusDI enforces that rule, so a graph that breaks it would not
compile in NexusDI and would compile everywhere else.

`describeGraph(graph)` returns the figures `scale.json` records: provider, edge and module
counts, maximum depth in edges (an alias hop counts as an edge, since every container does
a lookup per hop), mean and maximum fan-out, maximum fan-in, the count of each kind, the
target and its closure size, and `hash`: the first 12 hex digits of the SHA-256
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

The realistic shape, calibrated against a census of 22 real applications (section 15).
Every parameter below is a named constant in `src/scale/shapes.ts` that cites the measured
figure it follows.

- Module sizes are log-normal: `round(exp(ln 3 + 1.18 z))`, `z` a standard normal draw,
  clamped to 1 to 250. The NestJS pool (1,350 modules) has median 3 and mean 6, and the
  largest module measured holds 243 providers. Core takes at least 3 so the hubs fit, the
  last module takes the remainder, and modules sit in index order.
- There are `T = max(4, round(sqrt M))` tiers for `M` modules, and module `k` sits in tier
  `floor(T k / M)`. The tier count is the lever that fits the measured depth bands.
- Module 0 is `core`, tier 0, with three exported hub providers: `config` (a value),
  `clock` (a factory with no deps) and `logger` (a class taking `config`). Every other
  module imports `core`, one module of tier `t - 1` where one exists besides core, and
  `draw - 1` extra imports, `draw` taken from the bins 1: 20%, 2: 25%, 3: 20%, 4 to 6:
  25%, 7 to 12: 10% (about 4.4 imports per module, the pooled NestJS figure, which counts
  library modules and so is a ceiling). An extra import comes from tiers `t - 2` and
  `t - 1` with probability 0.8, else from any lower tier. Only NexusDI expresses module
  imports at runtime, so a mean above the measured one would charge NexusDI work no other
  library does.
- A module exports its last `⌈0.3 size⌉` providers (the pooled NestJS exports over
  providers is 38%; core also exports the three hubs).
- Each provider's kind: exactly `round(0.05 n)` values, `round(0.1 n)` factories and
  `round(0.05 n)` aliases, hubs included (`config` is a value, `clock` a factory, `logger`
  a class), the rest classes, with the other kinds shuffled over the remaining indexes. A
  value has no deps. An alias points at one earlier provider of its own module or an
  export of a module it imports, never a hub; with neither visible it becomes a class.
  The measured alias share runs from under 2% (NestJS) to 8% (bitwarden, gauzy-ui) and
  30% (Theia).
- A class or factory takes a number of deps drawn from the pooled histogram of 10,740
  providers: 0: 20%, 1: 27%, 2: 19%, 3: 10%, 4: 7%, 5 to 8: 11%, 9 to 16: 5%, 17 to 48:
  1%, uniform inside a bin, capped at `min(48, round(sqrt n))` (the widest constructor of
  an app tracks sqrt n up to 1,229 providers and then flattens: n8n 46, twenty 36, Theia
  31).
- Each dependency slot draws a hub with probability 0.15, an export of an imported module
  with 0.6 and an earlier provider of its own module with 0.25; a slot skips a dependency
  the provider already has. An empty pool falls to the other non-hub pool first and to the
  hubs last, because the hubs are dead ends: an empty own-module slot that fell to the
  hubs pinned the closure at 3 to 15% of the graph. A provider whose pools are all empty
  gets fewer deps.

All providers are singletons. Transient and scoped lifetimes stay with Meridian-8; at
scale every library's ready work is its singletons. Each renderer sets the singleton
lifetime explicitly where the library's default is transient (InversifyJS
`inSingletonScope()`, awilix `.singleton()`, tsyringe `@singleton()` and
`instanceCachingFactory`); NexusDI and needle-di default to singletons.

### 3.4 `mixed-async`

The `mixed` graph with the same seed and structure, where the lowest-index
`round(0.05 n)` factories are `async-factory`. Lowest index is lowest tier, where every
measured async factory sits (infrastructure: a database connection, a cache, a feature
flag client), and `clock` stays async at every size. The async factory awaits one resolved promise
(`await Promise.resolve()`) and then constructs. It takes no timer and no I/O, so the
figure measures each library's async machinery. `scale.json` records the async share
(5% at every size, an upper bound: the measured median app has none and the maximum is
4%).

## 4. Rendering each library's idiom

### 4.1 Layout of a generated app

The renderers in `src/scale/render/<library>.ts` turn a `ScaleGraph` into TypeScript
files:

- `wide`, `deep`: one class per file, as `scale-200` does.
- `mixed`, `mixed-async`, `modular`: one file per module holding its classes, factories,
  values and its module or registration code.
- `tokens.ts` where the library's idiom uses tokens.
- `app.ts`, which exports the `scale` adapter of section 4.4 and builds nothing at
  import.

Each class has `readonly id = '<name>'` and one field per dependency, `d0`, `d1`, ..., in
constructor order, assigned in the constructor. Factories return `new <Class>(...)` of a
class shaped the same way. A value is `{ id: '<name>' }`. Fields are declared explicitly,
with no parameter properties, as section 4.2 of the launch spec requires. The constructor
of every class provider and the body of every factory end with
`__scaleBuilt(<index>, '<kind>')`, a counter the adapter exports (section 5). The class a
factory returns does not call it: the factory body reports, so every non-value provider
counts exactly one construction. The call is identical in every library and does one
array increment per construction.

### 4.2 The five documented variants

Each renderer follows the library's Meridian-8 fixture for every construct that fixture
uses, and the library's documentation (cited in a header comment of the generated
`app.ts` and in `libraries.json`) for modules and async factories, which Meridian-8 does
not use.

| Library and variant     | Class providers                                                                        | Factory and value providers                                                 | Module form                                                                                      | Async factory                                       |
| ----------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| NexusDI `plain`         | `Token<IFoo>`, class `implements IFoo` with `static deps`, `provide(T, { useClass })`  | `provide(T, { useFactory, deps })`, `provide(T, { useValue })`              | `defineModule({ name, imports, providers, exports })` per module, root `App` imports the sinks   | `useFactory: async (...) => ...`, built in `create` |
| InversifyJS `decorated` | `@injectable()`, `@inject(Class)` per parameter, `bind(C).toSelf().inSingletonScope()` | `toResolvedValue(fn, [ids]).inSingletonScope()`, `toConstantValue`          | one `ContainerModule` per module, `container.load(...)` (synchronous in 8.2.3)                   | `toResolvedValue(async fn)`, `getAsync`             |
| tsyringe `decorated`    | `@singleton()`, constructor types (metadata), `@inject(token)` for tokens              | `{ token, useFactory: instanceCachingFactory(...) }`, `{ token, useValue }` | one `@registry([...])` class per module file, registered at import                               | not applicable                                      |
| awilix `plain`          | `asClass(C).singleton()`, PROXY cradle constructor, `strict: true`                     | `asFunction(fn).singleton()`, `asValue`                                     | one `register<Module>(container)` function per module file, one `container.register({...})` each | not applicable                                      |
| needle-di `decorated`   | `@injectable()`, `inject(Class)` fields, bound on first `get`                          | `{ provide, useFactory }`, `{ provide, useValue }`                          | one `register<Module>(container)` function per module file, one `container.bindAll(...)` each    | `{ provide, async: true, useFactory }`, `getAsync`  |

The API forms in this table were read from the packages at the pins (section 13). Task 6
records each as a claim in `libraries.json` with its documentation URL.

An alias (section 3.3) uses the library's documented redirect, each recorded as a claim
with its page: NexusDI `provide(T, { useExisting: U })`, InversifyJS `bind(T).toService(U)`
(it returns `void` and takes no scope, so the renderer omits `inSingletonScope()`),
tsyringe `{ token, useToken: U }` in the module's `@registry`, awilix `aliasTo('u')` (its
resolver is leak safe, so `strict: true` raises no lifetime error for a singleton that
depends on it) and needle-di `{ provide, useExisting: U }`. The four competitors need a
non-class token for an alias, and take the token type their Meridian-8 fixture uses for
`NAV_CHARTS`, as for factories and values. Each renderer declares a type alias of the
alias's target type, so a dependant names the one type the instance has.

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
  readonly built: {
    readonly counts: Uint32Array;
    readonly kinds: readonly (string | undefined)[];
  };
  create(): H | Promise<H>;
  /** Synchronous get by provider index, through a token table built at load. */
  get(handle: H, index: number): unknown;
  /** Only where the graph has async providers and the library resolves them with getAsync. */
  getAsync?(handle: H, index: number): Promise<unknown>;
}
```

`create` does what each library's documented setup does before the first `get`:

| Library     | `create` does                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| NexusDI     | `await Nexus.create(App)`: compiles the blueprint (all validation passes) and builds every singleton (eager by default) |
| InversifyJS | `new Container()`, then `load` of every `ContainerModule` (`wide`: one `bind` per provider)                             |
| tsyringe    | nothing: `@singleton()` classes and `@registry` classes registered on the global container at load                      |
| awilix      | `createContainer({ injectionMode: PROXY, strict: true })` and the `register<Module>` calls                              |
| needle-di   | `new Container()` and the `register<Module>` calls; `@injectable()` classes bind on first `get`                         |

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
  value never constructs, so its count is 0 and its object is the module constant). An
  alias never constructs either: its count is 0, and `get(alias)` returns `get(target)`'s
  instance, so for an alias `shared` checks identity with its target and the digest line
  stays `<alias>(<target>)`, with a dependant of an alias naming the alias.

`expectedDigest(graph)` computes the same digest from the model. A cell is `pass` when all
four hold, `wrong-instance` when any fails, and `runtime-error` or `compile-error` as the
matrix classifies them (`outcome.ts`). Only `pass` cells are timed.

The `kinds` check stops a renderer from turning a factory into a class or a value into a
factory, which the digest cannot see. A person still reads each renderer's generated
`app.ts` at n = 50 beside the cited docs page (task 20), because no runtime check can
prove a form is the documented one.

## 6. Metrics

### 6.1 Fresh-process metrics

`src/scale/child.mjs` runs under `node --expose-gc`, one process per sample, with every
`NODE_*` and `UV_*` variable removed from its environment (compile cache, options and
thread-pool size would each change what a fresh process does). It takes a mode:

- `heap` runs steps 1 to 9 as written below and is the only mode that reads the heap.
- `timing` replaces step 2 with `gc()` twice and skips step 7, so it sends no `heapReady`.
  A real app neither pauses nor collects twenty times before it loads its code, so this is
  the closer model of a cold start, and it halves the cost of a round: the settles are
  52% of a heap-mode round.
- `timing-no-gc` is `timing` without the `gc()` of step 4, which the protocol check of
  section 7.4 compares with `timing`.

The steps:

1. Imports the cell's `packages.mjs`, untimed. `bundleCell` writes it beside the bundle
   from the bundle's external imports, `reflect-metadata` first, so every package
   resolves from the cell as the bundle's own imports do. Library import time is already
   the cold-start figure.
2. Heap mode reads the retained heap (`base`) after a settle loop: pause 10 ms, `gc()`
   twice, read, and stop when two reads in a row are equal or after ten passes. At this
   read the loop's own allocations (0.1 to 5 KB per pass) keep any two reads apart, so the
   base read always makes all ten passes. The final read of step 7 usually stops after
   four. Both reads hold the same loop allocations, so they cancel in `heap-ready`. The
   loop waits for V8's background work: concurrent compile jobs still running at this read
   made `heap-ready` negative in 6 of 180 parallel runs. The array of indexes step 6
   resolves is built before this read from the model's provider count and target, so it
   sits in `base`.
3. Times `await import(bundle)`: `load`.
4. `gc()` twice. Times `create`: `create`.
5. Times `get(target)`: `first-get`.
6. Times resolving every other provider once, in index order: `rest`.
7. Heap mode reads the heap the same settled way, with the handle still referenced:
   `heap-ready` = heap − `base`.
8. Checks, untimed, that `built.counts` sums to the number of non-value providers, and
   exits 1 when it does not.
9. Sends `{ load, create, firstGet, rest }`, with `heapReady` in heap mode, and disconnects
   from the send callback (a disconnect straight after `send` lost a 200 KB message in 60
   of 60 runs).

Derived, per round before any median: `first-resolve` = `load` + `create` + `first-get`,
the time until the target is usable; `ready` = `create` + `first-get` + `rest`;
`startup` = `load` + `ready`. The `gc()` calls and the settling pauses sit between timed phases, never inside one.
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
those of section 4.7 of the launch spec, through `interleave` and `serveSamples`. The
workers of one size run with `sharedBatch`, so every library runs the largest batch any
of them calibrated and amortises the per-batch costs over the same count. The worker
exits 1 on an app that has `getAsync`: `get-cycle` runs on `mixed`, which has no async
providers, and an async `get` would put a microtask turn in every run.

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
exponent table shows `b(50, 200)`, `b(200, 1,000)`, `b(1,000, 2,500)` and
`b(2,500, 5,000)` for `startup` and `ready`; the text reads growth from `b(1,000, 2,500)`,
the range of real apps, and calls `b(2,500, 5,000)` headroom. `pairedRatio` is `bench-kit`'s,
so the suite adds no bootstrap code.

The sizes live in one list, `SIZES` in `src/scale/config.ts`; the exponent table has one
column per adjacent pair of it, so each size added there adds its column. 2,500 and
5,000 each add their column. Per-provider figures stay on 1,000 to 5,000.

Beside it, the marginal cost per provider: `(median(5,000) − median(1,000)) / 4,000` in ns
for `startup` and in bytes for `heap-ready`.

### 6.5 What each figure is

| Metric          | Unit  | Source        | Paired ratio | Shapes                   |
| --------------- | ----- | ------------- | ------------ | ------------------------ |
| `load`          | ns    | fresh process | no           | all                      |
| `create`        | ns    | fresh process | no           | all                      |
| `first-get`     | ns    | fresh process | no           | all                      |
| `rest`          | ns    | fresh process | no           | all                      |
| `first-resolve` | ns    | fresh process | yes          | all                      |
| `ready`         | ns    | fresh process | yes          | all                      |
| `startup`       | ns    | fresh process | yes          | all; headline on `mixed` |
| `heap-ready`    | bytes | fresh process | yes          | all                      |
| `get-cycle`     | ns    | worker        | yes          | `mixed`                  |
| bundle bytes    | bytes | `scale.json`  | no           | `mixed`                  |

## 7. Sampling

### 7.1 Fresh-process blocks

Each shape runs two serial blocks of the cells that pass, at every size: 25 participants
on `wide`, `deep`, `modular` and `mixed`, 15 on `mixed-async`. One round spawns one child
per participant, one at a time, in the round's `orderFor(round, participants, seed)` row,
and waits for each to exit.

- The timing block runs the child in timing mode: 10 warm-up rounds, recorded in the raw
  file, then 1,000 measured rounds on `mixed` and 200 on the other shapes. It produces
  every metric but `heap-ready`.
- The heap block runs the child in heap mode: 3 warm-up and 30 measured rounds, with its
  own `orderFor` rows. It produces `heap-ready`, its paired ratios and its marginal bytes
  per provider, from rounds of 0.7% interval width or less, with block size 4. The block
  also records the startup of its heap-mode spawns, beside the timing block's, in the raw
  file: an unpaired cross-check that nothing gates on.

Pairs never cross a round, and rounds never cross a block, so a block is independent of
the others. The paired ratio of a competitor is NexusDI `plain`'s figure over the
competitor's at the same size in the same round, `pairedRatio(nexus, other, seed)`, block
size `⌈n^(1/3)⌉` (10 for 1,000 rounds, 6 for 200). A job prints one progress line per 50
rounds, so a stall shows in its log.

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

### 7.4 Protocol check and the width rule

**Protocol check.** Dropping the settles must not change a comparison. No local run can
resolve a shift of 5% in one library (the 95% interval of a per-cell ratio on a loaded
laptop spans 10% or more), so the check runs on the CI runner, on the first dispatch run
only, behind `timings.ts --protocol-check`. After the `mixed` timing block, 33 rounds (3
warm-up) run every `mixed` cell in three modes: `heap`, `timing` and `timing-no-gc`. Each
round follows its own `orderFor` row over all 75 spawns, and the raw file records every
spawn. For each competitor and size the run reports two double ratios on `startup`, each
with a paired bootstrap interval: per round, NexusDI's shift between two modes divided by
the competitor's, so a shift every library shares cancels.

- Timing over heap decides the protocol. A pair passes when its median is within 2% of 1
  or its interval contains 1. The timing mode stands when every pair passes. Otherwise the
  timing rounds revert to the heap mode's protocol, the timing figures of the run are not
  published (`validate` refuses the file), and the budget is planned again.
- Timing-no-gc over timing decides the `gc()` before `create`, by the same rule. When
  every pair passes, the `gc()` stays (it lowers variance and changes no comparison).
  Otherwise the timing mode drops it, because a real app collects the garbage its own
  load leaves during `create`; `TIMING_MODE` in `config.ts` becomes `timing-no-gc` with a
  spec change. `create` and `first-get` are published as absolute medians with no ratio,
  so the coupling of phases that this mode adds changes no published comparison.

The result goes into the timing file (`protocolCheck`) and the rendered page.

**Width rule.** A round count chosen after seeing data opens forking paths when the choice
can depend on the estimate. The stopping quantity here is an interval width, which for a
median of paired ratios is close to independent of the point estimate, and the rule is
fixed before the first dispatch run:

- The metric set: every `mixed` paired ratio on `startup`, `ready`, `first-resolve` and
  `heap-ready`, and every `mixed` growth ratio.
- The prefixes: the first 100, 200, 300, 400, 600 and 1,000 measured rounds of the timing
  block. The run records the maximum relative width (interval over median) of the metric
  set at each prefix (`prefixWidths`), with the metric that has it.
- The target is 3% for `mixed`, with a margin of 1.5: the chosen count is the smallest
  prefix whose maximum width is at most 2%, never below 300, rounded up to a multiple of
  the block's Williams row count (50 rows for 25 participants, so 300 and 400 already
  qualify).
- The first run publishes at 1,000 rounds, fixed in advance. The rule applies once, from
  that run's prefix table, and the count it gives and the table are recorded in this
  section with a change to `SCALE_MINIMUM_ROUNDS`. If no prefix meets 2%, the count stays
  at 1,000. Later runs never change the count; a later change needs a spec change with its
  own reason. `SCALE_MINIMUM_ROUNDS` keeps `mixed` at 1,000 until that change.
- The other shapes stay at 200 rounds with a 10% target, reported and not used to change
  their count. `heap-ready` keeps its 30 measured rounds.

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

`cells` covers every shape at 50, 200, 1,000 and 2,500, and `mixed` at 5,000 (section 10 gives
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
  seed: number;
  graphSeed: number;
  /** SHA-256 of the scale.json the run validated against. */
  scaleSha256: string;
  /** The machine and wall time of each block: each shape runs in its own job. */
  blocks: Array<{
    block: Shape | 'steady-get';
    runner: BlockRunner;
    wallMs: number;
  }>;
  /**
   * The ref release-core.ts restored, or 'workspace', and the git tree SHA of the
   * libs/core that was packed. A ref counts only when its tree is the one packed.
   */
  coreRef: { ref: string; tree: string };
  /** Shape, size and hash of every graph timed, matching scale.json. */
  graphs: Array<{ shape: Shape; size: number; hash: string }>;
  /** Every cell attempted, with `message` required when `outcome` is not `pass`. */
  cells: ScaleCell[];
  /** One fresh-process design per shape, with its heap block's design beside it. */
  design: {
    'fresh-process': Record<Shape, Design & { heap: Design }>;
    'steady-get': Design;
  };
  results: ScaleTimingRow[];
  growth: ScaleGrowth[];
  marginal: ScaleMarginal[];
  /** The maximum interval width at each prefix of a block's rounds (section 7.4). */
  prefixWidths?: PrefixWidth[];
  /** The paired protocol check of the first dispatch run (section 7.4). */
  protocolCheck?: ProtocolCheck;
}

/** `Runner` plus the runner image and the kernel; the CPU can differ between jobs. */
interface BlockRunner extends Runner {
  imageOs?: string;
  imageVersion?: string;
  kernel: string;
}
```

`schema.ts` gains `Shape`, the two kinds `'scale'` and `'scale-timings'`, their
validators, and `minimums('scale-timings')`: `fresh-process.mixed` at least 1,000
measured, the other shapes at least 200, each shape's `heap` design at least 30, and
`steady-get` at least 1,000. `design.timingMode` records the child mode of the timing blocks. Under `results/`, `validate`
recomputes each protocol double's `pass` from its ratio, then `timingStands` and
`gcBeforeCreate` from those, and refuses a stored value that differs. It also refuses a
file whose `timingStands` is false, and one whose `gcBeforeCreate` is `drop` while
`timingMode` is `timing`. `writeResult`'s `kind` union gains `'scale'`.

`results`, `growth` and `marginal` hold entries for passing cells only, and a growth entry
joins two neighbours in `SIZES`. Under `results/`, every NexusDI `plain` cell passes, and
a competitor cell that does not pass is `not-applicable`, or a `runtime-error` or
`compile-error` above n = 50 where the same library, variant and shape passes at 50.

One job writes one part (`results/scale-parts/<part>.json` and its raw samples), and
`timings.ts --merge` writes the file. The merge refuses unless every part has the same
`sha`, `seed`, `graphSeed`, `coreRef`, `versions` and `timingMode`, the SHA-256 of the `scale.json` each
validated against equals the merge job's copy, the graph hashes match `scale.json`, every
shape and the steady part appear once, the steady part judged each `mixed` cell as the
`mixed` part did, and the SHA-256 of each `mixed` bundle the steady part timed equals the
`mixed` part's (esbuild's path comments are reduced to the file below `out/tsc` or
`node_modules` before hashing), because get-cycle and startup must time the same code.
Nothing requires the runner images or CPUs to be equal. A "re-run failed jobs" of one
shape is allowed: the checks above still hold and the block stays on one machine.

A reader cross-checks a timing file against `scale.json`: every `graphs[].hash` must
equal the committed hash for that shape and size, or the page labels the run as made with
an older generator. `render.ts --check` enforces it.

### 8.3 Raw samples

`results/raw/scale-<date>-<sha7>.json.gz` holds `{ seed, graphSeed, coreRef, parts }`, a
raw part per job (`blocks`, with each shape's heap block, `steady` and the protocol-check
spawns), with every round's phase values, warm-up included, so a rerun of the statistics
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

- `results/scale.md`: one `startup` table per shape, rows the five libraries, columns the sizes, each cell `median ms` and, for competitors, `ratio [low, high]`, with the
  shape's round count in the caption; the same for `first-resolve` and `ready` on `mixed`,
  the `first-resolve` caption also stating the size of the target's closure at each size;
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
   every cell of section 8.1's coverage, verifies it, bundles `mixed` at every size,
   and fails when `scale.json` changed. It compiles 92 cells at 50 to 2,500 providers and
   5 at 5,000, run four at a time on the runner's four cores.
2. `node src/scale/render.ts --check`.
3. `node src/scale/timings.ts --quick --sizes=50 --shapes=mixed`: 3 warm-up and 10
   measured timing rounds, 1 warm-up and 3 measured heap rounds, 200 steady iterations,
   written to `tmp/` through the same part and merge code, validated with
   `where: 'tmp'`. It proves both child modes, the worker, the merge and the writer run,
   and gates nothing on the figures. About 1 minute.

`bench-check` took 13 minutes 40 seconds on its first run with all five shapes at four sizes, 10 minutes 26 seconds after the calibration, and 14 minutes 51 seconds with 2,500 added (97 cells). A NexusDI change that moves bundle bytes changes
`scale.json`, and the pull request commits the regenerated file, as it does for
`size.json` today.

5,000-provider equivalence for `wide`, `deep`, `modular` and `mixed-async` stays out of
the pull request job: 15 more 5,000-provider compiles. The timing job verifies every cell it times, at every
size. It fails before sampling when a NexusDI cell does not pass, when a competitor cell
fails at n = 50 or with an equivalence fault, or when a cell's outcome contradicts
`scale.json`; a competitor cell that passes at n = 50 and fails at a larger size is
skipped and recorded in `cells` with its outcome (section 14).

### 10.2 Schedule, dispatch and tags

A `scale` matrix job runs beside `timings` with the same steps
(`release-core.ts`, then `node benchmarks/src/scale/timings.ts --part=<part>
--seed=${{ github.run_id }}`): one job per shape (`mixed`, `wide`, `deep`, `modular`,
`mixed-async`) and one for the steady get-cycle. Each part keeps every library and every
size on one machine, so the within-round pairing of competitors and of sizes holds; no
README, docs or post claim compares shapes, so a different CPU per shape breaks no claim.
A split by size would break the growth exponents, and a split of one shape's rounds would
pool two CPUs into one median. Each part builds only its own cells, writes its part and
raw samples, and uploads `scale-timings-<part>`. Every part records its block's runner
image, CPU and kernel, and the rendered caption of a shape names its CPU.

The `scale` job runs on a manual dispatch only: a core tag would otherwise publish timings
before the protocol check of section 7.4 has passed. A one-line follow-up widens the
trigger to every non-pull-request event once the first dispatch run has passed. `merge`
runs when `scale` is skipped, to merge the other results, and not when it failed.

The matrix runs with `fail-fast: true`, and `merge` needs `scale`, so a partial file is
never published. When `scale` succeeded, `merge` downloads `scale-timings-*` into `results/scale-parts`, runs
`timings.ts --merge` (section 8.2) and then `render.ts`. `open-results-pr.ts` adds
`benchmarks/results/scale`, `scale.md` and the two SVGs to the commit and one line naming
the scale file to the body; `scale.json` arrives with the deterministic artifact.
Timeouts: 330 minutes for `mixed`, 120 for each other shape, 30 for the steady part.

**Per-spawn cost.** A heap-mode spawn on an M1 Pro at a load average of 11 to 22 takes
409, 427, 496, 622 and 881 ms at 50, 200, 1,000, 2,500 and 5,000 providers. Of a 25-spawn
`mixed` round of 14.2 s, the base settle is 33%, the final settle 19%, Node's boot, the
packages import and process exit 24%, the timed phases 17% and the `gc()` before `create`,
the graph parse and IPC 7%. A timing-mode round takes 6.7 s. Two children at once
inflated `startup` by 15% and four by 49%, so spawns stay serial and the speed-up comes
from separate jobs.

**Job estimates**, in minutes with 3.5 minutes of setup (central estimate, and a high one
at 1.55 times the central per-spawn cost plus 30% on `mixed`):

| job                               | content                                   | central | high | timeout |
| --------------------------------- | ----------------------------------------- | ------- | ---- | ------- |
| `scale-mixed`                     | 25 cells, 1,010 timing and 33 heap rounds | 125     | 247  | 330     |
| `scale-wide`, `-deep`, `-modular` | 210 timing and 33 heap rounds each        | 35      | 52   | 120     |
| `scale-mixed-async`               | 15 cells, 210 timing and 33 heap rounds   | 22      | 41   | 120     |
| `scale-steady`                    | `get-cycle` at five sizes on `mixed`      | 7       | 8    | 30      |

The workflow takes `deterministic` (about 12 minutes) plus the longest job, so about 137
minutes at the central estimate and 259 at the high one. No full run has happened yet:
the first dispatch run, with `--protocol-check`, measures the real figures, and its wall
time, prefix table and protocol double ratios go into the pull request that adds this job
and then into this section. No tag depends on scale timings until that run has passed the
gate of section 7.4.

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
    holds every size and its rounds follow `orderFor`; warm-up rounds are excluded
    from `measured`; a child that exits 1 before sending rejects with its stderr.
14. `worker.mjs` for `get-cycle`. Tests: the fake worker answers calibrate and sample;
    the cycle visits every entry in order; `checkFloor` fails a 1 ns median.
15. `growth.ts`. Tests: for per-round times `t = 3·n^1.2` with multiplicative noise
    shared within a round, every local exponent is 1.2 to 1e-9; for `t = 100,000 + 50·n`
    the local exponents rise pair by pair, `b(50, 200)` = 0.051, `b(200, 1,000)` = 0.193
    and `b(1,000, 5,000)` = 0.526, each to 1e-9: the fixed cost reads as near-zero growth
    at small sizes and approaches linear at large ones, the case a single fit would hide;
    the interval is identical for the same seed and contains the point estimate; the
    marginal figure of a linear set equals its slope.
16. `timings.ts`. Tests on `toScaleRows(raw, seed)`: pairs come from the same round,
    block and size; only NexusDI `plain` is the reference; `load`, `create`, `first-get`
    and `rest` carry no `vsNexus`; derived metrics are summed per round before the
    median; `not-applicable` cells and skipped cells produce no rows. Then a `--quick` run
    locally, and the first full run on dispatch records its duration in the PR description.
17. `svg.ts`. Tests: decade ticks for 50..5,000 are 10, 100, 1,000, 10,000; a point at
    n = 1,000 has the expected x; the output for a fixed two-library dataset matches a
    committed file; the SVG parses as XML.
18. `render.ts` and `--check`. Tests: tables for a fixture input match a committed
    `scale.md`, round counts in the captions; a hash mismatch between the two inputs
    fails `--check` with both hashes in the message. A skipped cell shows its outcome with
    a footnote, the SVG line ends at the last passing size with an end marker, growth omits
    pairs that touch a failed size, the caption counts the skipped cells, and `--check`
    fails when `cells` disagree with `scale.json` at sizes both cover.
19. Nx targets and CI. `package.json` targets of section 10.4; `benchmarks.yml`:
    `check` gains its commands, `scale-timings` job, `merge` needs and downloads it;
    `open-results-pr.ts` adds the paths. Test: `open-results-pr` lists the scale paths
    (extract the list into a function if it is inline).
20. Disclosure. Section 4.12 of the launch spec lists "runtime graphs larger than eight
    providers" and "async factories" as not tested. Amend it to cite this suite, state
    `importHelpers`, the round counts per shape and that relative claims come from
    `mixed`. Add to `CONTRIBUTING.md`'s Benchmarks heading that a renderer change is
    reviewed like a fixture change: a person reads the generated `app.ts` at n = 50
    beside the cited page, and checks that every async factory body is `async` and
    awaits before it constructs, and that every value uses the library's value form
    with no factory call.

## 12. Open questions for the owner

None. The architect's eight questions are ruled in section 13.

## 13. Tech lead rulings (2026-10-01)

Package APIs below were read from inversify 8.2.3 (`@inversifyjs/container`), tsyringe
4.10.0, awilix 13.0.5 and @needle-di/core 1.2.1, installed at those pins.

1. Rounds. `mixed` runs 1,000 measured rounds, the minimum section 14.4 sets and the count
   Meridian-8's cold start already publishes, until the width rule of section 7.4 decides
   a count from the first run. The other shapes run 200 and print it; no README, docs or
   post claim cites them. The run is split into one job per shape (section 10.2).
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
5. Blocks. One block per shape holds every size, so runner drift falls on every size
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

## 15. Calibration amendment (2026-10-15)

A census of 22 real applications in 20 repositories (NestJS, Angular, n8n, Theia and
VS Code, measured 2026-10-15 from shallow clones, 22 to 2,249 providers) showed that the
first `mixed` generator was uniform where real graphs are skewed, and an order of magnitude
short on closure at 1,000 and 5,000 providers. No timing figure was published yet, so
`mixed` is replaced in place under the same name, and the rule that relative claims come
from `mixed` now points at a graph tied to measured apps. `wide`, `deep` and `modular` draw
from their own streams and keep their hashes; `mixed` and `mixed-async` change at every
size, and the `scale.json` hashes were regenerated.

### 15.1 What the census measured

| suite size | measured apps                               | max depth | largest closure (share of graph) |
| ---------- | ------------------------------------------- | --------- | -------------------------------- |
| 50         | 31 to 115 providers (5 apps)                | 3 to 17   | 16 to 50%                        |
| 200        | 115 to 350 (9 apps)                         | 7 to 28   | 17 to 45%                        |
| 1,000      | 570 to 1,229 (bitwarden, vscode, novu, n8n) | 22 to 32  | 18 to 33%                        |
| 2,500      | 1,635 to 2,249 (gauzy, twenty, Theia)       | 10 to 42  | 7 to 22%                         |
| 5,000      | none: twice the largest app measured        | no data   | no data                          |

Pooled NestJS modules (14 apps, 1,350 modules): 1 to 3 providers 50% (56% with empty
modules), 4 to 16 37%, 17 or more 8%, median 3, mean 6, p90 12, 4.4 imports per module,
exports 38% of providers. Fan-out over 10,740 providers: 0: 20%, 1: 27%, 2: 19%, 3: 10%,
4: 7%, 5 to 8: 11%, 9 or more: 6%; the widest constructor of an app runs 10 to 56 and
tracks sqrt n. Maximum fan-in is 4 to 36% of the graph. Async providers are 0 to 4%
(median 0%), all infrastructure. Aliases are under 2% in NestJS apps, 8% in bitwarden and
gauzy-ui, 30% in Theia. The largest app-authored graph holds 2,249 providers; library
providers add 5 to 40%, so the largest real container is about 2,500 to 3,000.

### 15.2 The ruling

The parameters of section 3.3 are the architect's calibration with four amendments from
the tech lead. Imports drop from about 5 to the measured 4.4 per module with extras kept
near their tier (probability 0.8), because only NexusDI expresses module imports at
runtime and every extra import adds work to its compile and none to the other four. Exports
drop from `⌈0.4 size⌉` to `⌈0.3 size⌉`, which realizes 36 to 40% of providers at 200 and up
against the measured 38%. The extra-import source stays closer to the tier. The target
becomes the provider with the largest closure anywhere in the graph, since the census
measures the closure of every provider and the largest root closure of an entry-only rule
resolved 8% of the 50-provider graph against a measured 16 to 50%.

The seed does not change: `GRAPH_SEED` stays 20261001, because a seed picked after seeing
its figures is a fit to the seed. The parameters were chosen on medians over 32 seeds and
the committed seed is checked afterwards. `shapes.test.ts` asserts the committed-seed
figures inside the measured bands: depth and target closure share at each size with data,
imports per module 4.0 to 5.0, realized export share 33 to 45%, module sizes (median, mean
and bin shares) and the fan-out histogram within 3 points of the pooled bins at 1,000 and
up, and maximum fan-in within 4 to 36%.

### 15.3 The committed graph

The figures of the graph the suite publishes, from `GRAPH_SEED`. Max depth counts an alias
hop as an edge, and the collapsed figure the census uses follows in parentheses. Visibility
entries per provider is the work of NexusDI's visibility pass: each module's own providers
plus the exports of each module it imports, over the providers. Large NestJS apps measure
2.4 (twenty) to 4.3 (novu-api).

| size  | modules | imports per module | max depth | target closure | share | max fan-in | exports share | visibility entries per provider |
| ----- | ------- | ------------------ | --------- | -------------- | ----- | ---------- | ------------- | ------------------------------- |
| 50    | 10      | 2.6                | 7 (6)     | 17             | 34%   | 14         | 48%           | 3.06                            |
| 200   | 24      | 3.3                | 14 (14)   | 45             | 23%   | 32         | 37%           | 2.79                            |
| 1,000 | 184     | 4.5                | 24 (24)   | 280            | 28%   | 231        | 40%           | 3.25                            |
| 2,500 | 397     | 4.5                | 42 (42)   | 342            | 14%   | 434        | 38%           | 3.34                            |
| 5,000 | 842     | 4.4                | 57 (55)   | 1,156          | 23%   | 1,333      | 39%           | 2.93                            |

The same generator over 32 seeds (`GRAPH_SEED` to `GRAPH_SEED + 31`), p10 / median / p90,
so a reader sees where the committed graph sits:

| size  | modules         | max depth    | target closure share | max fan-in share | visibility entries per provider |
| ----- | --------------- | ------------ | -------------------- | ---------------- | ------------------------------- |
| 50    | 4 / 10 / 14     | 6 / 9 / 13   | 32 / 44 / 58%        | 18 / 24 / 34%    | 1.40 / 2.21 / 3.06              |
| 200   | 22 / 32 / 43    | 11 / 15 / 20 | 21 / 31 / 47%        | 16 / 19 / 29%    | 2.31 / 2.63 / 3.22              |
| 1,000 | 130 / 150 / 184 | 23 / 26 / 36 | 16 / 23 / 30%        | 14 / 17 / 24%    | 2.60 / 2.87 / 3.45              |
| 2,500 | 356 / 405 / 439 | 32 / 41 / 47 | 12 / 22 / 30%        | 15 / 17 / 25%    | 2.67 / 2.86 / 3.34              |
| 5,000 | 794 / 835 / 897 | 47 / 58 / 64 | 13 / 24 / 29%        | 14 / 15 / 22%    | 2.72 / 2.86 / 3.32              |

`shapes.test.ts` also asserts that the 32-seed medians of depth and target share sit inside
the measured bands at each size with data, so the bands pin the generator and not only its
committed seed.

The target share spans 16 to 30% at 1,000 across seeds, and real apps span 18 to 33% there.
Every library runs the same graph, so the seed cannot move a ratio between libraries. The
target closure feeds only `first-resolve`, which has no growth exponent, and
`render.ts` prints the closure size of the target at each size in the caption of every
`first-resolve` table.

### 15.4 Sizes

The size list is `SIZES` in `src/scale/config.ts`: 50, 200, 1,000, 2,500 and 5,000. The
census found no app above 2,249 providers, and library providers add 5 to 40%, so the
largest real container is about 2,500 to 3,000. The owner ruled that 2,500 is added and
5,000 stays as headroom: 2,500 is the size of the largest real apps, and 5,000 is twice
anything measured. README, docs and post claims stop at 2,500, and the rendered page and
the results README say so. Adding a size is one entry in the list plus its committed hashes
and a band row in `shapes.test.ts`; the exponent table gains the columns of its neighbours,
and per-provider figures stay on 1,000 to 5,000 (`PER_PROVIDER`).

The timing run is one job per shape plus `scale-steady` (section 10.2); its first dispatch
run records the wall time.
