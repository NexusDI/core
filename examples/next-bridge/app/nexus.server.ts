import 'server-only';

import { Nexus } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { headers } from 'next/headers';

import { gateCounters } from './gate-counter';
import { GateBridge } from './ship/gate.module';

gateCounters().evaluations += 1;

let ready: Promise<Nexus> | undefined;

/**
 * The process's container, built on first use, so `next build` evaluating
 * this module builds none.
 */
export function ship(): Promise<Nexus> {
  ready ??= Nexus.create(GateBridge, {
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
export async function missionRequest() {
  const id = (await headers()).get('x-mission-id') ?? 'survey-7';
  return { mission: { id, target: 'Kepler-442b' } };
}
