import type { ShipReading } from '@nexusdi/meridian-systems';

import type { CommandAnswer } from '../../di/contracts';
import { bearing, fixed, megawatts, turnRate } from '../../fixed';
import { snapshotLoader } from '../snapshot-loader.server';
import { useShipReading } from '../../hooks/use-ship-reading';
import type { Route } from './+types/helm';
import { allocated } from './allocated';
import { systemAction } from './system-action.server';
import {
  ControlSection,
  Gauges,
  LevelForm,
  SnapshotOffline,
  SystemPage,
} from './system-page';
import { StarSelect } from './star-select';

/** Sends the submitted form to bridge-api as a helm command. */
export const action: (args: Route.ActionArgs) => Promise<CommandAnswer> =
  systemAction('helm', { to: 'text', level: 'number' });

/**
 * The ship snapshot, which holds the helm's and the drive's records and
 * their loads. It is null when the call fails, and the page shows it
 * offline.
 */
export const loader: (args: Route.LoaderArgs) => Promise<ShipReading | null> =
  snapshotLoader;

/**
 * The heading and the course in degrees, the turn rate in °/s, the thrusters'
 * torque and their power.
 */
function HelmGauges({ ship }: { ship: ShipReading }) {
  const { attitude, rate, torque } = ship.helm;
  return (
    <ControlSection title="Helm">
      <Gauges
        label="Helm gauges"
        gauges={[
          ['Heading', bearing(attitude)],
          ['Course', bearing(ship.setpoints.helm.heading)],
          ['Turn rate', turnRate(rate)],
          ['Thruster torque', `${fixed(torque, 0)} N·m`],
          ['Thruster power', megawatts(allocated(ship, 'thrusters'))],
        ]}
      />
    </ControlSection>
  );
}

/**
 * The main drive's burn level, power, thrust and propellant flow, and the
 * ship's acceleration, velocity and distance along the track.
 */
function DriveGauges({ ship }: { ship: ShipReading }) {
  const { thrust, massFlow, acceleration, velocity, distance } = ship.drive;
  return (
    <ControlSection title="Main drive">
      <Gauges
        label="Main drive gauges"
        gauges={[
          ['Burn level', fixed(ship.setpoints.drive.throttle, 2)],
          ['Drive power', megawatts(allocated(ship, 'main-drive'))],
          ['Thrust', `${fixed(thrust, 0)} N`],
          ['Propellant flow', `${fixed(massFlow, 3)} kg/s`],
          ['Acceleration', `${fixed(acceleration, 4)} m/s²`],
          ['Velocity', `${fixed(velocity, 2)} m/s`],
          ['Distance', `${fixed(distance, 0)} m`],
        ]}
      />
    </ControlSection>
  );
}

export default function Helm({ loaderData, actionData }: Route.ComponentProps) {
  const ship = useShipReading(loaderData);
  return (
    <SystemPage answer={actionData} ship={ship}>
      {ship === null ? (
        <SnapshotOffline />
      ) : (
        <>
          <HelmGauges ship={ship} />
          <DriveGauges ship={ship} />
        </>
      )}
      <ControlSection title="Course">
        <StarSelect command="course" button="Plot course" />
      </ControlSection>
      <ControlSection title="Burn">
        <LevelForm
          command="burn"
          label="Burn level"
          button="Burn"
          defaultValue={loaderData?.setpoints.drive.throttle ?? 1}
        />
      </ControlSection>
    </SystemPage>
  );
}

/** The page's error boundary: an action that throws leaves the nav and shows the snapshot offline. */
export { SystemErrorBoundary as ErrorBoundary } from './system-page';
