/** The code of a NexusError, or the error's name for any other error. */
function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === 'string') return code;
    if (typeof name === 'string') return name;
  }
  return 'Error';
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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
