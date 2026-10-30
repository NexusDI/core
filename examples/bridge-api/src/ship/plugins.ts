import { provide, type NexusPlugin, type TraceEvent } from '@nexusdi/core';
import type * as DevtoolsModule from '@nexusdi/devtools';
import { errors } from '@nexusdi/errors';
import {
  interceptors,
  type CallContext,
  type Interceptor,
  type Next,
} from '@nexusdi/interceptors';
import { BLAST_DOORS, type IBlastDoors } from '@nexusdi/meridian-systems';
import { PressureInterlock } from '@nexusdi/meridian-systems/interlock';

import { SHIP_TEXT } from '../bridge/refusal';
import { phaseCheck } from './black-box.plugin';
import { AuditTrail } from './audit-trail.module';
import {
  AUDIT_LOG,
  FLIGHT_LOG,
  type IAuditLog,
  type IScopeSource,
  NAV_CHARTS,
  REQUEST_SCOPES,
} from './contracts';

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

/** The past tense of each door method, as the flight log words it. */
const DONE = {
  open: 'opened',
  close: 'closed',
} as const satisfies Record<keyof IBlastDoors, string>;

const isDoorMethod = (method: string | symbol): method is keyof IBlastDoors =>
  method === 'open' || method === 'close';

/**
 * Records each door command that went through in the flight log of the
 * request in flight. A singleton serves every request, so it finds the
 * request's log through the current scope, and outside a scope it records
 * nothing. Private: the class is its own token.
 */
class FlightRecorder implements Interceptor {
  static deps = [REQUEST_SCOPES] as const;
  constructor(private readonly scopes: IScopeSource) {}
  intercept(call: CallContext, next: Next) {
    const result = next();
    const [door] = call.args;
    if (isDoorMethod(call.method))
      this.scopes
        .current()
        ?.get(FLIGHT_LOG)
        .record(`${DONE[call.method]} ${String(door)}`);
    return result;
  }
}

/** The scope source of a ship with no ambient scope: no request is ever current. */
const NO_SCOPES: IScopeSource = { current: () => undefined };

/**
 * The part of `@nexusdi/devtools` the plugins use. The caller passes the
 * module, so a Worker entry loads it with a dynamic import only when it needs
 * it, and this file imports none of it.
 */
export type PluginTools = Pick<typeof DevtoolsModule, 'trace'>;

interface BasePluginOptions {
  /** The request scopes the flight recorder reads. Without them it records nothing. */
  scopes?: IScopeSource;
}

/** Options of `bridgePlugins`. `trace` needs the devtools `tools`. */
export type PluginOptions = BasePluginOptions & { dev?: boolean } & (
    | { trace?: undefined; tools?: PluginTools }
    | { trace: (event: TraceEvent) => void; tools: PluginTools }
  );

/**
 * The demo app's plugins. The interceptors always run: the audit on
 * NAV_CHARTS, and the flight recorder and the pressure interlock on
 * BLAST_DOORS. The phase check refuses a ship system class without a
 * phase. In development errors() with SHIP_TEXT joins them. No refusal body
 * depends on errors(), since refusalOf reads SHIP_TEXT itself. The devtools()
 * plugin that graph() and the profile need comes with `introspect`, which
 * labels each simulation provider with `shipNotes`. It also brings the black
 * box recorder.
 */
export function bridgePlugins(options: PluginOptions = {}): NexusPlugin[] {
  const { tools } = options;
  return [
    interceptors({
      imports: [AuditTrail],
      providers: [
        provide(REQUEST_SCOPES, { useValue: options.scopes ?? NO_SCOPES }),
      ],
      register: [NavAudit, FlightRecorder, PressureInterlock],
      // The recorder writes after next() returns, so an open the interlock
      // refuses records nothing.
      bindings: [
        { token: NAV_CHARTS, class: [NavAudit] },
        {
          token: BLAST_DOORS,
          methods: {
            open: [FlightRecorder, PressureInterlock],
            close: [FlightRecorder],
          },
        },
      ],
    }),
    phaseCheck,
    ...(options.dev ? [errors({ text: SHIP_TEXT })] : []),
    ...(options.trace && tools ? [tools.trace(options.trace)] : []),
  ];
}

/** The plugins `nexusdi graph --plugins` reads, as an exported array. */
export const graphPlugins: NexusPlugin[] = bridgePlugins();
