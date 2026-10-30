import {
  REQUEST_ID,
  type Blueprint,
  type ProviderRecord,
} from '../blueprint/blueprint.js';
import { unreachable } from '../definitions/unreachable.js';
import { buildInto, traceBuild, validateOptions } from './build.js';
import { buildLevels } from './build-levels.js';
import { runInit } from './init.js';
import { rollBack, settleLevel } from './settle.js';
import { assertOpen, type Owner, type RootState, type Run } from './state.js';
import type { RunTrace } from './trace.js';

export interface StartupPlan {
  readonly bp: Blueprint;
  /** Whether this blueprint added the provider: all of them at create, the loaded ones at load. */
  readonly isNew: (id: string) => boolean;
  readonly run: RunTrace;
}

/** Returns whether this call is the one that registered value as owned. */
function settleValue(
  root: RootState,
  bp: Blueprint,
  record: ProviderRecord,
  value: unknown,
  run: RunTrace,
): boolean {
  const added = root.ownership.registerValue(value);
  root.slots.settle(record.id, value);
  root.slots.markReady(record.id);
  traceBuild('construct', root, bp, record.id, run, null, false);
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
    if (record.kind === 'alias')
      traceBuild('construct', root, plan.bp, record.id, plan.run, null, false);
    if (record.kind !== 'value') continue;
    touched.push(record.id);
    if (record.schema === undefined) {
      if (settleValue(root, plan.bp, record, record.value, plan.run))
        registered.push(record.value);
    } else validated.push(record.id);
  }
  await settleLevel(validated, async (id) => {
    const record = plan.bp.providers.get(id);
    if (record === undefined) unreachable();
    const { value } = await validateOptions(record, plan.bp, record.value);
    if (settleValue(root, plan.bp, record, value, plan.run))
      registered.push(value);
  });
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
  // What this run builds goes to a list of its own, and so does a new
  // provider a request builds on first use while it runs (root.run). The
  // list joins root.owned when the run succeeds, so a failure disposes only
  // this run's builds, and never an instance a get() built meanwhile.
  const built: Owner = { root, owned: [] };
  const touched: string[] = [];
  const registered: unknown[] = [];
  const run: Run = {
    ...plan.run,
    isNew: plan.isNew,
    owner: built,
    touched,
  };
  root.run = run;
  try {
    await registerStatic(root, plan, touched, registered);
    await buildLevels(
      plan.bp.singletonLevels,
      plan.isNew,
      (id, level) => {
        touched.push(id);
        return buildInto(root, plan.bp, id, built, run, level);
      },
      () => assertOpen(root),
    );
    assertOpen(root);
    // With onInit off (a plugin set onInit: false), buildInto already
    // marked each singleton ready.
    if (root.initEnabled) await runInit(root, plan.bp, run);
    root.run = undefined;
    root.owned.push(...built.owned);
  } catch (error) {
    root.run = undefined;
    // A held record keeps its id across loads, but a failed run's ids were
    // never committed to root.blueprint: the next load starts from the same
    // nextIds and may give one of them to another provider. touched holds
    // only the ids this run introduced, so clearing their asyncFlags entries
    // here never removes a flag a committed provider owns.
    for (const id of touched) root.asyncFlags.delete(id);
    for (const value of registered) root.ownership.unregisterValue(value);
    throw await rollBack(
      root,
      { ...run, owned: built.owned },
      plan.bp,
      error,
      () => (root.disposing ? root.abortErrors : undefined),
    );
  }
}
