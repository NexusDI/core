import {
  COMPARTMENT_IDS,
  type CompartmentId,
  type DeckPlan,
  DOOR_IDS,
  type DoorId,
  type SystemRecord,
} from '../../simulation/contracts';

/**
 * Safety at tick 0: every door of `deck` shut, and the flood valve and the
 * drill flag of each room with a flood charge off, and the acknowledge flag off. No room burns and no
 * alarm is active; each charged room's flood count starts at 0.
 */
export function safetyRecord(deck: DeckPlan) {
  const doors = {} as Record<DoorId, boolean>;
  for (const id of DOOR_IDS) doors[id] = false;
  const floods: Partial<Record<CompartmentId, boolean>> = {};
  const drills: Partial<Record<CompartmentId, boolean>> = {};
  const fires = {} as Record<CompartmentId, number>;
  const flooded: Partial<Record<CompartmentId, number>> = {};
  for (const id of COMPARTMENT_IDS) {
    fires[id] = 0;
    const room = deck.compartments.find((plan) => plan.id === id);
    if (room?.floodCharge === undefined) continue;
    floods[id] = false;
    drills[id] = false;
    flooded[id] = 0;
  }
  return {
    records: { safety: { fires, flooded, alarms: [] } },
    setpoints: { safety: { doors, floods, drills, acknowledge: false } },
  } satisfies SystemRecord;
}
