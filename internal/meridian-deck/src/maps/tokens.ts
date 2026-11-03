import { Token } from '@nexusdi/core';
import type { MapDefinition } from '@nexusdi/meridian-systems/maps';

import type { DeckMapsOptions, IScene, ISceneRunner } from './contracts.js';

/** The value `DeckMaps.forRoot()` takes. */
export const DECK_MAPS_OPTIONS = new Token<DeckMapsOptions>('DeckMapsOptions');

/** The map the scope's request names. Scoped. */
export const MAP = new Token<MapDefinition>('Map');

/** The scope's map with its triggers and cues. Scoped. */
export const SCENE = new Token<IScene>('Scene');

/** Where scene hooks attach. Singleton. */
export const SCENE_RUNNER = new Token<ISceneRunner>('SceneRunner');
