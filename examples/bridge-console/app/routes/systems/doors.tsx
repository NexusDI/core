import type {
  CompartmentId,
  DoorId,
  ShipReading,
} from '@nexusdi/meridian-systems';

import { kilopascals } from '../../fixed';
import { COMPARTMENT_NAMES } from './compartments';
import { Gauges } from './system-page';

/** The two sides of a door: a compartment, or `space` outside the hull. */
type Side = CompartmentId | 'space';

/**
 * The sides of each door, in the order the deck lists them. The console
 * imports only types from the simulation, so the table sits here, and
 * `satisfies` checks that it names every door of the ship and no other.
 */
const DOORS = {
  'bridge-habitat': ['bridge', 'habitat'],
  'habitat-airlock': ['habitat', 'airlock'],
  'airlock-outer': ['airlock', 'space'],
  'bridge-chart-room': ['bridge', 'chart-room'],
  'bridge-computer-core': ['bridge', 'computer-core'],
  'habitat-quarters': ['habitat', 'quarters'],
  'habitat-comms-relay': ['habitat', 'comms-relay'],
  'airlock-shuttle-bay': ['airlock', 'shuttle-bay'],
  'shuttle-bay-outer': ['shuttle-bay', 'space'],
  'shuttle-bay-drone-bay': ['shuttle-bay', 'drone-bay'],
  'drone-bay-outer': ['drone-bay', 'space'],
  'habitat-engineering': ['habitat', 'engineering'],
  'engineering-capacitor-room': ['engineering', 'capacitor-room'],
  'engineering-ftl-core': ['engineering', 'ftl-core'],
  'engineering-reactor-bay': ['engineering', 'reactor-bay'],
  'reactor-bay-main-drive': ['reactor-bay', 'main-drive'],
} as const satisfies Record<DoorId, readonly [Side, Side]>;

export const DOOR_IDS = Object.keys(DOORS) as readonly DoorId[];

/** The doors with `room` on one side, in the order the deck lists them. */
export const doorsOf = (room: CompartmentId): readonly DoorId[] =>
  DOOR_IDS.filter((id) => DOORS[id].some((side) => side === room));

const sideName = (side: Side) =>
  side === 'space' ? 'Space' : COMPARTMENT_NAMES[side];

/** The pressure of `side` in Pa, with 0 Pa for space. */
const sidePressure = (ship: ShipReading, side: Side) =>
  side === 'space' ? 0 : ship.compartments[side].pressure;

/** One door: whether it stands open and the pressure on each side. */
export function Door({ id, ship }: { id: DoorId; ship: ShipReading }) {
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
