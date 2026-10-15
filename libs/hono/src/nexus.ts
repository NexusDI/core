import type { Context, Handler, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

import type { ModuleRef, Scope } from '@nexusdi/core';

import { disposeWithBody } from './internal/dispose-with-body.js';
import {
  containerOf,
  defaultLog,
  definitionCheck,
  disposer,
  enterFor,
  guardLog,
  loader,
  mapError,
  NexusHttpError,
  once,
  requestScope,
  requireHandle,
  resolveFor,
  validator,
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

/** The status a response gets when its client has gone. Nobody reads it; Hono needs a Response. */
const CLIENT_GONE = 499;

export type NexusEnv = { Variables: { nexus: RequestScope } };

export type NexusHonoOptions = RequestOption<Context> & {
  readonly scopes?: ScopeRunner;
  readonly log?: NexusLog;
};

/** A route handler that receives the resolved deps first. `P` is the route's path, which types `c.req.param`. */
export type HonoHandler<D extends DepsMap, P extends string = string> = (
  deps: ResolvedDeps<D>,
  c: Context<NexusEnv, P>,
) => Response | Promise<Response>;

type Inject = <const D extends DepsMap, P extends string = string>(
  deps: D,
  handler: HonoHandler<D, P>,
) => Handler<NexusEnv, P>;

export interface SectionMiddleware extends MiddlewareHandler<NexusEnv> {
  /** Like di.inject, validated after the section's first successful load. */
  readonly inject: Inject;
}

export interface NexusHono {
  readonly middleware: MiddlewareHandler<NexusEnv>;
  readonly inject: Inject;
  scope(c: Context): Promise<Scope>;
  load(module: ModuleRef): SectionMiddleware;
}

/**
 * Hands the disposal to the platform's waitUntil where one exists (spec
 * D5), so a Worker keeps running until the scope's disposers finish.
 * Hono's executionCtx getter throws on Node, Bun and Deno, which have none.
 */
function keepAlive(c: Context, done: Promise<void>): Promise<void> {
  let ctx: { waitUntil(promise: Promise<unknown>): void } | undefined;
  try {
    ctx = c.executionCtx;
  } catch {
    ctx = undefined;
  }
  ctx?.waitUntil(done);
  return done;
}

const handleOf = (c: Context): RequestScope =>
  requireHandle(
    (c as Context<NexusEnv>).get('nexus') as RequestScope | undefined,
    ADAPTER,
    'di.middleware',
  );

export function nexus(
  ship: ContainerSource,
  ...args: OptionsArg<NexusHonoOptions>
): NexusHono {
  const options = (args[0] ?? {}) as NexusHonoOptions;
  const log = guardLog(options.log ?? defaultLog);
  const container = containerOf(ship);
  const load = loader(container);

  /**
   * Hono's error type for a mapped error: the status, the status text as
   * the body, and the NexusHttpError as cause. Anything else goes to
   * Hono's error handler unchanged.
   */
  const toHono = (http: unknown): unknown =>
    http instanceof NexusHttpError
      ? new HTTPException(http.status, {
          message: http.message,
          cause: http,
        })
      : http;
  /** Ends a stopped request: a failure is thrown to Hono's error handler, and a finished request answers a response nobody reads. */
  const stop = (result: Stop): Response => {
    if ('failure' in result) throw toHono(result.failure);
    return new Response(null, { status: CLIENT_GONE });
  };

  const middleware = createMiddleware<NexusEnv>(async (c, next) => {
    const handle = requestScope(container, () => options.request?.(c));
    const close = disposer(handle, log, ADAPTER);
    const dispose = once(() => keepAlive(c, close()));
    c.set('nexus', handle);
    const signal = c.req.raw.signal;
    if (signal.aborted) {
      await dispose(); // the client left before the middleware ran: no scope, no handler
      return new Response(null, { status: CLIENT_GONE });
    }
    signal.addEventListener('abort', () => void dispose(), { once: true });
    if (options.scopes !== undefined) {
      let scope: Scope;
      try {
        scope = await handle.scope();
      } catch (error) {
        await dispose();
        throw toHono(mapError(error, log, ADAPTER, 'scope'));
      }
      await options.scopes.run(scope, next);
    } else {
      await next(); // inject creates the scope on first use
    }
    const wrapped = disposeWithBody(c.res, dispose, c.req.method);
    if (wrapped !== c.res) {
      c.res = undefined; // replace, so Hono does not merge the old headers twice
      c.res = wrapped;
    }
    return undefined;
  });

  const handlerOf =
    <D extends DepsMap, P extends string>(
      deps: D,
      handler: HonoHandler<D, P>,
      check: () => Promise<void>,
      section?: ModuleRef,
    ): Handler<NexusEnv, P> =>
    async (c) => {
      const result = await resolveFor({
        handle: () => handleOf(c),
        deps,
        checked: check,
        load,
        section,
        log,
        adapter: ADAPTER,
      });
      if (!('deps' in result)) return stop(result);
      return handler(result.deps, c);
    };

  return {
    middleware,
    inject: (deps, handler) =>
      handlerOf(
        deps,
        handler,
        definitionCheck(ship, container, deps, log, ADAPTER),
      ),
    scope: async (c) => handleOf(c).scope(),
    load(module) {
      const section = createMiddleware<NexusEnv>(async (c, next) => {
        const result = await enterFor({
          load,
          section: module,
          handle: c.get('nexus'),
          log,
          adapter: ADAPTER,
        });
        if (result !== undefined) return stop(result);
        await next();
        return undefined;
      });
      const sectionInject: Inject = (deps, handler) =>
        handlerOf(deps, handler, validator(container, deps), module);
      return Object.assign(section, { inject: sectionInject });
    },
  };
}
