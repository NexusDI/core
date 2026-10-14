import {
  BlueprintError,
  isNexusError,
  type DepsMap,
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

/** One container per source: the Nexus itself, or the memoised build of the function. */
export function containerOf(source: ContainerSource): () => Promise<Nexus> {
  if (typeof source !== 'function') {
    const ready = Promise.resolve(source);
    return () => ready;
  }
  let pending: Promise<Nexus> | undefined;
  return () => {
    // Promise.resolve().then() turns a synchronous throw into a rejection.
    pending ??= Promise.resolve()
      .then(source)
      .catch((error: unknown) => {
        pending = undefined; // the next request builds again
        throw new ContainerBuildError({ cause: error });
      });
    return pending;
  };
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

/** 503 for ContainerBuildError and NEXUS_DISPOSED, 500 for any other NexusError, undefined for anything else. */
export function statusOf(error: unknown): 500 | 503 | undefined {
  if (error instanceof ContainerBuildError) return 503;
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
 * The default log: code, own enumerable fields and message for a NexusError;
 * phase and error otherwise. A 503 from a disposed container is a warning,
 * and a 503 from a failed build is an error (integrations spec 3.6). The
 * class tells the two apart, because P1 allows this file one core code.
 */
export function defaultLog(error: unknown, context: LogContext): void {
  const prefix = `[${context.adapter}] ${context.phase}:`;
  const write =
    context.status === 503 && !(error instanceof ContainerBuildError)
      ? console.warn
      : console.error;
  if (isNexusError(error))
    write(prefix, error.code, { ...error }, error.message);
  else write(prefix, error);
}

/**
 * Wraps the `log` option so a throw changes neither the response nor
 * disposal. The response may already be sent, and a throw from a close
 * listener becomes an unhandled rejection, so the guard writes both errors
 * with console.error and returns.
 */
export function guardLog(log: NexusLog): NexusLog {
  return (error, context) => {
    try {
      log(error, context);
    } catch (failure) {
      console.error(`[${context.adapter}] log threw:`, failure, error);
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

/** One promise per module and container; a failed load is forgotten. */
export function loader(
  container: () => Promise<Nexus>,
): (module: ModuleRef) => Promise<Nexus> {
  const loads = new WeakMap<Nexus, Map<ModuleRef, Promise<Nexus>>>();
  return async (module) => {
    const ship = await container();
    let byModule = loads.get(ship);
    if (byModule === undefined) {
      byModule = new Map();
      loads.set(ship, byModule);
    }
    const known = byModule.get(module);
    if (known !== undefined) return known;
    const pending = ship.load(module).then(() => ship);
    byModule.set(module, pending);
    const forget = byModule;
    pending.catch(() => forget.delete(module));
    return pending;
  };
}

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
