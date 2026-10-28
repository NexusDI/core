# Injected middleware and hooks in the HTTP adapters

Status: tech lead reviewed, 2026-10-28. Section 10 records the rulings.

Packages: `@nexusdi/hono`, `@nexusdi/fastify` and `@nexusdi/react-router` change their
public types. `@nexusdi/express` changes only its docs. Core does not change.

Depends on:

- `specs/2026-09-23-integrations-design.md`, which defines `nexus()`, `di.inject`,
  `di.scope` and `di.load` for each adapter. Its tasks are done on `release/0.4`.

## 1. The gap

The Meridian demo needs a guard: middleware that resolves request-scoped deps, such as
an `ACCESS_CONTROL` service, and can end the request before the route runs. In Hono and
Fastify `di.inject` wraps a route handler only, so a guard resolves the scope by hand
with `await di.scope(c)` and `scope.get(ACCESS_CONTROL)`. The hand-written form has no
typed record and no startup check of the tokens.

| Adapter      | What `di.inject` passes after `deps` | Usable as a guard today                  |
| ------------ | ------------------------------------ | ---------------------------------------- |
| Express      | `req, res, next`                     | yes, the handler can call `next()`       |
| Hono         | `c`                                  | no, the handler has no `next`            |
| Fastify      | `req, reply`                         | at runtime, but the type is a route only |
| React Router | `args`                               | no, the handler has no `next`            |

## 2. The rule

`di.inject(deps, fn)` stays the route form. Each adapter gains one method that wraps the
framework's request-time gate the same way: `fn` receives the resolved record first,
then the framework's arguments unchanged. The name says what comes back.

| Adapter      | Route form  | Gate form                                    |
| ------------ | ----------- | -------------------------------------------- |
| Express      | `di.inject` | `di.inject` (the handler already has `next`) |
| Hono         | `di.inject` | `di.injectMiddleware`                        |
| Fastify      | `di.inject` | `di.injectHook`                              |
| React Router | `di.inject` | `di.injectMiddleware`                        |

An overload of `inject` on the handler's arity does not work. The tech lead checked it
with tsc 6.0.3: an unannotated `async (deps, c, next) => ...` fails the two-parameter
overload, and TypeScript keeps the parameters it fixed there, so `deps`, `c` and `next`
come out as implicit `any`. With the middleware overload first, a route handler that
forgets `return` type-checks.

## 3. Hono

```ts
const guard = di.injectMiddleware(
  { access: ACCESS_CONTROL },
  async ({ access }, c, next) => {
    if (!access.mayFire(c.req.header('x-operator')))
      return c.text('Forbidden', 403);
    await next();
  },
);
app.use('/drive/*', guard);
```

- `injectMiddleware<const D, P extends string = string, E extends NexusEnv = NexusEnv>(deps: D, fn: (deps: ResolvedDeps<D>, c: Context<E, P>, next: Next) => Promise<Response | void>): MiddlewareHandler<E, P>`.
- The wrapper resolves the record, then returns `fn(deps, c, next)`. Hono's compose takes
  a returned `Response` as the answer and passes a throw to `onError`.
- `inject`, `HonoHandler` and `SectionMiddleware.inject` gain the same trailing
  `E extends NexusEnv = NexusEnv`. An annotation `c: Context<OperatorEnv, '/b/:id'>`
  infers both `E` and `P`, so a guard can `c.set('operator', op)` and a later route reads
  `c.var.operator` typed. Without the annotation both stay at their defaults.
- `P` never comes from the route path: `app.get('/b/:id', di.inject(...))` leaves
  `c.req.param('id')` as `string | undefined`. The `HonoHandler` docblock says so.
- `injectMiddleware` checks the record against the container at definition, as `inject`
  does. `di.load(module).injectMiddleware` checks it after the section's first load.

## 4. Fastify

```ts
app.post(
  '/drive/fire',
  {
    preHandler: di.injectHook(
      { access: ACCESS_CONTROL },
      async ({ access }, req, reply) => {
        if (!access.mayFire(req.headers['x-operator']))
          return reply.code(403).send();
      },
    ),
  },
  di.inject({ drive: MAIN_DRIVE }, ({ drive }) => drive.fire()),
);
```

- `injectHook<const D, G extends RouteGenericInterface = RouteGenericInterface>(deps: D, fn: (deps: ResolvedDeps<D>, req: FastifyRequest<G>, reply: FastifyReply<G>) => void | FastifyReply<G> | Promise<void | FastifyReply<G>>): onRequestAsyncHookHandler<..., G>`.
  Fastify's `onRequest`, `preValidation` and `preHandler` async hook types are
  structurally identical, so the one type fits each slot, in route options and in
  `addHook`.
- The return type refuses a payload, which Fastify ignores in a hook. A hook that sends
  returns `reply`: `FastifyReply` is thenable, so the hook's promise waits for the
  response, and the hook runner skips the rest once `reply.sent` is true.
- The wrapper is an `async (req, reply)` function of length 2. Fastify refuses an async
  hook of length 3.
- A failure to resolve stops the request as `di.inject` does: the error handler gets the
  `NexusHttpError`, and a finished request's reply is hijacked.
- Fastify defers `addHook` until the plugins registered before it have loaded, so the
  hooks of one stage run in the order the app adds them, with or without `await`. An
  instance-level `onRequest` hook added before `app.register(di.plugin)` runs before
  the plugin's own `onRequest`. The hook then finds `req.nexus === null` (the decorator
  exists, the scope does not) and throws its own message: register di.plugin before
  `addHook('onRequest', ...)`, or add the hook as a `preHandler`. This shows at the
  first request only, a known exception to "if it type-checks and starts". The docs
  recommend `preHandler` or a route-level `onRequest`, which have no ordering concern.
  The check lives in `libs/fastify/src/nexus.ts`.
- `req.body` is typed in `onRequest` and is `undefined` there, as in any Fastify hook.
  The docs say so.
- `di.load(module).injectHook` exists beside `.inject`.

## 5. React Router

- `injectMiddleware<const D, A extends WithContext>(deps: D, fn: (deps: ResolvedDeps<D>, args: A, next: () => Promise<Response>) => Response | void | Promise<Response | void>): (args: A, next: () => Promise<Response>) => Promise<Response | void>`.
  It fits `MiddlewareFunction<Response>` and the typegen `Route.MiddlewareFunction`, and
  `args` comes from the contextual type of a `middleware` array.
- The adapter is server-only, so the result is `Response`.
- A resolve failure throws through `stop()`, as for a loader.
- React Router calls `next` itself when a middleware returns without calling it. The docs
  say so.
- `SectionMiddleware.injectMiddleware` exists.
- React Router 7 types a route's context as `RouterContextProvider` only when the app
  enables the middleware future flag: `future.middleware` in 7.9 and
  `future.v8_middleware` in later 7.x. React Router's typegen writes the flag into the
  `Future` interface, and an app without it runs no route middleware. With the flag,
  `injectMiddleware` fits `Route.MiddlewareFunction` on 7.9 and on 8, so the peer floor
  stays at 7.9. The type test declares the flag the way typegen does.

## 6. Express

No code change. The docs page and README gain a guard example. A type test pins that
`di.inject` with `next` fits `app.use`, and a runtime test pins that a guard which throws
reaches the error middleware through Express 5's rejection forwarding.

## 7. What this changes for users

- No removal and no rename, so no `!` and no BREAKING CHANGE footer.
- New names: `injectMiddleware` in Hono and React Router, `injectHook` in Fastify, each on
  `di` and on the section `di.load` returns.
- Hono's `inject` and `HonoHandler` gain an optional trailing `E` generic. Existing calls
  keep their types.
- Bundle: a few lines per adapter. No new dependency.

## 8. Pillars and P1 to P5

The change stays inside each adapter package and adds no dependency. It reads no other
package's vocabulary, so P1 to P5 hold. `internal/request-scope.ts` does not change, and
the shared-copy check is unaffected.

## 9. Tests

Per adapter, written before the code, and run on the TypeScript floor and on TS 7:

- Type tests: an unannotated gate infers `deps` and `next` (an `expectTypeOf` on `next`
  catches a fall back to `any`); `inject` still refuses an async handler without a
  return.
- Hono: `E` inferred from the annotation, and `c.var.<x>` typed in a later route.
- React Router: `args` inferred inside `MiddlewareFunction<Response>[]`.
- Fastify: the hook fits `addHook` for `onRequest`, `preHandler` and `preValidation`, and
  the route-option arrays; it refuses a payload return; at runtime its length is 2, an
  instance `onRequest` hook added before the plugin gets the new message, and a
  hook that sends and returns `reply` skips the route.
- Runtime per adapter: the gate ends the request with 403 and the route never runs; the
  gate calls `next` and the route sees the same scope instance; a resolve failure reaches
  the error handler; the section form validates after the first load.
- After the adapter is disposed (`di[Symbol.asyncDispose]()`), `injectMiddleware`,
  `injectHook` and their section forms answer 503 like `inject`, and never call the user
  function. The wrappers go through the same `core.resolve` gate as `inject`.

## 10. Rulings

The tech lead ruled on 2026-10-28:

- Q1. Hono and React Router get a separate method, `injectMiddleware`. The arity
  overload cannot type an unannotated lambda (section 2).
- Q2. Fastify gets `injectHook`. `inject` wraps a route, and the suffix names what comes
  back. `di.hook` would read like a value of the same kind as `di.plugin`.
- Q3. React Router is in scope. It has the same gap, and route middleware is where a
  React Router app puts a server guard.
- Q4. Hono's `E` generic lands now on `inject` and `injectMiddleware`. Without it the
  main guard case (set the operator, read it in the route) does not type-check.
