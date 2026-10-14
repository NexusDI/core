# NexusDI 0.4 framework integrations and edge runtimes

Status: revision 3, 2026-10-14, with the owner's answers of 2026-10-15 (section 20),
refreshed against `0.4.0-rc.1` (`origin/release/0.4` at
`cef5f39a`). Revision 2 (`1de86ff6` on `spec/integrations`, 2026-09-24) was aligned with
core revision 2 and never implemented. Section 0 lists what revision 3 changed. Section
2.1 keeps the owner's decisions on the first draft, section 2.2 records the decisions the
architect settled in this revision, and section 20 records the owner's answers to the two
questions this revision raised. The plan is `specs/plans/2026-10-15-integrations-0.4.md`.

Packages (all new, all published):

- `@nexusdi/hono`, `@nexusdi/express`, `@nexusdi/fastify`, `@nexusdi/react-router` and
  `@nexusdi/vitest`, as in revision 2.
- `@nexusdi/next`, approved by the owner on 2026-10-15 (Q1), gated on the double-evaluation
  check of section 10.1.

`@nexusdi/react` is released in 0.4 under its own spec (`specs/2026-09-24-react-design.md` on
`spec/react` at `276f2780`, status "decided"). It does not exist in `libs/` on
`release/0.4`. This spec does not design it, and section 14 places it in a demo app.

Depends on:

- The code on `release/0.4` at `cef5f39a`. Every core call this spec makes was checked
  against `libs/core/src` there, and section 3.10 names the file for each. The core spec
  (`specs/2026-09-23-core-0.4-design.md`, revision 2) is cited for intent; where it and the
  code differ, the code wins.
- `specs/2026-09-30-extension-principle-design.md` on `origin/spec/package-owned-errors`
  (P1 to P5, rulings V12 and V13 on this spec).
- `specs/2026-09-23-docs-site-design.md` on `spec/docs-site-amend` at `5a1f0826`, whose
  Guides band this spec amends (section 15).
- `RELEASING.md` and the `nexusdi-release` skill on `release/0.4`, for bootstrap and
  dist-tags (section 12).
- The vault notes "Demo apps" (2026-10-12), "Meridian", "Federation demo" and "ALS shim
  prototype", and the research notes "Feature demand" and "Performance thresholds"
  (2026-10-14).

Measured on 2026-10-14 against the npm registry:

| Package                           | Latest  | Other lines in use          | Node engines of the latest    |
| --------------------------------- | ------- | --------------------------- | ----------------------------- |
| `hono`                            | 4.13.13 | none                        | `>=16.9.0`                    |
| `@hono/node-server`               | 2.1.5   | 1.19.x (`latest-1`)         | `>=20`                        |
| `express`                         | 5.3.0   | 4.22.x (`latest-4`)         | `>=18`                        |
| `fastify`                         | 5.12.7  | 4.29.x (`four`)             | none declared; LTS.md: 20, 22 |
| `fastify-plugin`                  | 6.0.1   | 5.1.0                       | none                          |
| `react-router`                    | 8.4.0   | 7.18.4 (`version-7`)        | `>=22.22.0`                   |
| `vitest`                          | 5.0.4   | 4.1.x (`V4`); repo on 4.1.9 | `^22.12.0 \|\| ^24 \|\| >=26` |
| `next`                            | 16.4.1  | 15.5.28                     | `>=20.9.0`                    |
| `wrangler`                        | 4.151.0 | none                        | `>=22.0.0`                    |
| `@cloudflare/vitest-pool-workers` | 0.23.0  | none                        | peer `vitest ^4.1.0`          |

Prior art: `examples/react-ssr` on `release/0.4`, which still hand-rolls a React Router
context around one 0.4 container and stays on React Router 7.18.4;
`libs/nestjs-correlation-id` in the libraries repo; `hono/context-storage`;
`@fastify/request-context`; `@react-router/express`; `next-safe-action`, whose
`export const action = client.action(fn)` form this spec's `di.action` follows;
`@hono/tsyringe` (874 downloads a week) and `next-di`, the third-party answers the research
found.

## 0. Revision 3

Revision 3 carries revision 2 onto `release/0.4` (the seven spec commits were
cherry-picked, so `git log` keeps their history) and changes the following.

API references checked against rc.1:

1. `Nexus.validate(deps)`, `Nexus.resolve(deps)`, `Scope.resolve(deps)`,
   `Scope.extend()`, `Nexus.load(module)`, `Nexus.createScope({ request })` and
   `[Symbol.asyncDispose]()` exist with the signatures revision 2 used
   (`runtime/nexus.ts:142-196`, `runtime/scope.ts:27-45`). No change to the adapters'
   calls.
2. `DepsMap`, `ResolvedDeps`, `Dep`, `Resolve`, `LookupOptions`, `Scope`, `REQUEST`,
   `NexusRequest` and `isNexusError` are exported from `@nexusdi/core` (`index.ts`). No
   change.
3. `isNexusError(value, code?)` now takes an optional code and narrows to that code's
   class (`errors/is-nexus-error.ts`). Section 3.6 uses that form for the one 503 case.
4. `Nexus.check(root, { plugins, load })` is new: a static compile with no user code
   (`runtime/nexus.ts:70-108`). Section 9.2 uses it for the startup check of an app that
   passes the function form of section 3.1, where `inject` validates on the first request.
5. `Nexus.create` takes a module, a provider array or `{ providers, imports, exports }`
   (`CheckedRoot`). The samples' `Nexus.create(Meridian, ...)` and
   `Nexus.create([...])` both stand.
6. Error fields are own enumerable properties, and `code`, `name` and the brand are own
   non-enumerable ones (`errors/nexus-error.ts:31-60`). Revision 2's core item C1 is
   settled by the code, and `{ code: err.code, ...err }` is the log record.
7. `createScope` builds every eager scoped factory when the scope is created
   (`runtime/scope.ts:180-228`, `blueprint/levels.ts:186-191`). A sync scoped factory
   with `eager: false`, and every scoped class, is built on first `get()`. Async
   factories must stay eager (`NEXUS_LAZY_ASYNC`). Section 9.3 prices that per request.
8. The trace events `scope:create`, `scope:extend` and `scope:dispose` exist with those
   names (`runtime/trace.ts:34-47`), and `trace(fn)` is exported by `@nexusdi/devtools`.
   The tests that count them stand.
9. `@nexusdi/node` exports `nodeScopes()` and the type `NodeScopes`, with `run` and
   `current` over one `AsyncLocalStorage`, and imports only `type { Scope }` from core
   (`libs/node/src/index.ts`). No change to the structural `scopes` option.
10. `createTestingContainer(root)` with `override`, `overrideModule` and
    `create({ onInit })` exists in `@nexusdi/testing` (`libs/testing/src/index.ts`).
    `@nexusdi/vitest` builds on it unchanged.

Owner answers of 2026-10-15: Q1 (`@nexusdi/next` in 0.4, gated) and Q2 (rc.2, Next may
follow in rc.3) are recorded in section 20 and applied in sections 10, 14, 15 and 16.

Rules that arrived after revision 2:

11. P1 (`tools/repo-checks/src/owner-vocabulary.test.ts`) refuses a string literal equal to
    a core code in another package. Its allowlist already names the four server adapters
    for one `NEXUS_DISPOSED` check, so section 3.6 shrinks the status table to that one
    check (ruling V12). `@nexusdi/next` joins the allowlist entry.
12. P4 (`tools/repo-checks/src/no-copies.test.ts`) refuses a copy of another package's
    logic, with a named exception for the adapters' `request-scope.ts` and
    `dispose-with-body.ts` (ruling V13, owner decision 2.1 item 2 kept). Section 3.7 keeps
    the copies and adds their globs to the check's allowlist, which has no adapter entry
    yet.
13. `core-layers.ts` `nodeViolations` already refuses `node:` imports and `process` in
    every package except `@nexusdi/node` and `@nexusdi/cli`. Every adapter falls under it
    with no edit, so revision 2's "extend core's node-only rule to `libs/hono/src`" is
    dropped.

Release machinery that replaced revision 2's section 10:

14. `RELEASING.md` now bootstraps a new package with a `0.0.0-bootstrap.0` placeholder
    and a trusted publisher, and `tools/release/reconcile.mjs` points `latest` at the
    newest RC of every package with no stable version. Revision 2's
    `scripts/publish-released.mjs`, its dist-tag table and its `RELEASING.md` rewrite
    are dropped (section 12).
15. rc.0 and rc.1 were published without the adapters, so revision 2's "all five in rc.0"
    cannot hold. The owner set rc.2 on 2026-10-15 (Q2).

New scope, from the owner's 2026-10-14 decision to put adapters and edge runtimes in 0.4:

16. Section 9 adds edge runtimes: Cloudflare Workers, Vercel Edge, Deno and Bun.
17. `nexus()` takes a container or a function that builds one (section 3.1), so an edge
    isolate builds its container once, on the first request, when its factories need I/O.
18. The Hono adapter hands the dispose promise to `executionCtx.waitUntil` where the
    platform has one (section 4.2).
19. Section 10 proposes `@nexusdi/next` for App Router route handlers and server actions.
20. Section 14 maps every adapter onto the demo apps plan, so each one runs in CI through
    an example.
21. Section 19 lists what this spec needs from core and checks each item against P1 to
    P5.

Corrections to revision 2's design found while refreshing it:

22. Fastify's `{ encapsulate: true }` register option cannot undo the `skip-override`
    that `fastify-plugin` sets when it wraps the function. The package exports
    `di.encapsulatedPlugin` for that case (section 6.1).
23. The paths for a client that left before the middleware ran now end the request:
    Hono returns a response, Fastify calls `done()`, and React Router sets `NEXUS_SCOPE`
    before it returns (sections 4.2, 6.2 and 7.3).
24. The `log` option is typed `NexusLog`, with `error: unknown`, because a disposal error
    or a build rejection need not be a `NexusError` (section 3.1).
25. The status rule lives in `request-scope.ts`, so the adapters copy two files, both
    under P4's named exception (section 3.7).

## 1. Problem

A 0.4 server user writes the same code in every framework. They create a scope per
request, map the framework request into `NexusRequest`, hand the scope to handlers, and
dispose it when the response is done. `/node-request-scopes/` shows the pattern with
`await using` around `scopes.run(shuttle, () => dispatch(req))`.

That pattern disposes the scope when `dispatch` returns. In each of the four server
frameworks, `dispatch` returns before the response is finished, or the framework gives
no reliable signal for the end:

- Hono's `stream()` and `streamSSE()` return the `Response` at once and keep writing, so
  code after `await next()` runs while the stream is open.
- React Router finishes the whole middleware chain inside `handleRequest`, and the server
  adapter writes the body stream afterwards. Deferred `<Await>` data resolves for up to
  `streamTimeout` (4950 ms by default) after `next()` returns.
- Fastify's `onResponse` hook listens to `finish` and `error` on the raw response. A
  client that disconnects mid-response fires neither, and `onRequestAbort` fires only
  when `req.aborted` is set.
- Express has no response hook at all. A client abort emits `close` and never `finish`
  (checked on Node 24.20.0 with an aborted `fetch`).

So the hand-written version disposes scoped instances while a stream still reads them, or
leaks a scope per aborted request. Core adds each open scope to the container's set of
scopes (`runtime/scope.ts:221`), so a leaked scope stays reachable until the container is
disposed. The example app has neither problem only because it has no scope: it keeps one
global container in a React Router context, and `home.tsx` keeps request data in a
module-level `let user`.

Edge runtimes add two problems. A Cloudflare Worker gets 10 ms of CPU per request on the
Free plan, and a container that a handler builds on first use spends that budget: the
probe in section 9.3 measured 5.18 ms for a cold first `Nexus.create` of 55 providers on
a fast laptop. And no NexusDI page says how to scope a request on Workers or Deno Deploy;
awilix's Cloudflare build failure (`jeffijoe/awilix#368`, 56 comments) shows users hit
this wall with other containers.

Tests repeat the same boilerplate. Every test file builds a testing container, overrides
providers, and disposes the container, and a test that forgets `await using` leaks a
container into the next test.

## 2. Decisions

1. One package per framework, each in `libs/<name>`. No shared runtime package
   (section 3.7).
2. Every server adapter has one shape: `nexus(ship, options)` returns an object with the
   framework's hook (`middleware` or `plugin`), `inject`, `scope` and `load`. Next has
   no middleware to hang a scope on, so `@nexusdi/next` returns `route` and `action`,
   which take the deps record `inject` takes, and has no `scope` or `load` (section 10.2).
   The adapter never creates or disposes a container the user passed in.
3. A request gets at most one scope, created with `createScope({ request })` on the first
   `inject` or `di.scope()` call in that request, where `request` comes from a user
   function that maps the framework request to `NexusRequest`. The middleware creates no
   scope (section 3.9).
4. The adapter disposes the scope when the response is finished or the client is gone,
   whichever happens first. It never disposes at the return of `next()` while a body is
   still being written (section 3.4).
5. Handlers receive dependencies through `inject({ name: Dep }, handler)`, a record of
   deps resolved from the request's scope and typed with core's `ResolvedDeps`. The record
   is checked against the container when the route is defined, or on the first request
   when the container is built lazily (section 3.3).
6. The ambient scope is opt-in: the user passes `scopes: nodeScopes()` from
   `@nexusdi/node` (section 3.5). That holds on edge runtimes too (section 9.4).
7. The adapters map only the errors they raise. A `NexusError` from scope creation or
   `inject` is logged once with its code and fields, and becomes the framework's plain
   500, or 503 while the container shuts down. No response body carries a code, a token
   name or a message from core (section 3.6).
8. The Hono, React Router and Next adapters use only web-standard APIs and import no
   `node:` module. Express and Fastify adapters are Node-only.
9. `@nexusdi/vitest` provides `test.extend` fixtures for a testing container and a scope,
   each disposed after its test.
10. Each package is versioned with the release line by `nx release`, published as
    `0.4.0-rc.N` with core, and pins `@nexusdi/core` exactly in `peerDependencies`.
11. Dist-tags follow `RELEASING.md`: the reconcile step points `latest` at the newest RC of
    a package with no stable version (section 12).
12. Each adapter runs in CI through a demo app under `examples/` (section 14).

### 2.1 Decisions the owner made on the first draft

The owner decided these on the first draft (`d9a9a7b`). Each one is specified where the
section reference points. Items 6 and 7 changed status in revision 3, as noted.

1. Core adds `Scope.resolve(deps)` and `Nexus.validate(deps)` (section 3.3). Done in
   rc.0.
2. No shared package. The body wrapper is copied, and a repo-check keeps the copies
   identical (section 3.7). The extension principle kept this as P4's named exception.
3. `@nexusdi/react-router` supports `^7.9.0` with `v8_middleware` and `^8.0.0`, and
   `examples/react-ssr` moves to React Router 8 (sections 7.1 and 14).
4. `@nexusdi/vitest` supports `^4.1.0` and `^5.0.0` (section 8.3).
5. CI runs a leg per supported major of React Router and Vitest (section 13.4).
6. The dist-tag is chosen per package, with no npm token and no manual tag step. The
   release workflow on `release/0.4` meets this with `reconcile.mjs`; the one manual step
   left is the owner's bootstrap of each new package name on npm, which the release spec
   requires for every package (section 12).
7. All five adapters are in rc.0. rc.0 and rc.1 were published without them, so owner question
   Q2 replaces this item: the owner set rc.2 on 2026-10-15.
8. Express stays in scope. The Express middleware list takes no new entries
   (`expressjs/expressjs.com#2375`), so launch material has no Express listing
   (section 17).
9. Adapters create the request scope on first use, and every adapter has `di.load(Module)`
   for lazily loaded sections (section 3.9).
10. The spec follows core revision 2: the ambient scope comes from `nodeScopes()` in
    `@nexusdi/node`; the adapters use public API only (section 3.10); `di.load` calls
    `scope.extend()`; examples use `Nexus.create([...])` or modules, `static deps`,
    `forRoot` and class tokens on first pages; logs carry `err.code` and the fields, and
    development setups register `errors()` for full text; the size report covers each
    adapter (section 13.6).

### 2.2 Decisions settled in revision 3

The architect settled these. None removes or renames public API, none reverses an owner
decision, and none moves a pillar. Each was checked against the pillars and P1 to P5.

D1. `nexus()` takes `Nexus | (() => Promise<Nexus>)`. The function form builds the
container on the first request that needs it, once per process or isolate, and shares the
promise across concurrent first requests. A rejected build is dropped, so the next request
retries, and every request that awaited it gets a 503. `containerOf` wraps the rejection
in the adapter's own `ContainerBuildError`, so the status rule tells a failed build from a
failed `createScope` without reading a code (section 3.6). Reason: an edge isolate whose factories
do I/O cannot build at module scope (section 9.2). Users: an additive overload; the
`Nexus` form is unchanged.

D2. Edge runtimes get no package of their own. `@nexusdi/node` is the
`AsyncLocalStorage` binding on every runtime that exposes `node:async_hooks`: Node, Bun,
Deno, Vercel Edge, and Workers from compatibility date 2026-08-04 or with
`nodejs_compat` on an earlier date. The structural `scopes` option
covers a runtime without it. Reason: a second binding would copy `nodeScopes()` (P4),
and every edge runtime in scope has a real `AsyncLocalStorage` (section 9.4). Users: one
install line on every runtime; on Workers the package name says "node" while the code
runs on workerd, which the edge guide states in its first paragraph.

D3. Edge runtimes do without the ALS shim prototype. The prototype serves the Academy's
browser sandbox, it needs the reader's code, core and node lowered to es2016 because an untransformed
`await` drops the context, and lowering slowed core 2 to 3.5 times. Every edge runtime in
scope provides `AsyncLocalStorage`, so the shim solves a problem these runtimes do not have.

D4. Explicit scope passing stays the default on every runtime: `inject` and the framework
slot (`c.var.nexus`) need no `AsyncLocalStorage`. The ambient scope stays opt-in.

D5. The Hono adapter passes the dispose promise to `c.executionCtx.waitUntil` when the
platform provides an execution context, so a Worker keeps running until scoped disposers
finish. On Node, Bun and Deno, Hono's getter throws and the adapter skips the call
(section 4.2). No option is added.

D6. The demo app for the server adapters is one app, `examples/bridge-api`, with a Hono
entry, an Express entry, a Fastify entry and a Workers entry over one module graph
(section 14). It is the "Meridian app (Hono, backend)" of the demo apps plan.

D7. Edge CI legs run the bridge API's Hono entry on workerd (through
`@cloudflare/vitest-pool-workers`), Deno, Bun and Vercel's `edge-runtime` VM. Netlify Edge
runs on Deno and gets a "not tested, runs on Deno" row in `/runtimes/` (section 9.8).

D8. A repo-check, `edge-safe.test.ts`, refuses `eval(` and `new Function` in the packages
that claim edge support, because Vercel Edge disables both. Core holds neither today
(checked with grep on `cef5f39a`).

D9. `@nexusdi/next` (Q1, approved) disposes through Next's `after()`, which
Next runs after the response finishes and also after an error. It holds no copy of the
body wrapper. If the abort test of section 10.6 fails, it adds the body wrapper as the
third copy of `dispose-with-body.ts`, beside Hono's and React Router's, under P4's
exception.

D10. Revision 2's core items are closed: C1 by the code (section 0 item 6), C2 by
`reconcile.mjs` (section 12), and C3 named stale text in a core spec that is no longer the
reference for rc.1.

D11. `examples/react-ssr` stays in the demo app set, moved to React Router 8,
`@nexusdi/react-router`, `@nexusdi/react` and the Meridian domain (section 14). The demo
apps note left this open and reserved no decision for the owner, and without the app
`@nexusdi/react-router` and `@nexusdi/react` have no demo app. Users: the 0.3-era users
and logger example is rewritten in Meridian names; its 0.3 state stays in git history.

## 3. Shared design

### 3.1 One shape

```ts
import { nexus } from '@nexusdi/<framework>';

const di = nexus(ship, {
  request: (frameworkRequest) => ({ mission: missionFrom(frameworkRequest) }),
  scopes: undefined, // or nodeScopes() from @nexusdi/node, for an ambient scope
  log: (error, context) => console.error(context.phase, error),
});

di.middleware; // or di.plugin for Fastify
di.inject(
  { charts: NAV_CHARTS, log: FLIGHT_LOG },
  ({ charts, log }, ...frameworkArgs) => {},
);
await di.scope(frameworkRequest); // the request's Scope, created on first use
di.load(Feature); // a middleware that loads a module before the section's handlers
```

`ship` is a live `Nexus` or a function that returns `Promise<Nexus>`:

```ts
type ContainerSource = Nexus | (() => Promise<Nexus>);
```

With a `Nexus`, the user creates it with `await Nexus.create(...)` and disposes it after
the server has stopped accepting requests. A container passed in after disposal fails
every request with 503 (section 3.6).

With a function, the adapter calls it on the first request that resolves anything,
keeps the promise for every later request, and drops a rejected promise so the next
request calls the function again. The adapter does not dispose a container it got from
the function either. The Node guides for Hono, Express, Fastify and React Router use the
`Nexus` form. The function form serves edge isolates (section 9.2) and Next, where
`next build` evaluates the module and must not build the container (section 10.3).

The `log` option has one type in every adapter:

```ts
type NexusLog = (
  error: unknown,
  context: {
    phase: 'build' | 'scope' | 'load' | 'validate' | 'dispose';
    status?: 500 | 503;
  },
) => void;
```

`error` is `unknown` because a build rejection and a disposal error (a user disposer's
error, or a `SuppressedError` chain) need not be a `NexusError`. The default writes
`console.error(err.code, { ...err }, err.message)` for a `NexusError` and
`console.error(context.phase, error)` for anything else. A `log` that throws changes neither the response nor
disposal: the adapter writes the original error and the log's error with
`console.error`.

The export is named `nexus` in every package, so the guides read the same across
frameworks. `@nexusdi/vitest` differs because it has no request: it exports
`nexusFixtures` (section 8).

### 3.2 The request mapping

`NexusRequest` is empty until the application augments it. The adapter cannot know its
fields, so the user supplies the mapping:

```ts
type RequestOption<Input> = {} extends NexusRequest
  ? { request?: (input: Input) => NexusRequest | Promise<NexusRequest> }
  : { request: (input: Input) => NexusRequest | Promise<NexusRequest> };
```

When the application's `NexusRequest` has a required field, `request` is required at the
type level. When it has none, the adapter calls `createScope()` with no request, and core
throws `NEXUS_REQUEST_MISSING` only if a provider needs `REQUEST`
(`runtime/scope.ts:342`).

The guides tell users to map to domain values (`mission`, a user id, a locale) and to keep
the framework's context object out of `NexusRequest`. A provider that receives Hono's `c`
or Express's `req` ties the service layer to one framework.

### 3.3 `inject`: typed handler dependencies

```ts
import type { DepsMap, ResolvedDeps } from '@nexusdi/core';

inject<const D extends DepsMap, R>(
  deps: D,
  handler: (deps: ResolvedDeps<D>, ...frameworkArgs: FrameworkArgs) => R,
): FrameworkHandler<R>;
```

`DepsMap` and `ResolvedDeps<D>` are core's types for a record of deps and its resolved
values (`definitions/modifiers.ts`). The adapters import them and define no deps type of
their own. So `optional(T)` yields `T | undefined`, `lazy(T)` yields `() => T` and
`all(M)` yields `T[]`. The handler destructures by name, which avoids the positional
mistakes a tuple invites, and the framework arguments follow unchanged.

A route handler that calls `scope.get(X)` works too, through `di.scope(...)`. The guides
show `inject` first and name `di.scope` as the way out for code that is not a handler.

`inject` does two things:

1. It checks every required and lazy entry against the container and throws when one has
   no visible provider. With a `Nexus`, the check runs when `inject` is called, at route
   definition, so a wrong token fails when the app starts. With the function form, the
   check runs once, after the first build, before the first resolve; a failure there is a
   500 with the log line below, on every request until the process or isolate restarts.
2. Per request, it gets the request's scope, which creates it on the first use in that
   request (section 3.9), resolves the record from it, then calls the handler.

Step 1 is `ship.validate(deps)` and step 2 is `scope.resolve(deps)`:

```ts
interface Scope {
  resolve<const D extends DepsMap | readonly Dep[]>(
    deps: D,
    options?: LookupOptions,
  ): ResolvedDeps<D>;
}

interface Nexus {
  validate(deps: DepsMap | readonly Dep[], options?: LookupOptions): void;
}
```

`validate` throws one `BlueprintError` holding an error per failing entry, and builds
nothing (`runtime/nexus.ts:160-171`). The adapter logs one line per inner error, built
from `err.code` and the error's fields, then rethrows, so the app fails at startup:

```
[@nexusdi/hono] inject: NEXUS_MISSING_PROVIDER entry=deps.charts token=NavCharts module=root
```

Core's own message is one line of the code, the fields as `key=value` pairs and a docs
link. With `errors()` from `@nexusdi/errors` registered, the message holds the full text
and near misses, and the adapter appends it to the line. So every development setup in
this spec's samples registers `errors()`.

### 3.4 Disposal

The middleware registers disposal before the handler runs. At the first of these signals
it closes the request's scope handle, and, if the scope was created, calls its
`[Symbol.asyncDispose]()` exactly once. A scope still being created at that moment is
disposed as soon as `createScope` settles. A request that never used a scope disposes
nothing:

| Framework    | Response done                                    | Client gone                                |
| ------------ | ------------------------------------------------ | ------------------------------------------ |
| Hono         | the wrapped body stream ends, errors or cancels  | `c.req.raw.signal` aborts                  |
| React Router | the wrapped body stream ends, errors or cancels  | `request.signal` aborts                    |
| Express      | `res` emits `close`                              | `res` emits `close`                        |
| Fastify      | `reply.raw` emits `close`                        | `reply.raw` emits `close`                  |
| Next         | Next runs the `after()` callback                 | Next runs the `after()` callback           |
| Any          | a response with no body: at once, after `next()` | the signal fired before the middleware ran |

Node's `http.ServerResponse` emits `close` after `finish` on a normal response and alone
on an abort, so one listener covers both cases for Express and Fastify.

For Hono and React Router the adapter replaces the response with one whose body is a
pass-through `ReadableStream` over the original body. The wrapper's `pull` reads the
original reader; `done`, a read error and the consumer's `cancel` each dispose the scope.
The new response keeps the original status and headers. A `null` body, a `HEAD` request
and a 204 or 304 dispose after `next()` returns.

Core makes scope disposal idempotent (`runtime/scope.ts:58`, `scope.disposal ??=`). The
adapter also wraps the dispose call in a `once`, so its listeners call core one time per
request. A disposal error is passed to `log` and never thrown, because the response has
already been sent and a throw would become an unhandled rejection.

`await using` appears in two places: in `@nexusdi/vitest`'s fixtures, and in the guides'
server entry, where the user writes `await using ship = await Nexus.create(...)` around
the server's lifetime. The request path cannot use it, because the scope outlives the
middleware's frame.

Core requires Node 22.12. Node 22 has `Symbol.asyncDispose` but no `await using` syntax.
The server adapters' sources use `await using` only in tests, and `@nexusdi/vitest`
uses it in its fixtures (section 8.2). The build targets ES2022, so TypeScript lowers
every use in `src`.

Shutdown order: the guides stop the server first (`server.close()`, Fastify's `close()`,
which runs `onClose` after in-flight requests drain), then dispose the container. A
request that arrives after disposal starts gets a 503. An edge isolate has no shutdown
hook, so the edge guide disposes no container (section 9.2).

### 3.5 Ambient scope

Core has no ambient scope. `@nexusdi/node` exports `nodeScopes()`, an object with
`run(scope, fn)` and `current()` over one `AsyncLocalStorage`. It is not a plugin and is
not passed to `Nexus.create`. An adapter takes it as the `scopes` option:

```ts
import { nodeScopes } from '@nexusdi/node';

export const scopes = nodeScopes();
const di = nexus(ship, { request, scopes });

// Deep inside a service call, with no access to the request:
scopes.current()?.get(FLIGHT_LOG);
```

The option's type is structural, `{ run<R>(scope: Scope, fn: () => R): R }`, so
`@nexusdi/hono`, `@nexusdi/react-router` and `@nexusdi/next` import nothing from
`@nexusdi/node` and stay free of `node:` imports. The user brings the package where the
runtime has `AsyncLocalStorage`. Section 9.4 lists the runtimes and the evidence.

With `scopes` set, the adapter runs the rest of the request inside
`scopes.run(scope, ...)`. `run` needs a `Scope` and `current()` is synchronous, so an
ambient request cannot defer creation: the middleware creates the scope itself, and the
first-use rule of section 3.9 does not apply. A `di.load` later in the request extends
that scope (section 3.9).

`scopes` is unset by default. `inject` covers handlers, and the adapter calls
`AsyncLocalStorage.run` only when the user asks for it.

### 3.6 Error mapping

The adapter catches a `NexusError`, recognised with `isNexusError(value)` so an error
from a second copy of core also counts, from `createScope`, `scope.resolve`, `ship.load`,
`scope.extend` or the function form's build. The adapter leaves every other error, and
every `NexusError` a handler throws itself, to the framework's error pipeline.

The mapping follows ruling V12 of the extension principle, plus one case for the function
form of section 3.1:

- A `ContainerBuildError`, which `containerOf` raises around any rejection of the
  function form's build: 503, log level error, and the next request retries the build.
  The container does not exist yet, so the service is unavailable. The adapter tells the
  case apart with `instanceof` on its own class, and reads no core code.
- `isNexusError(error, 'NEXUS_DISPOSED')`: 503, log level warn.
- Any other `NexusError`, a third-party code from a plugin's `construct` hook included:
  500, log level error.

The one string literal is P1's allowlisted check (`owner-vocabulary.test.ts`, entry
`NEXUS_DISPOSED`). Codes an adapter typically sees: `NEXUS_REQUEST_MISSING` and
`NEXUS_PROVIDER_FAILED` from `createScope`, `NEXUS_MISSING_PROVIDER`, `NEXUS_NOT_VISIBLE`
and `NEXUS_LOADED_AFTER_SCOPE` from `resolve`, and `NEXUS_BLUEPRINT_INVALID` from `load`.
The adapter branches on none of them.

The adapter logs the original error once through the `log` option, as `err.code` plus
the error's fields, which are its own enumerable properties, and `err.message`, which is
core's one line or, with `errors()` registered, the full text. The default `log` writes
`console.error(err.code, { ...err }, err.message)`, and Fastify's writes
`req.log.error({ code: err.code, ...err }, err.message)`. Then it raises the framework's
own error type with the status, the status text as its message (`Internal Server Error`,
`Service Unavailable`) and the `NexusError` as `cause`. So the user's error handler can
read `error.cause.code`, and the framework's default handler sends a body that contains
nothing from core. The per-framework error type is in each package's section.

Each adapter's test sends a request that triggers `NEXUS_MISSING_PROVIDER` and asserts
that the body contains neither `NEXUS_` nor the token's description. A second test throws
a third-party `errorBase` code from a plugin's `construct` hook during `createScope` and
asserts a 500 with no `NEXUS_` in the body.

### 3.7 Shared code

The code the adapters would share:

1. Dep resolution, startup validation and scope extension: in core, as `resolve`,
   `validate` and `extend`.
2. The body wrapper of section 3.4: used by Hono and React Router, about 40 lines.
3. The status rule of section 3.6: one `isNexusError` call, about 5 lines.
4. The `RequestOption` type: 4 lines.
5. The lazy scope handle, the `load` memo of section 3.9 and the container source of
   section 3.1: used by every server adapter, about 70 lines.

The owner decided against a shared package (section 2.1 item 2), and the extension
principle kept that as P4's named exception (ruling V13, "`@nexusdi/http`: rejected for
0.4"). So items 2, 3 and 5 live in each adapter at `src/internal/`, in two files only:
`request-scope.ts` holds items 3 and 5 (the status rule, `ContainerBuildError` and the
scope handle), and `dispose-with-body.ts` holds item 2. No third copied file exists, so
P4's exception covers every copy. The copies are byte-identical:

- A repo-check, `tools/repo-checks/src/adapter-shared-copies.test.ts`, fails when two
  copies of one file differ.
- `.fallowrc.jsonc` `duplicates.ignore` gains `libs/*/src/internal/request-scope.ts` and
  `libs/*/src/internal/dispose-with-body.ts`.
- `no-copies.test.ts` `ALLOWLIST` gains the same two globs, with the reason "P4 exception:
  the adapter copies (integrations spec 3.7, ruling V13)".
- No copy carries the comment "keep them in step with libs/", which `no-copies.ts`
  refuses. The copies check is the guard.

`no-copies.test.ts` fails on an allowlisted glob that matches no two packages, and
`owner-vocabulary.test.ts` requires each present package to use its entry. So each glob and
entry is added by the step that adds the package that makes it true (section 16): the `request-scope.ts` glob
with the second server adapter, the `dispose-with-body.ts` glob with the second body
wrapper, and `@nexusdi/next` in the `NEXUS_DISPOSED` entry with `@nexusdi/next`.

With `@nexusdi/next` the counts are five copies of `request-scope.ts` and two of
`dispose-with-body.ts` (D9). A new adapter forces no edit in another adapter. A change to
a shared file changes every copy in one commit, which the copies check enforces. `@nexusdi/http` can be published later with no user-visible change.

### 3.8 The example app

A first page, which for the adapters is each README's "Getting started", uses classes as
tokens, `static deps` and `Nexus.create([...])`:

```ts
// README, Getting started of @nexusdi/hono
import { Nexus, provide, REQUEST, type NexusRequest } from '@nexusdi/core';
import { nexus } from '@nexusdi/hono';
import { Hono } from 'hono';

declare module '@nexusdi/core' {
  interface NexusRequest {
    user: string;
  }
}

class Greeter {
  static deps = [REQUEST] as const;
  constructor(private readonly request: NexusRequest) {}
  greet() {
    return `Hello, ${this.request.user}`;
  }
}

const ship = await Nexus.create([provide(Greeter, { lifetime: 'scoped' })]);
const di = nexus(ship, {
  request: (c) => ({ user: c.req.query('user') ?? 'crew' }),
});

export const app = new Hono().use(di.middleware).get(
  '/',
  di.inject({ greeter: Greeter }, ({ greeter }, c) => c.text(greeter.greet())),
);
```

Every later sample, in this spec, in the READMEs after Getting started and in the guides,
is interface-first. A handler injects a `Token<I>` whose type is an interface. A class
lists its constructor tokens in `static deps`, and a module binds the token with
`provide(TOKEN, { useClass })` or, for async construction, `useFactory`. Configurable
modules are imported through `forRoot` or `forRootAsync`. No handler, test or `inject`
record after Getting started names a concrete class. The samples share one module, the
bridge API, whose names come from the Meridian vocabulary (docs spec §7.1):

```ts
// bridge/contracts.ts
import { Token } from '@nexusdi/core';

export interface INavCharts {
  plot(to: string): Course;
}
export const NAV_CHARTS = new Token<INavCharts>('NavCharts');

export interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
export const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
```

```ts
// tactical.module.ts, the NAV_CHARTS provider
provide(NAV_CHARTS, {
  useFactory: async (link) => StarCharts.download(link),
  deps: [SUBSPACE_LINK],
}),
```

```ts
// bridge/shuttle-flight-log.ts
export class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}
```

```ts
// bridge/bridge-api.module.ts
import { defineModule, provide } from '@nexusdi/core';
import { FLIGHT_LOG } from './contracts';
import { ShuttleFlightLog } from './shuttle-flight-log';

export const BridgeApi = defineModule({
  name: 'BridgeApi',
  imports: [Tactical], // for MISSION
  providers: [
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [FLIGHT_LOG],
});

export const Meridian = defineModule({
  name: 'Meridian',
  imports: [Tactical, BridgeApi],
});
```

`NAV_CHARTS` stays the async factory, typed by its interface:
`StarCharts.download(link)` resolves to a `StarCharts`, which implements `INavCharts`.
`ShuttleFlightLog implements IFlightLog`. Both classes are imported only by the module
that binds them. `FLIGHT_LOG` is scoped, so each request gets its own log, built from
that request's `MISSION`. `Tactical` imports `Comms.forRoot({ frequency: 1420 })`.

`StarCharts.download(link)` does I/O when the container is built. That is the case
section 9.2 handles on Workers, where I/O at module scope fails.

Each server adapter's sample exports `createBridge(ship: ContainerSource)`, which builds
the app from a container. The server entry passes the production container, and a test
passes a testing container with overrides. The test doubles implement the same
interfaces:

```ts
// test/doubles.ts
import type { IFlightLog, INavCharts } from '../bridge/contracts';

export const fakeCharts: INavCharts = {
  plot: (to) => ({ to, heading: 42 }),
};

export class MemoryFlightLog implements IFlightLog {
  readonly #entries: string[] = [];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}
```

```ts
// test/fixtures.ts
import { nexusFixtures } from '@nexusdi/vitest';
import { test as base } from 'vitest';
import { FLIGHT_LOG, NAV_CHARTS } from '../bridge/contracts';
import { Meridian } from '../bridge/bridge-api.module';
import { fakeCharts, MemoryFlightLog } from './doubles';

export const test = base.extend(
  nexusFixtures(Meridian, {
    setup: (builder) =>
      builder
        .override(NAV_CHARTS, { useValue: fakeCharts })
        .override(FLIGHT_LOG, { useClass: MemoryFlightLog }),
  }),
);
```

`nexusFixtures` builds the container with `createTestingContainer` from
`@nexusdi/testing` (section 8). `override(FLIGHT_LOG, ...)` keeps the provider's `scoped`
lifetime, so the fake log is still one per request. Each adapter section ends with a
route test built on these fixtures. Section 15.2 adds these names to the docs spec's
vocabulary.

The same code is the demo app `examples/bridge-api` (section 14). The docs cite regions of
`examples/meridian/src/pages/<slug>.md`, the convention every docs page on `release/0.4`
uses, and the demo app imports the same module files.

### 3.9 Lazy request scopes and `di.load`

Core pins a scope to the blueprint that was current when the scope was created. A token
from a module loaded after that throws `NEXUS_LOADED_AFTER_SCOPE` until
`await scope.extend()` re-pins the scope (`runtime/scope.ts:230-328`). React Router 8
runs the root middleware before a lazy route's middleware. If the root middleware created
the scope and the lazy route's middleware then called `ship.load(Navigation)`, the first
request into that section would fail, and every later request would pass. Hono, Express
and Fastify have the same order problem for any middleware registered after
`di.middleware` that loads a module.

The adapters use two rules. Without an ambient scope, the middleware creates no scope, so
most requests into a lazy section never need an `extend()`. And `di.load` extends the
request's scope whenever one already exists, which covers the ambient case and a handler
that used the scope before the section's `di.load` ran.

The middleware records the request, attaches a scope handle and registers disposal
(section 3.4):

```ts
// src/internal/request-scope.ts, copied into each server adapter
export type ContainerSource = Nexus | (() => Promise<Nexus>);

export interface RequestScope {
  /** Creates the scope on the first call; every later call returns the same promise. */
  scope(): Promise<Scope>;
  /** True once scope() has been called. */
  readonly started: boolean;
}

/** One container per source: the Nexus itself, or the memoised build of the function. */
export function containerOf(source: ContainerSource): () => Promise<Nexus> {
  if (typeof source !== 'function') return () => Promise.resolve(source);
  let pending: Promise<Nexus> | undefined;
  return () => {
    // Promise.resolve().then() turns a synchronous throw into a rejection.
    pending ??= Promise.resolve()
      .then(source)
      .catch((error: unknown) => {
        pending = undefined; // the next request builds again
        throw new ContainerBuildError({ cause: error }); // 503, section 3.6
      });
    return pending;
  };
}

export function requestScope(
  container: () => Promise<Nexus>,
  request: () => NexusRequest | undefined | Promise<NexusRequest | undefined>,
): RequestScope & { close(): Promise<void> } {
  let pending: Promise<Scope> | undefined;
  let closed = false;
  return {
    get started() {
      return pending !== undefined;
    },
    scope() {
      if (closed) return Promise.reject(requestFinished());
      pending ??= container().then(async (ship) =>
        ship.createScope({ request: await request() }),
      );
      return pending;
    },
    async close() {
      closed = true;
      if (!pending) return;
      const scope = await pending.catch(() => undefined); // a failed create built nothing
      await scope?.[Symbol.asyncDispose]();
    },
  };
}
```

- The first `inject`, or the first `await di.scope(...)`, calls `createScope`. Two
  handlers or loaders that start together in one request, such as parallel React Router
  loaders, share one promise and one scope.
- `close` runs from the disposal signals of section 3.4. It disposes the scope only if one
  was started, and waits for a scope still being created.
- After `close`, `scope()` rejects with an adapter error, "the request has finished",
  which the adapter logs. So a late first use after a client abort cannot create a scope
  nobody disposes.
- The user's `request` mapping also runs at first use, so a request that resolves nothing
  never calls it.

The framework slot holds the handle: `c.var.nexus`, `req.nexus` and `NEXUS_SCOPE` are
`RequestScope`, and `di.scope(...)` returns `Promise<Scope>`.

`di.load(Module)` returns a middleware for the framework that:

1. calls `await ship.load(Module)`. Core makes `load` idempotent and runs concurrent calls
   one at a time (`runtime/nexus.ts:173-180`). The adapter keeps one promise per module
   in a `WeakMap` after a successful load, so later requests skip the call; a failed load
   is not kept, and the next request tries again;
2. when the request's handle has started, calls `await (await handle.scope()).extend()`.
   `extend()` returns at once when nothing was loaded since the scope's pin, and builds
   the scoped factories the new module contributes otherwise;
3. continues.

A lazily loaded section registers `di.load(Feature)` in front of its handlers, and the
first `inject` in the request runs after it, so the scope sees `Feature`:

```ts
// app/routes/navigation.tsx, a lazy React Router route
import { Navigation } from '../navigation/navigation.module';
import { di } from '../nexus.server';

const navigation = di.load(Navigation);
export const middleware: Route.MiddlewareFunction[] = [navigation];
export const loader = navigation.inject(
  { routes: NAV_ROUTES },
  ({ routes }, { params }: Route.LoaderArgs) => routes.find(params.sector),
);
```

The middleware returned by `di.load` also has an `inject`. `di.inject` validates its deps
when the route module is evaluated, and a lazy route's module is evaluated before its
module is loaded, so `NAV_ROUTES` would fail that check. `navigation.inject` runs
`ship.validate(deps)` once, after the first successful load, and caches the result. A
failure there is a 500 with the log line of section 3.3, on the first request into the
section.

With `scopes` set, the middleware creates the scope at once (section 3.5), and step 2
extends it, so the first request into a lazy section works in both modes. `extend()` keeps
`scope.id` and every built instance, so the `AsyncLocalStorage` store that `scopes.run`
set still holds the right scope.

Each adapter's integration test adds these cases:

- a lazy section whose first request succeeds: `di.load(Feature)` after `di.middleware`,
  and a handler that injects a `Feature` token. This is the regression test for the
  stale-scope case;
- a request that resolves nothing creates no scope and never calls the `request`
  mapping, asserted through a `trace(fn)` plugin from `@nexusdi/devtools` (no
  `scope:create`);
- two handlers or loaders that make their first use at the same time in one request share
  one scope (one `scope:create`, one `scope:dispose`);
- disposal still runs on a client abort and at stream end, with the scope created late in
  the handler;
- with `scopes: nodeScopes()`, a lazy section's first request succeeds: the observer
  sees one `scope:create`, one `scope:extend` naming `Feature`, and `scopes.current()`
  returns the same scope before and after the extend;
- with the function form, ten concurrent first requests call the function once, and a
  function that rejects once, or throws synchronously, answers 503 and is called again
  by the next request.

### 3.10 The adapters against core's public API

The adapters use core's public API and nothing else. Each need, checked against rc.1:

| Adapter need                                   | Core API used (file on `cef5f39a`)                                    | Plugin hook                                           |
| ---------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| a scope per request, created on first use      | `ship.createScope({ request })` (`runtime/nexus.ts:186`)              | none                                                  |
| handler deps checked when the route is defined | `ship.validate(deps)` (`runtime/nexus.ts:165`)                        | none                                                  |
| handler deps per request                       | `scope.resolve(deps)` (`runtime/scope.ts:37`)                         | none                                                  |
| lazily loaded sections                         | `ship.load(Module)`, `scope.extend()` (`nexus.ts:178`, `scope.ts:42`) | none                                                  |
| disposal when the response is done             | `scope[Symbol.asyncDispose]()` (`runtime/scope.ts:44`)                | none                                                  |
| status mapping                                 | `isNexusError(value, code?)` (`errors/is-nexus-error.ts`)             | none                                                  |
| structured log line                            | `err.code` and the own enumerable fields (`errors/nexus-error.ts`)    | none                                                  |
| full error text in development                 | the user registers `errors()` or `devtools()`                         | `formatError`, owned by `@nexusdi/errors`             |
| ambient scope                                  | `nodeScopes()` from `@nexusdi/node`                                   | none; not a plugin                                    |
| a static startup check on edge                 | `Nexus.check(root, { load })` (`runtime/nexus.ts:70`)                 | none                                                  |
| tests observe scopes                           | `trace(fn)` from `@nexusdi/devtools`                                  | `observe`, owned by core, used by `@nexusdi/devtools` |
| `@nexusdi/vitest` builds a testing container   | `createTestingContainer` from `@nexusdi/testing`                      | `compile.*` and `onInit`, used by `@nexusdi/testing`  |

No adapter registers a plugin or implements a hook. An adapter wraps a container the user
created, and every need above is a call on that container or its scopes. Section 19 lists
what the adapters and the edge work need beyond this table, which is no core API.

## 4. `@nexusdi/hono`

### 4.1 API

```ts
// bridge/hono.ts
import { nexus, type ContainerSource } from '@nexusdi/hono';
import { Hono } from 'hono';
import { FLIGHT_LOG, NAV_CHARTS } from './contracts';

export function createBridge(ship: ContainerSource) {
  const di = nexus(ship, {
    request: (c) => ({
      mission: {
        id: c.req.header('x-mission-id') ?? 'survey-7',
        target: 'Kepler-442b',
      },
    }),
  });

  return new Hono().use(di.middleware).get(
    '/course/:to',
    di.inject({ charts: NAV_CHARTS, log: FLIGHT_LOG }, ({ charts, log }, c) => {
      log.record(`plotting ${c.req.param('to')}`);
      return c.json(charts.plot(c.req.param('to')));
    }),
  );
}
```

```ts
// server.ts, Node
import { Nexus } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { serve } from '@hono/node-server';
import { once } from 'node:events';

const dev = process.env.NODE_ENV !== 'production';

await using ship = await Nexus.create(Meridian, {
  plugins: dev ? [errors()] : [], // full error text in development logs
});
const server = serve(createBridge(ship));
process.once('SIGTERM', () => server.close());
await once(server, 'close'); // the container is disposed after the server stops
```

The final `await once(server, 'close')` keeps the module's `await using` block open for
the server's lifetime. Without it, the top-level block would end, and dispose the
container, as soon as `serve` returns. The Workers, Deno and Bun entries are in section
9.2.

Exports:

- `nexus(ship, options): NexusHono`, where `ship` is a `ContainerSource` and
  `NexusHono` is
  `{ middleware: MiddlewareHandler<NexusEnv>; inject; scope(c: Context): Promise<Scope>; load(module): MiddlewareHandler & { inject } }`.
- `type NexusEnv = { Variables: { nexus: RequestScope } }`.
- `type RequestScope` and `type ContainerSource` (section 3.9).
- `type NexusHonoOptions`: `request`, `scopes`, `log`.

The middleware sets `c.var.nexus`. Hono merges the middleware's `Env` into a chained app
(`new Hono().use(di.middleware).get(...)`), so `c.var.nexus` is typed downstream. A
separate `app.use(di.middleware)` statement does not retype `app`; the guide shows the
chained form and `new Hono<NexusEnv>()` for apps that register routes in separate
statements. The package does not augment `ContextVariableMap`: Hono's docs warn that a
global augmentation types `c.get` in routes where the middleware never ran.

`inject` returns a `Handler` whose context is `Context<NexusEnv>`. `di.scope(c)` rejects
with `[@nexusdi/hono] no scope on this request: register di.middleware before this route`
when the middleware has not run.

### 4.2 Request flow

```ts
createMiddleware<NexusEnv>(async (c, next) => {
  const handle = requestScope(container, () => options.request?.(c)); // section 3.9
  const dispose = once(() => keepAlive(c, handle.close().catch(log)));
  if (c.req.raw.signal.aborted) {
    await dispose(); // the client left before the middleware ran: no scope, no handler
    return new Response(null, { status: 499 }); // nobody reads it; Hono needs a response
  }
  c.req.raw.signal.addEventListener('abort', dispose, { once: true });
  c.set('nexus', handle);
  if (options.scopes) {
    const scope = await mapErrors(handle.scope()); // section 3.6
    await options.scopes.run(scope, next);
  } else {
    await next(); // inject creates the scope on first use
  }
  c.res = disposeWithBody(c.res, dispose, c.req.method);
});

/** Hands the disposal to the platform's waitUntil where one exists (D5). */
function keepAlive(c: Context, done: Promise<void>): Promise<void> {
  let ctx: { waitUntil(promise: Promise<unknown>): void } | undefined;
  try {
    ctx = c.executionCtx; // throws on Node, Bun and Deno: no execution context
  } catch {
    ctx = undefined;
  }
  ctx?.waitUntil(done);
  return done;
}
```

`container` is `containerOf(ship)` from section 3.9, created once in `nexus()`.

`di.load(Feature)` is a `MiddlewareHandler` that runs the steps of section 3.9: the
memoised `ship.load(Feature)`, `extend()` when the request's scope has started, then
`next()`. A Hono sub-app for a section registers it first:
`new Hono().use(di.load(Navigation)).get(...)`.

Hono's `next()` never throws. An error in a handler goes to `app.onError`, which sets
`c.res` before `next()` resolves, so the wrapper also covers error responses.
`@hono/node-server` aborts `c.req.raw.signal` when the socket closes before the response
finishes. On Workers, `request.signal` aborts on a client disconnect only with the
`enable_request_signal` compatibility flag; section 9.7 covers the case without it.

A WebSocket upgrade (`upgradeWebSocket`) returns a 101 with no body, so the scope is
disposed when the upgrade completes. The guide states that a WebSocket handler must not
hold scoped instances.

### 4.3 Errors

The adapter throws `new HTTPException(status, { message: statusText, cause })` from
`hono/http-exception`. Hono's default `onError` sends `err.getResponse()`, a text body
with the status text. `log` defaults to `console.error(err.code, { ...err }, err.message)`
(section 3.6).

### 4.4 Runtimes

The package imports `hono` and `@nexusdi/core` only, with no `node:` module, which
`core-layers.ts` `nodeViolations` already enforces. Supported: Node 22.12 and later
through `@hono/node-server`, Bun, Deno, Cloudflare Workers and Vercel Edge. Section 9
gives the entry for each and the CI leg that tests it.

### 4.5 Peers

```json
"peerDependencies": { "@nexusdi/core": "0.4.0-rc.N", "hono": "^4.0.0" }
```

`createMiddleware`, `c.var`, `c.executionCtx` and `HTTPException` exist from 4.0. The
`adapter-peers` job (section 13.4) runs the integration test against `hono@4.0.0` and
proves the floor.

### 4.6 Tests

- Unit, through `app.request()`: scope per request, `c.var.nexus`, `inject` resolution of
  each modifier, the startup check, the error rule of section 3.6, `di.scope` without the
  middleware, and `keepAlive` with a fake execution context.
- Type tests (`*.test-d.ts`): `inject`'s record types, `c.var.nexus` after chaining,
  `request` required when `NexusRequest` has a required field.
- Integration (`src/hono.e2e.test.ts`), a real `@hono/node-server` on port 0, with a
  `trace(fn)` plugin from `@nexusdi/devtools` that records `scope:create`,
  `scope:extend` and `scope:dispose`, and the cases of section 3.9:
  - a JSON response disposes the scope after the body is sent;
  - a `streamSSE` response keeps the scope open until the stream closes, asserted with a
    scoped `FLIGHT_LOG` that the stream reads after `next()` returned;
  - a client abort mid-stream disposes the scope;
  - a handler that throws disposes the scope and returns 500;
  - 50 concurrent requests produce 50 `scope:create` and 50 `scope:dispose` events and
    no shared scoped instance;
  - `scopes: nodeScopes()` makes `scopes.current()` return the request's scope inside a
    service call.
- The edge legs of section 9.8 run the demo app's suite on workerd, Deno, Bun and the
  `edge-runtime` VM.

### 4.7 A route test with overrides

The README and the guide show a route test on the fixtures of section 3.8. The test
reaches the route through `app.request()`, so it opens no port:

```ts
// bridge/hono.test.ts
import { expect } from 'vitest';
import { test } from '../test/fixtures';
import { createBridge } from './hono';

test('plots the course with the fake charts', async ({ nexus }) => {
  const res = await createBridge(nexus).request('/course/Kepler-442b');
  expect(await res.json()).toEqual({ to: 'Kepler-442b', heading: 42 });
});
```

## 5. `@nexusdi/express`

### 5.1 API

```ts
// bridge/express.ts
import { nexus, type ContainerSource } from '@nexusdi/express';
import express from 'express';
import { FLIGHT_LOG, NAV_CHARTS } from './contracts';

export function createBridge(ship: ContainerSource) {
  const di = nexus(ship, {
    request: (req) => ({
      mission: {
        id: req.get('x-mission-id') ?? 'survey-7',
        target: 'Kepler-442b',
      },
    }),
  });

  const bridge = express();
  bridge.use(di.middleware);
  bridge.get(
    '/course/:to',
    di.inject(
      { charts: NAV_CHARTS, log: FLIGHT_LOG },
      ({ charts, log }, req, res) => {
        log.record(`plotting ${req.params.to}`);
        res.json(charts.plot(req.params.to));
      },
    ),
  );
  return bridge;
}
```

```ts
// server.ts
import { Nexus } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { once } from 'node:events';

const dev = process.env.NODE_ENV !== 'production';

await using ship = await Nexus.create(Meridian, {
  plugins: dev ? [errors()] : [],
});
const server = createBridge(ship).listen(3000);
process.once('SIGTERM', () => server.close());
await once(server, 'close');
```

The route test on the fixtures of section 3.8 listens on port 0, because Express has no
in-process request API:

```ts
// bridge/express.test.ts
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { expect } from 'vitest';
import { test } from '../test/fixtures';
import { createBridge } from './express';

test('plots the course with the fake charts', async ({ nexus }) => {
  const server = createBridge(nexus).listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/course/Kepler-442b`);
    expect(await res.json()).toEqual({ to: 'Kepler-442b', heading: 42 });
  } finally {
    server.close();
  }
});
```

Exports: `nexus(ship, options): NexusExpress`
(`{ middleware: RequestHandler; inject; scope(req: Request): Promise<Scope>; load(module): RequestHandler & { inject } }`),
`RequestScope`, `ContainerSource`, `NexusHttpError` and `NexusExpressOptions`. A section
router registers `di.load(Feature)` first: `router.use(di.load(Navigation))`.

`req.nexus` is typed through the global augmentation that `@types/express` supports:

```ts
declare global {
  namespace Express {
    interface Request {
      nexus?: RequestScope;
    }
  }
}
```

The field is optional because Express applies the augmentation to every route, the ones
before the middleware included. `inject` and `di.scope(req)` read it and throw the same
"register di.middleware" error as Hono when it is missing.

### 5.2 Request flow

```ts
async (req, res, next) => {
  const handle = requestScope(container, () => options.request?.(req)); // section 3.9
  const dispose = once(() => handle.close().catch(log));
  if (res.closed) return void (await dispose());
  res.once('close', dispose);
  req.nexus = handle;
  if (!options.scopes) return next(); // inject creates the scope on first use
  const scope = await mapErrors(handle.scope()); // a rejection goes to next(err)
  options.scopes.run(scope, next);
};
```

Express 5 forwards a rejected middleware promise to `next(err)`. `inject` returns an
async handler, so a rejection there, the first `createScope` included, reaches the error
pipeline too. `res.closed` covers a client that left before the middleware ran. Express
calls downstream handlers synchronously from `next`, so `scopes.run(scope, next)` gives
them the scope through `AsyncLocalStorage`.

### 5.3 Errors

The adapter passes a `NexusHttpError` to `next`: an `Error` with `status` and
`statusCode` set to 500 or 503, `expose: false`, the status text as message and the
`NexusError` as `cause`. Express's final handler sends the status text in production. In
development it sends `err.stack`, which is the wrapper's stack and holds no core message.
`log` defaults to `console.error(err.code, { ...err }, err.message)` (section 3.6).

### 5.4 Runtime

Node 22.12 and later. The package imports types from `express` and runs no Node-specific
code, but Express itself targets Node, and only Node is tested.

### 5.5 Peers

```json
"peerDependencies": {
  "@nexusdi/core": "0.4.0-rc.N",
  "express": "^5.0.0",
  "@types/express": "^5.0.0"
},
"peerDependenciesMeta": { "@types/express": { "optional": true } }
```

Express 4 is out: it does not forward async rejections, and a middleware written for both
would need two code paths. `@types/express` is an optional peer, because the package's
declarations import from it and a JavaScript user needs none.

### 5.6 Tests

- Unit with an in-process server on port 0 and `fetch`: as for Hono, plus `req.nexus`
  typing in type tests.
- Integration (`src/express.e2e.test.ts`): a JSON response, a `res.write` stream with a
  delayed `end`, a client abort mid-stream, a throwing async handler, 50 concurrent
  requests counted through a `trace(fn)` plugin, `scopes: nodeScopes()`, the cases of
  section 3.9, and the no-leak body check.

## 6. `@nexusdi/fastify`

### 6.1 API

```ts
// bridge/fastify.ts
import { nexus, type ContainerSource } from '@nexusdi/fastify';
import Fastify from 'fastify';
import { FLIGHT_LOG, NAV_CHARTS } from './contracts';

export async function createBridge(ship: ContainerSource) {
  const di = nexus(ship, {
    request: (req) => ({
      mission: {
        id: String(req.headers['x-mission-id'] ?? 'survey-7'),
        target: 'Kepler-442b',
      },
    }),
  });

  const bridge = Fastify({ logger: true });
  await bridge.register(di.plugin);
  bridge.get<{ Params: { to: string } }>(
    '/course/:to',
    di.inject(
      { charts: NAV_CHARTS, log: FLIGHT_LOG },
      ({ charts, log }, req) => {
        log.record(`plotting ${req.params.to}`);
        return charts.plot(req.params.to);
      },
    ),
  );
  return bridge;
}
```

```ts
// server.ts
import { Nexus } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

const dev = process.env.NODE_ENV !== 'production';

const ship = await Nexus.create(Meridian, { plugins: dev ? [errors()] : [] });
const bridge = await createBridge(ship);
bridge.addHook('onClose', () => ship[Symbol.asyncDispose]());
await bridge.listen({ port: 3000 });
process.once('SIGTERM', () => bridge.close());
```

The server entry disposes the container in `onClose`, which Fastify runs after in-flight
requests drain. The route test on the fixtures of section 3.8 uses `inject()`, so it
opens no port, and the `nexus` fixture disposes the testing container:

```ts
// bridge/fastify.test.ts
import { expect } from 'vitest';
import { test } from '../test/fixtures';
import { createBridge } from './fastify';

test('plots the course with the fake charts', async ({ nexus }) => {
  const bridge = await createBridge(nexus);
  const res = await bridge.inject({ url: '/course/Kepler-442b' });
  expect(res.json()).toEqual({ to: 'Kepler-442b', heading: 42 });
  await bridge.close();
});
```

Exports: `nexus(ship, options): NexusFastify`
(`{ plugin: FastifyPluginAsync; encapsulatedPlugin: FastifyPluginAsync; inject; scope(req: FastifyRequest): Promise<Scope>; load(module): onRequestHookHandler & { inject } }`),
`RequestScope`, `ContainerSource`, `NexusHttpError` and `NexusFastifyOptions`. A section
plugin adds `di.load(Feature)` as its own `onRequest` hook, which runs after the
app-level hook of `di.plugin`: `section.addHook('onRequest', di.load(Navigation))`.

The plugin is wrapped with `fastify-plugin` (`name: '@nexusdi/fastify'`,
`fastify: '5.x'`), which sets `skip-override`, so the hook and the decoration apply to
the whole app. A user who wants the scope only inside one encapsulated context registers
`di.encapsulatedPlugin` there: the same plugin function without the `fastify-plugin`
wrapper. `skip-override` is set when `fastify-plugin` wraps the function, so a
register-time option could not undo it, and the package exports both forms.

```ts
declare module 'fastify' {
  interface FastifyRequest {
    nexus: RequestScope | null;
  }
}
```

Fastify 5 rejects a reference-type `decorateRequest` value, so the plugin decorates with
`null` and assigns per request, as Fastify's docs recommend.

### 6.2 Request flow

The plugin registers a callback-style `onRequest` hook. With `scopes` set, the callback
style is what lets `scopes.run(scope, done)` carry the scope through the rest of the
lifecycle, the pattern `@fastify/request-context` uses:

```ts
fastify.addHook('onRequest', (req, reply, done) => {
  const handle = requestScope(container, () => options.request?.(req)); // section 3.9
  const dispose = once(() => handle.close().catch((e) => req.log.error(e)));
  if (reply.raw.closed) {
    void dispose(); // nothing was created; Fastify still needs done() to end the lifecycle
    return done();
  }
  reply.raw.once('close', dispose);
  req.nexus = handle;
  if (!options.scopes) return done(); // inject creates the scope on first use
  mapErrors(handle.scope()).then(
    (scope) => options.scopes.run(scope, () => done()),
    done,
  );
});
```

The plugin does not use `onResponse` or `onRequestAbort` (section 1). It registers no
`onClose`: the container belongs to the user, and the guide registers
`ship[Symbol.asyncDispose]()` as an app-level `onClose`, which Fastify runs after
in-flight requests drain.

### 6.3 Errors

The adapter calls `done(error)` with a `NexusHttpError`: `statusCode` 500 or 503, the
status text as message, no `code` property, and the `NexusError` as `cause`. Fastify's
default handler serializes `code` when present, which is why the wrapper has none. `log`
defaults to `req.log.error({ code: err.code, ...err }, err.message)` (or `req.log.warn`
for 503), so the log line carries Fastify's request id and core's fields as structured
keys.

### 6.4 Runtime

Node 22.12 and later.

### 6.5 Peers and dependencies

```json
"peerDependencies": { "@nexusdi/core": "0.4.0-rc.N", "fastify": "^5.0.0" },
"dependencies": { "fastify-plugin": "^6.0.0" }
```

`fastify-plugin` is a regular dependency, as in every `@fastify/*` plugin. Its v6 notes
list no Fastify floor; the `adapter-peers` job runs against `fastify@5.0.0` with
`fastify-plugin@6.0.0` and settles it.

### 6.6 Tests

- Unit through `fastify.inject()`: the scope per request, `inject`, the error rule, and
  `di.encapsulatedPlugin`.
- Integration (`src/fastify.e2e.test.ts`), `listen({ port: 0 })`: a JSON response, a
  `reply.send(stream)` response, a client abort mid-stream (the case `onResponse`
  misses), a throwing handler, 50 concurrent requests counted through a `trace(fn)`
  plugin, `scopes: nodeScopes()`, the cases of section 3.9, `close()` after in-flight
  requests with the container disposed in `onClose`, and the no-leak body check including
  the absence of a `code` field.

## 7. `@nexusdi/react-router`

### 7.1 Target

The package supports React Router 7.9 and later with `future.v8_middleware: true`, and
React Router 8, where middleware is always on. The middleware API is the same in both
(`createContext`, `RouterContextProvider`, the `middleware` route export). 7.x is still
maintained on npm's `version-7` tag.

`examples/react-ssr` runs 7.18.4 with `v8_middleware` on `release/0.4`. This spec moves
the example to 8.x and to this adapter (section 14).

### 7.2 API

```ts
// app/nexus.server.ts
import { Nexus } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { nexus } from '@nexusdi/react-router';
import { Meridian } from './ship/meridian';

const ship = await Nexus.create(Meridian, {
  plugins: import.meta.env.DEV ? [errors()] : [],
});
import.meta.hot?.dispose(() => ship[Symbol.asyncDispose]());

export const di = nexus(ship, {
  request: ({ request }) => ({
    mission: {
      id: request.headers.get('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
  }),
});
```

```ts
// app/root.tsx
import { di } from './nexus.server';
export const middleware: Route.MiddlewareFunction[] = [di.middleware];
```

```ts
// app/routes/course.tsx
import { FLIGHT_LOG, NAV_CHARTS } from '../bridge/contracts';
import { di } from '../nexus.server';

export const loader = di.inject(
  { charts: NAV_CHARTS, log: FLIGHT_LOG },
  ({ charts, log }, { params }: Route.LoaderArgs) => {
    log.record(`plotting ${params.to}`);
    return { course: charts.plot(params.to) };
  },
);
```

A loader test on the fixtures of section 3.8 passes the `nexusScope` fixture through
`NEXUS_SCOPE`, so the loader reads the fakes from a scope of the testing container:

```ts
// app/routes/course.test.ts
import { existingScope, NEXUS_SCOPE } from '@nexusdi/react-router';
import type { Nexus } from '@nexusdi/core';
import { RouterContextProvider } from 'react-router';
import { afterAll, expect, vi } from 'vitest';
import { test } from '../../test/fixtures';
import { FLIGHT_LOG } from '../bridge/contracts';
import { loader } from './course';

// nexus.server.ts builds the production container at import. The loader only needs a
// `di` for the startup check, so the test swaps in one built on a testing container,
// with the fixtures' overrides, so the charts factory does no network I/O. vi.mock is
// hoisted above the imports, so the factory imports what it needs itself.
const built = vi.hoisted((): Nexus[] => []);
vi.mock('../nexus.server', async () => {
  const { nexus } = await import('@nexusdi/react-router');
  const { createTestingContainer } = await import('@nexusdi/testing');
  const { FLIGHT_LOG, NAV_CHARTS } = await import('../bridge/contracts');
  const { Meridian } = await import('../bridge/bridge-api.module');
  const { fakeCharts, MemoryFlightLog } = await import('../../test/doubles');
  const ship = await createTestingContainer(Meridian)
    .override(NAV_CHARTS, { useValue: fakeCharts })
    .override(FLIGHT_LOG, { useClass: MemoryFlightLog })
    .create({ onInit: false });
  built.push(ship);
  return { di: nexus(ship) };
});
afterAll(() => Promise.all(built.map((ship) => ship[Symbol.asyncDispose]())));

test.override({
  nexusRequest: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
});

test('plots the course with the fake charts', async ({ nexusScope }) => {
  const context = new RouterContextProvider(
    new Map([[NEXUS_SCOPE, existingScope(nexusScope)]]),
  );
  const data = await loader({
    params: { to: 'Kepler-442b' },
    context,
    request: new Request('http://bridge/course/Kepler-442b'),
  } as Route.LoaderArgs);
  expect(data.course).toEqual({ to: 'Kepler-442b', heading: 42 });
  expect(nexusScope.get(FLIGHT_LOG).entries()).toEqual([
    'plotting Kepler-442b',
  ]);
});
```

The loader resolves from the scope in `context`, which comes from the fixture's
container with the fakes. `existingScope(scope)` wraps a scope the test already owns in a
`RequestScope` whose `scope()` returns it, and which disposes nothing. The mocked `di`
only runs `validate` when the route module loads.

Exports:

- `nexus(ship, options): NexusRouter`, with
  `{ middleware: MiddlewareFunction<Response>; inject; scope(context): Promise<Scope>; load(module): MiddlewareFunction<Response> & { inject } }`.
- `NEXUS_SCOPE`, the `RouterContext<RequestScope>` the middleware sets. Route tests use
  it with `createRoutesStub` and
  `new RouterContextProvider(new Map([[NEXUS_SCOPE, existingScope(scope)]]))`.
- `existingScope(scope): RequestScope`, for tests.
- `RequestScope`, `ContainerSource` and `NexusRouterOptions`.

A lazy route registers `di.load(Feature)` in its own `middleware` export and writes its
loaders with the returned middleware's `inject`, as in section 3.9. Its first request
works because the root middleware created no scope, and the loaders' first `inject` runs
after the route's `di.load`. With `scopes` set, the root middleware created the scope,
and the route's `di.load` extends it. A route that is not lazy, and whose module is part
of the root module, needs neither.

`inject` accepts any args object with a `context: Readonly<RouterContextProvider>`, so it
wraps loaders, actions and other middleware, typed by the route's generated `Route`
types. Components get data through `useLoaderData` and never see the server container,
because components also run in the browser. `@nexusdi/react` gives components their own
client container (react spec §9.1).

React Router's Vite plugin removes the server-only route exports (`loader`, `action`,
`middleware`) and the `.server` modules they import from the client build, so the server
container stays out of the browser bundle. The integration test asserts that the client
build contains no module from `nexus.server.ts`.

`import.meta.hot?.dispose` disposes the old container when Vite re-evaluates the module
in development. Without it, each edit leaks a container.

### 7.3 Request flow

```ts
async ({ request, context, params }, next) => {
  const handle = requestScope(container, () =>
    options.request?.({ request, params }),
  );
  const dispose = once(() => handle.close().catch(log));
  context.set(NEXUS_SCOPE, handle); // set before any return, so loaders always find it
  if (request.signal.aborted) {
    await dispose(); // the client left: close the handle, so a late inject rejects
    return next();
  }
  request.signal.addEventListener('abort', dispose, { once: true });
  const response = options.scopes
    ? await options.scopes.run(await mapErrors(handle.scope()), next) // throws a Response
    : await next(); // loaders create the scope on first use
  return disposeWithBody(response, dispose, request.method);
};
```

Parallel loaders of one navigation start together, and their first `inject` calls share
the handle's one `createScope` promise (section 3.9).

`next()` never throws; loader errors become an error-boundary response, which the body
wrapper also covers. A server middleware may return a new `Response`, and the adapter
returns the wrapped one. Document requests, `.data` requests and resource routes all pass
through the root middleware. `@react-router/express` and `react-router-serve` abort
`request.signal` on `res` close when `finish` has not fired; `@react-router/node`'s
`createRequestListener` does the same.

### 7.4 Errors

The adapter throws a `Response` with status 500 or 503 and the status text as body.
React Router renders the nearest error boundary with that status. The `NexusError` goes to
`log` only. A thrown `Response` has no `cause`, so the guide shows `handleError` in
`entry.server.tsx` for users who want one log pipeline, and the adapter's `log` defaults
to `console.error(err.code, { ...err }, err.message)` (section 3.6).

### 7.5 Runtimes

The package uses web APIs only and imports no `node:` module. Tested on Node through
`@react-router/node` and `react-router-serve`. React Router's adapters for Workers, Deno
and Bun take the same middleware; `/runtimes/` lists them as not tested, because the edge
legs of section 9.8 cover Hono only.

### 7.6 Peers

```json
"peerDependencies": { "@nexusdi/core": "0.4.0-rc.N", "react-router": "^7.9.0 || ^8.0.0" },
"engines": { "node": ">=22.12" }
```

React Router 8 itself requires Node 22.22, which npm reports from its own manifest.

### 7.7 Tests

- Unit: the middleware and `inject` called with a hand-built `RouterContextProvider` and
  a `next` that returns a streaming `Response`.
- Type tests: `inject` over `Route.LoaderArgs`-shaped args.
- Integration (`src/react-router.e2e.test.ts`): a fixture app under `src/__fixtures__/app`
  built once with `react-router build` and served by `react-router-serve` on port 0. A
  route with a deferred `<Await>` value that reads the scoped `FLIGHT_LOG` after a delay
  asserts the scope stays open until the stream ends. It also covers an aborted document
  request, a loader that throws, `.data` requests, 50 concurrent requests counted through
  a `trace(fn)` plugin, the cases of section 3.9 with a lazy route, and the client-bundle
  check of section 7.2.
- The fixture app's `react-router.config.ts` sets `future.v8_middleware: true` when the
  installed React Router is 7.x, and nothing on 8.x. The `adapter-peers` job runs the
  integration test on each supported line (section 13.4).

## 8. `@nexusdi/vitest`

### 8.1 API

`test/fixtures.ts` in section 3.8 is the whole setup: `nexusFixtures(Meridian, { setup })`
passed to `test.extend`, with `NAV_CHARTS` and `FLIGHT_LOG` overridden. Tests then read
interface tokens from the fixtures, and a suite swaps an override with `test.override`:

```ts
// bridge/flight-log.test.ts
import { describe, expect } from 'vitest';
import { MemoryFlightLog } from '../test/doubles';
import { test } from '../test/fixtures';
import { FLIGHT_LOG, NAV_CHARTS, type INavCharts } from './contracts';
import { createBridge } from './hono';

const survey = { mission: { id: 'survey-7', target: 'Kepler-442b' } };

describe('on a survey mission', () => {
  test.override({ nexusRequest: survey });

  test('gives each scope its own flight log', async ({ nexus, nexusScope }) => {
    nexusScope.get(FLIGHT_LOG).record('launch');
    await using other = await nexus.createScope({ request: survey });
    expect(other.get(FLIGHT_LOG).entries()).toEqual([]);
  });
});

describe('when the charts cannot plot', () => {
  const unplottable: INavCharts = {
    plot: () => {
      throw new Error('sector not charted');
    },
  };
  test.override({
    nexusSetup: [
      (builder) =>
        builder
          .override(NAV_CHARTS, { useValue: unplottable })
          .override(FLIGHT_LOG, { useClass: MemoryFlightLog }),
    ],
  });

  test('answers 500 for an uncharted sector', async ({ nexus }) => {
    const res = await createBridge(nexus).request('/course/Kepler-442b');
    expect(res.status).toBe(500);
  });
});
```

A `nexusSetup` override replaces the file's `setup` for that suite, so it repeats the
overrides it still wants. `createBridge` is the Hono app of section 4.1.

Fixtures, all test-scoped and lazy:

| Fixture        | Type                                                                                              | Default                   |
| -------------- | ------------------------------------------------------------------------------------------------- | ------------------------- |
| `nexusSetup`   | `readonly NexusSetupStep[]`, each `(builder: TestingContainerBuilder) => TestingContainerBuilder` | `[options.setup]` or `[]` |
| `nexusRequest` | `NexusRequest \| undefined`                                                                       | `undefined`               |
| `nexus`        | `Nexus`, from `createTestingContainer(root)` of `@nexusdi/testing`, through `nexusSetup`          | built on first use        |
| `nexusScope`   | `Scope`, from `nexus.createScope({ request: nexusRequest })`                                      | built on first use        |

`nexusSetup` is an array of builder steps, because Vitest runs any function value in a
fixture map as a fixture factory. `@nexusdi/vitest` also names `@vitest/runner` as a peer
(`^4.1.0 || ^5.0.0`), because its declarations import the `Fixtures` type that `vitest`
does not export.

Every fixture name starts with `nexus`, so none collides with a user's `request` or
`container` fixture. `test.override` (Vitest 4.1 and later) replaces `nexusSetup` or
`nexusRequest` for a suite, which is how one file tests several override sets.

### 8.2 Disposal

```ts
nexus: async ({ nexusSetup }, use) => {
  const builder = nexusSetup.reduce((b, step) => step(b), createTestingContainer(root));
  await using ship = await builder.create(options.create);
  await use(ship);
},
nexusScope: async ({ nexus, nexusRequest }, use) => {
  await using scope = await nexus.createScope({ request: nexusRequest });
  await use(scope);
},
```

Vitest runs the code after `use()` as teardown when the test finishes, pass or fail, and
tears down `nexusScope` before `nexus`, because `nexusScope` depends on it. A disposal
error, core's `SuppressedError` chain included, fails the test that owned the container.

The container is test-scoped. A file-scoped container would share singletons, and the
state they hold, across tests. The option `containerScope: 'file'` exists for suites
whose `onInit` is slow; with it, `nexusSetup` is file-scoped too, because Vitest lets a
file fixture depend only on file and worker fixtures.

`options.create` is `@nexusdi/testing`'s `TestingCreateOptions`, so a suite registers
`errors()` or a `trace(fn)` observer there: `create: { plugins: [errors()] }`.

The package has no ambient mode in 0.4. A fixture's `use()` does not wrap the test body's
async context, so an ambient scope would need an `aroundEach` hook around
`nodeScopes().run`. A later release can add it if users ask.

The fixtures also run inside `@cloudflare/vitest-pool-workers`, whose peer is
`vitest ^4.1.0`: the bridge API's workerd leg (section 9.8) uses them, which is the reason
the workspace stays on Vitest 4 while `@nexusdi/vitest` also supports 5.

### 8.3 Peers

```json
"peerDependencies": {
  "@nexusdi/core": "0.4.0-rc.N",
  "@nexusdi/testing": "0.4.0-rc.N",
  "vitest": "^4.1.0 || ^5.0.0",
  "@vitest/runner": "^4.1.0 || ^5.0.0"
}
```

`@nexusdi/testing` is a peer at the same exact version as core, because the user's test
code imports it too and must see the same copy.

4.1 added `test.override` and the builder form of `test.extend`; the object form this
package uses is the same in 4.1 and 5.0. The workspace runs 4.1.9, and CI runs the
package's tests on each supported line (section 13.4).

### 8.4 Tests

The package tests itself with its own fixtures: an override reaches `nexus`,
`test.override` swaps the setup for a suite, the teardown disposes the scope before the
container (asserted with the events of a `trace(fn)` plugin), a failing test still
disposes, a disposal error fails the test (asserted through a nested Vitest run with
`startVitest` and a fixture project), `containerScope: 'file'` shares one container
across a file's tests, and `nexusRequest` reaches `REQUEST`. Type tests cover the fixture
types in `test` callbacks.

## 9. Edge runtimes

### 9.1 Targets

Edge support means the Hono adapter, core, `@nexusdi/node` and `@nexusdi/errors` run on
each runtime below, and a CI leg proves it with the bridge API's suite:

| Runtime              | Entry                                 | `AsyncLocalStorage`                                                           | Limits that touch NexusDI                                              | CI leg                |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------- |
| Cloudflare Workers   | `export default app` (Hono's `fetch`) | `node:async_hooks`, default from compat date 2026-08-04, else `nodejs_compat` | 10 ms CPU per request (Free), 1 s global scope, no I/O at global scope | workerd, pool-workers |
| Vercel Edge          | `hono/vercel` `handle(app)`           | `node:async_hooks`, WinterCG subset                                           | 1 MB gzip (Hobby), no `eval` or `new Function`                         | `edge-runtime` VM     |
| Deno and Deno Deploy | `Deno.serve(app.fetch)`               | `node:async_hooks`                                                            | none found                                                             | Deno 2.9.6            |
| Bun                  | `export default app` or `Bun.serve`   | `node:async_hooks`                                                            | none found                                                             | Bun 1.4.2             |
| Netlify Edge         | Deno, through `hono/netlify`          | `node:async_hooks` (Deno)                                                     | 50 ms CPU per request, 20 MB compressed                                | none; runs on Deno    |

The limits come from "Performance thresholds" (2026-10-14), each a vendor page. Vercel's
own Edge page now recommends Node and says Next.js 16.3 no longer supports
`runtime = 'edge'`, so Vercel Edge is a shrinking target and gets the lightest leg.

The Bun and Deno versions come from `examples/toolchain-matrix/toolchains.json`, so the
toolchain matrix and the edge legs test one pinned version of each runtime.

### 9.2 One container per isolate

An isolate (a Worker, a Deno Deploy instance, a Vercel Edge instance) evaluates the
module once and serves many requests. The container belongs to the isolate. A request
never builds one. Two forms:

Module scope, when no factory does I/O while the container is built. The build runs in
the global scope, which Workers bounds at 1 s, and uses no request CPU:

```ts
// a Worker whose graph does no I/O at build: BridgeApi with a local charts provider
import { Nexus } from '@nexusdi/core';
import { createBridge } from './bridge/hono';
import { OfflineMeridian } from './ship/offline';

const ship = await Nexus.create(OfflineMeridian); // module scope, no I/O
export default createBridge(ship);
```

First request, when a factory needs I/O. The bridge API's `Meridian` is this case:
`NAV_CHARTS`'s factory downloads the charts. Workers refuses I/O in the global scope: the
workerd probe of section 9.4, with a `fetch` in an async factory at module scope, failed
to start with `NEXUS_PROVIDER_FAILED`. So the bridge API's Worker entry passes the
function form of section 3.1:

```ts
// examples/bridge-api/src/worker.ts
import { Nexus } from '@nexusdi/core';
import { createBridge } from './bridge/hono';
import { Meridian } from './ship/meridian';

export default createBridge(() => Nexus.create(Meridian));
```

`OfflineMeridian` is the demo app's second root, which binds `NAV_CHARTS` with
`useValue` over a bundled chart file, so the workerd leg runs both forms.

The adapter builds on the first request, shares the promise with every concurrent first
request, and keeps it for the isolate's life. That first request spends the build time in
its CPU budget (section 9.3). Its `fetch` belongs to the first request's context, so if
that client aborts mid-build, workerd may cancel the I/O, and every request awaiting the
shared promise gets a 503. The next request builds again (section 3.1), and the workerd
leg tests exactly that sequence.

Rules the edge guide states:

- `import { env } from 'cloudflare:workers'` reads bindings and secrets at module scope.
  `Comms.forRoot({ frequency })` takes them there, and `forRootAsync` covers options that
  need a binding call.
- A singleton must not hold an I/O object (a socket, a stream, a `Response` body).
  Workers refuses I/O on an object that another request's handler created, and a
  singleton built in the first request is shared by every later one. Data a factory
  fetched (the charts) is fine. A database client that opens a connection is `scoped`.
- No container disposal. An isolate gets no shutdown signal, and the guide says so.
- Scoped factories that are synchronous get `eager: false`, so core builds them on first
  `get()` and a request that does not need them does not run them. Async scoped factories
  stay eager (`NEXUS_LAZY_ASYNC`).
- The startup check runs in CI: `Nexus.check(Meridian, { load: [Navigation] })` in a test
  compiles the graph with no user code, so a wrong token fails the build before deploy.
  `inject`'s own check runs on the first request (section 3.3).

Deno, Bun and Vercel Edge allow I/O at module scope, so the module-scope form covers them,
with `await using ship = ...` around `Deno.serve` where the process has a shutdown signal.

### 9.3 The CPU budget

Measured on 2026-10-14 on the owner's Mac (Node 24.20.0, core from `libs/core/src` at
`cef5f39a`, bundled with esbuild): a graph of 50 singleton factories in a chain and 5
scoped factories over `REQUEST`.

| Step                                                                   | Time     |
| ---------------------------------------------------------------------- | -------- |
| first `Nexus.create`, cold (includes JIT warm-up)                      | 5.18 ms  |
| `Nexus.create`, warm, mean of 100                                      | 0.486 ms |
| `createScope` + `resolve` of 2 tokens + dispose, mean of 20,000        | 11.59 µs |
| import of the full core bundle, median of 25 processes (research note) | 1.93 ms  |

Readings:

- A cold build in the first request spends half of Workers' 10 ms Free budget on this
  laptop. Nobody has measured it on Cloudflare's hardware, and the guide assumes it is no
  faster there. So the module-scope form is the default in the
  guide, and the function form is the fallback for I/O factories.
- The per-request cost is microseconds. `createScope` builds every eager scoped factory
  (`runtime/scope.ts:180`), so it grows with their number. The five in this graph were
  eager. The guide tells edge users to mark sync scoped factories `eager: false` and to
  keep request-time work in scoped classes, both of which core builds on first `get()`.
- Workers freezes timers during execution, so the CI leg on workerd cannot measure CPU.
  The bridge API's benchmark (section 13.5) times the same graph on Node and records the
  figures beside the Workers budget.

### 9.4 Request scope on edge

The architect weighed four mechanisms:

| Mechanism                                 | Works on                                          | Cost                                                         | Decision        |
| ----------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ | --------------- |
| Explicit passing: `inject`, `c.var.nexus` | every runtime                                     | none                                                         | default (D4)    |
| `nodeScopes()` over `node:async_hooks`    | Node, Bun, Deno, Workers, Vercel Edge             | one `AsyncLocalStorage.run` per request                      | opt-in `scopes` |
| The ALS shim prototype                    | browsers, with the app and core lowered to es2016 | 1.3 kB, 2 to 3.5 times slower core, no untransformed `await` | rejected (D3)   |
| TC39 `AsyncContext`                       | no runtime provides it                            | none yet                                                     | later           |

Evidence for the second row, from the probe on 2026-10-14 (Hono 4.13.13, core and
`@nexusdi/node` from source, three concurrent requests, each with a `setTimeout` between
`scopes.run` and `scopes.current()`):

- workerd through wrangler 4.151.0, compatibility date 2026-09-01, no flags: each request
  read its own scope. With compatibility date 2025-06-01 and no flag, the Worker failed to
  start with `No such module "node:async_hooks"`.
- Bun 1.3.5 and Deno 1.46.3, the versions on the owner's machine: each request read its
  own scope. Deno 1.46 needed the bundle lowered to ES2022 for `await using`. Bun 1.4.2
  and Deno 2.9.6, the pinned CI versions, stay unverified until the `adapter-runtimes`
  legs run.
- Vercel documents `async_hooks` as a supported module with the WinterCG subset of
  `AsyncLocalStorage`. Not run locally; the `edge-runtime` leg tests it.

Cloudflare's `AsyncLocalStorage` omits `enterWith()` and `disable()`, which
`nodeScopes()` does not call, and does not carry the context through a custom thenable.
`current()` inside a factory that returns a hand-written thenable may read `undefined` on
Workers. `inject` does not depend on the context, so the guide recommends `inject` and
states the thenable limit for `scopes.current()`.

### 9.5 Which package owns the edge binding

`@nexusdi/node` owns `AsyncLocalStorage`: `core-layers.ts` lets only `node/` and `cli/`
import a `node:` module. Edge needs no new owner (D2):

- P1: no package reads another's codes or brands for edge. The adapters keep their one
  allowlisted `NEXUS_DISPOSED` check.
- P2: the `scopes` option is open: any `{ run, current }` object fits, so a runtime with
  no `node:async_hooks` passes its own, the case `/scope-context/` teaches.
- P3: the adapters reach `@nexusdi/node` through the user's wiring line and the
  structural option. Core names neither.
- P4: no second copy of `nodeScopes()`.
- P5: no adapter imports `@nexusdi/node`, detects it, or imports it dynamically. The edge
  entry imports it when the user wants an ambient scope.

`@nexusdi/node`'s `engines.node` of `>=22.12` is advisory: npm warns, and wrangler, Deno
and Bun ignore it. The package changes no line for edge. Its README gains a "Runtimes"
section listing section 9.1's rows.

### 9.6 Bundling and size

- ESM only. Core, the Hono adapter, `@nexusdi/node` and `@nexusdi/errors` publish
  `"type": "module"` with an `exports` map and no CommonJS build.
- No Node built-ins in core: `nodeViolations` refuses `node:` imports and `process` in
  every package but `@nexusdi/node` and `@nexusdi/cli`. Core's one global read is
  `globalThis.SuppressedError` (`runtime/dispose.ts:32`), which falls back when absent.
- Nothing runs at import that Workers forbids in the global scope: core sets two symbols
  in `polyfill/symbol-dispose.ts` and starts no timer, reads no clock and draws no random
  number at import. The workerd leg imports every edge package at module scope, which
  fails the leg if that changes.
- No `eval` and no `new Function`, which Vercel Edge disables. `edge-safe.test.ts`
  (D8) checks core, `@nexusdi/node`, `@nexusdi/errors`, `@nexusdi/hono`,
  `@nexusdi/react-router` and `@nexusdi/next`.

Size, measured with `wrangler deploy --dry-run --minify` on the probe Worker (Hono, core,
`@nexusdi/node`, two providers): 80.08 KiB minified, 28.26 KiB gzip. Hono alone bundles to
7.7 KB gzip with esbuild, so core, node and the app add about 20 KB gzip, in line with
the research note's 18.4 KB for core's minimal import. Against the limits: 2.8 % of
Vercel Edge Hobby's 1 MB gzip, and no figure that registers against Workers' 64 MiB
uncompressed or Netlify's 20 MB. No edge platform's size limit constrains a NexusDI app. The size
report (section 13.6) gains a `hono-worker` fixture that bundles this entry with
`--platform=neutral`, so a regression shows in every pull request.

### 9.7 Disposal on edge

- Workers: the body wrapper disposes at stream end, and `keepAlive` hands the promise to
  `executionCtx.waitUntil`, so async disposers finish after the response (D5). A client
  abort fires `request.signal` only with the `enable_request_signal` compatibility flag.
  Without it, a streaming body that the runtime cancels disposes through the wrapper's
  `cancel`. The guide sets the flag, and the workerd leg tests an abort with the flag and
  without it; `/runtimes/` states what the second run shows.
- Vercel Edge: `hono/vercel` passes no execution context, so `keepAlive` does nothing and
  disposal runs in the response's own lifetime, which Vercel keeps open while the stream
  is read. Disposers that do I/O after the response are the user's job through
  `waitUntil` from `@vercel/functions`, which the guide names.
- Deno, Bun and Netlify Edge: as on Node.

### 9.8 CI

A job, `adapter-runtimes`, runs `examples/bridge-api`'s suite on each runtime with
`scopes: nodeScopes()` and without:

| Leg         | Runner                                                                                             | Covers                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| workerd     | `@cloudflare/vitest-pool-workers` 0.23, compat date 2026-09-01, `enable_request_signal` on and off | module-scope build, function-form build with a `fetch` factory, a first request aborted mid-build then a retry, ambient scope, abort, `waitUntil` |
| Deno        | Deno 2.9.6, `Deno.serve` on port 0                                                                 | module-scope build, ambient scope, abort                                                                                                          |
| Bun         | Bun 1.4.2, `Bun.serve` on port 0                                                                   | module-scope build, ambient scope, abort                                                                                                          |
| Vercel Edge | Vitest's `edge-runtime` environment (`@edge-runtime/vm`)                                           | `app.request()`, ambient scope, no `eval` at runtime                                                                                              |

The workerd leg's `fetch` factory reaches a local mock with `fetchMock` from the pool, so
the leg needs no network. `/runtimes/` gains a row per adapter per runtime, naming this
job, and "not tested" for Netlify Edge and React Router on edge.

## 10. Next.js

### 10.1 Recommendation

Publish `@nexusdi/next` in 0.4 with route handlers and server actions, on the Node
runtime only, gated on one check in its first plan task. The owner approved it on
2026-10-15 (Q1), which reverses the react spec's ruling R12 (with synthesis C13), "no
`@nexusdi/next`". `spec/react` carries a note on R12 that points here.

Why now:

- Users of four ecosystems ask for framework integration, and Next.js is one of them:
  inversify #1352 (both bundles leak into the client), #752 and discussion #1576, and the
  third-party `next-di` exists to fill the gap.
- The adapter is small. It is the shared request scope of section 3.9 plus two wrappers,
  and Next's `after()` gives a disposal signal that the other frameworks lack (D9).
- The guide's `nexus.server.ts` starts with `import 'server-only'`, which turns the
  client-bundle leak of inversify #1352 into a build error that names the import. The
  package entry itself does not import `server-only`: that package throws outside the
  `react-server` condition, which would break plain-Node imports in `verify-packaging`,
  unit tests and README doctests.

What R12 decided stays: the client side is `@nexusdi/react` with `clientOnly`, server
components keep the `cache()` plus `after()` recipe of react spec §10, and this package
adds nothing for components.

The gate: Next can evaluate one module in more than one server layer (react spec §9.3,
W3, unverified on Next 16). If `nexus.server.ts` runs twice in one process, a route
handler and a server action would see two containers. The first plan task builds the
demo app, counts `Nexus.create` calls across a route handler and a server action through
a `trace(fn)` plugin, and continues only on one call per process. If the count is two,
the package moves to 0.5, and 0.4 publishes a guide page with the hand-written pattern.

### 10.2 Scope

| Case                               | In 0.4 | How                                                                            |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------ |
| Route handlers (`app/**/route.ts`) | yes    | `di.route(deps, handler)`                                                      |
| Server actions (`'use server'`)    | yes    | `di.action(deps, fn)`                                                          |
| A request scope per request        | yes    | one scope per route call or action call, created on first use                  |
| Server components                  | no     | react spec §10 recipe; a component has no frame the adapter can wrap           |
| Proxy (Next 16's middleware)       | no     | it runs before routing and has no handler deps to resolve                      |
| `runtime = 'edge'`                 | no     | Next 16.3 dropped it; the package targets the Node runtime                     |
| Pages Router                       | no     | no demand found in the research                                                |
| `di.load` for lazy sections        | no     | route files load per route already; a later release can add it                 |
| `di.scope()` outside a wrapper     | no     | no frame to find the request in without `scopes`; `scopes.current()` covers it |

Owner decision 2.1 item 9 gives every adapter `di.load`. `@nexusdi/next` leaves it out, so
Q1 names the omission.

### 10.3 API

```ts
// app/nexus.server.ts
import 'server-only';
import { Nexus } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { nexus } from '@nexusdi/next';
import { headers } from 'next/headers';
import { Meridian } from './ship/meridian';

export const di = nexus(
  () =>
    Nexus.create(Meridian, {
      plugins: process.env.NODE_ENV === 'development' ? [errors()] : [],
    }),
  {
    request: async () => ({
      mission: {
        id: (await headers()).get('x-mission-id') ?? 'survey-7',
        target: 'Kepler-442b',
      },
    }),
  },
);
```

```ts
// app/course/[to]/route.ts
import { FLIGHT_LOG, NAV_CHARTS } from '../../bridge/contracts';
import { di } from '../../nexus.server';

export const GET = di.route(
  { charts: NAV_CHARTS, log: FLIGHT_LOG },
  async ({ charts, log }, request, { params }) => {
    const { to } = await params;
    log.record(`plotting ${to}`);
    return Response.json(charts.plot(to));
  },
);
```

```ts
// app/actions.ts
'use server';
import { FLIGHT_LOG } from './bridge/contracts';
import { di } from './nexus.server';

export const recordEntry = di.action(
  { log: FLIGHT_LOG },
  async ({ log }, entry: string) => {
    log.record(entry);
    return log.entries();
  },
);
```

The `request` mapping takes no argument and reads `headers()` and `cookies()` from
`next/headers`, which work in route handlers and server actions alike. The guide uses the
function form of `nexus()` on the Node runtime, so `next build` evaluates the module
without building the container, and a development reload rebuilds it once per module
evaluation. Typed deps are therefore checked on the first request, and the demo app runs
`Nexus.check(Meridian)` in a test so a wrong token fails CI (section 9.2).

Exports: `nexus(ship, options): NexusNext` with `{ route; action }`, `ContainerSource`,
`NexusHttpError` and `NexusNextOptions` (`request`, `scopes`, `log`). Code below a
wrapper that needs the scope without a deps record sets `scopes: nodeScopes()` and reads
`scopes.current()`.

### 10.4 Request flow

```ts
route: (deps, handler) => async (request, ctx) => {
  const handle = requestScope(container, () => options.request?.());
  after(() => handle.close().catch(log)); // runs after the response, errors included
  try {
    return await withScope(handle, deps, async (resolved) => handler(resolved, request, ctx));
  } catch (error) {
    if (!(error instanceof NexusHttpError)) throw error; // the handler's own errors
    return new Response(null, { status: error.status, statusText: error.message });
  }
},
action: (deps, fn) => async (...args) => {
  const handle = requestScope(container, () => options.request?.());
  after(() => handle.close().catch(log));
  return withScope(handle, deps, async (resolved) => fn(resolved, ...args)); // a throw reaches Next
},

// Resolves the record, inside scopes.run when scopes is set; maps errors (section 3.6).
async function withScope(handle, deps, call) {
  const scope = await mapErrors(handle.scope());
  const run = async () => call(await mapErrors(resolveFrom(scope, deps)));
  return options.scopes ? options.scopes.run(scope, run) : run();
}
```

`after` comes from `next/server`, stable since 15.1. Next runs the callback after the
response finishes, also when the handler throws or calls `notFound()` or `redirect()`.
On self-hosted Node it needs no setup; on a platform adapter it needs that platform's
`waitUntil`, which Next documents.

A server action's return value is serialized into the RSC payload. A returned promise that
reads a scoped instance later would read it after disposal only if Next streamed it after
the response, which `after()` already waits for. The test of section 10.6 asserts it.

### 10.5 Errors and peers

In a route handler, the adapter returns `new Response(null, { status, statusText })`
with 500 or 503, because Next turns any thrown error into a 500 and would lose the 503.
In an action, the adapter throws a `NexusHttpError` with no `code` property, as Express
does, and Next sends the client a digest and no message in production. `log` is the
`NexusLog` of section 3.1.

```json
"peerDependencies": { "@nexusdi/core": "0.4.0-rc.N", "next": "^15.1.0 || ^16.0.0" }
```

15.1 is the floor because `after()` became stable there, and `headers()` is async from 15.
React 19 is Next's own peer, so this package names none.

### 10.6 Tests

- Unit: `di.route` and `di.action` with a stubbed `after` and `headers`.
- Integration (`examples/next-bridge`, section 14): `next build` and `next start` on port
  0, then a JSON route, a streaming route, an aborted streaming request, an action
  posted through a test page, a throwing handler, and 50 concurrent requests, each
  counted through `trace(fn)`. The gate test of section 10.1 counts `Nexus.create`. A
  client-build check asserts no module from `nexus.server.ts` and no `@nexusdi/core` in
  `.next/static`.
- If the abort case shows the `after()` callback still pending 5 s after the client
  disconnected from a stream that the handler keeps writing, the adapter adds the body
  wrapper (D9). 5 s is the test's own bound; Next documents no stream timeout of its own
  for route handlers.

## 11. Package layout and conventions

Each package is generated with
`npx nx g @nx/js:library libs/<name> --bundler=tsc --unitTestRunner=vitest`, then aligned
with `libs/core`: the generator's defaults are deleted where core differs, and lint,
format and type generation are wired before the second source file.

```
libs/<name>/
  src/
    index.ts
    nexus.ts               the adapter (nexusFixtures.ts for vitest)
    internal/              request-scope.ts, dispose-with-body.ts (hono, react-router)
    *.test.ts, *.test-d.ts
    <name>.e2e.test.ts
  README.md  CHANGELOG.md  LICENSE
  package.json  tsconfig.json  tsconfig.lib.json  tsconfig.spec.json  vite.config.ts
```

`package.json`, shown for Hono:

```json
{
  "name": "@nexusdi/hono",
  "version": "0.4.0-rc.N",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=22.12" },
  "types": "./dist/index.d.ts",
  "exports": {
    "./package.json": "./package.json",
    ".": {
      "@nexusdi/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "!dist/**/*.tsbuildinfo",
    "src",
    "!src/**/*.test.*",
    "!src/**/*.spec.*",
    "!src/**/*.test-d.*",
    "!src/**/__fixtures__/**",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
  "peerDependencies": { "@nexusdi/core": "0.4.0-rc.N", "hono": "^4.0.0" },
  "devDependencies": { "@hono/node-server": "^2.1.5", "hono": "^4.13.13" },
  "keywords": [
    "nexusdi",
    "dependency-injection",
    "hono",
    "hono-middleware",
    "cloudflare-workers"
  ],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/NexusDI/core.git",
    "directory": "libs/hono"
  },
  "publishConfig": { "access": "public", "provenance": true }
}
```

The fields follow `libs/core` and the libraries repo's `nestjs-correlation-id` (caret
peers on a framework's major, caret dev dependencies, an optional peer in
`peerDependenciesMeta`). `@nexusdi/core` is an exact pin, and so is `@nexusdi/testing`
in `@nexusdi/vitest`. No adapter depends on `@nexusdi/node`, `@nexusdi/errors` or
`@nexusdi/devtools`: the user installs and registers those, and the adapters' tests list
them as dev dependencies.

The workspace wiring:

- The packages under `libs/*` join `workspaces` and `release.projects` without an edit,
  because those globs cover `libs/*`. `tsconfig.json` `references` is an explicit list,
  which `nx sync` (the `@nx/js/typescript` plugin) updates.
- `commitlint.config.js` adds the scopes `hono`, `express`, `fastify`, `react-router`,
  `vitest` and `next`, which `commitlint-scope-enum.test.ts` requires, and the demo app
  scopes `bridge-api` and `next-bridge`.
- `.fallowrc.jsonc` `publicPackages` adds each package.
- `owner-vocabulary.test.ts`'s `NEXUS_DISPOSED` entry adds `@nexusdi/next`.
- `no-copies.test.ts` and `.fallowrc.jsonc` add the copy globs of section 3.7.
- `scripts/verify-packaging.mjs` `LIBS` adds each package (section 13.1).

Each README follows `docs/documentation-style-guide.md` and the npm README rule: a
tagline, install, a minimal example, a docs link. The sections after that: Typed handlers
(`inject`), When the scope is disposed, Errors, Ambient scope (not in vitest), Runtimes
(hono only), Requirements (a table of the peer ranges and Node). Every TypeScript fence
runs as a doctest through `docExamples()` and the `ts @import.meta.vitest` marker, with
`// -> value` claims turned into assertions, using each framework's in-process request
API (`app.request()`, `fastify.inject()`, a port-0 Express server and `fetch`, React
Router's `createRequestHandler` with a `Request`). `doc-twoslash` type-checks the same
fences.

## 12. Release

The release machinery on `release/0.4` covers new packages, so this spec adds no workflow
step:

- Bootstrap: before a package's first RC, the owner runs
  `.claude/skills/nexusdi-release/scripts/bootstrap.sh <pkg> <otp>`, sets the trusted
  publisher with "Allow npm dist-tag" on, and deprecates the placeholder
  (`RELEASING.md`, "Bootstrapping a new package"). `bootstrap.sh` reads
  `libs/<pkg>/package.json` from the owner's checkout, so one round runs once the five
  package folders exist on the release branch, and `@nexusdi/next` may need a second
  round after its gate (section 10.1).
- Version on disk: a new package carries the release line's current version (`0.4.0-rc.1`
  today) and pins `@nexusdi/core` at it, which npm workspaces link to `libs/core`. The
  next `rc` run versions every project to `0.4.0-rc.2` together. `nx release --dry-run`
  confirms that `peerDependencies` pins are rewritten before the first adapter merges, and
  `package-versions.test.ts`, which already holds every lib's exact `@nexusdi/core` peer
  at core's version, gains the same check for `@nexusdi/vitest`'s `@nexusdi/testing`
  peer.
- Dist-tags: an RC publishes under `next`, and `reconcile.mjs` then points `latest` at the
  RC for every package with no stable version. So `npm i @nexusdi/hono` installs the RC
  until 0.4.0, and core stays on `latest` 0.3.x until 0.4.0.
- Install line: every README and guide shows `npm i @nexusdi/core@next @nexusdi/hono`,
  because the adapter's exact core peer is an RC while core's `latest` is 0.3.x. Revision
  2's npm 11.19.0 check stands: with core 0.3.x in `package.json`, installing the adapter
  alone fails with `ERESOLVE`.
- Final: an adapter with an open `rc-blocker` blocks 0.4.0, and every `adapter-peers`
  and `adapter-runtimes` leg passes on the final commit.

## 13. Verification

### 13.1 `verify-packaging`

`scripts/verify-packaging.mjs` adds the new packages to `LIBS`, and their framework peers
to the throwaway consumer's install (`hono`, `@hono/node-server`, `express`,
`@types/express`, `fastify`, `react-router`, `vitest`, `next`). The consumer also
installs the packed `@nexusdi/testing`, `@nexusdi/node` and `@nexusdi/errors`, and:

- imports every export of every adapter under `moduleResolution` `nodenext` and
  `bundler`, with `skipLibCheck: false`;
- runs one request through each server adapter from the packed build, once with
  `errors()` registered and `scopes: nodeScopes()`;
- asserts each adapter's `@nexusdi/*` peers equal the packed versions;
- asserts that no adapter's packed `dist` imports a core path other than a package entry;
- asserts that the packed `dist` of `@nexusdi/hono`, `@nexusdi/react-router` and
  `@nexusdi/next` contains no `node:` import;
- runs the existing tslib check over the new packages.

### 13.2 Type floor

`scripts/check-type-floor.mjs` compiles each adapter's type tests with TypeScript 5.4 and
TypeScript 7. A framework whose own declarations need a newer TypeScript raises that
adapter's floor, and its README's Requirements table states it.

### 13.3 Runtimes

Section 9.8. The toolchain matrix itself does not change: it proves that core compiles
and runs under each TypeScript toolchain, and the adapters add no decorator or emit
concern.

### 13.4 Peer ranges

A CI job, `adapter-peers`, installs each leg's framework version over the workspace and
runs that adapter's unit, type and integration tests:

| Adapter                 | Legs                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| `@nexusdi/hono`         | `hono@4.0.0`, latest 4.x                                                   |
| `@nexusdi/express`      | `express@5.0.0`, latest 5.x                                                |
| `@nexusdi/fastify`      | `fastify@5.0.0` with `fastify-plugin@6.0.0`, latest 5.x with latest 6.x    |
| `@nexusdi/react-router` | `react-router@7.9.0` and latest 7.x, both with `v8_middleware`; latest 8.x |
| `@nexusdi/vitest`       | `vitest@4.1.0`, latest 4.x, latest 5.x                                     |
| `@nexusdi/next`         | `next@15.1.0`, latest 15.x, latest 16.x                                    |

The workspace pins React Router 8 after `examples/react-ssr` moves, Vitest 4.1.9 and
Next 16, so the main job covers one line of each and this job covers the rest.

### 13.5 Benchmarks

The bridge API carries a benchmark script that times `Nexus.create` cold and warm and a
request through each adapter against the bare framework on the same route, on Node. Its
figures go into `/runtimes/` beside the Workers budget (section 9.3). The launch
benchmarks spec owns any published comparison.

### 13.6 Size report

`examples/size` gains one fixture per server adapter: the two-service app with the
adapter's `nexus`, its middleware and one `inject` route, bundled with esbuild
`--bundle --minify --format=esm` and gzip level 9, the framework marked external. It also
gains `hono-worker`, the Workers entry of section 9.2 bundled with `--platform=neutral`
and Hono included, which is the figure an edge user compares with a size limit.
`@nexusdi/vitest` gets no fixture, because nothing bundles a test helper. Adapter growth
is reported and never fails the job; the threshold applies to core alone.

## 14. Demo apps

The demo apps plan (2026-10-12) requires every package to run in a demo app in CI. The
adapters map onto it like this:

| Package                 | Demo app                                    | What runs in CI                                                              |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| `@nexusdi/hono`         | `examples/bridge-api`, Hono entry           | the route suite on Node, workerd, Deno, Bun and the `edge-runtime` VM        |
| `@nexusdi/express`      | `examples/bridge-api`, Express entry        | the same route suite on Node                                                 |
| `@nexusdi/fastify`      | `examples/bridge-api`, Fastify entry        | the same route suite on Node                                                 |
| `@nexusdi/vitest`       | `examples/bridge-api`, `examples/react-ssr` | every test file of both apps uses `nexusFixtures`                            |
| `@nexusdi/react-router` | `examples/react-ssr`                        | build, serve, the deferred-data stream test and a lazy route first request   |
| `@nexusdi/react`        | `examples/react-ssr`                        | the client container, `ScopeProvider` and hydration (react spec §9.1)        |
| `@nexusdi/next`         | `examples/next-bridge`                      | `next build`, `next start`, route handlers, an action, the gate test of 10.1 |
| `@nexusdi/node`         | `examples/bridge-api`                       | `scopes: nodeScopes()` on Node and on every edge leg                         |

`examples/bridge-api` is the "Meridian app (Hono, backend)" of the plan (D6). One module
graph (`Meridian`, `Tactical`, `BridgeApi`) serves four entries: `src/hono.ts`,
`src/express.ts`, `src/fastify.ts` and `src/worker.ts`. One e2e suite runs against each
server entry, so the three frameworks prove the same behaviour on the same routes. The
plan's other rows for this app (interceptors on handlers, `errors()`, devtools in
development, `createTestingContainer` in tests, `nexusdi graph` in CI) stay as the plan
lists them. Its README leads with Hono.

`examples/react-ssr` moves to React Router 8, to `@nexusdi/react-router` and
`@nexusdi/react`, and to the Meridian domain:

- `di.middleware` and loaders with `di.inject` replace `containerContext` and
  `containerMiddleware`;
- a scoped provider built from `REQUEST` replaces the module-level `let user` in
  `home.tsx`;
- the users and logger domain, which the docs spec's §7.7 deny-lists, becomes the bridge
  API's flight log and course plotting;
- a lazy route loads a section module with `di.load`, and a test requests it first on a
  fresh server (section 3.9);
- the route tests move to `NEXUS_SCOPE` and `existingScope`.

`react-ssr` stays in the set (D11). It gives the plan its non-federated frontend.

`examples/next-bridge` is new, and exists once the gate of section 10.1 passes. It serves the bridge
API through route handlers and records flight log entries through a server action. It
imports the same module files as `bridge-api`.

Every demo app runs in the `main` CI job against the workspace packages, through
`nx affected`, and in the `adapter-peers` and `adapter-runtimes` jobs of section 13.

## 15. Docs changes

### 15.1 Inventory

The docs spec's inventory (§4.3 on `spec/docs-site-amend`) and the live Guides band in
`apps/docs/content/_meta.ts` change as follows. Rows 15, 20 and 23 (`/react-router-ssr/`,
`/scope-context/`, `/runtimes/`) are inventory rows that `apps/docs/content` on
`release/0.4` does not have yet. The docs work creates each page, and this spec's change
applies when it does.

| #   | Path                                                                                               | Change                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14  | `/node-request-scopes/`                                                                            | Keeps `nodeScopes()` on a bare `node:http` server. Adds an H2 "With a framework" linking to the adapter pages and their `scopes` option. The docs spec row's "passed as the `scopes` option to `Nexus.create`" is wrong for rc.1 and is struck. |
| 15  | `/react-router-ssr/`                                                                               | Rewritten around `@nexusdi/react-router` over `examples/react-ssr`: `nexus.server.ts`, the root middleware, `inject` in loaders, a lazy route with `di.load`, route tests with `NEXUS_SCOPE` and `existingScope`.                               |
| 17  | `/load/`                                                                                           | Adds an H2 "Load a module for a lazy route or section": `NEXUS_LOADED_AFTER_SCOPE`, `scope.extend()`, and the `di.load(Feature)` middleware, which extends the request's scope.                                                                 |
| 16  | `/testing/`                                                                                        | Keeps `createTestingContainer`. Adds an H2 "With Vitest fixtures" that shows `nexusFixtures` and links to `/vitest/`.                                                                                                                           |
| 20  | `/scope-context/`                                                                                  | States that Workers, Deno, Bun and Vercel Edge take `nodeScopes()` through their `node:async_hooks`, and keeps the custom `{ run, current }` object for runtimes without it.                                                                    |
| 23  | `/runtimes/`                                                                                       | One row per adapter per runtime, from `adapter-runtimes`, with section 9.3's figures.                                                                                                                                                           |
| new | `/hono/`                                                                                           | Platform guide: "Scope a Hono request".                                                                                                                                                                                                         |
| new | `/express/`                                                                                        | Platform guide: "Scope an Express request".                                                                                                                                                                                                     |
| new | `/fastify/`                                                                                        | Platform guide: "Scope a Fastify request".                                                                                                                                                                                                      |
| new | `/edge/`                                                                                           | Platform guide: "Run on Cloudflare Workers and other edge runtimes": section 9.2's two forms, the CPU budget, the I/O rule for singletons, the ambient scope, the compatibility date and `enable_request_signal`.                               |
| new | `/next/`                                                                                           | Platform guide: "Scope a Next.js route handler or server action" (after the gate).                                                                                                                                                              |
| new | `/vitest/`                                                                                         | Question page: "How do I get a container in every Vitest test?"                                                                                                                                                                                 |
| new | `/api-hono/`, `/api-express/`, `/api-fastify/`, `/api-react-router/`, `/api-vitest/`, `/api-next/` | Reference pages, one H2 per export.                                                                                                                                                                                                             |

`/node-request-scopes/` tells readers to keep `const ship` and warns that a top-level
`await using` disposes the container when the module ends. The adapter guides' server
entries use `await using` with `await once(server, 'close')`, which keeps the block open.
Each guide states why its form differs, and links to that warning.

Each platform guide has the same H2s: Install, Create the scope per request, Handlers
with `inject`, When the scope is disposed, Errors, Ambient scope, Shutdown. Each cites a
region of `examples/meridian/src/pages/<slug>.md`, which runs it through the framework's
in-process request API. Server startup code carries `no-run`. Each page follows the
`docs-page` skill and runs Context, Concept, Detail.

### 15.2 Guards and domain

- G5 `doc-exports` resolves the new `@nexusdi/*` imports through each package's exports
  map with no change, since it reads the map.
- G10 `doc-export-coverage` extends to the new packages' `.` entries.
- Every guide's server entry registers `errors()` in development. Getting started in a
  README uses a class token, and the guides, which are later pages, are interface-first.
- `doc-regions` adds `libs/<adapter>/README.md` as region sources.
- `examples/meridian` adds `hono`, `@hono/node-server`, `express`, `fastify`,
  `react-router` and `next` as dev dependencies at the workspace versions.

The docs spec's §7.1 vocabulary gains two rows, and every guide uses them:

- "A server app: the bridge API (`BridgeApi`), built by `createBridge(ship)`, with the
  route `GET /course/:to` and the header `x-mission-id`."
- "Interface-first contracts: `INavCharts` behind `NAV_CHARTS`, still the async factory
  in `Tactical` (`StarCharts.download(link)`); `IFlightLog` behind the scoped
  `FLIGHT_LOG`, bound in `BridgeApi` with `useClass: ShuttleFlightLog`; the doubles
  `fakeCharts` and `MemoryFlightLog`."

### 15.3 Delivery

The adapter guides, the edge guide and the API pages go live with the RC that carries the
packages: rc.2, or rc.3 for Next (Q2). `/runtimes/` gains its rows when `adapter-runtimes` first passes.

## 16. Delivery

The implementation order, each step reusing the one before it:

1. `@nexusdi/express` with `request-scope.ts` (`containerOf`, `ContainerBuildError`, the
   status rule and the scope handle), and `@nexusdi/vitest`. The `NEXUS_DISPOSED`
   allowlist entry already names Express.
2. `@nexusdi/fastify`, with the second copy of `request-scope.ts`. This step adds
   `adapter-shared-copies.test.ts`, the `request-scope.ts` glob in `.fallowrc.jsonc` and
   the same glob in `no-copies.test.ts`'s `ALLOWLIST`, which fails on a glob that spans
   fewer than two packages.
3. `@nexusdi/hono`: the first `dispose-with-body.ts`, `keepAlive`, `examples/bridge-api`
   with its four entries, `edge-safe.test.ts` and the `adapter-runtimes` job.
4. `@nexusdi/react-router`: the second copy of `dispose-with-body.ts`, which adds that
   file's glob to both lists, and the move of `examples/react-ssr`, together with
   `@nexusdi/react`'s plan.
5. `@nexusdi/next`: the gate test first, then the package, which adds
   `@nexusdi/next` to the `NEXUS_DISPOSED` entry, and `examples/next-bridge`.

The release checklist gains:

- the bootstrap of each new package name (section 12);
- the size report listing each adapter and `hono-worker` (section 13.6);
- a passing `adapter-peers` and `adapter-runtimes` run on the release commit.

## 17. Ecosystem listings

Each listing links a stable version, so the pull requests are prepared during the RC and
opened after 0.4.0 final.

| Package                    | Listing                                                                            | Process                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@nexusdi/hono`            | hono.dev "Third-party Middleware" (`https://hono.dev/docs/middleware/third-party`) | A pull request to the site's repository. The page states no criteria (unverified). The `honojs/middleware` monorepo is not a target, because it takes over the package.        |
| `@nexusdi/fastify`         | `docs/Guides/Ecosystem.md`, Community section, in `fastify/fastify`                | A pull request with ``- [`@nexusdi/fastify`](url) description`` in alphabetical order, which `lint-ecosystem.js` checks. Needs docs and tests, which Write-Plugin.md requires. |
| `@nexusdi/react-router`    | reactrouter.com community resources                                                | Unverified whether a listing exists; the implementation plan checks at launch.                                                                                                 |
| `@nexusdi/vitest`          | `awesome-vitest`                                                                   | Unverified; the plan checks at launch.                                                                                                                                         |
| `@nexusdi/hono` on Workers | Cloudflare's Workers framework guides                                              | Unverified whether third-party middleware is listed; the plan checks at launch.                                                                                                |
| all                        | npm keywords and the docs `/comparison/` page                                      | In each `package.json`, and a `/comparison/` row on framework and edge support.                                                                                                |

Express gets no listing. Its middleware page takes no new entries
(`expressjs/expressjs.com#2375`), so `@nexusdi/express` reaches users through npm search,
the docs and the launch post. The launch post lists the packages with a link to each
guide.

## 18. Out of scope

- `@nexusdi/react`, which is released in 0.4 under its own spec.
- Adapters for other frameworks (NestJS, Koa, Elysia, h3, Astro). The shape of section
  3.1 carries over to each.
- Next.js server components, proxy, Pages Router and the edge runtime (section 10.2).
- React Router on Workers, Deno or Bun as a tested setup.
- WebSocket and server-sent-event connections that outlive a request's scope beyond the
  stream disposal of section 3.4.
- An ambient scope in `@nexusdi/vitest`.
- Owning the container inside an adapter, such as a Fastify plugin that calls
  `Nexus.create` itself. The function form of section 3.1 calls the user's function and
  stays outside this item.
- Nested scopes, which core 0.4 does not have.
- JSR publication for Deno users.

## 19. What this spec needs from core

Nothing new is required from core for 0.4. Every adapter and edge need is met by rc.1's
public API (section 3.10). The items below are what the spec touches, each checked
against P1 to P5:

| #   | Item                                                                   | Where               | P1 to P5                                                                                | Status           |
| --- | ---------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------- | ---------------- |
| N1  | `isNexusError(error, 'NEXUS_DISPOSED')` in each server adapter         | adapters            | P1: the allowlisted equality; `@nexusdi/next` joins the entry                           | exists           |
| N2  | Copies of `request-scope.ts` and `dispose-with-body.ts`                | adapters            | P4: the named exception (V13); globs added to `no-copies.test.ts` and `.fallowrc.jsonc` | spec change here |
| N3  | `edge-safe.test.ts`: no `eval(` or `new Function` in edge packages     | `tools/repo-checks` | none touched: a repo-check names packages, which tools may                              | new check        |
| N4  | `eager: false` on sync scoped factories, recommended by the edge guide | core                | none; public provider option                                                            | exists           |
| N5  | `Nexus.check` in the edge guide's CI test                              | core                | none; public API                                                                        | exists           |
| N6  | The structural `scopes` option                                         | adapters            | P3 and P5: no import of `@nexusdi/node`; the user wires it                              | exists           |

N4 is no request for 0.4. Core already builds a sync scoped factory with `eager: false`
on first `get()` (`blueprint/levels.ts:186-198`, `runtime/lazy.ts`). Only async scoped
factories must run in `createScope`, because "the runtime cannot tell a sync factory from
an async one without calling it" (`runtime/scope.ts:180-186`). Section 9.3 measured
11.59 µs per request with five eager ones. The edge guide's advice (`eager: false` and
scoped classes) covers 0.4.

## 20. Owner questions and answers

Q1. Publish `@nexusdi/next` in 0.4?

- What it does: a package with `di.route(deps, handler)` for App Router route handlers
  and `di.action(deps, fn)` for server actions. Each call gets a request scope, typed
  deps checked on the first request (with `Nexus.check` in CI for a build-time check),
  and disposal through Next's `after()`. The guide's `nexus.server.ts` imports
  `server-only`, so a client import fails the build.
- The case: a Next 16 app that today creates `ship.createScope()` by hand in each route
  and action, and leaks the scope when a stream outlives the handler. The inversify and
  `next-di` threads show Next users asking for this.
- User consequence: one more package to install for Next users, and a new guide page.
  Nothing is removed or renamed. It reverses the react spec's ruling R12 ("no
  `@nexusdi/next`"); the client side and the server-component recipe of R12 stay as they
  are. Scope: Node runtime only, no server components, no proxy. It also narrows your
  decision that every adapter has `di.load(Module)`: Next has no `di.load` in 0.4,
  because each route file already loads on its own, and no `di.scope()`.
- Recommendation: yes, gated. The first task runs the double-evaluation check of section
  10.1. If Next evaluates `nexus.server.ts` twice in one process, the package moves to
  0.5 and 0.4 publishes the guide page only.
- Answer (owner, 2026-10-15): yes. `@nexusdi/next` is in 0.4, gated on the
  double-evaluation check.

Q2. Which RC carries the adapters?

- What it does: replaces the first draft's decision "all five adapters are in rc.0",
  which rc.0 and rc.1 did not meet.
- The case: the adapters, the edge guide and the demo apps are unbuilt on
  `release/0.4`, and each needs a bootstrap on npm before its first publish.
- User consequence: RC testers get the adapters later than planned. An adapter published
  late in the RC window gets less feedback before 0.4.0.
- Recommendation: all packages in rc.2, with `@nexusdi/next` allowed to follow in rc.3
  if its gate is still open. 0.4.0 final waits until every adapter has been in at least
  one RC with its demo app green. A new package breaks no existing API, so it does not
  restart the RC count.
- Answer (owner, 2026-10-15): all adapters in rc.2, and Next may follow in rc.3. 0.4.0
  final waits until every adapter has been in at least one RC with its demo app green.
