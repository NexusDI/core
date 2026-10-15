import type { Nexus } from '@nexusdi/core';
import { FLIGHT_LOG, NAV_CHARTS } from '@nexusdi/bridge-api/contracts';
import {
  Meridian,
  OfflineMeridian,
  OfflineTactical,
} from '@nexusdi/bridge-api/ship';
import { nexus } from '@nexusdi/react-router';
import { createTestingContainer } from '@nexusdi/testing';

import { navigation } from '../../app/navigation/navigation.module';

/** Containers the mocked nexus.server built, disposed after the file's tests. */
export const built: Nexus[] = [];

/** Charts that plot every course at heading 42. */
export const fakeCharts = { plot: (to: string) => ({ to, heading: 42 }) };

/** A flight log that records without the mission prefix. */
class MemoryFlightLog {
  readonly #entries: string[] = [];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}

/**
 * What the home route's mocked nexus.server exports: a Meridian testing
 * container with fake charts and a flight log, as integrations spec 7.2
 * shows. The route's loader resolves through the request scope a test
 * puts on the router context, so this container serves inject's checks.
 */
export async function homeServer() {
  const ship = await createTestingContainer(Meridian)
    .override(NAV_CHARTS, { useValue: fakeCharts })
    .override(FLIGHT_LOG, { useClass: MemoryFlightLog })
    .create({ onInit: false });
  built.push(ship);
  return { di: nexus(ship), ship };
}

/**
 * What the sectors route's mocked nexus.server exports: the offline graph,
 * with Navigation over the charts module that graph holds, as
 * nexus.server.ts builds it.
 */
export async function sectorsServer() {
  const ship = await createTestingContainer(OfflineMeridian).create();
  built.push(ship);
  return { di: nexus(ship), ship, Navigation: navigation(OfflineTactical) };
}
