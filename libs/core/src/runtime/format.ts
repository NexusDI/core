import {
  failedView,
  viewOfBlueprint,
  type BlueprintView,
} from '../blueprint/views.js';
import {
  BlueprintError,
  blueprintMessage,
  layoutText,
  MissingProviderError,
  NexusError,
  ownsText,
} from '../errors/index.js';
import type { ErrorText, PluginSet } from './plugins.js';
import type { RootState } from './state.js';

const FORMATTED = new WeakSet<object>();

function isText(value: unknown): value is ErrorText {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

/**
 * Lets the first formatError hook that returns text write the message of a
 * NexusError core raised. Inner errors of a BlueprintError go first, and the
 * aggregate's own line is rebuilt from them. A hook that throws or returns
 * something else leaves core's line. An error is formatted once, and an
 * error built with its own text is never formatted. The code prefix and
 * every field but nearMisses stay core's.
 */
export function formatThrown(
  plugins: Pick<PluginSet, 'formatError'>,
  view: () => BlueprintView | undefined,
  error: unknown,
): unknown {
  if (
    plugins.formatError.length === 0 ||
    !(error instanceof NexusError) ||
    FORMATTED.has(error) ||
    ownsText(error)
  )
    return error;
  FORMATTED.add(error);
  const scope =
    error instanceof BlueprintError ? (failedView(error) ?? view()) : view();
  if (error instanceof BlueprintError) {
    for (const inner of error.errors) formatThrown(plugins, () => scope, inner);
    error.message = blueprintMessage(error.errors);
  }
  for (const hook of plugins.formatError) {
    let text: unknown;
    try {
      text = hook.call(error, scope);
    } catch {
      return error;
    }
    if (text === undefined) continue;
    if (!isText(text)) return error;
    if (text.nearMisses !== undefined && error instanceof MissingProviderError)
      Object.defineProperty(error, 'nearMisses', {
        value: text.nearMisses,
        enumerable: true,
      });
    error.message = layoutText(error.code, text);
    return error;
  }
  return error;
}

/**
 * What a public method of a container throws: `error`, formatted when the
 * container has a formatError hook. Without one it costs a length check, so
 * a method calls it from its catch block and adds nothing to its normal path.
 */
export function formatFor(state: RootState, error: unknown): unknown {
  return state.plugins.formatError.length === 0
    ? error
    : formatThrown(
        state.plugins,
        () => viewOfBlueprint(state.blueprint),
        error,
      );
}

const GUARDED = new WeakMap<Promise<unknown>, Promise<unknown>>();

/**
 * The promise an async public method returns: `promise` itself without a
 * formatError hook, or one that formats its rejection. The caller passes the
 * promise, so the no-plugin path allocates nothing. The same promise gets
 * the same guarded promise back, as a second disposal call needs.
 */
export function guardAsync<T>(
  state: RootState,
  promise: Promise<T>,
): Promise<T> {
  if (state.plugins.formatError.length === 0) return promise;
  let guarded = GUARDED.get(promise) as Promise<T> | undefined;
  if (guarded === undefined) {
    guarded = promise.then(undefined, (error: unknown) => {
      throw formatFor(state, error);
    });
    GUARDED.set(promise, guarded);
  }
  return guarded;
}
