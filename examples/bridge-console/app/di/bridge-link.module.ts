import {
  defineModule,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
} from '@nexusdi/core';

import { MISSION_HEADER } from '@nexusdi/bridge-api/mission';
import type { NexusGraph } from '@nexusdi/devtools';
// Type imports: the console holds no simulation code.
import type {
  AtmosphereReading,
  CompartmentId,
  FtlRating,
  ShipCommand,
  ShipReading,
} from '@nexusdi/meridian-systems';
import type { Course } from '@nexusdi/meridian-systems/charts';

import {
  BRIDGE_LINK,
  type BridgeOffline,
  type CommandAnswer,
  type IBridgeLink,
} from './contracts';

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
  async loadFtl(): Promise<FtlRating | BridgeOffline> {
    const url = new URL('sections/ftl', this.options.url);
    const sent = await this.#reach(() => this.#fetch(url, 'POST'));
    if ('accepted' in sent) return sent;
    const res = sent;
    if (res.status !== 200) throw await rejection(res, url);
    return ((await res.json()) as { rating: FtlRating }).rating;
  }

  /**
   * Posts `body` as JSON to `path` and reads the answer: 202 is the queued
   * tick, 400 and 409 are the backend's refusal, and any other status rejects.
   */
  async #post(path: string, body: unknown): Promise<CommandAnswer> {
    const url = new URL(path, this.options.url);
    const sent = await this.#reach(() =>
      fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [MISSION_HEADER]: this.request.mission.id,
        },
        body: JSON.stringify(body),
        signal: this.request.signal,
      }),
    );
    if ('accepted' in sent) return sent;
    const res = sent;
    if (res.status === 202) {
      const { tick, flightLog, notice } = (await res.json()) as {
        tick: number;
        flightLog?: readonly string[];
        notice?: { code: string; message: string; fix?: string };
      };
      return {
        accepted: true,
        tick,
        ...(flightLog === undefined ? {} : { flightLog }),
        ...(notice === undefined ? {} : { notice }),
      };
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

  /**
   * Runs `send` and gives its response, or the `BridgeOffline` reply when the
   * network fails. An abort of the request's signal still rejects, since the
   * reader has left the page.
   */
  async #reach(
    send: () => Promise<Response>,
  ): Promise<Response | BridgeOffline> {
    try {
      return await send();
    } catch (error) {
      if (this.request.signal?.aborted) throw error;
      return {
        accepted: false,
        status: 503,
        code: 'BRIDGE_OFFLINE',
        message: `The bridge is unreachable at ${this.options.url}.`,
        fix: 'Start bridge-api with `npx nx run @nexusdi/bridge-api:dev`, or set BRIDGE_API_URL to the address it listens on.',
      };
    }
  }

  /** Fetches `path` and throws when the status is not ok. */
  async #get(path: string) {
    const url = new URL(path, this.options.url);
    return this.#ok(await this.#fetch(url), url);
  }

  /** Sends `method` to `url` with no body, the request's mission and its abort signal. */
  #fetch(url: URL, method: 'GET' | 'POST' = 'GET') {
    return fetch(url, {
      method,
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
