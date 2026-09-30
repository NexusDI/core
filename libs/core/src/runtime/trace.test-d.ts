import { describe, expectTypeOf, it } from 'vitest';

import '../../test-support/third-party-trace.js';
import type { Lifetime, PluginContext, TraceEvent } from '../index.js';

// TraceEvent as core declared it before TraceEventByType existed.
type CoreTraceEvent =
  | {
      type: 'compile';
      phase: 'create' | 'load' | 'check';
      modules: number;
      providers: number;
      errors: number;
      durationMs: number;
    }
  | {
      type: 'construct';
      token: string;
      providerId: string;
      module: string;
      lifetime: Lifetime | null;
      scope: string | null;
      async: boolean;
      durationMs: number;
    }
  | {
      type: 'untracked';
      token: string;
      providerId: string;
      reason: 'root-transient' | 'singleton-thunk';
    }
  | { type: 'init'; token: string; providerId: string; durationMs: number }
  | { type: 'scope:create'; scope: string; built: number; durationMs: number }
  | {
      type: 'scope:extend';
      scope: string;
      modules: string[];
      built: number;
      durationMs: number;
    }
  | {
      type: 'scope:dispose';
      scope: string;
      disposed: number;
      errors: number;
      durationMs: number;
    }
  | {
      type: 'dispose:instance';
      token: string;
      providerId: string;
      scope: string | null;
    }
  | { type: 'dispose'; disposed: number; errors: number; durationMs: number };

type AcmeMiss = {
  type: '@acme/cache/miss';
  key: string;
  durationMs: number;
};

describe('TraceEvent', () => {
  it('includes an event a third party adds to TraceEventByType', () => {
    expectTypeOf<TraceEvent['type']>().toEqualTypeOf<
      CoreTraceEvent['type'] | '@acme/cache/miss'
    >();
    expectTypeOf<TraceEvent<'@acme/cache/miss'>>().toExtend<AcmeMiss>();
    expectTypeOf<AcmeMiss>().toExtend<TraceEvent>();
  });

  it('narrows to the compile member for TraceEvent<compile>', () => {
    expectTypeOf<TraceEvent<'compile'>['type']>().toEqualTypeOf<'compile'>();
    expectTypeOf<TraceEvent<'compile'>>().toExtend<
      Extract<CoreTraceEvent, { type: 'compile' }>
    >();
    expectTypeOf<Extract<CoreTraceEvent, { type: 'compile' }>>().toExtend<
      TraceEvent<'compile'>
    >();
  });

  it("keeps core's union with no argument", () => {
    expectTypeOf<
      Exclude<TraceEvent, { type: '@acme/cache/miss' }>
    >().toExtend<CoreTraceEvent>();
    expectTypeOf<CoreTraceEvent>().toExtend<TraceEvent>();
  });
});

describe('PluginContext.emit', () => {
  it('accepts an event keyed <package>/<event>', () => {
    expectTypeOf<PluginContext['emit']>()
      .parameter(0)
      .toEqualTypeOf<() => TraceEvent<'@acme/cache/miss'>>();
  });

  it("rejects core's own event types", () => {
    const context = {} as PluginContext;
    context.emit(() => ({
      // @ts-expect-error compile has no `/`, so a plugin cannot emit it
      type: 'compile',
      phase: 'create',
      modules: 0,
      providers: 0,
      errors: 0,
      durationMs: 0,
    }));
  });
});
