import { MultiToken, Token } from '@nexusdi/core';

import type {
  DeckOptions,
  IDeckBinding,
  IDeckSource,
  IDeckState,
} from './contracts.js';

/** The value `DeckState.forRoot()` takes. `DeckState` exports it, so a view that loads over it reads it. */
export const DECK_OPTIONS = new Token<DeckOptions>('DeckOptions');

/**
 * The surface's source. A plain token: `forRoot()` carries the options alone,
 * so the app binds this in its own global module, which exports it.
 */
export const DECK_SOURCE = new Token<IDeckSource>('DeckSource');

/** The store of room and fixture states. */
export const DECK_STATE = new Token<IDeckState>('DeckState');

/** One class per ship system; empty until a binding module contributes. */
export const DECK_BINDINGS = new MultiToken<IDeckBinding>('DeckBindings');
