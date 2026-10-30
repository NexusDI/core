import { defineModule, provide } from '@nexusdi/core';

import {
  AUDIT_LOG,
  COMMS_LOG,
  type IAuditLog,
  type ICommsLog,
} from './contracts';

class AuditRecorder implements IAuditLog {
  readonly #calls: string[] = [];
  get calls() {
    return this.#calls;
  }
  record(call: string) {
    this.#calls.push(call);
  }
}

class CommsRecorder implements ICommsLog {
  readonly #entries: string[] = [];
  get entries() {
    return this.#entries;
  }
  record(entry: string) {
    this.#entries.push(entry);
  }
}

/**
 * Exports the stores, so the app and the interceptors plugin, which imports
 * it for its interceptors' dependencies, share one instance each.
 */
export const AuditTrail = defineModule({
  name: 'AuditTrail',
  providers: [
    provide(AUDIT_LOG, { useClass: AuditRecorder }),
    provide(COMMS_LOG, { useClass: CommsRecorder }),
  ],
  exports: [AUDIT_LOG, COMMS_LOG],
});
