# Disposing an adapter

Status: decided, 2026-10-28. The architect drafted it and the tech lead ruled on it the
same day. Section 7 records the rulings. No question is open.

Packages: `@nexusdi/express`, `@nexusdi/fastify`, `@nexusdi/hono` and
`@nexusdi/react-router`. Each changes its `nexus.ts` and its byte-identical copy of
`src/internal/request-scope.ts`.

Depends on `specs/2026-09-23-integrations-design.md`: decision D1 (the function form),
section 3.6 (the status and log rules, which section 3 here amends) and section 3.7
(the shared copy). All three are done on `origin/release/0.4`.

## 1. The gap

`nexus(ship)` takes a `Nexus` or a function that builds one. `containerOf(source)` in
`request-scope.ts` memoises the function's successful build for the life of the adapter
and drops only a rejected one. The adapter holds the only reference to a container it
built, and no adapter method reaches it, so:

- No one disposes that container. A Node server on the function form cannot run its
  providers' disposers at shutdown, and the docs' shutdown sections cover the live form
  only.
- A dev server that re-evaluates the module (Vite HMR in React Router) creates a new
  adapter and a new container on each edit. The old container never closes, so each
  edit leaks its pools and timers. The live form has the
  `import.meta.hot?.dispose(() => ship[Symbol.asyncDispose]())` line; the function
  form has nothing to call.
- A test that builds an adapter per test over the function form leaks a container per
  test.

The Meridian demo found the gap. Its bridge console uses the live form and needs the
HMR line above for the same reason.

## 2. Options considered

1. Reset on the handle (`di.reset()`): drop the memo so the next request builds again.
   It leaves the old container undisposed, so it fixes none of the three cases above.
2. Key the memo on the source function. A reload passes a new function, so the key
   never matches, and two adapters over one function would share a container that
   neither owns.
3. React to the Nexus being disposed: rebuild when the cached container throws
   `NEXUS_DISPOSED`. A graceful shutdown disposes the container and then still answers
   late requests, so this rebuilds a container during shutdown. Core also exposes no
   disposed flag, so the adapter would learn it only from a failed request.
4. Expose the built container (`di.container()`) for the user to dispose. Ownership
   splits between the adapter and the user, and the user inherits the race with a
   build in flight.
5. Make the adapter disposable. The adapter disposes what it built; the caller owns a
   container it passed in.

Option 5 is the decision. Core and `existingScope` already apply the same ownership
rule: whoever creates an object disposes it.

## 3. The API

Each adapter's handle (`NexusRouter`, `NexusExpress`, `NexusFastify`, `NexusHono`)
gains `[Symbol.asyncDispose](): Promise<void>`. A call does the following, in order:

1. It closes the adapter. A request's first use of its scope after that, a lazy
   section's load and a deps check each reject with the adapter's new
   `AdapterDisposedError` ("the adapter was disposed"). The request answers 503, and
   `log` gets the error at warn level with the phase of the step that asked (`scope`,
   `load` or `validate`). A request that resolves nothing answers as before, unless
   `scopes` is set: then the middleware creates the scope at once, and the request
   answers 503.
2. With the function form, it waits for a build in flight, then disposes the container
   that build returned. A rejected build leaves nothing to dispose. After the close, the
   adapter never calls the function again, so a build that rejects after the close
   does not start a rebuild.
3. With the live form, it disposes nothing. The container belongs to the caller. A
   request whose scope exists before the close keeps resolving from it.

A second call returns the first call's promise, rejected or not. A disposer error of
the container rejects that promise, and the adapter does not log it.

The function form must return a container that nobody else owns, because the adapter
disposes whatever the function returns. `nexus(() => shared)` over a shared container
disposes it with the adapter.

### 3.1 The gate

`containerOf(source)` returns the container getter with a `close()` method on it. After
`close()`, the getter rejects with `AdapterDisposedError`. `requestScope`, the section
load and `validator` all call the getter first, so the gate covers the three paths.
`adapterCore` returns `dispose`, which calls `close()`, and each handle's
`[Symbol.asyncDispose]` calls it. The `loader` and `validator` caches are
WeakMaps keyed by the `Nexus`; `close()` drops the adapter's reference to it, so the
entries go with the container and nothing clears them.

`statusOf` maps `AdapterDisposedError` to 503 with `instanceof` on the adapter's own
class. This amends the mapping list of integrations section 3.6. The file still
compares one core code (`NEXUS_DISPOSED`), as P1 allows. `logLevel` already gives warn
to any 503 that is not a `ContainerBuildError`. Neither class is exported: the 503 on
`NexusHttpError` is what a user branches on, and `name` identifies the error in a log.

### 3.2 Requests in flight

The adapter does not drain requests. The server drains them: Fastify runs `onClose`
after its drain, and the Node docs close the server before they dispose. A drain in
the adapter would have no deadline, so a hung stream would block Vite's module
replacement.

Core's root dispose awaits every `createScope`, `extend()` and `load` in flight, then
disposes open scopes newest first. A request still running then gets `NEXUS_DISPOSED`
from its next resolve and answers 503 at warn level. A request that called `get()`
while the build was in flight receives the built container and races the dispose. It
answers 503 at warn level in every order. A later step that calls the getter again
gets `AdapterDisposedError`; a `createScope` that runs after the dispose started throws
`NEXUS_DISPOSED`; a scope created first joins the container's in-flight set, and the
root dispose disposes it.

A scope disposer error during the root dispose rejects the adapter's dispose, chained
with the others. The request's own `close()` awaits the same scope disposal and logs
the error with phase `dispose`, so the error appears twice.

### 3.3 Fastify

The plugin adds no `onClose` hook. A hook would tie the handle to the first app that
registered it, and tests often build a new Fastify app per test over one module-level
`di`: the first `app.close()` would answer 503 to every later app, with nothing in the
user's code that points at the cause. The app adds
`bridge.addHook('onClose', () => di[Symbol.asyncDispose]())` itself, as the docs
already show for `ship`. Express and Hono have no close hook either, so all three
adapters ask the app to dispose.

### 3.4 Rebuild

A rebuild is a new `nexus()` call. A reload re-evaluates the module and calls `nexus()`
again; a test builds its app per test. No reset method exists.

## 4. Users

- Express and Hono servers on the function form: the `SIGTERM` handler closes the
  server, then awaits `di[Symbol.asyncDispose]()`.
- Fastify on the function form: an `onClose` hook awaits `di[Symbol.asyncDispose]()`.
- React Router dev server on the function form:
  `import.meta.hot?.dispose(() => di[Symbol.asyncDispose]())`. The live form keeps
  disposing `ship`.
- Tests: `await using di = nexus(() => build())`. The adapters' `tsconfig.lib.json`
  already includes `esnext.disposable`.
- Serverless and Workers: nothing changes. An isolate keeps its container until the
  platform drops it, and an edge entry disposes no container.

Migration: each handle type gains a required member, so a hand-written handle or mock
must add it. The commit is marked breaking (`!`). rc users need no back-compat.
Bundle: a few hundred bytes per adapter.

## 5. Docs

- `express.mdx`, `hono.mdx`: the Shutdown section adds the function form's dispose.
- `fastify.mdx`: the Shutdown section shows the `onClose` hook for the function form.
- `react-router-ssr.mdx`: the HMR sentence adds the function form's line.
- Each `api-*.mdx` page lists the new member through the reference directive of the
  handle type.
- `edge.mdx`: no change.

## 6. Tests

`request-scope.test.ts` (one copy per adapter, kept equal):

- `get()` after `close()` rejects with `AdapterDisposedError`, which `statusOf` maps to
  503 and `logLevel` to warn;
- a build in flight when `close()` runs is disposed once it resolves;
- a build that rejects after `close()` does not start a rebuild;
- `close()` never calls a function that was never called.

Each adapter's `nexus.test.ts`, through the public handle:

- function form: after a request built the container, dispose disposes it once, and a
  later request answers 503 with `AdapterDisposedError` logged at warn;
- function form, never built: dispose never calls the function, and a later request
  answers 503;
- function form, a request racing the build: it answers 503, logged with
  `AdapterDisposedError` or `NEXUS_DISPOSED`;
- a lazy section's load after dispose answers 503 with phase `load`;
- live form: dispose leaves the container open, a request whose scope existed keeps
  resolving, and a new request answers 503;
- with `scopes` set, a request that resolves nothing answers 503 after dispose;
- a second dispose returns the same promise, and a disposer error rejects it;
- Fastify: one `di` serves two apps in a row, closing each, and the container stays
  open.

Each `nexus.test-d.ts` asserts the handle extends `AsyncDisposable`.

## 7. Rulings

The tech lead ruled on 2026-10-28:

- Option 5 stands; option 4 was added and rejected.
- The live form refuses requests after dispose.
- Fastify's plugin adds no `onClose` hook. The tech lead first ruled for one, and
  reversed it the same day after the per-task review found the shared-`di` test case.
- `AdapterDisposedError` stays internal, as `ContainerBuildError` does.
- No drain in the adapter.
- A disposer error rejects the dispose and is not logged.
- No reset method.
