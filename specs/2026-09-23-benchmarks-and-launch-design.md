# NexusDI benchmarks and the 0.4.0 launch

Status: draft for the owner's review.
Projects: `benchmarks` (new, `@nexusdi/benchmarks`, private), `examples/toolchain-matrix`
(extended), `apps/docs` (new pages, a post, a build target, two postbuild steps),
`tools/repo-checks` (four guards), the two READMEs and `libs/core/package.json`. No
published API changes.
Closes: #21.
Depends on:

- `specs/2026-09-23-core-0.4-design.md` at `b5ab435`: §2.1 (why the core has no
  decorators), §3 (the API the fixtures call), §9 (`BlueprintError`), §14 (the release plan
  and its RC checklist).
- `specs/2026-09-23-docs-site-design.md` at `963e930`: §4.3 (the inventory and
  `/comparison/`), §6 (the blog moves to the new site at final), §7 (the Meridian domain),
  §8.2 (colour roles), §14.2 and §14.3 (build targets and guards), §15 (the deploy modes and
  the swap).
- Engine plan Task 30, "Toolchain matrix", in
  `specs/plans/2026-09-23-core-0.4-engine.md` on `plan/core-0.4-engine` (still being
  written; read on 2026-09-23). This spec extends its `examples/toolchain-matrix` project
  (section 3). Task 36 (the TS 5.4 floor and TS 7 type checks) supplies evidence for the
  claim (section 7.2).
- The claim fact-check of 2026-09-23. Its three verified sentences and its list of phrases
  never to use are quoted in section 7.1 and stored once in `apps/docs/claim.json`.
- The integrations spec on `spec/integrations` (not yet committed). It owns
  `@nexusdi/vitest`, `@nexusdi/hono`, `@nexusdi/react-router`, `@nexusdi/fastify` and
  `@nexusdi/express`, and their ecosystem listings.
- The owner's marketing plan, "NexusDI marketing plan",
  <https://claude.ai/artifact/LAR6EMag71H3eZHfEzTMcq>. It owns the launch sequence by day,
  the channels and their rules, the targets, the sponsor setup (GitHub Sponsors,
  `FUNDING.yml`, thanks.dev), the posting identity and the follow-up cadence. This spec
  covers what the repository builds and links to the plan for everything else.

Measured against: npm and GitHub on 2026-09-23. Every version below was read from the
registry that day.

## 1. Problem

The launch post has to prove a claim about toolchains, and the comparison pages have to
state facts about four other libraries. Both need numbers that a reader can rerun and that
a competitor's maintainer can check. Today the repository has none.

Issue #21 asks for a benchmark suite. Engine plan Task 30 already builds and runs the packed
`@nexusdi/core` under every mainstream toolchain, for NexusDI alone, with one golden output.
A second harness that pinned its own toolchains would drift from Task 30's pins within a
month.

The current README calls the decorators "native", which the 0.4 claim contradicts. It also
promises "high performance" with no figure behind it.

## 2. Decisions

1. `benchmarks/` is one Nx project, `@nexusdi/benchmarks`, scaffolded with
   `@nx/js:library`. It builds one service graph, "Meridian-8", in five libraries and
   records toolchain outcomes, wiring-mistake probes, bundle sizes and timings (section 4).
2. The comparison set is InversifyJS, tsyringe, awilix and needle-di, plus NexusDI. TypeDI
   gets one line on `/comparison/`: its last release, 0.10.0, was published on 2021-01-15.
3. The harness reuses Task 30's `toolchains.json` and its build recipes. Task 30's run
   script moves its recipes into an exported module, and both projects import it
   (section 3).
4. Each library appears in the variants its own documentation teaches. A competitor's
   variant follows its getting-started page, and a header comment cites the URL and the
   version read (section 4.3).
5. A cell's outcome is one of `pass`, `compile-error`, `runtime-error`, `wrong-instance` or
   `not-applicable`. A shared scenario script detects each one the same way for every
   library (section 4.5).
6. Timings use mitata 1.0.34 inside one process per library and round, and a process-spawn
   driver for cold start. Every published timing is a median across rounds with its median
   absolute deviation (section 4.7).
7. The deterministic results (matrix, probes, sizes) are committed files that reproduce
   byte for byte. Timings are dated history files. The docs read both at build time, and no
   page or post types a figure by hand (sections 4.9 and 4.11).
8. One comparison page per competitor, at `/vs-<id>/`, targets both "NexusDI vs X" and
   "X alternative" searches. No separate "alternative" pages exist (section 5).
9. The launch post is `content/blog/dependency-injection-without-reflect-metadata.mdx` on
   the new site, published on 0.4.0 final day. Its figures are pinned to one results run
   (section 6).
10. The claim text lives once, in `apps/docs/claim.json`. A guard holds every evidence
    selector in it to the results files, and holds the README, the landing page and the post
    to its sentences and to its list of phrases never to use (section 7).
11. The README hero leads with graph validation. "Any TypeScript compiler, bundler or
    type-stripper" applies to the decorator-free core only (section 8).

## 3. Extending the toolchain matrix

Task 30 creates `examples/toolchain-matrix`: `toolchains.json` (the pins), `golden.json`,
`scripts/run-matrix.mjs` (the recipes and the runner) and `toolchain-matrix.json`
(`Array<{ toolchain, version, variant: 'plain' | 'decorated', result: 'pass' | 'fail' |
'unsupported', note? }>`). The matrix proves NexusDI's full feature set (scopes, `REQUEST`,
an async factory, a lazy edge, disposal) under each toolchain. The benchmark harness asks a
different question: does the same small graph run in each of five libraries under each
toolchain. So the two keep separate scenarios and share the pins and the recipes.

### 3.1 The toolchain cells

The owner confirmed these pins on 2026-09-23. The harness reads them from
`toolchains.json` and hard-codes none of them. When Task 30 merges with different values,
the file wins.

| Cell id      | What runs                                                            | Runtime |
| ------------ | -------------------------------------------------------------------- | ------- |
| `tsc-6`      | `typescript` 6.0.3, `tsc -p`                                         | Node 24 |
| `tsc-7`      | `typescript` 7.0.2 (the Go compiler), `tsc -p`                       | Node 24 |
| `esbuild`    | `esbuild` 0.28.2, `--bundle --target=es2022`                         | Node 24 |
| `swc`        | `@swc/core` 1.16.2, `@swc/cli` 0.8.1                                 | Node 24 |
| `babel`      | `@babel/core` 8.0.6, `@babel/preset-typescript` 8.0.1                | Node 24 |
| `vite-oxc`   | `vite` 8.3.0 with its default Oxc transform, SSR build               | Node 24 |
| `vite-babel` | `vite` 8.3.0 with a Babel plugin, pinned in `toolchains.json`        | Node 24 |
| `bun`        | `bun` 1.4.2, `bun build` then `bun`                                  | Bun     |
| `deno`       | `deno` 2.9.6, `deno run`                                             | Deno    |
| `node-strip` | Node 24's built-in type stripping, from `.nvmrc` (24.20.0), no build | Node 24 |

`typescript` 7.0.2 is the `latest` dist-tag on npm since 2026-07-08. It replaces the
`@typescript/native-preview` pin in Task 30's draft. The fact-check ran it: with
`experimentalDecorators` and `emitDecoratorMetadata` set, `tsc` 7.0.2 emits `__decorate`,
`__param` and `__metadata("design:paramtypes", …)`. What 7.0 lacks is the compiler API,
which the harness does not use.

### 3.2 Decorator profiles

Task 30 builds every file with one configuration per toolchain. The competitors need legacy
decorators and, in their documented setups, `emitDecoratorMetadata`. Each cell therefore
takes a profile, and each toolchain entry in `toolchains.json` gains a `profiles` map from
profile to the config files and flags that toolchain uses for it:

| Profile           | Meaning                                                         | Used by                                       |
| ----------------- | --------------------------------------------------------------- | --------------------------------------------- |
| `none`            | no decorators in the source                                     | every `plain` variant                         |
| `standard`        | TC39 decorators, 2023-11 semantics, no `experimentalDecorators` | NexusDI and needle-di `decorated`             |
| `legacy-metadata` | `experimentalDecorators` and `emitDecoratorMetadata`            | InversifyJS and tsyringe `decorated`          |
| `legacy`          | `experimentalDecorators` only                                   | InversifyJS and tsyringe `decorated-explicit` |

Per toolchain, a profile sets what that toolchain's own documentation names:

- `tsc-6`, `tsc-7`, `esbuild`, `vite-oxc` and `bun` read the two flags from the fixture's
  `tsconfig.json`. esbuild documents `emitDecoratorMetadata` as unsupported
  (<https://esbuild.github.io/content-types/>, evanw/esbuild#257). Vite documents it as
  "only partially supported" (<https://vite.dev/guide/features.html>). The cell records
  what happens and cites the page.
- `swc` sets `jsc.parser.decorators`, then `jsc.transform.legacyDecorator` and
  `jsc.transform.decoratorMetadata`, or `jsc.transform.decoratorVersion: "2023-11"`.
- `babel` and `vite-babel` use `@babel/plugin-proposal-decorators` 8.0.2 with
  `version: "legacy"` or `"2023-11"`. `legacy-metadata` adds
  `babel-plugin-transform-typescript-metadata` 0.4.0, the plugin tsyringe's README names for
  Babel.
- `deno` writes the flags into `deno.json` `compilerOptions`. Deno marks both as deprecated
  and prints a warning, which the cell stores in `note`.
- `node-strip` takes no configuration. Node strips erasable syntax only, so every decorated
  profile is a `compile-error` there, which Node's documentation states. The cell carries
  that URL in `documented`.

### 3.3 The recipe module

Task 30's `run-matrix.mjs` holds the recipes as a local `recipes` object whose functions
build and run a whole program. The extension:

1. `examples/toolchain-matrix/scripts/recipes.mjs` exports `compile(toolchain, dir, file,
profile)`, which returns the path of a runnable module, and `runtimeFor(toolchain)`,
   which returns `node`, `bun` or `deno`. File-by-file compilers (`tsc-6`, `tsc-7`, `swc`,
   `babel`) return the emitted `.js` path. Bundlers return the bundle. `bun`, `deno` and
   `node-strip` return the `.ts` path, which their runtimes load directly.
2. `run-matrix.mjs` imports the module and keeps its own scenario, golden file and output
   format unchanged.
3. `examples/toolchain-matrix/package.json` gains `exports` for `./recipes` and
   `./toolchains.json`. `benchmarks/package.json` lists `@nexusdi/toolchain-matrix` as a
   dev dependency, so the Nx graph orders the two projects.
4. A benchmarks test asserts that every NexusDI cell the harness runs with profile `none`
   or `standard` has the same pass or fail verdict as the matching row of
   `toolchain-matrix.json`. The two scenarios differ, and a toolchain that passes one and
   fails the other is a finding to investigate before the results are published.

This change touches Task 30's files. If Task 30 is merged first, the extension is the first
task of the benchmarks plan. If Task 30 is still open, the engine plan takes items 1 to 3.

## 4. The `benchmarks/` project

### 4.1 Layout and scaffolding

```bash
npx nx g @nx/js:library benchmarks --bundler=none --unitTestRunner=vitest --linter=eslint
```

The generator writes `benchmarks/` with `package.json`, `tsconfig.json`,
`tsconfig.lib.json`, `tsconfig.spec.json`, `eslint.config.mjs` and `vite.config.ts`. After
it runs: set the package name to `@nexusdi/benchmarks` and `private: true`, delete the
template `src/lib/`, add `benchmarks` to the root `workspaces` and to
`commitlint.config.js`'s scope list, and revert any comment the generator stripped from
`nx.json` (the libraries repo's `generator-collateral` check records that devkit rewrites
the file). The folder name equals the unscoped package name, which the libraries repo's
`project-folder-name` rule requires. `nx.json`'s `release.projects` stays `libs/*`.

Lint, format and typecheck run on the harness code before the second file is written.

```
benchmarks/
  package.json              @nexusdi/benchmarks, private; exact pins for mitata,
                            rollup, the competitors and their polyfills
  libraries.json            libraries, versions, variants, setup facts, cited claims
  fixtures/
    scenario.mjs            the shared scenario; plain JavaScript, never compiled
    golden.json             what scenario.mjs must print for every passing cell
    nexusdi/plain.ts        one self-contained file per library and variant
    nexusdi/decorated.ts
    inversify/plain.ts
    inversify/decorated.ts
    inversify/decorated-explicit.ts
    tsyringe/…              the same three variants
    awilix/plain.ts
    needle-di/plain.ts
    needle-di/decorated.ts
    probes/<library>/<variant>/<probe>.ts
    tsconfig/<profile>.json
  src/
    matrix.ts               runs every library × variant × toolchain cell
    probes.ts               runs the wiring-mistake probes
    size.ts                 bundles, minifies, compresses, runs the bundles
    timings/cold-start.ts   the process-spawn driver
    timings/in-process.ts   one mitata process per library, scenario and round
    timings/rounds.ts       round order, seed, median and MAD
    schema.ts               the result types and their runtime validator
    readme.ts               writes the README comparison table
    *.test.ts               Vitest tests for every module above
  results/
    matrix.json             deterministic, committed
    probes.json             deterministic, committed
    size.json               deterministic, committed
    timings/<date>-<sha7>.json   one file per published timing run
```

The harness runs its `.ts` files with Node 24's type stripping, so `src/` uses erasable
syntax only (`erasableSyntaxOnly: true` in `tsconfig.lib.json`). The fixtures never compile
against the workspace: `matrix.ts` copies them into a throwaway consumer that installs the
packed `@nexusdi/core` tarball and the pinned competitors, the same way Task 30's runner
does.

Nx targets, all `nx:run-commands` in `package.json`:

| Target    | Runs                                                        | Cached        |
| --------- | ----------------------------------------------------------- | ------------- |
| `matrix`  | `src/matrix.ts`, writes `results/matrix.json`               | no            |
| `probes`  | `src/probes.ts`, writes `results/probes.json`               | no            |
| `size`    | `src/size.ts`, writes `results/size.json`                   | no            |
| `timings` | both timing drivers, writes one `results/timings/` file     | no            |
| `check`   | `matrix`, `probes` and `size` with `--check` (section 4.10) | no            |
| `bench`   | all four writers, in order                                  | no            |
| `readme`  | `src/readme.ts`                                             | on its inputs |

### 4.2 The graph: Meridian-8

The graph uses the docs' canonical vocabulary (docs spec §7.1), so the post and the pages
satisfy the domain guard. It has eight providers:

| Provider       | Lifetime  | Dependencies                                |
| -------------- | --------- | ------------------------------------------- |
| `ReactorCore`  | singleton | none                                        |
| `ShipComputer` | singleton | `ReactorCore`                               |
| `PowerRouter`  | singleton | `ReactorCore`                               |
| `ShieldGrid`   | singleton | `PowerRouter`                               |
| `NAV_CHARTS`   | value     | none; a `Token<NavCharts>` for an interface |
| `Bridge`       | singleton | `ShipComputer`, `NAV_CHARTS`, `ShieldGrid`  |
| `SurveyDrone`  | transient | `ShipComputer`                              |
| `FlightLog`    | scoped    | `ShipComputer`                              |

The shape covers a chain three edges deep (`Bridge` to `ReactorCore` through `ShieldGrid`
and `PowerRouter`), a diamond on `ReactorCore`, an interface token that metadata emit
cannot describe, and one provider per lifetime. It differs from the docs' ship in one
place: `PowerRouter` takes `ReactorCore` where the docs give it `lazy(ShieldGrid)`, because
four of the five libraries express a lazy edge differently. The cycle probe restores the
docs' cycle (section 4.6).

Every class carries a `readonly kind` field holding its own name, for example
`readonly kind = 'ShipComputer'`. The scenario identifies instances through `kind`, so a
minified bundle, which renames classes, prints the same output.

The fixtures declare fields explicitly and use no parameter properties. Node's type
stripping rejects parameter properties, and `node-strip` is a cell, so every library gets
the same erasable source. Where a library's documentation writes
`constructor(private foo = inject(Foo))`, the fixture writes the equivalent field and says
so in its header comment.

### 4.3 Writing each library the way its documentation does

`libraries.json` records, per library, the documentation it follows:

| Library     | Version | Documentation read                                        | Polyfill                 |
| ----------- | ------- | --------------------------------------------------------- | ------------------------ |
| NexusDI     | 0.4.0   | this repository's docs at the release tag                 | none                     |
| InversifyJS | 8.2.3   | <https://inversify.io/docs/introduction/getting-started/> | `reflect-metadata` 0.2.2 |
| tsyringe    | 4.10.0  | <https://github.com/microsoft/tsyringe#readme>            | `reflect-metadata` 0.2.2 |
| awilix      | 13.0.5  | <https://github.com/jeffijoe/awilix#readme>               | none                     |
| needle-di   | 1.2.1   | <https://needle-di.io>                                    | none                     |

The variants:

| Library     | `plain`                                                                                      | `decorated`                                                                         | `decorated-explicit`                                  |
| ----------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------- |
| NexusDI     | `provide()` and `defineModule()` (documented)                                                | `@Injectable({ deps })`, `@Module`, profile `standard`                              | not applicable                                        |
| InversifyJS | `toResolvedValue(fn, [deps])` bindings                                                       | `@injectable()`, `@inject` for `NAV_CHARTS`, profile `legacy-metadata` (documented) | `@inject(Token)` on every parameter, profile `legacy` |
| tsyringe    | `container.register` with `useFactory`                                                       | `@singleton()`, `@inject` for `NAV_CHARTS`, profile `legacy-metadata` (documented)  | `@inject(Token)` on every parameter, profile `legacy` |
| awilix      | `createContainer({ injectionMode: PROXY, strict: true })`, `asClass`, `asValue` (documented) | not applicable                                                                      | not applicable                                        |
| needle-di   | `container.bind` with `useFactory` and `inject()`                                            | `@injectable()` with `inject()` fields, profile `standard` (documented)             | not applicable                                        |

That gives 11 library-variants. The `decorated-explicit` variant exists because the
research found that InversifyJS reads `design:paramtypes` only where no `@inject` token is
given, and tsyringe overwrites metadata entries with `@inject` tokens. It is the workaround
a user on esbuild reaches for, and leaving it out would overstate how badly those libraries
break. Both still need `experimentalDecorators`, and both still load the Reflect polyfill:
tsyringe throws "tsyringe requires a reflect polyfill." at import, and
`@inversifyjs/container` imports `reflect-metadata/lite` itself.

Rules every fixture follows:

1. Every lifetime is set explicitly. InversifyJS, tsyringe and awilix default to transient;
   NexusDI and needle-di default to singleton.
2. The container is created, configured and used the way the getting-started page shows,
   including its polyfill import.
3. A library without a lifetime records that section as `not-applicable` with the reason in
   `libraries.json`. needle-di documents singletons only, so its `transient` and `scoped`
   sections are `not-applicable`. A library's child container counts as a scope only when
   its documentation presents it as the per-request mechanism.
4. The header comment of each fixture cites the documentation URL, the version read, the
   date read, and every place the fixture departs from the documentation with the reason.

Review: before a fixture merges, a person reads it beside the cited page and ticks each rule
in the pull request template section "Benchmark fixture review". After launch, the
maintainers of each competitor are invited to review their fixtures (section 4.12).

### 4.4 The matrix

Dimensions: 11 library-variants × 10 toolchain cells = 110 cells. Each cell has three
sections, `singleton`, `transient` and `scoped`, and the cell's outcome is the worst
section outcome that is not `not-applicable`.

For each cell, `matrix.ts`:

1. Asks `compile()` for a runnable module built from the fixture with the variant's
   profile. A non-zero exit, or a runtime that refuses the module at load, is a
   `compile-error`.
2. Runs `fixtures/scenario.mjs` under the cell's runtime with the module path as its
   argument. The fixture exports one object, `adapter`, with `ready()` returning the ship
   and optional `scope()` and `dispose()`.
3. Parses what the scenario prints and compares it with `golden.json` section by section.

### 4.5 Break categories

| Outcome          | Detected when                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pass`           | the section's printed JSON equals `golden.json`'s section                                                                                         |
| `compile-error`  | the build exits non-zero, or the runtime throws a `SyntaxError` or a module-load error before `ready()` runs                                      |
| `runtime-error`  | `ready()`, a resolve, `scope()` or `dispose()` throws, or the process exits non-zero after the module loaded                                      |
| `wrong-instance` | the scenario completes and a field differs from golden: a dependency is `undefined`, of the wrong `kind`, or a lifetime's identity rule is broken |
| `not-applicable` | the library has no such variant or lifetime, recorded in `libraries.json` with the reason                                                         |

The golden sections:

- `singleton`: `bridge.kind`, the `kind` of each of its dependencies down to `ReactorCore`,
  `bridge === bridge` across two resolves, and one `ReactorCore` shared by `ShipComputer` and
  `PowerRouter`.
- `transient`: two `SurveyDrone` resolves give two instances that share one `ShipComputer`,
  which is the `Bridge`'s.
- `scoped`: two resolves in one scope give one `FlightLog`, two scopes give two, and both
  share the root `ShipComputer`.

A cell keeps the first line of the error, with absolute paths and line numbers of the
throwaway directory removed, in `message`. When a toolchain or library documents the
limitation, `documented` holds the URL.

### 4.6 The wiring-mistake probes

The probes answer a question the marketing plan says the post must verify before it claims
it: when does each library report a wiring mistake. Each probe is a fixture variant with
one mistake, built with `tsc-6` and the variant's profile, then type-checked with
`tsc --noEmit` under `strict`.

| Probe              | The mistake                                                           |
| ------------------ | --------------------------------------------------------------------- |
| `missing-provider` | `NAV_CHARTS` is never registered                                      |
| `cycle`            | `PowerRouter` takes `ShieldGrid`, which takes `PowerRouter`           |
| `captive-scoped`   | the singleton `Bridge` takes the scoped `FlightLog`                   |
| `wrong-dep-type`   | `ShipComputer` is wired to `PowerRouter` where it takes `ReactorCore` |
| `two-mistakes`     | `missing-provider` and `cycle` together                               |

Each probe records `detectedAt`: `typecheck` (the type check fails), `create` (the error
comes from container creation or configuration, before any resolve), `first-resolve` (the
first `get` of `Bridge` throws), or `never` (the scenario completes with a wrong or missing
dependency). `two-mistakes` also records `reported`: the number of the two mistakes named in
the first error. `captive-scoped` is `not-applicable` for a library without a scoped
lifetime.

### 4.7 Metrics and methodology

Four metric families, each in its own file:

| Family  | Metric                                                                    | Unit      |
| ------- | ------------------------------------------------------------------------- | --------- |
| matrix  | outcome per cell and section                                              | enum      |
| probes  | `detectedAt` per probe, `reported` for `two-mistakes`                     | enum, int |
| size    | minified and min+gzip size of the Meridian-8 app, per bundler             | bytes     |
| timings | cold start, ready, warm singleton resolve, transient resolve, scope cycle | ns        |

Size. The input for both bundlers is each variant's `tsc-6` output, so both bundle the same
correct JavaScript. esbuild 0.28.2 bundles with `--bundle --minify --platform=browser
--format=esm --target=es2022`. Rollup 4.63.4 bundles with `@rollup/plugin-node-resolve`
16.0.3 (`browser: true`) and `@rollup/plugin-terser` 1.0.0. The entry builds Meridian-8,
resolves `Bridge` and assigns it to `globalThis`, so no bundler drops the graph. gzip uses
Node's `zlib` at level 9. The record lists the polyfill's own share of the gzip size, since
a user deploys it. `size.ts` then runs each minified bundle through `scenario.mjs`: a bundle
that fails is recorded in the size cell as `runs: 'runtime-error'` or `'wrong-instance'`.
Minification renames classes and parameters, and awilix's README warns that its `CLASSIC`
mode breaks under it, so this check reaches a failure the unminified matrix cannot.

Timings. All timings run on Node 24 from `.nvmrc`, with each library's documented variant
built by `tsc-6`. Scenarios:

| Scenario            | What one iteration does                                                                   | Driver |
| ------------------- | ----------------------------------------------------------------------------------------- | ------ |
| `cold-start`        | a fresh process imports the library and its polyfill, wires Meridian-8, resolves `Bridge` | spawn  |
| `ready`             | create and configure a container, then resolve every singleton once                       | mitata |
| `resolve-singleton` | `get(Bridge)` on a ready container                                                        | mitata |
| `resolve-transient` | `get(SurveyDrone)` on a ready container                                                   | mitata |
| `scope-cycle`       | open a scope, resolve `FlightLog` and `SurveyDrone` in it, close the scope                | mitata |

`ready` is the headline figure for startup work. NexusDI builds every singleton inside
`Nexus.create`, and the others build lazily on first resolve, so container creation alone
compares different amounts of work. `ready` makes every library do the same work: every
singleton exists at the end of the iteration.

`cold-start` spawns `node` 50 times per library, in an interleaved random order, and reads
`performance.now()` after `Bridge` resolves. `performance.now()` counts from the process's
time origin, so the figure includes module loading and the polyfill.

The in-process scenarios follow these rules:

1. One process per library, scenario and round. `reflect-metadata` patches the global
   `Reflect`, and V8 specialises code on the shapes it has seen, so two libraries in one
   process would measure each other.
2. Ten rounds. The round order across libraries is shuffled with a seed recorded in the
   results file.
3. mitata with `.gc('inner')` for `ready` and `scope-cycle`, under `node --expose-gc`.
4. Every result passes through `do_not_optimize`. A run where mitata flags possible
   dead-code elimination fails.
5. Only a cell whose matrix outcome under `tsc-6` is `pass` for that section is timed.
6. Each round contributes mitata's `p50`. The published figure is the median of the ten
   round medians, with the median absolute deviation across rounds and the median of the
   rounds' `p99`. `ready` also records mitata's average heap per iteration.
7. A figure whose MAD exceeds 5% of its median is flagged `noisy`. A page shows the flag
   next to the figure.

`resolve-singleton` measures a map lookup in most containers. The pages show it and say
so; the post leaves it out of its charts.

mitata 1.0.34 was published on 2025-02-04, and its repository was last pushed on
2025-02-17. It is pinned exactly. Its JSON output (`run({ format: 'json' })`) carries
`samples`, `min`, `max`, `p25`, `p50`, `p75`, `p99`, `p999`, `avg` and optional `heap`
per run, which is all the harness reads.

### 4.8 The CI job and schedule

`.github/workflows/benchmarks.yml`, with actions pinned by SHA as in `ci.yml`:

- `bench-check` runs on pull requests that touch `benchmarks/**`, `libs/core/**` or
  `examples/toolchain-matrix/**`. It runs `nx run benchmarks:check`, the three deterministic
  writers, against the workspace's packed core. It fails when a NexusDI cell that
  `claim.json` cites is not `pass`, or when the recipe consistency test of section 3.3
  fails. It runs no timings.
- `bench-full` runs on `schedule` (`0 4 * * 1`, Mondays at 04:00 UTC), on
  `workflow_dispatch`, and on a pushed `@nexusdi/core@*` tag. It packs core from the newest
  release tag (from the pushed tag on a tag run), so every published result describes a
  released version. It runs `nx run benchmarks:bench` on `ubuntu-24.04` and records the
  runner's CPU model, core count, memory and Node version. It opens a pull request titled
  `chore(benchmarks): results <date> <sha7>` when any deterministic file changed, when a
  competitor pin changed, or on every tag run. The timing file is committed only in that
  pull request. The raw mitata JSON is uploaded as a workflow artifact.
- `competitor-releases` runs weekly with `bench-full`. For each pin in `libraries.json` it
  reads `npm view <package> version`, and for each newer version it opens one issue,
  labelled `benchmarks`, titled `benchmarks: <package> <version> released`, unless an issue
  with that title exists (section 5.5).

The permissions are `contents: write` and `pull-requests: write` for `bench-full`, and
`issues: write` for `competitor-releases`, as `docs-snapshot.yml` holds for its pull
request.

The job uses GitHub-hosted runners. CodSpeed reports that the same hosted image ran on AMD
EPYC 7763 in nine of ten runs and on Intel Xeon 8370C in one
(<https://codspeed.io/blog/unrelated-benchmark-regression>). The harness compares libraries
inside one job on one machine, interleaved, which Laaber et al. (EMSE 2019) found to detect
differences of 10% or less on cloud instances. It does not compare runs across weeks, and
no timing gates a pull request.

### 4.9 The results schema

`src/schema.ts` declares these types and a validator that every writer and every reader
calls. `schema` is bumped on any breaking change, and readers reject a version they do not
know.

```ts
type LibraryId = 'nexusdi' | 'inversify' | 'tsyringe' | 'awilix' | 'needle-di';
type Variant = 'plain' | 'decorated' | 'decorated-explicit';
type Profile = 'none' | 'standard' | 'legacy-metadata' | 'legacy';
type Outcome =
  | 'pass'
  | 'compile-error'
  | 'runtime-error'
  | 'wrong-instance'
  | 'not-applicable';

interface Versions {
  core: string; // the packed @nexusdi/core version
  libraries: Record<LibraryId, string>;
  toolchains: Record<string, string>; // cell id to its first package's version
  node: string;
}

// results/matrix.json: no timestamp, sorted, reproducible byte for byte.
interface MatrixFile {
  schema: 1;
  versions: Versions;
  cells: MatrixCell[]; // sorted by library, variant, toolchain
}
interface MatrixCell {
  library: LibraryId;
  variant: Variant;
  toolchain: string;
  profile: Profile;
  sections: { singleton: Outcome; transient: Outcome; scoped: Outcome };
  outcome: Outcome;
  polyfill: string | null; // for example 'reflect-metadata@0.2.2'
  message?: string;
  documented?: string; // URL of the page that documents the limitation
  note?: string; // for example Deno's deprecation warning
}

// results/probes.json
interface ProbesFile {
  schema: 1;
  versions: Versions;
  probes: Array<{
    library: LibraryId;
    variant: Variant;
    probe:
      | 'missing-provider'
      | 'cycle'
      | 'captive-scoped'
      | 'wrong-dep-type'
      | 'two-mistakes';
    detectedAt:
      | 'typecheck'
      | 'create'
      | 'first-resolve'
      | 'never'
      | 'not-applicable';
    reported?: 0 | 1 | 2;
    message?: string;
  }>;
}

// results/size.json
interface SizeFile {
  schema: 1;
  versions: Versions & { bundlers: { esbuild: string; rollup: string } };
  sizes: Array<{
    library: LibraryId;
    variant: Variant;
    bundler: 'esbuild' | 'rollup';
    minified: number; // bytes
    gzip: number; // bytes, zlib level 9
    polyfillGzip: number; // bytes of the gzip total that the polyfill accounts for
    runs: Outcome;
  }>;
}

// results/timings/<date>-<sha7>.json
interface TimingsFile {
  schema: 1;
  sha: string;
  startedAt: string; // ISO 8601
  versions: Versions & { mitata: string };
  runner: {
    os: string;
    cpu: string;
    cores: number;
    memoryGb: number;
    hosted: boolean;
  };
  seed: number;
  rounds: number;
  results: Array<{
    scenario:
      | 'cold-start'
      | 'ready'
      | 'resolve-singleton'
      | 'resolve-transient'
      | 'scope-cycle';
    library: LibraryId;
    variant: Variant;
    toolchain: 'tsc-6';
    median: number; // ns
    mad: number; // ns
    p99?: number; // ns, in-process scenarios only
    heapBytes?: number; // ready only
    roundMedians: number[]; // ns, in run order
    noisy: boolean;
  }>;
}
```

### 4.10 Result history

The three deterministic files are committed and carry no timestamp. `--check` regenerates
each one and fails when it differs from the committed file, as Task 30's `--check` does. Git
history is their history: `git log -p benchmarks/results/matrix.json` shows every outcome
that changed and the commit that changed it.

Timing files accumulate in `results/timings/`, one per published run, named
`<YYYY-MM-DD>-<sha7>.json`. A file is never edited after its pull request merges. At about
20 kB a file and one file a week at most, the directory stays small, so it has no retention
limit. A reader picks the newest file by name.

### 4.11 How the docs read the results

A new docs target, `docs:benchmark-data` (`apps/docs/tools/benchmark-data.mjs`), reads
`benchmarks/results/`, validates each file with `src/schema.ts`, and writes
`apps/docs/generated/benchmarks.json` (gitignored). `docs:build` depends on it, as it
depends on `docs:package-facts` (docs spec §14.2).

The docs spec builds the root site from the newest release tag and copies
`content/blog/` from `main` into that worktree (docs spec §15.3, step 3). The same step
copies `benchmarks/results/` from `main`, so the root site shows the newest results without
a documentation re-cut. `docs.yml`'s path filter gains `benchmarks/results/**`.

Components, in `apps/docs/components/benchmarks/`, render only from that JSON:

- `<ToolchainGrid library? variant? />`: the matrix as a table (section 6.4).
- `<ProbeTable library? />`: one row per probe and library.
- `<SizeChart bundler="esbuild" />` and `<TimingChart scenario="ready" />`: the charts of
  section 6.4.
- `<Figure of="size.nexusdi.plain.esbuild.gzip" />`: one figure inline in prose, with its
  unit.
- `<MeasuredWith />`: the versions, the runner and a link to the results file at its commit.

Each component takes an optional `run` prop naming a timings file. Without it, the component
reads the newest. The post passes `run` (section 6.1). Comparison pages omit it.

### 4.12 Fairness and disclosure

Every comparison page and the post end with a section built from `<MeasuredWith />` and
these statements:

- Who measured: the NexusDI maintainer, who has an interest in the result.
- What was pinned: each library's exact version and polyfill, each toolchain's exact
  version, Node's version, and the profile flags per cell, linked to `libraries.json` and
  `toolchains.json` at the results commit.
- What was tested: Meridian-8, eight providers, in the variants of section 4.3, under ten
  toolchain cells, with five probes, two bundlers and five timing scenarios on Node 24.
- What was not tested: timings on Bun, Deno or in a browser; graphs larger than eight
  providers; async factories; request scoping semantics beyond "one instance per scope";
  memory beyond mitata's heap figure; any framework integration.
- How to rerun: `git clone`, `npm ci`, `npx nx run benchmarks:bench`, and the note that
  timings differ by machine while ratios between libraries in one run should hold within
  the published MAD.
- How to correct it: a maintainer or user who finds a setup that departs from a library's
  documentation opens an issue with the "Benchmark setup" template. A correction that is
  accepted is merged, rerun and published within seven days. The comparison pages update
  from the new results. The post keeps its pinned run and gains a dated `Note` stating what
  changed and linking the new results.

`.github/ISSUE_TEMPLATE/04-benchmark-setup.yml` asks for the library, the fixture path, the
documentation URL that shows the correct setup, and the expected outcome. It applies the
`benchmarks` label.

## 5. Comparison pages

### 5.1 Pages and titles

One page per competitor. A page for "X alternative" beside a "NexusDI vs X" page would
carry the same facts twice, and search engines index near-duplicates as one page. The
`title` frontmatter is the SEO title and carries both phrasings where both are searched; the
H1 names the comparison.

| Path             | `title` (SEO)                                       | H1                      |
| ---------------- | --------------------------------------------------- | ----------------------- |
| `/vs-inversify/` | NexusDI vs InversifyJS: DI without reflect-metadata | NexusDI and InversifyJS |
| `/vs-tsyringe/`  | tsyringe alternative: NexusDI vs tsyringe           | NexusDI and tsyringe    |
| `/vs-awilix/`    | NexusDI vs awilix: typed dependencies compared      | NexusDI and awilix      |
| `/vs-needle-di/` | NexusDI vs needle-di: graph validation compared     | NexusDI and needle-di   |

Each `description` is one sentence that names both libraries and the main difference, for
example "NexusDI and tsyringe compared on setup, toolchains, wiring errors, size and speed,
measured on the same eight-provider graph."

`/comparison/` (docs spec inventory #24) stays the overview and changes its title to
"NexusDI compared with InversifyJS, tsyringe, awilix and needle-di". It holds one row per
library, links to each `/vs-<id>/` page, and keeps one line each for TypeDI (last release
0.10.0 on 2021-01-15, with the npm URL) and NestJS (a framework with its own container, as
the landing page's "When to skip it" says).

The four pages join the Guides band after `/comparison/`, as `contract` pages. They are
indexed from 0.4.0 final, when the root site is built from the release (docs spec §15.8).

### 5.2 Content model

A page's frontmatter names its competitor, `competitor: tsyringe`, and every component on
the page filters to NexusDI and that library. The H2 sections, in order:

1. "What NexusDI and X have in common": the concepts that transfer (tokens, lifetimes,
   modules or their equivalent), from `libraries.json` claims.
2. "Setup each library needs": polyfill, compiler flags, and install line per library, from
   `libraries.json` and the matrix `profile` and `polyfill` fields.
3. "NexusDI and X under ten toolchains": `<ToolchainGrid />` for both libraries, every
   variant, with each non-pass cell's `message` and `documented` link.
4. "When each library reports a wiring mistake": `<ProbeTable />`.
5. "Lifetimes and scopes": the lifetime and scope claims from `libraries.json`, each with
   its source link.
6. "Bundle size": `<SizeChart />` and the table view.
7. "Startup and resolve time": `<TimingChart scenario="ready" />`, the other scenarios as a
   table, and the `noisy` flags.
8. "Where X fits better": the cases where the competitor is the better choice, from
   `libraries.json` claims with sources. Two examples of what this section holds: awilix needs
   no build-time type information and loads modules by glob; InversifyJS has the largest
   user base and its own framework integrations.
9. "Moving from X to NexusDI": an API mapping table, X's call on the left and NexusDI's on
   the right, one row per concept the page covers.
10. "How this page was measured": section 4.12.

### 5.3 What comes from the harness

Sections 2, 3, 4, 6, 7 and 10 render from the results files. Sections 1, 5, 8 and 9 render
from `libraries.json`'s `claims`, each of which has this shape:

```ts
interface Claim {
  id: string; // 'lifetimes', 'scopes', 'async-init', 'where-it-fits', …
  text: string; // one sentence, in the docs' prose rules
  source: string; // URL of the library's own documentation or source
  verifiedAgainst: string; // the library version the sentence was checked against
}
```

No sentence on these pages states a figure or a claim about another library outside a
component. The reviewer agent already checks that `/comparison/` cites its sources (docs
spec §14.6), and the `doc-benchmark-figures` guard (section 9) extends the rule to the four
new pages and the post.

### 5.4 Tone

The pages follow the docs spec's prose rules and three more:

1. A sentence about a competitor states what it does, with its source. It never
   characterises it ("heavy", "bloated", "outdated", "magic").
2. Section 8, "Where X fits better", is required and holds at least two claims.
3. A figure in prose names both libraries, the bundler or scenario, and the unit, and each
   number in the sentence is a `<Figure />` component. A sentence on bundle size also gives
   the polyfill's share where one exists.

### 5.5 Upkeep when a competitor releases

- The weekly `competitor-releases` job opens an issue per new version (section 4.8).
- The owner bumps the pin in `libraries.json`. The pull request runs `bench-check`, and the
  next `bench-full` publishes timings. The pages update from the results with no prose edit.
- The `libraries-claims` guard fails while any claim's `verifiedAgainst` differs from its
  library's pin. The person who bumps the pin re-reads each claim against the new version,
  edits it if needed, and updates `verifiedAgainst`. So a stale claim blocks the pin bump,
  and a page can never show new numbers beside a claim checked against an old version.
- A major version of a competitor also re-runs the fixture review of section 4.3.

## 6. The launch post

### 6.1 Source and metadata

The post is `apps/docs/content/blog/dependency-injection-without-reflect-metadata.mdx`, a
`post` page (docs spec amendment A2) dated 0.4.0 final day:

```yaml
title: 'Dependency injection without reflect-metadata: one graph, five containers, ten toolchains'
kind: post
authors: [evanion]
tags: [release, toolchains, benchmarks]
description: The same eight-provider graph in NexusDI, InversifyJS, tsyringe, awilix and needle-di, built by ten TypeScript toolchains, with the setups, the failures, the wiring errors, the sizes and the timings.
version: 0.4.0
```

Two more keys are written in the pull request that publishes the post on final day
(section 10.2): `date`, the release date, and `results`, the path of the timings file the
0.4.0 tag run wrote. Until that pull request, `doc-benchmark-figures` accepts a post without
`results` only on `/next/`, where the blog is not built. `results` pins every component on the page to the tag run's timings file, and to the
matrix, probes and size files at that run's commit, which `benchmark-data.mjs` reads with
`git show <sha>:benchmarks/results/<file>`. A later benchmark run changes the comparison
pages and leaves the post as published.

The marketing plan's working title reads "compiled by four toolchains". The harness runs ten
cells, and the title states what the post shows. The title is the owner's call (section 13).

Target length: 1,500 words of prose, excluding code and tables.

### 6.2 Outline

1. Opening, two paragraphs. The three claim sentences from `claim.json`, rendered by
   `<Claim />`. One sentence of disclosure: the author maintains NexusDI.
2. "The graph": Meridian-8 as a captioned `mermaid` fence, and the NexusDI fixture's wiring
   (`provide()` and `defineModule()`), cited from `benchmarks/fixtures/nexusdi/plain.ts`
   with a `region`.
3. "The same graph in four other containers": the documented variant of each competitor,
   each a region of its fixture, 10 to 15 lines each.
4. "Ten toolchains": `<ToolchainGrid />` for the documented variants. Every non-pass cell
   is explained in one or two sentences with its `message`. The explanation for a metadata
   failure: `emitDecoratorMetadata` needs the type checker, and esbuild does not run one
   (evanw/esbuild#257).
5. "The workaround, and what it still needs": the `decorated-explicit` rows. They show which
   cells an explicit token on every parameter fixes, and that `experimentalDecorators` and
   the Reflect polyfill remain.
6. "What NexusDI checks before it constructs anything": the NexusDI `two-mistakes` probe
   fixture, its `BlueprintError` output as the probe recorded it, and `<ProbeTable />` for
   all five libraries. A link opens the same broken graph in the Playground
   (`/playground/?seed=launch-blueprint-error`). This section carries the differentiator
   against awilix and needle-di, which share "no reflect-metadata".
7. "Size and startup": `<SizeChart bundler="esbuild" />` and
   `<TimingChart scenario="ready" />`, with one sentence each on what the figure includes.
   The other scenarios link to the comparison pages.
8. "Rerun it": the commands, the results files at their commit, the versions, and the
   invitation of section 4.12.
9. "Try it": the Playground seed, Academy mission 1, `npm install @nexusdi/core`, and
   `/upgrade/` for 0.3 users.

### 6.3 Code shown

Every TypeScript fence in the post is a region of a benchmark fixture, so the code a reader
sees is the code the harness measured. `doc-regions` (docs spec §14.3) adds
`benchmarks/fixtures` to its roots. G3 skips posts, and G5 checks the `@nexusdi/…` imports.
Meridian names satisfy the domain guard.

### 6.4 Charts and tables

The docs spec defines colour roles and the graph view, and no chart conventions. This
section sets them for every benchmark figure.

- Form. Size and time are magnitudes across five named libraries, so both are horizontal
  bar charts with the library names on the category axis, sorted by value. The value axis
  starts at zero. Size and time are separate charts; no chart has two value axes.
- Colour. The job is to set NexusDI apart from the context, and the axis labels carry
  identity. NexusDI's bar takes a new `chart-focus` role (`signal-cyan`: `#5eeaff` dark,
  `#006b85` light), and the other bars take `chart-context` (`text-tertiary`: `#8e99cc`
  dark, `#7f89b0` light). Measured with the dataviz validator on 2026-09-23 against the
  docs spec's worst composites: in dark mode the pair separates by ΔE 21.0 for normal
  vision and 17.5 for deuteranopia, and in light mode by 16.3 and 12.4, and every bar holds
  3:1 against its surface. The validator's lightness and chroma checks fail by design,
  because the context colour is neutral, and they apply to categorical palettes, which
  this pair is not. `meridian-ui`'s token test runs the validator on both pairs.
- Marks. Bars 4px rounded at the data end, a 2px gap between bars, a MAD whisker in
  `text-secondary` on timing bars, the value as a direct label at the bar's end in text
  tokens, and a `noisy` label where the flag is set.
- The toolchain grid is a table: rows are library and variant, columns are toolchain cells.
  A cell shows an icon and a text label (`pass`, `compile error`, `runtime error`,
  `wrong instance`, `n/a`), and `status-pass` or `status-fail` colours the icon only. A cell
  with a `message` opens it on focus or hover.
- Interaction. Each bar shows a tooltip on hover and focus with the median, the MAD, the
  p99 and the round count. Each chart has a `<details>` table view rendered on the server,
  and a caption naming the scenario, the runner's CPU and the results file.
- Rendering. The charts are server-rendered SVG from `generated/benchmarks.json`, in
  `apps/docs/components/benchmarks/`, with no chart library, as the graph view is drawn
  (docs spec §12).

### 6.5 The dev.to cross-post

`apps/docs/tools/devto-export.mjs` runs in `postbuild` after the `.md` siblings and writes
`out/blog/dependency-injection-without-reflect-metadata.devto.md`, which is not linked from
any page. It takes the post's `.md` sibling and:

- prepends dev.to front matter: `title`, `published: false`, `description`,
  `tags: typescript, javascript, node, webdev` (dev.to accepts at most four),
  `canonical_url: https://nexus.js.org/blog/dependency-injection-without-reflect-metadata/`
  and `cover_image`;
- replaces each chart and the grid with a PNG at an absolute `nexus.js.org` URL plus its
  table view in Markdown. The PNGs and the 1000×420 cover are rendered from the same SVG in
  `postbuild`;
- makes every relative link absolute.

The owner pastes the file into dev.to's editor. dev.to's RSS import could set the
canonical URL automatically, but it imports drafts and takes the feed's first four
categories as tags, and a paste keeps the tags and the table views under control. The
marketing plan owns the posting day.

## 7. The claim

### 7.1 The text

The fact-check verified these sentences on 2026-09-23. They are used verbatim:

1. "Type-safe dependency injection for TypeScript 5.4 through 7. No reflect-metadata, no
   emitDecoratorMetadata."
2. "The core is decorator-free, so it runs with any TypeScript compiler, bundler or
   type-stripper."
3. "Optional decorators use TC39 standard decorators (2023-11 semantics) and
   Symbol.metadata, with no experimentalDecorators."

Phrases the repository never uses about NexusDI: "native decorators", "Stage 3", "works
with any transpiler" without the decorator-free qualifier, any statement that TypeScript 7
dropped `experimentalDecorators` or `emitDecoratorMetadata` (7.0.2 emits both), "first" or
"only" as a claim about NexusDI's place among DI libraries, and "transformer API".

### 7.2 `apps/docs/claim.json`

```ts
interface ClaimFile {
  sentences: Array<{
    id: 'types' | 'toolchains' | 'decorators';
    text: string; // verbatim from the fact-check
    evidence: Evidence[];
  }>;
  hero: { lead: string; support: string }; // section 8
  neverSay: Array<{ pattern: string; flags?: string; reason: string }>;
}

type Evidence =
  | {
      kind: 'matrix';
      library: 'nexusdi';
      variant: 'plain' | 'decorated';
      toolchains: 'all' | string[];
      expect: 'pass';
    }
  | { kind: 'ci-job'; workflow: string; job: string } // for example ci.yml types-floor
  | { kind: 'package'; field: 'dependencies'; expect: 'empty' }
  | { kind: 'test'; file: string; title: string };
```

The evidence per sentence:

- `types`: the engine plan's Task 36 job that checks the type tests on TS 5.4 and TS 7;
  `libs/core/package.json` with empty `dependencies`; every NexusDI cell, both variants,
  built with `emitDecoratorMetadata` absent from its profile.
- `toolchains`: every `nexusdi` `plain` cell in `matrix.json` is `pass`, across all ten
  toolchain cells.
- `decorators`: every `nexusdi` `decorated` cell is `pass` where the toolchain lowers
  2023-11 decorators; `vite-oxc` and `node-strip` are the documented exceptions and carry
  their `documented` URLs. Also the packaging check "compiles a decorated class with no
  `experimentalDecorators`" (core spec §17) and the test for `NEXUS_LEGACY_DECORATORS`.

`<Claim id="toolchains" />` renders a sentence from the file, so the post, the landing page
and the comparison pages never retype one.

## 8. README hero, comparison table, badges and keywords

### 8.1 Hero

The marketing plan leads with graph validation. The fact-check limits "every toolchain" to
the decorator-free core. The hero joins the two:

> Typed dependency injection for TypeScript 5.4 through 7, with the whole graph checked
> before anything is constructed.
>
> No reflect-metadata, no experimentalDecorators. The core is decorator-free, so it runs
> with any TypeScript compiler, bundler or type-stripper.

The support line's second sentence is fact-check sentence 2 verbatim. The lead line takes
the version range from sentence 1.

`claim.json`'s `hero` holds both lines. The root `README.md` and `libs/core/README.md`
carry them at the top, and the landing page's two-sentence definition (docs spec §5.2,
item 1) uses the lead line as its first sentence. Under the hero, the README shows the
ten-line NexusDI `two-mistakes` probe and the `BlueprintError` it prints, both regions the
README doctests run. The logo stays. The tagline about coffee, the "inspired by" paragraph, the emoji
and the "Call for Feedback" block go, and the RC info box of core spec §14 is removed in the 0.4.0
release commit.

`libs/core/package.json`'s `description` becomes the lead line.

### 8.2 Comparison table

`nx run benchmarks:readme` writes a Markdown table between
`<!-- comparison:start -->` and `<!-- comparison:end -->` in both READMEs. One row each for
NexusDI, InversifyJS, tsyringe, awilix and needle-di. Columns, from the marketing plan:

| Column                            | Source                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Needs reflect-metadata            | the documented variant's `polyfill` in `matrix.json`                                                                                                                      |
| Graph checked before construction | `probes.json`: "yes" when `missing-provider`, `cycle` and, where applicable, `captive-scoped` are all `create` or `typecheck`; otherwise the latest `detectedAt` in words |
| Async init with sync `get()`      | the `async-init` claim in `libraries.json`                                                                                                                                |
| Scopes                            | the `scopes` claim in `libraries.json`                                                                                                                                    |

A line under the table links to `/comparison/` and to the results files. The table is
generated, so the `readme-comparison` check (section 9) fails when a README region differs
from what the target writes.

### 8.3 Badges

The README keeps five badges: the npm version, the `ci.yml` status, the license, the
provenance badge, and one new "toolchains" badge. It drops bundlephobia, unpacked size,
libraries.io, the language badge and the stars badge. A size and a dependency badge come
from the build: `apps/docs/tools/badges.mjs` writes Shields endpoint JSON
(`{ "schemaVersion": 1, "label", "message", "color" }`) to `out/badges/size.json` (from
`size.json`, NexusDI `plain`, esbuild gzip), `out/badges/dependencies.json` (from
`package-facts`) and `out/badges/toolchains.json` ("10 of 10 pass" from `matrix.json`).
The READMEs point `img.shields.io/endpoint?url=` at the root site, so each badge shows the
newest release's figures.

### 8.4 npm keywords

`libs/core/package.json` `keywords` in 0.4.0:

```json
[
  "dependency injection",
  "dependency-injection",
  "di",
  "ioc",
  "inversion of control",
  "container",
  "typescript",
  "decorators",
  "standard decorators",
  "tc39 decorators",
  "esbuild",
  "vite",
  "swc",
  "bun",
  "deno",
  "scopes"
]
```

The list drops "javascript", "nodejs", "lightweight", "modular", "provider", "service" and
"module", which match too many packages to help a search. It names no competitor.

## 9. Guards

Four checks join `tools/repo-checks/src`, each with fixtures in the libraries shape:

| Check                   | Rule                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `launch-claim`          | Every evidence entry in `claim.json` holds against the results files, CI config and tests it names. Both READMEs contain `hero.lead` and `hero.support` verbatim. No file under `apps/docs/content`, no README and no `package.json` description matches a `neverSay` pattern, pre-0.4.0 posts and the Migration band excepted. |
| `doc-benchmark-figures` | On `/comparison/`, the four `/vs-*/` pages and every post from 0.4.0 on, no prose outside a component matches a number followed by `ns`, `µs`, `ms`, `kB`, `KB`, `bytes` or `%`. A page with a benchmark component names a `results` file that exists, when it names one.                                                       |
| `libraries-claims`      | Every claim in `libraries.json` has a `source` URL and a `verifiedAgainst` equal to its library's pin. Every fixture's header cites the URL and version in `libraries.json`.                                                                                                                                                    |
| `readme-comparison`     | Both READMEs' comparison regions equal what `benchmarks:readme` writes from the committed results.                                                                                                                                                                                                                              |

## 10. Launch timeline in the repository

The marketing plan owns the order of channels by day, from a Tuesday launch. This section
covers what the repository does and when. T is 0.4.0 final day.

### 10.1 Before final

- During the RC, once Task 30 merges: the recipe extension (section 3), the fixtures, the
  matrix, the probes and the sizes, then the timings. `bench-full` runs weekly against the
  newest RC tag.
- T−21 days: the four `/vs-*/` pages and the updated `/comparison/` are content-complete on
  `/next/` (not indexed). The post is written against the newest RC run.
- T−7: pins frozen. The owner's decision on inviting maintainers applies here (section 13).
  `launch-claim`, `libraries-claims` and `readme-comparison` pass on `main`.
- T−2: a pull request sets `deploy.json` to `mode: "final"` and builds the artefact in CI
  without merging, so the final-mode artefact and its redirect stubs are checked before
  the day.

### 10.2 Final day, in order

1. The 0.4.0 release commit carries the README hero, the comparison table, the badges, the
   keywords, the new `description`, and the removal of the RC info box. npm renders
   `libs/core/README.md` from the published tarball, so these must be in the tree before
   `nx release` publishes.
2. `nx release` publishes 0.4.0 and pushes the `@nexusdi/core@0.4.0` tag.
3. The tag triggers `bench-full`, which opens the results pull request with the timings
   file for 0.4.0. The owner merges it.
4. A pull request sets the post's `date` and its `results` to that file, and merges.
5. The `mode: "final"` pull request from T−2 merges. `docs.yml` builds the root from the
   0.4.0 tag with the blog and the results from `main`, and the smoke job runs.
6. The owner checks the live post, the four pages, the badges and the Playground seed, then
   takes `out/blog/…devto.md` from the deploy artefact for the dev.to paste.
7. The channel posts follow the marketing plan.

### 10.3 After launch, in the repository

- Issues and Discussions labelled `benchmarks` are answered within 48 hours, the marketing
  plan's triage window. A setup correction follows section 4.12.
- A result that changes after a correction gets a dated `Note` on the post, with the link to
  the new run.
- The marketing plan's follow-up post one week after launch uses the same components with
  its own pinned run.

The Show HN text is written by the owner by hand: the Show HN guidelines ask authors not to
use an LLM for any of it (dang's Show HN tips, <https://news.ycombinator.com/item?id=22336638>).
Show HN takes something people can try, so the repository's artefact for it is the
Playground seed URL and the repository URL. The post alone is off-topic there.

## 11. Scope: 0.4.0 final and after

Required for 0.4.0 final:

- The recipe extension, the `benchmarks` project, the ten toolchain cells, the eleven
  library-variants, the five probes, both bundlers and the five timing scenarios.
- `benchmarks.yml` with all three jobs, and at least one tag run on an RC.
- `/comparison/` updated and the four `/vs-*/` pages.
- The post, its charts, its PNG exports and the dev.to export.
- `claim.json`, the four guards, the README hero and table, the badges, the keywords and the
  issue template.

After the launch:

- Timings on Bun and Deno, and a browser timing run through Playwright.
- A scaled graph (a generated 200-provider layered graph) for `ready` and
  `resolve-transient`.
- Async factories as a fifth matrix section, for the libraries that support them.
- A benchmark cell per integration package, once the integrations spec merges.
- Migration guides from tsyringe, TypeDI and InversifyJS, which the marketing plan places
  in its content backlog.
- A dedicated runner or CodSpeed, if the owner wants timings to gate pull requests.
  CodSpeed supports tinybench and Vitest, and it does not support mitata.

## 12. Amendments to the docs spec

- §4.3: inventory #24 changes its title (section 5.1). Pages 35 to 38 are `/vs-inversify/`,
  `/vs-tsyringe/`, `/vs-awilix/` and `/vs-needle-di/`, kind `contract`, in the Guides band.
  The blog table gains B5, the launch post.
- §8.2: the roles `chart-focus` and `chart-context` (section 6.4).
- §14.2: the targets `docs:benchmark-data` and the `postbuild` steps `devto-export.mjs` and
  `badges.mjs`.
- §14.3: `doc-regions` adds `benchmarks/fixtures` to its roots; the four checks of section 9.
- §15.3: step 3 copies `benchmarks/results/` from `main`; the path filter adds
  `benchmarks/results/**`.
- §19: the out-of-scope line for benchmarks (#21) is replaced by this spec.

## 13. Decisions for the owner

1. The post title. Recommendation: "Dependency injection without reflect-metadata: one
   graph, five containers, ten toolchains". The marketing plan's working title says four
   toolchains and says the post shows failures "under esbuild, SWC and TS 7". The
   fact-check found that TS 7.0.2 emits decorator metadata, and SWC documents
   `decoratorMetadata`, so the post names failing cells from the results only.
2. mitata. It is the owner's choice, pinned at 1.0.34, last released 2025-02-04, and
   CodSpeed does not support it. Recommendation: keep it for 0.4.0. It reports the
   percentiles, heap and dead-code flag the methodology uses. Revisit only if timings
   should gate pull requests.
3. Runner. Recommendation: GitHub-hosted `ubuntu-24.04`, with interleaved rounds and the
   `noisy` flag, and no self-hosted machine. The pages compare libraries within one run only.
4. Issue #21 proposes an Nx plugin with a generator and an executor. Recommendation: close
   #21 with this project and write no plugin. The executors would wrap `nx:run-commands`,
   and a generator for five fixed libraries would template files that the header-comment
   rules already describe.
5. Inviting competitor maintainers before launch. Recommendation: yes, at T−7, one issue or
   Discussion in the InversifyJS, tsyringe, awilix and needle-di repositories linking their
   fixtures and the correction template. A setup a maintainer approved is the strongest
   answer to a "rigged benchmark" comment.
6. `@nexusdi/express`. The brief lists it for 0.4, the marketing plan says to skip Express,
   and Express's middleware page accepts no new entries (expressjs/expressjs.com#2375,
   closed June 2026). Recommendation: decide in the integrations spec; this spec lists no
   Express page.
