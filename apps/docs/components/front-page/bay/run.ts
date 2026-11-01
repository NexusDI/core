import {
  BlueprintError,
  check as checkRoot,
  InvalidExportError,
  isNexusError,
  MissingProviderError,
  Nexus,
  NotVisibleError,
  ProviderError,
  type TraceEvent,
} from '@nexusdi/core';
import { inspect, trace, type NexusGraph } from '@nexusdi/devtools';
import { errors } from '@nexusdi/errors';
import { DRONE, NAV_CHARTS, rootOf } from '@nexusdi/meridian/scenes/front-page';

import type { BayState } from './state';
import type { CheckResult, DescribedError, LaunchOutcome } from './outcome';

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

/** The message of an error's `cause`, when it has one. */
function causeOf(error: Error): { cause: { message: string } } | object {
  const cause: unknown = error.cause;
  if (cause === undefined) return {};
  return {
    cause: { message: cause instanceof Error ? cause.message : String(cause) },
  };
}

/**
 * What an error carries, typed: the member of `DescribedError` that its class
 * names, with the fields the ship reads copied off the instance. Every read
 * goes through the classes and fields that core exports.
 */
export function describeError(error: unknown): DescribedError {
  if (error instanceof BlueprintError) {
    return {
      kind: 'blueprint',
      code: error.code,
      message: error.message,
      entries: error.errors.map(describeError),
      ...causeOf(error),
    };
  }
  if (error instanceof MissingProviderError) {
    return {
      kind: 'missing-provider',
      code: error.code,
      message: error.message,
      token: error.token,
      requester: error.requester,
      module: error.module,
      nearMisses: error.nearMisses,
      ...causeOf(error),
    };
  }
  if (error instanceof InvalidExportError) {
    return {
      kind: 'invalid-export',
      code: error.code,
      message: error.message,
      token: error.token,
      module: error.module,
      ...causeOf(error),
    };
  }
  if (error instanceof NotVisibleError) {
    return {
      kind: 'not-visible',
      code: error.code,
      message: error.message,
      token: error.token,
      owners: error.owners,
      ...causeOf(error),
    };
  }
  if (error instanceof ProviderError) {
    return {
      kind: 'provider-failed',
      code: error.code,
      message: error.message,
      token: error.token,
      module: error.module,
      ...causeOf(error),
    };
  }
  if (isNexusError(error)) {
    return {
      kind: 'other',
      code: error.code,
      message: error.message,
      ...causeOf(error),
    };
  }
  const message =
    error instanceof Error ? error.message : String(error ?? 'unknown error');
  return { kind: 'other', code: null, message };
}

/** `check()` over the root of `state`, with or without `errors()`. */
export function check(state: BayState, withErrors: boolean): CheckResult {
  try {
    checkRoot(rootOf(state), { plugins: withErrors ? [errors()] : [] });
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
