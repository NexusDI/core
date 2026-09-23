import { NexusError } from './nexus-error.js';

/** A transient factory returned a thenable at get(). */
export class AsyncTransientError extends NexusError {
  declare readonly code: 'NEXUS_ASYNC_TRANSIENT';
  readonly token: string;
  readonly module: string;

  constructor(fields: { token: string; module: string }) {
    super(
      'NEXUS_ASYNC_TRANSIENT',
      `${fields.token} (module ${fields.module}) is transient and its factory returned a promise. get() is synchronous and cannot wait for it.\n` +
        `  Fix: use lifetime: 'scoped', or make the token a function type and provide () => Promise<T>.`,
    );
    this.name = 'AsyncTransientError';
    this.token = fields.token;
    this.module = fields.module;
  }
}
