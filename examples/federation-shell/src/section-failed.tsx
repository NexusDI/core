import { isNexusError } from '@nexusdi/core';

/** The code of a NexusError, or the class name of any other thrown value. */
function codeOf(error: unknown): string {
  if (isNexusError(error)) return error.code;
  if (typeof error === 'object' && error !== null)
    return error.constructor?.name ?? 'Error';
  return 'Error';
}

/** An object with no prototype has no toString, so String() would throw on it. */
const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null)
    return Object.prototype.toString.call(error);
  return String(error);
};

/**
 * The fallback a station's SectionBoundary renders for a failed load. It
 * shows the error's code and message, and its retry button loads the
 * section again.
 */
export function SectionFailed({
  error,
  retry,
}: {
  error: unknown;
  retry(): void;
}) {
  return (
    <div role="alert" data-testid="section-failed">
      <p>
        The section failed to load: <code>{codeOf(error)}</code>
      </p>
      <pre>{messageOf(error)}</pre>
      <button type="button" onClick={retry}>
        Retry
      </button>
    </div>
  );
}
