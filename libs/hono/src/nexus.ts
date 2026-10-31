import type { Context, Handler, MiddlewareHandler, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

import type { LoadOptions, ModuleRef, Scope } from '@nexusdi/core';

import { CLIENT_GONE, serveWithBody } from './internal/dispose-with-body.js';
import {
  adapterCore,
  NexusHttpError,
  once,
  requireHandle,
  type ContainerSource,
  type DepsMap,
  type NexusLog,
  type OptionsArg,
  type RequestOption,
  type RequestScope,
  type ResolvedDeps,
  type ScopeRunner,
  type Stop,
} from './internal/request-scope.js';

const ADAPTER = '@nexusdi/hono';

/** The Hono `Env` that `di.middleware` adds to a chained app, so `c.var.nexus` is typed in every route after it. */
export type NexusEnv = { Variables: { nexus: RequestScope } };

/** The options of `nexus()`: `request` maps Hono's context to a `NexusRequest`, `scopes` runs each request in an ambient scope, and `log` receives each mapped error. */
export type NexusHonoOptions = RequestOption<Context> & {
  readonly scopes?: ScopeRunner;
  readonly log?: NexusLog;
};

/**
 * A route handler that receives the resolved deps first. `P` types
 * `c.req.param` and `E` types `c.var`; both come from an annotation on `c`.
 * Hono does not pass the route's path to a handler defined apart from it, so
 * `app.get('/b/:id', di.inject(...))` leaves `c.req.param('id')` as
 * `string | undefined` unless `c` is annotated.
 */
export type HonoHandler<
  D extends DepsMap,
  P extends string = string,
  E extends NexusEnv = NexusEnv,
> = (deps: ResolvedDeps<D>, c: Context<E, P>) => Response | Promise<Response>;

/**
 * A middleware that receives the resolved deps first, then Hono's context
 * and `next`. It ends the request by returning a Response or throwing, and
 * passes it on with `await next()`. `P` and `E` come from an annotation on
 * `c`, as for `HonoHandler`.
 */
export type HonoMiddleware<
  D extends DepsMap,
  P extends string = string,
  E extends NexusEnv = NexusEnv,
> = (
  deps: ResolvedDeps<D>,
  c: Context<E, P>,
  next: Next,
) => Promise<Response | void>;

type Inject = <
  const D extends DepsMap,
  P extends string = string,
  E extends NexusEnv = NexusEnv,
>(
  deps: D,
  handler: HonoHandler<D, P, E>,
) => Handler<E, P>;

type InjectMiddleware = <
  const D extends DepsMap,
  P extends string = string,
  E extends NexusEnv = NexusEnv,
>(
  deps: D,
  middleware: HonoMiddleware<D, P, E>,
) => MiddlewareHandler<E, P>;

/** The middleware `di.load(module, options?)` returns: it loads the module once, with the load imports in `options.imports`, and extends the request's scope before the section's handlers run. */
export interface SectionMiddleware extends MiddlewareHandler<NexusEnv> {
  /** Like di.inject, validated after the section's first successful load. */
  readonly inject: Inject;
  /** Like di.injectMiddleware, validated after the section's first successful load. */
  readonly injectMiddleware: InjectMiddleware;
}

/** What `nexus()` returns for Hono: the middleware, `inject` for typed handlers, `injectMiddleware` for typed middleware, `scope` for other code and `load` for lazy sections. */
export interface NexusHono {
  readonly middleware: MiddlewareHandler<NexusEnv>;
  readonly inject: Inject;
  readonly injectMiddleware: InjectMiddleware;
  scope(c: Context): Promise<Scope>;
  load(module: ModuleRef, options?: LoadOptions): SectionMiddleware;
  /**
   * Closes the adapter: a request's first use of its scope after this
   * answers 503. Disposes the container when `nexus()` got a function and
   * built one, after a build in flight settles; a given container stays
   * open. A second call returns the first call's promise, and a disposer
   * error of the built container rejects it.
   */
  [Symbol.asyncDispose](): Promise<void>;
}

/** The platform's waitUntil, as Hono's executionCtx exposes it. */
type WaitUntil = { waitUntil(promise: Promise<unknown>): void };

const handleOf = (c: Context): RequestScope =>
  requireHandle(
    (c as Context<NexusEnv>).get('nexus') as RequestScope | undefined,
    ADAPTER,
    'di.middleware',
  );

/**
 * Hono's error type for a mapped error: the status, the status text as the
 * body, and the NexusHttpError as cause. Anything else goes to Hono's error
 * handler unchanged.
 */
const toHono = (http: unknown): unknown =>
  http instanceof NexusHttpError
    ? new HTTPException(http.status, { message: http.message, cause: http })
    : http;

/** Ends a stopped request: a failure is thrown to Hono's error handler, and a finished request answers a response nobody reads. */
function stop(result: Stop): Response {
  if ('failure' in result) throw toHono(result.failure);
  return new Response(null, { status: CLIENT_GONE });
}

/**
 * Gives a Hono app one NexusDI scope per request over `ship`, a container or
 * a function that builds one on the first request, and disposes the scope
 * when the response body ends or the client leaves.
 */
export function nexus(
  ship: ContainerSource,
  ...args: OptionsArg<NexusHonoOptions>
): NexusHono {
  const options = (args[0] ?? {}) as NexusHonoOptions;
  const core = adapterCore(ship, options, ADAPTER);

  // Hono's executionCtx getter throws a new Error on Node, Bun and Deno,
  // which have no execution context. One adapter instance serves one
  // runtime, so the first request tells, and later requests skip the read.
  let noExecutionCtx = false;

  /**
   * Hands the disposal to the platform's waitUntil where one exists (spec
   * D5), so a Worker keeps running until the scope's disposers finish.
   */
  const keepAlive = (c: Context, done: Promise<void>): Promise<void> => {
    if (noExecutionCtx) return done;
    let ctx: WaitUntil;
    try {
      ctx = c.executionCtx;
    } catch {
      noExecutionCtx = true;
      return done;
    }
    ctx.waitUntil(done);
    return done;
  };

  const middleware = createMiddleware<NexusEnv>(async (c, next) => {
    const opened = core.open(() => options.request?.(c));
    const handle = opened.handle;
    const dispose = once(() => keepAlive(c, opened.dispose()));
    c.set('nexus', handle);
    let ran = false;
    const response = await serveWithBody({
      request: c.req.raw,
      handle,
      dispose,
      scopes: options.scopes,
      ambient: core.ambient,
      next: async () => {
        ran = true;
        await next();
        return c.res;
      },
      fail: (failure) => {
        throw toHono(failure);
      },
    });
    if (!ran) return response; // the client left: Hono needs a Response
    if (response !== c.res) {
      c.res = undefined; // replace, so Hono does not merge the old headers twice
      c.res = response;
    }
    return undefined;
  });

  /**
   * Wraps a handler or a middleware: Hono calls both with (c, next), takes a
   * returned Response as the answer and passes a throw to onError.
   */
  const wrap =
    <D extends DepsMap, P extends string, E extends NexusEnv, R>(
      deps: D,
      fn: (deps: ResolvedDeps<D>, c: Context<E, P>, next: Next) => R,
      checked: () => Promise<void>,
      section?: ModuleRef,
      loadOptions?: LoadOptions,
    ) =>
    async (c: Context<E, P>, next: Next): Promise<Awaited<R> | Response> => {
      const result = await core.resolve({
        handle: () => handleOf(c),
        deps,
        checked,
        section,
        options: loadOptions,
      });
      if (!('deps' in result)) return stop(result);
      return await fn(result.deps, c, next);
    };

  return {
    middleware,
    inject: (deps, handler) => wrap(deps, handler, core.definition(deps)),
    injectMiddleware: (deps, fn) => wrap(deps, fn, core.definition(deps)),
    scope: async (c) => handleOf(c).scope(),
    load(module, options) {
      const section = createMiddleware<NexusEnv>(async (c, next) => {
        const result = await core.enter(
          module,
          c.get('nexus'),
          undefined,
          options,
        );
        if (result !== undefined) return stop(result);
        await next();
        return undefined;
      });
      const sectionInject: Inject = (deps, handler) =>
        wrap(deps, handler, core.sectionCheck(deps), module, options);
      const sectionMiddleware: InjectMiddleware = (deps, fn) =>
        wrap(deps, fn, core.sectionCheck(deps), module, options);
      return Object.assign(section, {
        inject: sectionInject,
        injectMiddleware: sectionMiddleware,
      });
    },
    [Symbol.asyncDispose]: () => core.dispose(),
  };
}
