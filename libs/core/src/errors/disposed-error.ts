import { errorBase } from './nexus-error.js';

interface DisposedFields {
  readonly target: 'container' | 'scope' | 'instance';
}

/** A public method or a thunk was called after disposal started. */
export class DisposedError extends errorBase<'NEXUS_DISPOSED', DisposedFields>(
  'NEXUS_DISPOSED',
  'DisposedError',
) {}
