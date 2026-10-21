import type { Nexus } from '@nexusdi/core';
import { nexus } from '@nexusdi/react-router';
import { createTestingContainer } from '@nexusdi/testing';

import { BRIDGE_LINK } from '../../app/bridge/bridge-link';
import { BridgeConsole } from '../../app/bridge/bridge-console';
import { NAV_CHARTS, WATCH_LOG } from '../../app/bridge/contracts';
import { fakeBridgeLink } from '../doubles';

/** The mission of a request with no scope on the router context. */
const request = () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } });

/** Containers the mocked nexus.server built, disposed after the file's tests. */
export const built: Nexus[] = [];

/** Charts that plot every course at heading 42. */
export const fakeCharts = { plot: (to: string) => ({ to, heading: 42 }) };

/** A watch log that records without the mission prefix. */
class MemoryWatchLog {
  readonly #entries: string[] = [];
  record(entry: string) {
    this.#entries.push(entry);
  }
  entries() {
    return this.#entries;
  }
}

/**
 * What the home route's mocked nexus.server exports: a BridgeConsole
 * testing container with fake charts, a watch log and the bridge link
 * double. The route's loader resolves through the request scope a test
 * puts on the router context, so this container serves inject's checks.
 */
export async function homeServer() {
  const ship = await createTestingContainer(BridgeConsole)
    .override(NAV_CHARTS, { useValue: fakeCharts })
    .override(WATCH_LOG, { useClass: MemoryWatchLog })
    .override(BRIDGE_LINK, fakeBridgeLink)
    .create({ onInit: false });
  built.push(ship);
  return { di: nexus(ship, { request }), ship };
}

/**
 * What the sectors route's mocked nexus.server exports: the BridgeConsole
 * graph, whose Tactical the Navigation section imports.
 */
export async function sectorsServer() {
  const ship = await createTestingContainer(BridgeConsole)
    .override(BRIDGE_LINK, fakeBridgeLink)
    .create();
  built.push(ship);
  return { di: nexus(ship, { request }), ship };
}
