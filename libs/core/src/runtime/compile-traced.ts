import type { Blueprint } from '../blueprint/blueprint.js';
import { compile, type CompileInput } from '../blueprint/compile.js';
import { BlueprintError, LoadError, ProviderError } from '../errors/index.js';
import type { Tracer } from './trace.js';

/** An observe hook's own throw while reporting `compile`, not a compile failure. */
function traceFailed(error: unknown, module: string): ProviderError {
  return new ProviderError(
    { token: 'startup', module, path: [], alsoFailed: [], disposalErrors: [] },
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
 * its error count. A throw from an observe hook surfaces as a
 * ProviderError whose `cause` is the hook's exception, the same way a
 * callback throw during construct or init surfaces through startBlueprint's
 * catch. This function runs before startBlueprint, so it wraps the throw
 * itself.
 */
export function compileTraced(
  tracer: Tracer,
  input: CompileInput,
  phase: 'create' | 'load' | 'check',
): Blueprint {
  const start = tracer.now();
  let blueprint: Blueprint;
  try {
    blueprint = compile(input);
  } catch (error) {
    const errors = errorCount(error);
    if (errors !== undefined) {
      try {
        tracer.emit(() => ({
          type: 'compile',
          phase,
          modules: 0,
          providers: 0,
          errors,
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
