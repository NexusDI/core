import { useEffect, useState } from 'react';
import { useService } from '@nexusdi/react';
import type { ShipSnapshot } from '@nexusdi/meridian-systems';

import { habitatPressure } from '../bridge/habitat';
import { TELEMETRY_CLIENT } from '../bridge/telemetry-client';

/**
 * The ship's tick, ship time and habitat air. It starts from the loader's
 * snapshot, so the server and the first browser render agree, then follows
 * the telemetry stream after hydration. `null` shows the ship offline.
 */
export function StatusStrip({ ship: first }: { ship: ShipSnapshot | null }) {
  const telemetry = useService(TELEMETRY_CLIENT);
  const [ship, setShip] = useState(first);
  useEffect(
    () => telemetry.subscribe(setShip, () => setShip(null)),
    [telemetry],
  );
  return (
    <section
      role="status"
      aria-label="Ship status"
      className="mb-6 rounded-lg border border-gray-200 p-3 dark:border-gray-700 dark:text-white"
    >
      {ship === null ? (
        <p>Telemetry offline</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <Reading term="Tick">{ship.tick}</Reading>
          <Reading term="Ship time">{`${ship.time} s`}</Reading>
          <Reading term="Habitat temperature">
            {`${ship.compartments.habitat.temperature} K`}
          </Reading>
          <Reading term="Habitat pressure">
            {`${(habitatPressure(ship) / 1000).toPrecision(4)} kPa`}
          </Reading>
        </dl>
      )}
    </section>
  );
}

function Reading({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm text-gray-600 dark:text-gray-400">{term}</dt>
      <dd className="font-mono">{children}</dd>
    </div>
  );
}
