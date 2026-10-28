/**
 * The loader of the life-support page. React Router drops each route's loader
 * from the client bundle, and the `.server` suffix fails the client build if
 * client code imports this module and, through it, nexus.server.
 */
import type {
  AtmosphereReading,
  CompartmentId,
  ShipReading,
} from '@nexusdi/meridian-systems';
import type { LoaderFunctionArgs } from 'react-router';

import { BRIDGE_LINK } from '../../di/contracts';
import { di } from '../../nexus.server';
import { COMPARTMENTS } from './compartments';

/**
 * What the page reads: the ship snapshot and each compartment's analyzer
 * reading, each null when its call fails.
 */
export interface LifeSupportReading {
  readonly ship: ShipReading | null;
  readonly air: Readonly<
    Record<CompartmentId, AtmosphereReading<CompartmentId> | null>
  >;
}

/**
 * The snapshot and the four analyzer reads, all in flight at once. A call
 * that fails leaves its part null, and the page shows that part offline.
 */
export const lifeSupportLoader: (
  args: LoaderFunctionArgs,
) => Promise<LifeSupportReading> = di.inject(
  { link: BRIDGE_LINK },
  async ({ link }) => {
    const ship = link.snapshot().catch(() => null);
    const reads = Promise.all(
      COMPARTMENTS.map(
        async ([id]) =>
          [id, await link.atmosphere(id).catch(() => null)] as const,
      ),
    );
    return {
      ship: await ship,
      air: Object.fromEntries(await reads) as LifeSupportReading['air'],
    };
  },
);
