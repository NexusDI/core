import { LoadContributionError } from './load-contribution-error.js';
import { LoadError } from './load-error.js';
import { LoadGrantError } from './load-grant-error.js';

/**
 * Whether compile() threw the error alone, on a load, before its later
 * passes ran. Nexus.check wraps each such error in a BlueprintError.
 */
export function isLoadError(
  error: unknown,
): error is LoadError | LoadContributionError | LoadGrantError {
  return (
    error instanceof LoadError ||
    error instanceof LoadContributionError ||
    error instanceof LoadGrantError
  );
}
