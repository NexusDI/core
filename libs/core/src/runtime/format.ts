import {
  failedView,
  viewOfBlueprint,
  type BlueprintView,
} from '../blueprint/views.js';
import { HOOK_SITES } from '../definitions/hook-sites.js';
import {
  BlueprintError,
  blueprintMessage,
  layoutText,
  NexusError,
  ownsText,
  type ErrorText,
} from '../errors/index.js';
import type { PluginSet } from './plugins.js';
import type { RootState } from './state.js';

/** Errors a container formatted, so a rethrow keeps their text. */
const FORMATTED = new WeakSet<object>();

/** NexusErrors that left user code as they were, which no container formats. */
const USER_THROWN = new WeakSet<object>();

/**
 * Marks `error` as thrown by user code when it is a NexusError, and returns
 * it. A catch around a constructor, a factory, a property setter, a trace
 * sink, a disposer or a plugin's dispose hook calls it on the throw path
 * (spec §9.1), so the error keeps the text its raiser gave it.
 */
export function fromUserCode(error: unknown): unknown {
  if (error instanceof NexusError) USER_THROWN.add(error);
  return error;
}

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
 * something else leaves core's line. An error is formatted once. An
 * error built with its own text, or one fromUserCode marked, is never
 * formatted. The code prefix and
 * every field but nearMisses stay core's. nearMisses takes the text's list
 * when the error has an own nearMisses field, whatever its class. A field
 * or message the error locked (hidden, frozen) keeps its value, and the
 * caller still gets the error itself.
 */
export function formatThrown(
  plugins: Pick<PluginSet, 'formatError'>,
  view: () => BlueprintView | undefined,
  error: unknown,
): unknown {
  if (
    HOOK_SITES &&
    plugins.formatError.length > 0 &&
    error instanceof NexusError &&
    !FORMATTED.has(error) &&
    !USER_THROWN.has(error) &&
    !ownsText(error)
  ) {
    FORMATTED.add(error);
    const scope =
      error instanceof BlueprintError ? (failedView(error) ?? view()) : view();
    if (error instanceof BlueprintError) {
      for (const inner of error.errors)
        formatThrown(plugins, () => scope, inner);
      Reflect.set(error, 'message', blueprintMessage(error.errors));
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
      if (text.nearMisses !== undefined && Object.hasOwn(error, 'nearMisses'))
        Reflect.defineProperty(error, 'nearMisses', {
          value: text.nearMisses,
          enumerable: true,
        });
      Reflect.set(error, 'message', layoutText(error.code, text));
      return error;
    }
  }
  return error;
}

/**
 * What a public method of a container throws: `error`, formatted when the
 * container has a formatError hook. Without one it costs a length check, so
 * a method calls it from its catch block and adds nothing to its normal path.
 */
export function formatFor(state: RootState, error: unknown): unknown {
  return HOOK_SITES && state.plugins.formatError.length > 0
    ? formatThrown(
        state.plugins,
        () => viewOfBlueprint(state.blueprint, state.canon),
        error,
      )
    : error;
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
  if (HOOK_SITES && state.plugins.formatError.length > 0) {
    let guarded = GUARDED.get(promise) as Promise<T> | undefined;
    if (guarded === undefined) {
      guarded = promise.then(undefined, (error: unknown) => {
        throw formatFor(state, error);
      });
      GUARDED.set(promise, guarded);
    }
    return guarded;
  }
  return promise;
}
