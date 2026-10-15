import { defineModule, provide, Token } from '@nexusdi/core';
import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';

export interface INavAudit extends Interceptor {
  readonly calls: readonly string[];
}
export const NAV_AUDIT = new Token<INavAudit>('NavAudit');

class NavAudit implements INavAudit {
  readonly #calls: string[] = [];
  get calls() {
    return this.#calls;
  }
  intercept(call: CallContext, next: Next) {
    this.#calls.push(
      `${String(call.method)} ${call.args.map(String).join(' ')}`,
    );
    return next();
  }
}

/**
 * Exports the audit, so the app and the interceptors plugin share one
 * instance: the plugin's own providers are private to its module.
 */
export const Audit = defineModule({
  name: 'Audit',
  providers: [provide(NAV_AUDIT, { useClass: NavAudit })],
  exports: [NAV_AUDIT],
});
