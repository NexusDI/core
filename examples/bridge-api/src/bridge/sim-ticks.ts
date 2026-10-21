const MAX_TICKS = 10_000;

/**
 * The largest body `POST /sim/advance` and `POST /commands` read, in bytes,
 * on every framework. It equals the 100 kB default of Express's `express.json()`.
 */
export const SIM_BODY_LIMIT = 100 * 1024;

/** The 400 body of `POST /sim/advance`, for a body `parseTicks` refuses. */
export const TICKS_REFUSED = {
  error: `Send { "ticks": n } with n a whole number from 1 to ${MAX_TICKS}.`,
} as const;

/**
 * Reads `ticks` from the body of `POST /sim/advance`: a whole number from 1
 * to 10000, or `undefined` for any other body. The cap bounds the work one
 * request asks of the server.
 */
export function parseTicks(body: unknown): number | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { ticks } = body as { ticks?: unknown };
  return typeof ticks === 'number' &&
    Number.isInteger(ticks) &&
    ticks >= 1 &&
    ticks <= MAX_TICKS
    ? ticks
    : undefined;
}
