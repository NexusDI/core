import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { ModuleRef, Scope } from '@nexusdi/core';

import {
  containerOf,
  defaultLog,
  definitionCheck,
  disposer,
  enterFor,
  guardLog,
  loader,
  mapError,
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

export type NexusExpressOptions = RequestOption<Request> & {
  readonly scopes?: ScopeRunner;
  readonly log?: NexusLog;
};

export type ExpressHandler<D extends DepsMap> = (
  deps: ResolvedDeps<D>,
  req: Request,
  res: Response,
  next: NextFunction,
) => unknown;

export interface SectionMiddleware extends RequestHandler {
  /** Like di.inject, validated after the section's first successful load. */
  inject<const D extends DepsMap>(
    deps: D,
    handler: ExpressHandler<D>,
  ): RequestHandler;
}

export interface NexusExpress {
  readonly middleware: RequestHandler;
  inject<const D extends DepsMap>(
    deps: D,
    handler: ExpressHandler<D>,
  ): RequestHandler;
  scope(req: Request): Promise<Scope>;
  load(module: ModuleRef): SectionMiddleware;
}

const handleOf = (req: Request): RequestScope =>
  requireHandle(req.nexus, ADAPTER, 'di.middleware');

/** A stopped request: a finished one ends its response with no next(); a failure goes to next(). */
function stop(result: Stop, res: Response, next: NextFunction): void {
  if ('failure' in result) next(result.failure);
  else if (!res.writableEnded) res.end();
}

export function nexus(
  ship: ContainerSource,
  ...args: OptionsArg<NexusExpressOptions>
): NexusExpress {
  const options = (args[0] ?? {}) as NexusExpressOptions;
  const log = guardLog(options.log ?? defaultLog);
  const container = containerOf(ship);
  const load = loader(container);

  const middleware: RequestHandler = async (req, res, next) => {
    const handle = requestScope(container, () => options.request?.(req));
    const dispose = disposer(handle, log, ADAPTER);
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
    let scope: Scope;
    try {
      scope = await handle.scope();
    } catch (error) {
      next(mapError(error, log, ADAPTER, 'scope'));
      return;
    }
    options.scopes.run(scope, () => next());
  };

  const handlerOf =
    <D extends DepsMap>(
      deps: D,
      handler: ExpressHandler<D>,
      check: () => Promise<void>,
      section?: ModuleRef,
    ): RequestHandler =>
    async (req, res, next) => {
      const result = await resolveFor({
        handle: () => handleOf(req),
        deps,
        checked: check,
        load,
        section,
        log,
        adapter: ADAPTER,
      });
      if (!('deps' in result)) {
        stop(result, res, next);
        return;
      }
      await handler(result.deps, req, res, next); // Express 5 forwards a rejection to next(err)
    };

  return {
    middleware,
    inject: (deps, handler) =>
      handlerOf(
        deps,
        handler,
        definitionCheck(ship, container, deps, log, ADAPTER),
      ),
    scope: async (req) => handleOf(req).scope(),
    load(module) {
      const section: RequestHandler = async (req, res, next) => {
        const result = await enterFor({
          load,
          section: module,
          handle: req.nexus,
          log,
          adapter: ADAPTER,
        });
        if (result === undefined) next();
        else stop(result, res, next);
      };
      return Object.assign(section, {
        inject<const D extends DepsMap>(deps: D, handler: ExpressHandler<D>) {
          return handlerOf(deps, handler, validator(container, deps), module);
        },
      });
    },
  };
}
