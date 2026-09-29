import { errorBase } from './nexus-error.js';

/** An eager: false provider returned a thenable at its first build. */
export class LazyAsyncError extends errorBase<
  'NEXUS_LAZY_ASYNC',
  { readonly token: string; readonly module: string }
>('NEXUS_LAZY_ASYNC', 'LazyAsyncError') {}
