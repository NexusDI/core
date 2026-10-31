import type { TraceEvent } from '@nexusdi/core';

/**
 * What the run chunk hands the controller: plain records of what core
 * returned. The run chunk reads each error through the classes core exports
 * and puts the result in `kind`, a vocabulary of the bay's own. The
 * controller branches on `kind` and handles any other value as a plain line
 * (extension principle P1 and P2). It never parses a message.
 */

/** The errors the ship draws. `other` is every error the bay does not know. */
export type ErrorKind =
  | 'blueprint'
  | 'missing-provider'
  | 'invalid-export'
  | 'not-visible'
  | 'provider-failed'
  | 'other';

export interface NearMissRecord {
  readonly kind: string;
  readonly module: string;
}

export interface DescribedError {
  readonly kind: ErrorKind;
  /** The error's own `code`, or null for an error that is not a `NexusError`. */
  readonly code: string | null;
  /** The own enumerable fields of a `NexusError`, as plain JSON. */
  readonly fields: Readonly<Record<string, unknown>>;
  readonly message: string;
  /** The entries of a `BlueprintError`, in record order. */
  readonly entries?: readonly DescribedError[];
  readonly cause?: { readonly message: string };
}

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

/** The fields the ship reads off a missing-provider entry. */
export interface MissingFields {
  readonly token: string;
  readonly requester: string | null;
  readonly module: string;
  readonly nearMisses: readonly NearMissRecord[];
}

export type { TraceEvent };

/** The entries of a check error, or the error itself when it is not a blueprint. */
export function entriesOf(error: DescribedError): readonly DescribedError[] {
  return error.kind === 'blueprint' ? (error.entries ?? []) : [error];
}

export function fieldString(
  error: DescribedError,
  name: string,
): string | null {
  const value = error.fields[name];
  return typeof value === 'string' ? value : null;
}

export function missingFields(error: DescribedError): MissingFields | null {
  if (error.kind !== 'missing-provider') return null;
  const token = fieldString(error, 'token');
  const moduleName = fieldString(error, 'module');
  if (token === null || moduleName === null) return null;
  const near = error.fields['nearMisses'];
  return {
    token,
    requester: fieldString(error, 'requester'),
    module: moduleName,
    nearMisses: Array.isArray(near) ? (near as NearMissRecord[]) : [],
  };
}
