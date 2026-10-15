import { Token, type NexusPlugin, type TraceEvent } from '@nexusdi/core';
import { devtools, trace } from '@nexusdi/devtools';
import { errors } from '@nexusdi/errors';
import { interceptor, interceptors } from '@nexusdi/interceptors';

import { Audit, NAV_AUDIT, type INavAudit } from './audit';
import { NAV_CHARTS } from './contracts';

/** The interceptor entry: the shared audit, resolved from the Audit module. */
const NAV_AUDIT_HOOK = new Token<INavAudit>('NavAuditHook');

/** The demo app's plugins: the audit interceptor always; errors() and devtools() in development. */
export function bridgePlugins(
  options: { dev?: boolean; trace?: (event: TraceEvent) => void } = {},
): NexusPlugin[] {
  return [
    interceptors({
      imports: [Audit],
      register: [
        interceptor(NAV_AUDIT_HOOK, {
          useFactory: (audit) => audit,
          deps: [NAV_AUDIT],
        }),
      ],
      bindings: [{ token: NAV_CHARTS, class: [NAV_AUDIT_HOOK] }],
    }),
    ...(options.dev ? [errors(), devtools()] : []),
    ...(options.trace ? [trace(options.trace)] : []),
  ];
}

/** The plugins `nexusdi graph --plugins` reads, as an exported array. */
export const graphPlugins: NexusPlugin[] = bridgePlugins();
