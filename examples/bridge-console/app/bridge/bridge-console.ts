import { defineModule } from '@nexusdi/core';

import { BridgeLink } from './bridge-link';
import { Tactical } from './tactical';
import { Watch } from './watch';

/**
 * The server graph. It holds no runtime code from bridge-api: the console
 * reaches the backend at BRIDGE_API_URL over HTTP only.
 */
export const BridgeConsole = defineModule({
  name: 'BridgeConsole',
  imports: [
    Tactical,
    Watch,
    BridgeLink.forRoot({
      url: process.env.BRIDGE_API_URL ?? 'http://127.0.0.1:4211/',
    }),
  ],
});
