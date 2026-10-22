import type { ShipReading } from '@nexusdi/meridian-systems';
import { Outlet } from 'react-router';

import { StatusStrip } from '../components/StatusStrip';
import type { Route } from './+types/ship-layout';
import { snapshotLoader } from './snapshot-loader.server';

/**
 * The ship now, or null when the backend fails, so the strip shows it offline.
 */
export const loader: (args: Route.LoaderArgs) => Promise<ShipReading | null> =
  snapshotLoader;

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
