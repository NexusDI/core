import type { Blueprint } from '../blueprint/blueprint.js';
import { compile, type CompileInput } from '../blueprint/compile.js';
import { BlueprintError, ProviderError } from '../errors/index.js';
import type { Tracer } from './trace.js';

/** A trace callback's own throw while reporting `compile`, not a compile failure. */
function traceFailed(error: unknown, module: string): ProviderError {
  return new ProviderError({
    token: 'startup',
    module,
    path: [],
    cause: error,
  });
}

/**
 * compile() plus the `compile` trace event, which a failure emits too, with
 * its error count. A throw from the trace callback surfaces as a
 * ProviderError whose `cause` is the callback's exception, the same way a
 * callback throw during construct or init surfaces through startBlueprint's
 * catch. This function runs before startBlueprint, so it wraps the throw
 * itself.
 */
export function compileTraced(
  tracer: Tracer,
  input: CompileInput,
  phase: 'create' | 'load',
): Blueprint {
  const start = tracer.now();
  let blueprint: Blueprint;
  try {
    blueprint = compile(input);
  } catch (error) {
    if (error instanceof BlueprintError) {
      try {
        tracer.emit(() => ({
          type: 'compile',
          phase,
          modules: 0,
          providers: 0,
          errors: error.errors.length,
          durationMs: tracer.now() - start,
        }));
      } catch (traceError) {
        throw traceFailed(traceError, '');
      }
    }
    throw error;
  }
  try {
    tracer.emit(() => ({
      type: 'compile',
      phase,
      modules: blueprint.modules.size,
      // The built-in REQUEST provider is not counted.
      providers: blueprint.providers.size - 1,
      errors: 0,
      durationMs: tracer.now() - start,
    }));
  } catch (traceError) {
    throw traceFailed(
      traceError,
      blueprint.modules.get(blueprint.root)?.name ?? '',
    );
  }
  return blueprint;
}
