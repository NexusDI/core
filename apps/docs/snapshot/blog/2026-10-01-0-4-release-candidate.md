---
title: NexusDI 0.4.0-rc.0
authors: [evanion]
tags: [release, release-candidate]
description: The first release candidate of NexusDI 0.4 is on npm under the next dist-tag, with whole-graph validation before startup and a synchronous get() after it.
---

NexusDI gives any TypeScript app NestJS-style modules and async startup. It checks the whole graph before the app runs, and it needs no compiler flags.

The first release candidate of 0.4 is on npm. We count release candidates from zero, so it is `0.4.0-rc.0`. All nine `@nexusdi/*` packages are on the `next` dist-tag. `latest` for `@nexusdi/core` stays on 0.3.2 until 0.4.0 final, so `npm i @nexusdi/core` still installs 0.3.

The RC feedback window is four weeks. Try it on a real project and tell us what you find.

<!--truncate-->

## Try it

```sh
npm i @nexusdi/core@next
```

Add the packages you use with the same tag. Every `@nexusdi/*` package must be at the same version as `@nexusdi/core`.

```sh
npm i @nexusdi/core@next @nexusdi/devtools@next
npm i -D @nexusdi/testing@next @nexusdi/cli@next
```

0.4 needs Node 22.12 or later and TypeScript 5.4 or later. Core is ESM only, and a CommonJS project can `require()` it.

## A first look

```ts
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  status(): string;
}

const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');

class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}

class ShipComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  readonly reactor: IReactorCore;
  constructor(reactor: IReactorCore) {
    this.reactor = reactor;
  }
  status() {
    return `reactor at ${this.reactor.output} GW`;
  }
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: ShipComputer }),
  ],
  exports: [COMPUTER],
});

await using ship = await Nexus.create(Engineering);
ship.get(COMPUTER).status(); // -> 'reactor at 1.21 GW'
```

`ShipComputer` lists its dependencies in `static deps`, and TypeScript checks that list against the constructor. `ShipComputer` depends on the `IReactorCore` interface, so a test can bind a different class to `REACTOR` and leave `ShipComputer` as it is.

## What is new in 0.4

### The whole graph is checked before anything builds

`Nexus.create` compiles the module graph before it runs any constructor. It reports every missing provider, dependency cycle, lifetime mistake and invalid provider at once, in one `BlueprintError`. A singleton that depends on a scoped provider is one of those lifetime mistakes.

With `errors()` from `@nexusdi/errors` registered, each error says what is wrong and how to fix it:

```text
[NEXUS_MISSING_PROVIDER] ShipComputer (module Engineering) depends on NavCharts, but no provider of NavCharts is visible in Engineering.
  NavCharts is provided in Tactical, which does not export it.
  Fix: add NavCharts to Tactical's exports and import Tactical into Engineering.
```

`Nexus.check` runs the same validation and builds nothing, so a CI job can check the graph without starting a service.

### Async startup, synchronous `get()`

`Nexus.create` awaits every async factory and runs `onInit` on each singleton, dependencies first. After it returns, every `get()` is synchronous, and the code that calls `get()` never needs to know which providers were async.

Disposal runs in reverse creation order, and `await using` disposes the container at the end of its block. A singleton with `eager: false` builds on its first `get()`, for a client that a short-lived command may never use.

### No compiler flags

Classes declare their dependencies in `static deps` or `provide()`, and modules come from `defineModule()`. Neither needs a compiler flag or a build plugin. The decorator-free core runs under tsc, TypeScript 7, esbuild, SWC, Babel, Vite, Bun, Deno and Node's type stripping.

Decorators are optional. `@nexusdi/decorators` provides `@Injectable` and `@Module` for classes and modules, and `@Inject` for accessor fields. They are standard (TC39) decorators, so they need a toolchain that compiles standard decorators. Vite on its own and Node's type stripping cannot run them. A project that keeps `experimentalDecorators` for another library uses `static deps` and `provide()`, because the decorators throw `NEXUS_LEGACY_DECORATORS` under that flag.

### Modules with `forRoot`

A module keeps its providers private unless it exports them, as a NestJS module does. The exports of a module marked `global: true` are visible in every module.

A configurable module declares an options token. You pass its options to `forRoot()`, or compute them at startup with `forRootAsync()`, whose factory may be async. A `schema` takes any Standard Schema validator and checks the options when the container builds them.

### Plugins and the extension principle

A plugin is a plain object with a `name` and the `apiVersion` it was written against. You pass plugins to `Nexus.create(root, { plugins })`. Core offers eleven hooks, and every one is optional. With them a plugin can add modules, replace a provider before validation, check the compiled graph, wrap each instance as the container builds it, observe trace events and word error messages.

`@nexusdi/errors`, `@nexusdi/devtools`, `@nexusdi/testing`, `@nexusdi/federation` and `@nexusdi/interceptors` are plugins built on this public API alone. Our packages follow the extension principle: a package integrates with another only through a public contribution point that a third party can use the same way, and core names no other package. Tests in CI check both rules. A plugin you write has the same access ours have.

### The packages

`@nexusdi/core` is the container. Each of these is optional and pinned to core's version:

| Package                 | What it adds                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `@nexusdi/errors`       | Full error messages with the fix and near-miss suggestions                            |
| `@nexusdi/devtools`     | `graph()`, `inspect()`, `trace()`, `toMermaid()` and `toDot()`                        |
| `@nexusdi/cli`          | `nexusdi graph`, which draws the graph from your root module file                     |
| `@nexusdi/interceptors` | Code that runs around service methods, for logging, metrics, validation or caching    |
| `@nexusdi/testing`      | `createTestingContainer()`, which builds the real graph with providers replaced       |
| `@nexusdi/node`         | `nodeScopes()`, which binds a request scope to `AsyncLocalStorage`                    |
| `@nexusdi/decorators`   | The optional standard decorators                                                      |
| `@nexusdi/federation`   | `defineContract()` and `federation()`, for versioned tokens a shell and remotes share |

A package that raises its own error codes publishes their text as a pack at its `./text` entry. `@nexusdi/federation/text` and `@nexusdi/interceptors/text` are the first two. You pass the packs you use to `errors()`, and an app that leaves a pack out sees core's one-line message with a link to the code's page.

```ts
import { errors } from '@nexusdi/errors';
import { federationText } from '@nexusdi/federation/text';

const plugins = [errors({ text: [federationText] })];
```

`nexusdi graph` checks the graph with `Nexus.check`, builds nothing, and writes Mermaid, DOT, JSON, SVG or PNG. It exits with code 1 when the graph is invalid, so a CI step fails on a broken graph. SVG output needs `@viz-js/viz`.

```sh
npx nexusdi graph src/meridian.module.ts#Meridian -o graph.svg
```

## Benchmarks

The repository has a benchmark harness in [`benchmarks/`](https://github.com/NexusDI/core/tree/release/0.4/benchmarks). It builds one eight-provider graph in NexusDI, InversifyJS, tsyringe, awilix and needle-di, each written the way its own documentation shows. It records which toolchains run each fixture, when each library reports a wiring mistake, the bundle size and the timings. These figures come from the run on the rc.0 commit, `8824502`, on Node 24.20.0.

When each library reports a wiring mistake, without decorators:

| Library            | Missing provider | Cycle         | Scoped provider in a singleton | Mistakes reported, of two |
| ------------------ | ---------------- | ------------- | ------------------------------ | ------------------------- |
| NexusDI 0.4.0-rc.0 | at create        | at create     | at create                      | 2                         |
| awilix 13.0.5      | first resolve    | first resolve | first resolve                  | 1                         |
| InversifyJS 8.2.3  | first resolve    | first resolve | does not apply                 | 1                         |
| needle-di 1.2.1    | first resolve    | first resolve | does not apply                 | 1                         |
| tsyringe 4.10.0    | first resolve    | first resolve | never                          | 1                         |

InversifyJS and needle-di document no per-request scope, so the scoped probe does not apply to them.

Without decorators, NexusDI ran under all ten toolchains in the matrix: tsc, TypeScript 7, esbuild, SWC, Babel, Vite, Vite with its Babel plugin, Bun, Deno and Node's type stripping.

Timings, as the median of 1,000 samples on a 4-core GitHub-hosted runner, without decorators. Ready is the time to create a container and resolve every singleton once.

| Library     | Ready  | `get()` of a singleton |
| ----------- | ------ | ---------------------- |
| NexusDI     | 152 µs | 47 ns                  |
| awilix      | 62 µs  | 42 ns                  |
| InversifyJS | 174 µs | 37 ns                  |
| needle-di   | 11 µs  | 34 ns                  |
| tsyringe    | 5.1 µs | 86 ns                  |

`@nexusdi/core` is 18.6 kB minified and gzipped in a two-service app, measured with esbuild and gzip level 9, the method of the size report in CI. It has no runtime dependencies.

The NexusDI maintainer wrote and ran the harness. `benchmarks/libraries.json` pins each library's version and links the documentation each fixture follows. `npx nx run benchmarks:bench` reruns the suite. Absolute times differ by machine.

## What is not ready yet

- The 0.4 documentation at [nexus.js.org/next/](https://nexus.js.org/next/) is not live yet, and the rest of this site documents 0.3. Until the new docs are up, the [package READMEs](https://github.com/NexusDI/core/tree/release/0.4/libs) document 0.4.
- The migration guide from 0.3 and the codemod are not available yet. Both are planned for the RC window, and we will post here when they are out.

  0.4 changes the 0.3 API. `providers` still accepts provider objects in the 0.3 shape, `{ token, ... }`, and other 0.3 code needs changes that the migration guide will list.

## Feedback

- Questions, API feedback and your experience moving from 0.3 go in the [rc.0 feedback discussion](DISCUSSION_URL).
- Bugs go in a GitHub issue, with the [bug report template](https://github.com/NexusDI/core/issues/new?template=01-bug.yml).

## Links

- The GitHub release: [@nexusdi/core@0.4.0-rc.0](https://github.com/NexusDI/core/releases/tag/%40nexusdi/core%400.4.0-rc.0)
- The changelog: [libs/core/CHANGELOG.md](https://github.com/NexusDI/core/blob/release/0.4/libs/core/CHANGELOG.md)
