import {
  defineModule,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
} from '@nexusdi/core';

import { MISSION_HEADER } from '@nexusdi/bridge-api/mission';
import type { NexusGraph } from '@nexusdi/devtools';
// A type import: the console holds no simulation code.
import type {
  AtmosphereReading,
  CompartmentId,
  ShipCommand,
  ShipReading,
} from '@nexusdi/meridian-systems';

import type { Course } from './contracts';

/**
 * What bridge-api answers a command: the tick that applies it and, when the
 * request's flight log holds entries, those entries, or its refusal.
 */
export type CommandAnswer =
  | {
      readonly accepted: true;
      readonly tick: number;
      readonly flightLog?: readonly string[];
    }
  | {
      readonly accepted: false;
      readonly status: 400 | 409;
      readonly code: string;
      readonly message: string;
      readonly fix?: string;
    };

/** The console's link to bridge-api, over HTTP. */
export interface IBridgeLink {
  course(to: string): Promise<{ course: Course; entries: readonly string[] }>;
  /** The ship now, with each compartment's pressure, from `GET /sim`. */
  snapshot(): Promise<ShipReading>;
  /**
   * The gas analyzer's reading of `compartment`, from
   * `GET /compartments/:id/atmosphere`. A compartment the deck lacks answers
   * 404, and the call rejects.
   */
  atmosphere(compartment: string): Promise<AtmosphereReading<CompartmentId>>;
  /** The body of `GET /telemetry`, a stream of server-sent events. */
  telemetry(): Promise<ReadableStream<Uint8Array>>;
  /**
   * The ship's annotated graph from `GET /graph`, or null when the backend
   * serves none.
   */
  graph(): Promise<NexusGraph | null>;
  /** Posts `cmd` to `POST /commands`. Any status but 202, 400 and 409 rejects. */
  command(cmd: ShipCommand): Promise<CommandAnswer>;
  /**
   * Posts the spool to `POST /ftl/spool`. The backend loads the FTL drive on
   * the first spool or jump.
   */
  spool(): Promise<CommandAnswer>;
  /** Posts a jump to the charted star `to`, to `POST /ftl/jump`. */
  jump(to: string): Promise<CommandAnswer>;
}
export const BRIDGE_LINK = new Token<IBridgeLink>('BridgeLink');
const BRIDGE_LINK_OPTIONS = new Token<{ readonly url: string }>(
  'BridgeLinkOptions',
);

/**
 * The error for an answer the link does not read. It cancels the body first:
 * an unread body holds the connection open until it is read or cancelled.
 */
async function rejection(res: Response, url: URL) {
  await res.body?.cancel();
  return new Error(`bridge-api answered ${res.status} for ${url.pathname}`);
}

/**
 * Calls bridge-api with the request's mission id and abort signal, so the
 * backend opens its own scope for the same mission, and a reader who leaves
 * the page aborts the call.
 */
class BridgeApiLink implements IBridgeLink {
  static deps = [REQUEST, BRIDGE_LINK_OPTIONS] as const;
  constructor(
    private readonly request: NexusRequest,
    private readonly options: { readonly url: string },
  ) {}
  async course(to: string) {
    const res = await this.#get(`course/${encodeURIComponent(to)}`);
    return (await res.json()) as {
      course: Course;
      entries: readonly string[];
    };
  }
  async snapshot() {
    return (await (await this.#get('sim')).json()) as ShipReading;
  }
  async atmosphere(compartment: string) {
    const res = await this.#get(
      `compartments/${encodeURIComponent(compartment)}/atmosphere`,
    );
    return (await res.json()) as AtmosphereReading<CompartmentId>;
  }
  async telemetry() {
    const res = await this.#get('telemetry');
    if (!res.body) throw new Error('bridge-api sent no telemetry body');
    return res.body;
  }
  async graph() {
    const url = new URL('graph', this.options.url);
    const res = await this.#fetch(url);
    if (res.status === 404) {
      await res.body?.cancel();
      return null;
    }
    return (await (await this.#ok(res, url)).json()) as NexusGraph;
  }
  async command(cmd: ShipCommand): Promise<CommandAnswer> {
    return this.#post('commands', cmd);
  }
  async spool(): Promise<CommandAnswer> {
    return this.#post('ftl/spool');
  }
  async jump(to: string): Promise<CommandAnswer> {
    return this.#post('ftl/jump', { to });
  }

  /**
   * Posts `body` as JSON to `path` and reads the answer: 202 is the queued
   * tick, 400 and 409 are the backend's refusal, and any other status rejects.
   */
  async #post(path: string, body?: unknown): Promise<CommandAnswer> {
    const url = new URL(path, this.options.url);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [MISSION_HEADER]: this.request.mission.id,
      },
      body: JSON.stringify(body),
      signal: this.request.signal,
    });
    if (res.status === 202) {
      const { tick, flightLog } = (await res.json()) as {
        tick: number;
        flightLog?: readonly string[];
      };
      return flightLog === undefined
        ? { accepted: true, tick }
        : { accepted: true, tick, flightLog };
    }
    if (res.status === 400 || res.status === 409) {
      const refusal = (await res.json()) as {
        code: string;
        message: string;
        fix?: string;
      };
      return { accepted: false, status: res.status, ...refusal };
    }
    throw await rejection(res, url);
  }

  /** Fetches `path` and throws when the status is not ok. */
  async #get(path: string) {
    const url = new URL(path, this.options.url);
    return this.#ok(await this.#fetch(url), url);
  }

  /** Fetches `url` with the request's mission and abort signal. */
  #fetch(url: URL) {
    return fetch(url, {
      headers: { [MISSION_HEADER]: this.request.mission.id },
      signal: this.request.signal,
    });
  }

  /** Returns `res` when it is ok, or cancels its body and throws its status. */
  async #ok(res: Response, url: URL) {
    if (res.ok) return res;
    throw await rejection(res, url);
  }
}

/** BRIDGE_LINK, configured with `BridgeLink.forRoot({ url })`. */
export const BridgeLink = defineModule({
  name: 'BridgeLink',
  options: BRIDGE_LINK_OPTIONS,
  providers: [
    provide(BRIDGE_LINK, { useClass: BridgeApiLink, lifetime: 'scoped' }),
  ],
  exports: [BRIDGE_LINK],
});
