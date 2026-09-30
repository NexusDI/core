import type { PluginContext } from '../src/index.js';

// A third-party package's trace event, declared the way such a package
// declares one: its type keyed `<package>/<event>` and added to
// TraceEventByType by augmentation. trace.test-d.ts checks that the event
// joins TraceEvent. Every test file in core's spec program sees the key.
declare module '../src/index.js' {
  interface TraceEventByType {
    '@acme/cache/miss': { key: string; durationMs: number };
  }
}

/** Publishes a cache miss the way the third party's plugin would. */
export function reportMiss(context: PluginContext, key: string): void {
  context.emit(() => ({ type: '@acme/cache/miss', key, durationMs: 0 }));
}
