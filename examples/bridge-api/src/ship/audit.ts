import { defineModule, provide, Token } from '@nexusdi/core';

/** The calls the audit interceptor saw, which the app reads. */
export interface IAuditLog {
  record(call: string): void;
  readonly calls: readonly string[];
}
export const AUDIT_LOG = new Token<IAuditLog>('AuditLog');

class AuditLog implements IAuditLog {
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
export const Audit = defineModule({
  name: 'Audit',
  providers: [provide(AUDIT_LOG, { useClass: AuditLog })],
  exports: [AUDIT_LOG],
});
