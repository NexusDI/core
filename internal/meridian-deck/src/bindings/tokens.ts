import { Token } from '@nexusdi/core';

import type { IShipFeed } from './contracts.js';

/** The ship feed. The app binds an adapter over its own client in its global module. */
export const SHIP_FEED = new Token<IShipFeed>('ShipFeed');
