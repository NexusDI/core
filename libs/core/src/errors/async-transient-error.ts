import { errorBase } from './nexus-error.js';

interface AsyncTransientFields {
  readonly token: string;
  readonly module: string;
}

/** A transient factory returned a thenable at get(). */
export class AsyncTransientError extends errorBase<
  'NEXUS_ASYNC_TRANSIENT',
  AsyncTransientFields
>('NEXUS_ASYNC_TRANSIENT', 'AsyncTransientError') {}
