import {
  COMPARTMENT_IDS,
  type CompartmentId,
  type DeckPlan,
  type SystemRecord,
} from '../../simulation/contracts';

import type { HeaterSetpoint, PumpMode } from './contracts';

/**
 * Life support at tick 0, offline, with one setpoint for each device a room
 * of `deck` lists: heaters on at the deck's initial temperature, scrubbers
 * and oxygen generators on, vents shut and pumps off. Each heater starts at
 * 0 W.
 */
export function lifeSupportRecord(deck: DeckPlan) {
  const heaters: Partial<Record<CompartmentId, HeaterSetpoint>> = {};
  const scrubbers: Partial<Record<CompartmentId, boolean>> = {};
  const oxygen: Partial<Record<CompartmentId, boolean>> = {};
  const vents: Partial<Record<CompartmentId, boolean>> = {};
  const pumps: Partial<Record<CompartmentId, PumpMode>> = {};
  const power: Partial<Record<CompartmentId, number>> = {};
  for (const id of COMPARTMENT_IDS) {
    const room = deck.compartments.find((plan) => plan.id === id);
    const equipment = room?.equipment ?? [];
    if (equipment.includes('heater')) {
      heaters[id] = { on: true, target: deck.initial.temperature };
      power[id] = 0;
    }
    if (equipment.includes('scrubber')) scrubbers[id] = true;
    if (equipment.includes('oxygen')) oxygen[id] = true;
    if (equipment.includes('vent')) vents[id] = false;
    if (equipment.includes('pump')) pumps[id] = 'off';
  }
  return {
    records: { lifeSupport: { heaters: power } },
    setpoints: {
      lifeSupport: { online: false, heaters, scrubbers, oxygen, vents, pumps },
    },
  } satisfies SystemRecord;
}
