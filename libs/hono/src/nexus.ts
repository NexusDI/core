import type { Context, Handler, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

import type { ModuleRef, Scope } from '@nexusdi/core';

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

  const handlerOf =
    <D extends DepsMap, P extends string>(
      deps: D,
      handler: HonoHandler<D, P>,
      checked: () => Promise<void>,
      section?: ModuleRef,
    ): Handler<NexusEnv, P> =>
    async (c) => {
      const result = await core.resolve({
        handle: () => handleOf(c),
        deps,
        checked,
        section,
      });
      if (!('deps' in result)) return stop(result);
      return handler(result.deps, c);
    };

  return {
    middleware,
    inject: (deps, handler) => handlerOf(deps, handler, core.definition(deps)),
    scope: async (c) => handleOf(c).scope(),
    load(module) {
      const section = createMiddleware<NexusEnv>(async (c, next) => {
        const result = await core.enter(module, c.get('nexus'));
        if (result !== undefined) return stop(result);
        await next();
        return undefined;
      });
      const sectionInject: Inject = (deps, handler) =>
        handlerOf(deps, handler, core.sectionCheck(deps), module);
      return Object.assign(section, { inject: sectionInject });
    },
  };
}
