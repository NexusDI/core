import { defineModule, provide } from '@nexusdi/core';

import { DeckStateStore } from './deck-state-store.js';
import { DECK_OPTIONS, DECK_STATE } from './tokens.js';

/**
 * The deck state: one store over the app's `DECK_SOURCE` and the contributed
 * bindings. The app calls `DeckState.forRoot(options)` once and passes the
 * result to `load(DeckView, { imports: [...] })`. It exports the options too,
 * since a view that loads over this module reads them.
 */
export const DeckState = defineModule({
  name: 'DeckState',
  options: DECK_OPTIONS,
  providers: [provide(DECK_STATE, { useClass: DeckStateStore })],
  exports: [DECK_STATE, DECK_OPTIONS],
});
