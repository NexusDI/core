import { defineModule, Nexus } from '@nexusdi/core';
import type { Scope } from '@nexusdi/core';
import type { MapDefinition } from '@nexusdi/meridian-systems/maps';

import type { IDeckSource } from '../state/contracts.js';
import { DeckState } from '../state/deck-state.module.js';
import { DECK_STATE } from '../state/tokens.js';
import { FakeSource, OPTIONS, globalSource } from '../test-support.js';

import type { DeckMapsOptions } from './contracts.js';
import { DeckMaps } from './deck-maps.module.js';
import { SCENE_RUNNER } from './tokens.js';

/** A map with nothing in it, which a test spreads its own fields over. */
export function mapOf(fields: Partial<MapDefinition> = {}): MapDefinition {
  return {
    id: 'test-map',
    version: 1,
    title: 'Test map',
    surface: 'demo',
    decks: ['main'],
    camera: { deck: 'main', focus: 'bridge', zoom: 'section' },
    scene: null,
    ...fields,
  };
}

/** The app: a source, the deck state and the map runtime loaded over it. */
export async function app<Source extends IDeckSource = FakeSource>(
  options: DeckMapsOptions,
  source: Source = new FakeSource() as unknown as Source,
) {
  const BayDeckState = DeckState.forRoot(OPTIONS);
  const BayDeckMaps = DeckMaps.forRoot(options);
  const nexus = await Nexus.create(
    defineModule({
      name: 'Root',
      imports: [globalSource('BayDeckSource', source), BayDeckState],
    }),
  );
  await nexus.load(BayDeckMaps, { imports: [BayDeckState] });
  return {
    nexus,
    source,
    state: nexus.get(DECK_STATE),
    open: (map: string): Promise<Scope> =>
      nexus.createScope({ request: { map } }),
    BayDeckState,
    BayDeckMaps,
    runner: nexus.get(SCENE_RUNNER),
  };
}
