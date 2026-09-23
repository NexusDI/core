import type { Blueprint } from '../blueprint/blueprint.js';
import { ProviderError } from '../errors/index.js';
import { moduleName } from './build.js';

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
  const failures = results.flatMap((result, i) =>
    result.status === 'rejected'
      ? [{ id: ids[i]!, error: result.reason as unknown }]
      : [],
  );
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
  return new ProviderError({
    ...first!,
    alsoFailed: rest.map(({ token, module, cause }) => ({
      token,
      module,
      cause,
    })),
    disposalErrors,
  });
}
