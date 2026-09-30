import type { NexusErrorByCode } from './is-nexus-error.js';

/**
 * Every code a NexusError carries: core's and each code a package adds to
 * NexusErrorByCode. The codes are public API: a code is never renamed or
 * reused, and the docs link each one to a page that explains it.
 */
export type NexusErrorCode = keyof NexusErrorByCode;
