import {
  REQUEST_ID,
  type Binding,
  type Blueprint,
  type ProviderRecord,
} from '../blueprint/blueprint.js';
import { pluginFailed } from '../blueprint/hooks.js';
import { providerViewIn } from '../blueprint/views.js';
import { HOOK_SITES } from '../definitions/hook-sites.js';
import { unreachable } from '../definitions/unreachable.js';
import {
  AsyncTransientError,
  LazyAsyncError,
  ModuleOptionsError,
  NexusError,
  NotReadyError,
  ProviderError,
  ScopeRequiredError,
} from '../errors/index.js';
import { constructionStack } from './construction-stack.js';
import { fromUserCode } from './format.js';
import { hasDisposer } from './dispose.js';
import { makeListThunk, makeThunk } from './lazy.js';
import { isObject } from './ownership.js';
import type {
  ContainerState,
  Ctx,
  Owner,
  RootState,
  Run,
  TransientOwner,
} from './state.js';
import type { RunTrace } from './trace.js';

export function moduleName(bp: Blueprint, record: ProviderRecord): string {
  return bp.modules.get(record.module)?.name ?? record.module;
}

export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    isObject(value) && typeof (value as { then?: unknown }).then === 'function'
  );
}

function recordOf(bp: Blueprint, id: string): ProviderRecord {
  const record = bp.providers.get(id);
  if (record === undefined) return unreachable();
  return record;
}

/**
 * The ProviderError of a build failure: construct's catch, a failed
 * construct hook (`constructFailed`) and a failed onInit. When the failure
 * happens while construct's own stack frame is still on, `path` defaults to
 * the construction stack. A failure that runs after that frame has popped
 * passes `path` explicitly, with the provider's own name appended.
 */
function buildFailed(
  bp: Blueprint,
  record: ProviderRecord,
  cause: unknown,
  path: readonly string[] = constructionStack.names(),
): ProviderError {
  return new ProviderError(
    {
      token: record.name,
      module: moduleName(bp, record),
      path,
      alsoFailed: [],
      disposalErrors: [],
    },
    { cause },
  );
}

/** Records an instance for disposal by `owner`, unless another container or a useValue holds it. */
export function adopt(
  owner: Owner,
  record: ProviderRecord,
  instance: unknown,
): void {
  if (isObject(instance) && owner.root.ownership.claim(instance)) {
    owner.owned.push({
      instance,
      providerId: record.id,
      token: record.name,
    });
  }
}

/** The trace events of one build or onInit call. */
export type BuildEventType =
  | 'construct'
  | 'construct:await'
  | 'construct:failed'
  | 'init'
  | 'init:await'
  | 'init:failed';

/**
 * Emits one build event from one shape. Times are tracer.now() readings:
 * `start` at the call, `returned` when it returned, `resumed` when the
 * build resumed after its await. A value or alias provider passes no
 * times and reports a zero span at the emit instant. `parent` is the frame
 * on top of the construction stack at emit time: the build whose
 * constructor or factory this one ran inside. An observer's throw on a
 * failure event keeps the operation's own error (spec 3.5): it joins the
 * run's errors, or is dropped outside a run.
 */
export function traceBuild(
  type: BuildEventType,
  container: ContainerState,
  bp: Blueprint,
  id: string,
  run: Pick<RunTrace, 'id' | 'errors'> | undefined,
  level: number | null,
  isAsync: boolean,
  start?: number,
  returned?: number,
  resumed?: number,
): void {
  const tracer = container.root.tracer;
  try {
    tracer.emit(() => {
      const record = recordOf(bp, id);
      const end = tracer.now();
      const from = start ?? end;
      const back = returned ?? end;
      return {
        type,
        token: record.name,
        providerId: id,
        module: moduleName(bp, record),
        lifetime: record.lifetime,
        scope: container.scopeId,
        async: isAsync,
        run: run?.id ?? null,
        level,
        parent: constructionStack.top()?.providerId ?? null,
        startMs: from,
        syncMs: back - from,
        awaitMs: isAsync ? (resumed ?? end) - back : null,
        finishMs: end - (resumed ?? end),
        durationMs: end - from,
      };
    });
  } catch (error) {
    if (!type.endsWith('failed')) throw error;
    if (run) (run.errors ??= []).push(error);
  }
}

/** Observes a thenable nothing will await, so its rejection is never unhandled. */
export function observeRejection(value: unknown): void {
  Promise.resolve(value).catch(() => undefined);
}

function resolveBinding(
  binding: Binding,
  owner: ProviderRecord,
  ctx: Ctx,
): unknown {
  switch (binding.kind) {
    case 'required': {
      const [id] = binding.ids;
      if (id === undefined) return unreachable();
      return resolveId(id, ctx);
    }
    case 'optional': {
      const [id] = binding.ids;
      return id === undefined ? undefined : resolveId(id, ctx);
    }
    case 'all':
      return binding.ids.map((id) => resolveId(id, ctx));
    case 'lazy': {
      const [id] = binding.ids;
      if (id === undefined) return unreachable();
      return makeThunk(id, owner, ctx, resolveId);
    }
    case 'lazy-all':
      return makeListThunk(binding.ids, owner, ctx, resolveId);
  }
}

/**
 * Calls a class constructor or a factory with its deps, inside a stack frame.
 * A class instance then receives its injected properties. A thrown value that
 * is not a NexusError becomes a ProviderError naming this provider and the
 * stack that led to it.
 */
export function construct(record: ProviderRecord, ctx: Ctx): unknown {
  const bindings = ctx.bp.bindings.get(record.id);
  return constructionStack.run(
    { providerId: record.id, container: ctx.container, name: record.name },
    () => {
      try {
        const args =
          bindings?.args.map((binding) =>
            resolveBinding(binding, record, ctx),
          ) ?? [];
        // The inner catches mark a NexusError the user's constructor,
        // setter or factory threw; a dependency's error passes unmarked.
        if (record.kind === 'class' && record.useClass !== undefined) {
          let instance: unknown;
          try {
            instance = new record.useClass(...args);
          } catch (error) {
            throw fromUserCode(error);
          }
          bindings?.props.forEach((binding, i) => {
            const prop = record.props[i];
            if (prop === undefined || !isObject(instance)) return;
            const value = resolveBinding(binding, record, ctx);
            try {
              prop.set(instance, value);
            } catch (error) {
              throw fromUserCode(error);
            }
          });
          return instance;
        }
        try {
          return record.useFactory?.(...args);
        } catch (error) {
          throw fromUserCode(error);
        }
      } catch (error) {
        if (error instanceof NexusError) throw error;
        throw buildFailed(ctx.bp, record, error);
      }
    },
  );
}

/** The ProviderError a failing construct hook raises, as a failing constructor would. */
function constructFailed(
  bp: Blueprint,
  record: ProviderRecord,
  plugin: string,
  cause: unknown,
): ProviderError {
  return buildFailed(bp, record, pluginFailed(plugin, 'construct', cause), [
    ...constructionStack.names(),
    record.name,
  ]);
}

/**
 * Hands a built instance to `owner` for disposal. An untracked owner (a root
 * transient, a singleton's thunk) owns nothing, so an instance with a
 * disposer produces an `untracked` event, the leak the trace names.
 */
export function takeOwnership(
  root: RootState,
  owner: TransientOwner,
  record: ProviderRecord,
  instance: unknown,
): void {
  if (typeof owner !== 'string') {
    adopt(owner, record, instance);
  } else if (hasDisposer(instance)) {
    root.tracer.emit(() => ({
      type: 'untracked',
      token: record.name,
      providerId: record.id,
      reason: owner,
    }));
  }
}

/**
 * Runs every construct hook over a class or factory instance, in plugin
 * order, each on the previous result; `undefined` keeps the instance. The
 * hooks are synchronous, because get() is, so a returned thenable fails the
 * build. A failed build hands the raw instance to `owner`, whose disposal
 * disposes it once; an earlier plugin's wrapper forwards to it and is never
 * disposed. With no construct hook it runs one length test. Each hook
 * receives `container`'s id and public handle.
 */
export function applyConstruct(
  container: ContainerState,
  owner: TransientOwner,
  bp: Blueprint,
  record: ProviderRecord,
  instance: unknown,
): unknown {
  const { root } = container;
  if (
    HOOK_SITES &&
    root.plugins.construct.length > 0 &&
    (record.kind === 'class' || record.kind === 'factory')
  ) {
    const hooks = root.plugins.construct;
    const view = providerViewIn(bp, record);
    let current = instance;
    for (const hook of hooks) {
      let next: unknown;
      try {
        next = hook.call(current, view, container.scopeId, container.handle);
      } catch (error) {
        takeOwnership(root, owner, record, instance);
        throw constructFailed(bp, record, hook.plugin, error);
      }
      if (next === undefined) continue;
      if (isThenable(next)) {
        observeRejection(next);
        takeOwnership(root, owner, record, instance);
        throw constructFailed(
          bp,
          record,
          hook.plugin,
          new TypeError(
            'returned a thenable; a construct hook is synchronous.',
          ),
        );
      }
      current = next;
    }
    return current;
  }
  return instance;
}

/**
 * Runs a configurable module's Standard Schema over its options and boxes
 * the output in `{ value }`. JavaScript's promise-resolution procedure
 * thenable-adopts an async function's return value whenever it has a `then`
 * method, no matter which branch produced it (the same hazard buildInto
 * guards a factory's result against). A bare return here would hang on a
 * validated value with its own `then`; the box has none of its own, so
 * callers can always await the call safely and unwrap `.value` afterward.
 */
export async function validateOptions(
  record: ProviderRecord,
  bp: Blueprint,
  value: unknown,
): Promise<{ readonly value: unknown }> {
  if (record.schema === undefined) return { value };
  const result = await record.schema['~standard'].validate(value);
  if (result.issues !== undefined) {
    throw new ModuleOptionsError({
      code: 'NEXUS_INVALID_MODULE_OPTIONS',
      module: moduleName(bp, record),
      issues: result.issues,
    });
  }
  return { value: result.value };
}

/**
 * Builds one provider of a level into `container`: root singletons for
 * create and load, scoped providers for createScope and extend(). Only a
 * factory's result is awaited (spec §6.1: a class provider stores its
 * constructed instance as is). Without the kind check, a class instance
 * that happens to expose a `then` method would be replaced by its resolved
 * value, or hang the caller forever waiting on a `then` that never calls
 * back. `owner` takes the instance and the transients built as its deps:
 * the container itself, or a run's own list, so a rollback disposes only
 * the run's builds.
 */
export async function buildInto(
  container: ContainerState,
  bp: Blueprint,
  id: string,
  owner: Owner,
  run: RunTrace,
  level: number,
): Promise<void> {
  const record = recordOf(bp, id);
  const { root } = container;
  const tracer = root.tracer;
  const start = tracer.now();
  let isAsync = false;
  let value: unknown;
  let returned: number | undefined;
  let resumed: number | undefined;
  // Every failure from the call to the store, an observer's throw on
  // construct:await included, ends the build with construct:failed.
  try {
    value = construct(record, { bp, container, owner });
    returned = tracer.now();
    if (record.kind === 'factory' && isThenable(value)) {
      isAsync = true;
      const pending = Promise.resolve(value);
      container.slots.begin(id, pending);
      try {
        traceBuild(
          'construct:await',
          container,
          bp,
          id,
          run,
          level,
          true,
          start,
          returned,
        );
      } catch (error) {
        // Nothing awaits the thenable now; a later rejection stays handled.
        observeRejection(pending);
        throw error;
      }
      try {
        value = await pending;
      } catch (error) {
        // The factory's promise is user code, so a NexusError it rejects
        // with, such as another container's, keeps its text.
        throw fromUserCode(error);
      }
    }
    // Every build yields once more before it stores, an async one after its
    // await too, so a level's builds store in the order rc.0 gave them: a
    // sync build ahead of an async sibling that settled at once. Construct
    // hooks and disposal follow that order.
    await 0;
    resumed = tracer.now();
    // Only an options provider carries a schema. The check skips the
    // validation's microtask for every other provider.
    if (record.schema !== undefined) {
      try {
        value = (await validateOptions(record, bp, value)).value;
      } catch (error) {
        // The rollback disposes the rejected output with what was built.
        adopt(owner, record, value);
        throw error;
      }
    }
    // After validation, so the schema checks the factory's own output and
    // the runtime stores what the construct hooks return.
    value = applyConstruct(container, owner, bp, record, value);
  } catch (error) {
    traceBuild(
      'construct:failed',
      container,
      bp,
      id,
      run,
      level,
      isAsync,
      start,
      returned,
      resumed,
    );
    throw error;
  }
  adopt(owner, record, value);
  container.slots.settle(id, value);
  // A root singleton becomes ready after its onInit, unless onInit is off.
  if (container !== root || !root.initEnabled) container.slots.markReady(id);
  if (record.kind === 'factory') root.asyncFlags.set(id, isAsync);
  traceBuild(
    'construct',
    container,
    bp,
    id,
    run,
    level,
    isAsync,
    start,
    returned,
    resumed,
  );
}

/** REQUEST resolves to the scope's request; from the root it has no value. */
export function requestOf(ctx: Ctx): unknown {
  if (ctx.container.kind === 'root') {
    throw new ScopeRequiredError({
      token: 'REQUEST',
      path: [...constructionStack.names(), 'REQUEST'],
      entry: null,
    });
  }
  return ctx.container.request;
}

/** The NotReadyError of a provider whose instance is not built yet. */
function notBuilt(record: ProviderRecord): NotReadyError {
  return new NotReadyError({
    owner: constructionStack.top()?.name ?? record.name,
    target: record.name,
    path: [],
  });
}

/**
 * A scoped provider: one instance per scope. An eager scoped factory was
 * built by createScope; a scoped class and an eager: false scoped factory
 * build here, on first use, and the scope owns them.
 */
export function resolveScoped(record: ProviderRecord, ctx: Ctx): unknown {
  const { container } = ctx;
  if (container.kind === 'root') {
    throw new ScopeRequiredError({
      token: record.name,
      path: [...constructionStack.names(), record.name],
      entry: null,
    });
  }
  if (container.slots.has(record.id)) {
    if (container.slots.isSettled(record.id))
      return container.slots.value(record.id);
    throw notBuilt(record);
  }
  // A scoped factory in the levels only builds in createScope's or
  // extend()'s own levels (spec §6.3); one missing from the scope's slots
  // has not been built yet. A deferred one builds here.
  if (record.kind === 'factory' && !ctx.bp.deferred.has(record.id))
    throw notBuilt(record);
  return buildOnDemand(record, ctx);
}

/**
 * Who builds a provider at its first request, and the run it joins. A
 * singleton builds into the root, a scoped provider into the scope that
 * asked. When a create, load or extend() of that container is running and
 * its blueprint added the provider, the run owns the instance, so a failed
 * run disposes and forgets it. Anything else joins the container at once,
 * so a failed load never disposes an instance a get() may already hold.
 */
function onDemandOwner(
  record: ProviderRecord,
  ctx: Ctx,
): {
  readonly container: ContainerState;
  readonly owner: Owner;
  readonly run: Run | undefined;
} {
  const container =
    record.lifetime === 'singleton' ? ctx.container.root : ctx.container;
  const run =
    container.run !== undefined && container.run.isNew(record.id)
      ? container.run
      : undefined;
  return { container, owner: run?.owner ?? container, run };
}

/**
 * Builds a provider at its first request, synchronously, into the container
 * that owns it: an eager: false singleton into the root, a scoped class or
 * an eager: false scoped factory into the scope (spec §6.3, §6.6). A
 * singleton's onInit runs right after the build. A thenable from the factory or from onInit is NEXUS_LAZY_ASYNC:
 * the runtime observes it, so its rejection is never unhandled, and stores
 * nothing, so the next request tries again. An instance that was built
 * joins its owner's creation order at once, whether or not a later step
 * fails, so the owner's disposal disposes it.
 */
export function buildOnDemand(record: ProviderRecord, ctx: Ctx): unknown {
  const { container, owner, run } = onDemandOwner(record, ctx);
  const root = container.root;
  // A lazy thunk that leads back to a provider still in its own build.
  if (constructionStack.contains(record.id, container)) {
    throw new NotReadyError({
      owner: constructionStack.top()?.name ?? record.name,
      target: record.name,
      path: constructionStack.cycleFrom(record.id, container),
    });
  }
  const lazyAsync = (value: unknown): LazyAsyncError => {
    observeRejection(value);
    return new LazyAsyncError({
      token: record.name,
      module: moduleName(ctx.bp, record),
    });
  };
  const tracer = root.tracer;
  let start = tracer.now();
  let isAsync = false;
  let returned: number | undefined;
  let instance: unknown;
  try {
    const built = construct(record, { bp: ctx.bp, container, owner });
    returned = tracer.now();
    isAsync = record.kind === 'factory' && isThenable(built);
    if (isAsync) throw lazyAsync(built);
    instance = applyConstruct(container, owner, ctx.bp, record, built);
  } catch (error) {
    traceBuild(
      'construct:failed',
      container,
      ctx.bp,
      record.id,
      run,
      null,
      isAsync,
      start,
      returned,
    );
    throw error;
  }
  adopt(owner, record, instance);
  // Settled before the construct event and before onInit, so a get() from
  // onInit returns the instance, as create settles a singleton first.
  container.slots.settle(record.id, instance);
  let traced: { readonly error: unknown } | undefined;
  try {
    // Reported before onInit, as a level build is (plan choice 4).
    traceBuild(
      'construct',
      container,
      ctx.bp,
      record.id,
      run,
      null,
      false,
      start,
      returned,
      returned,
    );
  } catch (error) {
    // The build finishes first, so the slot holds the one instance and the
    // next get() returns it; the observer's throw then reaches the caller.
    traced = { error };
  }
  if (
    record.lifetime === 'singleton' &&
    root.initEnabled &&
    isObject(instance) &&
    typeof (instance as { onInit?: unknown }).onInit === 'function' &&
    root.ownership.claimInit(instance)
  ) {
    start = tracer.now();
    let result: unknown;
    try {
      result = (instance as { onInit(): unknown }).onInit();
    } catch (error) {
      container.slots.abandon(record.id);
      traceBuild(
        'init:failed',
        root,
        ctx.bp,
        record.id,
        run,
        null,
        false,
        start,
      );
      throw error instanceof NexusError
        ? fromUserCode(error)
        : buildFailed(ctx.bp, record, error, [
            ...constructionStack.names(),
            record.name,
          ]);
    }
    // A thenable fails the build with NEXUS_LAZY_ASYNC, so its event is
    // init:failed with async: true (plan choice 5).
    isAsync = isThenable(result);
    try {
      traceBuild(
        isAsync ? 'init:failed' : 'init',
        root,
        ctx.bp,
        record.id,
        run,
        null,
        isAsync,
        start,
        tracer.now(),
      );
    } catch (error) {
      // As for the construct event above.
      traced ??= { error };
    }
    if (isAsync) {
      container.slots.abandon(record.id);
      throw lazyAsync(result);
    }
  }
  run?.touched.push(record.id);
  container.slots.markReady(record.id);
  if (record.kind === 'factory') root.asyncFlags.set(record.id, false);
  if (traced) throw traced.error;
  return instance;
}

function settledSingleton(record: ProviderRecord, ctx: Ctx): unknown {
  const slots = ctx.container.root.slots;
  if (slots.isSettled(record.id)) return slots.value(record.id);
  if (!slots.has(record.id) && ctx.bp.deferred.has(record.id))
    return buildOnDemand(record, ctx);
  throw notBuilt(record);
}

/**
 * Finishes a transient build from what `construct` returned. A defined
 * `start` marks a build with hooks: the construct hooks run over the
 * instance and the construct event reports `start` and `returned`, the
 * clock readings around `construct`. resolveId tests `root.buildHooks` once
 * and passes no readings when no plugin has a construct or observe hook.
 */
function buildTransient(
  record: ProviderRecord,
  ctx: Ctx,
  start: number | undefined,
  built: unknown,
  returned?: number,
): unknown {
  // Only a factory result is awaited (spec §6.1); a class instance with a
  // then method is an ordinary value.
  if (record.kind === 'factory' && isThenable(built)) {
    // get() cannot wait on it.
    observeRejection(built);
    // builtAsync reports a transient factory false until now.
    ctx.container.root.asyncFlags.set(record.id, true);
    throw new AsyncTransientError({
      token: record.name,
      module: moduleName(ctx.bp, record),
    });
  }
  // Each guard reads HOOK_SITES first, so esbuild drops the branch in the
  // off build.
  const instance =
    HOOK_SITES && start !== undefined
      ? applyConstruct(ctx.container, ctx.owner, ctx.bp, record, built)
      : built;
  takeOwnership(ctx.container.root, ctx.owner, record, instance);
  if (HOOK_SITES && start !== undefined)
    traceBuild(
      'construct',
      ctx.container,
      ctx.bp,
      record.id,
      undefined,
      null,
      false,
      start,
      returned,
      returned,
    );
  return instance;
}

/** The instance for a provider id, building it synchronously when its lifetime allows. */
export function resolveId(id: string, ctx: Ctx): unknown {
  if (id === REQUEST_ID) return requestOf(ctx);
  const record = recordOf(ctx.bp, id);
  if (record.kind === 'alias')
    return resolveId(ctx.bp.bindings.get(id)?.target ?? '', ctx);
  switch (record.lifetime) {
    case null:
    case 'singleton':
      return settledSingleton(record, ctx);
    case 'scoped':
      return resolveScoped(record, ctx);
    case 'transient':
      // JavaScript evaluates arguments left to right, so the first clock
      // reading precedes construct and the second follows it.
      return HOOK_SITES && ctx.container.root.buildHooks
        ? buildTransient(
            record,
            ctx,
            ctx.container.root.tracer.now(),
            construct(record, ctx),
            ctx.container.root.tracer.now(),
          )
        : buildTransient(record, ctx, undefined, construct(record, ctx));
  }
}
