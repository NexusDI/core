import {
  createContext,
  type MiddlewareFunction,
  type Params,
  type RouterContextProvider,
} from 'react-router';

import type { ModuleRef, Scope } from '@nexusdi/core';

import { CLIENT_GONE, serveWithBody } from './internal/dispose-with-body.js';
import {
  adapterCore,
  NexusHttpError,
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

const ADAPTER = '@nexusdi/react-router';

/**
 * The request's scope handle, which di.middleware sets on the router
 * context. null where the middleware has not run, as for a request no
 * route matches.
 */
export const NEXUS_SCOPE = createContext<RequestScope | null>(null);

/** What the `request` option maps: the request and the route's params. */
export interface RequestInput {
  readonly request: Request;
  readonly params: Params;
}

/** The options of `nexus()`: `request` maps the request and params to a `NexusRequest`, `scopes` runs each request in an ambient scope, and `log` receives each mapped error. */
export type NexusRouterOptions = RequestOption<RequestInput> & {
  readonly scopes?: ScopeRunner;
  readonly log?: NexusLog;
};

/** Any args object a loader, an action or a middleware receives. */
type WithContext = { readonly context: Readonly<RouterContextProvider> };

type Inject = <const D extends DepsMap, A extends WithContext, R>(
  deps: D,
  handler: (deps: ResolvedDeps<D>, args: A) => R,
) => (args: A) => Promise<Awaited<R>>;

/** The route middleware `di.load(module)` returns: it loads the module once and extends the request's scope before the route's loaders run. */
export interface SectionMiddleware extends MiddlewareFunction<Response> {
  /** Like di.inject, validated after the section's first successful load. */
  readonly inject: Inject;
}

/**
 * The root middleware: React Router's middleware args and next(), and
 * always a Response, which a MiddlewareFunction<Response> also accepts.
 */
export type RouterMiddleware = (
  ...args: Parameters<MiddlewareFunction<Response>>
) => Promise<Response>;

/** What `nexus()` returns for React Router: the root middleware, `inject` for typed loaders and actions, `scope` for other code and `load` for lazy routes. */
export interface NexusRouter {
  readonly middleware: RouterMiddleware;
  readonly inject: Inject;
  scope(context: Readonly<RouterContextProvider>): Promise<Scope>;
  load(module: ModuleRef): SectionMiddleware;
}

/** The handle on the context, or undefined when di.middleware has not run. */
function handleIn(
  context: Readonly<RouterContextProvider>,
): RequestScope | undefined {
  return context.get(NEXUS_SCOPE) ?? undefined;
}

const handleOf = (context: Readonly<RouterContextProvider>): RequestScope =>
  requireHandle(handleIn(context), ADAPTER, 'di.middleware');

/**
 * React Router's answer for a mapped error: a thrown Response with the
 * status and the status text, which renders the nearest error boundary
 * (spec 7.4). Anything else goes to React Router unchanged.
 */
function toRouter(failure: unknown): unknown {
  return failure instanceof NexusHttpError
    ? new Response(failure.message, {
        status: failure.status,
        statusText: failure.message,
      })
    : failure;
}

/** A stopped request: a failure is thrown, and a finished one throws a response nobody reads. */
function stop(result: Stop): never {
  if ('failure' in result) throw toRouter(result.failure);
  throw new Response(null, { status: CLIENT_GONE });
}

/**
 * Gives a React Router app one NexusDI scope per request over `ship`, a
 * container or a function that builds one on the first request, and disposes
 * the scope when the response body ends or the client leaves.
 */
export function nexus(
  ship: ContainerSource,
  ...args: OptionsArg<NexusRouterOptions>
): NexusRouter {
  const options = (args[0] ?? {}) as NexusRouterOptions;
  const core = adapterCore(ship, options, ADAPTER);

  const middleware: RouterMiddleware = async (
    { request, context, params },
    next,
  ) => {
    const { handle, dispose } = core.open(() =>
      options.request?.({ request, params }),
    );
    context.set(NEXUS_SCOPE, handle); // set before any return, so a late loader finds a closed handle
    return serveWithBody({
      request,
      handle,
      dispose,
      scopes: options.scopes,
      ambient: core.ambient,
      next,
      fail: (failure) => {
        throw toRouter(failure);
      },
    });
  };

  const handlerOf =
    <const D extends DepsMap, A extends WithContext, R>(
      deps: D,
      handler: (deps: ResolvedDeps<D>, args: A) => R,
      checked: () => Promise<void>,
      section?: ModuleRef,
    ) =>
    async (args: A): Promise<Awaited<R>> => {
      const result = await core.resolve({
        handle: () => handleOf(args.context),
        deps,
        checked,
        section,
      });
      if (!('deps' in result)) return stop(result);
      return await handler(result.deps, args);
    };

  return {
    middleware,
    inject: (deps, handler) => handlerOf(deps, handler, core.definition(deps)),
    scope: async (context) => handleOf(context).scope(),
    load(module) {
      const section: MiddlewareFunction<Response> = async (
        { context },
        next,
      ) => {
        const result = await core.enter(module, handleIn(context));
        if (result !== undefined) return stop(result);
        return next();
      };
      const sectionInject: Inject = (deps, handler) =>
        handlerOf(deps, handler, core.sectionCheck(deps), module);
      return Object.assign(section, { inject: sectionInject });
    },
  };
}
