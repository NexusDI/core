import {
  REQUEST_ID,
  type Blueprint,
  type ProviderRecord,
} from '../blueprint/blueprint.js';
import { depOf } from '../blueprint/records.js';
import { describeValue } from '../definitions/describe.js';
import {
  BlueprintError,
  InvalidTokenError,
  ScopeRequiredError,
  type NexusError,
} from '../errors/index.js';
import { resolveId } from './build.js';
import { makeThunk } from './lazy.js';
import { lookupModule, notFound } from './lookup.js';
import type { LookupOptions } from './options.js';
import type { ContainerState, TransientOwner } from './state.js';

interface Entry {
  readonly key: string;
  readonly where: string;
  readonly value: unknown;
}

/**
 * The entries of a deps tuple or a deps map. A map is read by its own
 * enumerable keys through their descriptors, so a key named __proto__ is an
 * entry and never the prototype.
 */
function entriesOf(
  deps: unknown,
): { readonly entries: Entry[]; readonly tuple: boolean } | null {
  if (Array.isArray(deps)) {
    return {
      tuple: true,
      entries: deps.map((value, i) => ({
        key: String(i),
        where: `deps[${i}]`,
        value,
      })),
    };
  }
  if (typeof deps !== 'object' || deps === null) return null;
  return {
    tuple: false,
    entries: Object.keys(deps).map((key) => ({
      key,
      where: `deps.${key}`,
      value: Object.getOwnPropertyDescriptor(deps, key)?.value,
    })),
  };
}

/**
 * depOf's reason starts with the entry; the error names the entry in its own
 * field. depOf's generic "not a token" reason restates `received`, so that
 * one case falls back to InvalidTokenError's own default reason instead of
 * printing the value twice.
 */
function invalidEntry(
  where: string,
  value: unknown,
  reason: string,
): InvalidTokenError {
  const received = describeValue(value);
  if (reason.endsWith(', not a token')) {
    return new InvalidTokenError({ received, entry: where });
  }
  return new InvalidTokenError({
    received,
    reason: `${reason.slice(where.length + 1)}.`,
    entry: where,
  });
}

function notADepsValue(deps: unknown): InvalidTokenError {
  return new InvalidTokenError({
    received: describeValue(deps),
    reason: 'is not a deps map or a deps tuple.',
  });
}

/**
 * Every ScopeRequiredError a build for one entry raises belongs to that
 * entry (spec §3.9): the entry itself resolved from the root, or a provider
 * anywhere in the entry's own dependency tree. A nested resolve() or
 * validate() call already set its own entry and is left alone.
 */
function atEntry(where: string, build: () => unknown): unknown {
  try {
    return build();
  } catch (error) {
    if (error instanceof ScopeRequiredError && error.entry === null) {
      throw new ScopeRequiredError({
        token: error.token,
        path: error.path,
        entry: where,
      });
    }
    throw error;
  }
}

/**
 * Whether resolving `id` from the root throws NEXUS_SCOPE_REQUIRED before
 * building anything: `id` is REQUEST, or an alias chain that ends at a
 * scoped provider. A lazy entry to such a target throws at resolve() time
 * instead of deferring to the thunk (spec §3.9); any other lazy entry still
 * defers, since resolving it here would build it early.
 */
function needsScopeAtRoot(bp: Blueprint, id: string): boolean {
  let current = id;
  for (;;) {
    if (current === REQUEST_ID) return true;
    const record = bp.providers.get(current);
    if (record === undefined) return false;
    if (record.kind !== 'alias') return record.lifetime === 'scoped';
    current = bp.bindings.get(current)?.target ?? '';
  }
}

/** What a thunk from resolve() names as its owner in NEXUS_NOT_READY, and how it owns a transient. */
function thunkOwner(
  container: ContainerState,
): Pick<ProviderRecord, 'name' | 'lifetime'> {
  return {
    name: 'resolve()',
    lifetime: container.kind === 'scope' ? 'scoped' : 'transient',
  };
}

/** resolve(): each entry by the rules of a factory's deps, from the scope or the root. */
export function resolveDeps(
  container: ContainerState,
  bp: Blueprint,
  deps: unknown,
  options: LookupOptions | undefined,
  owner: TransientOwner,
): unknown {
  const read = entriesOf(deps);
  if (read === null) throw notADepsValue(deps);
  const moduleId = lookupModule(bp, options);
  const visible = bp.visibility.get(moduleId);
  const ctx = { bp, container, owner };
  const result: object = read.tuple ? [] : {};

  for (const { key, where, value } of read.entries) {
    const dep = depOf(value, where);
    if (typeof dep === 'string') throw invalidEntry(where, value, dep);
    const ids = visible?.get(dep.token) ?? [];
    const [id] = ids;
    let resolved: unknown;
    if (dep.kind === 'all')
      resolved = atEntry(where, () => ids.map((each) => resolveId(each, ctx)));
    else if (id === undefined) {
      if (dep.kind !== 'optional')
        throw notFound(container, bp, dep.token, moduleId, where);
      resolved = undefined;
    } else if (dep.kind === 'lazy')
      resolved =
        container.kind === 'root' && needsScopeAtRoot(bp, id)
          ? atEntry(where, () => resolveId(id, ctx))
          : makeThunk(id, thunkOwner(container), ctx, resolveId);
    else resolved = atEntry(where, () => resolveId(id, ctx));
    Object.defineProperty(result, key, {
      value: resolved,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

/**
 * validate(): the lookups resolve() makes, with nothing built. Every failing
 * required or lazy entry becomes one error of a single BlueprintError. Every
 * lifetime resolves from a scope, so no lifetime check applies.
 */
export function validateDeps(
  container: ContainerState,
  bp: Blueprint,
  deps: unknown,
  options: LookupOptions | undefined,
): void {
  const moduleId = lookupModule(bp, options);
  const visible = bp.visibility.get(moduleId);
  const errors: NexusError[] = [];
  const read = entriesOf(deps);
  if (read === null) errors.push(notADepsValue(deps));

  for (const { where, value } of read?.entries ?? []) {
    const dep = depOf(value, where);
    if (typeof dep === 'string') {
      errors.push(invalidEntry(where, value, dep));
      continue;
    }
    if (dep.kind === 'optional' || dep.kind === 'all') continue;
    if ((visible?.get(dep.token)?.length ?? 0) === 0)
      errors.push(notFound(container, bp, dep.token, moduleId, where));
  }

  if (errors.length > 0) throw new BlueprintError(errors);
}
