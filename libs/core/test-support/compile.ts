import { compile, type CompileInput } from '../src/blueprint/compile.js';
import { BlueprintError, type NexusError } from '../src/errors/index.js';

/** The errors of a compile that must fail. */
export function compileErrors(
  root: unknown,
  rest: Omit<CompileInput, 'root'> = {},
): NexusError[] {
  try {
    compile({ root, ...rest });
  } catch (error) {
    if (error instanceof BlueprintError) return [...error.errors];
    throw error;
  }
  throw new Error('expected compile() to fail, and it succeeded');
}
