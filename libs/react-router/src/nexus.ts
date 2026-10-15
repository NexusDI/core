import {
  createContext,
  type MiddlewareFunction,
  type Params,
  type RouterContextProvider,
} from 'react-router';

import type { ModuleRef, Scope } from '@nexusdi/core';

import { disposeWithBody } from './internal/dispose-with-body.js';
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

/** The status of a response nobody reads, because its client has gone. */
const CLIENT_GONE = 499;

/** The request's scope handle, which di.middleware sets on the router context. */
export const NEXUS_SCOPE = createContext<RequestScope>();

/** What the `request` option maps: the request and the route's params. */
export interface RequestInput {
  readonly request: Request;
  readonly params: Params;
}

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

export interface SectionMiddleware extends MiddlewareFunction<Response> {
  /** Like di.inject, validated after the section's first successful load. */
  readonly inject: Inject;
}

export interface NexusRouter {
  readonly middleware: MiddlewareFunction<Response>;
  readonly inject: Inject;
  scope(context: Readonly<RouterContextProvider>): Promise<Scope>;
  load(module: ModuleRef): SectionMiddleware;
}

/** The handle on the context, or undefined when di.middleware has not run. */
function handleIn(
  context: Readonly<RouterContextProvider>,
): RequestScope | undefined {
  try {
    return context.get(NEXUS_SCOPE);
  } catch {
    return undefined; // React Router throws for a context with no value and no default
  }
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

export function nexus(
  ship: ContainerSource,
  ...args: OptionsArg<NexusRouterOptions>
): NexusRouter {
  const options = (args[0] ?? {}) as NexusRouterOptions;
  const core = adapterCore(ship, options, ADAPTER);

  const middleware: MiddlewareFunction<Response> = async (
    { request, context, params },
    next,
  ) => {
    const { handle, dispose } = core.open(() =>
      options.request?.({ request, params }),
    );
    context.set(NEXUS_SCOPE, handle); // set before any return, so a late loader finds a closed handle
    if (request.signal.aborted) {
      await dispose(); // the client left before this ran: no scope, no loaders
      return new Response(null, { status: CLIENT_GONE });
    }
    request.signal.addEventListener('abort', () => void dispose(), {
      once: true,
    });
    let response: Response;
    if (options.scopes !== undefined) {
      const started = await core.ambient(handle, dispose);
      if ('failure' in started) throw toRouter(started.failure);
      response = await options.scopes.run(started.scope, next);
    } else {
      response = await next(); // loaders create the scope on first use
    }
    return disposeWithBody(response, dispose, request.method);
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
