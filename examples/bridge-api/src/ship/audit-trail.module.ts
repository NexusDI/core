import { defineModule, provide } from '@nexusdi/core';

import { AUDIT_LOG, type IAuditLog } from './contracts';

class AuditRecorder implements IAuditLog {
  readonly #calls: string[] = [];
  get calls() {
    return this.#calls;
  }
  record(call: string) {
    this.#calls.push(call);
  }
}

/**
 * Exports the store, so the app and the interceptors plugin, which imports
 * it for its interceptor's dependency, share one instance.
 */
export const AuditTrail = defineModule({
  name: 'AuditTrail',
  providers: [provide(AUDIT_LOG, { useClass: AuditRecorder })],
  exports: [AUDIT_LOG],
});
