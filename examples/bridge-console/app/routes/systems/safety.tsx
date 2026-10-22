import type { CompartmentId, ShipReading } from '@nexusdi/meridian-systems';

import type { CommandAnswer } from '../../bridge/bridge-link';
import { fixed } from '../../bridge/fixed';
import { snapshotLoader } from '../snapshot-loader.server';
import type { Route } from './+types/safety';
import { COMPARTMENT_NAMES } from './compartments';
import { Door, DOOR_IDS } from './doors';
import { systemAction } from './system-action.server';
import {
  CommandSelect,
  ControlSection,
  Gauges,
  ItemList,
  SnapshotOffline,
  SystemPage,
} from './system-page';

/** Sends the submitted form to bridge-api as a safety command. */
export const action: (args: Route.ActionArgs) => Promise<CommandAnswer> =
  systemAction('safety', { door: 'text', compartment: 'text' });

/**
 * The ship snapshot, which holds the alarms, the fires, the floods and the
 * doors. It is null when the call fails, and the page shows it offline.
 */
export const loader: (args: Route.LoaderArgs) => Promise<ShipReading | null> =
  snapshotLoader;

/**
 * The fire in one room with a flood charge, and the flood and the
 * temperature that act on it.
 */
function ChargedRoom({
  id,
  released,
  ship,
}: {
  id: CompartmentId;
  released: number;
  ship: ShipReading;
}) {
  const name = COMPARTMENT_NAMES[id];
  const fire = ship.safety.fires[id];
  return (
    <div>
      <h3 className="font-semibold mb-2 dark:text-white">{name}</h3>
      <Gauges
        label={`${name} fire suppression`}
        gauges={[
          ['Fire intensity', fire === 0 ? 'none' : fixed(fire, 2)],
          ['Flood released', `${fixed(released, 0)} mol`],
          ['Temperature', `${fixed(ship.compartments[id].temperature, 0)} K`],
        ]}
      />
    </div>
  );
}

/** Every safety gauge section of `ship`, the alarm list first. */
function SafetyGauges({ ship }: { ship: ShipReading }) {
  const { alarms, flooded } = ship.safety;
  const charged = Object.entries(flooded) as [CompartmentId, number][];
  return (
    <>
      <ControlSection title="Alarms">
        <ItemList
          label="Alarms"
          none="No alarms"
          items={alarms.map(({ code, subject }) => `${code} in ${subject}`)}
        />
      </ControlSection>
      <ControlSection title="Doors">
        {DOOR_IDS.map((id) => (
          <Door key={id} id={id} ship={ship} />
        ))}
      </ControlSection>
      <ControlSection title="Fire suppression">
        {charged.map(([id, released]) => (
          <ChargedRoom key={id} id={id} released={released} ship={ship} />
        ))}
      </ControlSection>
    </>
  );
}

export default function Safety({
  loaderData: ship,
  actionData,
}: Route.ComponentProps) {
  return (
    <SystemPage answer={actionData}>
      {ship === null ? <SnapshotOffline /> : <SafetyGauges ship={ship} />}
      <ControlSection title="Door control">
        <CommandSelect
          id="door"
          label="Door"
          options={DOOR_IDS}
          commands={[
            ['open', 'Open door'],
            ['close', 'Close door'],
          ]}
        />
      </ControlSection>
      {ship === null ? null : (
        <ControlSection title="Room control">
          <CommandSelect
            id="compartment"
            label="Room"
            options={Object.keys(ship.safety.flooded)}
            commands={[
              ['flood', 'Flood'],
              ['drill', 'Drill'],
            ]}
          />
        </ControlSection>
      )}
    </SystemPage>
  );
}
