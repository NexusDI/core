import { defineModule, provide } from '@nexusdi/core';

import { BaseLayer } from './base-layer.js';
import { LayerCompositor } from './compositor.js';
import { DeckViewController } from './deck-view.js';
import { LightLayer } from './light-layer.js';
import { createPixiHost } from './pixi-host.js';
import { DECK_COMPOSITOR, DECK_LAYERS, DECK_VIEW, PIXI_APP } from './tokens.js';

/**
 * The lit view of the unlit cutaway. It declares no import: the app loads it
 * with `load(DeckView, { imports: [DeckState.forRoot(...)] })`, so the state
 * module and its options come in through the load imports, and the app's
 * global module supplies `DECK_SOURCE`. Only `DECK_VIEW` leaves the module;
 * the renderer, the layers and the compositor stay private.
 */
export const DeckView = defineModule({
  name: 'DeckView',
  providers: [
    provide(PIXI_APP, { useFactory: createPixiHost }),
    provide(DECK_LAYERS, { useClass: BaseLayer }),
    provide(DECK_LAYERS, { useClass: LightLayer }),
    provide(DECK_COMPOSITOR, { useClass: LayerCompositor }),
    provide(DECK_VIEW, { useClass: DeckViewController }),
  ],
  exports: [DECK_VIEW],
});
