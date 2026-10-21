import {
  defineModule,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
} from '@nexusdi/core';

import type { Course } from './contracts';

/** The console's link to bridge-api, over HTTP. */
export interface IBridgeLink {
  course(to: string): Promise<{ course: Course; entries: readonly string[] }>;
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
    const url = new URL(`course/${encodeURIComponent(to)}`, this.options.url);
    const res = await fetch(url, {
      headers: { 'x-mission-id': this.request.mission.id },
      signal: this.request.signal,
    });
    if (!res.ok)
      throw new Error(`bridge-api answered ${res.status} for ${url.pathname}`);
    return (await res.json()) as {
      course: Course;
      entries: readonly string[];
    };
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
