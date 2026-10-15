import { defineModule, Nexus } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { BridgeApi, OfflineTactical, tactical } from '@nexusdi/bridge-api/ship';
import { nexus } from '@nexusdi/react-router';

import { navigation } from './navigation/navigation.module';

// The charts download over the relay when RELAY_URL is set, and come from
// the bundled table otherwise. Navigation imports the same module object.
const charts = process.env.RELAY_URL
  ? tactical(process.env.RELAY_URL)
  : OfflineTactical;

export const ship = await Nexus.create(
  defineModule({ name: 'Meridian', imports: [charts, BridgeApi] }),
  { plugins: import.meta.env.DEV ? [errors()] : [] },
);
import.meta.hot?.dispose(() => ship[Symbol.asyncDispose]());

export const di = nexus(ship, {
  request: ({ request }) => ({
    mission: {
      id: request.headers.get('x-mission-id') ?? 'survey-7',
      target: 'Kepler-442b',
    },
  }),
});

/** The section of the sectors route, over the root's charts module. */
export const Navigation = navigation(charts);
