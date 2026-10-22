/**
 * The loader every ship page shares: it reads the ship snapshot from
 * bridge-api and answers null when the call fails, so the page shows the
 * ship offline. React Router drops each route's loader from the client
 * bundle, and the `.server` suffix fails the client build if client code
 * imports this module and, through it, nexus.server.
 */
import type { ShipReading } from '@nexusdi/meridian-systems';
import type { LoaderFunctionArgs } from 'react-router';

import { BRIDGE_LINK } from '../bridge/bridge-link';
import { di } from '../nexus.server';

/** A route loader that gives the ship now, or null when the backend fails. */
export const snapshotLoader: (
  args: LoaderFunctionArgs,
) => Promise<ShipReading | null> = di.inject(
  { link: BRIDGE_LINK },
  ({ link }) => link.snapshot().catch(() => null),
);
