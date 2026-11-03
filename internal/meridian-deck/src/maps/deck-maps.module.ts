import { defineModule, provide, REQUEST } from '@nexusdi/core';

import { DECK_SOURCE, DECK_STATE } from '../state/tokens.js';

import { mapOfRequest } from './map-of-request.js';
import { MapScene } from './map-scene.js';
import { SceneRunner } from './scene-runner.js';
import { DECK_MAPS_OPTIONS, MAP, SCENE, SCENE_RUNNER } from './tokens.js';

/**
 * The map runtime. Like `DeckView` it declares no import: the app loads it
 * with `load(DeckMaps.forRoot(...), { imports: [BayDeckState] })`, so
 * `DECK_STATE` comes in through the load import and `DECK_SOURCE` through the
 * app's global module. A scope opened with `createScope({ request: { map } })`
 * after the load reads `MAP` and `SCENE`. `SCENE` is a scoped factory, which
 * core builds when the scope opens, so opening the scope applies the map's
 * starting state and fires its `enter` triggers. Every scope of a container
 * that loads this module must name a map.
 */
export const DeckMaps = defineModule({
  name: 'DeckMaps',
  options: DECK_MAPS_OPTIONS,
  providers: [
    provide(MAP, {
      useFactory: mapOfRequest,
      deps: [REQUEST, DECK_MAPS_OPTIONS],
      lifetime: 'scoped',
    }),
    provide(SCENE, {
      useFactory: (map, state, source, runner, options) =>
        new MapScene(map, state, source, runner, options),
      deps: [MAP, DECK_STATE, DECK_SOURCE, SCENE_RUNNER, DECK_MAPS_OPTIONS],
      lifetime: 'scoped',
    }),
    provide(SCENE_RUNNER, { useClass: SceneRunner }),
  ],
  exports: [MAP, SCENE, SCENE_RUNNER],
});
