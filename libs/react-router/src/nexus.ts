import {
  createContext,
  type MiddlewareFunction,
  type Params,
  type RouterContextProvider,
} from 'react-router';

import type { LoadOptions, ModuleRef, Scope } from '@nexusdi/core';

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

/** React Router's middleware args. */
type MiddlewareArgs = Parameters<MiddlewareFunction>[0];

/**
 * The next() a route middleware receives: it runs the rest of the chain.
 * R is what the chain resolves. At runtime a server handler gives a Response
 * and a browser data router gives the loaders' results. As a type, R is
 * Response in framework mode and unknown on a data-mode route object.
 */
type Next<R> = () => Promise<R>;

/**
 * A route middleware that `injectMiddleware` wraps: it receives the resolved
 * deps first, then React Router's args and next(). It ends the request by
 * returning or throwing a Response, and passes it on by returning next().
 * React Router calls next() itself for a middleware that returns without
 * calling it. next() resolves what the route's middleware array resolves: a
 * Response in framework mode, unknown on a data-mode route object.
 */
type GuardMiddleware<D extends DepsMap, A extends WithContext, R> = (
  deps: ResolvedDeps<D>,
  args: A,
  next: Next<R>,
) => NoInfer<R> | void | Promise<NoInfer<R> | void>;

type InjectMiddleware = <
  const D extends DepsMap,
  A extends WithContext,
  R = Response,
>(
  deps: D,
  middleware: GuardMiddleware<D, A, R>,
) => (args: A, next: Next<R>) => Promise<R | void>;

/**
 * The route middleware `di.load(module, options?)` returns: it loads the
 * module once, with the grant in `options.imports`, and extends the
 * request's scope before the route's loaders run. It resolves what next()
 * resolves, so it fits a framework-mode middleware array and a data-mode
 * route object.
 */
export interface SectionMiddleware {
  <R = Response>(args: MiddlewareArgs, next: Next<R>): Promise<R>;
  /** Like di.inject, validated after the section's first successful load. */
  readonly inject: Inject;
  /** Like di.injectMiddleware, validated after the section's first successful load. */
  readonly injectMiddleware: InjectMiddleware;
}

/**
 * The root middleware: React Router's middleware args and next(). It
 * resolves what next() resolves. For a Response it returns a copy whose
 * body disposes the scope when it ends; for any other value, such as the
 * loaders' results in a browser data router, it disposes the scope and
 * returns the value unchanged. It fits Route.MiddlewareFunction and
 * MiddlewareFunction<Response> in framework mode. It also fits the
 * MiddlewareFunction of a data-mode route object.
 */
export type RouterMiddleware = <R = Response>(
  args: MiddlewareArgs,
  next: Next<R>,
) => Promise<R>;

/** What `nexus()` returns for React Router: the root middleware, `inject` for typed loaders and actions, `injectMiddleware` for typed route middleware, `scope` for other code and `load` for lazy routes. */
export interface NexusRouter {
  readonly middleware: RouterMiddleware;
  readonly inject: Inject;
  readonly injectMiddleware: InjectMiddleware;
  scope(context: Readonly<RouterContextProvider>): Promise<Scope>;
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

/**
 * True for a Response from any class, as React Router's own pipeline
 * tests it: a Response from the undici package fails instanceof Response.
 */
function isResponse(value: unknown): value is Response {
  const r = value as Partial<Response> | null | undefined;
  return (
    r != null &&
    typeof r.status === 'number' &&
    typeof r.statusText === 'string' &&
    typeof r.headers === 'object' &&
    r.body !== undefined
  );
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

  const middleware: RouterMiddleware = async <R>(
    { request, context, params }: MiddlewareArgs,
    next: Next<R>,
  ): Promise<R> => {
    const { handle, dispose } = core.open(() =>
      options.request?.({ request, params }),
    );
    context.set(NEXUS_SCOPE, handle); // set before any return, so a late loader finds a closed handle
    // A browser data router resolves next() to the loaders' results. The body
    // wrapper disposes the scope at once for an empty Response, and the
    // chain's own result goes back to React Router.
    let other: { readonly value: R } | undefined;
    const response = await serveWithBody({
      request,
      handle,
      dispose,
      scopes: options.scopes,
      ambient: core.ambient,
      next: async () => {
        const result = await next();
        if (isResponse(result)) return result;
        other = { value: result };
        return new Response(null);
      },
      fail: (failure) => {
        throw toRouter(failure);
      },
    });
    return other === undefined ? (response as R) : other.value;
  };

  /** Resolves the record for a loader, an action or a middleware, or throws through stop(). */
  const depsFor = async <D extends DepsMap>(
    deps: D,
    context: Readonly<RouterContextProvider>,
    checked: () => Promise<void>,
    section?: ModuleRef,
    grant?: LoadOptions,
  ): Promise<ResolvedDeps<D>> => {
    const result = await core.resolve({
      handle: () => handleOf(context),
      deps,
      checked,
      section,
      options: grant,
    });
    if (!('deps' in result)) return stop(result);
    return result.deps;
  };

  const handlerOf =
    <const D extends DepsMap, A extends WithContext, R>(
      deps: D,
      handler: (deps: ResolvedDeps<D>, args: A) => R,
      checked: () => Promise<void>,
      section?: ModuleRef,
      grant?: LoadOptions,
    ) =>
    async (args: A): Promise<Awaited<R>> =>
      await handler(
        await depsFor(deps, args.context, checked, section, grant),
        args,
      );

  const middlewareOf =
    <const D extends DepsMap, A extends WithContext, R>(
      deps: D,
      middleware: GuardMiddleware<D, A, R>,
      checked: () => Promise<void>,
      section?: ModuleRef,
      grant?: LoadOptions,
    ) =>
    async (args: A, next: Next<R>): Promise<R | void> =>
      await middleware(
        await depsFor(deps, args.context, checked, section, grant),
        args,
        next,
      );

  return {
    middleware,
    inject: (deps, handler) => handlerOf(deps, handler, core.definition(deps)),
    injectMiddleware: (deps, middleware) =>
      middlewareOf(deps, middleware, core.definition(deps)),
    scope: async (context) => handleOf(context).scope(),
    load(module, options) {
      const section = async <R>(
        { context }: MiddlewareArgs,
        next: Next<R>,
      ): Promise<R> => {
        const result = await core.enter(
          module,
          handleIn(context),
          undefined,
          options,
        );
        if (result !== undefined) return stop(result);
        return next();
      };
      const sectionInject: Inject = (deps, handler) =>
        handlerOf(deps, handler, core.sectionCheck(deps), module, options);
      const sectionMiddleware: InjectMiddleware = (deps, middleware) =>
        middlewareOf(
          deps,
          middleware,
          core.sectionCheck(deps),
          module,
          options,
        );
      return Object.assign(section, {
        inject: sectionInject,
        injectMiddleware: sectionMiddleware,
      });
    },
    [Symbol.asyncDispose]: () => core.dispose(),
  };
}
