import { NexusError } from './nexus-error.js';

const WHAT = {
  container: 'the container is disposed or disposing',
  scope: 'the scope is disposed',
  instance: 'the lazy() target was already disposed',
} as const;

/** A public method or a thunk was called after disposal started. */
export class DisposedError extends NexusError {
  declare readonly code: 'NEXUS_DISPOSED';
  readonly target: 'container' | 'scope' | 'instance';

  constructor(fields: { target: 'container' | 'scope' | 'instance' }) {
    super('NEXUS_DISPOSED', `${WHAT[fields.target]}.`);
    this.name = 'DisposedError';
    this.target = fields.target;
  }
}
