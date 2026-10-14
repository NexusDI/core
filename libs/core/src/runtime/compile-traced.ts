import type { Blueprint } from '../blueprint/blueprint.js';
import { compile, type CompileInput } from '../blueprint/compile.js';
import { BlueprintError, LoadError, ProviderError } from '../errors/index.js';
import { emitCollecting, type Tracer } from './trace.js';

/**
 * An observe hook's own throw while reporting an operation that itself
 * passed: a compile, or the create its closing `run` event ends.
 */
export function observerFailed(
  error: unknown,
  module: string,
  disposalErrors: readonly unknown[] = [],
): ProviderError {
  return new ProviderError(
    { token: 'startup', module, path: [], alsoFailed: [], disposalErrors },
    { cause: error },
  );
}

/** How many errors a compile throw reports, or undefined for a throw that is not a compile failure. */
function errorCount(error: unknown): number | undefined {
  if (error instanceof BlueprintError) return error.errors.length;
  // compile() throws a LoadError alone, before its later passes run.
  return error instanceof LoadError ? 1 : undefined;
}

/**
 * compile() plus the `compile` trace event, which a failure emits too, with
 * its error count. On a compile that passed, a throw from an observe hook
 * surfaces as a ProviderError whose `cause` is the hook's exception, the
 * same way a callback throw during construct or init surfaces through
 * startBlueprint's catch. This function runs before startBlueprint, so it
 * wraps the throw itself. On a compile failure an observer's throw is
 * dropped, since a BlueprintError or LoadError has no list to hold it, and
 * the compile error reaches the caller.
 */
export function compileTraced(
  tracer: Tracer,
  input: CompileInput,
  phase: 'create' | 'load' | 'check',
  run: number | null,
): Blueprint {
  const start = tracer.now();
  let blueprint: Blueprint;
  try {
    blueprint = compile(input);
  } catch (error) {
    const errors = errorCount(error);
    if (errors !== undefined)
      emitCollecting(tracer, [], () => ({
        type: 'compile',
        phase,
        run,
        modules: 0,
        providers: 0,
        errors,
        startMs: start,
        durationMs: tracer.now() - start,
      }));
    throw error;
  }
  try {
    tracer.emit(() => ({
      type: 'compile',
      phase,
      run,
      modules: blueprint.modules.size,
      // The built-in REQUEST provider is not counted.
      providers: blueprint.providers.size - 1,
      errors: 0,
      startMs: start,
      durationMs: tracer.now() - start,
    }));
  } catch (traceError) {
    throw observerFailed(
      traceError,
      blueprint.modules.get(blueprint.root)?.name ?? '',
    );
  }
  return blueprint;
}
