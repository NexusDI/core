# NexusDI benchmarks and the 0.4.0 launch

Status: draft for the owner's review.
Projects: `benchmarks` (new, `@nexusdi/benchmarks`, private), `examples/toolchain-matrix`
(extended), `apps/docs` (new pages, a post, a build target, two postbuild steps),
`tools/repo-checks` (four guards), the two READMEs and `libs/core/package.json`. No
published API changes.
Closes: #21.
Prior art: the owner's two earlier benchmark attempts in this repository, the June 2025
runner on `main` and the Nx plugin on `archive/stash-benchmark` (section 4.13).
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
9. The launch post is `content/blog/catch-di-wiring-mistakes-before-startup.mdx` on
   the new site, published on 0.4.0 final day. Its figures are pinned to one results run
   (section 6).
10. The claim text lives once, in `apps/docs/claim.json`. A guard holds every evidence
    selector in it to the results files, and holds the README, the landing page and the post
    to its sentences and to its list of phrases never to use (section 7).
11. The README hero leads with graph validation. "Any TypeScript compiler, bundler or
    type-stripper" applies to the decorator-free core only (section 8).
12. Every NexusDI example is interface-first: an interface, a `Token<IReactorCore>` for it,
    and a class bound with `useClass`. Each example leads to the override: a test replaces
    the class behind a token with `override(REACTOR, { useClass: FakeReactor })`, and
    no other line changes. The rule covers NexusDI's fixtures, the post, the README and the
    comparison-page snippets. Competitor fixtures stay idiomatic for their library
    (section 4.3).
13. Build time is a harness metric. Every library-variant is built by every toolchain cell
    that has a build step, cold, in ten interleaved rounds, and reported as a median with
    its MAD. A library's headline build time uses a toolchain its own documentation names
    for its documented setup, so a library whose docs require `tsc` for metadata is timed
    with `tsc` (section 4.7).
14. A "Performance comparison" table (bundle size, startup, resolve, build) appears in the
    README and on every comparison page. Every cell comes from the results files and links
    to the methodology page, `/benchmark-method/` (sections 5.6 and 8.2).
15. The pages and the post explain where the differences come from, and each benefit is
    stated with its measured number and nowhere without one (section 5.7).

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
    <library>/snippets.ts   the interface-first binding and test replacement
    probes/<library>/<variant>/<probe>.ts
    tsconfig/<profile>.json
  src/
    matrix.ts               runs every library × variant × toolchain cell
    probes.ts               runs the wiring-mistake probes
    size.ts                 bundles, minifies, compresses, runs the bundles,
                            and counts what tsc-6 emits
    scale.ts                generates the build-only scale-200 fixture per variant
    build.ts                the build-time driver
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
    build.json              build times of the newest published run, committed
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
| `build`   | `src/build.ts`, writes `results/build.json`                 | no            |
| `check`   | `matrix`, `probes` and `size` with `--check` (section 4.10) | no            |
| `bench`   | all five writers, in order                                  | no            |
| `readme`  | `src/readme.ts`                                             | on its inputs |

### 4.2 The graph: Meridian-8

The graph uses the docs' canonical nouns (docs spec §7.1), so the post and the pages
satisfy the domain guard. It has eight providers. In NexusDI's fixtures each one is an
interface, a token typed with it, and a class bound to the token with `useClass`, except
`NAV_CHARTS`, which is a value:

| Token          | Description      | Interface       | Bound to                    | Lifetime  | Dependencies                            |
| -------------- | ---------------- | --------------- | --------------------------- | --------- | --------------------------------------- |
| `REACTOR`      | `'ReactorCore'`  | `IReactorCore`  | `useClass: FusionReactor`   | singleton | none                                    |
| `COMPUTER`     | `'ShipComputer'` | `IShipComputer` | `useClass: QuantumComputer` | singleton | `REACTOR`                               |
| `POWER_ROUTER` | `'PowerRouter'`  | `IPowerRouter`  | `useClass: PowerRouter`     | singleton | `REACTOR`                               |
| `SHIELD_GRID`  | `'ShieldGrid'`   | `IShieldGrid`   | `useClass: ShieldGrid`      | singleton | `POWER_ROUTER`                          |
| `NAV_CHARTS`   | `'NavCharts'`    | `INavCharts`    | `useValue`                  | value     | none                                    |
| `BRIDGE`       | `'Bridge'`       | `IBridge`       | `useClass: Bridge`          | singleton | `COMPUTER`, `NAV_CHARTS`, `SHIELD_GRID` |
| `DRONE`        | `'SurveyDrone'`  | `ISurveyDrone`  | `useClass: SurveyDrone`     | transient | `COMPUTER`                              |
| `FLIGHT_LOG`   | `'FlightLog'`    | `IFlightLog`    | `useClass: FlightLog`       | scoped    | `COMPUTER`                              |

The token names are the canonical Meridian tokens that the core, docs and integrations specs
share, and each token's description is the role name. `BRIDGE` is the one token this spec
adds: the graph needs a singleton with three dependencies at its top, and the canonical set
has none. A class's constructor takes interfaces, for example
`constructor(reactor: IReactorCore)`, and the deps tuple names tokens:
`provide(COMPUTER, { useClass: QuantumComputer, deps: [REACTOR] })`. The rest of this spec
names a provider by its role name (`ShipComputer`, the token's description) and a binding by
its token.

The docs spec's canonical vocabulary (§7.1) uses classes as tokens. It predates the owner's
interface-first rule and needs the same change, which section 12 lists.

The shape covers a chain three edges deep (`Bridge` to `ReactorCore` through `ShieldGrid`
and `PowerRouter`), a diamond on `ReactorCore`, a token that no runtime type describes, and
one provider per lifetime. It differs from the docs' ship in one
place: `PowerRouter` takes `ReactorCore` where the docs give it `lazy(ShieldGrid)`, because
four of the five libraries express a lazy edge differently. The cycle probe restores the
docs' cycle (section 4.6).

Every class carries a `readonly kind` field holding its role name, for example
`readonly kind = 'ShipComputer'` on `QuantumComputer`. The scenario identifies instances
through `kind`, so every library prints the same golden output whatever its class names, and
a minified bundle, which renames classes, prints it too.

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

| Library     | `plain`                                                                                      | `decorated`                                                                                                                | `decorated-explicit`                                  |
| ----------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| NexusDI     | interface tokens, `provide(TOKEN, { useClass, deps })`, `defineModule()` (documented)        | `@Injectable({ deps: [tokens] })` classes, each token bound to its class with `useExisting`, `@Module`, profile `standard` | not applicable                                        |
| InversifyJS | `toResolvedValue(fn, [deps])` bindings                                                       | `@injectable()`, `@inject` for `NAV_CHARTS`, profile `legacy-metadata` (documented)                                        | `@inject(Token)` on every parameter, profile `legacy` |
| tsyringe    | `container.register` with `useFactory`                                                       | `@singleton()`, `@inject` for `NAV_CHARTS`, profile `legacy-metadata` (documented)                                         | `@inject(Token)` on every parameter, profile `legacy` |
| awilix      | `createContainer({ injectionMode: PROXY, strict: true })`, `asClass`, `asValue` (documented) | not applicable                                                                                                             | not applicable                                        |
| needle-di   | `container.bind` with `useFactory` and `inject()`                                            | `@injectable()` with `inject()` fields, profile `standard` (documented)                                                    | not applicable                                        |

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
5. Competitor fixtures use whatever tokens their documentation uses. NexusDI's fixtures
   follow decision 12.

Each library also has `benchmarks/fixtures/<library>/snippets.ts`. It binds `REACTOR`
and `COMPUTER` interface-first in that library's own API (an interface, the library's
token type, a class bound to the token), then replaces `REACTOR` with `FakeReactor` the
way the library's documentation does for tests. The comparison pages and the post show these
snippets (sections 5.2 and 6.2). `matrix.ts` compiles each snippets file with `tsc-6` and
runs a `snippets` check: `COMPUTER` resolves with the real `FusionReactor`, then with
`FakeReactor` after the replacement. A snippet that fails the check fails `bench-check`. Each
snippet's header cites the pages that document the token and replacement APIs, and
`libraries-claims` holds the citation to the pin.

Review: before a fixture merges, a person reads it beside the cited page and ticks each rule
in the pull request template section "Benchmark fixture review". At T−7 the maintainers
of each competitor are invited to review their fixtures (section 10.1).

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

Six metric families, in five files:

| Family  | Metric                                                                          | Unit         | File                 |
| ------- | ------------------------------------------------------------------------------- | ------------ | -------------------- |
| matrix  | outcome per cell and section                                                    | enum         | `matrix.json`        |
| probes  | `detectedAt` per probe, `reported` for `two-mistakes`                           | enum, int    | `probes.json`        |
| size    | minified and min+gzip size of the Meridian-8 app, per bundler                   | bytes        | `size.json`          |
| emit    | `tsc-6` output bytes, `__metadata` and `__decorate` calls, imports kept in emit | bytes, count | `size.json`          |
| timings | cold start, ready, warm singleton resolve, transient resolve, scope cycle       | ns           | `timings/<run>.json` |
| build   | wall-clock cold build per library-variant and toolchain cell                    | ms           | `build.json`         |

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

Build time. `build.ts` times the `compile()` step of section 3.3, from process spawn to
exit, for every library-variant under every toolchain cell with a build step: `tsc-6`,
`tsc-7`, `esbuild`, `swc`, `babel`, `vite-oxc`, `vite-babel` and `bun`. `deno` and
`node-strip` transpile at load, so their build cells are `not-applicable`, and their transpile time
sits inside a cold start. Two fixtures:

- `meridian-8`, the fixture of section 4.2. At eight classes, toolchain start-up dominates
  its build time, so it shows the fixed start-up time a user waits for on every build.
- `scale-200`, generated by `scale.ts` for each library-variant: 200 classes in 20 layers
  of 10, one class per file, each depending on two classes of the layer below, wired the
  way that library-variant's Meridian-8 fixture wires its providers. It is build-only, so
  it never runs, and its per-class work (decorator and metadata emit, type resolution
  across files) show at a size where they outweigh start-up.

A build is cold: the output directory is empty and every tool cache is cleared or disabled
before each build (`tsc` without `incremental`, Vite with `--force` and an empty cache
directory, `BABEL_DISABLE_CACHE=1`). One unmeasured build per cell runs first, so the
operating system's file cache is warm for every measured build and each round measures the
toolchain. The runner discipline is the timings': ten rounds, one process per build, the
round order across libraries and toolchains shuffled with the recorded seed, the median of
the rounds with the MAD, and the `noisy` flag above 5%.

A build cell whose matrix outcome is `compile-error` is not timed. A cell that builds and
then fails at run time is timed and carries its matrix outcome beside the figure, so a fast
build that produces a broken app never reads as a result on its own.

The metadata setups get the build their documentation requires. InversifyJS's
getting-started page sets `experimentalDecorators` and `emitDecoratorMetadata` for `tsc`,
and tsyringe's README names `tsc` and, for Babel, `babel-plugin-transform-typescript-metadata`.
TypeScript emits `design:paramtypes` from the type checker's view of each parameter.
Single-file compilers (esbuild, SWC, Oxc, Babel) see one file at a time: esbuild emits no
metadata, and the others derive it from the annotation's syntax, which Vite documents as
"only partially supported". `libraries.json` lists each library's `documentedToolchains`
(`'any'` for NexusDI, awilix and needle-di, whose docs name no compiler). A library's
headline build time is its fastest median among cells that pass the matrix and use a
toolchain in that list. Every other cell stays in the build grid.

Emit. `size.ts` also compiles each library-variant's `scale-200` fixture with `tsc-6` and
counts, in the emitted JavaScript: total bytes, `__metadata(` calls, `__decorate(` calls,
and import declarations kept, against the source's import declarations. These counts are
deterministic, so they live in `size.json` and `--check` holds them byte for byte.

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
  competitor pin changed, or on every tag run. The timing file and `build.json` are
  committed only in that pull request. The raw mitata JSON is uploaded as a workflow artifact.
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
  emit: Array<{
    library: LibraryId;
    variant: Variant;
    fixture: 'scale-200';
    toolchain: 'tsc-6';
    emittedBytes: number; // unminified JavaScript output, all files
    metadataCalls: number; // __metadata( occurrences
    decorateCalls: number; // __decorate( occurrences
    importsInSource: number;
    importsKept: number; // import declarations still present in the output
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

// results/build.json: rewritten by every published run; its git history is its history.
interface BuildFile {
  schema: 1;
  sha: string;
  startedAt: string; // ISO 8601
  versions: Versions;
  runner: TimingsFile['runner'];
  seed: number;
  rounds: number;
  // build[library][variant][toolchain]; only cells with a build step appear.
  build: Record<LibraryId, Partial<Record<Variant, Record<string, BuildCell>>>>;
}
interface BuildMeasure {
  median: number; // ms, wall clock, cold
  mad: number; // ms
  rounds: number[]; // ms, in run order
  noisy: boolean;
}
// The cell's own median and mad are the scale-200 build, the headline fixture.
interface BuildCell extends BuildMeasure {
  outcome: Outcome; // the matrix outcome of this cell
  headline: boolean; // the library's fastest passing documented toolchain
  'meridian-8': BuildMeasure;
}
```

The docs address a single figure with a dotted path, `<family>.<keys>.<field>`. Every
component and `<Figure of="…" />` uses these paths, and `benchmark-data.mjs` indexes the
array files into the same tree, so a path resolves the same way whatever the file's layout.
A unit test in `benchmarks/src` holds the grammar, and a docs build fails on a path that
does not resolve.

| Family    | Path                                                                                                  | Example                                      |
| --------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `matrix`  | `matrix.<library>.<variant>.<toolchain>.outcome`                                                      | `matrix.tsyringe.decorated.esbuild.outcome`  |
| `probes`  | `probes.<library>.<variant>.<probe>.detectedAt`                                                       | `probes.awilix.plain.cycle.detectedAt`       |
| `size`    | `size.<library>.<variant>.<bundler>.<minified\|gzip\|polyfillGzip\|runs>`                             | `size.nexusdi.plain.esbuild.gzip`            |
| `emit`    | `emit.<library>.<variant>.<emittedBytes\|metadataCalls\|decorateCalls\|importsInSource\|importsKept>` | `emit.inversify.decorated.metadataCalls`     |
| `timings` | `timings.<library>.<variant>.<scenario>.<median\|mad\|p99\|heapBytes\|noisy>`                         | `timings.nexusdi.plain.cold-start.median`    |
| `build`   | `build.<library>.<variant>.<toolchain>.<median\|mad\|noisy\|outcome\|headline>`                       | `build.nexusdi.plain.tsc-6.median`           |
| `build`   | `build.<library>.<variant>.<toolchain>.meridian-8.<median\|mad\|noisy>`                               | `build.nexusdi.plain.esbuild.meridian-8.mad` |

`emit` paths read `size.json`'s `emit` array. A `timings` path reads the file the component's
`run` prop names, or the newest. The other families read the file at the results commit the
page or post pins, or the committed file.

### 4.10 Result history

The three deterministic files (`matrix.json`, `probes.json`, `size.json`) are committed
and carry no timestamp. `--check` regenerates
each one and fails when it differs from the committed file, as Task 30's `--check` does. Git
history is their history: `git log -p benchmarks/results/matrix.json` shows every outcome
that changed and the commit that changed it.

`build.json` is rewritten by each published run and committed in that run's pull request.
Build times vary by machine, so `--check` leaves it out, and its git history holds every
earlier run. The post pins it through its results commit, as it pins the deterministic
files.

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
  unit, addressed by the path grammar of section 4.9.
- `<MeasuredWith />`: the versions, the runner and a link to the results file at its commit.
- `<PerformanceTable libraries? />`: the table of section 5.6.
- `<BuildChart fixture="scale-200" />`: headline build times from `build.json` as bars,
  each labelled with its toolchain.
- `<BuildGrid />`: every build cell as a table, with each cell's matrix outcome.
- `<Benefits competitor />`: the rows of section 5.7 that the results support.

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
  toolchain cells, with five probes, two bundlers and five timing scenarios on Node 24;
  cold builds of Meridian-8 and of the generated 200-class `scale-200` under eight
  toolchain cells.
- What was not tested: timings on Bun, Deno or in a browser; incremental, watch-mode or
  editor type-check time; runtime graphs larger than eight providers; async factories;
  request scoping semantics beyond "one instance per scope"; memory beyond mitata's heap
  figure; any framework integration.
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

### 4.13 Prior art in this repository

The owner built two benchmark tools before this spec. Both were read at their commits on
2026-09-23.

The June 2025 runner. `c678b24` added `benchmarks/runner/` with `compare-libraries.ts`,
`validate-numbers.ts` and `performance-comparison.ts`, run through `tsx`. `ed388b1` added
`measure-registration.ts` and committed `results.json`. `deb8063` ("Adopt NX") deleted the
directory. The runner:

- wrote every library's graph with interfaces and tokens (`IDatabase`, `ILogger`,
  `IUserService`, `new Token<IDatabase>('DATABASE')`), the pattern decision 12 now requires;
- measured startup, resolve and heap for NexusDI, InversifyJS, tsyringe and TypeDI in one
  process, after one `import 'reflect-metadata'` at the top of the file, as the average,
  minimum and maximum of 1,000 iterations;
- wrote bundle sizes as literals in the source (`bundle: { core: 32, dependencies: 64,
total: 96 }`), and `validate-numbers.ts` checked a measurement against the documented
  figure (`bundleSizeValid: metrics.bundle.total === 96`);
- pinned the competitors with caret ranges.

The Nx plugin. `archive/stash-benchmark` (`f344d32`, 2025-06-27) holds `tools/benchmark`,
`@nexusdi/benchmark`, with:

- `BenchmarkBase` in `src/shared.ts`: an abstract class with `startup()`, `register()` and
  `resolve()` phases, timed with `performance.mark` and `measure`, heap snapshots after each
  phase, and a `bundleTarget` field. `getBundleSize()` returns `0` under a
  `@ts-expect-error` and a TODO.
- An executor (`src/executors/benchmark.ts`) that imports a project's `src/benchmark.ts`
  into the Nx process, runs it `iterations` times, averages the phases, and prints
  `console.table` or JSON.
- A generator (`src/generators/benchmark.ts`) that writes `benchmarks/<name>/` with a
  `project.json` whose `benchmark` target uses the executor, a `package.json`, a
  `tsconfig.json`, a README and a `benchmark.ts` from a template. It points the target at
  `src/index.benchmark.ts` while the template writes `src/benchmark.ts`, and it calls
  `generateFiles` twice with the same arguments.
- Two generated projects, `benchmarks/nexus` and `benchmarks/inversify`, with the 0.3 API
  and a `UserService` graph.

What this spec reuses:

1. The interface-and-token graph of the June runner. Meridian-8 keeps its shape (an
   interface, a token, a class) and moves it to the Meridian nouns (section 4.2).
2. `BenchmarkBase`'s idea of one contract every library implements. It becomes the
   fixture's exported `adapter` object (`ready()`, `scope()`, `dispose()`), which the
   shared `scenario.mjs` drives (section 4.4). The contract is an object a single file
   exports, so every toolchain cell can build it; a base class imported from a workspace
   package would have to be built by each toolchain too.
3. The phase split of `BenchmarkBase`. Each phase becomes a separate scenario
   (`cold-start`, `ready`, the resolves), because 0.4's sealed container has no register
   phase apart from `Nexus.create` and the others differ in which phase does the work
   (section 4.7).
4. The heap figure after startup, as mitata's heap statistic for `ready`.
5. `validate-numbers.ts`'s intent, a check that the published numbers are true, turned the
   other way round: the docs and the README read the numbers from the results, and
   `doc-benchmark-figures` and `readme-comparison` fail on any figure typed by hand
   (section 9).

What this spec replaces, and why:

- Averages of in-process iterations, with every library in one process and
  `reflect-metadata` loaded for all of them. `reflect-metadata` patches the global
  `Reflect`, and V8 specialises code on the shapes it has seen, so one library's run changes
  the next. The harness runs each library, scenario and round in its own process and
  reports medians with their MAD.
- The executor's in-process import. It runs the benchmark inside the Nx process, next to Nx's
  own work, and it needs a TypeScript loader for `src/benchmark.ts`. Nx also runs one target
  per project, in parallel by default, so two libraries' benchmarks would share the CPU,
  and no per-project target can shuffle rounds across libraries. The timing drivers need
  one process that schedules every library.
- Hard-coded and stubbed bundle sizes. `size.ts` measures bundles with two bundlers.
- Caret ranges. `libraries.json` pins exact versions, and `competitor-releases` moves them.
- One project per library. The per-project `package.json` isolated each library's
  dependencies. The harness gets the same isolation from the throwaway consumer each cell
  installs into, and keeps one `libraries.json`, one golden file and one results schema for
  five libraries.

The owner decided on 2026-09-23 to harvest the five parts above and supersede the plugin.
The trade-offs of the three options, as they were weighed:

| Option                      | For it                                                                                                                                                         | Against it                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Adopt and finish the plugin | #21 asked for it; the owner wrote it; `nx g` would scaffold a sixth library in one command; one `benchmark` target per library reads well in the project graph | the executor has to become a process spawner and a cross-library scheduler, which is what `build.ts` and the timing drivers are; the base class and phases assume the 0.3 `set()` API; per-project targets fight the interleaving; the plugin adds `@nx/devkit` code, its tests, and the `nx.json` rewrites that `generator-collateral` guards against |
| Harvest parts (decided)     | keeps the ideas that were right (one contract, interface tokens, separate phases, checked numbers) and none of the code that measured the wrong thing          | #21's generator and executor do not exist; adding a sixth library is a manual copy of one library's fixture folder, guided by the header rules and `libraries-claims`                                                                                                                                                                                  |
| Supersede, reuse nothing    | smallest spec                                                                                                                                                  | discards the interface-token graph and the contract idea, both of which the harness needs anyway                                                                                                                                                                                                                                                       |

The generator is the one part with lasting value: it would write the six to nine fixture,
probe and snippet files a new library needs, in the right places. The marketing plan names
more candidates (typed-inject, brandi, iti). When the owner adds a sixth library, a local
`@nx/plugin` generator that writes those files and the `libraries.json` entry justifies
its upkeep, and section 11 lists it for that point. #21 is closed by the 0.4.0 harness with a
comment that links this section.

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
6. "Performance comparison": `<PerformanceTable />` for NexusDI and X (section 5.6).
7. "Where the difference comes from": `<Benefits />` (section 5.7).
8. "Size, startup, resolve and build in detail": `<SizeChart />`,
   `<TimingChart scenario="ready" />`, `<BuildChart />`, `<BuildGrid />`, the other timing
   scenarios as a table, and the `noisy` flags.
9. "Where X fits better": the cases where the competitor is the better choice, from
   `libraries.json` claims with sources. Two examples of what this section holds: awilix needs
   no build-time type information and loads modules by glob; InversifyJS has the largest
   user base and its own framework integrations.
10. "Binding an interface to a class": the `snippets.ts` binding region for X beside
    NexusDI's, both binding `COMPUTER` to `QuantumComputer` under an interface token.
11. "Replacing a provider in a test": the replacement regions of both snippets files.
    NexusDI's is
    `createTestingContainer(Meridian).override(REACTOR, { useClass: FakeReactor })`.
    The prose states what the override checks: the testing container runs
    the full compiler, so a replacement that breaks the graph fails at `create` (core spec
    §11).
12. "Moving from X to NexusDI": an API mapping table, X's call on the left and NexusDI's on
    the right, one row per concept the page covers.
13. "How this page was measured": section 4.12.

### 5.3 What comes from the harness

Sections 2, 3, 4, 6, 7, 8 and 13 render from the results files. Sections 10 and 11 cite the
`snippets.ts` regions, which the snippets check has run. Sections 1, 5, 9 and 12 render from
`libraries.json`'s `claims`, each of which has this shape:

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
2. Section 9, "Where X fits better", is required and holds at least two claims.
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

### 5.6 The performance comparison table

`<PerformanceTable />` renders one row per library and these columns, each cell a figure
from the results with its unit and, for timings, its MAD:

| Column                 | Source                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Bundle size (min+gzip) | `size.json`, documented variant, esbuild, with the polyfill's share in the tooltip |
| Startup                | `cold-start` median, documented variant, Node 24; `ready` in the tooltip           |
| Resolve                | `resolve-transient` median, documented variant                                     |
| Build time             | the `build.json` cell with `headline: true`, `scale-200`, with its toolchain named |

A cell with no source value shows "not measured" and the reason (for example, a library
without transients). The table's caption names the results run, the runner's CPU and the
core version, and links to `/benchmark-method/`.

`/benchmark-method/`, "How NexusDI's benchmarks are measured", is a `contract` page in the
Guides band. It holds sections 4.2 to 4.7 and 4.12 of this spec in the docs' prose rules,
each H2 with its evidence: the graph, the variants and the documentation each follows, the
toolchain cells and profiles, the break categories, the probes, and the method for size,
emit, timings and builds. The comparison pages, the post and the README table link to it.

### 5.7 Where the difference comes from

The pages and the post explain the measured differences with the mechanisms below. A
benefit is rendered only with its figures, and `<Benefits />` renders a row only when the
results support it: for a count or a byte figure, NexusDI's value is lower; for a timing,
NexusDI's median is lower by more than the two MADs added together. Where a row does not
hold, the component shows both figures under the neutral heading "Measured" with no benefit
sentence. A result that favours the competitor is shown the same way the others are.

| Benefit                            | Mechanism, stated once in prose                                                                                                                                                    | Figures shown                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| No `__metadata` emit per class     | `emitDecoratorMetadata` makes TypeScript write a `__metadata("design:paramtypes", […])` call for every decorated class, beside its `__decorate` call                               | `metadataCalls`, `decorateCalls` and `emittedBytes` for `scale-200`                                    |
| Type-only imports stay erasable    | metadata turns a constructor parameter's type into a runtime reference, so the import of that class stays in the output; a deps tuple of tokens leaves interface imports type-only | `importsKept` of `importsInSource` for `scale-200`                                                     |
| Fast single-file compilers work    | NexusDI needs no type information at build time, so esbuild, SWC and Oxc build a correct app; metadata needs the type checker for a correct result                                 | the headline build time and its toolchain for both libraries, and the matrix cells for those compilers |
| No polyfill in the bundle          | `reflect-metadata` is loaded before any decorated class                                                                                                                            | `polyfillGzip` and the total bundle size                                                               |
| Less work before the first resolve | the polyfill import and the metadata reads run at module load                                                                                                                      | `cold-start` medians                                                                                   |

awilix and needle-di use no metadata, so the first two rows do not hold on their pages, and
the component shows their figures as "Measured". Their pages carry the rows the results
support, such as the graph checks from `probes.json`.

## 6. The launch post

### 6.1 Source and metadata

The post is `apps/docs/content/blog/catch-di-wiring-mistakes-before-startup.mdx`, a
`post` page (docs spec amendment A2) dated 0.4.0 final day:

```yaml
title: 'Catch DI wiring mistakes before your app starts: one graph, five containers, ten toolchains'
kind: post
authors: [evanion]
tags: [release, toolchains, benchmarks]
description: When NexusDI, InversifyJS, tsyringe, awilix and needle-di report a wiring mistake, measured on one eight-provider graph under ten TypeScript toolchains, with the setups, the failures, the sizes and the timings.
version: 0.4.0
```

Two more keys are written in the pull request that publishes the post on final day
(section 10.2): `date`, the release date, and `results`, the path of the timings file the
0.4.0 tag run wrote. Until that pull request, `doc-benchmark-figures` accepts a post without
`results` only on `/next/`, where the blog is not built. `results` pins every component on
the page to the tag run's timings file, and to the matrix, probes and size files at that
run's commit, which `benchmark-data.mjs` reads with
`git show <sha>:benchmarks/results/<file>`. A later benchmark run changes the comparison
pages and leaves the post as published.

The title leads with what NexusDI does for the reader, by the owner's rule. The variants:

1. "Catch DI wiring mistakes before your app starts: one graph, five containers, ten
   toolchains". Recommended. It names the reader's gain, and the post's probe section
   backs it for missing providers, cycles and captive scoped providers.
2. "Find every missing provider before the first request: one graph, five containers, ten
   toolchains". Accurate with "every", because `Nexus.create` reports all missing providers
   in one `BlueprintError`, and narrower in scope.
3. "Wiring mistakes reported at startup: NexusDI and four DI containers under ten
   toolchains". It names the competitors' count in the title, which suits the comparison
   readers of r/typescript, and it reads flatter than variant 1.

The owner's example read "Catch every DI wiring mistake". The recommended title drops
"every": `Nexus.create` reports every missing provider, cycle, lifetime violation and module
error, and a factory that throws at run time, or a `useValue` cast through `any`, still
surfaces later. The slug follows the title, `/blog/catch-di-wiring-mistakes-before-startup/`.

The marketing plan's working title reads "compiled by four toolchains". The harness runs ten
cells, and the title states what the post shows.

Target length: 1,500 words of prose, excluding code and tables.

### 6.2 Outline

The post leads with what NexusDI does for the reader: it reports wiring mistakes when the
container starts. The toolchain story and the figures follow.

1. Opening, two paragraphs. The first shows the reader's problem: a wiring mistake that
   other containers report at the first resolve, in production. The second gives the three
   claim sentences from `claim.json`, rendered by `<Claim />`, and one sentence of
   disclosure: the author maintains NexusDI.
2. "The graph": Meridian-8 as a captioned `mermaid` fence, and the NexusDI fixture's wiring,
   cited from `benchmarks/fixtures/nexusdi/plain.ts` with a `region`: the interfaces, their
   tokens, and `provide(TOKEN, { useClass, deps })` in `defineModule()`.
3. "Two wiring mistakes, reported before anything is constructed": the NexusDI
   `two-mistakes` probe fixture, its `BlueprintError` output as the probe recorded it, and
   `<ProbeTable />` for all five libraries. A link opens the same broken graph in the
   Playground (`/playground/?seed=launch-blueprint-error`). This section carries the
   differentiator against awilix and needle-di, which share "no reflect-metadata".
4. "Swap the reactor in a test": the payoff of the interface tokens. The region from
   `benchmarks/fixtures/nexusdi/snippets.ts` replaces `REACTOR` with `FakeReactor`
   through `createTestingContainer(Meridian).override(...)`, and `QuantumComputer` receives
   the fake with no change to its class or its module. One sentence says the testing
   container checks the graph as production does, so a replacement that breaks it fails at
   `create`.
5. "The same bindings in four other containers": each competitor's `snippets.ts` regions,
   the interface-token binding and the library's replacement for tests, 10 to 15 lines each.
   Each fence links to the full fixture the harness measured.
6. "Ten toolchains": `<ToolchainGrid />` for the documented variants. Every non-pass cell
   is explained in one or two sentences with its `message`. The explanation for a metadata
   failure: `emitDecoratorMetadata` needs the type checker, and esbuild does not run one
   (evanw/esbuild#257).
7. "The workaround, and what it still needs": the `decorated-explicit` rows. They show which
   cells an explicit token on every parameter fixes, and that `experimentalDecorators` and
   the Reflect polyfill remain.
8. "Size, startup and build": `<PerformanceTable />` for all five libraries,
   `<SizeChart bundler="esbuild" />`, `<TimingChart scenario="cold-start" />` and
   `<BuildChart fixture="scale-200" />`, each with one sentence on what the figure includes.
   Then the flag-free, metadata-free design as concrete benefits: `<Benefits />` for
   InversifyJS and tsyringe, whose documented setups use metadata, and the same rule of
   section 5.7, so each benefit appears only with its number. A link goes to
   `/benchmark-method/`, and the other scenarios link to the comparison pages.
9. "Rerun it": the commands, the results files at their commit, the versions, the
   maintainers' review of section 10.1, and the correction route of section 4.12.
10. "Try it": the Playground seed, Academy mission 1, `npm install @nexusdi/core`, and
    `/upgrade/` for 0.3 users.

### 6.3 Code shown

Every TypeScript fence in the post is a region of a benchmark fixture or of a
`snippets.ts` file, so the harness has compiled and run every line a reader sees. Every
NexusDI fence is interface-first (decision 12). `doc-regions` (docs spec §14.3) adds
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
`out/blog/catch-di-wiring-mistakes-before-startup.devto.md`, which is not linked from
any page. It takes the post's `.md` sibling and:

- prepends dev.to front matter: `title`, `published: false`, `description`,
  `tags: typescript, javascript, node, webdev` (dev.to accepts at most four),
  `canonical_url: https://nexus.js.org/blog/catch-di-wiring-mistakes-before-startup/`
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
  built with profile `none` or `standard`.
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
item 1) uses the lead line as its first sentence.

Under the hero, the README shows two regions that its doctests run, in this order:

1. The wiring, about ten lines: `IReactorCore` and `IShipComputer`, the tokens
   `REACTOR` and `COMPUTER`, both bound with `useClass` in one `defineModule`,
   then `Nexus.create` and `get(COMPUTER)`.
2. The payoff, about five lines:
   `createTestingContainer(Engineering).override(REACTOR, { useClass: FakeReactor })`,
   and a `// ->` assertion that the computer holds the fake.

The `BlueprintError` example follows as the first H2, "Wiring mistakes fail at startup",
with the `two-mistakes` probe and the error it prints. The logo stays. The tagline about
coffee, the "inspired by" paragraph, the emoji and the "Call for Feedback" block go, and the
RC info box of core spec §14 is removed in the 0.4.0 release commit.

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

A second generated region, between `<!-- performance:start -->` and
`<!-- performance:end -->`, holds the "Performance comparison" table of section 5.6 as
Markdown, same rows and columns, with a caption line naming the run and linking to
`/benchmark-method/`. The README is published inside the npm tarball, so its figures come
from the newest timings file at the release commit: for 0.4.0, the frozen run of T−7 on the
last RC. The caption says which core version was measured. The docs pages show the newest
run.

A line under each table links to `/comparison/` and to the results files. Both tables are
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

| Check                   | Rule                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `launch-claim`          | Every evidence entry in `claim.json` holds against the results files, CI config and tests it names. Both READMEs contain `hero.lead` and `hero.support` verbatim. No file under `apps/docs/content`, no README and no `package.json` description matches a `neverSay` pattern, pre-0.4.0 posts and the Migration band excepted.                    |
| `doc-benchmark-figures` | On `/comparison/`, the four `/vs-*/` pages and every post from 0.4.0 on, no prose outside a component matches a number followed by `ns`, `µs`, `ms`, `s`, `kB`, `KB`, `bytes` or `%`, and neither README has such a figure outside its generated regions. A page with a benchmark component names a `results` file that exists, when it names one. |
| `libraries-claims`      | Every claim in `libraries.json` has a `source` URL and a `verifiedAgainst` equal to its library's pin. Every fixture's header cites the URL and version in `libraries.json`.                                                                                                                                                                       |
| `readme-comparison`     | Both READMEs' `comparison` and `performance` regions equal what `benchmarks:readme` writes from the committed results.                                                                                                                                                                                                                             |

## 10. Launch timeline in the repository

The marketing plan owns the order of channels by day, from a Tuesday launch. This section
covers what the repository does and when. T is 0.4.0 final day.

### 10.1 Before final

- During the RC, once Task 30 merges: the recipe extension (section 3), the fixtures, the
  matrix, the probes and the sizes, then the timings. `bench-full` runs weekly against the
  newest RC tag.
- T−21 days: the four `/vs-*/` pages and the updated `/comparison/` are content-complete on
  `/next/` (not indexed). The post is written against the newest RC run.
- T−7: pins frozen. The owner opens one issue or Discussion in each of the InversifyJS,
  tsyringe, awilix and needle-di repositories, linking that library's fixtures, its
  `snippets.ts`, the newest results and the "Benchmark setup" issue template, and asking the
  maintainers to review the setup before launch. A correction that arrives before T−1 is
  merged and rerun under section 4.12; later ones follow the same route after launch, with a
  dated `Note` on the post. `launch-claim`, `libraries-claims` and `readme-comparison` pass
  on `main`.
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
  library-variants, the five probes, both bundlers, the emit counts, the five timing
  scenarios, and build times for `meridian-8` and `scale-200`.
- `benchmarks.yml` with all three jobs, and at least one tag run on an RC.
- `/comparison/` updated, the four `/vs-*/` pages and `/benchmark-method/`.
- The post, its charts, its PNG exports and the dev.to export.
- `claim.json`, the four guards, the README hero and both tables, the badges, the keywords and the
  issue template.

After the launch:

- Timings on Bun and Deno, and a browser timing run through Playwright.
- Runtime scenarios (`ready`, `resolve-transient`) on the `scale-200` graph, which 0.4.0
  uses for builds only.
- Async factories as a fifth matrix section, for the libraries that support them.
- A benchmark cell per integration package, once the integrations spec merges.
- Migration guides from tsyringe, TypeDI and InversifyJS, which the marketing plan places
  in its content backlog.
- A local `@nx/plugin` generator that scaffolds a library's fixtures, probes, snippets and
  `libraries.json` entry, when a sixth library is added (section 4.13).
- A dedicated runner or CodSpeed, if the owner wants timings to gate pull requests.
  CodSpeed supports tinybench and Vitest, and it does not support mitata.

## 12. Amendments to the docs spec

- §4.3: inventory #24 changes its title (section 5.1). Pages 35 to 38 are `/vs-inversify/`,
  `/vs-tsyringe/`, `/vs-awilix/` and `/vs-needle-di/`, and page 39 is `/benchmark-method/`,
  all kind `contract`, in the Guides band.
  The blog table gains B5, the launch post.
- §8.2: the roles `chart-focus` and `chart-context` (section 6.4).
- §14.2: the targets `docs:benchmark-data` and the `postbuild` steps `devto-export.mjs` and
  `badges.mjs`.
- §14.3: `doc-regions` adds `benchmarks/fixtures` to its roots; the four checks of section 9.
- §15.3: step 3 copies `benchmarks/results/` from `main`; the path filter adds
  `benchmarks/results/**`.
- §19: the out-of-scope line for benchmarks (#21) is replaced by this spec.
- §7.1: the canonical vocabulary becomes interface-first under the owner's ruling: the
  tokens `REACTOR` (`IReactorCore`, bound to `FusionReactor`), `COMPUTER` (`IShipComputer`,
  bound to `QuantumComputer`), `NAV_CHARTS`, `SUBSPACE_LINK`, `POWER_ROUTER`,
  `SHIELD_GRID`, `FLIGHT_LOG` and `DRONE`, each described by its role name. This spec adds
  `BRIDGE` for Meridian-8 (section 4.2). `FakeReactor` is the test double the override
  examples use. The domain guard's deny list keeps the `I…Service` pattern, which no
  Meridian interface matches.

## 13. Decisions

### 13.1 Decided on 2026-09-23

1. The owner's earlier benchmark code: harvest the interface-token graph, the one-contract
   idea, the phase split, the heap figure and the checked-numbers intent, and supersede the
   Nx plugin on `archive/stash-benchmark` (section 4.13). A generator is revisited when a
   sixth library is added.
2. The post title leads with validation. The spec recommends variant 1 of section 6.1,
   "Catch DI wiring mistakes before your app starts: one graph, five containers, ten
   toolchains", and the owner picks among the three.
3. The competitor maintainers are invited at T−7 (section 10.1).

### 13.2 Open

1. The benchmark tool and the runner. The owner wants to discuss both, and the spec keeps
   its current method until then: mitata 1.0.34 on GitHub-hosted `ubuntu-24.04`, with
   interleaved rounds, medians with MAD and the `noisy` flag. The facts for the discussion:
   mitata's last release was 2025-02-04 and its repository was last pushed 2025-02-17;
   CodSpeed supports tinybench and Vitest and does not support mitata; a hosted image ran on
   two CPU models across ten runs in CodSpeed's report. Recommendation as written: keep
   mitata and the hosted runner for 0.4.0, because the pages compare libraries within one
   run, and revisit if timings should gate pull requests.
2. `@nexusdi/express`. The brief lists it for 0.4, the marketing plan says to skip Express,
   and Express's middleware page accepts no new entries (expressjs/expressjs.com#2375,
   closed June 2026). Recommendation: decide in the integrations spec; this spec lists no
   Express page.
