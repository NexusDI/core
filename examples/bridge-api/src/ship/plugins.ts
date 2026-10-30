import { provide, type NexusPlugin, type TraceEvent } from '@nexusdi/core';
import type * as DevtoolsModule from '@nexusdi/devtools';
import { errors } from '@nexusdi/errors';
import {
  interceptors,
  tap,
  type CallContext,
  type Interceptor,
  type Next,
} from '@nexusdi/interceptors';
import {
  BLAST_DOORS,
  COMMS_ARRAY,
  type IBlastDoors,
  type QueuedCommand,
} from '@nexusdi/meridian-systems';
import { PressureInterlock } from '@nexusdi/meridian-systems/interlock';

import { SHIP_TEXT } from '../bridge/refusal';
import { phaseCheck } from './black-box.plugin';
import { AuditTrail } from './audit-trail.module';
import {
  AUDIT_LOG,
  COMMS_LOG,
  FLIGHT_LOG,
  type IAuditLog,
  type ICommsLog,
  type IScopeSource,
  LINK_RETRY_OPTIONS,
  type LinkRetryOptions,
  NAV_CHARTS,
  REQUEST_SCOPES,
  SUBSPACE_LINK,
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

/**
 * Writes the comms log entry of each hail with the tick the command queued
 * at. The hail is sync, and tap() keeps it sync. Private: the class is its
 * own token.
 */
class HailLog implements Interceptor {
  static deps = [COMMS_LOG] as const;
  constructor(private readonly log: ICommsLog) {}
  intercept(_call: CallContext, next: Next) {
    return tap(next, {
      value: (queued) =>
        this.log.record(
          `hail queued for tick ${(queued as QueuedCommand).tick}`,
        ),
    });
  }
}

const DEFAULT_DEADLINE_MS = 6000;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Calls the rest of the chain again when a subspace link call fails, up to
 * `attempts` calls with `delayMs` between them, and writes each failed
 * attempt to the comms log. The last failure goes to the caller. The plugin
 * binds it to `signOff`. `receive` runs in the NAV_CHARTS factory while the
 * container builds, before any interceptor exists, so a binding there would
 * throw NEXUS_INTERCEPTOR_NOT_READY. The retry stops and rethrows once the
 * time spent, the next delay and a repeat of the last attempt's duration
 * reach `deadlineMs` (default 6000), so a silent relay that times out after
 * 5 s gets one attempt and a relay that refuses at once gets all of them.
 * The deadline bounds the wait at dispose. The sign-off is treated as
 * idempotent: a retry after a timeout may deliver it twice.
 * Private: the class is its own token.
 */
class LinkRetry implements Interceptor {
  static deps = [COMMS_LOG, LINK_RETRY_OPTIONS] as const;
  constructor(
    private readonly log: ICommsLog,
    private readonly options: LinkRetryOptions,
  ) {}
  async intercept(call: CallContext, next: Next) {
    const name = String(call.method);
    const {
      attempts,
      delayMs,
      deadlineMs = DEFAULT_DEADLINE_MS,
    } = this.options;
    const start = Date.now();
    for (let attempt = 1; ; attempt += 1) {
      const attemptStart = Date.now();
      try {
        const answer = await next();
        if (attempt > 1)
          this.log.record(`link ${name} answered on attempt ${attempt}`);
        return answer;
      } catch (error) {
        this.log.record(`link ${name} attempt ${attempt} failed`);
        if (attempt >= attempts) throw error;
        const now = Date.now();
        // Another attempt takes about as long as this one did.
        if (now - start + delayMs + (now - attemptStart) >= deadlineMs)
          throw error;
        await wait(delayMs);
      }
    }
  }
}

/** The retry the ship runs by default: three calls, 100 ms apart. */
const DEFAULT_LINK_RETRY: LinkRetryOptions = {
  attempts: 3,
  delayMs: 100,
};

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
  /** The subspace link's retry. Defaults to `DEFAULT_LINK_RETRY`. */
  retry?: LinkRetryOptions;
}

/** Options of `bridgePlugins`. `trace` needs the devtools `tools`. */
export type PluginOptions = BasePluginOptions & { dev?: boolean } & (
    | { trace?: undefined; tools?: PluginTools }
    | { trace: (event: TraceEvent) => void; tools: PluginTools }
  );

/**
 * The demo app's plugins. The interceptors always run: the audit on
 * NAV_CHARTS, the flight recorder and the pressure interlock on
 * BLAST_DOORS, the hail log on COMMS_ARRAY and the retry on SUBSPACE_LINK.
 * The phase check refuses a ship system class without a phase. In development
 * errors() with SHIP_TEXT joins them. No refusal body depends on errors(),
 * since refusalOf reads SHIP_TEXT itself. The devtools() plugin that graph()
 * and the profile need comes with `introspect`, which labels each simulation
 * provider with `shipNotes`. It also brings the black box recorder.
 */
export function bridgePlugins(options: PluginOptions = {}): NexusPlugin[] {
  const { tools } = options;
  return [
    interceptors({
      imports: [AuditTrail],
      providers: [
        provide(REQUEST_SCOPES, { useValue: options.scopes ?? NO_SCOPES }),
        provide(LINK_RETRY_OPTIONS, {
          useValue: options.retry ?? DEFAULT_LINK_RETRY,
        }),
      ],
      register: [
        NavAudit,
        FlightRecorder,
        PressureInterlock,
        HailLog,
        LinkRetry,
      ],
      // The recorder writes after next() returns, so an open the interlock
      // refuses records nothing.
      bindings: [
        { token: NAV_CHARTS, class: [NavAudit] },
        { token: COMMS_ARRAY, methods: { hail: [HailLog] } },
        { token: SUBSPACE_LINK, methods: { signOff: [LinkRetry] } },
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
