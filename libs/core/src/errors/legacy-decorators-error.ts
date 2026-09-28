import { errorBase } from './nexus-error.js';

interface LegacyDecoratorsFields {
  readonly decorator: string;
}

/** A NexusDI decorator was called the way experimentalDecorators calls one. */
export class LegacyDecoratorsError extends errorBase<
  'NEXUS_LEGACY_DECORATORS',
  LegacyDecoratorsFields
>('NEXUS_LEGACY_DECORATORS', 'LegacyDecoratorsError') {}
