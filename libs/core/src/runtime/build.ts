import {
  REQUEST_ID,
  type Binding,
  type Blueprint,
  type ProviderRecord,
} from '../blueprint/blueprint.js';
import { pluginFailed } from '../blueprint/hooks.js';
import { providerView, type ProviderView } from '../blueprint/views.js';
import {
  AsyncTransientError,
  LazyAsyncError,
  NexusError,
  NotReadyError,
  ProviderError,
  ScopeRequiredError,
} from '../errors/index.js';
import { constructionStack } from './construction-stack.js';
import { fromUserCode } from './format.js';
import { hasDisposer } from './dispose.js';
import { makeThunk } from './lazy.js';
import { isObject } from './ownership.js';
import type {
  ContainerState,
  Ctx,
  Owner,
  RootState,
  Run,
  TransientOwner,
} from './state.js';

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
  if (record === undefined)
    throw new Error(`@nexusdi/core: no provider ${id} in the blueprint`);
  return record;
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

export function traceConstruct(
  container: ContainerState,
  bp: Blueprint,
  record: ProviderRecord,
  isAsync: boolean,
  start?: number,
): void {
  const tracer = container.root.tracer;
  tracer.emit(() => ({
    type: 'construct',
    token: record.name,
    providerId: record.id,
    module: moduleName(bp, record),
    lifetime: record.lifetime,
    scope: container.scopeId,
    async: isAsync,
    durationMs: start === undefined ? 0 : tracer.now() - start,
  }));
}

function resolveBinding(
  binding: Binding,
  owner: ProviderRecord,
  ctx: Ctx,
): unknown {
  switch (binding.kind) {
    case 'required': {
      const [id] = binding.ids;
      if (id === undefined)
        throw new Error('internal: a required binding has no provider');
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
      if (id === undefined)
        throw new Error('internal: a lazy binding has no provider');
      return makeThunk(id, owner, ctx, resolveId);
    }
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
        throw new ProviderError(
          {
            token: record.name,
            module: moduleName(ctx.bp, record),
            path: constructionStack.names(),
            alsoFailed: [],
            disposalErrors: [],
          },
          { cause: error },
        );
      }
    },
  );
}

const PROVIDER_VIEWS = new WeakMap<Blueprint, Map<string, ProviderView>>();

/** The view construct hooks receive: one frozen object per provider per blueprint. */
function providerViewIn(bp: Blueprint, record: ProviderRecord): ProviderView {
  let views = PROVIDER_VIEWS.get(bp);
  if (views === undefined) {
    views = new Map();
    PROVIDER_VIEWS.set(bp, views);
  }
  let view = views.get(record.id);
  if (view === undefined) {
    view = providerView(record, bp.rewrittenBy.get(record.id) ?? null);
    views.set(record.id, view);
  }
  return view;
}

/** The ProviderError a failing construct hook raises, as a failing constructor would. */
function constructFailed(
  bp: Blueprint,
  record: ProviderRecord,
  plugin: string,
  cause: unknown,
): ProviderError {
  return new ProviderError(
    {
      token: record.name,
      module: moduleName(bp, record),
      path: [...constructionStack.names(), record.name],
      alsoFailed: [],
      disposalErrors: [],
    },
    { cause: pluginFailed(plugin, 'construct', cause) },
  );
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
 * disposed. With no construct hook it runs one length test.
 */
export function applyConstruct(
  root: RootState,
  owner: TransientOwner,
  bp: Blueprint,
  record: ProviderRecord,
  instance: unknown,
  scope: string | null,
): unknown {
  const hooks = root.plugins.construct;
  if (
    hooks.length === 0 ||
    (record.kind !== 'class' && record.kind !== 'factory')
  )
    return instance;
  const view = providerViewIn(bp, record);
  let current = instance;
  for (const hook of hooks) {
    let next: unknown;
    try {
      next = hook.call(current, view, scope);
    } catch (error) {
      takeOwnership(root, owner, record, instance);
      throw constructFailed(bp, record, hook.plugin, error);
    }
    if (next === undefined) continue;
    if (isThenable(next)) {
      // Observe the thenable so its rejection is never unhandled.
      Promise.resolve(next).catch(() => undefined);
      takeOwnership(root, owner, record, instance);
      throw constructFailed(
        bp,
        record,
        hook.plugin,
        new TypeError('returned a thenable; a construct hook is synchronous.'),
      );
    }
    current = next;
  }
  return current;
}

/** What `buildInto` constructed for one provider, before a caller settles it. */
export interface Built {
  readonly record: ProviderRecord;
  readonly value: unknown;
  readonly isAsync: boolean;
  readonly start: number;
}

/**
 * Constructs one provider into `container`, shared by `startBlueprint`
 * (root singletons), `createScope` and `extend()` (scoped factories and
 * their scoped deps): each builds level by level into a container's own
 * slots. Only a factory's result is awaited (spec §6.1: a class provider
 * stores its constructed instance as is). Without the kind check, a class
 * instance that happens to expose a `then` method would be replaced by its
 * resolved value instead of stored, or hang the caller forever waiting on a
 * `then` that never calls back. Transients built as its deps go to `owner`:
 * the container itself, or in extend() a list of extend()'s own, so its
 * rollback disposes only its own builds.
 */
export async function buildInto(
  container: ContainerState,
  bp: Blueprint,
  id: string,
  owner: Owner = container,
): Promise<Built> {
  const record = recordOf(bp, id);
  const start = container.root.tracer.now();
  let value = construct(record, { bp, container, owner });
  const isAsync = record.kind === 'factory' && isThenable(value);
  if (isAsync) {
    const pending = Promise.resolve(value);
    container.slots.begin(id, pending);
    value = await pending;
  }
  return { record, value, isAsync, start };
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

/** What a get() throws when onInit throws in a build on first request. */
function onInitFailed(
  bp: Blueprint,
  record: ProviderRecord,
  cause: unknown,
): unknown {
  if (cause instanceof NexusError) return fromUserCode(cause);
  return new ProviderError(
    {
      token: record.name,
      module: moduleName(bp, record),
      path: [...constructionStack.names(), record.name],
      alsoFailed: [],
      disposalErrors: [],
    },
    { cause },
  );
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
    Promise.resolve(value).catch(() => undefined);
    return new LazyAsyncError({
      token: record.name,
      module: moduleName(ctx.bp, record),
    });
  };
  const start = root.tracer.now();
  const built = construct(record, { bp: ctx.bp, container, owner });
  if (record.kind === 'factory' && isThenable(built)) throw lazyAsync(built);
  const instance = applyConstruct(
    root,
    owner,
    ctx.bp,
    record,
    built,
    container.scopeId,
  );
  adopt(owner, record, instance);
  if (
    record.lifetime === 'singleton' &&
    root.initEnabled &&
    isObject(instance) &&
    typeof (instance as { onInit?: unknown }).onInit === 'function' &&
    root.ownership.claimInit(instance)
  ) {
    // Settled first, as create settles a singleton before its onInit, so a
    // get() from onInit returns the instance.
    container.slots.settle(record.id, instance);
    let result: unknown;
    try {
      result = (instance as { onInit(): unknown }).onInit();
    } catch (error) {
      container.slots.abandon(record.id);
      throw onInitFailed(ctx.bp, record, error);
    }
    if (isThenable(result)) {
      container.slots.abandon(record.id);
      throw lazyAsync(result);
    }
  }
  container.slots.settle(record.id, instance);
  container.slots.markReady(record.id);
  run?.touched.push(record.id);
  if (record.kind === 'factory') root.asyncFlags.set(record.id, false);
  traceConstruct(container, ctx.bp, record, false, start);
  return instance;
}

function settledSingleton(record: ProviderRecord, ctx: Ctx): unknown {
  const slots = ctx.container.root.slots;
  if (slots.isSettled(record.id)) return slots.value(record.id);
  if (!slots.has(record.id) && ctx.bp.deferred.has(record.id))
    return buildOnDemand(record, ctx);
  throw notBuilt(record);
}

function buildTransient(record: ProviderRecord, ctx: Ctx): unknown {
  const start = ctx.container.root.tracer.now();
  const built = construct(record, ctx);
  // Only a factory result is awaited (spec §6.1); a class instance with a
  // then method is an ordinary value.
  if (record.kind === 'factory' && isThenable(built)) {
    // get() cannot wait. Observe the promise so its rejection is never unhandled.
    Promise.resolve(built).catch(() => undefined);
    // builtAsync reports a transient factory false until now.
    ctx.container.root.asyncFlags.set(record.id, true);
    throw new AsyncTransientError({
      token: record.name,
      module: moduleName(ctx.bp, record),
    });
  }
  const instance = applyConstruct(
    ctx.container.root,
    ctx.owner,
    ctx.bp,
    record,
    built,
    ctx.container.scopeId,
  );
  takeOwnership(ctx.container.root, ctx.owner, record, instance);
  traceConstruct(ctx.container, ctx.bp, record, false, start);
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
      return buildTransient(record, ctx);
  }
}
