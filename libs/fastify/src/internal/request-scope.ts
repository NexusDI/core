import {
  BlueprintError,
  isNexusError,
  loadOnce,
  type DepsMap,
  type LoadOptions,
  type LookupOptions,
  type ModuleRef,
  type Nexus,
  type NexusRequest,
  type ResolvedDeps,
  type Scope,
} from '@nexusdi/core';

/**
 * The request scope every server adapter shares. Each adapter carries a
 * byte-identical copy (integrations spec 3.7, P4's named exception), and
 * tools/repo-checks/src/adapter-shared-copies.test.ts fails when two copies
 * differ. The file names no adapter: callers pass their package name.
 */

export type { DepsMap, ResolvedDeps };

/** A live container, or a function that builds one on the first request. */
export type ContainerSource = Nexus | (() => Promise<Nexus>);

export type LogPhase = 'build' | 'scope' | 'load' | 'validate' | 'dispose';

/** What the adapter passes to `log` beside the error: its package name, the phase that failed and, for a mapped error, the status it answered. */
export interface LogContext {
  readonly adapter: string;
  readonly phase: LogPhase;
  readonly status?: 500 | 503;
}

/** The `log` option. `error` is unknown: a disposer or a build may throw anything. */
export type NexusLog = (error: unknown, context: LogContext) => void;

/** What the `scopes` option takes: nodeScopes() from @nexusdi/node, or any object with run(). */
export interface ScopeRunner {
  run<R>(scope: Scope, fn: () => R): R;
}

export type RequestMapping<Input> = (
  input: Input,
) => NexusRequest | Promise<NexusRequest>;

/** `request` is required when the app's NexusRequest has a required field. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} stands for a request with no fields, so the conditional asks whether NexusRequest requires one
export type RequestOption<Input> = {} extends NexusRequest
  ? { readonly request?: RequestMapping<Input> }
  : { readonly request: RequestMapping<Input> };

/** The options argument of nexus(): optional exactly when `request` is. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} stands for a request with no fields, so the conditional asks whether NexusRequest requires one
export type OptionsArg<O> = {} extends NexusRequest
  ? [options?: O]
  : [options: O];

/** Raised around any rejection of the function form's build. Maps to 503. */
export class ContainerBuildError extends Error {
  constructor(options: { cause: unknown }) {
    super('the container failed to build', options);
    this.name = 'ContainerBuildError';
  }
}

/** Raised by the container getter after close(): the adapter was disposed. Maps to 503. */
export class AdapterDisposedError extends Error {
  constructor() {
    super('the adapter was disposed');
    this.name = 'AdapterDisposedError';
  }
}

/** Raised by scope() after close(): the request has finished. */
export class RequestFinishedError extends Error {
  constructor() {
    super('the request has finished');
    this.name = 'RequestFinishedError';
  }
}

const STATUS_TEXT = {
  500: 'Internal Server Error',
  503: 'Service Unavailable',
} as const;

/** The error an adapter hands its framework: status, status text as message, the original as cause, no `code`. */
export class NexusHttpError extends Error {
  readonly status: 500 | 503;
  readonly statusCode: 500 | 503;
  readonly expose = false as const;

  constructor(status: 500 | 503, options: { cause: unknown }) {
    super(STATUS_TEXT[status], options);
    this.name = 'NexusHttpError';
    this.status = status;
    this.statusCode = status;
  }
}

/** A request's scope handle: the adapter creates the scope on the first `scope()` call and disposes it when the response ends. */
export interface RequestScope {
  /** Creates the scope on the first call; every later call returns the same promise. */
  scope(): Promise<Scope>;
  /** True once scope() has been called. */
  readonly started: boolean;
}

export interface ClosableRequestScope extends RequestScope {
  /** Disposes the scope if one was started, and refuses a later first use. */
  close(): Promise<void>;
}

/** A source's container, and the close that ends the adapter's use of it. */
export interface ContainerGetter {
  /** The Nexus itself, or the memoised build of the function. Rejects with AdapterDisposedError after close(). */
  (): Promise<Nexus>;
  /**
   * Refuses every later call, then disposes the container the function
   * built, after waiting for a build in flight. A given Nexus belongs to the
   * caller and stays open. A second call returns the first call's promise.
   */
  close(): Promise<void>;
}

/** One container per source: the Nexus itself, or the memoised build of the function, until close(). */
export function containerOf(source: ContainerSource): ContainerGetter {
  let closed: Promise<void> | undefined;
  const refused = () => Promise.reject(new AdapterDisposedError());
  if (typeof source !== 'function') {
    const ready = Promise.resolve(source);
    return Object.assign(() => (closed === undefined ? ready : refused()), {
      close: () => (closed ??= Promise.resolve()),
    });
  }
  let pending: Promise<Nexus> | undefined;
  const get = (): Promise<Nexus> => {
    if (closed !== undefined) return refused();
    // Promise.resolve().then() turns a synchronous throw into a rejection.
    pending ??= Promise.resolve()
      .then(source)
      .catch((error: unknown) => {
        pending = undefined; // the next request builds again, unless closed
        throw new ContainerBuildError({ cause: error });
      });
    return pending;
  };
  const dispose = async (built: Promise<Nexus>): Promise<void> => {
    const ship = await built.catch(() => undefined); // a failed build built nothing
    await ship?.[Symbol.asyncDispose]();
  };
  return Object.assign(get, {
    close(): Promise<void> {
      if (closed === undefined) {
        const built = pending;
        pending = undefined; // the loader and validator caches go with the container
        closed = built === undefined ? Promise.resolve() : dispose(built);
      }
      return closed;
    },
  });
}

export function requestScope(
  container: () => Promise<Nexus>,
  request: () => NexusRequest | undefined | Promise<NexusRequest | undefined>,
): ClosableRequestScope {
  let pending: Promise<Scope> | undefined;
  let closed = false;
  return {
    get started() {
      return pending !== undefined;
    },
    scope() {
      if (closed) return Promise.reject(new RequestFinishedError());
      pending ??= container().then(async (ship) =>
        ship.createScope({ request: await request() }),
      );
      return pending;
    },
    async close() {
      closed = true;
      if (pending === undefined) return;
      const scope = await pending.catch(() => undefined); // a failed create built nothing
      await scope?.[Symbol.asyncDispose]();
    },
  };
}

/** A RequestScope over a scope the caller owns: scope() returns it, close() disposes nothing. */
export function existingScope(scope: Scope): ClosableRequestScope {
  const ready = Promise.resolve(scope);
  return {
    started: true,
    scope: () => ready,
    close: () => Promise.resolve(),
  };
}

/** 503 for ContainerBuildError, AdapterDisposedError and NEXUS_DISPOSED, 500 for any other NexusError, undefined for anything else. */
export function statusOf(error: unknown): 500 | 503 | undefined {
  if (error instanceof ContainerBuildError) return 503;
  if (error instanceof AdapterDisposedError) return 503;
  if (isNexusError(error, 'NEXUS_DISPOSED')) return 503;
  if (isNexusError(error)) return 500;
  return undefined;
}

/**
 * Logs once through `log` and returns a NexusHttpError for a mapped error;
 * rethrows anything else unchanged. A ContainerBuildError logs with phase
 * 'build' at every step, because the build is what failed.
 */
export function toHttpError(
  error: unknown,
  log: NexusLog,
  adapter: string,
  phase: LogPhase,
): NexusHttpError {
  const status = statusOf(error);
  if (status === undefined) throw error;
  const at = error instanceof ContainerBuildError ? 'build' : phase;
  log(error, { adapter, phase: at, status });
  return new NexusHttpError(status, { cause: error });
}

/**
 * The level a log writes an error at. A 503 from a disposed container is a
 * warning, and a 503 from a failed build is an error (integrations spec
 * 3.6). The class tells the two apart, because P1 allows this file one core
 * code.
 */
export function logLevel(
  error: unknown,
  context: LogContext,
): 'warn' | 'error' {
  return context.status === 503 && !(error instanceof ContainerBuildError)
    ? 'warn'
    : 'error';
}

/** The default log: code, own enumerable fields and message for a NexusError; phase and error otherwise, at logLevel. */
export function defaultLog(error: unknown, context: LogContext): void {
  const prefix = `[${context.adapter}] ${context.phase}:`;
  const write =
    logLevel(error, context) === 'warn' ? console.warn : console.error;
  if (isNexusError(error))
    write(prefix, error.code, { ...error }, error.message);
  else write(prefix, error);
}

/**
 * Wraps the `log` option so a throw changes neither the response nor
 * disposal. The response may already be sent, and a throw from a close
 * listener becomes an unhandled rejection, so the guard writes both errors
 * with console.error and returns. A void return type accepts an async
 * function, so the guard also catches a returned promise that rejects.
 */
export function guardLog(log: NexusLog): NexusLog {
  return (error, context) => {
    const report = (failure: unknown) =>
      console.error(`[${context.adapter}] log threw:`, failure, error);
    try {
      const result: unknown = log(error, context);
      if (
        typeof (result as PromiseLike<unknown> | undefined)?.then === 'function'
      )
        Promise.resolve(result).catch(report);
    } catch (failure) {
      report(failure);
    }
  };
}

/** One log call per inner error of a BlueprintError, one call for anything else. */
export function logEach(
  error: unknown,
  log: NexusLog,
  adapter: string,
  phase: LogPhase,
): void {
  const errors = error instanceof BlueprintError ? error.errors : [error];
  for (const inner of errors) log(inner, { adapter, phase });
}

/**
 * What a handler passes on when validator() fails on a request. A 500 logs
 * one line per failing entry through logEach and becomes a NexusHttpError;
 * a 503 goes through toHttpError; an unmapped error comes back unchanged.
 */
export function validateFailure(
  error: unknown,
  log: NexusLog,
  adapter: string,
): unknown {
  const status = statusOf(error);
  if (status === undefined) return error;
  if (status === 503) return toHttpError(error, log, adapter, 'validate');
  logEach(error, log, adapter, 'validate');
  return new NexusHttpError(500, { cause: error });
}

/**
 * Checks deps at route definition for a live container: logs each failing
 * entry and rethrows, so the app fails at startup. A function source has no
 * container yet; validator() checks it on the first request.
 */
export function validateNow(
  source: ContainerSource,
  deps: DepsMap,
  log: NexusLog,
  adapter: string,
): void {
  if (typeof source === 'function') return;
  try {
    source.validate(deps);
  } catch (error) {
    logEach(error, log, adapter, 'validate');
    throw error;
  }
}

/** Calls fn at most once; later calls return the first call's promise. */
export function once(fn: () => Promise<void>): () => Promise<void> {
  let done: Promise<void> | undefined;
  return () => (done ??= fn());
}

/** A section's load: the module and the modules it imports, loaded once per container by loadOnce. */
export type SectionLoad = (
  module: ModuleRef,
  options?: LoadOptions,
) => Promise<void>;

/** validate(deps) at most once per container, caching a failure. */
export function validator(
  container: () => Promise<Nexus>,
  deps: DepsMap,
  options?: LookupOptions,
): () => Promise<void> {
  const checks = new WeakMap<Nexus, Promise<void>>();
  return async () => {
    const ship = await container();
    let check = checks.get(ship);
    if (check === undefined) {
      check = Promise.resolve().then(() => ship.validate(deps, options));
      checks.set(ship, check);
    }
    return check;
  };
}

/** The request's dispose step: close() at most once, a disposal error logged with phase 'dispose' and never thrown (integrations spec 3.4). */
export function disposer(
  handle: ClosableRequestScope,
  log: NexusLog,
  adapter: string,
): () => Promise<void> {
  return once(() =>
    handle
      .close()
      .catch((error: unknown) => log(error, { adapter, phase: 'dispose' })),
  );
}

/**
 * A section's step before its handlers: loads the module, then extends the
 * request's scope if it has started, so a token from the module resolves
 * (integrations spec 3.9).
 */
export async function enterSection(
  load: SectionLoad,
  module: ModuleRef,
  handle: RequestScope | null | undefined,
  options?: LoadOptions,
): Promise<void> {
  await load(module, options);
  if (handle?.started === true) await (await handle.scope()).extend();
}

/**
 * inject's check at route definition: validateNow for a live container, and
 * a validator() that runs on the first request for the function form.
 */
export function definitionCheck(
  source: ContainerSource,
  container: () => Promise<Nexus>,
  deps: DepsMap,
  log: NexusLog,
  adapter: string,
): () => Promise<void> {
  validateNow(source, deps, log, adapter);
  return typeof source === 'function'
    ? validator(container, deps)
    : () => Promise.resolve();
}

/** The request's handle, or the error that tells the user which hook to register. */
export function requireHandle(
  handle: RequestScope | null | undefined,
  adapter: string,
  hook: string,
): RequestScope {
  if (handle === null || handle === undefined)
    throw new Error(
      `[${adapter}] no scope on this request: register ${hook} before this route`,
    );
  return handle;
}

/** A mapped error becomes a logged NexusHttpError; anything else comes back unchanged. */
export function mapError(
  error: unknown,
  log: NexusLog,
  adapter: string,
  phase: LogPhase,
): unknown {
  return statusOf(error) === undefined
    ? error
    : toHttpError(error, log, adapter, phase);
}

/**
 * What a request step ends in when it does not go on: `finished` when the
 * response closed before the request's first use of its scope, so scope()
 * created none (logged here, integrations spec 3.9), or the `failure` the
 * adapter hands its framework, already mapped and logged.
 */
export type Stop = { readonly finished: true } | { readonly failure: unknown };

function stopFor(
  error: unknown,
  log: NexusLog,
  adapter: string,
  phase: LogPhase,
): Stop {
  if (error instanceof RequestFinishedError) {
    log(error, { adapter, phase: 'scope' });
    return { finished: true };
  }
  return { failure: mapError(error, log, adapter, phase) };
}

/** A section's step before its handlers (enterSection); undefined when the request goes on. */
export async function enterFor(step: {
  readonly load: SectionLoad;
  readonly section: ModuleRef;
  readonly options?: LoadOptions;
  readonly handle: RequestScope | null | undefined;
  readonly log: NexusLog;
  readonly adapter: string;
}): Promise<Stop | undefined> {
  try {
    await enterSection(step.load, step.section, step.handle, step.options);
    return undefined;
  } catch (error) {
    return stopFor(error, step.log, step.adapter, 'load');
  }
}

/**
 * inject's request path: the section's load, the deps check, then the deps
 * resolved from the request's scope, each failure mapped for its phase.
 */
export async function resolveFor<D extends DepsMap>(step: {
  readonly handle: () => RequestScope;
  readonly deps: D;
  /** The deps check: definitionCheck's result, or a validator() for a section. */
  readonly checked: () => Promise<void>;
  readonly load: SectionLoad;
  readonly section?: ModuleRef;
  readonly options?: LoadOptions;
  readonly log: NexusLog;
  readonly adapter: string;
}): Promise<{ readonly deps: ResolvedDeps<D> } | Stop> {
  const { log, adapter } = step;
  if (step.section !== undefined) {
    let handle: RequestScope | undefined;
    try {
      handle = step.handle();
    } catch {
      handle = undefined;
    }
    const stop = await enterFor({
      load: step.load,
      section: step.section,
      options: step.options,
      handle,
      log,
      adapter,
    });
    if (stop !== undefined) return stop;
  }
  try {
    await step.checked();
  } catch (error) {
    return { failure: validateFailure(error, log, adapter) };
  }
  try {
    return { deps: (await step.handle().scope()).resolve(step.deps) };
  } catch (error) {
    return stopFor(error, log, adapter, 'scope');
  }
}

/**
 * The steps every adapter's nexus() starts from, bound to one container
 * source: the guarded log, the request handle and its dispose step, the
 * ambient scope, the definition-time and section checks, and the request
 * path. An adapter adds only its framework's hook and its answers.
 */
export function adapterCore(
  ship: ContainerSource,
  options: { readonly log?: NexusLog },
  adapter: string,
) {
  const log = guardLog(options.log ?? defaultLog);
  const container = containerOf(ship);
  const load: SectionLoad = async (module, options) =>
    loadOnce(await container())(module, options);
  return {
    log,
    /** A request's lazy handle, and its dispose step (disposer), logged through `requestLog` when given. */
    open(
      request: () =>
        NexusRequest | undefined | Promise<NexusRequest | undefined>,
      requestLog: NexusLog = log,
    ) {
      const handle = requestScope(container, request);
      return { handle, dispose: disposer(handle, requestLog, adapter) };
    },
    /** The ambient scope of the scopes option, created at once; on failure the request is disposed and the error mapped. */
    async ambient(
      handle: ClosableRequestScope,
      dispose: () => Promise<void>,
      requestLog: NexusLog = log,
    ): Promise<{ readonly scope: Scope } | { readonly failure: unknown }> {
      try {
        return { scope: await handle.scope() };
      } catch (error) {
        await dispose();
        return { failure: mapError(error, requestLog, adapter, 'scope') };
      }
    },
    /** inject's check: definitionCheck for this source. */
    definition: (deps: DepsMap) =>
      definitionCheck(ship, container, deps, log, adapter),
    /** A section inject's check, which runs after the section's first load. */
    sectionCheck: (deps: DepsMap) => validator(container, deps),
    /** resolveFor, bound to this container. */
    resolve: <D extends DepsMap>(step: {
      readonly handle: () => RequestScope;
      readonly deps: D;
      readonly checked: () => Promise<void>;
      readonly section?: ModuleRef;
      readonly options?: LoadOptions;
      readonly log?: NexusLog;
    }) => resolveFor({ ...step, load, log: step.log ?? log, adapter }),
    /** enterFor, bound to this container. */
    enter: (
      section: ModuleRef,
      handle: RequestScope | null | undefined,
      requestLog: NexusLog = log,
      options?: LoadOptions,
    ) => enterFor({ load, section, options, handle, log: requestLog, adapter }),
    /** The handle's [Symbol.asyncDispose]: closes the container getter (containerOf). */
    dispose: (): Promise<void> => container.close(),
  };
}
