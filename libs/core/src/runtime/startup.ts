import {
  REQUEST_ID,
  type Blueprint,
  type ProviderRecord,
} from '../blueprint/blueprint.js';
import { ModuleOptionsError } from '../errors/index.js';
import {
  adopt,
  applyConstruct,
  buildInto,
  moduleName,
  traceConstruct,
} from './build.js';
import { runInit } from './init.js';
import { isObject } from './ownership.js';
import { rollBack, settleLevel } from './settle.js';
import { assertOpen, type Owner, type RootState } from './state.js';

export interface StartupPlan {
  readonly bp: Blueprint;
  /** Whether this blueprint added the provider: all of them at create, the loaded ones at load. */
  readonly isNew: (id: string) => boolean;
  /**
   * The committed blueprint a load builds on. A provider it deferred that
   * this blueprint levels, because a new eager provider needs it, builds in
   * this run's levels unless a request built it already.
   */
  readonly previous?: Blueprint;
}

/**
 * Runs a configurable module's Standard Schema over its options and boxes
 * the output in `{ value }`. JavaScript's promise-resolution procedure
 * thenable-adopts an async function's return value whenever it has a `then`
 * method, no matter which branch produced it (the same hazard buildSingleton
 * guards a factory's result against below). A bare return here would hang
 * on a validated value with its own `then`; the box has none of its own, so
 * callers can always await the call safely and unwrap `.value` afterward.
 */
async function validateOptions(
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

/** Returns whether this call is the one that registered value as owned. */
function settleValue(
  root: RootState,
  bp: Blueprint,
  record: ProviderRecord,
  value: unknown,
): boolean {
  const added = root.ownership.registerValue(value);
  root.slots.settle(record.id, value);
  root.slots.markReady(record.id);
  traceConstruct(root, bp, record, false);
  return added;
}

/**
 * Stores useValue providers as they are, never awaited, and reports aliases.
 * An options value with a schema is stored once its validation settles. Only
 * a value this call newly registered with `root.ownership` (not one an
 * earlier create or load already owns) lands in `registered`, so a caller
 * that aborts this run undoes only its own registrations.
 */
async function registerStatic(
  root: RootState,
  plan: StartupPlan,
  touched: string[],
  registered: unknown[],
): Promise<void> {
  const validated: string[] = [];
  for (const record of plan.bp.providers.values()) {
    if (!plan.isNew(record.id) || record.id === REQUEST_ID) continue;
    if (record.kind === 'alias') traceConstruct(root, plan.bp, record, false);
    if (record.kind !== 'value') continue;
    touched.push(record.id);
    if (record.schema === undefined) {
      if (settleValue(root, plan.bp, record, record.value))
        registered.push(record.value);
    } else validated.push(record.id);
  }
  await settleLevel(validated, async (id) => {
    const record = plan.bp.providers.get(id);
    if (record === undefined)
      throw new Error(`internal: no provider record for ${id}`);
    const { value } = await validateOptions(record, plan.bp, record.value);
    if (settleValue(root, plan.bp, record, value)) registered.push(value);
  });
}

/** Builds one singleton into the root's slots; `owner` takes the instance. */
async function buildSingleton(
  root: RootState,
  bp: Blueprint,
  id: string,
  owner: Owner,
): Promise<void> {
  const built = await buildInto(root, bp, id, owner);
  const { record, isAsync, start } = built;
  let { value } = built;
  // validateOptions runs only when the record carries a schema (set only on
  // options providers, per optionsShape in blueprint/records.ts): a plain
  // provider's constructed value never needs it, and skipping the call
  // avoids an extra microtask tick for the common case.
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
  value = applyConstruct(root, owner, bp, record, value, null);
  root.slots.settle(id, value);
  if (record.kind === 'factory') root.asyncFlags.set(id, isAsync);
  adopt(owner, record, value);
  if (!root.initEnabled) root.slots.markReady(id);
  traceConstruct(root, bp, record, isAsync, start);
}

/**
 * After a failed load, a committed singleton the load built for a new
 * provider stays when it is complete: built, and with no onInit left to
 * run. One whose onInit had not settled is forgotten, so the next request
 * builds it again; the root still owns and disposes the first instance.
 */
function keepOrForget(root: RootState, id: string): void {
  if (!root.slots.isSettled(id) || root.slots.isReady(id)) return;
  const instance = root.slots.value(id);
  const pendingInit =
    root.initEnabled &&
    isObject(instance) &&
    typeof (instance as { onInit?: unknown }).onInit === 'function';
  if (pendingInit) root.slots.abandon(id);
  else root.slots.markReady(id);
}

/**
 * Builds the new singletons of a blueprint into the root, level by level.
 * Providers in one level run together; the next level starts when every
 * provider in this one has settled. It checks `root.disposing` after each
 * build level and after each onInit level, so a disposal that starts
 * mid-run stops the next level from starting. On failure it forgets what
 * it built, clears the async flags it recorded, and disposes what it built
 * one at a time in reverse creation order. It then rethrows a
 * `DisposedError` unchanged, parking the rollback's disposer errors on
 * `root.abortErrors`, only when the root is disposing: that is the abort
 * path, where disposeRoot chains those errors ahead of its own. A
 * `DisposedError` from user code while the root is still open is an
 * ordinary provider failure and, like any other, gets wrapped in a
 * `ProviderError` (NEXUS_PROVIDER_FAILED) with the rollback errors in
 * `disposalErrors`.
 */
export async function startBlueprint(
  root: RootState,
  plan: StartupPlan,
): Promise<void> {
  // What this run builds for its new providers goes to a list of its own,
  // and so does a new provider a request builds on first use while it runs
  // (root.run). The list joins root.owned when the run succeeds, so a
  // failure disposes only this run's builds, and never an instance a get()
  // built meanwhile.
  const built: Owner = { root, owned: [] };
  const touched: string[] = [];
  const registered: unknown[] = [];
  root.run = { isNew: plan.isNew, owner: built, touched };
  // A provider the previous blueprint deferred that a new eager provider
  // needs builds in this run's levels. It is a committed provider, so the
  // root owns it at once, and a get() through the previous blueprint may
  // already hold it.
  const earlier: string[] = [];
  const levelled = new Set<string>();
  const joins = (id: string): boolean =>
    plan.isNew(id) ||
    (plan.previous?.deferred.has(id) === true && !root.slots.has(id));
  try {
    await registerStatic(root, plan, touched, registered);
    for (const level of plan.bp.singletonLevels) {
      const ids = level.filter(joins);
      if (ids.length === 0) continue;
      for (const id of ids) {
        levelled.add(id);
        (plan.isNew(id) ? touched : earlier).push(id);
      }
      await settleLevel(ids, (id) =>
        buildSingleton(root, plan.bp, id, plan.isNew(id) ? built : root),
      );
      assertOpen(root);
    }
    assertOpen(root);
    // With onInit off (a plugin set onInit: false), buildSingleton already
    // marked each singleton ready.
    if (root.initEnabled)
      await runInit(root, plan.bp, (id) => levelled.has(id));
    root.run = undefined;
    root.owned.push(...built.owned);
  } catch (error) {
    root.run = undefined;
    for (const id of earlier) keepOrForget(root, id);
    // walk.ts assigns provider ids purely by position in the walk, and each
    // compile call redoes the walk from scratch. A failed run's ids were
    // never committed to root.blueprint, so the next load's compile can
    // reassign one of them to an unrelated provider. touched holds only the
    // ids this run built, so clearing their asyncFlags entries here
    // never removes a flag a committed provider owns.
    for (const id of touched) root.asyncFlags.delete(id);
    for (const value of registered) root.ownership.unregisterValue(value);
    throw await rollBack(
      root,
      { touched, owned: built.owned },
      plan.bp,
      error,
      () => (root.disposing ? root.abortErrors : undefined),
    );
  }
}
