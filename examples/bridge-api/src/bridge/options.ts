import type { Scope } from '@nexusdi/core';
import type { NexusGraph } from '@nexusdi/devtools';
import type { NexusLog } from '@nexusdi/hono';

/** The options every framework entry's `createBridge` takes. */
export interface BridgeOptions {
  scopes?: {
    run<R>(scope: Scope, fn: () => R): R;
    current?(): Scope | undefined;
  };
  /** Receives each error the adapter maps to a 500 or 503, such as a `NEXUS_` error. */
  log?: NexusLog;
  /** Draws the graph `GET /graph` answers. Without it, the route answers 404. */
  graph?: () => NexusGraph;
  /** Ends every open `GET /telemetry` stream with `ship offline` when it aborts. */
  shutdown?: AbortSignal;
  /**
   * The browser origins the bridge answers with CORS headers, such as the
   * federation shell's. Without one, the bridge sends no CORS header.
   */
  origins?: readonly string[];
}
