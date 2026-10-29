import deck from '../deck/meridian.deck.json';
import type { DeckPlan, SystemRecord } from '../src/simulation/contracts';
import { ShipStateStore } from '../src/simulation/ship-state-store';
import { COMMS_RECORD } from '../src/systems/comms/comms-record';
import { ENGINEERING_RECORD } from '../src/systems/engineering/engineering-record';
import { HELM_RECORD } from '../src/systems/helm/helm-record';
import { lifeSupportRecord } from '../src/systems/life-support/life-support-record';
import { PROPULSION_RECORD } from '../src/systems/propulsion/propulsion-record';
import { safetyRecord } from '../src/systems/safety/safety-record';
import { WEAPONS_RECORD } from '../src/systems/weapons/weapons-record';

/** The ship's deck plan. */
const SHIP_DECK = deck satisfies DeckPlan;

/**
 * The record of every system the ship has at startup over `plan`, as
 * `all(SHIP_RECORDS)` collects them from `MeridianSystems`. A unit test
 * builds a store with them and no container, and `test/simulation.test.ts`
 * checks the list against the container's.
 */
export function shipRecords(plan: DeckPlan = SHIP_DECK): SystemRecord[] {
  return [
    ENGINEERING_RECORD,
    lifeSupportRecord(plan),
    safetyRecord(plan),
    COMMS_RECORD,
    PROPULSION_RECORD,
    HELM_RECORD,
    WEAPONS_RECORD,
  ];
}

/** A store over `plan` with the record of every system at startup. */
export function shipState(plan: DeckPlan = SHIP_DECK): ShipStateStore {
  return new ShipStateStore(plan, shipRecords(plan));
}
