import type { NexusPlugin, TraceEvent } from '@nexusdi/core';
import { devtools, trace } from '@nexusdi/devtools';
import { errors } from '@nexusdi/errors';
import {
  interceptors,
  type CallContext,
  type Interceptor,
  type Next,
} from '@nexusdi/interceptors';
import { shipNotes } from '@nexusdi/meridian-systems';

import { AUDIT_LOG, AuditTrail, type IAuditLog } from './audit-trail.module';
import { NAV_CHARTS } from './contracts';

/** Records each NAV_CHARTS call in the audit log. Private: the class is its own token. */
class NavAudit implements Interceptor {
  static deps = [AUDIT_LOG] as const;
  constructor(private readonly log: IAuditLog) {}
  intercept(call: CallContext, next: Next) {
    this.log.record(
      `${String(call.method)} ${call.args.map(String).join(' ')}`,
    );
    return next();
  }
}

/**
 * The demo app's plugins: the audit interceptor always; errors() and
 * devtools() in development, where `shipNotes` labels each simulation
 * provider in graph() with its system.
 */
export function bridgePlugins(
  options: { dev?: boolean; trace?: (event: TraceEvent) => void } = {},
): NexusPlugin[] {
  return [
    interceptors({
      imports: [AuditTrail],
      register: [NavAudit],
      bindings: [{ token: NAV_CHARTS, class: [NavAudit] }],
    }),
    ...(options.dev ? [errors(), devtools({ annotate: [shipNotes] })] : []),
    ...(options.trace ? [trace(options.trace)] : []),
  ];
}

/** The plugins `nexusdi graph --plugins` reads, as an exported array. */
export const graphPlugins: NexusPlugin[] = bridgePlugins();
