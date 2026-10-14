import { describe, expectTypeOf, it } from 'vitest';

import '../../test-support/third-party-trace.js';
import type { Lifetime, PluginContext, RunKind, TraceEvent } from '../index.js';

// TraceEvent as 0.4.0-rc.0 published it. Later releases add types and fields to it.
type Rc0TraceEvent =
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

type Rc0Type = Rc0TraceEvent['type'];

describe('TraceEvent', () => {
  it('includes an event a third party adds to TraceEventByType', () => {
    expectTypeOf<'@acme/cache/miss'>().toExtend<TraceEvent['type']>();
    expectTypeOf<TraceEvent<'@acme/cache/miss'>>().toExtend<AcmeMiss>();
    expectTypeOf<AcmeMiss>().toExtend<TraceEvent>();
  });

  it('keeps every rc.0 event type', () => {
    expectTypeOf<Rc0Type>().toExtend<TraceEvent['type']>();
  });

  it('keeps every rc.0 field with its rc.0 type', () => {
    expectTypeOf<{ [K in Rc0Type]: TraceEvent<K> }>().toExtend<{
      [K in Rc0Type]: Extract<Rc0TraceEvent, { type: K }>;
    }>();
  });

  it('gives every core event with durationMs a startMs', () => {
    // Only the third-party fixture lacks it: an augmentation is not bound to carry startMs.
    expectTypeOf<
      Exclude<
        Extract<TraceEvent, { durationMs: number }>,
        { startMs: number }
      >['type']
    >().toEqualTypeOf<'@acme/cache/miss'>();
  });

  it('gives every timed event a startMs', () => {
    expectTypeOf<TraceEvent<'compile'>['startMs']>().toEqualTypeOf<number>();
    expectTypeOf<TraceEvent<'construct'>['startMs']>().toEqualTypeOf<number>();
    expectTypeOf<TraceEvent<'init'>['startMs']>().toEqualTypeOf<number>();
    expectTypeOf<
      TraceEvent<'scope:create'>['startMs']
    >().toEqualTypeOf<number>();
    expectTypeOf<
      TraceEvent<'scope:extend'>['startMs']
    >().toEqualTypeOf<number>();
    expectTypeOf<
      TraceEvent<'scope:dispose'>['startMs']
    >().toEqualTypeOf<number>();
    expectTypeOf<TraceEvent<'dispose'>['startMs']>().toEqualTypeOf<number>();
  });
});

describe('RunKind', () => {
  it('is exported with the four kinds', () => {
    expectTypeOf<RunKind>().toEqualTypeOf<
      'create' | 'load' | 'createScope' | 'extend'
    >();
    expectTypeOf<TraceEvent<'run'>['kind']>().toEqualTypeOf<RunKind>();
    expectTypeOf<TraceEvent<'compile'>['run']>().toEqualTypeOf<number | null>();
  });
});

describe('construct timing', () => {
  it('declares the split and the place of a build', () => {
    expectTypeOf<TraceEvent<'construct'>['awaitMs']>().toEqualTypeOf<
      number | null
    >();
    expectTypeOf<TraceEvent<'construct'>['level']>().toEqualTypeOf<
      number | null
    >();
    expectTypeOf<
      TraceEvent<'construct:await'>['syncMs']
    >().toEqualTypeOf<number>();
  });

  it('gives construct:await the shape of construct', () => {
    expectTypeOf<Omit<TraceEvent<'construct:await'>, 'type'>>().toEqualTypeOf<
      Omit<TraceEvent<'construct'>, 'type'>
    >();
  });
});

describe('init timing', () => {
  it('gives the init events the shape of construct', () => {
    expectTypeOf<Omit<TraceEvent<'init'>, 'type'>>().toEqualTypeOf<
      Omit<TraceEvent<'construct'>, 'type'>
    >();
    expectTypeOf<Omit<TraceEvent<'init:await'>, 'type'>>().toEqualTypeOf<
      Omit<TraceEvent<'construct'>, 'type'>
    >();
    expectTypeOf<Omit<TraceEvent<'init:failed'>, 'type'>>().toEqualTypeOf<
      Omit<TraceEvent<'construct'>, 'type'>
    >();
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
