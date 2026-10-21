# Demo apps for 0.4

Status: decided, 2026-10-21. The owner answered Q1, Q2 and Q5 on 2026-10-21, and the
tech lead settled Q3 and Q4 the same day on the architect's recommendations. Section 16
records each answer. No question is open. The plan is `specs/plans/2026-10-21-demo-apps.md`.

Packages: no published package is added. `@nexusdi/core` gains one error code (section
8), `@nexusdi/testing` and `@nexusdi/interceptors` raise it, and `@nexusdi/federation`
rewrites its README. New private projects under `examples/`: `bridge-console`,
`federation-shell`, `federation-cartography`, `federation-command` and
`federation-contracts`. Removed: `examples/react-ssr` and `examples/react-ssr-e2e`.

Depends on:

- The code on `origin/release/0.4` at `38313a4b` (`0.4.0-rc.1` plus the six adapters in
  `libs/`). Every claim about a package below was checked against `libs/*/src` there.
- `specs/2026-09-23-integrations-design.md` revision 3, whose section 14 maps the adapters
  onto demo apps and whose section 20 holds the owner's answer that this spec's decision 8
  repeats. Integrations plan tasks 18 to 20 (`bridge-api`, `react-ssr`, `next-bridge`)
  are done on `release/0.4`.
- `specs/2026-09-24-react-design.md`, sections 7 (section boundaries) and 9.1 (React
  Router 8 SSR), which the bridge console follows.
- `specs/2026-09-23-docs-site-design.md` on `origin/spec/docs-site`, section 7.1 (the
  Meridian vocabulary), section 7.7 (the deny list) and inventory rows 24, 26, 31a, 32
  and 32b. Section 9 of this spec proposes rows for 7.1. Those rows land on
  `spec/docs-site` in a later change.
- `specs/2026-09-30-extension-principle-design.md` on `origin/spec/package-owned-errors`
  (P1 to P5), against which section 8 checks the core change.
- `specs/2026-10-21-meridian-ship-systems-design.md`, the ship's domain. Its section 11
  lists the four places where these apps adopt its names and module boundaries.

Versions, read with `npm view` on 2026-10-21: `create-react-router` 8.4.0, `react-router`
8.4.0, `@react-router/dev` 8.4.0, `@react-router/node` 8.4.0, `@react-router/serve` 8.4.0, `nx` and every `@nx/*` plugin 23.3.0,
`@module-federation/enhanced` and `@module-federation/runtime` 2.9.2, `@rspack/core` and
`@rspack/cli` 2.2.9, `unplugin-swc` 2.0.0, `create-hono` 0.19.5, `hono`
4.13.13, `@hono/node-server` 2.1.5, `@playwright/test` 1.64.1. React Router 8.5.0 was
published on 2026-10-19, inside the seven days a version must age before the repo takes it,
so every React Router package stays on 8.4.0 (published 2026-09-15). The React Router
packages move together, since `@react-router/dev` checks that `react-router` matches it.

## 1. Problem

The demo apps prove that the packages work in real setups. Each package's own tests
check it in isolation, and three gaps remain on `release/0.4`:

1. No CI job runs an example's `e2e` target. `ci.yml`'s `main` job runs
   `nx run-many -t lint test build typecheck`, and no workflow names `e2e`. The
   `bridge-api` e2e suite (three Node servers against a relay) and the `react-ssr-e2e`
   Playwright suite run only on a developer's machine. Integrations section 14 says
   "every demo app runs in the `main` CI job", and the workflow does not do that.
2. Federation has no app. `libs/federation/src/federation.test.ts` simulates a second
   bundle by calling `defineContract` twice in one bundle with one copy of core. Nothing
   checks a remote built by a real bundler, loaded with `ship.load()`, or a
   `NEXUS_CONTRACT_VERSION` raised in a browser.
3. `@nexusdi/decorators` runs in no app. The toolchain matrix compiles it with five
   toolchains, and no app loads decorated classes from a bundle the container's own
   bundle did not build.

`examples/react-ssr` covers React Router SSR today, and it reaches the bridge API's
module files in-process. It does not call a backend, and its folder name says nothing
about the Meridian.

## 2. Decisions

### 2.1 The owner's decisions

1. Every package is covered by some demo app, frontend and backend where that applies.
   One app per package is not required. (2026-10-12)
2. Federation gets its own app, separate from the simple apps. It uses Nx
   `@nx/react:consumer` and `provider` on rspack, and runs against the workspace
   packages in CI. (2026-10-12; the generators changed from `host` and `remote` on
   2026-10-21, Q1)
3. A Meridian backend on Hono lives in `examples/`. The plan's coverage table puts core,
   node, interceptors, errors, devtools, testing and cli there. (2026-10-12)
4. Decorators are shown in a federation remote. That remote writes its classes with
   `@nexusdi/decorators`, and the demo proves that core reads their metadata from a separate bundle.
   Interface-first: `Token<IFoo>` with `useClass`. (2026-10-21)
5. The non-federated frontend is the Meridian bridge console: a React Router 8
   framework-mode SSR app on `@nexusdi/react`, with request scopes through
   `@nexusdi/react-router`, lazy sections with `SectionBoundary`, vitest tests through
   `@nexusdi/vitest`, and calls to the Hono backend. (2026-10-21)
6. `examples/react-ssr` is removed. The console replaces it, and its links and e2e
   coverage move over. (2026-10-21)
7. A remote that bundles its own `@nexusdi/core` fails with a clear error. Module
   Federation must share core as a singleton. Core detects a foreign token at load and
   raises a `NEXUS_` error that names the shared-singleton fix. (2026-10-21)
8. 0.4.0 final waits until every adapter has sat in an RC with its demo app green.
   (2026-10-15, integrations Q2)

Every app is scaffolded with the official generator, and the scaffold commit is the
generator's output with nothing else. The next commit deletes what the app does not use.

### 2.2 Decisions the architect proposes

| #   | Decision                                                                                                                                                                           | Section |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A1  | `examples/bridge-api` is the Meridian backend of decision 3. Its Express and Fastify entries count for those adapters, and no second backend is built.                             | 5       |
| A2  | The console calls the backend over HTTP through a scoped `BRIDGE_LINK` that forwards the console's mission id, and keeps its own request scope for its own flight log.             | 6.3     |
| A3  | Federation projects are flat folders, `examples/federation-*`, because the workspaces glob is `examples/*` and the folder-name check wants the unscoped package name.              | 7.1     |
| A4  | The shell owns the contracts package. Remotes depend on it and bundle their own copy of it, so `federation()` binds the copies by key in a real browser.                           | 7.3     |
| A5  | Two remotes: `cartography`, a section with plain classes, and `command`, written with decorators. A third build of `cartography` at contract 2.4.0 shows `NEXUS_CONTRACT_VERSION`. | 7.4     |
| A6  | Core raises a new code, `NEXUS_CORE_NOT_SHARED`, for every value another copy of core made, and drops `otherCopy` from three error classes.                                        | 8       |
| A7  | A new `demo-apps` job runs every e2e target tagged `demo`, beside `main`, inside main's wall time.                                                                                 | 10      |
| A8  | `bridge-api` renames its `Audit` module to `AuditTrail`, the name docs §7.1 gives it.                                                                                              | 5.2     |

## 3. The set of apps

| App                               | Package                           | Side               | Generator                                 | State on `release/0.4`  |
| --------------------------------- | --------------------------------- | ------------------ | ----------------------------------------- | ----------------------- |
| `examples/bridge-api`             | `@nexusdi/bridge-api`             | backend            | none (hand-built in integrations task 18) | exists; changes in 5    |
| `examples/bridge-console`         | `@nexusdi/bridge-console`         | frontend, SSR      | `create-react-router` 8.4.0               | new                     |
| `examples/federation-shell`       | `@nexusdi/federation-shell`       | frontend, the host | Nx 23.3.0 consumer/provider               | new                     |
| `examples/federation-cartography` | `@nexusdi/federation-cartography` | frontend, a remote | Nx 23.3.0 consumer/provider               | new                     |
| `examples/federation-command`     | `@nexusdi/federation-command`     | frontend, a remote | Nx 23.3.0 consumer/provider               | new                     |
| `examples/federation-contracts`   | `@nexusdi/federation-contracts`   | library            | `@nx/js:library` 23.3.0                   | new                     |
| `examples/next-bridge`            | `@nexusdi/next-bridge`            | Next gate canary   | unchanged                                 | exists, outside the set |
| `examples/react-ssr`, `-e2e`      | `@nexusdi/react-ssr`, `-e2e`      | frontend, SSR      | removed                                   | removed in task 3       |

`examples/meridian` (the docs regions), `examples/size` (the size report) and
`examples/toolchain-matrix` stay as they are. They are test harnesses, and no row of the
coverage table counts them.

Every app in the set carries the Nx tag `demo` in its `package.json` (`nx.tags`), which
the CI job of section 10 selects by. The four `federation-*` projects also carry
`demo-frontend`, which moves their lint, test and typecheck from `main` to that job
(section 10.1).

## 4. Coverage by package

| Package                 | App                                   | Side     | What runs in CI                                                                                      |
| ----------------------- | ------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `@nexusdi/core`         | every app                             | both     | every e2e target                                                                                     |
| `@nexusdi/node`         | `bridge-api`, `bridge-console` server | backend  | `nodeScopes()` behind `GET /mission`; the console's router adapter gets `scopes: nodeScopes()`       |
| `@nexusdi/hono`         | `bridge-api` Hono entry               | backend  | the e2e cases on Node; the console's e2e calls it; the workerd, Deno, Bun and edge legs (unchanged)  |
| `@nexusdi/express`      | `bridge-api` Express entry            | backend  | the same e2e cases on Node                                                                           |
| `@nexusdi/fastify`      | `bridge-api` Fastify entry            | backend  | the same e2e cases on Node                                                                           |
| `@nexusdi/interceptors` | `bridge-api`                          | backend  | `NavAudit` on `NAV_CHARTS`, asserted through `AUDIT_LOG` in the route tests                          |
| `@nexusdi/errors`       | `bridge-api`, console, shell          | both     | `errors()` in development; the shell registers `errors({ text: [federationText] })` and e2e reads it |
| `@nexusdi/devtools`     | `bridge-api`, shell                   | both     | `devtools()` in development; the shell's e2e reads `graph(ship)` after two `load()` calls            |
| `@nexusdi/testing`      | `bridge-api`, both remotes            | both     | `createTestingContainer` through `nexusFixtures`, and directly in each remote's unit tests           |
| `@nexusdi/vitest`       | `bridge-api`, `bridge-console`        | both     | every route test uses `nexusTest` or `nexusFixtures`                                                 |
| `@nexusdi/cli`          | `bridge-api`                          | backend  | the `graph` target draws `graph.json` and fails on a diff                                            |
| `@nexusdi/react`        | console, shell, both remotes          | frontend | `NexusProvider`, `useService`, `ScopeProvider`, `lazySection` and `SectionBoundary`, in Chromium     |
| `@nexusdi/react-router` | `bridge-console`                      | frontend | `di.middleware`, `di.inject`, `di.load`, `NEXUS_SCOPE` in the server entry, a deferred loader        |
| `@nexusdi/federation`   | the four `federation-*` projects      | frontend | contract copies bound by key across bundles; `NEXUS_CONTRACT_VERSION` in Chromium                    |
| `@nexusdi/decorators`   | `federation-command`                  | frontend | `@Module`, `@Injectable` and `@Inject` classes built by rspack, read by the shell's core             |

`@nexusdi/next` moved to 0.5 (integrations section 10.1), and `examples/next-bridge`
keeps its gate canary outside the set.

Interceptors, `@nexusdi/cli` and the server adapters have no frontend row. They run in
Node only, so decision 1's "where that applies" excludes the frontend.

## 5. The Meridian backend: `examples/bridge-api`

### 5.1 Express and Fastify coverage

Decision 3 asks for a Meridian backend on Hono with seven packages. `bridge-api` already
is that app. Integrations section 14 calls it "the Meridian app (Hono, backend) of the
plan", its README leads with Hono, and it registers every package decision 3 lists.

It also serves Express and Fastify. `src/hono.ts`, `src/express.ts` and `src/fastify.ts`
each export `createBridge(ship, options)` over one module graph, and
`e2e/bridge.e2e.ts` runs the cases of `e2e/cases.ts` against all three Node servers: 50
concurrent scopes, a stream, a client abort, a missing provider and a disposed container.
Those entries count for `@nexusdi/express` and `@nexusdi/fastify` (A1).

Against the pillars and the users:

- A second backend would copy the module graph or import it. A copy breaks the rule that
  each concrete class is bound once (docs §7.3) across the examples a reader browses, and
  an import makes the second app a thin wrapper with nothing new to show.
- A reader who picks a framework finds all three entries side by side in one folder, on
  one graph. That is the comparison a server team asks for, and it keeps the set small.
- The cost: the app's README must say plainly that Hono is the entry the console calls,
  and that Express and Fastify run the same cases.

### 5.2 Changes

1. Tag the project `demo`, so the `demo-apps` job runs its `e2e` target.
2. Rename the `Audit` module to `AuditTrail` (A8). Docs §7.1 names "`IAuditLog` behind
   `AUDIT_LOG`, bound with `useClass: AuditLog` in the `AuditTrail` module", and the app
   uses `Audit`. `graph.json` changes with it. The file moves from `src/ship/audit.ts` to
   `src/ship/audit-trail.module.ts`, the `<name>.module.ts` form the other modules use and
   the ship systems spec keeps.
3. Audit the app against the generator. `bridge-api` was assembled by hand. Task 1 runs
   `npm create hono@0.19.5 <scratch>/meridian-backend -- --template nodejs --pm npm`
   outside the repo, compares its `package.json` scripts, `tsconfig.json`, lint setup and entry
   against `bridge-api`, and adopts each difference that is current idiom. The audit
   writes its findings into the commit message. The tech lead ruled for the audit with no
   re-scaffold (Q4).
4. No route changes. The console uses `GET /course/:to` with `x-mission-id` as it is.

## 6. The bridge console: `examples/bridge-console`

### 6.1 Scaffold

```sh
npx create-react-router@8.4.0 examples/bridge-console --yes --no-install --no-git-init \
  --react-router-version 8.4.0 \
  --template https://github.com/remix-run/react-router-templates/tree/<sha>/default
npx nx g @nx/vitest:configuration --project=@nexusdi/bridge-console \
  --uiFramework=react --testEnvironment=jsdom
npx nx g @nx/playwright:configuration --project=@nexusdi/bridge-console \
  --directory=e2e --webServerCommand="npx react-router-serve ./build/server/index.js" \
  --webServerAddress=http://127.0.0.1:4210
```

`create-react-router` 8.4.0 has no template version of its own. Without `--template` it
downloads `remix-run/react-router-templates/tree/main/default` at the time it runs. The
task takes the last commit on that repository's `main` before 2026-10-19, the day React
Router 8.5.0 was published, and passes it as `<sha>`. That template predates 8.5.0, so it
needs nothing from it, and two runs of the task scaffold the same files, and the scaffold commit
records the hash in its message.

The second commit deletes what the template carries and the app does not use: the
`Dockerfile`, `.dockerignore`, `app/welcome/` and the template README. It sets the
package name and the `demo` tag, pins `react-router`,
`@react-router/node`, `@react-router/serve` and `@react-router/dev` at 8.4.0, and wires the `typegen` target
the way `examples/react-ssr/package.json` does. The `@nx/react/router-plugin` in
`nx.json` infers `build`, `dev`, `start` and `typecheck` from `react-router.config.ts`.

### 6.2 Layout

The layout follows react spec section 9.1.

```text
app/
  bridge/bridge-link.ts      BRIDGE_LINK, IBridgeLink, BridgeApiLink, the BridgeLink module
  bridge/contracts.ts        NAV_CHARTS and WATCH_LOG, typed by `import type` from bridge-api
  bridge/tactical.ts         the console's Tactical: NAV_CHARTS over charts.json (ChartTable)
  bridge/watch.ts            the Watch module: the scoped WATCH_LOG over REQUEST
  bridge/bridge.client.ts    the client graph, BridgeClient (the console's Tactical)
  navigation/navigation.module.ts    the Navigation section, loaded by di.load
  sections/cartography.tsx   the Cartography section and StarMap, a client chunk
  nexus.server.ts            ship = Nexus.create(BridgeConsole); di = nexus(ship, ...)
  ship.client.ts             shipReady = Nexus.create(BridgeClient)
  entry.server.tsx           NexusProvider with the scope from NEXUS_SCOPE
  entry.client.tsx           NexusProvider with shipReady
  routes/home.tsx, sectors.tsx, course.tsx, charts.tsx, layout.tsx
tests/                       route tests on @nexusdi/vitest
e2e/                         Playwright, from the generator
```

### 6.3 The two graphs and the backend

The server graph's root is `BridgeConsole`. It imports the console's own modules and no
runtime code from `bridge-api`: `Tactical`, `Watch` and `BridgeLink.forRoot({ url })` with
the backend's URL from `BRIDGE_API_URL`. The console reaches the backend over HTTP only.
`@nexusdi/bridge-api` is a dev dependency, for `import type` of `INavCharts` and `Course`,
for the e2e server and for the link test, and `vite.config.ts` drops
`ssr.noExternal: ['@nexusdi/bridge-api']`.

- The console's `Tactical` binds `NAV_CHARTS` (`Token<INavCharts>('NavCharts')`, the
  console's own token) with `useClass: ChartTable`, over a copy of `bridge-api`'s
  `charts.json` in `app/bridge/charts.json`. A unit test asserts the two files are equal.
  The shell's `Tactical` is the precedent: each app's `Tactical` provides its own
  `NAV_CHARTS`.
- `Watch` binds `WATCH_LOG` (`Token<IWatchLog>('WatchLog')`) with
  `useClass: WatchLog, lifetime: 'scoped'`. `WatchLog` takes `REQUEST` and prefixes each
  entry with `request.mission.id`, so the console needs no `MISSION` token, and core's
  `REQUEST` needs no import. The console's request function returns the mission and the
  request's `signal`, and `request.d.ts` adds `signal?: AbortSignal` to `NexusRequest`.

```ts
// app/bridge/bridge-link.ts
export interface IBridgeLink {
  course(to: string): Promise<{ course: Course; entries: readonly string[] }>;
}
export const BRIDGE_LINK = new Token<IBridgeLink>('BridgeLink');
export const BRIDGE_LINK_OPTIONS = new Token<{ readonly url: string }>(
  'BridgeLinkOptions',
);

class BridgeApiLink implements IBridgeLink {
  static deps = [REQUEST, BRIDGE_LINK_OPTIONS] as const;
  constructor(
    private readonly request: NexusRequest,
    private readonly options: { readonly url: string },
  ) {}
  async course(to: string) {
    const url = new URL(`course/${encodeURIComponent(to)}`, this.options.url);
    const res = await fetch(url, {
      headers: { 'x-mission-id': this.request.mission.id },
      signal: this.request.signal,
    });
    if (!res.ok)
      throw new Error(`bridge-api answered ${res.status} for ${url.pathname}`);
    return res.json();
  }
}

export const BridgeLink = defineModule({
  name: 'BridgeLink',
  options: BRIDGE_LINK_OPTIONS,
  providers: [
    provide(BRIDGE_LINK, { useClass: BridgeApiLink, lifetime: 'scoped' }),
  ],
  exports: [BRIDGE_LINK],
});
```

`BRIDGE_LINK` is scoped, because it forwards the request's mission and its abort signal:
a reader who leaves the page aborts the backend call.
`REQUEST` is core's, so the module sees it with no import. A console request
opens a scope in the console, and its call opens a second scope in `bridge-api`. The
course page shows both logs: the console's watch entry `survey-9: docked` and the
backend's flight log entry `survey-9: plotting Kepler-442b`. The reader sees two request scopes on
two servers carry one mission id (A2).

The client graph is `BridgeClient` over the console's `Tactical`. `NAV_CHARTS`
is a singleton there, so components read it outside a `ScopeProvider` (react spec 9.1).
The browser never calls the backend. Every backend call goes through a loader on the
console's server, so the backend needs no CORS headers.

### 6.4 Routes

| Route              | What it shows                                                                                                         | From        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------- |
| `/`                | a loader with `di.inject` over `WATCH_LOG`, `REQUEST` and `NAV_CHARTS`; an action; `ScopeProvider` around a plotter   | `react-ssr` |
| `/sectors/:sector` | `di.load(Navigation)` as route middleware, then `navigation.inject`                                                   | `react-ssr` |
| `/course/:to`      | a deferred loader that returns `link.course(to)` unawaited; `<Await>` streams it; the scope closes when the body ends | new         |
| `/charts`          | `SectionBoundary` over `lazySection('cartography', () => import('../sections/cartography'))`, a split chunk           | new         |

`/charts` shows a lazy section in an app with no federation. The server HTML carries the
boundary's `fallback`, and the client loads the chunk after hydration, then
`ship.load(Cartography)` into the client container (react spec 7.1).

### 6.5 Tests

Unit tests run in `test`, which `main` already runs:

- The route tests of `react-ssr/tests/routes/` move over, on `nexusTest` and
  `nexusFixtures`, with `fakeBridgeLink` for `BRIDGE_LINK`.
- One test runs `Nexus.check(BridgeConsole)` and `Nexus.check(BridgeClient)`, so a broken
  graph fails CI before a page loads (react spec 9.1).

The Playwright suite in `e2e/` starts two web servers: `bridge-api`'s
`src/server.hono.ts` on port 4211 and the built console under `react-router-serve` on
port 4210, with `BRIDGE_API_URL=http://127.0.0.1:4211/`. Its cases:

1. A document request with `x-mission-id: survey-9` carries `survey-9: docked`, and the
   plotter's fallback (from `react-ssr-e2e`).
2. Hydration logs no `NEXUS_SCOPE_REQUIRED` and no hydration warning (from
   `react-ssr-e2e`).
3. A client navigation to `/sectors/Kepler-442b` makes a `.data` request (from
   `react-ssr-e2e`).
4. A path no route matches answers 404 (from `react-ssr-e2e`).
5. `/sectors/Kepler-442b` as the first request on a fresh server answers 200 (from
   `react-ssr/e2e/serve.e2e.ts`; the spec starts its own `react-router-serve` process).
6. The client build holds no server container module (from `serve.e2e.ts`).
7. `/course/Kepler-442b` streams the backend's answer, and the page shows the watch entry
   and the flight log entry, both with `survey-9`.
8. `/charts` sends the fallback in the server HTML, and `StarMap` renders after
   hydration with no console error.

### 6.6 Removing `examples/react-ssr`

Task 3 deletes `examples/react-ssr` and `examples/react-ssr-e2e` after the console's e2e
suite passes, and moves each reference:

| File                                     | Change                                                    |
| ---------------------------------------- | --------------------------------------------------------- |
| `.github/workflows/ci.yml`               | the `typegen` step runs `@nexusdi/bridge-console:typegen` |
| `.fallowrc.jsonc`                        | the three `react-ssr` entries name `bridge-console` paths |
| `tsconfig.json`                          | the two references become `./examples/bridge-console`     |
| `README.md`, `CONTRIBUTING.md`           | links and the scope list name `examples/bridge-console`   |
| `SECURITY.md`                            | the out-of-scope line names the demo apps of section 3    |
| `apps/docs/content/react-router-ssr.mdx` | line 13 names `examples/bridge-console`                   |
| `scripts/adapter-peers.mjs`              | the comment on `@react-router/dev ^8` names the console   |

`tools/repo-checks/src/project-folder-name.test.ts` uses `react-ssr` as fixture data
only, and stays. The integrations spec keeps its text, since a spec records what was
decided when.

## 7. The federation app

### 7.1 Projects

The root `package.json` lists `examples/*` as workspaces, and
`tools/repo-checks/src/project-folder-name.test.ts` requires each folder's basename to be
its unscoped package name. A nested `examples/federation/shell` would be no workspace
member and would be named `@nexusdi/shell`. So the projects are flat (A3):

| Folder                            | Package                           | Role                                        | Port |
| --------------------------------- | --------------------------------- | ------------------------------------------- | ---- |
| `examples/federation-shell`       | `@nexusdi/federation-shell`       | the host, its container and its routes      | 4300 |
| `examples/federation-cartography` | `@nexusdi/federation-cartography` | remote, the `Cartography` section           | 4301 |
| `examples/federation-command`     | `@nexusdi/federation-command`     | remote, the decorated `Command` section     | 4302 |
| `examples/federation-contracts`   | `@nexusdi/federation-contracts`   | the `meridian` contract, owned by the shell | none |

Two more builds of `federation-cartography` serve the failure cases: the drift build on
4303 and the unshared build on 4304 (section 7.6).

### 7.2 Scaffold

Decision 2 first named `@nx/react:host` and `remote`. Nx 23.3.0 marks both deprecated:
"Use `@nx/react:consumer` instead (dynamic federation, no static-serve orchestration).
Removed in Nx v24." The owner chose `consumer` and `provider` on rspack (Q1):

```sh
npx nx g @nx/react:consumer examples/federation-shell --bundler=rspack --port=4300 \
  --providerNames=federation-cartography,federation-command
npx nx g @nx/vitest:configuration --project=@nexusdi/federation-shell --uiFramework=react
npx nx g @nx/playwright:configuration --project=@nexusdi/federation-shell --directory=e2e
```

`consumer` generates the providers as siblings. Each of the three projects gets a plain
`rspack.config.ts` with an inline `ModuleFederationPlugin` from
`@module-federation/enhanced/rspack` and `shared: ['react', 'react-dom']`. The generator
writes no `module-federation.config.ts`, no `shared` function and no manifest, and the
shell's `src/mf.ts` hardcodes each remote's `remoteEntry.js` URL. It generates no tests,
so the two configuration generators add vitest to the shell and to each remote, and
Playwright to the shell.

The generator adds root dependencies with caret ranges: `@module-federation/enhanced` and
`@module-federation/runtime` at `^2.4.0`, and the `@rspack/*` packages at `^2.0.3`. The
commit after the scaffold pins each one exactly, at the version the lockfile resolved
(2.9.2 for both `@module-federation/*` packages and 2.2.9 for `@rspack/core` and
`@rspack/cli` on 2026-10-21, each published more than seven days earlier), as the root
pins every other dependency. Task D1 lists every root dependency the generator added.

The contracts library:

```sh
npx nx g @nx/js:library examples/federation-contracts \
  --name=@nexusdi/federation-contracts --bundler=tsc --unitTestRunner=vitest
```

### 7.3 The contract and who owns it

`@nexusdi/federation-contracts` holds one contract:

```ts
// examples/federation-contracts/src/index.ts
import { defineContract } from '@nexusdi/federation';
import { MERIDIAN_CONTRACT_VERSION } from '@nexusdi/federation-contracts/version';
import type { INavCharts } from './nav-charts.js';

export const meridian = defineContract({
  key: 'meridian',
  version: MERIDIAN_CONTRACT_VERSION, // '2.3.0'
});
export const NAV_CHARTS = meridian.token<INavCharts>('NavCharts');
```

`src/index.ts` reads the version through the package's own `./version` subpath. A
bundler alias matches the import's specifier, so the drift build of section 7.6 can map
that subpath to another file, and it could not map a relative `./version` import.

The shell owns it (A4). The shell provides every contract token, so the team that binds
the providers decides what the contract promises and when its version moves. The
remotes depend on the package and never provide its tokens. The README states the
ownership and the version rule that `federation()` applies: a dependent built against a
newer minor than the provider fails (`satisfies` in `libs/federation/src/federation.ts`).

Each remote bundles its own copy of the contracts package. The `shared` object of
section 7.4 has no entry for `@nexusdi/federation-contracts`, so the remote's `NAV_CHARTS`
is a different `Token` object from the shell's, and `federation()`'s `tokenKey` binds the two
by `meridian/NavCharts`. A shared contracts package would hand both bundles one token and
leave `federation()` with nothing to do.

### 7.4 The shell and the remotes

The shell's root is `Meridian`. It imports `Tactical`, and no `Engineering`: the ship
simulation owns the module of that name (ship systems spec S8), and no case here reads
it. `Tactical`
provides the contract's `NAV_CHARTS` and is `global: true`, because a module that
`load()` adds sees only what it imports or what a global module exports, and a remote
cannot import the shell's module object. The shell registers `federation()`,
`errors({ text: [federationText] })` and, in development and in the e2e build,
`devtools()`.

Every project's `rspack.config.ts` passes `shared: meridianShared()` to its
`ModuleFederationPlugin`. `meridianShared` lives in `@nexusdi/federation-contracts` at the
`./shared` subpath, which only the rspack configs import, so the shell and both remotes
build from one object. The `.` entry never reaches it: `src/index.ts` imports nothing
from `src/shared.ts`, so a remote that bundles the contracts package bundles no build
config and no `package.json` read. It shares `react` and `react-dom` as singletons with
`requiredVersion` set to React's version, and `@nexusdi/core` and `@nexusdi/react` as
singletons with `requiredVersion` set to core's exact version, since every `@nexusdi/*`
package peers on it. A remote's components call `useService`, which reads the shell's
`NexusProvider` only when both bundles hold one copy of `@nexusdi/react`.

`@nexusdi/federation`, `@nexusdi/decorators` and `@nexusdi/federation-contracts` have no
entry, so each remote bundles its own copy. A second copy of `@nexusdi/federation` works
because it marks contract tokens with `Symbol.for('nexusdi.contract')`, a registered
symbol every copy reads alike. A second copy of `@nexusdi/decorators` works because it
holds no key of its own: its decorators call the shared core's `declareModuleClass` and
`declareProperty`, and the key they fill, `Symbol.for('nexusdi.injectable')`, belongs to
core (`libs/core/src/definitions/metadata.ts`).

`federation-cartography` exposes `./section`, which exports the module `Cartography`
and the component `StarMap`. `Cartography` binds `NAV_ROUTES` to `SectorRoutes`, whose
`static deps` names the remote's copy of `NAV_CHARTS`. The shell's `/charts` route
renders:

```tsx
const Cartography = lazySection('cartography', () =>
  loadRemote('federation_cartography/section').then((m) => m.Cartography),
);
// <SectionBoundary section={Cartography} fallback={...} errorFallback={SectionFailed}>
//   <StarMap />
// </SectionBoundary>
```

`federation-command` exposes `./section` with the module `Command`, written as an
`@Module` class, and the component `CommandDeck`. `Command` binds `BRIDGE` to `Bridge`
with `provide(BRIDGE, { useClass: Bridge })`, and `Bridge implements IBridge` reads the
contract's `NAV_CHARTS` through `@Inject(NAV_CHARTS) accessor charts: INavCharts`. The
remote's rspack config turns on standard decorators in the builtin swc loader with
`jsc.parser.decorators: true` and `jsc.transform.decoratorVersion: '2023-11'`, the
settings `examples/toolchain-matrix/.swcrc` checks. The shell imports nothing from
`@nexusdi/decorators`. The remote then proves two things, which decision 4 asks for: the
`Symbol.metadata` polyfill reaches the shell's core, and the swc 2023-11 helper writes the
metadata where core reads it. E2E case 3 asserts both at runtime, since `CommandDeck`
shows the course only when the shell's core found the metadata of `Bridge`'s `@Inject`
accessor. A grep of the bundles proves neither: the shell's bundle carries the
`nexusdi.injectable` string through core.

Each remote's unit tests build its module with `createTestingContainer` and a
`useValue` for `NAV_CHARTS`, and run `Nexus.check` on it.

### 7.5 Build and serve in CI

The e2e target depends on the production build of the shell and of every remote build,
each over the built workspace packages (`dependsOn: ['^build']`), the way a consumer
installs them from npm. A static server in `examples/federation-shell/e2e/serve.ts`
serves each build on its port.

The generator's `src/mf.ts` hardcodes the remote URLs, which would take one shell build
per case. Task D4 replaces it with app code. At startup the shell fetches
`/remotes.json`, a list of `{ name, entry }`, and passes it to `registerRemotes` from
`@module-federation/runtime`, the import the generator's `src/mf.ts` already uses, before
the first `loadRemote`. A fetch that fails
renders the shell with every station's `SectionFailed`. Development serves
`public/remotes.json` with the ports of section 7.1, and the e2e server answers the path
from one file per case. No test switch lives in the app code.

### 7.6 The failure cases

The drift build of `federation-cartography` is a second rspack config,
`rspack.config.drift.ts`, that aliases `@nexusdi/federation-contracts/version` to
`drift/version.ts` in the remote's folder, which exports the next minor of
`MERIDIAN_CONTRACT_VERSION`: `'2.4.0'` while the contract is at 2.3.0. The ship systems
spec moves the contract's minor when stations gain contract tokens, and the drift build
follows it with no edit. The remote then
depends on `NAV_CHARTS` at 2.4.0 while the shell provides 2.3.0. `load()` rejects with a
`BlueprintError` that holds `NEXUS_CONTRACT_VERSION`, and the shell's `SectionFailed`
renders `meridian/NavCharts is needed at 2.4.0, and the provider has 2.3.0.` from
`federationText`. This remote, `cartography`, is the one that shows
`NEXUS_CONTRACT_VERSION` in a browser.

The unshared build, `rspack.config.unshared.ts`, passes `meridianShared({ core: false })`,
which drops the `@nexusdi/core` entry and keeps the others. Its `Cartography` module is then a definition of another copy of
core, `load()` rejects with `NEXUS_CORE_NOT_SHARED` (section 8), and `SectionFailed`
renders its text with the shared-singleton fix.

### 7.7 E2E cases

1. The shell renders `/` with no console error.
2. `/charts` loads `cartography`, and `StarMap` shows `Kepler-442b: heading 42` through
   the remote's copy of `NAV_CHARTS`.
3. `/command` loads `command`, and `CommandDeck` shows the course `Bridge` plotted through
   its `@Inject` accessor.
4. After both loads, the devtools panel lists `Cartography` and `Command` among the
   modules of `graph(ship)`.
5. With the drift remote list, `/charts` renders `SectionFailed` with
   `NEXUS_CONTRACT_VERSION` and the text above, and `retry()` fails the same way.
6. With the unshared remote list, `/charts` renders `SectionFailed` with
   `NEXUS_CORE_NOT_SHARED`.

## 8. Core change: `NEXUS_CORE_NOT_SHARED`

### 8.1 What core does today

Core already detects a value another copy made. Every copy writes
`Symbol.for('nexusdi.definition')` on its tokens, providers and modules
(`libs/core/src/definitions/brand.ts`), and `isForeign(value)` is true for a branded value
this copy did not write. Eleven sites set an `otherCopy` field from it on
`InvalidTokenError`, `InvalidModuleError` and `InvalidProviderError`
(`runtime/load.ts`, `root.ts`, `lookup.ts`, `deps.ts`, `blueprint/walk.ts`,
`records.ts`, `definitions/token.ts`, `define-module.ts`), and `@nexusdi/testing` sets it
once more. `coreText` names the fix: "load one copy of @nexusdi/core. In module
federation, list @nexusdi/core in shared with singleton: true."

Two things fail the user. Without `errors()`, core writes the one-line message, and
`lineOf` prints string and number fields only, so a remote with its own core produces
`[NEXUS_INVALID_MODULE] received=an object. https://nexus.js.org/errors/NEXUS_INVALID_MODULE`.
The code names the wrong problem and links the wrong page. And `describeValue` names a
foreign token or module `an object`, with or without the text pack.

### 8.2 Design

Core adds one code and one class:

```ts
interface CoreNotSharedFields {
  /** The value, named: `the Token meridian/NavCharts`, `the module Cartography`. */
  readonly received: string;
  /** Where core met it: `load()`, `get()`, `Shell.providers[0]`, an import path, or null. */
  readonly where: string | null;
}
/** A value another copy of @nexusdi/core made reached this copy. */
export class CoreNotSharedError extends errorBase<
  'NEXUS_CORE_NOT_SHARED',
  CoreNotSharedFields
>('NEXUS_CORE_NOT_SHARED', 'CoreNotSharedError') {}
```

At ten of the eleven sites, core raises `CoreNotSharedError` when `isForeign(value)` is
true, and the error it raised before otherwise. The site in `definitions/token.ts` keeps
`NEXUS_INVALID_TOKEN`: `new Token(description)` with a foreign token as its description
is a wrong argument to a constructor, which that code's page covers. Inside a compile, the error joins the
`BlueprintError`'s list like any other compile error. `otherCopy` leaves the three
classes, because no code path sets it to `true` any more.

`describeValue` names a branded value of any copy by its own fields: a `description`
string gives `the Token <description>`, a `name` string gives `the module <name>`, and a
branded value with neither, which is a provider, gives `a provider`. A `MultiToken` this
copy made gives `the MultiToken <description>`. A foreign `MultiToken` reads
`the Token <description>`, since no field tells it apart from a foreign `Token`. Every
caller of `describeValue` gains the names, `@nexusdi/interceptors` included.

The brand's value changes. Today every copy writes `true`, and `isForeign` asks a
`WeakSet` of the values this copy branded. A Proxy around this copy's own token is not in
the set, and its descriptor read passes through to the brand, so the Proxy reads foreign
and the user would see `NEXUS_CORE_NOT_SHARED` for a token of their own copy. Each copy
now writes its own frozen object, `OWN`, as the value, and `isForeign(value)` becomes
"the value carries an own `DEFINITION_BRAND` property whose value is not `OWN`". The read
through a Proxy returns this copy's `OWN` and reads false. A copy from rc.0 or rc.1 writes
`true`, which is not `OWN`, so it still reads foreign. Nothing else reads the
`WeakSet`, so it goes.

The one-line message with no plugin reads:

```text
[NEXUS_CORE_NOT_SHARED] received=the module Cartography where=load(). https://nexus.js.org/errors/NEXUS_CORE_NOT_SHARED
```

The code says what is wrong and what to share, and the link leads to a page that
reproduces the error and then gives the Module Federation `shared` entry as its fix.
`coreText` gains a builder:

- message: `<received> was made by another copy of @nexusdi/core< (where)>.`
- fix: `load one copy of @nexusdi/core. Check that npm installed it once (npm ls @nexusdi/core), that no test calls vi.resetModules() between the module and the container that reads it, and that no bundler resolves the @nexusdi/source condition for one import and dist for another. In Module Federation, share @nexusdi/core with singleton: true.`

The text names no package but `@nexusdi/core`. It also names `@nexusdi/source`, an export
condition of core's own `exports` map. `tools/repo-checks/src/core-names-no-package.ts`
refuses any string in core's non-test sources that names another package of the scope,
and its test reads core's condition names from `libs/core/package.json` and passes them
to the check as core's own.
The `/errors/NEXUS_CORE_NOT_SHARED/` page carries the `@nexusdi/react` advice: share it as
a singleton beside core, or a remote's `useService` finds no `NexusProvider`.

The three `otherCopy` branches of `coreText` go away.

`@nexusdi/testing`'s `definitionOf` raises `CoreNotSharedError` for a foreign module.
`@nexusdi/interceptors` raises it for a foreign value in `@UseInterceptors`, in
`interceptor()` and in the `interceptors()` options, where it wrote
`from another copy of @nexusdi/core` into its own `NEXUS_INTERCEPTOR_INVALID` text before.
One code then covers every foreign value, and a user searches one page.

### 8.3 Detection limits

A Proxy around this copy's own value reads as this copy's (section 8.2). A Proxy whose
`getOwnPropertyDescriptor` trap throws reads false, as today, so building an error never
throws. The brand arrived in 0.4. A remote that bundles core 0.3 writes no brand, so core reports
its module as `NEXUS_INVALID_MODULE` with no hint of a second copy. The code page says
so. With `strictVersion: true` in the shared entry, Module Federation itself rejects a
mismatched core before any NexusDI code runs, and `SectionBoundary` renders the loader's
rejection. The `/federation/` page recommends `singleton: true` with `requiredVersion`
set to the exact core version, since every `@nexusdi/*` package peers on core's exact
version.

### 8.4 Against P1 to P5

- P1. Core owns the new code and its class, and the brand key it reads. Reading
  `Symbol.for('nexusdi.definition')` is core reading its own key from another copy of
  itself, and no package reads a key it does not own.
- P2. `NexusErrorByCode` stays open to augmentation, and core adds one member to its own
  codes. `errors()` and `explain()` already handle a code they do not know.
- P3. No contribution point changes. Core names no other package, in code or in a
  string: its text names no package but `@nexusdi/core`, which `core-names-no-package.ts`
  checks, and the code page names `@nexusdi/react`. The `@nexusdi/source` condition
  the text names belongs to core's own `exports` map, and the check counts it as core.
- P4. `@nexusdi/testing` and `@nexusdi/interceptors` construct core's exported class and
  call core's exported `isForeign` and `describeValue`. Neither copies the check.
- P5. No optional dependency changes.

`isForeign` stays in the plugin API at version 1, and its type test in
`libs/devtools/src/plugin-api-1.test-d.ts` stands.

### 8.5 Bytes

Measured on a prototype of section 8.2 against `release/0.4` at `38313a4b`, with the size
report's method (esbuild `--bundle --minify --format=esm`, gzip level 9, the
`examples/size/src/core.ts` fixture):

| Variant                             | Core, gzip | Change         |
| ----------------------------------- | ---------- | -------------- |
| `release/0.4` today                 | 19,304 B   | none           |
| the new code with `received` only   | 19,419 B   | +115 B (0.6%)  |
| with `received` and `where`         | 19,468 B   | +164 B (0.85%) |
| with `where` and named values (8.2) | 19,508 B   | +204 B (1.06%) |

The spec takes the last row. A user who meets the error needs the name and the place. The
prototype named values inside the new error's helper. The `OWN` brand value adds a
few bytes and removes the `WeakSet`. Moving the names into
`describeValue` is expected to add a few bytes, and it changes the `received` text of
every error that prints a token or module in the wrong place (`an object` becomes
`the Token ReactorCore`). Task 4 updates the `// ->` claims in `examples/meridian` that
print such a value. The `./text`
entry changes by a few bytes, because the new builder replaces the three branches. Size
budgets are soft, and the size report records the change.

### 8.6 What users see

- An app with one copy of core sees no change.
- A federated app whose remote bundles its own core sees `NEXUS_CORE_NOT_SHARED` with the
  value's name, in place of a `NEXUS_INVALID_*` code that names `an object`.
- A user on rc.0 or rc.1 who reads `error.otherCopy` loses the field. The field arrived in
  the 0.4 RCs, so no 0.3 user reads it. The `NEXUS_INVALID_MODULE`, `NEXUS_INVALID_TOKEN`
  and `NEXUS_INVALID_PROVIDER` pages drop their `otherCopy` bullet and link the new page.
  The owner confirmed this removal (Q2).

### 8.7 Tests

`libs/core/src/definitions/brand.test.ts` holds the cases today with a hand-branded
foreign value. Its `otherCopy: true` cases change to expect `NEXUS_CORE_NOT_SHARED` with
`received` and `where`, except the token-description case, which keeps
`NEXUS_INVALID_TOKEN`, and its two "otherCopy false" cases expect the codes they expect
today. Two cases join them: a Proxy around this copy's own `Token` reads `isForeign`
false and resolves, and a value branded `true` (an rc.1 copy) reads foreign. Every test
that names `otherCopy` changes with the field; the plan's tasks A2, A4 and A5 list each
file. `core-text.test.ts` covers the builder. The error catalogue test, the
`/api-errors/` table and the code page test pick up the new code the way they pick up any
core code. `examples/meridian/src/errors/NEXUS_CORE_NOT_SHARED.md` holds the page's
regions. The federation e2e case 6 shows the error from a real second copy.

## 9. Vocabulary

### 9.1 The conflicts

1. Federation is shown in three domains. `libs/federation/docs/examples.md` is already
   Meridian on `release/0.4`. The README uses `CrewAuth` and the user `'ada'`, which
   names a crew member, and §7.1 names none. Task 6 rewrites the README on the
   `meridian` contract and `NAV_CHARTS`. `federation.test.ts` keeps its `IAuth` cases,
   since §7.4 binds docs, posts, the Academy and the Playground, and a test file is
   none of those.
2. The `NEXUS_CONTRACT_VERSION` regions bind `COMPUTER` in a module `Computers` and make
   `Engineering` global. `Computers` is not in §7.1. The regions move to the demo's
   shape: the shell's `Tactical` is global and provides the contract's `NAV_CHARTS`, and
   the remote section `Cartography` depends on it at 2.4.0. A global module is required
   there, since a loaded remote cannot import the shell's module, and the page says why.
3. `plugins.mdx` described federation as managing "providers across multiple federated
   contracts". On `release/0.4` its plugin table (line 62) reads "Gives one provider for
   every copy of a contract token, across bundles", which matches the code. This conflict
   is closed.
4. §7.1 has no words for shell, remote, section package or contract key. Section 9.2
   adds them.
5. "Ship sections" means modules in the front page notes, and lazily loaded modules in
   the react spec and in core's `load()` wording. The API owns the second meaning:
   `lazySection`, `SectionBoundary` and `SectionConflictError` are public names. The
   tech lead ruled (Q3) that a docs sentence uses "section" for a module loaded after startup only,
   and that the front page draws modules as parts of the ship with the label "module".
6. `bridge-api` names the audit module `Audit`, and §7.1 names it `AuditTrail` (A8).
7. The docs use "the console" for the interactive console of §7.6. The app is always "the
   bridge console", with `bridge`, in prose and in its folder name.

### 9.2 Proposed §7.1 rows

These rows go to `spec/docs-site` in a later change. Until they land there, no docs page
uses them.

| Thing               | The name                                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The shell           | The app that holds the container and loads remotes, `examples/federation-shell`. Its root is `Meridian`, and its container is `ship`.                                       |
| A remote            | A bundle built and served apart from the shell, loaded at runtime: `cartography` and `command`. Each remote is a station of the bridge (ship systems spec §10.2).           |
| A section package   | What a remote exposes at `./section`: a module and its components. `cartography` exposes `Cartography` and `StarMap`; `command` exposes `Command` and `CommandDeck`.        |
| A contract          | `meridian = defineContract({ key: 'meridian', version: '2.3.0' })` in `@nexusdi/federation-contracts`, owned by the shell.                                                  |
| A contract key      | `meridian`. A contract token is described `<key>/<name>`: `NAV_CHARTS = meridian.token<INavCharts>('NavCharts')` is `meridian/NavCharts`.                                   |
| The contract module | The shell's `Tactical`, `global: true`, which provides the contract's tokens to every loaded remote.                                                                        |
| A section           | A module added after startup with `load()`, `di.load()` or `SectionBoundary`. A module present at `Nexus.create` is a module.                                               |
| The bridge console  | The React Router app `examples/bridge-console`. Its server root is `BridgeConsole`, and its client graph is `BridgeClient`.                                                 |
| The bridge link     | `IBridgeLink` behind the scoped `BRIDGE_LINK`, bound with `useClass: BridgeApiLink` in `BridgeLink`, configured by `BridgeLink.forRoot({ url })`. Double: `fakeBridgeLink`. |
| The watch log       | `IWatchLog` behind the scoped `WATCH_LOG`, bound with `useClass: WatchLog` (deps `[REQUEST]`) in the console's `Watch` module. The console's counterpart of `FLIGHT_LOG`.   |
| The chart table     | `ChartTable implements INavCharts`, bound to the console's `NAV_CHARTS` in the console's `Tactical`, over `app/bridge/charts.json`.                                         |
| A decorated section | `Command`, an `@Module` class binding `BRIDGE` (`IBridge`) to `Bridge`, whose `@Inject(NAV_CHARTS) accessor charts` reads the contract token.                               |

`Bridge` and `BRIDGE` exist in §7.1 and on `/decorators/`. `NAV_ROUTES`, `SectorRoutes`,
`StarMap` and `Cartography` exist in §7.1 too. The new nouns are `Watch`, `WATCH_LOG`, `IWatchLog`, `WatchLog`, `ChartTable`, `BridgeConsole`,
`BridgeClient`, `BridgeLink`, `BRIDGE_LINK`, `IBridgeLink`, `BridgeApiLink`,
`BRIDGE_LINK_OPTIONS`, `fakeBridgeLink`, `CommandDeck` and the contract names. None ends in
`Service`, so the §7.7 pattern passes them.

## 10. CI

### 10.1 The `demo-apps` job

A new job in `ci.yml`, parallel to `main`:

```yaml
demo-apps:
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@... # same pin as main
    - uses: actions/setup-node@... # same pin as main
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: npx nx run-many -t lint test typecheck --projects=tag:demo-frontend
    - run: npx nx run-many -t e2e --projects=tag:demo
```

It runs the `e2e` targets of `bridge-api`, `bridge-console` and `federation-shell`.

The four `federation-*` projects also carry the tag `demo-frontend`. `main`'s step becomes
`nx run-many -t lint test build typecheck --exclude=tag:demo-frontend`, and the
`release.yml` verify step, which the gate test holds equal to it, takes the same
`--exclude`. `demo-apps` runs their `lint`, `test` and `typecheck` before the e2e step:
`nx run-many -t lint test typecheck --projects=tag:demo-frontend`. Their `build` runs as
a dependency of `e2e`. `bridge-api` and `bridge-console` stay in `main` and in the release
verify step. The console takes over the `lint`, `test`, `build` and `typecheck` that
`react-ssr` ran there, so the release gate keeps that coverage, and `main` stays near its
10 min 29 s.
`examples/next-bridge` carries no `demo` tag and stays out. The ship systems growth
track adds a second, non-required job, `demo-growth`, for its e2e cases (ship systems
spec section 14). It never blocks, and `demo-apps` takes a growth case after a green RC
cycle. `@nexusdi/react`'s own `e2e`
targets stay in the `adapter-peers` legs that run them today.

The job runs every demo on every run, with the Nx cache, so a push to `release/0.4`
reports the check on the exact commit the release workflow reads. `nx affected` would
skip demos on a push whose parent changed nothing they depend on, and leave that commit
with a green check that tested nothing.

`tools/repo-checks/src/release-verify-gate.test.ts` requires exactly one step running
`nx run-many` per workflow file. It changes to read the step in the `main` job, which is
the gate it compares with `release.yml`. The `demo-apps` job is a second gate that the
release workflow reads as a required check (section 12).

### 10.2 Budget

On the `release/0.4` run of 2026-10-18 (`39083642228`), `main` took 10 min 29 s and every
other job took 4 min 22 s or less. The `demo-apps` job has a budget of 8 minutes, so the
run's wall time stays at `main`'s. The parts, estimated from the jobs that run today:

| Step                                                | Estimate   |
| --------------------------------------------------- | ---------- |
| `npm ci` and the Chromium install                   | 1 min 30 s |
| lint, test and typecheck of the federation projects | 45 s       |
| `^build` of the libs, cold                          | 1 min 30 s |
| `bridge-api` e2e (three servers, vitest)            | 30 s       |
| console build and Playwright (eight cases)          | 1 min 30 s |
| five rspack builds and Playwright (six cases)       | 2 min      |

The estimates sum to 8 min 15 s, so the job may need the matrix from its first run. Task 7 records the measured figure in the job's comment. Over 8 minutes, the job splits
into a console leg and a federation leg in a matrix.

## 11. Docs pages the demos feed

A docs page cites regions of `examples/meridian/src/pages/<slug>.md`, and a region is a
whole program that runs as a test. A demo app needs a bundler or a server, so no region
imports one. A page links the app's folder as the full setup, and a region may import a
plain config file from an app and claim what it returns.

| Page                               | Inventory row | The demo it cites                                | What the page takes from it                                                  |
| ---------------------------------- | ------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `/federation/`                     | 24 (new page) | `federation-shell`, `-cartography`, `-contracts` | the contract, the global contract module, the `shared` entry, the drift case |
| `/errors/NEXUS_CORE_NOT_SHARED/`   | 42 (new code) | `federation-cartography`, the unshared build     | the shared-singleton fix                                                     |
| `/errors/NEXUS_CONTRACT_VERSION/`  | 42            | `federation-cartography`, the drift build        | the regions move to the demo's shape (section 9.1, item 2)                   |
| `/decorators/`                     | 18            | `federation-command`                             | a link: decorated classes built by rspack in a separate bundle               |
| `/bundlers/`                       | 26            | `federation-command`                             | the rspack swc decorator settings                                            |
| `/react-router-ssr/`               | 32            | `bridge-console`                                 | replaces `examples/react-ssr` as the full app                                |
| `/react/`                          | 31a           | `bridge-console`                                 | `SectionBoundary` and `ScopeProvider` in an SSR app                          |
| `/vitest/`                         | 32b           | `bridge-console`, `bridge-api`                   | `nexusTest` route tests in a full app                                        |
| `/hono/`, `/express/`, `/fastify/` | 16a to 16c    | `bridge-api`                                     | one graph behind three frameworks                                            |
| `/graph-cli/`                      | 21            | `bridge-api`                                     | the `graph` target that fails on a diff                                      |

`/federation/` cites `examples/meridian/src/pages/federation.md`. One of its regions
imports `meridianShared` from `@nexusdi/federation-contracts/shared` and claims that its
`@nexusdi/core` entry is a singleton (`// -> true`), so the page shows the config the demo
runs. Row 32's description on `spec/docs-site` names
`examples/react-ssr`, and the vocabulary change of section 9.2 carries its fix. An
Academy mission on federation waits for the Academy, which is parked until after launch.

## 12. Release gate

Decision 8 becomes two checks in the release workflow and the `nexusdi-release` skill:

1. The `demo-apps` check joins the four ruleset checks that `release.yml` requires green on
   the exact commit it releases. That is a ruleset change on GitHub, which the owner makes after three green runs (Q5).
2. The stable promotion checklist in the skill gains one line: each of `@nexusdi/hono`,
   `@nexusdi/express`, `@nexusdi/fastify`, `@nexusdi/react-router`, `@nexusdi/vitest` and
   `@nexusdi/react` was published in at least one RC whose commit had `demo-apps` green.

The core change of section 8 goes into rc.2 with the adapters. It changes no adapter API,
so it restarts no RC count. The rc.2 notes carry one changelog line for it:
"`describeValue` names tokens, multi tokens, modules and providers, which changes the
`received` text of every error that prints one (`an object` becomes `the Token
ReactorCore`), and `otherCopy` leaves `InvalidTokenError`, `InvalidModuleError` and
`InvalidProviderError`; check `isNexusError(error, 'NEXUS_CORE_NOT_SHARED')`."

## 13. Delivery

| Task | What                                                                                                         | Waits on |
| ---- | ------------------------------------------------------------------------------------------------------------ | -------- |
| 1    | `bridge-api`: the `demo` tag, `AuditTrail`, the generator audit (section 5.2)                                | none     |
| 2    | `bridge-console`: scaffold commit, cleanup commit, graphs, routes, tests, e2e (section 6)                    | none     |
| 3    | remove `examples/react-ssr` and move every reference (section 6.6)                                           | task 2   |
| 4    | core: `NEXUS_CORE_NOT_SHARED`, `describeValue` names, testing and interceptors, code page (section 8)        | none     |
| 5    | federation: scaffold, contracts, shell, remotes, the drift and unshared builds, e2e (section 7)              | 4        |
| 6    | docs: the federation README, the `NEXUS_CONTRACT_VERSION` regions, `/federation/` and the links (section 11) | 5        |
| 7    | CI: the `demo-apps` job, the gate test change, the measured budget (section 10)                              | 1, 2     |
| 8    | release: the skill's checklist line; the ruleset change is the owner's (section 12)                          | 7        |

Tasks 1, 2 and 4 run in parallel. Each task ends with an independent review, and the
branch ends with a final review by an opus reviewer.

## 14. Risks

| Risk                                                                                                                                 | What the plan does                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Nx 24 removes `@nx/react:host` and `remote`. An app built on them breaks at the next Nx major migration.                             | The apps use `consumer` and `provider`, which Nx keeps (Q1).                                                         |
| The consumer generator adds `@module-federation/*` and `@rspack/*` with caret ranges, so `npm install` can move them between runs.   | The commit after the scaffold pins each one exactly (section 7.2).                                                   |
| A `shared` entry for the contracts package hands both bundles one token, and `federation()` idles.                                   | `meridianShared()` lists no contracts entry; its test asserts that, and e2e case 5 fails if the copy is shared.      |
| An rspack config that adds the `@nexusdi/source` condition bundles the TypeScript sources, and the demo tests what no user installs. | The builds depend on `^build` and resolve the published `import` condition; task 5 checks the bundle's module paths. |
| `create-react-router` and `create-hono` download templates from GitHub `main`, so two runs of one CLI version differ.                | The scaffold commit records the template's commit hash.                                                              |
| The swc decorator transform in rspack writes `Symbol.metadata` before core's polyfill runs in the remote.                            | `@nexusdi/decorators` lists its polyfill in `sideEffects`; e2e case 3 fails if the metadata is lost.                 |
| `demo-apps` exceeds 8 minutes and lengthens every run.                                                                               | Task 7 measures it and splits the job into a matrix if it runs over.                                                 |
| Removing `otherCopy` breaks an RC tester who reads it.                                                                               | The changelog names the removal and the new code (Q2).                                                               |

## 15. Out of scope

- SSR for the federation shell. The shell is a client app. React spec section 9.3 lists
  a federated remote with its own contracts as an identity break, and SSR adds a server
  copy of every remote, which no 0.4 user has asked for.
- `examples/next-bridge` beyond its gate canary, until `@nexusdi/next` in 0.5.
- An Academy mission built on the demos. The Academy is parked until after launch.
- Unloading a section. Core has no unload in 0.4 (react spec 7.3).

## 16. Owner decision log

| Date       | Decision                                                                                                                                                                                                                                           | Source           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 2026-10-12 | Every package covered by a demo app; federation gets its own app; the apps live in `examples/`                                                                                                                                                     | decisions 1 to 3 |
| 2026-10-15 | 0.4.0 final waits until every adapter sat in an RC with its demo app green                                                                                                                                                                         | integrations Q2  |
| 2026-10-21 | decorators in a federation remote; the bridge console; `react-ssr` removed; the core error                                                                                                                                                         | decisions 4 to 7 |
| 2026-10-21 | every app scaffolded by its official generator                                                                                                                                                                                                     | generator rule   |
| 2026-10-21 | Q1: `@nx/react:consumer` and `provider` on rspack, vitest and Playwright added by their configuration generators; replaces `host` and `remote`                                                                                                     | owner            |
| 2026-10-21 | Q2: add `NEXUS_CORE_NOT_SHARED` and drop `otherCopy` in rc.2; the +204 B gzip is accepted                                                                                                                                                          | owner            |
| 2026-10-21 | Q3: "section" means a module added after startup; the front page labels its parts "modules"                                                                                                                                                        | tech lead        |
| 2026-10-21 | Q4: audit `bridge-api` against the `create-hono` `nodejs` template, with no re-scaffold                                                                                                                                                            | tech lead        |
| 2026-10-21 | Q5: `demo-apps` becomes a required check after three green runs on `release/0.4`; the owner changes the rulesets                                                                                                                                   | owner            |
| 2026-10-21 | Ship systems Q1: growth increments merge green; their unit tests and graph check run in `main` and the release verify step and block an RC; their e2e runs in the non-required `demo-growth` job and moves into `demo-apps` after a green RC cycle | owner            |

The questions as they were put, with their answers:

Q1. Which Nx generators scaffold the federation app?

- What it does: decision 2 names `@nx/react:host` and `remote`. Nx 23.3.0 marks both
  deprecated, "Removed in Nx v24", and names `@nx/react:consumer` and `provider` as the
  replacement. Both pairs generate rspack projects on the same `@module-federation`
  runtime.
- The case: the federation projects of section 7. `host` and `remote` generate a
  Playwright project and `--devRemotes` orchestration. `consumer` and `provider` generate
  neither, and list the remotes in an inline `PROVIDERS` array in `src/mf.ts`.
- Consequence: with `host` and `remote`, the next Nx major migration (this repo moved to
  23.3.0 this month) removes the generators the apps were built from, and the apps then
  carry an idiom Nx no longer maintains. With `consumer` and `provider`, the plan adds
  vitest and Playwright through their configuration generators (section 7.2), and the
  dev setup serves each remote with its own `serve` target. This reverses decision 2,
  which is why it is a question. Nothing published changes.
- Recommendation: `@nx/react:consumer` and `provider` with `--bundler=rspack`.
- Answer (owner, 2026-10-21): yes, with vitest and Playwright through their
  configuration generators.

Q2. Remove `otherCopy` from three error classes?

- What it does: section 8 raises `NEXUS_CORE_NOT_SHARED` for every value another copy of
  core made. The `otherCopy` field on `InvalidTokenError`, `InvalidModuleError` and
  `InvalidProviderError` is then always `false`, and the spec removes it.
- The case: a federated remote that bundles its own core. Today it raises
  `NEXUS_INVALID_MODULE` with `received=an object` and no hint without `errors()`.
- Consequence: core grows by 204 B gzip (19,304 B to 19,508 B, 1.06%). A user who reads
  `error.otherCopy` in rc.0 or rc.1 code loses the field and checks
  `isNexusError(error, 'NEXUS_CORE_NOT_SHARED')`. No 0.3 user is affected. The three code
  pages drop a bullet.
- Recommendation: remove the field and ship the new code in rc.2.
- Answer (owner, 2026-10-21): yes, in rc.2, with the +204 B accepted.

Q3. Which meaning of "section" do the docs keep?

- What it does: the front page notes draw the ship's modules as "ship sections", and the
  API uses "section" for a module loaded after startup (`lazySection`,
  `SectionBoundary`, `SectionConflictError`, the `load()` wording).
- The case: the front page schematic and every page that teaches `load()`.
- Consequence: the API names cannot change without a rename of public exports. If the
  front page keeps "ship sections" for modules, a reader meets one word for two things on
  the first two pages they read. The proposal keeps the front page's drawing and changes
  its label to "module".
- Recommendation: "section" means a module added after startup, everywhere, and the
  front page labels its parts "modules".
- Answer (tech lead, 2026-10-21): accepted.

Q4. Re-scaffold `bridge-api` with `create-hono`?

- What it does: the generator rule says every app comes from its official generator.
  `bridge-api` was assembled by hand in integrations task 18, before the rule.
- The case: the Meridian backend of decision 3, which section 5.1 says `bridge-api`
  already is.
- Consequence: a re-scaffold rebuilds the project's config from `create-hono`'s `nodejs`
  template and moves the sources in. It touches the four adapter-runtimes legs and the
  benchmarks, which read this project's targets, and changes no route. The audit of
  section 5.2 adopts the template's idiom without a rebuild.
- Recommendation: the audit, with no re-scaffold.
- Answer (tech lead, 2026-10-21): accepted.

Q5. Make `demo-apps` a required check?

- What it does: adds the `demo-apps` job to the checks the GitHub ruleset requires on
  `main`, `release/**` and `[0-9]*.x`, and to the checks `release.yml` reads on the
  commit it releases.
- The case: decision 8. Without the ruleset entry, an RC can publish from a commit whose
  demos failed.
- Consequence: a pull request with a failing demo cannot merge, and a release waits for
  the demos. The job adds no wall time while it stays under `main`'s 10.5 minutes.
- Recommendation: yes, once task 7 has run green on `release/0.4` three times.
- Answer (owner, 2026-10-21): yes, after three green runs. The owner changes the
  rulesets.
