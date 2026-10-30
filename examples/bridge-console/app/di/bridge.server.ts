import { defineModule, type NexusPlugin } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';
import { react } from '@nexusdi/react';

import { BridgeLink } from './bridge-link.module';
import { Tactical } from './tactical.module';
import { TelemetryClient } from './telemetry-client.module';
import { Watch } from './watch.module';

/**
 * The server graph. It holds no runtime code from bridge-api: the console
 * reaches the backend at BRIDGE_API_URL over HTTP only.
 */
export const BridgeConsole = defineModule({
  name: 'BridgeConsole',
  imports: [
    Tactical,
    Watch,
    TelemetryClient,
    BridgeLink.forRoot({
      url: process.env.BRIDGE_API_URL ?? 'http://127.0.0.1:4211/',
    }),
  ],
});

/**
 * The plugins of the server container, in development only: errors() words
 * the fix lines and react() rejects a transient token read in render.
 */
export const bridgeServerPlugins: readonly NexusPlugin[] = import.meta.env.DEV
  ? [errors(), react()]
  : [];
