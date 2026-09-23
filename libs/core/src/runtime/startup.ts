import {
  REQUEST_ID,
  type Blueprint,
  type ProviderRecord,
} from '../blueprint/blueprint.js';
import { adopt, construct, isThenable, traceConstruct } from './build.js';
import { settleLevel, toProviderError } from './settle.js';
import type { RootState } from './state.js';

export interface StartupPlan {
  readonly bp: Blueprint;
  /** Whether a provider still needs building: all of them at create, the loaded ones at load. */
  readonly isNew: (id: string) => boolean;
}

function settleValue(
  root: RootState,
  bp: Blueprint,
  record: ProviderRecord,
  value: unknown,
): void {
  root.ownership.registerValue(value);
  root.slots.settle(record.id, value);
  root.slots.markReady(record.id);
  traceConstruct(root, bp, record, false);
}

/** Stores useValue providers as they are (never awaited) and reports aliases. */
function registerStatic(root: RootState, plan: StartupPlan): void {
  for (const record of plan.bp.providers.values()) {
    if (!plan.isNew(record.id) || record.id === REQUEST_ID) continue;
    if (record.kind === 'value')
      settleValue(root, plan.bp, record, record.value);
    else if (record.kind === 'alias')
      traceConstruct(root, plan.bp, record, false);
  }
}

async function buildSingleton(
  root: RootState,
  bp: Blueprint,
  id: string,
): Promise<void> {
  const record = bp.providers.get(id)!;
  const start = root.tracer.now();
  let value = construct(record, { bp, container: root, owner: root });
  const isAsync = isThenable(value);
  if (isAsync) {
    const pending = Promise.resolve(value);
    root.slots.begin(id, pending);
    value = await pending;
  }
  root.slots.settle(id, value);
  if (record.kind === 'factory') root.asyncFlags.set(id, isAsync);
  adopt(root, record, value);
  if (!root.initEnabled) root.slots.markReady(id);
  traceConstruct(root, bp, record, isAsync, start);
}

function markReady(root: RootState, plan: StartupPlan): void {
  for (const level of plan.bp.singletonLevels) {
    for (const id of level) if (plan.isNew(id)) root.slots.markReady(id);
  }
}

/**
 * Builds the new singletons of a blueprint into the root, level by level.
 * Providers in one level run together; the next level starts when every
 * provider in this one has settled.
 */
export async function startBlueprint(
  root: RootState,
  plan: StartupPlan,
): Promise<void> {
  try {
    registerStatic(root, plan);
    for (const level of plan.bp.singletonLevels) {
      const ids = level.filter(plan.isNew);
      if (ids.length > 0)
        await settleLevel(ids, (id) => buildSingleton(root, plan.bp, id));
    }
    markReady(root, plan);
  } catch (error) {
    throw toProviderError(error, plan.bp, []);
  }
}
