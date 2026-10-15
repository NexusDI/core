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
  enterSection,
  guardLog,
  loader,
  logLevel,
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

/** A mapped error becomes a logged NexusHttpError; anything else goes to Fastify unchanged. */
function mapped(error: unknown, log: NexusLog, phase: LogPhase): unknown {
  return statusOf(error) === undefined
    ? error
    : toHttpError(error, log, ADAPTER, phase);
}

/**
 * True for a RequestFinishedError: the response closed before the request's
 * first use of its scope, so scope() created none. No client reads a reply,
 * so this logs the error, takes the reply from Fastify and ends the raw
 * response (integrations spec 3.9).
 */
function finished(error: unknown, reply: FastifyReply, log: NexusLog): boolean {
  if (!(error instanceof RequestFinishedError)) return false;
  log(error, { adapter: ADAPTER, phase: 'scope' });
  reply.hijack();
  if (!reply.raw.writableEnded) reply.raw.end();
  return true;
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
      (error: unknown) => done(mapped(error, log, 'scope') as Error),
    );
  };
}

function handleOf(req: FastifyRequest): RequestScope {
  if (req.nexus === null || req.nexus === undefined)
    throw new Error(
      `[${ADAPTER}] no scope on this request: register di.plugin before this route`,
    );
  return req.nexus;
}

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
      const log = logOf(req);
      try {
        if (section !== undefined) await enterSection(load, section, req.nexus);
      } catch (error) {
        if (finished(error, reply, log)) return reply;
        throw mapped(error, log, 'load');
      }
      try {
        await check();
      } catch (error) {
        throw validateFailure(error, log, ADAPTER);
      }
      let resolved: ResolvedDeps<D>;
      try {
        resolved = (await handleOf(req).scope()).resolve(deps);
      } catch (error) {
        if (finished(error, reply, log)) return reply;
        throw mapped(error, log, 'scope');
      }
      return handler(resolved, req, reply);
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
        try {
          await enterSection(load, module, req.nexus);
        } catch (error) {
          const log = logOf(req);
          if (!finished(error, reply, log)) throw mapped(error, log, 'load');
        }
      };
      const sectionInject: Inject = (deps, handler) =>
        handlerOf(deps, handler, validator(container, deps), module);
      return Object.assign(hook, { inject: sectionInject });
    },
  };
}
