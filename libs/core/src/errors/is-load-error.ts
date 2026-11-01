import { LoadContributionError } from './load-contribution-error.js';
import { LoadError } from './load-error.js';
import { LoadImportError } from './load-import-error.js';

/**
 * Whether compile() threw the error alone, on a load, before its later
 * passes ran. check() wraps each such error in a BlueprintError.
 */
export function isLoadError(
  error: unknown,
): error is LoadError | LoadContributionError | LoadImportError {
  return (
    error instanceof LoadError ||
    error instanceof LoadContributionError ||
    error instanceof LoadImportError
  );
}
