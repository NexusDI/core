# NexusDI 0.4 framework integrations

Status: draft, revised with the owner's decisions on the first draft (`d9a9a7b`). Section
2.1 records them, and section 16 holds nothing open.
Packages (all new, all published): `@nexusdi/hono`, `@nexusdi/express`, `@nexusdi/fastify`,
`@nexusdi/react-router`, `@nexusdi/vitest`.
Depends on:

- `specs/2026-09-23-core-0.4-design.md` at `b5ab435`. The adapters use only its public API:
  `Nexus.create`, `createScope({ request })`, `REQUEST` and the `NexusRequest`
  augmentation, `ScopeContext` with `runInScope` and `currentScope`, `@nexusdi/core/node`,
  `createTestingContainer` from `@nexusdi/core/testing`, `Symbol.asyncDispose` and the
  `trace` callback. The export list is the one in "What the codemod plan depends on" at the
  end of `specs/plans/2026-09-23-core-0.4-engine.md`. Section 3.3 adds
  `Scope.resolve(deps)` and `Nexus.validate(deps)`, an amendment the owner approved; the
  core spec is being amended with those signatures.
- `specs/2026-09-23-docs-site-design.md`, whose Guides band and rc.0 list this spec amends
  (section 12).
- The release setup on `main` at `ffea563`: `nx.json` `release` (independent projects,
  `libs/*`, `versionPrefix: ""`, `updateDependents: "always"`), `release.yml` with the
  `specifier` and `preid` inputs, `RELEASING.md`, `scripts/verify-packaging.mjs`.

Measured on 2026-09-23 against the npm registry and each framework's source and primary
docs:

| Package             | Latest | Other lines in use           | Node engines of the latest    |
| ------------------- | ------ | ---------------------------- | ----------------------------- |
| `hono`              | 4.13.8 | none                         | `>=16.9.0`                    |
| `@hono/node-server` | 2.1.1  | 1.19.17 (`latest-1`)         | `>=20`                        |
| `express`           | 5.2.1  | 4.22.3 (`latest-4`)          | `>=18`                        |
| `@types/express`    | 5.0.6  | none                         | none                          |
| `fastify`           | 5.12.5 | 4.29.1 (`four`)              | none declared; LTS.md: 20, 22 |
| `fastify-plugin`    | 6.0.0  | 5.1.0                        | none                          |
| `react-router`      | 8.4.0  | 7.18.4 (`version-7`)         | `>=22.22.0`                   |
| `vitest`            | 5.0.1  | 4.1.11 (`V4`); repo on 4.1.9 | `^22.12.0 \|\| ^24 \|\| >=26` |

Prior art: `examples/react-ssr` on `main`, which hand-rolls a React Router context and
middleware around one global 0.3 container; `libs/nestjs-correlation-id` in the libraries
repo, the owner's one framework package; `hono/context-storage`; `@fastify/request-context`;
`@react-router/express`, whose request handler aborts the request signal on `res` close.

## 1. Problem

A 0.4 server user writes the same code in every framework. They create a scope per
request, map the framework request into `NexusRequest`, hand the scope to handlers, and
dispose it when the response is done. Core spec §3.6 shows the pattern with
`await using` around `runInScope(shuttle, () => dispatch(req))`.

That pattern disposes the scope when `dispatch` returns. In three of the four server
frameworks the handler returns before the response body is written:

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
leaks a scope per aborted request. The 0.3 example does neither, because it has no scope:
it keeps one global container in a React Router context, and `home.tsx` keeps request
data in a module-level `let user`.

Tests repeat the same boilerplate. Every test file builds a testing container, overrides
providers, and disposes the container, and a test that forgets `await using` leaks a
container into the next test.

## 2. Decisions

1. Five packages, one per framework, each in `libs/<name>`. No shared runtime package
   (section 3.7).
2. Every server adapter has one shape: `nexus(ship, options)` returns an object with the
   framework's hook (`middleware` or `plugin`), `inject` and `scope`. The adapter never
   creates or disposes the container. The user owns it.
3. A scope is created per request with `createScope({ request })`, where `request` comes
   from a user function that maps the framework request to `NexusRequest`.
4. The adapter disposes the scope when the response is finished or the client is gone,
   whichever happens first. It never disposes at the return of `next()` while a body is
   still being written (section 3.4).
5. Handlers receive dependencies through `inject({ name: Dep }, handler)`, a record of
   deps resolved from the request's scope and typed with core's `Resolve`. The record is
   checked against the container when the route is defined, so a missing provider fails
   at startup (section 3.3).
6. The ambient scope is opt-in (`ambient: true`), and needs a container created with a
   `scopeContext`.
7. The adapters map only the errors they raise. A `NexusError` from scope creation or
   `inject` is logged once with its code and becomes the framework's plain 500, or 503
   while the container shuts down. No response body carries a code, a token name or a
   message from core (section 3.6).
8. Hono and React Router adapters use only web-standard APIs and import no `node:` module.
   Express and Fastify adapters are Node-only.
9. `@nexusdi/vitest` provides `test.extend` fixtures for a testing container and a scope,
   each disposed after its test.
10. Each package is versioned independently by `nx release`, published as `0.4.0-rc.N`
    with core, and pins `@nexusdi/core` exactly in `peerDependencies`.
11. The Release workflow picks the dist-tag per package. A package with no stable version on
    npm publishes every version with `latest`. A package with a stable version publishes a
    prerelease with `next` and a stable version with `latest` (section 10.3).
12. All five packages are in rc.0 (section 13).

### 2.1 Decisions settled after review

The owner decided these on the first draft. Each one is specified where the section
reference points.

1. Core adds `Scope.resolve(deps)` and `Nexus.validate(deps)` (section 3.3).
2. No shared package. The body wrapper is copied, and a repo-check keeps the copies
   identical (section 3.7).
3. `@nexusdi/react-router` supports `^7.9.0` with `v8_middleware` and `^8.0.0`, and
   `examples/react-ssr` moves to React Router 8 (sections 7.1 and 12.3).
4. `@nexusdi/vitest` supports `^4.1.0` and `^5.0.0` (section 8.3).
5. CI runs a leg per supported major of React Router and Vitest (section 11.4).
6. The dist-tag is chosen per package in `release.yml`, with no npm token and no manual
   tag step (section 10.3).
7. All five adapters are in rc.0 (section 13).
8. Express stays in scope. The Express middleware list takes no new entries
   (`expressjs/expressjs.com#2375`), so launch material has no Express listing
   (section 14).

## 3. Shared design

### 3.1 One shape

```ts
import { nexus } from '@nexusdi/<framework>';

const di = nexus(ship, {
  request: (frameworkRequest) => ({ mission: missionFrom(frameworkRequest) }),
  ambient: false,
  log: (error, context) => console.error(error),
});

di.middleware; // or di.plugin for Fastify
di.inject(
  { charts: NAV_CHARTS, log: FlightLog },
  ({ charts, log }, ...frameworkArgs) => {},
);
di.scope(frameworkRequest); // the request's Scope, for code outside inject
```

`nexus` takes a live `Nexus`. The user creates it with `await Nexus.create(...)` and
disposes it after the server has stopped accepting requests. A container passed in after
disposal fails every request with 503 (section 3.6).

The export is named `nexus` in every package, so the guides read the same across
frameworks. `@nexusdi/vitest` differs because it has no request: it exports
`nexusFixtures` (section 8).

### 3.2 The request mapping

`NexusRequest` is empty until the application augments it (core spec §4.5). The adapter
cannot know its fields, so the user supplies the mapping:

```ts
type RequestOption<Input> = {} extends NexusRequest
  ? { request?: (input: Input) => NexusRequest | Promise<NexusRequest> }
  : { request: (input: Input) => NexusRequest | Promise<NexusRequest> };
```

When the application's `NexusRequest` has a required field, `request` is required at the
type level. When it has none, the adapter calls `createScope()` with no request, and core
throws `NEXUS_REQUEST_MISSING` only if a provider needs `REQUEST`.

The guides tell users to map to domain values (`mission`, a user id, a locale) and to keep
the framework's context object out of `NexusRequest`. A provider that receives Hono's `c`
or Express's `req` ties the service layer to one framework.

### 3.3 `inject`: typed handler dependencies

```ts
type Deps = Readonly<Record<string, Dep>>;
type Resolved<D extends Deps> = { -readonly [K in keyof D]: Resolve<D[K]> };

inject<const D extends Deps, R>(
  deps: D,
  handler: (deps: Resolved<D>, ...frameworkArgs: FrameworkArgs) => R,
): FrameworkHandler<R>;
```

`Dep` and `Resolve` are public core types (core spec §4.2), so `optional(T)` yields
`T | undefined`, `lazy(T)` yields `() => T` and `all(M)` yields `T[]`. The handler
destructures by name, which avoids the positional mistakes a tuple invites, and the
framework arguments follow unchanged.

A route handler that calls `scope.get(X)` works too, through `di.scope(...)`. The guides
show `inject` first and name `di.scope` as the way out for code that is not a handler.

`inject` does two things:

1. When called (at route definition), it checks every required and lazy entry against the
   container and throws when one has no visible provider. So a wrong token fails when the
   app starts, before the first request.
2. Per request, it resolves the record from the request's scope, then calls the handler.

Core's approved API has no call for either step. The adapters would have to rebuild
core's modifier rules from `get`, `has` and the public `kind` and `token` fields, and the
startup check would know only `has() === false`, without core's near-miss hints. So core
gains two methods, and the core spec is being amended with these signatures:

```ts
interface Scope {
  /** Resolves a record or tuple of deps, with the same rules as a factory's deps. */
  resolve<const D extends Deps | readonly Dep[]>(
    deps: D,
  ): { -readonly [K in keyof D]: Resolve<D[K]> };
}

interface Nexus {
  /**
   * Checks that every required and lazy entry has a provider visible from the root
   * module. Builds nothing. Throws one BlueprintError (NEXUS_BLUEPRINT_INVALID) holding a
   * NEXUS_MISSING_PROVIDER or NEXUS_NOT_VISIBLE error per failing entry.
   */
  validate(deps: Deps | readonly Dep[]): void;
}
```

Both methods are additive. Every adapter's `inject` calls them, so they are in core at
rc.0 (section 13).

### 3.4 Disposal

The adapter creates the scope before the handler runs and calls `[Symbol.asyncDispose]()`
exactly once, from the first of these signals:

| Framework    | Response done                                    | Client gone                              |
| ------------ | ------------------------------------------------ | ---------------------------------------- |
| Hono         | the wrapped body stream ends, errors or cancels  | `c.req.raw.signal` aborts                |
| React Router | the wrapped body stream ends, errors or cancels  | `request.signal` aborts                  |
| Express      | `res` emits `close`                              | `res` emits `close`                      |
| Fastify      | `reply.raw` emits `close`                        | `reply.raw` emits `close`                |
| Any          | a response with no body: at once, after `next()` | the signal fired while `createScope` ran |

Node's `http.ServerResponse` emits `close` after `finish` on a normal response and alone
on an abort, so one listener covers both cases for Express and Fastify.

For Hono and React Router the adapter replaces the response with one whose body is a
pass-through `ReadableStream` over the original body. The wrapper's `pull` reads the
original reader; `done`, a read error and the consumer's `cancel` each dispose the scope.
The new response keeps the original status and headers. A `null` body, a `HEAD` request and a 204 or
304 dispose after `next()` returns.

Core makes scope disposal idempotent (core spec §3.6). The adapter also wraps the dispose
call in a `once`, so its listeners call core one time per request. A disposal error is passed to `log` and
never thrown, because the response has already been sent and a throw would become an
unhandled rejection.

`await using` appears in two places: in `@nexusdi/vitest`'s fixtures, and in the guides'
server entry, where the user writes `await using ship = await Nexus.create(...)` around
the server's lifetime. The request path cannot use it, because the scope outlives the
middleware's frame.

Core requires Node 22, which has `Symbol.asyncDispose` but no `await using` syntax
(`SyntaxError` on 22.23.2). The adapters' sources use `await using` only in tests. The
build targets ES2022, so TypeScript lowers any use in `src`.

Shutdown order: the guides stop the server first (`server.close()`, Fastify's `close()`,
which runs `onClose` after in-flight requests drain), then dispose the container. A
request that arrives after disposal starts gets a 503.

### 3.5 Ambient scope

With `ambient: true`, the adapter runs the rest of the request inside
`ship.runInScope(scope, ...)`, so `ship.currentScope()` works in code that has no access to
the request. The container needs a `scopeContext`:

- Node, Bun and Deno: `nodeScopeContext()` from `@nexusdi/core/node`. Bun and Deno
  implement `AsyncLocalStorage` through `node:async_hooks`.
- Cloudflare Workers: the same, with `nodejs_compat` (on by default from compatibility
  date 2026-08-04) or `nodejs_als`.

The runtime job (section 11.3) runs the Hono integration test with `ambient: true` on each
runtime, and `/runtimes/` states the result.

`ambient` defaults to `false`. `inject` covers handlers, and the adapter calls
`AsyncLocalStorage.run` only when the user asks for it. A container without a `scopeContext`
fails the first ambient request with core's `NEXUS_NO_SCOPE_CONTEXT`, whose message names
`nodeScopeContext()`; the adapter logs it like any other `NexusError` (section 3.6).

### 3.6 Error mapping

The adapter catches a `NexusError` from `createScope`, `scope.resolve` or `runInScope`. It
leaves every other error, and every `NexusError` a handler throws itself, to the
framework's error pipeline.

| Code raised in adapter code                                                              | Status | Log level |
| ---------------------------------------------------------------------------------------- | ------ | --------- |
| `NEXUS_DISPOSED` from `createScope`                                                      | 503    | warn      |
| `NEXUS_REQUEST_MISSING`                                                                  | 500    | error     |
| `NEXUS_PROVIDER_FAILED` from a scoped factory                                            | 500    | error     |
| `NEXUS_MISSING_PROVIDER`, `NEXUS_NOT_VISIBLE`, `NEXUS_LOADED_AFTER_SCOPE` from `resolve` | 500    | error     |
| `NEXUS_NO_SCOPE_CONTEXT`                                                                 | 500    | error     |

The adapter logs the original error once, with its code and message, through the `log`
option. Then it raises the framework's own error type with the status, the status text as
its message (`Internal Server Error`, `Service Unavailable`) and the `NexusError` as
`cause`. So the user's error handler can read `error.cause.code`, and the framework's
default handler sends a body that contains nothing from core. The per-framework error type
is in each package's section.

A test per adapter sends a request that triggers `NEXUS_MISSING_PROVIDER` and asserts that
the body contains neither `NEXUS_` nor the token's description.

### 3.7 Shared code

The code the adapters would share:

1. Dep resolution and startup validation: in core, as `resolve` and `validate`.
2. The body wrapper of section 3.4: used by Hono and React Router, about 40 lines.
3. The status mapping of section 3.6: a function from a `NexusError` code to 500 or 503,
   about 10 lines.
4. The `RequestOption` type: 4 lines.

The remainder does not justify another published package, with its own bootstrap and an
exact pin in four dependents. A private workspace
package does not work either, because the build is plain `tsc` and a published `dist`
cannot import an unpublished package.

So items 2 and 3 live in each adapter at `src/internal/`. The two copies of
`dispose-with-body.ts` are byte-identical, and a repo-check,
`tools/repo-checks/src/adapter-shared-copies.test.ts`, fails when they differ. The fallow
duplicates gate ignores exactly those files, through `.fallowrc.jsonc`.

## 4. `@nexusdi/hono`

### 4.1 API

```ts
import { Nexus } from '@nexusdi/core';
import { nodeScopeContext } from '@nexusdi/core/node';
import { nexus, type NexusEnv } from '@nexusdi/hono';
import { Hono } from 'hono';

await using ship = await Nexus.create(Meridian, {
  scopeContext: nodeScopeContext(),
});

const di = nexus(ship, {
  request: (c) => ({
    mission: {
      id: c.req.header('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
  }),
});

export const bridge = new Hono().use(di.middleware).get(
  '/course/:to',
  di.inject({ charts: NAV_CHARTS, log: FlightLog }, ({ charts, log }, c) => {
    log.record(`plotting ${c.req.param('to')}`);
    return c.json(charts.plot(c.req.param('to')));
  }),
);
```

Exports:

- `nexus(ship, options): NexusHono`, where `NexusHono` is
  `{ middleware: MiddlewareHandler<NexusEnv>; inject; scope(c: Context): Scope }`.
- `type NexusEnv = { Variables: { nexus: Scope } }`.
- `type NexusHonoOptions`: `request`, `ambient`, `log`.

The middleware sets `c.var.nexus`. Hono merges the middleware's `Env` into a chained app
(`new Hono().use(di.middleware).get(...)`), so `c.var.nexus` is typed downstream. A
separate `app.use(di.middleware)` statement does not retype `app`; the guide shows the
chained form and `new Hono<NexusEnv>()` for apps that register routes in separate
statements. The package does not augment `ContextVariableMap`: Hono's docs warn that a
global augmentation types `c.get` in routes where the middleware never ran.

`inject` returns a `Handler` whose context is `Context<NexusEnv>`. `di.scope(c)` throws
`[@nexusdi/hono] no scope on this request: register di.middleware before this route`
when the middleware has not run.

### 4.2 Request flow

```ts
createMiddleware<NexusEnv>(async (c, next) => {
  const scope = await openScope(ship, options, c); // maps errors, section 3.6
  const dispose = once(() => scope[Symbol.asyncDispose]().catch(log));
  if (c.req.raw.signal.aborted) return void (await dispose());
  c.req.raw.signal.addEventListener('abort', dispose, { once: true });
  c.set('nexus', scope);
  await (options.ambient ? ship.runInScope(scope, next) : next());
  c.res = disposeWithBody(c.res, dispose, c.req.method);
});
```

Hono's `next()` never throws. An error in a handler goes to `app.onError`, which sets
`c.res` before `next()` resolves, so the wrapper also covers error responses.
`@hono/node-server` 2.1.1 aborts `c.req.raw.signal` when the socket closes before the
response finishes.

A WebSocket upgrade (`upgradeWebSocket`) returns a 101 with no body, so the scope is
disposed when the upgrade completes. The guide states that a WebSocket handler must not
hold scoped instances.

### 4.3 Errors

The adapter throws `new HTTPException(status, { message: statusText, cause })` from
`hono/http-exception`. Hono's default `onError` sends `err.getResponse()`, a text body
with the status text. `log` defaults to `console.error`.

### 4.4 Runtimes

The package imports `hono` and `@nexusdi/core` only, with no `node:` module. A repo-check
extends core's node-only rule to `libs/hono/src`. Supported: Node 22 and later through
`@hono/node-server`, Bun, Deno, and Cloudflare Workers. `ambient: true` needs
`AsyncLocalStorage` (section 3.5).

### 4.5 Peers

```json
"peerDependencies": { "@nexusdi/core": "0.4.0-rc.N", "hono": "^4.0.0" }
```

`createMiddleware`, `c.var` and `HTTPException` exist from 4.0. The `adapter-peers` job
(section 11.4) runs the integration test against `hono@4.0.0` and proves the floor.

### 4.6 Tests

- Unit, through `app.request()`: scope per request, `c.var.nexus`, `inject` resolution of
  each modifier, the startup check, the error table of section 3.6, `di.scope` without the
  middleware.
- Type tests (`*.test-d.ts`): `inject`'s record types, `c.var.nexus` after chaining,
  `request` required when `NexusRequest` has a required field.
- Integration (`src/hono.e2e.test.ts`), a real `@hono/node-server` on port 0, with a
  `trace` callback that records `scope:create` and `scope:dispose`:
  - a JSON response disposes the scope after the body is sent;
  - a `streamSSE` response keeps the scope open until the stream closes, asserted with a
    scoped `FlightLog` that the stream reads after `next()` returned;
  - a client abort mid-stream disposes the scope;
  - a handler that throws disposes the scope and returns 500;
  - 50 concurrent requests produce 50 `scope:create` and 50 `scope:dispose` events and
    no shared scoped instance;
  - `ambient: true` with `nodeScopeContext()` resolves `ship.currentScope()` inside a
    service call.
- The runtime job runs the same integration file on Bun, Deno and workerd (section 11.3).

## 5. `@nexusdi/express`

### 5.1 API

```ts
import { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/express';
import express from 'express';

await using ship = await Nexus.create(Meridian);

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
    { charts: NAV_CHARTS, log: FlightLog },
    ({ charts, log }, req, res) => {
      log.record(`plotting ${req.params.to}`);
      res.json(charts.plot(req.params.to));
    },
  ),
);
```

Exports: `nexus(ship, options): NexusExpress`
(`{ middleware: RequestHandler; inject; scope(req: Request): Scope }`), and
`NexusExpressOptions`.

`req.nexus` is typed through the global augmentation that `@types/express` supports:

```ts
declare global {
  namespace Express {
    interface Request {
      nexus?: Scope;
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
  const scope = await openScope(ship, options, req); // a rejection goes to next(err)
  const dispose = once(() => scope[Symbol.asyncDispose]().catch(log));
  if (res.closed) return void (await dispose());
  res.once('close', dispose);
  req.nexus = scope;
  options.ambient ? ship.runInScope(scope, next) : next();
};
```

Express 5 forwards a rejected middleware promise to `next(err)`. `inject` returns an
async handler, so a rejection there reaches the error pipeline too. `res.closed` covers a
client that left while `createScope` ran. Express calls downstream handlers synchronously
from `next`, so `runInScope(scope, next)` gives them the scope through
`AsyncLocalStorage`.

### 5.3 Errors

The adapter passes a `NexusHttpError` (exported) to `next`: an `Error` with `status` and
`statusCode` set to 500 or 503, `expose: false`, the status text as message and the
`NexusError` as `cause`. Express's final handler sends the status text in production. In
development it sends `err.stack`, which is the wrapper's stack and holds no core message.
`log` defaults to `console.error`.

### 5.4 Runtime

Node 22 and later. The package imports types from `express` and runs no Node-specific
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
  requests counted through `trace`, `ambient: true`, and the no-leak body check.

## 6. `@nexusdi/fastify`

### 6.1 API

```ts
import { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/fastify';
import Fastify from 'fastify';

const ship = await Nexus.create(Meridian);
const di = nexus(ship, {
  request: (req) => ({
    mission: {
      id: String(req.headers['x-mission-id'] ?? 'survey-7'),
      target: 'Kepler-442b',
    },
  }),
});

const bridge = Fastify({ logger: true });
bridge.addHook('onClose', () => ship[Symbol.asyncDispose]());
await bridge.register(di.plugin);

bridge.get<{ Params: { to: string } }>(
  '/course/:to',
  di.inject({ charts: NAV_CHARTS, log: FlightLog }, ({ charts, log }, req) => {
    log.record(`plotting ${req.params.to}`);
    return charts.plot(req.params.to);
  }),
);
```

Exports: `nexus(ship, options): NexusFastify`
(`{ plugin: FastifyPluginAsync; inject; scope(req: FastifyRequest): Scope }`), and
`NexusFastifyOptions`.

The plugin is wrapped with `fastify-plugin` (`name: '@nexusdi/fastify'`,
`fastify: '5.x'`), which sets `skip-override`, so the hook and the decoration apply to
the whole app. A user who wants the
scope only inside one encapsulated context registers `di.plugin` there with
`{ encapsulate: true }`, an option the plugin passes to `fastify-plugin`.

```ts
declare module 'fastify' {
  interface FastifyRequest {
    nexus: Scope | null;
  }
}
```

Fastify 5 rejects a reference-type `decorateRequest` value, so the plugin decorates with
`null` and assigns per request, as Fastify's docs recommend.

### 6.2 Request flow

The plugin registers a callback-style `onRequest` hook. The callback style is what lets
`runInScope(scope, done)` carry the scope through the rest of the lifecycle, the pattern
`@fastify/request-context` uses:

```ts
fastify.addHook('onRequest', (req, reply, done) => {
  openScope(ship, options, req).then((scope) => {
    const dispose = once(() =>
      scope[Symbol.asyncDispose]().catch((e) => req.log.error(e)),
    );
    if (reply.raw.closed) return void dispose();
    reply.raw.once('close', dispose);
    req.nexus = scope;
    options.ambient ? ship.runInScope(scope, () => done()) : done();
  }, done);
});
```

The plugin does not use `onResponse` or `onRequestAbort` (section 1). It registers no
`onClose`: the container belongs to the user, and the guide registers
`ship[Symbol.asyncDispose]()` as an app-level `onClose`, which Fastify runs after
in-flight requests drain.

### 6.3 Errors

The adapter calls `done(error)` with a `NexusHttpError` (exported): `statusCode` 500 or
503, the status text as message, no `code` property, and the `NexusError` as `cause`.
Fastify's default handler serializes `code` when present, which is why the wrapper has
none. `log` defaults to `req.log.error` (or `req.log.warn` for 503), so the log line
carries Fastify's request id.

### 6.4 Runtime

Node 22 and later.

### 6.5 Peers and dependencies

```json
"peerDependencies": { "@nexusdi/core": "0.4.0-rc.N", "fastify": "^5.0.0" },
"dependencies": { "fastify-plugin": "^6.0.0" }
```

`fastify-plugin` is a regular dependency, as in every `@fastify/*` plugin. Its v6 notes
list no Fastify floor; the `adapter-peers` job runs against `fastify@5.0.0` with
`fastify-plugin@6.0.0` and settles it.

### 6.6 Tests

- Unit through `fastify.inject()`: the scope per request, `inject`, the error table, and
  the `encapsulate` option.
- Integration (`src/fastify.e2e.test.ts`), `listen({ port: 0 })`: a JSON response, a
  `reply.send(stream)` response, a client abort mid-stream (the case `onResponse`
  misses), a throwing handler, 50 concurrent requests counted through `trace`,
  `ambient: true`, `close()` after in-flight requests with the container disposed in
  `onClose`, and the no-leak body check including the absence of a `code` field.

## 7. `@nexusdi/react-router`

### 7.1 Target

The package supports React Router 7.9 and later with `future.v8_middleware: true`, and
React Router 8, where middleware is always on. The middleware API is the same in both
(`createContext`, `RouterContextProvider`, the `middleware` route export). 7.x is still
maintained on npm's `version-7` tag.

`examples/react-ssr` runs 7.18.4 with `v8_middleware` today, and a dependabot branch
moves it to 8.4.0. This spec moves the example to 8.x and to this adapter (section 12.3).

### 7.2 API

```ts
// app/nexus.server.ts
import { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/react-router';
import { Meridian } from './ship/meridian';

const ship = await Nexus.create(Meridian);
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
import { di } from '../nexus.server';

export const loader = di.inject(
  { charts: NAV_CHARTS, log: FlightLog },
  ({ charts, log }, { params }: Route.LoaderArgs) => {
    log.record(`plotting ${params.to}`);
    return { course: charts.plot(params.to) };
  },
);
```

Exports:

- `nexus(ship, options): NexusRouter`, with
  `{ middleware: MiddlewareFunction<Response>; inject; scope(context): Scope }`.
- `NEXUS_SCOPE`, the `RouterContext<Scope>` the middleware sets. Route tests use it with
  `createRoutesStub` and `new RouterContextProvider(new Map([[NEXUS_SCOPE, scope]]))`.
- `NexusRouterOptions`.

`inject` accepts any args object with a `context: Readonly<RouterContextProvider>`, so it
wraps loaders, actions and other middleware, typed by the route's generated `Route`
types. Components get data through `useLoaderData` and never see the container, because
components also run in the browser.

React Router's Vite plugin removes the server-only route exports (`loader`, `action`,
`middleware`) and the `.server` modules they import from the client build, so core and
the container stay out of the browser bundle. The integration test asserts that the
client build contains no `@nexusdi/core` module.

`import.meta.hot?.dispose` disposes the old container when Vite re-evaluates the module
in development. Without it, each edit leaks a container.

### 7.3 Request flow

```ts
async ({ request, context, params }, next) => {
  const scope = await openScope(ship, options, { request, params }); // throws a Response
  const dispose = once(() => scope[Symbol.asyncDispose]().catch(log));
  if (request.signal.aborted) return void (await dispose());
  request.signal.addEventListener('abort', dispose, { once: true });
  context.set(NEXUS_SCOPE, scope);
  const response = await (options.ambient
    ? ship.runInScope(scope, next)
    : next());
  return disposeWithBody(response, dispose, request.method);
};
```

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
`entry.server.tsx` for users who want one log pipeline, and the adapter's `log` defaults to
`console.error`.

### 7.5 Runtimes

The package uses web APIs only and imports no `node:` module. Tested on Node through
`@react-router/node` and `react-router-serve`. React Router's own adapters for Workers,
Deno and Bun take the same middleware; `/runtimes/` lists them as not tested.

### 7.6 Peers

```json
"peerDependencies": { "@nexusdi/core": "0.4.0-rc.N", "react-router": "^7.9.0 || ^8.0.0" },
"engines": { "node": ">=22" }
```

React Router 8 itself requires Node 22.22, which npm reports from its own manifest.

### 7.7 Tests

- Unit: the middleware and `inject` called with a hand-built `RouterContextProvider` and
  a `next` that returns a streaming `Response`.
- Type tests: `inject` over `Route.LoaderArgs`-shaped args.
- Integration (`src/react-router.e2e.test.ts`): a fixture app under `src/__fixtures__/app`
  built once with `react-router build` and served by `react-router-serve` on port 0. A
  route with a deferred `<Await>` value that reads a scoped `FlightLog` after a delay
  asserts the scope stays open until the stream ends. It also covers an aborted document
  request, a loader that throws, `.data` requests, 50 concurrent requests counted through
  `trace`, and the client-bundle check of section 7.2.
- The fixture app's `react-router.config.ts` sets `future.v8_middleware: true` when the
  installed React Router is 7.x, and nothing on 8.x. The `adapter-peers` job runs the
  integration test on each supported line (section 11.4).

## 8. `@nexusdi/vitest`

### 8.1 API

```ts
// test/fixtures.ts
import { nexusFixtures } from '@nexusdi/vitest';
import { test as base } from 'vitest';

export const test = base.extend(
  nexusFixtures(Meridian, {
    setup: (builder) =>
      builder
        .override(NAV_CHARTS, { useValue: fakeCharts })
        .override(ReactorCore, { useClass: FakeReactor }),
    create: { onInit: false },
  }),
);
```

```ts
// bridge.test.ts
import { describe, expect } from 'vitest';
import { test } from './fixtures';

test('plots a course with the fake charts', ({ nexus }) => {
  expect(nexus.get(Bridge).charts).toBe(fakeCharts);
});

describe('on a survey mission', () => {
  test.override({
    nexusRequest: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
  });

  test('reads the mission from the scope', ({ nexusScope }) => {
    expect(nexusScope.get(MISSION).id).toBe('survey-7');
  });
});
```

Fixtures, all test-scoped and lazy:

| Fixture        | Type                                                              | Default                     |
| -------------- | ----------------------------------------------------------------- | --------------------------- |
| `nexusSetup`   | `(builder: TestingContainerBuilder) => TestingContainerBuilder`   | `options.setup` or identity |
| `nexusRequest` | `NexusRequest \| undefined`                                       | `undefined`                 |
| `nexus`        | `Nexus`, from `createTestingContainer(root)` through `nexusSetup` | built on first use          |
| `nexusScope`   | `Scope`, from `nexus.createScope({ request: nexusRequest })`      | built on first use          |

Every fixture name starts with `nexus`, so none collides with a user's `request` or
`container` fixture. `test.override` (Vitest 4.1 and later) replaces `nexusSetup` or
`nexusRequest` for a suite, which is how one file tests several override sets.

### 8.2 Disposal

```ts
nexus: async ({ nexusSetup }, use) => {
  await using ship = await nexusSetup(createTestingContainer(root)).create(options.create);
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

The package has no ambient mode in 0.4. A fixture's `use()` does not wrap the test body's
async context, so an ambient scope would need an `aroundEach` hook. A later release can
add `useAmbientScope()` on top of `aroundEach` if users ask.

### 8.3 Peers

```json
"peerDependencies": { "@nexusdi/core": "0.4.0-rc.N", "vitest": "^4.1.0 || ^5.0.0" }
```

4.1 added `test.override` and the builder form of `test.extend`; the object form this
package uses is the same in 4.1 and 5.0. The workspace runs 4.1.9, and CI runs the
package's tests on each supported line (section 11.4).

### 8.4 Tests

The package tests itself with its own fixtures: an override reaches `nexus`,
`test.override` swaps the setup for a suite, the teardown disposes the scope before the
container (asserted with `trace` events), a failing test still disposes, a disposal error
fails the test (asserted through a nested Vitest run with `startVitest` and a fixture
project), `containerScope: 'file'` shares one container across a file's tests, and
`nexusRequest` reaches `REQUEST`. Type tests cover the fixture types in `test` callbacks.

## 9. Package layout and conventions

Each package is generated with
`npx nx g @nx/js:library libs/<name> --bundler=tsc --unitTestRunner=vitest`, then aligned
with `libs/core`: the generator's defaults are deleted where core differs, and lint,
format and type generation are wired before the second source file.

```
libs/<name>/
  src/
    index.ts
    nexus.ts               the adapter (nexusFixtures.ts for vitest)
    internal/              open-scope.ts, status.ts, dispose-with-body.ts (hono, react-router)
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
  "engines": { "node": ">=22" },
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
  "devDependencies": { "@hono/node-server": "^2.1.1", "hono": "^4.13.8" },
  "keywords": ["nexusdi", "dependency-injection", "hono", "hono-middleware"],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/NexusDI/core.git",
    "directory": "libs/hono"
  },
  "publishConfig": { "access": "public", "provenance": true }
}
```

The fields follow `libs/core` (exports with the `@nexusdi/source` condition first,
`files`, `publishConfig`, ESM only, tsc build) and the libraries repo's
`nestjs-correlation-id` (caret peers on a framework's major, caret dev dependencies, an
optional peer in `peerDependenciesMeta`). `@nexusdi/core` is the one exact pin, as in the
libraries repo's adapter packages.

The workspace wiring: the five folders under `libs/*` join `workspaces`, `tsconfig.json`
`references` and `release.projects` without an edit, because both globs cover `libs/*`.
`commitlint.config.js` adds the scopes `hono`, `express`, `fastify`, `react-router` and
`vitest`, which `commitlint-scope-enum.test.ts` requires.

Each README follows `nestjs-correlation-id`'s sections: badges, title, intro, Why,
Install, Getting started, Typed handlers (`inject`), When the scope is disposed, Errors,
Ambient scope (not in vitest), Requirements (a table of the peer ranges and Node), Change
Log, Contributing, Author, License. It opens with the same RC info box as core's README
until 0.4.0 final.

Every README fence that is TypeScript runs as a doctest, through
`docExamples()` from `tools/doc-examples` and the `ts @import.meta.vitest` fence marker,
with `// -> value` claims turned into assertions. The server examples use each
framework's in-process request API (`app.request()`, `fastify.inject()`, a port-0
Express server and `fetch`, React Router's `createRequestHandler` with a `Request`), so a
README fence runs without a network. `doc-twoslash` type-checks the same fences.

## 10. Release

### 10.1 Versions and peers

Each package is an independent `nx release` project. The Release workflow's single
`specifier` applies to every released project, so every run moves the adapters with core:
`premajor --preid rc` takes all of them to `0.4.0-rc.0`, `prerelease` takes `0.4.0-rc.K`
to `0.4.0-rc.K+1`, and `patch` takes them to `0.4.0` at final. The version numbers stay
equal to core's.

A new package has no release tag, and `fallbackCurrentVersionResolver: "disk"` makes nx
read its base version from `package.json`. So each adapter, and `@nexusdi/codemod`, carries
core's current version (`0.3.1`) on disk until rc.0, and pins `@nexusdi/core` at `0.3.1`,
which npm workspaces link to `libs/core`. The rc.0 run versions them to `0.4.0-rc.0` with
core. `0.0.0` would not work: the zero-major remap turns `premajor` into `preminor` and
the result would be `0.1.0-rc.0`. No adapter is ever published at `0.3.1`.

`versionPrefix: ""` and `updateDependents: "always"` rewrite the exact `@nexusdi/core`
pin in each adapter on every core release. Whether `nx release version` rewrites
`peerDependencies` the way it rewrites `dependencies` is the first thing the
implementation plan checks, with `nx release --dry-run`, before the first adapter merges.
A repo-check, `adapter-core-peer.test.ts`, fails when an adapter's `@nexusdi/core` peer
differs from `libs/core/package.json`'s version, so a missed rewrite fails CI before a
publish.

### 10.2 Bootstrap

npm configures a trusted publisher only for a package that exists (`RELEASING.md`). The
five adapters and `@nexusdi/codemod` are first versioned by the rc.0 run, and the
publish step skips a package npm does not know (section 10.3). The owner then publishes
each one by hand from its release tag:

1. `git checkout '@nexusdi/<name>@0.4.0-rc.0'`.
2. `npx nx build <name>` and `npm run verify:packaging`.
3. From `libs/<name>`: `npm publish --access public --no-provenance --otp=<code>`. No
   `--tag` is passed, so npm tags the version `latest`, which is also what the workflow
   would choose for a package with no stable version.
4. Configure the trusted publisher on npmjs.com (`NexusDI` / `core` / `release.yml` /
   `npm publish`).

The tag exists already, because the rc.0 run pushed it. From rc.1 on the workflow
publishes every package with provenance. The bootstrap versions have no provenance
attestation, as `RELEASING.md` already states for a manual publish.

### 10.3 `release.yml`

The "Resolve npm dist-tag" step and the "Publish to npm" step become one step that loops
over the released packages, in dependency order: `@nexusdi/core` first, then
`@nexusdi/codemod`, then the adapters. So an adapter's exact core peer is always on npm
before the adapter.

For each package, the step reads `name` and `version` from `libs/<dir>/package.json` and
runs `npm view <name> versions --json`, which needs no token for a public package:

| npm knows the package | Its versions include a stable one | Version being published | Result                                           |
| --------------------- | --------------------------------- | ----------------------- | ------------------------------------------------ |
| no (E404)             | n/a                               | any                     | skip, with a notice to bootstrap (10.2)          |
| yes                   | any                               | already published       | skip, so a rerun is idempotent                   |
| yes                   | no                                | any                     | `nx release publish --projects <p> --tag latest` |
| yes                   | yes                               | prerelease              | `nx release publish --projects <p> --tag next`   |
| yes                   | yes                               | stable                  | `nx release publish --projects <p> --tag latest` |

A stable version is one with no `-` after `X.Y.Z`, the test the current step already
applies to the version nx wrote. With `dry-run`, the step prints the table's decision for
each package and publishes nothing.

```yaml
- name: Publish to npm
  if: ${{ !inputs.dry-run }}
  env:
    PROJECTS: ${{ steps.projects.outputs.projects }}
  run: node scripts/publish-released.mjs
```

`scripts/publish-released.mjs` holds the loop. It takes the resolved project list (empty
means every project under `libs/*`), orders it by the workspace dependency graph, and
applies the table. A repo-check test drives it against a stubbed `npm view` and a
stubbed `nx`, one case per table row.

What a user gets, checked with npm 11.19.0. A stand-in package with an exact prerelease
peer (`react-router@8.0.0-pre.1`, while `latest` is 8.4.0) behaves like an adapter with
its `@nexusdi/core@0.4.0-rc.N` peer while core's `latest` is 0.3.1:

- In a project with no `@nexusdi/core`, `npm i @nexusdi/hono` installs the adapter's
  `latest`, `0.4.0-rc.N`, and auto-installs the peer at exactly `0.4.0-rc.N` into the top
  of `node_modules`. The version on `latest` does not matter for an exact spec. npm does
  not add the peer to `package.json`.
- In a project whose `package.json` has `@nexusdi/core` at 0.3.x, the same command fails
  with `ERESOLVE`, naming both versions. The user upgrades core first.
- `npm i @nexusdi/core@next @nexusdi/hono` resolves, because one Release run publishes
  core on `next` and the adapter on `latest` at the same `0.4.0-rc.N`. This case was run
  from a project that already had the older line installed.
- At 0.4.0 final every package publishes a stable version with `latest`. After that the
  adapters have a stable version, so their prereleases go to `next` like core's.

Every README and guide therefore shows the install line with both packages, and the
Getting started section says why. pnpm and Yarn were not checked. The explicit install
line does not depend on a package manager installing peers.

The `RELEASING.md` changes:

- Replace the paragraph under "npm dist-tag" with:

  > The publish step picks a dist-tag per package. A stable version publishes with
  > `latest`. A prerelease publishes with `next` when npm already has a stable version of
  > the package, and with `latest` when it has none, because the newest RC is then the
  > version a user should get. `@nexusdi/core` has 0.3.1, so its RCs go to `next`. Each
  > adapter's first version is an RC, so its RCs go to `latest` until 0.4.0. The step
  > publishes `@nexusdi/core` first, so an adapter's exact core peer is always on npm.
  > `scripts/publish-released.mjs` holds the rule.

- Replace "1. Configure a trusted publisher for @nexusdi/core" with "1. Bootstrap a new
  package", which lists the four steps of section 10.2, keeps the existing text on
  `--no-provenance` and `--otp`, and says that the Release run skips a package npm does not
  know yet and prints a notice naming it. The section also says that a new package
  carries core's current version on disk and is versioned with core by the next run
  (section 10.1).

### 10.4 Final

Core spec §14 lists three conditions for 0.4.0 final. They apply to the adapters too: an
RC with a breaking change to any adapter restarts the four-week count, and an
`rc-blocker` on an adapter blocks final. This spec adds a fourth condition: on the final
commit, every `adapter-peers` and `adapter-runtimes` leg passes, and every adapter guide
is live under `/next/`.

## 11. Verification

### 11.1 `verify-packaging`

`scripts/verify-packaging.mjs` adds the five packages to `LIBS` and their framework peers
to the throwaway consumer's install (`hono`, `@hono/node-server`, `express`,
`@types/express`, `fastify`, `react-router`, `vitest`). The consumer:

- imports every export of every adapter under `moduleResolution` `nodenext` and
  `bundler`, with `skipLibCheck: false`;
- runs one request through each server adapter from the packed build (`app.request()`,
  `fastify.inject()`, a port-0 Express server, React Router's `createRequestHandler`);
- asserts each adapter's `@nexusdi/core` peer equals the packed core's version;
- asserts that the packed `dist` of `@nexusdi/hono` and `@nexusdi/react-router` contains
  no `node:` import;
- runs the existing tslib check over the new packages.

### 11.2 Type floor

The `types-floor` job (engine plan Task 36) compiles each adapter's type tests with
TypeScript 5.4 and with `tsgo`. A framework whose own declarations need a newer
TypeScript raises that adapter's floor, and its README's Requirements table states it.

### 11.3 Runtimes

A CI job, `adapter-runtimes`, runs `libs/hono`'s integration test on Bun, Deno and
workerd (through `@cloudflare/vitest-pool-workers` with `nodejs_compat`), with
`ambient: true`. It reads the Bun and Deno versions from
`examples/toolchain-matrix/toolchains.json`, so the toolchain matrix and this job test one
pinned version of each runtime. `/runtimes/` gains a row per adapter per runtime, naming
this job.

The toolchain matrix itself does not change. It proves that core compiles and runs under
each TypeScript toolchain, and the adapters add no decorator or emit concern.

### 11.4 Peer ranges

A CI job, `adapter-peers`, installs each leg's framework version over the workspace and
runs that adapter's unit, type and integration tests:

| Adapter                 | Legs                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| `@nexusdi/hono`         | `hono@4.0.0`, latest 4.x                                                   |
| `@nexusdi/express`      | `express@5.0.0`, latest 5.x                                                |
| `@nexusdi/fastify`      | `fastify@5.0.0` with `fastify-plugin@6.0.0`, latest 5.x with latest 6.x    |
| `@nexusdi/react-router` | `react-router@7.9.0` and latest 7.x, both with `v8_middleware`; latest 8.x |
| `@nexusdi/vitest`       | `vitest@4.1.0`, latest 4.x, latest 5.x                                     |

The workspace pins React Router 8, after `examples/react-ssr` moves, and Vitest 4.1.9, so
the `main` job covers one line of each and this job covers the rest. The floor legs prove
the lower bound of each peer range, including the unverified Fastify floor of
`fastify-plugin` 6.

### 11.5 Benchmarks

Benchmarks are #21 and out of scope for 0.4. Each adapter adds `createScope` per request
and, for Hono and React Router, one stream hop per body chunk. The benchmark spec should
measure each adapter against the bare framework on the same route; nothing here waits
for it.

## 12. Docs changes

### 12.1 Inventory

The docs spec's inventory (§4.3) changes as follows.

| #   | Path                                                                                 | Change                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14  | `/node-request-scopes/`                                                              | Keeps `nodeScopeContext`, `runInScope` and `currentScope` on a bare `node:http` server. Adds an H2 "With a framework" linking to the adapter pages. |
| 15  | `/react-router-ssr/`                                                                 | Rewritten around `@nexusdi/react-router`: `nexus.server.ts`, the root middleware, `inject` in loaders, route tests with `NEXUS_SCOPE`.              |
| 16  | `/testing/`                                                                          | Keeps `createTestingContainer`. Adds an H2 "With Vitest fixtures" that shows `nexusFixtures` and links to `/vitest/`.                               |
| 20  | `/scope-context/`                                                                    | Adds that Hono on Workers, Deno and Bun uses `nodeScopeContext()` through their `node:async_hooks`.                                                 |
| 23  | `/runtimes/`                                                                         | One row per adapter per runtime, from the `adapter-runtimes` job.                                                                                   |
| new | `/hono/`                                                                             | Platform guide: "Scope a Hono request".                                                                                                             |
| new | `/express/`                                                                          | Platform guide: "Scope an Express request".                                                                                                         |
| new | `/fastify/`                                                                          | Platform guide: "Scope a Fastify request".                                                                                                          |
| new | `/vitest/`                                                                           | Question page: "How do I get a container in every Vitest test?"                                                                                     |
| new | `/api-hono/`, `/api-express/`, `/api-fastify/`, `/api-react-router/`, `/api-vitest/` | Reference pages, one H2 per export.                                                                                                                 |

The counts become 43 documentation pages: 2 Start, 11 Concepts, 15 Guides, 6 Migration,
9 API. React Router keeps its existing slug so the link from the Scopes page stands.

Each platform guide has the same H2s: Install, Create the scope per request, Handlers
with `inject`, When the scope is disposed, Errors, Ambient scope, Shutdown. The request
handling is a doctested region in `examples/meridian/src/integrations/<framework>/`,
which runs it through the framework's in-process request API (docs spec §5.6). Server
startup code carries `no-run`.

### 12.2 Guards and domain

- G5 `doc-exports` resolves the new `@nexusdi/*` imports through each package's exports
  map with no change, since it reads the map.
- G10 `doc-export-coverage` extends from core's three entries to the five adapters' `.`
  entries.
- `doc-regions` adds `libs/<adapter>/README.md` as region sources.
- `docs-trigger` needs no change; `libs/**` already covers the packages.
- `examples/meridian` adds `hono`, `@hono/node-server`, `express`, `fastify` and
  `react-router` as dev dependencies at the workspace versions.

The docs spec's §7.1 vocabulary gains one row: "A server app: the bridge API, with the
route `GET /course/:to` and the header `x-mission-id`". Every guide uses it.

### 12.3 `examples/react-ssr`

The engine plan's Task 38 moves the example to the 0.4 API with one container in a
router context. The React Router adapter's plan then:

- moves the example to React Router 8 and removes `future.v8_middleware`;
- replaces `containerContext` and `containerMiddleware` with `di.middleware` and loaders
  written with `di.inject`;
- adds a scoped provider built from `REQUEST`, and deletes the module-level `let user`
  in `home.tsx`, which shares one user across requests;
- removes the `console.log` calls from the middleware;
- ports the route tests to `NEXUS_SCOPE`.

The codemod's end-to-end test takes the example's 0.3 state from git history (engine
plan Task 38), so this change does not touch the codemod fixtures.

### 12.4 Delivery

All five packages are in rc.0, so the docs spec's rc.0 list (§18.2) gains `/hono/`,
`/express/`, `/fastify/`, `/vitest/`, the five API pages, the Vitest H2 on `/testing/`,
the framework H2 on `/node-request-scopes/`, and `/react-router-ssr/`, which moves from
the RC window to rc.0. `/runtimes/` stays in the RC window; its adapter rows join it
there.

## 13. rc.0

rc.0 carries the core amendment of section 3.3 and all five adapters. The RC exists so
users can report problems before the API is final, and an adapter published late in the
window gets less of that feedback.

The implementation order, each step reusing the one before it:

1. Core's `resolve` and `validate`.
2. `@nexusdi/express`: `openScope`, the status mapping, `inject` and `close` disposal.
3. `@nexusdi/vitest`: independent of the server adapters.
4. `@nexusdi/fastify`: Express's `close` disposal plus the plugin wrapper.
5. `@nexusdi/hono`: the body wrapper and the `adapter-runtimes` job.
6. `@nexusdi/react-router`: the second copy of the body wrapper, the copies check, the
   move of `examples/react-ssr` to React Router 8, and the `/react-router-ssr/` rewrite.

The rc.0 checklist of core spec §14 gains:

- the five adapters and their guides and API pages, section 12.4;
- the bootstrap of the five adapters and `@nexusdi/codemod`, section 10.2;
- `scripts/publish-released.mjs` and the `RELEASING.md` changes, section 10.3;
- a passing `adapter-peers` and `adapter-runtimes` run on the release commit, section 11.

## 14. Ecosystem listings

Each listing links a stable version, so the pull requests are prepared during the RC and
opened after 0.4.0 final.

| Package                 | Listing                                                                                                                             | Process                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@nexusdi/hono`         | hono.dev "Third-party Middleware" (`https://hono.dev/docs/middleware/third-party`)                                                  | A pull request to the site's repository. The page states no criteria (unverified). The `honojs/middleware` monorepo is not a target, because it takes over the package.        |
| `@nexusdi/fastify`      | `docs/Guides/Ecosystem.md`, Community section, in `fastify/fastify`                                                                 | A pull request with ``- [`@nexusdi/fastify`](url) description`` in alphabetical order, which `lint-ecosystem.js` checks. Needs docs and tests, which Write-Plugin.md requires. |
| `@nexusdi/react-router` | reactrouter.com community resources                                                                                                 | Unverified whether a listing exists; the implementation plan checks at launch.                                                                                                 |
| `@nexusdi/vitest`       | `awesome-vitest`                                                                                                                    | Unverified; the plan checks at launch.                                                                                                                                         |
| all                     | npm keywords (`hono-middleware`, `fastify-plugin`, `express-middleware`, `react-router`, `vitest`) and the docs `/comparison/` page | In each `package.json`, and a `/comparison/` row on framework support.                                                                                                         |

Express gets no listing. Its middleware page takes no new entries
(`expressjs/expressjs.com#2375`), so `@nexusdi/express` reaches users through npm search,
the docs and the launch post.

The launch post (docs spec §6.2) lists the five packages with a link to each guide.

## 15. Out of scope

- Adapters for other frameworks (NestJS, Koa, Elysia, h3, Next.js route handlers, Astro).
  The shape of section 3.1 carries over to each.
- WebSocket and server-sent-event connections that outlive a request's scope beyond the
  stream disposal of section 3.4.
- An ambient scope in `@nexusdi/vitest`.
- Owning the container inside an adapter, such as a Fastify plugin that calls
  `Nexus.create` itself.
- Nested scopes, which core 0.4 does not have.
- JSR publication for Deno users.
- Benchmarks (#21).

## 16. Open questions

None. The owner decided D1 to D6 of the first draft, and section 2.1 records each answer.
