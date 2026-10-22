import { provide, type NexusPlugin, type TraceEvent } from '@nexusdi/core';
import { devtools, trace } from '@nexusdi/devtools';
import { errors } from '@nexusdi/errors';
import {
  interceptors,
  type CallContext,
  type Interceptor,
  type Next,
} from '@nexusdi/interceptors';
import {
  BLAST_DOORS,
  type IBlastDoors,
  shipNotes,
} from '@nexusdi/meridian-systems';
import { PressureInterlock } from '@nexusdi/meridian-systems/interlock';

import { SHIP_TEXT } from '../bridge/refusal';
import { AUDIT_LOG, AuditTrail, type IAuditLog } from './audit-trail.module';
import {
  FLIGHT_LOG,
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
    this.scopes
      .current()
      ?.get(FLIGHT_LOG)
      .record(`${DONE[call.method as keyof IBlastDoors]} ${String(door)}`);
    return result;
  }
}

/** The scope source of a ship with no ambient scope: no request is ever current. */
const NO_SCOPES: IScopeSource = { current: () => undefined };

/**
 * The demo app's plugins. The interceptors always run: the audit on
 * NAV_CHARTS, and the flight recorder and the pressure interlock on
 * BLAST_DOORS. In development errors() with SHIP_TEXT and devtools() join
 * them, and `shipNotes` labels each simulation provider in graph() with its
 * system. No refusal body depends on errors(), since refusalOf reads
 * SHIP_TEXT itself.
 */
export function bridgePlugins(
  options: {
    dev?: boolean;
    trace?: (event: TraceEvent) => void;
    /** The request scopes the flight recorder reads. Without them it records nothing. */
    scopes?: IScopeSource;
  } = {},
): NexusPlugin[] {
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
    ...(options.dev
      ? [errors({ text: SHIP_TEXT }), devtools({ annotate: [shipNotes] })]
      : []),
    ...(options.trace ? [trace(options.trace)] : []),
  ];
}

/** The plugins `nexusdi graph --plugins` reads, as an exported array. */
export const graphPlugins: NexusPlugin[] = bridgePlugins();
