/**
 * The module every route spec mocks `app/nexus.server` with. The route files
 * call `di.inject` at import, before any test has built a container, so `di`
 * takes its container from `serve`, which the fixture in `console.tsx` calls
 * with the file's container before a route runs.
 */
import type { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/react-router';

let served: Nexus | undefined;

/** Names the container `di` checks the routes' deps against. */
export function serve(ship: Nexus): void {
  served = ship;
}

/** The mission of a request that carries no scope on the router context. */
const MISSION = { id: 'survey-7', target: 'Kepler-442b' } as const;

export const di = nexus(
  async () => {
    if (served === undefined) {
      throw new Error('a route ran before the fixture served its container');
    }
    return served;
  },
  { request: () => ({ mission: MISSION }) },
);
