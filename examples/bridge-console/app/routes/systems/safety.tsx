import type {
  CompartmentId,
  DoorId,
  ShipReading,
} from '@nexusdi/meridian-systems';
import { Form } from 'react-router';

import type { CommandAnswer } from '../../bridge/bridge-link';
import { fixed, kilopascals } from '../../bridge/fixed';
import { Button, Section } from '../../components';
import { snapshotLoader } from '../snapshot-loader.server';
import type { Route } from './+types/safety';
import { COMPARTMENT_NAMES } from './compartments';
import { systemAction } from './system-action.server';
import { ControlSection, Gauges, SystemPage } from './system-page';

/** The two sides of a door: a compartment, or `space` outside the hull. */
type Side = CompartmentId | 'space';

/**
 * The sides of each door, in the order the deck lists them. The console
 * imports only types from the simulation, so the table sits here, and
 * `satisfies` checks that it names every door of the ship and no other.
 */
const DOORS = {
  'bridge-habitat': ['bridge', 'habitat'],
  'habitat-reactor-bay': ['habitat', 'reactor-bay'],
  'habitat-airlock': ['habitat', 'airlock'],
  'airlock-outer': ['airlock', 'space'],
} as const satisfies Record<DoorId, readonly [Side, Side]>;

const DOOR_IDS = Object.keys(DOORS) as readonly DoorId[];

const sideName = (side: Side) =>
  side === 'space' ? 'Space' : COMPARTMENT_NAMES[side];

/** The pressure of `side` in Pa, with 0 Pa for space. */
const sidePressure = (ship: ShipReading, side: Side) =>
  side === 'space' ? 0 : ship.compartments[side].pressure;

/** Sends the submitted form to bridge-api as a safety command. */
export const action: (args: Route.ActionArgs) => Promise<CommandAnswer> =
  systemAction('safety', { door: 'text', compartment: 'text' });

/**
 * The ship snapshot, which holds the alarms, the fires, the floods and the
 * doors. It is null when the call fails, and the page shows it offline.
 */
export const loader: (args: Route.LoaderArgs) => Promise<ShipReading | null> =
  snapshotLoader;

/** One door: whether it stands open and the pressure on each side. */
function Door({ id, ship }: { id: DoorId; ship: ShipReading }) {
  const sides = DOORS[id];
  const open = ship.setpoints.safety.doors[id];
  return (
    <div>
      <h3 className="font-semibold mb-2 dark:text-white">{id}</h3>
      <Gauges
        label={`${id} door`}
        gauges={[
          ['Door', open ? 'Open' : 'Shut'],
          ...sides.map(
            (side) =>
              [
                `${sideName(side)} side`,
                kilopascals(sidePressure(ship, side), 1),
              ] as const,
          ),
        ]}
      />
    </div>
  );
}

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
        {alarms.length === 0 ? (
          <p>No alarms</p>
        ) : (
          <ul aria-label="Alarms">
            {alarms.map(({ code, subject }) => (
              <li key={`${code} ${subject}`}>{`${code} in ${subject}`}</li>
            ))}
          </ul>
        )}
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

/**
 * A form of a select named `id` that lists `options`, with one button for
 * each of two commands. The first command is the primary button.
 */
function CommandSelect({
  id,
  label,
  options,
  commands,
}: {
  id: string;
  label: string;
  options: readonly string[];
  commands: readonly [
    readonly [value: string, text: string],
    readonly [value: string, text: string],
  ];
}) {
  const [[first, firstText], [second, secondText]] = commands;
  return (
    <Form method="post" className="flex gap-2 items-center">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={id} defaultValue={options[0]}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <Button type="submit" name="command" value={first}>
        {firstText}
      </Button>
      <Button type="submit" name="command" value={second} variant="outline">
        {secondText}
      </Button>
    </Form>
  );
}

export default function Safety({
  loaderData: ship,
  actionData,
}: Route.ComponentProps) {
  return (
    <SystemPage answer={actionData}>
      {ship === null ? (
        <Section>
          <p>Ship snapshot offline</p>
        </Section>
      ) : (
        <SafetyGauges ship={ship} />
      )}
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
