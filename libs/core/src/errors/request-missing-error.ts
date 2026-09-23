import { NexusError } from './nexus-error.js';

/** createScope() without a request while providers depend on REQUEST. */
export class RequestMissingError extends NexusError {
  declare readonly code: 'NEXUS_REQUEST_MISSING';
  readonly dependents: readonly string[];

  constructor(fields: { dependents: readonly string[] }) {
    const verb = fields.dependents.length === 1 ? 'depends' : 'depend';
    super(
      'NEXUS_REQUEST_MISSING',
      `createScope() received no request, and ${fields.dependents.join(', ')} ${verb} on REQUEST.\n  Fix: pass createScope({ request }).`,
    );
    this.name = 'RequestMissingError';
    this.dependents = fields.dependents;
  }
}
