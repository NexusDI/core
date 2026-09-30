import { errorBase } from '../src/index.js';

// A third-party package's error, declared the way such a package declares
// one: a class from errorBase with its own docs base url, and its code
// added to NexusErrorByCode by augmentation. nexus-error.test-d.ts checks
// that the code joins NexusErrorCode. Every test file in core's spec
// program sees the key.
export class AcmeCacheStoreError extends errorBase<
  'ACME_CACHE_STORE',
  { store: string; module: string }
>('ACME_CACHE_STORE', 'AcmeCacheStoreError', 'https://acme.dev/errors/') {}

declare module '../src/index.js' {
  interface NexusErrorByCode {
    ACME_CACHE_STORE: AcmeCacheStoreError;
  }
}
