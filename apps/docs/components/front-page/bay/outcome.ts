import type { NearMiss } from '@nexusdi/core';

/**
 * What the run chunk hands the controller: what core returned, typed. The run
 * chunk reads each error through the classes that core exports, with
 * `instanceof`, and copies the fields it names off the instance into the
 * member of this union that matches. The controller branches on `kind` and
 * handles any error the bay does not know as `other`, a plain terminal line
 * (extension principle P1 and P2). Nothing reads a message or a string key.
 */

interface Described {
  /** The error's own `code`, which the terminal links to its page. */
  readonly code: string | null;
  readonly message: string;
  /** The message of the error's `cause`, such as the factory's own error. */
  readonly cause?: { readonly message: string };
}

export type DescribedError =
  | (Described & {
      readonly kind: 'blueprint';
      /** The entries of a `BlueprintError`, in record order. */
      readonly entries: readonly DescribedError[];
    })
  | (Described & {
      readonly kind: 'missing-provider';
      readonly token: string;
      readonly requester: string | null;
      readonly module: string;
      readonly nearMisses: readonly NearMiss[];
    })
  | (Described & {
      readonly kind: 'invalid-export';
      readonly token: string;
      readonly module: string;
    })
  | (Described & {
      readonly kind: 'not-visible';
      readonly token: string;
      readonly owners: readonly string[];
    })
  | (Described & {
      readonly kind: 'provider-failed';
      readonly token: string;
      readonly module: string;
    })
  | (Described & { readonly kind: 'other' });

export interface CheckResult {
  readonly ok: boolean;
  readonly error: DescribedError | null;
}

export interface LaunchOutcome {
  readonly ok: boolean;
  readonly error: DescribedError | null;
  /** The bridge readout: the answer of `plot`, when the lookup worked. */
  readonly readout: string | null;
  /** The lookup of a token the root cannot see, and what `has()` said. */
  readonly lookup: {
    readonly has: boolean;
    readonly error: DescribedError;
  } | null;
  /** Milliseconds `Nexus.create` took, from the `run` event core emitted. */
  readonly startupMs: number | null;
}

/** The entries of a check error, or the error itself when it is not a blueprint. */
export function entriesOf(error: DescribedError): readonly DescribedError[] {
  return error.kind === 'blueprint' ? error.entries : [error];
}
