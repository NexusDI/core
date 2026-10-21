import { BRIDGE_LINK } from '../bridge/bridge-link';
import { di } from '../nexus.server';
import type { Route } from './+types/telemetry';

/**
 * The headers of bridge-api's `GET /telemetry`. react-router-serve's
 * compression buffers a response it may transform, so `no-transform` keeps
 * each event moving as the backend sends it.
 */
const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache, no-transform',
} as const;

/**
 * Relays the backend's telemetry stream to the browser's EventSource. The
 * link's call carries the request's signal, so a closed EventSource ends the
 * backend's stream too. A backend that fails gives 503, and the client then
 * shows the ship offline.
 */
export const loader: (args: Route.LoaderArgs) => Promise<Response> = di.inject(
  { link: BRIDGE_LINK },
  async ({ link }) => {
    try {
      return new Response(await link.telemetry(), { headers: SSE_HEADERS });
    } catch {
      return new Response('Telemetry offline', { status: 503 });
    }
  },
);
