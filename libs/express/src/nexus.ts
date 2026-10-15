import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { ModuleRef, Scope } from '@nexusdi/core';

import {
  containerOf,
  defaultLog,
  definitionCheck,
  disposer,
  enterSection,
  guardLog,
  loader,
  RequestFinishedError,
  requestScope,
  statusOf,
  toHttpError,
  validateFailure,
  validator,
  type ContainerSource,
  type DepsMap,
  type LogPhase,
  type NexusLog,
  type OptionsArg,
  type RequestOption,
  type RequestScope,
  type ResolvedDeps,
  type ScopeRunner,
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

function handleOf(req: Request): RequestScope {
  const handle = req.nexus;
  if (handle === undefined)
    throw new Error(
      `[${ADAPTER}] no scope on this request: register di.middleware before this route`,
    );
  return handle;
}

export function nexus(
  ship: ContainerSource,
  ...args: OptionsArg<NexusExpressOptions>
): NexusExpress {
  const options = (args[0] ?? {}) as NexusExpressOptions;
  const log = guardLog(options.log ?? defaultLog);
  const container = containerOf(ship);
  const load = loader(container);

  /** A mapped error becomes a logged NexusHttpError; anything else goes to Express unchanged. */
  const mapped = (error: unknown, phase: LogPhase): unknown =>
    statusOf(error) === undefined
      ? error
      : toHttpError(error, log, ADAPTER, phase);

  /**
   * True for a RequestFinishedError: the response closed before the
   * request's first use of its scope, so scope() created none. No client
   * reads a reply, so this logs the error and ends the response, and the
   * caller calls no next() (integrations spec 3.9).
   */
  const finished = (error: unknown, res: Response): boolean => {
    if (!(error instanceof RequestFinishedError)) return false;
    log(error, { adapter: ADAPTER, phase: 'scope' });
    if (!res.writableEnded) res.end();
    return true;
  };

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
      next(mapped(error, 'scope'));
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
      try {
        if (section !== undefined) await enterSection(load, section, req.nexus);
      } catch (error) {
        if (!finished(error, res)) next(mapped(error, 'load'));
        return;
      }
      try {
        await check();
      } catch (error) {
        next(validateFailure(error, log, ADAPTER));
        return;
      }
      let resolved: ResolvedDeps<D>;
      try {
        const scope = await handleOf(req).scope();
        resolved = scope.resolve(deps);
      } catch (error) {
        if (!finished(error, res)) next(mapped(error, 'scope'));
        return;
      }
      await handler(resolved, req, res, next); // Express 5 forwards a rejection to next(err)
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
        try {
          await enterSection(load, module, req.nexus);
        } catch (error) {
          if (!finished(error, res)) next(mapped(error, 'load'));
          return;
        }
        next();
      };
      return Object.assign(section, {
        inject<const D extends DepsMap>(deps: D, handler: ExpressHandler<D>) {
          return handlerOf(deps, handler, validator(container, deps), module);
        },
      });
    },
  };
}
