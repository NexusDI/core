import { di } from '../nexus.server';
import { FLIGHT_LOG } from '../ship';
import type { Route } from './+types/late';

// Holds the request until its client leaves, then lets the loader run, so
// the loader's first inject meets a closed handle.
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request }, next) => {
    if (!request.signal.aborted)
      await new Promise((resolve) =>
        request.signal.addEventListener('abort', resolve, { once: true }),
      );
    return next();
  },
];

export const loader = di.inject({ log: FLIGHT_LOG }, ({ log }) =>
  log.entries(),
);

export default function Late() {
  return null;
}
