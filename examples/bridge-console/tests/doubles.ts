import { REQUEST, type NexusRequest } from '@nexusdi/core';

import type { IBridgeLink } from '../app/bridge/bridge-link';

/**
 * The double of BRIDGE_LINK: it answers the way bridge-api's
 * `GET /course/:to` does, from the scope's mission, with no server.
 * Override BRIDGE_LINK with `useClass: FakeBridgeLink` in a scoped binding.
 */
export class FakeBridgeLink implements IBridgeLink {
  static deps = [REQUEST] as const;
  constructor(private readonly request: NexusRequest) {}
  async course(to: string) {
    return {
      course: { to, heading: 42 },
      entries: [`${this.request.mission.id}: plotting ${to}`],
    };
  }
}

/** The override of BRIDGE_LINK the route tests use. */
export const fakeBridgeLink = {
  useClass: FakeBridgeLink,
  lifetime: 'scoped',
} as const;
