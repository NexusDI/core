import { MultiToken, Token } from '@nexusdi/core';

import type { IDeckCompositor, IDeckLayer, IPixiHost } from './contracts.js';
import type { IDeckView } from './deck-view-contract.js';

/** The one token `DeckView` exports. */
export const DECK_VIEW = new Token<IDeckView>('DeckView');

/** Private to `DeckView`: the renderer. A get() from outside throws `NEXUS_NOT_VISIBLE`. */
export const PIXI_APP = new Token<IPixiHost>('PixiApp');

/** Private to `DeckView`: one class per layer, in draw order. */
export const DECK_LAYERS = new MultiToken<IDeckLayer>('DeckLayers');

/** Private to `DeckView`. */
export const DECK_COMPOSITOR = new Token<IDeckCompositor>('DeckCompositor');
