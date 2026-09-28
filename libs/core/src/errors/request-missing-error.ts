import { errorBase } from './nexus-error.js';

interface RequestMissingFields {
  readonly dependents: readonly string[];
}

/** createScope() without a request while providers depend on REQUEST. */
export class RequestMissingError extends errorBase<
  'NEXUS_REQUEST_MISSING',
  RequestMissingFields
>('NEXUS_REQUEST_MISSING', 'RequestMissingError') {}
