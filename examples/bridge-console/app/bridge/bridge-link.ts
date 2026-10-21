import {
  defineModule,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
} from '@nexusdi/core';

import type { NexusGraph } from '@nexusdi/devtools';
import type { ShipSnapshot } from '@nexusdi/meridian-systems';

import type { Course } from './contracts';

/** The console's link to bridge-api, over HTTP. */
export interface IBridgeLink {
  course(to: string): Promise<{ course: Course; entries: readonly string[] }>;
  /** The ship now, from `GET /sim`. */
  snapshot(): Promise<ShipSnapshot>;
  /** The body of `GET /telemetry`, a stream of server-sent events. */
  telemetry(): Promise<ReadableStream<Uint8Array>>;
  /** The ship's annotated graph from `GET /graph`, or null when the backend serves none. */
  graph(): Promise<NexusGraph | null>;
}
export const BRIDGE_LINK = new Token<IBridgeLink>('BridgeLink');
const BRIDGE_LINK_OPTIONS = new Token<{ readonly url: string }>(
  'BridgeLinkOptions',
);

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
    return (await (await this.#get('sim')).json()) as ShipSnapshot;
  }
  async telemetry() {
    const res = await this.#get('telemetry');
    if (!res.body) throw new Error('bridge-api sent no telemetry body');
    return res.body;
  }
  async graph() {
    const res = await this.#get('graph', [404]);
    if (res.status === 404) return null;
    return (await res.json()) as NexusGraph;
  }

  /** Fetches `path` and throws on a status that is neither ok nor in `allowed`. */
  async #get(path: string, allowed: readonly number[] = []) {
    const url = new URL(path, this.options.url);
    const res = await fetch(url, {
      headers: { 'x-mission-id': this.request.mission.id },
      signal: this.request.signal,
    });
    if (!res.ok && !allowed.includes(res.status)) {
      await res.body?.cancel();
      throw new Error(`bridge-api answered ${res.status} for ${url.pathname}`);
    }
    return res;
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
