import {
  BlueprintError,
  InvalidExportError,
  MissingProviderError,
  Nexus,
  NotVisibleError,
  ProviderError,
  isNexusError,
  type TraceEvent,
} from '@nexusdi/core';
import { inspect, trace, type NexusGraph } from '@nexusdi/devtools';
import { errors } from '@nexusdi/errors';
import { DRONE, NAV_CHARTS, rootOf } from '@nexusdi/meridian/scenes/front-page';

import type { BayState } from './state';
import type {
  CheckResult,
  DescribedError,
  ErrorKind,
  LaunchOutcome,
} from './outcome';

/**
 * The run chunk (site UX spec 5.6): core, `@nexusdi/errors`, the devtools
 * `trace` and `inspect`, and the seed. The bay controller loads it with
 * `import()` when the bay nears the viewport or on the first control. Its
 * marker is the exported constant, so a minifier keeps the string and
 * `check-budgets.mjs` finds the chunk by it (12.1).
 */
export const CORE_RUNTIME_MARK = 'nexus-core-runtime';

/** The marker, as a call so that a minifier keeps the string with the chunk. */
export const runtimeMark = (): string => CORE_RUNTIME_MARK;

/** The destination the bridge readout plots (site UX spec 4.4). */
export const DESTINATION = 'Kepler-442b';

function kindOf(error: unknown): ErrorKind {
  if (error instanceof BlueprintError) return 'blueprint';
  if (error instanceof MissingProviderError) return 'missing-provider';
  if (error instanceof InvalidExportError) return 'invalid-export';
  if (error instanceof NotVisibleError) return 'not-visible';
  if (error instanceof ProviderError) return 'provider-failed';
  return 'other';
}

/**
 * What an error carries: its class's kind, its code, its own fields and its
 * message, and the entries of a blueprint error and the message of a cause.
 * Every read goes through what core exports.
 */
export function describeError(error: unknown): DescribedError {
  if (!isNexusError(error)) {
    const message =
      error instanceof Error ? error.message : String(error ?? 'unknown error');
    return { kind: 'other', code: null, fields: {}, message };
  }
  const { errors: inner, ...fields } = error as typeof error & {
    errors?: readonly unknown[];
  };
  const described: {
    -readonly [K in keyof DescribedError]: DescribedError[K];
  } = {
    kind: kindOf(error),
    code: error.code,
    fields: JSON.parse(JSON.stringify(fields)) as Record<string, unknown>,
    message: error.message,
  };
  if (error instanceof BlueprintError && Array.isArray(inner)) {
    described.entries = inner.map((each) => describeError(each));
  }
  if (error.cause !== undefined) {
    const cause = error.cause as { message?: unknown };
    described.cause = { message: String(cause?.message ?? error.cause) };
  }
  return described;
}

/** `Nexus.check` over the root of `state`, with or without `errors()`. */
export function check(state: BayState, withErrors: boolean): CheckResult {
  try {
    Nexus.check(rootOf(state), { plugins: withErrors ? [errors()] : [] });
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** `inspect()` of the root of `state`: the graph the overlay draws. */
export function graphOf(state: BayState): NexusGraph {
  return inspect(rootOf(state));
}

/** A live ship, and the call that takes it down. */
export interface Ship {
  dispose(): Promise<void>;
}

/**
 * Launches the root of `state`: `Nexus.create` with `errors()` and
 * `trace(record)`, then the bridge readout. `record` gets each trace event as
 * core emits it, so the page lights the ship in the order core reports. The
 * ship stays alive for the caller to dispose.
 */
export async function launch(
  state: BayState,
  record: (event: TraceEvent) => void,
): Promise<{ outcome: LaunchOutcome; ship: Ship | null }> {
  let startupMs: number | null = null;
  const sink = (event: TraceEvent) => {
    if (event.type === 'run' && event.kind === 'create')
      startupMs = event.durationMs;
    record(event);
  };
  let created;
  try {
    created = await Nexus.create(rootOf(state), {
      plugins: [errors(), trace(sink)],
    });
  } catch (error) {
    return {
      outcome: {
        ok: false,
        error: describeError(error),
        readout: null,
        lookup: null,
        startupMs,
      },
      ship: null,
    };
  }
  const ship = created;
  let readout: string | null = null;
  let lookup: LaunchOutcome['lookup'] = null;
  const target = state.hatches.SurveyDrone ? NAV_CHARTS : DRONE;
  try {
    if (target === NAV_CHARTS) {
      readout = ship.get(NAV_CHARTS).plot(DESTINATION);
    } else {
      ship.get(DRONE);
    }
  } catch (error) {
    lookup = { has: ship.has(target), error: describeError(error) };
  }
  return {
    outcome: { ok: true, error: null, readout, lookup, startupMs },
    ship: { dispose: () => ship[Symbol.asyncDispose]() },
  };
}
