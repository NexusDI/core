import type {
  FastifyBaseLogger,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler,
  onRequestHookHandler,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
  RouteHandlerMethod,
} from 'fastify';
import fp from 'fastify-plugin';

import {
  isNexusError,
  type ModuleRef,
  type Nexus,
  type Scope,
} from '@nexusdi/core';

import {
  containerOf,
  defaultLog,
  definitionCheck,
  disposer,
  enterFor,
  guardLog,
  loader,
  logLevel,
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

declare module 'fastify' {
  interface FastifyRequest {
    /** The request's scope handle, set by di.plugin's onRequest hook. */
    nexus: RequestScope | null;
  }
}

const ADAPTER = '@nexusdi/fastify';

export type NexusFastifyOptions = RequestOption<FastifyRequest> & {
  readonly scopes?: ScopeRunner;
  readonly log?: NexusLog;
};

export type FastifyHandler<
  D extends DepsMap,
  G extends RouteGenericInterface,
> = (
  deps: ResolvedDeps<D>,
  req: FastifyRequest<G>,
  reply: FastifyReply<G>,
) => unknown;

type Route<G extends RouteGenericInterface> = RouteHandlerMethod<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  G
>;

type Inject = <
  const D extends DepsMap,
  G extends RouteGenericInterface = RouteGenericInterface,
>(
  deps: D,
  handler: FastifyHandler<D, G>,
) => Route<G>;

export interface SectionHook extends onRequestAsyncHookHandler {
  /** Like di.inject, validated after the section's first successful load. */
  inject: Inject;
}

export interface NexusFastify {
  readonly plugin: FastifyPluginAsync;
  /** The same plugin without fastify-plugin's skip-override: scoped to the context it is registered in. */
  readonly encapsulatedPlugin: FastifyPluginAsync;
  inject: Inject;
  scope(req: FastifyRequest): Promise<Scope>;
  load(module: ModuleRef): SectionHook;
}

/**
 * The default log: the request's own logger, so the line carries Fastify's
 * request id, with a NexusError's code and fields as structured keys
 * (integrations spec 6.3).
 */
function requestLog(logger: FastifyBaseLogger): NexusLog {
  return (error, context) => {
    const level = logLevel(error, context);
    if (isNexusError(error))
      logger[level]({ ...error, code: error.code, ...context }, error.message);
    else logger[level]({ err: error, ...context }, `${context.phase} failed`);
  };
}

/**
 * Ends a stopped request: a failure is thrown to Fastify's error handler,
 * and a finished request's reply is taken from Fastify and its raw response
 * ended, since no client reads it.
 */
function stop(result: Stop, reply: FastifyReply): FastifyReply {
  if ('failure' in result) throw result.failure;
  reply.hijack();
  if (!reply.raw.writableEnded) reply.raw.end();
  return reply;
}

/** The onRequest hook, exported for tests. Callback style, so scopes.run(scope, done) carries the scope. */
export function requestHook(
  container: () => Promise<Nexus>,
  options: NexusFastifyOptions,
  logOf: (req: FastifyRequest) => NexusLog,
): onRequestHookHandler {
  return (req, reply, done) => {
    const log = logOf(req);
    const handle = requestScope(container, () => options.request?.(req));
    const dispose = disposer(handle, log, ADAPTER);
    // Set before the early return, so a route that still runs finds a
    // closed handle: its scope() rejects with RequestFinishedError, and the
    // route ends the reply without a 500.
    req.nexus = handle;
    if (reply.raw.closed) {
      void dispose(); // nothing was created; Fastify still needs done() to end the lifecycle
      done();
      return;
    }
    reply.raw.once('close', () => void dispose());
    if (options.scopes === undefined) {
      done(); // inject creates the scope on first use
      return;
    }
    const scopes = options.scopes;
    handle.scope().then(
      (scope) => scopes.run(scope, () => done()),
      (error: unknown) => done(mapError(error, log, ADAPTER, 'scope') as Error),
    );
  };
}

const handleOf = (req: FastifyRequest): RequestScope =>
  requireHandle(req.nexus, ADAPTER, 'di.plugin');

export function nexus(
  ship: ContainerSource,
  ...args: OptionsArg<NexusFastifyOptions>
): NexusFastify {
  const options = (args[0] ?? {}) as NexusFastifyOptions;
  // At route definition no request exists, so the console default applies.
  const definitionLog = guardLog(options.log ?? defaultLog);
  const logOf = (req: FastifyRequest): NexusLog =>
    guardLog(options.log ?? requestLog(req.log));
  const container = containerOf(ship);
  const load = loader(container);

  const register: FastifyPluginAsync = async (fastify) => {
    fastify.decorateRequest('nexus', null);
    fastify.addHook('onRequest', requestHook(container, options, logOf));
  };

  const handlerOf = <D extends DepsMap, G extends RouteGenericInterface>(
    deps: D,
    handler: FastifyHandler<D, G>,
    check: () => Promise<void>,
    section?: ModuleRef,
  ): Route<G> => {
    const run = async (
      req: FastifyRequest<G>,
      reply: FastifyReply<G>,
    ): Promise<unknown> => {
      const result = await resolveFor({
        handle: () => handleOf(req),
        deps,
        checked: check,
        load,
        section,
        log: logOf(req),
        adapter: ADAPTER,
      });
      if (!('deps' in result)) return stop(result, reply);
      return handler(result.deps, req, reply);
    };
    // A RouteHandlerMethod's return type follows G's Reply. The handler's
    // return is unknown, as FastifyHandler declares it, so only the return
    // is cast; the parameters keep their checked types.
    return (req, reply) => run(req, reply) as ReturnType<Route<G>>;
  };

  return {
    plugin: fp(register, { name: ADAPTER, fastify: '5.x' }),
    encapsulatedPlugin: register,
    inject: (deps, handler) =>
      handlerOf(
        deps,
        handler,
        definitionCheck(ship, container, deps, definitionLog, ADAPTER),
      ),
    scope: async (req) => handleOf(req).scope(),
    load(module) {
      const hook: onRequestAsyncHookHandler = async (req, reply) => {
        const result = await enterFor({
          load,
          section: module,
          handle: req.nexus,
          log: logOf(req),
          adapter: ADAPTER,
        });
        if (result !== undefined) stop(result, reply);
      };
      const sectionInject: Inject = (deps, handler) =>
        handlerOf(deps, handler, validator(container, deps), module);
      return Object.assign(hook, { inject: sectionInject });
    },
  };
}
