import type { DoorId, ShipReading } from '@nexusdi/meridian-systems';

import type { CommandAnswer } from '../di/contracts';
import type { Route } from './+types/airlock';
import { snapshotLoader } from './snapshot-loader.server';
import { AirlockControls } from './systems/airlock-controls';
import { Door } from './systems/doors';
import { systemAction } from './systems/system-action.server';
import {
  CommandSelect,
  ControlSection,
  Gauges,
  SnapshotOffline,
  SystemPage,
} from './systems/system-page';

/** The two doors that bound the airlock, in the order the deck lists them. */
const AIRLOCK_DOORS: readonly DoorId[] = ['habitat-airlock', 'airlock-outer'];

/**
 * The system each airlock command belongs to: the pump and the vent are life
 * support's, and the doors are safety's. The panel posts to both through one
 * action.
 */
const AIRLOCK_SYSTEMS = {
  pump: 'life-support',
  vent: 'life-support',
  open: 'safety',
  close: 'safety',
} as const satisfies Readonly<Record<string, string>>;

/** Sends the submitted form to bridge-api as a life-support or safety command. */
export const action: (args: Route.ActionArgs) => Promise<CommandAnswer> =
  systemAction(AIRLOCK_SYSTEMS, {
    compartment: 'text',
    mode: 'text',
    open: 'boolean',
    door: 'text',
  });

/**
 * The ship snapshot, which holds the pump mode, the vent, the doors and the
 * pressure on each side. It is null when the call fails, and the page shows
 * it offline.
 */
export const loader: (args: Route.LoaderArgs) => Promise<ShipReading | null> =
  snapshotLoader;

/** The airlock's pump and vent, then its two doors, read from `ship`. */
function AirlockGauges({ ship }: { ship: ShipReading }) {
  const { pumps, vents } = ship.setpoints.lifeSupport;
  return (
    <>
      <ControlSection title="Airlock">
        <Gauges
          label="Airlock pump and vent"
          gauges={[
            ['Pump', pumps.airlock ?? 'off'],
            ['Vent', vents.airlock === true ? 'Open' : 'Shut'],
          ]}
        />
      </ControlSection>
      <ControlSection title="Doors">
        {AIRLOCK_DOORS.map((id) => (
          <Door key={id} id={id} ship={ship} />
        ))}
      </ControlSection>
    </>
  );
}

export default function Airlock({
  loaderData: ship,
  actionData,
}: Route.ComponentProps) {
  return (
    <SystemPage answer={actionData}>
      {ship === null ? <SnapshotOffline /> : <AirlockGauges ship={ship} />}
      <ControlSection title="Pump and vent">
        <AirlockControls />
      </ControlSection>
      <ControlSection title="Door control">
        <CommandSelect
          id="door"
          label="Door"
          options={AIRLOCK_DOORS}
          commands={[
            ['open', 'Open door'],
            ['close', 'Close door'],
          ]}
        />
      </ControlSection>
    </SystemPage>
  );
}
