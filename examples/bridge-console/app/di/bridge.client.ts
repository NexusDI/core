import { defineModule, type NexusPlugin } from '@nexusdi/core';
import { react } from '@nexusdi/react';

import { Tactical } from './tactical.module';
import { TelemetryClient } from './telemetry-client.module';

/**
 * The client graph: NAV_CHARTS over the bundled table and TELEMETRY_CLIENT,
 * both singletons, so components read them outside a ScopeProvider.
 */
export const BridgeClient = defineModule({
  name: 'BridgeClient',
  imports: [Tactical, TelemetryClient],
});

/**
 * The plugins of the client container. react() rejects a transient token read
 * in render; it runs in development only, and the build drops it.
 */
export const bridgeClientPlugins: readonly NexusPlugin[] = import.meta.env.DEV
  ? [react()]
  : [];
