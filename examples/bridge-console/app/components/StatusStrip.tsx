import type { ShipReading } from '@nexusdi/meridian-systems';

import { fixed } from '../fixed';

/**
 * The ship's tick, ship time and habitat air, from the `ship` reading the
 * layout passes. `null` shows the ship offline. The
 * temperature shows in whole kelvin and the pressure to 0.1 kPa, through
 * `fixed`, so the text keeps one precision as the air changes.
 */
export function StatusStrip({ ship }: { ship: ShipReading | null }) {
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
            {`${fixed(ship.compartments.habitat.temperature, 0)} K`}
          </Reading>
          <Reading term="Habitat pressure">
            {`${fixed(ship.compartments.habitat.pressure / 1000, 1)} kPa`}
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
