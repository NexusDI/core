import type { CompartmentId } from '@nexusdi/meridian-systems';

/**
 * Each compartment's name on the page. The console imports only types from
 * the simulation, so the names sit here, and `satisfies` checks that the page
 * names every compartment of the deck and no other.
 */
export const COMPARTMENT_NAMES = {
  bridge: 'Bridge',
  habitat: 'Habitat',
  'reactor-bay': 'Reactor bay',
  airlock: 'Airlock',
  'chart-room': 'Chart room',
  'computer-core': 'Computer core',
  quarters: 'Quarters',
  'comms-relay': 'Comms relay',
  'shuttle-bay': 'Shuttle bay',
  'drone-bay': 'Drone bay',
  'capacitor-room': 'Capacitor room',
  engineering: 'Engineering',
  'ftl-core': 'FTL core',
  'main-drive': 'Main drive',
} as const satisfies Record<CompartmentId, string>;

/** The compartments in the deck's order, each with its name. */
export const COMPARTMENTS = Object.entries(
  COMPARTMENT_NAMES,
) as readonly (readonly [CompartmentId, string])[];
