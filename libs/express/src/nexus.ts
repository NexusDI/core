import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { LoadOptions, ModuleRef, Scope } from '@nexusdi/core';

import {
  adapterCore,
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

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- @types/express augments Request through this namespace
  namespace Express {
    interface Request {
      /** The request's scope handle, set by di.middleware. */
      nexus?: RequestScope;
    }
  }
}

const ADAPTER = '@nexusdi/express';

/** The options of `nexus()`: `request` maps Express's `req` to a `NexusRequest`, `scopes` runs each request in an ambient scope, and `log` receives each mapped error. */
export type NexusExpressOptions = RequestOption<Request> & {
  readonly scopes?: ScopeRunner;
  readonly log?: NexusLog;
};

/** A route handler that `inject` wraps: it receives the resolved deps first, then Express's `req`, `res` and `next`. */
export type ExpressHandler<D extends DepsMap> = (
  deps: ResolvedDeps<D>,
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown;

/** The middleware `di.load(module, options?)` returns: it loads the module once, with the grant in `options.imports`, and extends the request's scope before the section's handlers run. */
export interface SectionMiddleware extends RequestHandler {
  /** Like di.inject, validated after the section's first successful load. */
  inject<const D extends DepsMap>(
    deps: D,
    handler: ExpressHandler<D>,
  ): RequestHandler;
}

/** What `nexus()` returns for Express: the middleware, `inject` for typed handlers, `scope` for other code and `load` for lazy sections. */
export interface NexusExpress {
  readonly middleware: RequestHandler;
  inject<const D extends DepsMap>(
    deps: D,
    handler: ExpressHandler<D>,
  ): RequestHandler;
  scope(req: Request): Promise<Scope>;
  load(module: ModuleRef, options?: LoadOptions): SectionMiddleware;
}

const handleOf = (req: Request): RequestScope =>
  requireHandle(req.nexus, ADAPTER, 'di.middleware');

/** A stopped request: a finished one ends its response with no next(); a failure goes to next(). */
function stop(result: Stop, res: Response, next: NextFunction): void {
  if ('failure' in result) next(result.failure);
  else if (!res.writableEnded) res.end();
}

/**
 * Gives an Express app one NexusDI scope per request over `ship`, a
 * container or a function that builds one on the first request, and disposes
 * the scope when the response emits `close`.
 */
export function nexus(
  ship: ContainerSource,
  ...args: OptionsArg<NexusExpressOptions>
): NexusExpress {
  const options = (args[0] ?? {}) as NexusExpressOptions;
  const core = adapterCore(ship, options, ADAPTER);

  const middleware: RequestHandler = async (req, res, next) => {
    const { handle, dispose } = core.open(() => options.request?.(req));
    if (res.closed) {
      await dispose(); // the client left before this ran: nothing to serve
      return;
    }
    res.once('close', () => void dispose());
    req.nexus = handle;
    if (options.scopes === undefined) {
      next(); // inject creates the scope on first use
      return;
    }
    const started = await core.ambient(handle, dispose);
    if ('failure' in started) next(started.failure);
    else options.scopes.run(started.scope, () => next());
  };

  const handlerOf =
    <D extends DepsMap>(
      deps: D,
      handler: ExpressHandler<D>,
      checked: () => Promise<void>,
      section?: ModuleRef,
      grant?: LoadOptions,
    ): RequestHandler =>
    async (req, res, next) => {
      const result = await core.resolve({
        handle: () => handleOf(req),
        deps,
        checked,
        section,
        options: grant,
      });
      if ('deps' in result)
        await handler(result.deps, req, res, next); // Express 5 forwards a rejection to next(err)
      else stop(result, res, next);
    };

  return {
    middleware,
    inject: (deps, handler) => handlerOf(deps, handler, core.definition(deps)),
    scope: async (req) => handleOf(req).scope(),
    load(module, options) {
      const section: RequestHandler = async (req, res, next) => {
        const result = await core.enter(module, req.nexus, undefined, options);
        if (result === undefined) next();
        else stop(result, res, next);
      };
      return Object.assign(section, {
        inject<const D extends DepsMap>(deps: D, handler: ExpressHandler<D>) {
          return handlerOf(
            deps,
            handler,
            core.sectionCheck(deps),
            module,
            options,
          );
        },
      });
    },
  };
}
