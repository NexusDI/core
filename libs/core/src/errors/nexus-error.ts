import type { NexusErrorCode } from './codes.js';

/**
 * The base class of every error the container raises.
 *
 * `code` is stable public API that callers branch on. The message starts with
 * `[CODE]` exactly once, then says what is wrong and what to do.
 */
export abstract class NexusError extends Error {
  readonly code: NexusErrorCode;

  protected constructor(
    code: NexusErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`[${code}] ${message}`, options);
    this.code = code;
  }
}
