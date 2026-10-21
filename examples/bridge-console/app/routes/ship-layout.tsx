import type { ShipReading } from '@nexusdi/meridian-systems';
import { Outlet } from 'react-router';

import { BRIDGE_LINK } from '../bridge/bridge-link';
import { StatusStrip } from '../components/StatusStrip';
import { di } from '../nexus.server';
import type { Route } from './+types/ship-layout';

/**
 * The ship now, or null when the backend fails, so the strip shows it offline.
 */
export const loader: (args: Route.LoaderArgs) => Promise<ShipReading | null> =
  di.inject({ link: BRIDGE_LINK }, ({ link }) =>
    link.snapshot().catch(() => null),
  );

/**
 * The strip follows the telemetry stream after the first load, so a navigation
 * never reloads the snapshot.
 */
export const shouldRevalidate = () => false;

/** The pages about the running ship, under its status strip. */
export default function ShipLayout({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <StatusStrip ship={loaderData} />
      <Outlet />
    </>
  );
}
