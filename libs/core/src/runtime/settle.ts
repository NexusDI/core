import type { Blueprint } from '../blueprint/blueprint.js';
import { unreachable } from '../definitions/unreachable.js';
import { DisposedError, ProviderError } from '../errors/index.js';
import { moduleName } from './build.js';
import { disposeInReverse } from './dispose.js';
import type { OwnedEntry } from './ownership.js';
import type { ContainerState } from './state.js';
import { reportDisposal } from './trace.js';

/** Every failure of one build level, in declaration order. */
export class LevelFailure extends Error {
  readonly failures: readonly {
    readonly id: string;
    readonly error: unknown;
  }[];

  constructor(
    failures: readonly { readonly id: string; readonly error: unknown }[],
  ) {
    super('a build level failed');
    this.name = 'LevelFailure';
    this.failures = failures;
  }
}

/**
 * Runs one level's builds together and waits for all of them to settle
 * (Promise.allSettled), so no rejection goes unobserved. Throws LevelFailure
 * when any failed. `ids` arrive in declaration order.
 */
export async function settleLevel(
  ids: readonly string[],
  build: (id: string) => Promise<void>,
): Promise<void> {
  const results = await Promise.allSettled(ids.map((id) => build(id)));
  const failures = results.flatMap((result, i) => {
    if (result.status !== 'rejected') return [];
    const id = ids[i];
    if (id === undefined) unreachable();
    return [{ id, error: result.reason as unknown }];
  });
  if (failures.length > 0) throw new LevelFailure(failures);
}

interface Failure {
  readonly token: string;
  readonly module: string;
  readonly path: readonly string[];
  readonly cause: unknown;
}

function failureOf(id: string | null, error: unknown, bp: Blueprint): Failure {
  if (error instanceof ProviderError) {
    return {
      token: error.token,
      module: error.module,
      path: error.path,
      cause: error.cause,
    };
  }
  const record = id === null ? undefined : bp.providers.get(id);
  return {
    token: record?.name ?? 'startup',
    module:
      record === undefined
        ? (bp.modules.get(bp.root)?.name ?? '')
        : moduleName(bp, record),
    path: record === undefined ? [] : [record.name],
    cause: error,
  };
}

/**
 * The ProviderError a failed create, load or createScope throws: the first
 * failure by declaration order, the rest of its level in `alsoFailed`.
 */
export function toProviderError(
  error: unknown,
  bp: Blueprint,
  disposalErrors: readonly unknown[],
): ProviderError {
  const failures =
    error instanceof LevelFailure ? error.failures : [{ id: null, error }];
  const [first, ...rest] = failures.map(({ id, error: cause }) =>
    failureOf(id, cause, bp),
  );
  if (first === undefined) return unreachable();
  return new ProviderError(
    {
      token: first.token,
      module: first.module,
      path: first.path,
      alsoFailed: rest.map(({ token, module, cause }) => ({
        token,
        module,
        cause,
      })),
      disposalErrors,
    },
    { cause: first.cause },
  );
}

/**
 * Undoes a failed create, load, createScope or extend() in `container`: it
 * abandons the slots the run filled, disposes what the run built, newest
 * first, and returns the error to throw. A DisposedError passes through
 * unchanged when `parkIn()` names a list, and the disposer errors wait
 * there for the disposal that aborted the run. Any other failure becomes
 * the ProviderError naming its first failure, with the disposer errors in
 * `disposalErrors`.
 */
export async function rollBack(
  container: ContainerState,
  run: { readonly touched: readonly string[]; readonly owned: OwnedEntry[] },
  bp: Blueprint,
  error: unknown,
  parkIn: () => unknown[] | undefined,
): Promise<unknown> {
  const { root } = container;
  for (const id of run.touched) container.slots.abandon(id);
  const { errors } = await disposeInReverse(
    run.owned,
    root.ownership,
    reportDisposal(root.tracer, container.scopeId),
  );
  const parked = error instanceof DisposedError ? parkIn() : undefined;
  if (parked === undefined) return toProviderError(error, bp, errors);
  parked.push(...errors);
  return error;
}
