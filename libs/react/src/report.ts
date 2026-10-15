/** Hands an error nobody awaits to the browser's reportError, or to console.error where it is missing. */
export function report(error: unknown): void {
  const global = globalThis as { reportError?: (error: unknown) => void };
  if (typeof global.reportError === 'function') global.reportError(error);
  else console.error(error);
}
