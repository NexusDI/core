import { errorBase } from './nexus-error.js';

interface InvalidExportFields {
  readonly token: string;
  readonly module: string;
}

/** A module exports a token it cannot see, or a module it does not import. */
export class InvalidExportError extends errorBase<
  'NEXUS_INVALID_EXPORT',
  InvalidExportFields
>('NEXUS_INVALID_EXPORT', 'InvalidExportError') {}
