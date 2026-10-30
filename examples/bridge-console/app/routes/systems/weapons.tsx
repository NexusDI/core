import type { ShipReading } from '@nexusdi/meridian-systems';

import type { CommandAnswer } from '../../di/contracts';
import { fixed, megawatts } from '../../fixed';
import { snapshotLoader } from '../snapshot-loader.server';
import type { Route } from './+types/weapons';
import { allocated } from './allocated';
import { systemAction } from './system-action.server';
import {
  ControlSection,
  Gauges,
  NumberForm,
  LiveSystemPage,
} from './system-page';

/** Sends the submitted form to bridge-api as a weapons command. */
export const action: (args: Route.ActionArgs) => Promise<CommandAnswer> =
  systemAction('weapons', { range: 'number' });

/**
 * The ship snapshot, which holds the railgun's record and its load. It is
 * null when the call fails, and the page shows it offline.
 */
export const loader: (args: Route.LoaderArgs) => Promise<ShipReading | null> =
  snapshotLoader;

/** The range of a shot in m, with the unit. */
const metres = (range: number) => `${fixed(range, 0)} m`;

/**
 * The mount's status and arm, the capacitor's charge in MJ and its power,
 * the shot that waits, the tallies and the last shot.
 */
function WeaponsGauges({ ship }: { ship: ShipReading }) {
  const { status, charge, shots, hits, lastShot } = ship.weapons;
  const { armed, range } = ship.setpoints.weapons;
  return (
    <ControlSection title="Railgun">
      <Gauges
        label="Railgun gauges"
        gauges={[
          ['Status', status],
          ['Armed', armed ? 'Yes' : 'No'],
          ['Capacitor charge', `${fixed(charge / 1e6, 1)} MJ`],
          ['Capacitor power', megawatts(allocated(ship, 'railgun'))],
          ['Shot waiting', range === null ? 'none' : metres(range)],
          ['Shots fired', fixed(shots, 0)],
          ['Hits', fixed(hits, 0)],
          [
            'Last shot',
            lastShot === null
              ? 'none'
              : `${lastShot.hit ? 'hit' : 'miss'} at ${metres(lastShot.range)}, tick ${lastShot.tick}`,
          ],
        ]}
      />
    </ControlSection>
  );
}

export default function Weapons({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <LiveSystemPage
      snapshot={loaderData}
      answer={actionData}
      gauges={(ship) => <WeaponsGauges ship={ship} />}
    >
      <ControlSection title="Fire">
        <NumberForm
          command="fire"
          name="range"
          label="Range (m)"
          button="Fire"
          min={0}
          max={100_000}
          step={1}
          defaultValue={10_000}
        />
      </ControlSection>
    </LiveSystemPage>
  );
}

/** The page's error boundary: an action that throws leaves the nav and shows the snapshot offline. */
export { SystemErrorBoundary as ErrorBoundary } from './system-page';
