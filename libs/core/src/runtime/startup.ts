import {
  REQUEST_ID,
  type Blueprint,
  type ProviderRecord,
} from '../blueprint/blueprint.js';
import { ModuleOptionsError } from '../errors/index.js';
import {
  adopt,
  construct,
  isThenable,
  moduleName,
  traceConstruct,
} from './build.js';
import { disposeInReverse } from './dispose.js';
import { settleLevel, toProviderError } from './settle.js';
import type { RootState } from './state.js';

export interface StartupPlan {
  readonly bp: Blueprint;
  /** Whether a provider still needs building: all of them at create, the loaded ones at load. */
  readonly isNew: (id: string) => boolean;
}

/** Runs a configurable module's Standard Schema over its options and returns the schema's output. */
async function validateOptions(
  record: ProviderRecord,
  bp: Blueprint,
  value: unknown,
): Promise<unknown> {
  if (record.schema === undefined) return value;
  const result = await record.schema['~standard'].validate(value);
  if (result.issues !== undefined) {
    throw new ModuleOptionsError({
      code: 'NEXUS_INVALID_MODULE_OPTIONS',
      module: moduleName(bp, record),
      issues: result.issues,
    });
  }
  return result.value;
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

/**
 * Stores useValue providers as they are, never awaited, and reports aliases.
 * An options value with a schema is stored once its validation settles.
 */
async function registerStatic(
  root: RootState,
  plan: StartupPlan,
  touched: string[],
): Promise<void> {
  const validated: string[] = [];
  for (const record of plan.bp.providers.values()) {
    if (!plan.isNew(record.id) || record.id === REQUEST_ID) continue;
    if (record.kind === 'alias') traceConstruct(root, plan.bp, record, false);
    if (record.kind !== 'value') continue;
    touched.push(record.id);
    if (record.schema === undefined)
      settleValue(root, plan.bp, record, record.value);
    else validated.push(record.id);
  }
  await settleLevel(validated, async (id) => {
    const record = plan.bp.providers.get(id)!;
    settleValue(
      root,
      plan.bp,
      record,
      await validateOptions(record, plan.bp, record.value),
    );
  });
}

async function buildSingleton(
  root: RootState,
  bp: Blueprint,
  id: string,
): Promise<void> {
  const record = bp.providers.get(id)!;
  const start = root.tracer.now();
  let value = construct(record, { bp, container: root, owner: root });
  // Only a factory's result is awaited (spec §6.1: a class provider stores
  // its constructed instance as is). Without the kind check, a class
  // instance that happens to expose a `then` method would be replaced by
  // its resolved value instead of stored.
  const isAsync = record.kind === 'factory' && isThenable(value);
  if (isAsync) {
    const pending = Promise.resolve(value);
    root.slots.begin(id, pending);
    value = await pending;
  }
  // validateOptions runs only when the record carries a schema (set only on
  // options providers, per optionsShape in blueprint/records.ts). JavaScript
  // resolves an async function's return value as a thenable whenever it has
  // a `then` method, no matter which branch inside the function produced it,
  // so awaiting the call for every provider would hang on a class instance
  // whose own `then` never settles.
  if (record.schema !== undefined)
    value = await validateOptions(record, bp, value);
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
 * provider in this one has settled. On failure it forgets what it built,
 * disposes it one at a time in reverse creation order, and throws a
 * ProviderError, so a failed startup always has the same code.
 */
export async function startBlueprint(
  root: RootState,
  plan: StartupPlan,
): Promise<void> {
  const mark = root.owned.length;
  const touched: string[] = [];
  try {
    await registerStatic(root, plan, touched);
    for (const level of plan.bp.singletonLevels) {
      const ids = level.filter(plan.isNew);
      if (ids.length === 0) continue;
      touched.push(...ids);
      await settleLevel(ids, (id) => buildSingleton(root, plan.bp, id));
    }
    markReady(root, plan);
  } catch (error) {
    for (const id of touched) root.slots.abandon(id);
    const { errors } = await disposeInReverse(
      root.owned.splice(mark),
      root.ownership,
    );
    throw toProviderError(error, plan.bp, errors);
  }
}
