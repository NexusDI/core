import { isNexusError } from '@nexusdi/core';
import type { SectionConflictError, SectionError } from '@nexusdi/react';

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
 * shows the code of the SectionError, then the code and message of its
 * cause, the load error. A section conflict has no cause, so it shows the
 * conflict's code and message. Its retry button loads the section again.
 */
export function SectionFailed({
  error,
  retry,
}: {
  error: SectionError | SectionConflictError;
  retry(): void;
}) {
  const cause = error.cause;
  const hasCause = error.code === 'NEXUS_REACT_SECTION_FAILED';
  return (
    <div role="alert" data-testid="section-failed">
      <p>
        The section failed to load: <code>{error.code}</code>
      </p>
      {hasCause ? (
        <p>
          The cause: <code>{codeOf(cause)}</code>
        </p>
      ) : null}
      <pre>{messageOf(hasCause ? cause : error)}</pre>
      <button type="button" onClick={retry}>
        Retry
      </button>
    </div>
  );
}
