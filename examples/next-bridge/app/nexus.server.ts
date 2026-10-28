import 'server-only';

import { Nexus } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { headers } from 'next/headers';

import { gateCounters } from './gate-counter';
import { DockingGate } from './ship/docking-gate.module';

gateCounters().evaluations += 1;

let ready: Promise<Nexus> | undefined;

/**
 * The process's container, built on first use, so `next build` evaluating
 * this module builds none.
 */
function ship(): Promise<Nexus> {
  ready ??= Nexus.create(DockingGate, {
    plugins: [
      trace((event) => {
        if (event.type === 'compile' && event.phase === 'create')
          gateCounters().creates += 1;
      }),
    ],
  });
  return ready;
}

/** The request mapping the adapter will take: works in route handlers and actions. */
async function missionRequest() {
  const id = (await headers()).get('x-mission-id') ?? 'survey-7';
  return { mission: { id, target: 'Kepler-442b' } };
}

/** A scope of this layer's container for the current request, for a route handler or an action to dispose. */
export async function missionScope() {
  return (await ship()).createScope({ request: await missionRequest() });
}
